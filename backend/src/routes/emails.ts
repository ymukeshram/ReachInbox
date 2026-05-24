import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { pool } from '../config/database';
import { emailQueue } from '../queue/emailQueue';
import { isAuthenticated } from '../middleware/auth';
import { validateScheduleEmail, handleValidationErrors, sanitizeHtml } from '../utils/validation';
import { parseSpreadsheet, personalizeEmail } from '../services/emailPersonalization';
import { calculateSpamScore } from '../utils/spamScore';
import { logger } from '../utils/logger';
import { checkEmailLimit, requirePermission } from '../middleware/rbac';

const MAX_EMAILS_PER_HOUR  = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200');
const MAX_FILE_SIZE         = 10 * 1024 * 1024; // 10 MB (covers CSV + attachment)
const MAX_ATTACHMENT_SIZE   = 5 * 1024 * 1024;  // 5 MB max attachment
const MAX_EMAILS_PER_BATCH  = 1000;
const PAGE_SIZE             = 50;

interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
  fieldname: string;
  encoding: string;
}

const router = Router();
// Support two file fields: 'file' (CSV) and 'attachment' (PDF/doc)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

// In-memory dedup cache (prevents double-submit within 5 s)
const requestCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of requestCache) if (now - t > 5000) requestCache.delete(k);
}, 60_000);

// ─── Schedule emails ────────────────────────────────────────────────────────

// Spam score pre-check (no side effects — just analysis)
router.post('/spam-check', isAuthenticated, (req: Request, res: Response) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });
  return res.json(calculateSpamScore(subject, body));
});

