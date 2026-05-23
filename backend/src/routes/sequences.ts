import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { emailQueue } from '../queue/emailQueue';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query(
      `SELECT s.*,
         COUNT(ss.id) AS step_count,
         COUNT(se.id) AS enrollment_count,
         COUNT(se.id) FILTER (WHERE se.status='active') AS active_enrollments
       FROM sequences s
       LEFT JOIN sequence_steps ss ON ss.sequence_id = s.id
       LEFT JOIN sequence_enrollments se ON se.sequence_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC`,
      [user.id]
    );
    res.json(rows);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch sequences');
    res.status(500).json({ error: 'Failed to fetch sequences' });
  }
});

router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { name, steps } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Sequence name is required' });
    if (!Array.isArray(steps) || steps.length === 0) return res.status(400).json({ error: 'At least one step is required' });
    if (steps.length > 5) return res.status(400).json({ error: 'Maximum 5 steps per sequence' });

    const seqId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO sequences (id, user_id, name) VALUES ($1,$2,$3)',
        [seqId, user.id, name.trim()]
      );

      for (let i = 0; i < steps.length; i++) {
        const { subject, body, delay_days, condition } = steps[i];
        if (!subject || !body) throw new Error(`Step ${i+1}: subject and body required`);
        await client.query(
          `INSERT INTO sequence_steps (id, sequence_id, step_number, subject, body, delay_days, condition)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), seqId, i+1, subject.trim(), body.trim(),
           parseInt(delay_days)||3,
           ['always','no_open','no_click','opened','clicked'].includes(condition) ? condition : 'no_open']
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({ success: true, id: seqId });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to create sequence');
    return res.status(500).json({ error: err.message || 'Failed to create sequence' });
  }
});

router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const [seqRes, stepsRes] = await Promise.all([
      pool.query('SELECT * FROM sequences WHERE id=$1 AND user_id=$2', [req.params.id, user.id]),
      pool.query('SELECT * FROM sequence_steps WHERE sequence_id=$1 ORDER BY step_number ASC', [req.params.id])
    ]);
    if (seqRes.rows.length === 0) return res.status(404).json({ error: 'Sequence not found' });
    return res.json({ ...seqRes.rows[0], steps: stepsRes.rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sequence' });
  }
});

router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    await pool.query('DELETE FROM sequences WHERE id=$1 AND user_id=$2', [req.params.id, user.id]);
    return res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete sequence' });
  }
});

// ─── Enrollment management ────────────────────────────────────────────────────

// Enroll a single recipient (called automatically after campaign send,
// or manually from dashboard for retargeting)
router.post('/:id/enroll', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user    = req.user as any;
    const seqId   = req.params.id;
    const { recipientEmail, sourceEmailId } = req.body;

    if (!recipientEmail) return res.status(400).json({ error: 'recipientEmail is required' });

    const seqRes = await pool.query('SELECT * FROM sequences WHERE id=$1 AND user_id=$2', [seqId, user.id]);
    if (seqRes.rows.length === 0) return res.status(404).json({ error: 'Sequence not found' });

    const firstStep = await pool.query(
      'SELECT * FROM sequence_steps WHERE sequence_id=$1 AND step_number=1',
      [seqId]
    );
    if (firstStep.rows.length === 0) return res.status(400).json({ error: 'Sequence has no steps' });

    const step = firstStep.rows[0];
    const nextCheckAt = new Date(Date.now() + step.delay_days * 24 * 60 * 60 * 1000);
    const enrollId = uuidv4();

    await pool.query(
      `INSERT INTO sequence_enrollments
         (id, sequence_id, user_id, recipient_email, source_email_id, current_step, next_check_at)
       VALUES ($1,$2,$3,$4,$5,0,$6)
       ON CONFLICT (sequence_id, recipient_email) DO NOTHING`,
      [enrollId, seqId, user.id, recipientEmail.toLowerCase(), sourceEmailId||null, nextCheckAt]
    );

    // Schedule the follow-up check job
    await emailQueue.add(
      'sequence-followup',
      { enrollmentId: enrollId, sequenceId: seqId, userId: user.id },
      { delay: nextCheckAt.getTime() - Date.now(), jobId: `seq:${enrollId}:1` }
    );

    return res.json({ success: true, enrollId, nextCheckAt });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to enroll in sequence');
    return res.status(500).json({ error: 'Failed to enroll' });
  }
});

// List enrollments for a sequence
router.get('/:id/enrollments', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user  = req.user as any;
    const seqId = req.params.id;
    const page  = Math.max(1, parseInt(req.query.page as string)||1);
    const limit = Math.min(100, parseInt(req.query.limit as string)||50);

    const check = await pool.query('SELECT id FROM sequences WHERE id=$1 AND user_id=$2',[seqId,user.id]);
    if (check.rows.length===0) return res.status(404).json({ error: 'Sequence not found' });

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT se.*, e.subject AS source_subject, e.sent_at AS source_sent_at, e.opened_at
         FROM sequence_enrollments se
         LEFT JOIN emails e ON e.id = se.source_email_id
         WHERE se.sequence_id=$1
         ORDER BY se.created_at DESC
         LIMIT $2 OFFSET $3`,
        [seqId, limit, (page-1)*limit]
      ),
      pool.query('SELECT COUNT(*) FROM sequence_enrollments WHERE sequence_id=$1',[seqId])
    ]);

    return res.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page, limit
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

export default router;
