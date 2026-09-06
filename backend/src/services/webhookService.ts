import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { getUserRole, ROLE_PERMISSIONS } from '../middleware/rbac';

interface WebhookPayload {
  event: 'email.sent' | 'email.failed' | 'email.scheduled' | 'email.opened' | 'email.clicked';
  emailId: string;
  recipientEmail: string;
  status: string;
  timestamp: string;
  userId: string;
  error?: string;
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  try {
    // Get user's webhook URL + signing secret from database
    const result = await pool.query(
      'SELECT webhook_url, webhook_secret FROM users WHERE id = $1 AND webhook_url IS NOT NULL',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      return; // No webhook configured
    }

    // A downgraded user keeps their stored webhook_url (there's no self-serve way
    // to disable it), so re-check the permission at dispatch time rather than
    // trusting that the URL being set means the plan still allows it.
    const role = await getUserRole(payload.userId, pool);
    if (!ROLE_PERMISSIONS[role].canAccessWebhooks) return;

    const { webhook_url: webhookUrl, webhook_secret: webhookSecret } = result.rows[0];

    await axios.post(webhookUrl, payload, {
      timeout: 5000,
      maxRedirects: 0, // don't follow redirects — a malicious endpoint could redirect to an internal address, bypassing the SSRF check applied when the URL was saved
      headers: {
        'Content-Type': 'application/json',
        'X-ReachInbox-Event': payload.event,
        'X-ReachInbox-Signature': generateSignature(payload, webhookSecret)
      }
    });

    logger.info({
      userId: payload.userId,
      event: payload.event,
      emailId: payload.emailId
    }, 'Webhook sent successfully');
  } catch (error: any) {
    logger.warn({
      error: error.message,
      userId: payload.userId,
      event: payload.event
    }, 'Webhook delivery failed');
  }
}

export async function sendRateLimitAlert(userId: string, emailId: string, limit: number): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT COALESCE(slack_webhook_url, webhook_url) AS webhook_url FROM users WHERE id=$1 AND (slack_webhook_url IS NOT NULL OR webhook_url IS NOT NULL)',
      [userId]
    );
    const webhookUrl = result.rows[0]?.webhook_url;
    if (!webhookUrl) return;

    await axios.post(webhookUrl, {
      text: `ReachInbox paused email job ${emailId}: the hourly sender limit of ${limit} was reached. It will resume in the next hour.`
    }, { timeout: 5000, maxRedirects: 0 });
  } catch (error: any) {
    logger.warn({ error: error.message, userId, emailId }, 'Rate-limit Slack notification failed');
  }
}

function generateSignature(payload: WebhookPayload, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}