router.post(
  '/schedule',
  isAuthenticated, checkEmailLimit,
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]),
  validateScheduleEmail, handleValidationErrors,
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const requestKey = `${user.id}:${req.body.subject}:${req.body.startTime}`;

    if (requestCache.has(requestKey) && Date.now() - requestCache.get(requestKey)! < 5000) {
      return res.status(429).json({ error: 'Please wait before submitting again' });
    }
    requestCache.set(requestKey, Date.now());

    const client = await pool.connect();
    try {
      const { subject, body, startTime, delayBetweenEmails, hourlyLimit, campaignName } = req.body;

      const files = req.files as { [f: string]: UploadedFile[] } | undefined;
      const csvFile        = files?.['file']?.[0];
      const attachmentFile = files?.['attachment']?.[0];

      if (!csvFile) return res.status(400).json({ error: 'Email list file is required' });
      if (attachmentFile && attachmentFile.size > MAX_ATTACHMENT_SIZE) {
        return res.status(400).json({ error: 'Attachment too large (max 5 MB)' });
      }

      // Parse datetime-local value (YYYY-MM-DDTHH:mm) as IST (UTC+5:30).
      // We use Date.UTC() so the calculation is independent of the server's TZ env var —
      // Date.UTC treats the values as UTC, then we subtract the IST offset to get real UTC.
      // e.g. user picks 18:14 IST → store as 12:44 UTC  (18:14 − 5h30m)
      const [datePart, timePart] = startTime.split('T');
      const [year, month, day]   = datePart.split('-').map(Number);
      const [hour, minute]       = timePart.split(':').map(Number);

      if ([year, month, day, hour, minute].some(n => isNaN(n))) {
        return res.status(400).json({ error: 'Invalid start time format' });
      }

      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
      const startDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MS);

      if (startDate.getTime() < Date.now() - 60_000) {
        return res.status(400).json({ error: 'Start time is too far in the past' });
      }

      const delayMs = Math.max(1000, parseInt(delayBetweenEmails || '5') * 1000);
      const limit   = Math.min(parseInt(hourlyLimit || '200'), MAX_EMAILS_PER_HOUR);

      const { emails, data, skipped, invalidEmails } = parseSpreadsheet(
        csvFile.buffer, csvFile.mimetype, csvFile.originalname
      );

      if (emails.length === 0) {
        return res.status(400).json({
          error: 'No valid emails found in file',
          invalidEmails: invalidEmails.slice(0, 10)
        });
      }
      if (emails.length > MAX_EMAILS_PER_BATCH) {
        return res.status(400).json({
          error: `Maximum ${MAX_EMAILS_PER_BATCH} emails per batch. Uploaded: ${emails.length}`
        });
      }

      // Filter out unsubscribers before touching the queue
      const unsubResult = await pool.query(
        `SELECT email FROM unsubscribes WHERE user_id = $1 AND email = ANY($2)`,
        [user.id, emails]
      );
      const unsubSet = new Set<string>(unsubResult.rows.map((r: any) => r.email));

      // Filter out hard-bounced contacts
      const hardBounceResult = await pool.query(
        `SELECT email FROM contacts WHERE user_id = $1 AND email = ANY($2) AND hard_bounced = true`,
        [user.id, emails]
      );
      const hardBounceSet = new Set<string>(hardBounceResult.rows.map((r: any) => r.email));

      const sanitizedBody    = sanitizeHtml(body.trim());
      const sanitizedSubject = subject.trim();
      const nowTimestamp     = Date.now();

      // Spam score warning (non-blocking)
      const spamResult = calculateSpamScore(sanitizedSubject, sanitizedBody);
      if (spamResult.rating === 'risky') {
        logger.warn({ userId: user.id, score: spamResult.score }, 'High spam score detected');
      }

      // Optional campaign grouping
      let campaignId: string | null = null;
      if (campaignName?.trim()) {
        const cRes = await pool.query(
          `INSERT INTO campaigns (id, user_id, name, total_emails, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (user_id, name)
           DO UPDATE SET total_emails = campaigns.total_emails + $4, updated_at = NOW()
           RETURNING id`,
          [uuidv4(), user.id, campaignName.trim(), emails.length]
        );
        campaignId = cRes.rows[0].id;
      }

      const values:       any[]   = [];
      const placeholders: string[] = [];
      const jobsToQueue:  Array<{ id: string; data: any; delay: number }> = [];
      let filteredOut = 0;

      emails.forEach((email, i) => {
        if (unsubSet.has(email) || hardBounceSet.has(email)) { filteredOut++; return; }

        const emailId     = uuidv4();
        const scheduledAt = new Date(startDate.getTime() + i * delayMs);
        const delay       = Math.max(0, scheduledAt.getTime() - nowTimestamp);
        const emailData   = data[i] || { email };
        const persBody    = personalizeEmail(sanitizedBody, emailData);
        const persSubject = personalizeEmail(sanitizedSubject, emailData);

        const b = values.length;
        placeholders.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`);
        values.push(emailId, user.id, email, persSubject, persBody, scheduledAt, 'scheduled', campaignId);

        jobsToQueue.push({
          id: emailId,
          data: { emailId, recipientEmail: email, subject: persSubject, body: persBody, userId: user.id, hourlyLimit: limit },
          delay
        });
      });

      if (jobsToQueue.length === 0) {
        return res.status(400).json({
          error: 'No emails to schedule after filtering unsubscribers/bounces',
          filtered: filteredOut,
          skipped
        });
      }

      // Store attachment once per campaign (not once per email)
      let attachmentId: string | null = null;
      if (attachmentFile && campaignId) {
        attachmentId = uuidv4();
        await pool.query(
          `INSERT INTO email_attachments (id, user_id, campaign_id, filename, mimetype, size_bytes, content)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [attachmentId, user.id, campaignId,
           attachmentFile.originalname, attachmentFile.mimetype,
           attachmentFile.size, attachmentFile.buffer]
        );
      } else if (attachmentFile) {
        // Attachment without campaign — store it, link after emails insert
        attachmentId = uuidv4();
        await pool.query(
          `INSERT INTO email_attachments (id, user_id, campaign_id, filename, mimetype, size_bytes, content)
           VALUES ($1,$2,NULL,$3,$4,$5,$6)`,
          [attachmentId, user.id, attachmentFile.originalname,
           attachmentFile.mimetype, attachmentFile.size, attachmentFile.buffer]
        );
      }

      // Inject attachmentId + sequenceId into each job
      const { sequenceId } = req.body;
      for (const j of jobsToQueue) {
        if (attachmentId) j.data.attachmentId = attachmentId;
        if (sequenceId)   j.data.sequenceId   = sequenceId;
      }

      await client.query('BEGIN');
      try {
        const N = placeholders.length;
        const placeholdersWithAttach = placeholders.map((p, i) => {
          const lastBaseIdx = i * 8 + 8;       // $8, $16, $24 ...
          const attachIdx   = N * 8 + i + 1;   // appended after all base params
          return p.replace(`$${lastBaseIdx})`, `$${lastBaseIdx},$${attachIdx})`);
        });

        await client.query('SAVEPOINT before_email_insert');
        try {
          await client.query(
            `INSERT INTO emails (id, user_id, recipient_email, subject, body, scheduled_at, status, campaign_id, attachment_id)
             VALUES ${placeholdersWithAttach.join(',')}`,
            values.concat(jobsToQueue.map(() => attachmentId))
          );
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT before_email_insert');
          await client.query(
            `INSERT INTO emails (id, user_id, recipient_email, subject, body, scheduled_at, status, campaign_id)
             VALUES ${placeholders.join(',')}`,
            values
          );
        }

        await Promise.all(
          jobsToQueue.map(j => emailQueue.add('send-email', j.data, { delay: j.delay, jobId: j.id }))
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      logger.info({ userId: user.id, count: jobsToQueue.length }, 'Emails scheduled');
      return res.json({
        success: true,
        count: jobsToQueue.length,
        skipped,
        filtered: filteredOut,
        invalidEmails: invalidEmails.slice(0, 20),
        campaignId,
        attachmentId,
        spamScore: spamResult
      });
    } catch (err: any) {
      logger.error({ error: err.message }, 'Schedule error');
      return res.status(500).json({ error: 'Failed to schedule emails' });
    } finally {
      client.release();
    }
  }
);

