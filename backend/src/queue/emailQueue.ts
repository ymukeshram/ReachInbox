import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../config/redisWithFallback';
import { sendEmail, classifyBounce, EmailAttachment } from '../services/emailService';
import { sendWebhook, sendRateLimitAlert } from '../services/webhookService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { esClient } from '../config/elasticsearch';
import { getUserRole, ROLE_PERMISSIONS } from '../middleware/rbac';
import dotenv from 'dotenv';

dotenv.config();

const WORKER_CONCURRENCY  = parseInt(process.env.WORKER_CONCURRENCY  || '10');
const MAX_EMAILS_PER_HOUR = parseInt(
  process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || process.env.MAX_EMAILS_PER_HOUR || '200'
);
const MIN_DELAY_BETWEEN_EMAILS_MS = Math.max(
  0,
  parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '0')
);
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3001';

export interface EmailJobData {
  emailId:       string;
  recipientEmail: string;
  subject:       string;
  body:          string;
  userId:        string;
  hourlyLimit:   number;
  delayBetweenEmailsMs?: number;
  attachmentId?: string; // optional attachment stored in DB
  sequenceId?:   string; // if part of a sequence
}

export interface SequenceFollowupJobData {
  enrollmentId: string;
  sequenceId:   string;
  userId:       string;
}

export const emailQueue = new Queue('email-queue', {
  connection: redis.getRedisInstance() ?? (redis as any),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail:     { count: 5000 }
  }
});

// ─── Rate limiting (atomic) ───────────────────────────────────────────────────

async function checkAndIncrementRateLimit(userId: string, limit: number): Promise<boolean> {
  const realRedis = redis.getRedisInstance();
  if (realRedis) {
    const key = `rate:sliding:${userId}`;
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;

    const result = await realRedis.eval(
      `local key = KEYS[1]
       local now = tonumber(ARGV[1])
       local cutoff = tonumber(ARGV[2])
       local limit = tonumber(ARGV[3])
       redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
       if redis.call('ZCARD', key) >= limit then return 0 end
       redis.call('ZADD', key, now, ARGV[4])
       redis.call('EXPIRE', key, 3600)
       return 1`,
      1,
      key,
      now,
      oneHourAgo,
      limit,
      `${now}-${uuidv4()}`
    );
    return result === 1;
  } else {
    const hourKey = new Date().toISOString().slice(0, 13);
    const key     = `rate:${hourKey}:${userId}`;
    const ttl     = 3600 - (Math.floor(Date.now() / 1000) % 3600);

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttl);
    if (count > limit) {
      await redis.decr(key);
      return false;
    }
    return true;
  }
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

async function isUnsubscribed(email: string, userId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM unsubscribes WHERE email=$1 AND user_id=$2 LIMIT 1',
      [email, userId]
    );
    return rows.length > 0;
  } catch { return false; }
}

async function isHardBounced(email: string, userId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      'SELECT hard_bounced FROM contacts WHERE email=$1 AND user_id=$2 LIMIT 1',
      [email, userId]
    );
    return rows[0]?.hard_bounced === true;
  } catch { return false; }
}

async function recordHardBounce(email: string, userId: string, reason: string): Promise<void> {
  await pool.query(
    `INSERT INTO contacts (id, user_id, email, hard_bounced, bounce_reason, updated_at)
     VALUES (gen_random_uuid(),$1,$2,true,$3,NOW())
     ON CONFLICT (user_id, email) DO UPDATE
       SET hard_bounced=true, bounce_reason=$3, updated_at=NOW()`,
    [userId, email, reason]
  ).catch(() => {});
}

// Load attachment from DB (single fetch per job — attachment shared across campaign)
async function loadAttachment(attachmentId: string): Promise<EmailAttachment | undefined> {
  try {
    const { rows } = await pool.query(
      'SELECT filename, mimetype, content FROM email_attachments WHERE id=$1',
      [attachmentId]
    );
    if (!rows[0]) return undefined;
    return {
      filename:    rows[0].filename,
      contentType: rows[0].mimetype,
      content:     Buffer.isBuffer(rows[0].content)
        ? rows[0].content
        : Buffer.from(rows[0].content)
    };
  } catch { return undefined; }
}

