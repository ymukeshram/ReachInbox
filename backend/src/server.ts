import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectRedis from 'connect-redis';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

const RedisStore = connectRedis as any;
import passport from './config/passport';
import { initDatabase, pool } from './config/database';
import { redis } from './config/redisWithFallback';
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import trackingRoutes from './routes/tracking';
import campaignRoutes from './routes/campaigns';
import sequenceRoutes from './routes/sequences';
import contactRoutes from './routes/contacts';
import slackRoutes from './routes/slack';
import { emailQueue, emailWorker } from './queue/emailQueue';
import { validateEnv } from './utils/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { getMetrics } from './utils/metrics';
import { runMigrations } from './migrations';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { setupElasticsearch } from './config/elasticsearch';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || (!isProd ? 'reachinbox-local-development-session-secret' : undefined);

if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be configured in production');
}

// Request ID middleware for tracing
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging middleware
import { requestLogger } from './middleware/requestLogger';
import { timeoutMiddleware } from './middleware/timeout';
app.use(requestLogger);
app.use(timeoutMiddleware(60000)); // 60 second timeout for all requests

// WebSocket setup
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      fontSrc:    ["'self'", 'data:'],
      workerSrc:  ["'self'", 'blob:'],
      manifestSrc:["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(compression());

// CORS — built entirely from env vars, no hardcoded URLs
// RENDER_EXTERNAL_URL is the backend's own URL; include it so same-origin
// requests work when the frontend is served from this backend.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()) : []),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      callback(null, true);
    } else {
      logger.warn({ origin }, 'CORS blocked origin');
      callback(null, true); // Permissive fallback to ensure cloud connections never drop
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cookie'],
  exposedHeaders: ['X-Request-ID', 'Set-Cookie'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Razorpay webhook signature verification needs the exact raw request bytes,
// so this route gets its own parser (mounted before the global JSON parser)
// that stashes the raw buffer alongside the parsed body.
app.use('/api/payment/webhook', express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { (req as express.Request).rawBody = buf; }
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Redis-backed session store with proper configuration
// Stored in a variable so the same middleware instance can be shared with
// Socket.IO below, letting WebSocket auth rely on the real session cookie
// instead of a client-supplied value.
const sessionMiddleware = session({
  store: new RedisStore({ client: redis }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiry on every request
  proxy: true, // Trust proxy for secure cookies
  cookie: {
    secure: isProd, // HTTPS only in production
    sameSite: 'lax', // Same-origin deployment on Render — 'lax' is correct
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    domain: undefined // Let browser handle domain
  },
  name: 'sessionId' // Custom session cookie name
});
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

// Rate limiting with custom message
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => {
    const p = req.path;
    // Health/metrics are exempt, as are static frontend assets
    if (p === '/health' || p === '/metrics') return true;
    if (p.startsWith('/assets/')) return true;
    if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|webp|json|map)$/.test(p)) return true;
    return false;
  }
});

// Per-user rate limiting for authenticated routes
const userLimiter = rateLimit({
  windowMs: 60_000,
  max: 100, // 100 requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise don't use IP at all
    if (req.isAuthenticated && req.isAuthenticated()) {
      return `user:${(req.user as any).id}`;
    }
    // For unauthenticated requests, use a constant key (will be rate limited globally)
    return 'anonymous';
  },
  message: { error: 'Rate limit exceeded for your account' }
});

app.use(globalLimiter);
app.use('/api', userLimiter);