// ─── List scheduled emails (paginated) ──────────────────────────────────────

router.get('/scheduled', isAuthenticated, async (req, res) => {
  try {
    const user   = req.user as any;
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || PAGE_SIZE);
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, recipient_email, subject, body, scheduled_at, status, campaign_id
         FROM emails WHERE user_id = $1 AND status = 'scheduled'
         ORDER BY scheduled_at ASC LIMIT $2 OFFSET $3`,
        [user.id, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM emails WHERE user_id = $1 AND status = 'scheduled'`,
        [user.id]
      )
    ]);

    res.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
      hasMore: offset + limit < parseInt(countRes.rows[0].count)
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch scheduled emails');
    res.status(500).json({ error: 'Failed to fetch scheduled emails' });
  }
});

// ─── List sent/failed emails (paginated) ────────────────────────────────────

router.get('/sent', isAuthenticated, async (req, res) => {
  try {
    const user   = req.user as any;
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit as string) || PAGE_SIZE);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();

    const searchClause = search ? `AND (recipient_email ILIKE $4 OR subject ILIKE $4)` : '';
    const params: any[] = [user.id, limit, offset];
    if (search) params.push(`%${search}%`);

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, recipient_email, subject, body, sent_at, status, error_message, bounce_type, campaign_id
         FROM emails WHERE user_id = $1 AND status IN ('sent','failed','cancelled')
         ${searchClause}
         ORDER BY COALESCE(sent_at, created_at) DESC LIMIT $2 OFFSET $3`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM emails WHERE user_id = $1 AND status IN ('sent','failed','cancelled')
         ${searchClause}`,
        search ? [user.id, `%${search}%`] : [user.id]
      )
    ]);

    res.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
      hasMore: offset + limit < parseInt(countRes.rows[0].count)
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch sent emails');
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

// ─── Cancel single email ─────────────────────────────────────────────────────

router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user   = req.user as any;

    const result = await pool.query(
      'SELECT status FROM emails WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );
    if (result.rows.length === 0)        return res.status(404).json({ error: 'Email not found' });
    if (result.rows[0].status !== 'scheduled') return res.status(400).json({ error: 'Can only cancel scheduled emails' });

    const job = await emailQueue.getJob(id);
    if (job) await job.remove();

    await pool.query(`UPDATE emails SET status='cancelled', updated_at=NOW() WHERE id=$1`, [id]);
    logger.info({ emailId: id, userId: user.id }, 'Email cancelled');
    return res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to cancel email');
    return res.status(500).json({ error: 'Failed to cancel email' });
  }
});

