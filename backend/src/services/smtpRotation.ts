import nodemailer, { Transporter } from 'nodemailer';
import { Pool } from 'pg';
import { decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface SmtpAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth_user: string;
  auth_pass_enc: string;
  from_name: string;
  from_email: string;
  daily_limit: number;
  sent_today: number;
  reset_date: string | Date | null;
}

// Cache transporters to reuse SMTP connections (avoid reconnecting per-email)
const transporterCache = new Map<string, Transporter>();

function buildTransporter(account: SmtpAccount): Transporter {
  const cached = transporterCache.get(account.id);
  if (cached) return cached;

  const pass = decrypt(account.auth_pass_enc);
  const t = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.auth_user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  transporterCache.set(account.id, t);
  return t;
}

// Clear cached transporter when account is deleted/updated
export function evictTransporterCache(accountId: string): void {
  const t = transporterCache.get(accountId);
  if (t) { t.close(); transporterCache.delete(accountId); }
}

// Pick the user-owned SMTP account with the most remaining daily quota.
// Falls back to the system default SMTP if user has no accounts.
export async function selectSmtpAccount(
  userId: string,
  pool: Pool
): Promise<{ transporter: Transporter; accountId: string | null; fromAddress: string } | null> {
  const today = new Date().toISOString().split('T')[0];

  const { rows } = await pool.query(
    `SELECT * FROM smtp_accounts
     WHERE user_id = $1 AND is_active = true AND is_verified = true
       AND (reset_date IS NULL OR reset_date::text < $2 OR sent_today < daily_limit)
     ORDER BY (daily_limit - CASE WHEN reset_date::text = $2 THEN sent_today ELSE 0 END) DESC
     LIMIT 1`,
    [userId, today]
  );

  if (rows.length === 0) return null; // caller falls back to system SMTP

  const account: SmtpAccount = rows[0];

  // Reset daily counter if it's a new day
  if (!account.reset_date || account.reset_date.toString().slice(0, 10) !== today) {
    await pool.query(
      `UPDATE smtp_accounts SET sent_today = 0, reset_date = $1 WHERE id = $2`,
      [today, account.id]
    );
    account.sent_today = 0;
  }

  return {
    transporter: buildTransporter(account),
    accountId: account.id,
    fromAddress: account.from_name
      ? `${account.from_name} <${account.from_email}>`
      : account.from_email
  };
}

export async function incrementSmtpUsage(accountId: string, pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE smtp_accounts SET sent_today = sent_today + 1, updated_at = NOW() WHERE id = $1`,
    [accountId]
  );
}

// Verify an SMTP account by attempting a connection
export async function verifySmtpAccount(account: SmtpAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const pass = decrypt(account.auth_pass_enc);
    const t = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: { user: account.auth_user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });
    await t.verify();
    t.close();
    return { ok: true };
  } catch (err: any) {
    logger.warn({ error: err.message }, 'SMTP account verification failed');
    return { ok: false, error: err.message };
  }
}