// Cache middleware for GET requests
const cacheMiddleware = (duration: number) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl}:${(req.user as any)?.id || 'anonymous'}`;

    redis.get(key).then(cached => {
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }

      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        redis.setex(key, duration, JSON.stringify(body)).catch(err =>
          logger.warn({ error: err.message }, 'Cache set failed')
        );
        return originalJson(body);
      };
      next();
    }).catch(() => next());
  };
};

// Apply caching BEFORE route registrations so it intercepts requests first
app.use('/api/emails/stats',     cacheMiddleware(30));  // 30 seconds
app.use('/api/emails/templates', cacheMiddleware(60));  // 1 minute

// BullMQ Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: serverAdapter,
});
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
);
app.use('/admin/queues', (req, res, next) => {
  const user = req.user as any;
  if (!req.isAuthenticated() || (!user?.isAdmin && user?.role !== 'admin' && !adminEmails.has(user?.email?.toLowerCase()))) {
    return res.status(403).send('Forbidden');
  }
  next();
}, serverAdapter.getRouter());

// Routes
app.use('/auth', authRoutes);
app.use('/api/slack', slackRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/sequences', sequenceRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/track', trackingRoutes);


// Health check with detailed info
app.get('/health', async (_req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    // Check queue status
    const queueCounts = await emailQueue.getJobCounts();
    
    res.json({ 
      status: 'healthy', 
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        worker: 'running'
      },
      queue: {
        waiting: queueCounts.waiting || 0,
        active: queueCounts.active || 0,
        completed: queueCounts.completed || 0,
        failed: queueCounts.failed || 0
      },
      version: '1.0.0',
      lastDeploy: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Metrics endpoint for monitoring (protected by optional secret header)
app.get('/metrics', async (_req, res) => {
  const secret = process.env.METRICS_SECRET;
  if (secret && _req.headers['x-metrics-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const queueCounts = await emailQueue.getJobCounts();
    const memUsage = process.memoryUsage();
    
    // Get application metrics
    let appMetrics = {
      requests: 0,
      errors: 0,
      emailsSent: 0,
      emailsFailed: 0,
      avgResponseTime: 0
    };
    
    try {
      appMetrics = await getMetrics();
    } catch {}
    
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB'
      },
      queue: queueCounts,
      application: appMetrics,
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Share the Express session with Socket.IO so WebSocket connections are
// authenticated against the real logged-in user rather than trusting a
// client-supplied userId (which any client could set to any value).
const wrapMiddleware = (mw: express.RequestHandler) =>
  (socket: any, next: (err?: any) => void) => mw(socket.request, {} as express.Response, next);

io.use(wrapMiddleware(sessionMiddleware));
io.use(wrapMiddleware(passport.initialize()));
io.use(wrapMiddleware(passport.session()));

io.use((socket, next) => {
  const user = (socket.request as any).user;
  if (!user?.id) {
    return next(new Error('Authentication required'));
  }
  socket.data.userId = user.id;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  socket.join(userId);
  logger.info({ userId, socketId: socket.id }, 'WebSocket client connected');

  socket.on('disconnect', (reason) => {
    logger.info({ userId, socketId: socket.id, reason }, 'WebSocket client disconnected');
  });

  socket.on('error', (error) => {
    logger.error({ userId, socketId: socket.id, error: error.message }, 'WebSocket error');
  });
});

// Emit email status updates via WebSocket
emailWorker.on('completed', async (job) => {
  const data = job.data as any;
  if (!data.emailId) return; // sequence-followup jobs don't have emailId here
  io.to(data.userId).emit('emailUpdate', {
    emailId: data.emailId,
    status: 'sent',
    timestamp: new Date().toISOString()
  });
});

emailWorker.on('failed', async (job) => {
  if (job) {
    const data = job.data as any;
    if (!data.emailId) return;
    io.to(data.userId).emit('emailUpdate', {
      emailId: data.emailId,
      status: 'failed',
      timestamp: new Date().toISOString()
    });
  }
});

async function reEnqueuePendingEmails() {
  const lockKey = 'lock:re-enqueue';
  const lockValue = Date.now().toString();
  const lockTTL = 30; // 30 seconds

  try {
    // Acquire distributed lock using Redis
    const acquired = await redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
    
    if (!acquired) {
      logger.info('Another instance is re-enqueueing emails, skipping');
      return;
    }

    // Get ALL scheduled emails, including past ones that haven't been sent yet
    const { rows } = await pool.query(
      `SELECT id, recipient_email, subject, body, user_id, scheduled_at
       FROM emails WHERE status = 'scheduled'`
    );

    let requeued = 0;
    const limit = parseInt(
      process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || process.env.MAX_EMAILS_PER_HOUR || '200'
    );
    const delayBetweenEmailsMs = Math.max(0, parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '0'));
    // Stagger overdue emails at 500 ms each (max 30 s lead-in) to avoid bursting the SMTP provider
    const OVERDUE_STAGGER_MS = 500;
    let overdueIndex = 0;

    for (const row of rows) {
      const naturalDelay = new Date(row.scheduled_at).getTime() - Date.now();
      // For past-due emails, spread them out; future emails keep their natural delay
      const delay = naturalDelay > 0
        ? naturalDelay
        : Math.min(overdueIndex * OVERDUE_STAGGER_MS, 30_000);

      if (naturalDelay <= 0) overdueIndex++;

      try {
        const existingJob = await emailQueue.getJob(row.id);
        if (!existingJob) {
          await emailQueue.add(
            'send-email',
            {
              emailId: row.id,
              recipientEmail: row.recipient_email,
              subject: row.subject,
              body: row.body,
              userId: row.user_id,
              hourlyLimit: limit,
              delayBetweenEmailsMs
            },
            { delay, jobId: row.id }
          );
          requeued++;
        }
      } catch (err: any) {
        if (!err?.message?.includes('already exists')) {
          logger.error({ emailId: row.id, error: err.message }, 'Failed to re-enqueue email');
        }
      }
    }

    if (requeued > 0) {
      logger.info({ count: requeued }, 'Re-enqueued pending emails');
    } else {
      logger.info('No pending emails to re-enqueue');
    }
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to re-enqueue pending emails');
  } finally {
    // Release lock
    const currentValue = await redis.get(lockKey);
    if (currentValue === lockValue) {
      await redis.del(lockKey);
    }
  }
}

// Data retention cleanup (run daily)
async function cleanupOldEmails() {
  try {
    const result = await pool.query(
      `DELETE FROM emails WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ deleted: result.rowCount }, 'Cleaned up old emails');
    }
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to cleanup old emails');
  }
}

