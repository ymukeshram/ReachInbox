import Redis from 'ioredis';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

// In-memory fallback store
class MemoryStore {
  private store: Map<string, { value: string; expiry?: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired keys every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (data.expiry && data.expiry < now) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const data = this.store.get(key);
    if (!data) return null;
    if (data.expiry && data.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return data.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
    const expiry = duration ? Date.now() + duration * 1000 : undefined;
    
    // NX mode: only set if key doesn't exist
    if (mode === 'NX' && this.store.has(key)) {
      return null;
    }
    
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    const expiry = Date.now() + seconds * 1000;
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys.flat()) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(k => this.get(k)));
  }

  // Minimal ioredis-compatible SCAN: returns all matching keys in one page
  // (fine for the small in-memory store used only when Redis is unreachable).
  async scan(_cursor: string, ...args: any[]): Promise<[string, string[]]> {
    const matchIdx = args.findIndex(a => a === 'MATCH');
    const pattern = matchIdx !== -1 ? args[matchIdx + 1] : '*';
    const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const keys = [...this.store.keys()].filter(k => regex.test(k));
    return ['0', keys];
  }

  async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = (parseInt(current || '0') + 1).toString();
    await this.set(key, newValue);
    return parseInt(newValue);
  }

  async decr(key: string): Promise<number> {
    const current = await this.get(key);
    const newValue = Math.max(0, parseInt(current || '0') - 1).toString();
    await this.set(key, newValue);
    return parseInt(newValue);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const data = this.store.get(key);
    if (!data) return 0;
    data.expiry = Date.now() + seconds * 1000;
    return 1;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<string> {
    clearInterval(this.cleanupInterval);
    this.store.clear();
    return 'OK';
  }

  // Session store compatibility
  async hget(key: string, field: string): Promise<string | null> {
    return this.get(`${key}:${field}`);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    await this.set(`${key}:${field}`, value);
    return 1;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.del(...fields.map(f => `${key}:${f}`));
  }
}

// Redis client with automatic fallback
class RedisWithFallback {
  private redis: Redis | null = null;
  private fallback: MemoryStore = new MemoryStore();
  private useRedis: boolean = true;
  private maxReconnectAttempts: number = 3;

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
        lazyConnect: false,
        retryStrategy: (times) => {
          if (times > this.maxReconnectAttempts) {
            logger.warn('Redis max retries reached, switching to in-memory fallback');
            this.useRedis = false;
            return null;
          }
          return Math.min(times * 50, 2000);
        }
      });

      this.redis.on('error', (err) => {
        if (err.message.includes('max requests limit exceeded') || 
            err.message.includes('ECONNREFUSED')) {
          logger.warn({ error: err.message }, 'Redis error, using in-memory fallback');
          this.useRedis = false;
        } else {
          logger.error({ error: err.message }, 'Redis error');
        }
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected');
        this.useRedis = true;
      });

      this.redis.on('ready', () => {
        logger.info('Redis ready');
      });

    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to initialize Redis, using in-memory fallback');
      this.useRedis = false;
    }
  }

  private async executeWithFallback<T>(
    redisOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>
  ): Promise<T> {
    if (!this.useRedis || !this.redis) {
      return fallbackOperation();
    }

    try {
      return await redisOperation();
    } catch (err: any) {
      if (err.message.includes('max requests limit exceeded') || 
          err.message.includes('Connection is closed')) {
        logger.warn('Redis operation failed, using fallback');
        this.useRedis = false;
        return fallbackOperation();
      }
      throw err;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.executeWithFallback(
      () => this.redis!.get(key),
      () => this.fallback.get(key)
    );
  }

  async set(key: string, value: string, ...args: any[]): Promise<string | null> {
    return this.executeWithFallback(
      () => this.redis!.set(key, value, ...args) as Promise<string | null>,
      () => this.fallback.set(key, value, args[0], args[1])
    );
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    return this.executeWithFallback(
      () => this.redis!.setex(key, seconds, value),
      () => this.fallback.setex(key, seconds, value)
    );
  }

  async del(...keys: string[]): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.del(...keys.flat()),
      () => this.fallback.del(...keys)
    );
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return this.executeWithFallback(
      () => this.redis!.mget(...keys),
      () => this.fallback.mget(keys)
    );
  }

  scan(cursor: string, ...args: any[]): Promise<[string, string[]]> {
    if (this.useRedis && this.redis) {
      return (this.redis as any).scan(cursor, ...args);
    }
    return this.fallback.scan(cursor, ...args);
  }

  async incr(key: string): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.incr(key),
      () => this.fallback.incr(key)
    );
  }

  async decr(key: string): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.decr(key),
      () => this.fallback.decr(key)
    );
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.expire(key, seconds),
      () => this.fallback.expire(key, seconds)
    );
  }

  async ping(): Promise<string> {
    return this.executeWithFallback(
      () => this.redis!.ping(),
      () => this.fallback.ping()
    );
  }

  async quit(): Promise<string> {
    if (this.redis) {
      await this.redis.quit();
    }
    return this.fallback.quit();
  }

  // Session store compatibility
  async hget(key: string, field: string): Promise<string | null> {
    return this.executeWithFallback(
      () => this.redis!.hget(key, field),
      () => this.fallback.hget(key, field)
    );
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.hset(key, field, value),
      () => this.fallback.hset(key, field, value)
    );
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.executeWithFallback(
      () => this.redis!.hdel(key, ...fields),
      () => this.fallback.hdel(key, ...fields)
    );
  }

  isUsingFallback(): boolean {
    return !this.useRedis;
  }

  async assertAvailable(): Promise<void> {
    if (!this.useRedis || !this.redis) {
      throw new Error('Redis connection is unavailable');
    }
    await this.redis.ping();
  }

  // Get the underlying Redis instance for BullMQ
  getRedisInstance(): Redis | null {
    return this.redis;
  }
}

export const redis = new RedisWithFallback();
