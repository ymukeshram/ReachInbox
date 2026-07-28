import { redis } from '../config/redisWithFallback';

interface Metrics {
  requests: number;
  errors: number;
  emailsSent: number;
  emailsFailed: number;
  avgResponseTime: number;
}

const METRICS_KEY = 'metrics:current';
const METRICS_HISTORY_KEY = 'metrics:history';

export async function incrementMetric(metric: keyof Metrics, value: number = 1): Promise<void> {
  try {
    const client = redis.getRedisInstance();
    if (!client) return;
    await client.hincrby(METRICS_KEY, metric, value);
  } catch (err) {
    // Fail silently - metrics shouldn't break the app
  }
}

export async function getMetrics(): Promise<Metrics> {
  try {
    const client = redis.getRedisInstance();
    const data = client ? await client.hgetall(METRICS_KEY) : {};
    return {
      requests: parseInt(data.requests || '0'),
      errors: parseInt(data.errors || '0'),
      emailsSent: parseInt(data.emailsSent || '0'),
      emailsFailed: parseInt(data.emailsFailed || '0'),
      avgResponseTime: parseFloat(data.avgResponseTime || '0')
    };
  } catch (err) {
    return {
      requests: 0,
      errors: 0,
      emailsSent: 0,
      emailsFailed: 0,
      avgResponseTime: 0
    };
  }
}

export async function resetMetrics(): Promise<void> {
  try {
    const client = redis.getRedisInstance();
    if (!client) return;

    // Save to history before reset
    const current = await getMetrics();
    const timestamp = Date.now();
    await client.zadd(METRICS_HISTORY_KEY, timestamp, JSON.stringify({ ...current, timestamp }));

    // Keep only last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    await client.zremrangebyscore(METRICS_HISTORY_KEY, 0, sevenDaysAgo);

    // Reset current
    await client.del(METRICS_KEY);
  } catch (err) {
    // Fail silently
  }
}

// Reset metrics every hour
setInterval(resetMetrics, 60 * 60 * 1000);
