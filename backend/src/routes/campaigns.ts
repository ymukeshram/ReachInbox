import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { emailQueue } from '../queue/emailQueue';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// List campaigns with aggregated stats
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query(
      `SELECT
         c.id, c.name, c.status, c.created_at, c.updated_at,
         COUNT(e.id)                                      AS total_emails,
         COUNT(*) FILTER (WHERE e.status = 'sent')        AS sent,
         COUNT(*) FILTER (WHERE e.status = 'failed')      AS failed,
         COUNT(*) FILTER (WHERE e.status = 'scheduled')   AS scheduled,
         COUNT(*) FILTER (WHERE e.status = 'cancelled')   AS cancelled,
         SUM(COALESCE(e.open_count,  0))                  AS total_opens,
         SUM(COALESCE(e.click_count, 0))                  AS total_clicks
       FROM campaigns c
       LEFT JOIN emails e ON e.campaign_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [user.id]
    );

    const campaigns = rows.map(r => ({
      ...r,
      success_rate: parseInt(r.sent) > 0
        ? ((parseInt(r.sent) / (parseInt(r.sent) + parseInt(r.failed))) * 100).toFixed(1)
        : '0'
    }));

    res.json(campaigns);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch campaigns');
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Cancel all scheduled emails in a campaign
router.post('/:id/cancel', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id }  = req.params;
    const user    = req.user as any;

    // Verify ownership
    const campRes = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );
    if (campRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });

    // Get scheduled emails for this campaign
    const emailRes = await pool.query(
      `SELECT id FROM emails WHERE campaign_id = $1 AND status = 'scheduled'`,
      [id]
    );

    if (emailRes.rows.length === 0) {
      return res.json({ success: true, cancelled: 0, message: 'No scheduled emails in this campaign' });
    }

    const emailIds = emailRes.rows.map((r: any) => r.id);

    // Remove from queue
    await Promise.allSettled(
      emailIds.map(async (eid: string) => {
        const job = await emailQueue.getJob(eid);
        if (job) await job.remove();
      })
    );

    // Update status
    await pool.query(
      `UPDATE emails SET status='cancelled', updated_at=NOW() WHERE id = ANY($1::uuid[])`,
      [emailIds]
    );

    // Mark campaign as cancelled if no active emails remain
    await pool.query(
      `UPDATE campaigns SET status='cancelled', updated_at=NOW() WHERE id=$1`,
      [id]
    );

    logger.info({ campaignId: id, userId: user.id, count: emailIds.length }, 'Campaign cancelled');
    return res.json({ success: true, cancelled: emailIds.length });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to cancel campaign');
    return res.status(500).json({ error: 'Failed to cancel campaign' });
  }
});

// Get a single campaign with detailed stats
router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user   = req.user as any;

    const [campRes, emailRes] = await Promise.all([
      pool.query(
        `SELECT c.*,
           COUNT(e.id)                                    AS total_emails,
           COUNT(*) FILTER (WHERE e.status = 'sent')      AS sent,
           COUNT(*) FILTER (WHERE e.status = 'failed')    AS failed,
           COUNT(*) FILTER (WHERE e.status = 'scheduled') AS scheduled,
           COUNT(*) FILTER (WHERE e.status = 'cancelled') AS cancelled,
           SUM(COALESCE(e.open_count,  0))                AS total_opens,
           SUM(COALESCE(e.click_count, 0))                AS total_clicks
         FROM campaigns c
         LEFT JOIN emails e ON e.campaign_id = c.id
         WHERE c.id = $1 AND c.user_id = $2
         GROUP BY c.id`,
        [id, user.id]
      ),
      pool.query(
        `SELECT id, recipient_email, status, bounce_type, sent_at, error_message
         FROM emails WHERE campaign_id = $1 ORDER BY created_at ASC LIMIT 200`,
        [id]
      )
    ]);

    if (campRes.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });

    return res.json({
      ...campRes.rows[0],
      emails: emailRes.rows
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch campaign');
    return res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

export default router;