// ─── Bulk cancel ─────────────────────────────────────────────────────────────

router.post('/bulk-cancel', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { emailIds } = req.body;
    const user = req.user as any;

    if (!Array.isArray(emailIds) || emailIds.length === 0)
      return res.status(400).json({ error: 'emailIds must be a non-empty array' });
    if (emailIds.length > 100)
      return res.status(400).json({ error: 'Maximum 100 emails per bulk-cancel' });

    const result = await pool.query(
      `SELECT id, status FROM emails WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [emailIds, user.id]
    );

    const validIds = result.rows.filter(r => r.status === 'scheduled').map(r => r.id);
    if (validIds.length === 0) {
      const statuses = result.rows.map(r => r.status).join(', ');
      return res.status(400).json({
        error: 'No scheduled emails to cancel',
        details: result.rows.length ? `Current statuses: ${statuses}` : 'Emails not found'
      });
    }

    await Promise.allSettled(
      validIds.map(async id => {
        const job = await emailQueue.getJob(id);
        if (job) await job.remove();
      })
    );

    await pool.query(
      `UPDATE emails SET status='cancelled', updated_at=NOW() WHERE id = ANY($1::uuid[])`,
      [validIds]
    );

    logger.info({ userId: user.id, count: validIds.length }, 'Bulk cancelled');
    return res.json({ success: true, cancelled: validIds.length });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Bulk cancel failed');
    return res.status(500).json({ error: 'Failed to cancel emails' });
  }
});

// ─── Retry failed emails (Professional+) ────────────────────────────────────

router.post('/retry-failed', isAuthenticated, requirePermission('canBulkSend'), async (req: Request, res: Response) => {
  try {
    const { emailIds } = req.body;
    const user = req.user as any;

    if (!Array.isArray(emailIds) || emailIds.length === 0)
      return res.status(400).json({ error: 'emailIds array is required' });

    const result = await pool.query(
      `SELECT id, recipient_email, subject, body, user_id, bounce_type
       FROM emails WHERE id = ANY($1) AND user_id = $2 AND status = 'failed'`,
      [emailIds, user.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'No failed emails found' });

    // Skip hard bounces — retrying them is pointless and wastes quota
    const retryable = result.rows.filter(r => r.bounce_type !== 'hard');
    if (retryable.length === 0) {
      return res.status(400).json({ error: 'All selected emails are hard bounces and cannot be retried' });
    }

    const limit = parseInt(process.env.MAX_EMAILS_PER_HOUR || '200');

    await Promise.all(
      retryable.map(async row => {
        // Remove any stale job entry, then re-add with the original emailId as the stable job ID
        const existing = await emailQueue.getJob(row.id);
        if (existing) await existing.remove();

        return emailQueue.add(
          'send-email',
          { emailId: row.id, recipientEmail: row.recipient_email, subject: row.subject, body: row.body, userId: row.user_id, hourlyLimit: limit },
          { delay: 0, jobId: row.id }
        );
      })
    );

    await pool.query(
      `UPDATE emails SET status='scheduled', error_message=NULL, bounce_type=NULL, updated_at=NOW()
       WHERE id = ANY($1)`,
      [retryable.map(r => r.id)]
    );

    logger.info({ userId: user.id, count: retryable.length }, 'Retrying failed emails');
    return res.json({ success: true, retried: retryable.length });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Retry failed');
    return res.status(500).json({ error: 'Failed to retry emails' });
  }
});

// ─── Email stats ─────────────────────────────────────────────────────────────

router.get('/stats', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
         COUNT(*) FILTER (WHERE status = 'sent')      as sent,
         COUNT(*) FILTER (WHERE status = 'failed')    as failed,
         COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
         COUNT(*)                                      as total,
         SUM(COALESCE(open_count,  0))                as total_opens,
         SUM(COALESCE(click_count, 0))                as total_clicks,
         MIN(created_at)                              as first_email,
         MAX(sent_at)                                 as last_sent
       FROM emails WHERE user_id = $1`,
      [user.id]
    );

    const s = result.rows[0];
    const successRate = parseInt(s.sent) > 0
      ? ((parseInt(s.sent) / (parseInt(s.sent) + parseInt(s.failed))) * 100).toFixed(2)
      : '0';

    return res.json({ ...s, successRate: parseFloat(successRate) });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch stats');
    return res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ─── Export emails as CSV ─────────────────────────────────────────────────────

router.get('/export', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user   = req.user as any;
    const status = (req.query.status as string) || 'sent';
    const from   = req.query.from as string;
    const to     = req.query.to   as string;

    const allowed = ['sent', 'failed', 'scheduled', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status filter' });

    // Validate date params — reject anything that isn't a valid ISO date string
    if (from && isNaN(Date.parse(from))) return res.status(400).json({ error: 'Invalid from date' });
    if (to   && isNaN(Date.parse(to)))   return res.status(400).json({ error: 'Invalid to date' });

    let query = `SELECT recipient_email, subject, status, bounce_type, sent_at, created_at, error_message
                 FROM emails WHERE user_id = $1 AND status = $2`;
    const params: any[] = [user.id, status];

    if (from) { params.push(from); query += ` AND created_at >= $${params.length}`; }
    if (to)   { params.push(to);   query += ` AND created_at <= $${params.length}`; }

    query += ' ORDER BY created_at DESC LIMIT 10000';
    const { rows } = await pool.query(query, params);

    const header = 'recipient_email,subject,status,bounce_type,sent_at,created_at,error_message\n';
    const csvRows = rows.map(r =>
      [r.recipient_email, `"${(r.subject || '').replace(/"/g, '""')}"`, r.status, r.bounce_type || '',
       r.sent_at || '', r.created_at || '', `"${(r.error_message || '').replace(/"/g, '""')}"`].join(',')
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reachify-${status}-${Date.now()}.csv"`);
    res.send(header + csvRows.join('\n'));
  } catch (err: any) {
    logger.error({ error: err.message }, 'Export failed');
    return res.status(500).json({ error: 'Export failed' });
  }
});

// ─── Email templates ──────────────────────────────────────────────────────────

router.get('/templates', isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query(
      'SELECT id, name, subject, body, created_at FROM email_templates WHERE user_id = $1 ORDER BY created_at DESC',
      [user.id]
    );
    res.json(rows);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch templates');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { name, subject, body } = req.body;
    const user = req.user as any;

    if (!name?.trim() || !subject?.trim() || !body?.trim())
      return res.status(400).json({ error: 'Name, subject, and body are required' });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO email_templates (id, user_id, name, subject, body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, name) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body`,
      [id, user.id, name.trim(), subject.trim(), body.trim()]
    );

    return res.json({ success: true, id });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to save template');
    return res.status(500).json({ error: 'Failed to save template' });
  }
});

router.delete('/templates/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user as any;
    await pool.query('DELETE FROM email_templates WHERE id = $1 AND user_id = $2', [id, user.id]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to delete template');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ─── User permissions / quota ─────────────────────────────────────────────────

router.get('/permissions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { getUserRole, ROLE_PERMISSIONS } = await import('../middleware/rbac');
    const userRole    = await getUserRole(user.id, pool);
    const permissions = ROLE_PERMISSIONS[userRole];

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [monthlyResult, hourlyResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count FROM emails WHERE user_id=$1 AND created_at>=$2 AND status IN ('sent','scheduled')`,
        [user.id, monthStart]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM emails WHERE user_id=$1 AND created_at>=$2 AND status IN ('sent','scheduled')`,
        [user.id, hourAgo]
      )
    ]);

    const monthly = parseInt(monthlyResult.rows[0].count);
    const hourly  = parseInt(hourlyResult.rows[0].count);

    return res.json({
      role: userRole,
      permissions,
      usage: {
        monthly: {
          used: monthly,
          limit: permissions.maxEmailsPerMonth,
          remaining: permissions.maxEmailsPerMonth === -1 ? -1 : Math.max(0, permissions.maxEmailsPerMonth - monthly)
        },
        hourly: {
          used: hourly,
          limit: permissions.maxEmailsPerHour,
          remaining: permissions.maxEmailsPerHour === -1 ? -1 : Math.max(0, permissions.maxEmailsPerHour - hourly)
        }
      }
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch permissions');
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

export default router;
