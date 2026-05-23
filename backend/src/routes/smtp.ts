import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { encrypt } from '../utils/crypto';
import { verifySmtpAccount, evictTransporterCache } from '../services/smtpRotation';
import { logger } from '../utils/logger';

const router = Router();

// List user's SMTP accounts (passwords never returned)
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query(
      `SELECT id, name, host, port, secure, auth_user, from_name, from_email,
              daily_limit, sent_today, reset_date, is_active, is_verified, created_at
       FROM smtp_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [user.id]
    );
    res.json(rows);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch SMTP accounts');
    res.status(500).json({ error: 'Failed to fetch SMTP accounts' });
  }
});

// Add a new SMTP account
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { name, host, port, secure, auth_user, auth_pass, from_name, from_email, daily_limit } = req.body;

    if (!name || !host || !auth_user || !auth_pass || !from_email) {
      return res.status(400).json({ error: 'name, host, auth_user, auth_pass, and from_email are required' });
    }

    // Max 10 SMTP accounts per user
    const count = await pool.query('SELECT COUNT(*) FROM smtp_accounts WHERE user_id = $1', [user.id]);
    if (parseInt(count.rows[0].count) >= 10) {
      return res.status(400).json({ error: 'Maximum 10 SMTP accounts allowed' });
    }

    const id       = uuidv4();
    const passEnc  = encrypt(auth_pass);

    await pool.query(
      `INSERT INTO smtp_accounts
         (id, user_id, name, host, port, secure, auth_user, auth_pass_enc, from_name, from_email, daily_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, user.id, name, host, parseInt(port)||587, !!secure, auth_user, passEnc,
       from_name||'', from_email, parseInt(daily_limit)||500]
    );

    logger.info({ userId: user.id, accountId: id }, 'SMTP account added');
    return res.json({ success: true, id });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to add SMTP account');
    return res.status(500).json({ error: 'Failed to add SMTP account' });
  }
});

// Update an SMTP account (patch — only provided fields updated)
router.patch('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id }  = req.params;
    const user    = req.user as any;
    const updates = req.body;

    const check = await pool.query('SELECT id FROM smtp_accounts WHERE id=$1 AND user_id=$2', [id, user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'SMTP account not found' });

    const fields: string[] = [];
    const vals:   any[]    = [];
    let   idx = 1;

    const allowed = ['name','host','port','secure','from_name','from_email','daily_limit','is_active'];
    for (const key of allowed) {
      if (key in updates) { fields.push(`${key}=$${idx++}`); vals.push(updates[key]); }
    }
    if ('auth_pass' in updates && updates.auth_pass) {
      fields.push(`auth_pass_enc=$${idx++}`);
      vals.push(encrypt(updates.auth_pass));
      // Evict cached transporter so new password is picked up
      evictTransporterCache(id);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    fields.push(`updated_at=NOW(), is_verified=false`);
    vals.push(id, user.id);

    await pool.query(
      `UPDATE smtp_accounts SET ${fields.join(',')} WHERE id=$${idx} AND user_id=$${idx+1}`,
      vals
    );

    return res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to update SMTP account');
    return res.status(500).json({ error: 'Failed to update SMTP account' });
  }
});

// Delete an SMTP account
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user   = req.user as any;
    evictTransporterCache(id);
    await pool.query('DELETE FROM smtp_accounts WHERE id=$1 AND user_id=$2', [id, user.id]);
    return res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to delete SMTP account');
    return res.status(500).json({ error: 'Failed to delete SMTP account' });
  }
});

// Verify an SMTP account (test connection)
router.post('/:id/verify', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user   = req.user as any;

    const { rows } = await pool.query(
      'SELECT * FROM smtp_accounts WHERE id=$1 AND user_id=$2',
      [id, user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'SMTP account not found' });

    const result = await verifySmtpAccount(rows[0]);

    if (result.ok) {
      await pool.query('UPDATE smtp_accounts SET is_verified=true, updated_at=NOW() WHERE id=$1', [id]);
      return res.json({ success: true, message: 'SMTP connection verified' });
    } else {
      return res.status(400).json({ error: 'Verification failed', details: result.error });
    }
  } catch (err: any) {
    logger.error({ error: err.message }, 'SMTP verification failed');
    return res.status(500).json({ error: 'Verification error' });
  }
});

export default router;