// ─── Sequence follow-up processor ────────────────────────────────────────────

async function processSequenceFollowup(job: Job<SequenceFollowupJobData>): Promise<any> {
  const { enrollmentId, sequenceId, userId } = job.data;

  const enrollment = await pool.query(
    'SELECT * FROM sequence_enrollments WHERE id=$1 AND status=$2',
    [enrollmentId, 'active']
  );
  if (enrollment.rows.length === 0) return { skipped: true, reason: 'not_active' };

  const enroll  = enrollment.rows[0];
  const nextStep = enroll.current_step + 1;

  const stepRes = await pool.query(
    'SELECT * FROM sequence_steps WHERE sequence_id=$1 AND step_number=$2',
    [sequenceId, nextStep]
  );
  if (stepRes.rows.length === 0) {
    // No more steps — mark completed
    await pool.query(
      'UPDATE sequence_enrollments SET status=$1, updated_at=NOW() WHERE id=$2',
      ['completed', enrollmentId]
    );
    return { completed: true };
  }

  const step = stepRes.rows[0];

  // Check the step condition against the source email
  if (enroll.source_email_id && step.condition !== 'always') {
    const srcEmail = await pool.query(
      'SELECT opened_at, clicked_at FROM emails WHERE id=$1',
      [enroll.source_email_id]
    );
    if (srcEmail.rows.length > 0) {
      const { opened_at, clicked_at } = srcEmail.rows[0];
      if (step.condition === 'no_open'  && opened_at)  return { skipped: true, reason: 'already_opened' };
      if (step.condition === 'no_click' && clicked_at) return { skipped: true, reason: 'already_clicked' };
      if (step.condition === 'opened'   && !opened_at) return { skipped: true, reason: 'not_opened' };
      if (step.condition === 'clicked'  && !clicked_at)return { skipped: true, reason: 'not_clicked' };
    }
  }

  // Check unsubscribed
  if (await isUnsubscribed(enroll.recipient_email, userId)) {
    await pool.query('UPDATE sequence_enrollments SET status=$1, updated_at=NOW() WHERE id=$2',['unsubscribed',enrollmentId]);
    return { skipped: true, reason: 'unsubscribed' };
  }

  // Sequence follow-ups are their own send path and must respect the same plan
  // quota as manual sends — otherwise a sequence is an unmetered way to send email.
  const role        = await getUserRole(userId, pool);
  const permissions = ROLE_PERMISSIONS[role];

  if (permissions.maxEmailsPerMonth !== -1) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM emails WHERE user_id=$1 AND created_at >= $2 AND status IN ('sent','scheduled')`,
      [userId, monthStart]
    );
    if (parseInt(rows[0].count) >= permissions.maxEmailsPerMonth) {
      const retryAt = new Date(Date.now() + 60 * 60 * 1000);
      await pool.query(
        'UPDATE sequence_enrollments SET next_check_at=$1, updated_at=NOW() WHERE id=$2',
        [retryAt, enrollmentId]
      );
      await emailQueue.add('sequence-followup',
        { enrollmentId, sequenceId, userId },
        { delay: retryAt.getTime() - Date.now(), jobId: `seq:${enrollmentId}:${nextStep}:retry-${Date.now()}` }
      );
      return { rescheduled: true, reason: 'monthly_limit_reached' };
    }
  }

  const hourlyLimit = permissions.maxEmailsPerHour === -1 ? MAX_EMAILS_PER_HOUR : permissions.maxEmailsPerHour;

  // Send the follow-up email
  const followUpEmailId = uuidv4();
  const scheduledAt     = new Date();

  await pool.query(
    `INSERT INTO emails (id, user_id, recipient_email, subject, body, scheduled_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,'scheduled')`,
    [followUpEmailId, userId, enroll.recipient_email, step.subject, step.body, scheduledAt]
  );

  await emailQueue.add('send-email', {
    emailId: followUpEmailId, recipientEmail: enroll.recipient_email,
    subject: step.subject, body: step.body, userId, hourlyLimit,
    sequenceId
  }, { delay: 0, jobId: followUpEmailId });

  // Update enrollment for next step
  const nextNextStep = await pool.query(
    'SELECT delay_days FROM sequence_steps WHERE sequence_id=$1 AND step_number=$2',
    [sequenceId, nextStep+1]
  );

  if (nextNextStep.rows.length > 0) {
    const nextCheckAt = new Date(Date.now() + nextNextStep.rows[0].delay_days * 86400000);
    await pool.query(
      `UPDATE sequence_enrollments
       SET current_step=$1, source_email_id=$2, next_check_at=$3, updated_at=NOW()
       WHERE id=$4`,
      [nextStep, followUpEmailId, nextCheckAt, enrollmentId]
    );
    await emailQueue.add('sequence-followup',
      { enrollmentId, sequenceId, userId },
      { delay: nextCheckAt.getTime()-Date.now(), jobId: `seq:${enrollmentId}:${nextStep+1}` }
    );
  } else {
    await pool.query(
      'UPDATE sequence_enrollments SET current_step=$1, status=$2, updated_at=NOW() WHERE id=$3',
      [nextStep, 'completed', enrollmentId]
    );
  }

  return { sent: true, step: nextStep };
}

// ─── Email worker ─────────────────────────────────────────────────────────────

export const emailWorker = new Worker<EmailJobData | SequenceFollowupJobData>(
  'email-queue',
  async (job: Job) => {
    // Route to sequence follow-up handler
    if (job.name === 'sequence-followup') {
      return processSequenceFollowup(job as Job<SequenceFollowupJobData>);
    }

    // Standard email send
    const { emailId, recipientEmail, subject, body, userId, hourlyLimit, delayBetweenEmailsMs, attachmentId, sequenceId } =
      job.data as EmailJobData;
    const limit = hourlyLimit || MAX_EMAILS_PER_HOUR;

    logger.info({ emailId, recipientEmail, userId, attempt: job.attemptsMade+1 }, 'Processing email job');

    // Guard: skip if already sent (can happen on restart race between rescheduled jobs)
    const statusCheck = await pool.query('SELECT status FROM emails WHERE id=$1', [emailId]);
    if (!statusCheck.rows[0] || statusCheck.rows[0].status !== 'scheduled') {
      logger.info({ emailId, status: statusCheck.rows[0]?.status }, 'Email job skipped — already processed');
      return { skipped: true, reason: 'already_processed' };
    }

    if (await isUnsubscribed(recipientEmail, userId)) {
      await pool.query(
        `UPDATE emails SET status='cancelled', error_message='Recipient unsubscribed', updated_at=NOW() WHERE id=$1`,
        [emailId]
      );
      return { skipped: true, reason: 'unsubscribed' };
    }

    if (await isHardBounced(recipientEmail, userId)) {
      await pool.query(
        `UPDATE emails SET status='failed', error_message='Hard bounce — permanent failure', bounce_type='hard', updated_at=NOW() WHERE id=$1`,
        [emailId]
      );
      return { skipped: true, reason: 'hard_bounce' };
    }

    if (!(await checkAndIncrementRateLimit(userId, limit))) {
      const nextHour = new Date();
      nextHour.setHours(nextHour.getHours()+1, 0, 0, 0);
      await emailQueue.add('send-email', job.data, { delay: nextHour.getTime()-Date.now(), jobId: `${emailId}-ratelimit-${Date.now()}` });
      sendRateLimitAlert(userId, emailId, limit).catch(() => {});
      return { rescheduled: true };
    }

    const attachment = attachmentId ? await loadAttachment(attachmentId) : undefined;

    try {
      await sendEmail(recipientEmail, subject, body, {
        emailId,
        backendUrl: BACKEND_URL,
        attachment
      });

      await pool.query(
        `UPDATE emails SET status='sent', sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [emailId]
      );
      
      try {
        await esClient.index({
          index: 'email_logs',
          id: emailId,
          body: {
            emailId, userId, recipientEmail, subject, body,
            status: 'sent', timestamp: new Date().toISOString()
          }
        });
      } catch (e) {}

      sendWebhook({
        event: 'email.sent',
        emailId,
        recipientEmail,
        status: 'sent',
        timestamp: new Date().toISOString(),
        userId
      }).catch(() => {});

      // Enroll in sequence follow-up if this is a campaign email
      if (sequenceId) {
        const firstStep = await pool.query(
          'SELECT delay_days FROM sequence_steps WHERE sequence_id=$1 AND step_number=1',
          [sequenceId]
        );
        if (firstStep.rows.length > 0) {
          const enrollId    = uuidv4();
          const nextCheckAt = new Date(Date.now() + firstStep.rows[0].delay_days * 86400000);
          await pool.query(
            `INSERT INTO sequence_enrollments
               (id, sequence_id, user_id, recipient_email, source_email_id, next_check_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (sequence_id, recipient_email) DO NOTHING`,
            [enrollId, sequenceId, userId, recipientEmail, emailId, nextCheckAt]
          ).catch(() => {});
          await emailQueue.add('sequence-followup',
            { enrollmentId: enrollId, sequenceId, userId },
            { delay: nextCheckAt.getTime()-Date.now(), jobId: `seq:${enrollId}:1` }
          ).catch(() => {});
        }
      }

      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown error';
      const bounceType   = classifyBounce(errorMessage);

      await pool.query(
        `UPDATE emails SET status='failed', error_message=$1, bounce_type=$2, updated_at=NOW() WHERE id=$3`,
        [errorMessage, bounceType, emailId]
      );

      if (bounceType === 'hard') {
        await recordHardBounce(recipientEmail, userId, errorMessage);
        sendWebhook({
          event: 'email.failed', emailId, recipientEmail, status: 'failed',
          timestamp: new Date().toISOString(), userId, error: errorMessage
        }).catch(() => {});
        return { failed: true, bounceType: 'hard' }; // no retry
      }

      esClient.index({
        index: 'email_logs',
        id: emailId,
        body: {
          emailId, userId, recipientEmail, subject, body,
          status: 'failed', errorMessage, timestamp: new Date().toISOString()
        }
      }).catch(() => {});

      logger.error({ emailId, recipientEmail, error: errorMessage, attempt: job.attemptsMade+1 }, 'Email failed');

      const maxAttempts = job.opts.attempts ?? 3;
      if (job.attemptsMade + 1 >= maxAttempts) {
        sendWebhook({
          event: 'email.failed', emailId, recipientEmail, status: 'failed',
          timestamp: new Date().toISOString(), userId, error: errorMessage
        }).catch(() => {});
      }

      throw new Error(errorMessage);
    }
  },
  {
    connection: redis.getRedisInstance() ?? (redis as any),
    concurrency: WORKER_CONCURRENCY,
    limiter: { max: 10, duration: 1000 },
    stalledInterval: 30_000,
    maxStalledCount: 2
  }
);

emailWorker.removeAllListeners();
emailWorker.on('completed', job => logger.info({ jobId: job.id, emailId: (job.data as any).emailId }, 'Job completed'));
emailWorker.on('failed',    (job, err) => logger.error({ jobId: job?.id, error: err.message }, 'Job failed'));
emailWorker.on('stalled',   id => logger.warn({ jobId: id }, 'Job stalled'));
emailWorker.on('ready',     () => logger.info('Email worker ready'));
emailWorker.on('error',     err => logger.error({ error: err.message }, 'Worker error'));