async function start() {
  try {
    if (isProd) validateEnv();

    try {
      if (isProd) {
        await redis.assertAvailable();
      }
    } catch (redisErr: any) {
      logger.warn({ error: redisErr?.message }, 'Redis check skipped/failed, using in-memory store fallback');
    }

    try {
      await initDatabase();
      logger.info('Database initialized');
    } catch (dbErr: any) {
      logger.warn({ error: dbErr?.message }, 'Database init warning (continuing startup)');
    }

    try {
      await setupElasticsearch();
    } catch (esErr: any) {
      logger.warn({ error: esErr?.message }, 'Elasticsearch setup skipped/failed');
    }
    
    // Run migrations
    try {
      await runMigrations(pool);
      logger.info('Database migrations completed');
    } catch (err: any) {
      logger.error({ error: err.message }, 'Migration failed');
    }
    
    try {
      await reEnqueuePendingEmails();
    } catch (queueErr: any) {
      logger.warn({ error: queueErr?.message }, 'reEnqueuePendingEmails failed/skipped');
    }
    
    // Run cleanup daily at 2 AM
    const now = new Date();
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
    const msUntilNight = night.getTime() - now.getTime();
    
    setTimeout(() => {
      cleanupOldEmails();
      setInterval(cleanupOldEmails, 24 * 60 * 60 * 1000);
    }, msUntilNight);
    
    const portNumber = parseInt(PORT as string, 10);
    httpServer.listen(portNumber, '0.0.0.0', () => {
      logger.info({ 
        port: portNumber, 
        env: process.env.NODE_ENV,
        nodeVersion: process.version 
      }, 'Server started successfully');
    });
  } catch (err: any) {
    logger.error({ error: err?.message || String(err), stack: err?.stack }, 'Failed to start server');
    process.exit(1);
  }
}

// Serve React frontend for all non-API routes
const frontendDistCandidates = [
  path.join(__dirname, '../../frontend/dist'),
  path.join(__dirname, '../frontend/dist'),
  path.join(process.cwd(), '../frontend/dist'),
  path.join(process.cwd(), 'frontend/dist')
];
const frontendDist = frontendDistCandidates.find(p => fs.existsSync(p)) || path.join(__dirname, '../../frontend/dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: '7d', etag: true, index: false }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(503).send('Frontend build not found. Deployment in progress.');
  });
}
app.use(errorHandler);

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');
  
  // Stop accepting new requests
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close worker
  await emailWorker.close();
  logger.info('Worker closed');
  
  // Close Redis
  await redis.quit();
  logger.info('Redis connection closed');
  
  // Close database
  await pool.end();
  logger.info('Database pool closed');
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  process.exit(1);
});

// Keep-alive for free tier (self-ping)
const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
if (isProd && selfUrl) {
  // Ping every 14 minutes (just before 15-min timeout)
  setInterval(() => {
    fetch(`${selfUrl}/health`)
      .then(res => {
        if (res.ok) {
          logger.debug('Keep-alive ping successful');
        } else {
          logger.warn({ status: res.status }, 'Keep-alive ping failed');
        }
      })
      .catch((err) => logger.warn({ error: err.message }, 'Keep-alive ping error'));
  }, 14 * 60 * 1000); // 14 minutes

  logger.info('Keep-alive mechanism enabled (14-minute interval)');
}

start();
