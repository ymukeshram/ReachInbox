import { logger } from '../utils/logger';
import { addClickTracking } from '../utils/emailTracking';
import { incrementMetric } from '../utils/metrics';
import dotenv from 'dotenv';

dotenv.config();

export type BounceType = 'hard' | 'soft' | 'unknown';

export function classifyBounce(errorMessage: string): BounceType {
  const msg = errorMessage.toLowerCase();
  if (
    /\b55[013]\b/.test(msg) ||
    msg.includes('user unknown') || msg.includes('does not exist') ||
    msg.includes('no such user')  || msg.includes('invalid address') ||
    msg.includes('mailbox not found') || msg.includes('account does not exist') ||
    msg.includes('recipient rejected') || msg.includes('bad destination')
  ) return 'hard';

  if (
    /\b4[25][012]\b/.test(msg) ||
    msg.includes('temporarily')  || msg.includes('try again') ||
    msg.includes('quota exceeded')|| msg.includes('too many') ||
    msg.includes('service unavailable') || msg.includes('connection timeout') ||
    msg.includes('busy')
  ) return 'soft';

  return 'unknown';
}

// ─── Brevo transactional email API ───────────────────────────────────────────

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function getSender(): { name?: string; email: string } {
  const email = process.env.BREVO_FROM_EMAIL || '';
  const name  = process.env.BREVO_FROM_NAME || 'Reachify';
  return { name, email };
}

// ─── Attachment type ──────────────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  content:  Buffer;   // raw binary (from PostgreSQL BYTEA)
  contentType: string;
}

export interface SendEmailOptions {
  emailId?:     string;
  backendUrl?:  string;
  attachment?:  EmailAttachment;
}

// ─── Core send function ───────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const {
    emailId,
    backendUrl = process.env.BACKEND_URL || 'http://localhost:3001',
    attachment
  } = options;

  const trackingPixel = emailId
    ? `<img src="${backendUrl}/track/open/${emailId}" width="1" height="1" style="display:none" alt="" />`
    : '';

  const unsubscribeFooter = emailId
    ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#718096;">
         You received this because you opted in. &nbsp;
         <a href="${backendUrl}/track/unsubscribe/${emailId}" style="color:#667eea;">Unsubscribe</a>
       </div>`
    : '';

  const trackedBody = emailId ? addClickTracking(body, emailId, backendUrl) : body;

  const payload = {
    sender: getSender(),
    to: [{ email: to }],
    subject,
    textContent: body.replace(/<[^>]*>/g, '') + (emailId ? `\n\nUnsubscribe: ${backendUrl}/track/unsubscribe/${emailId}` : ''),
    htmlContent: `<!DOCTYPE html><html><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
                <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
                  ${trackingPixel}
                  ${trackedBody}
                  ${unsubscribeFooter}
                </body></html>`,
    ...(attachment
      ? { attachment: [{ name: attachment.filename, content: attachment.content.toString('base64') }] }
      : {})
  };

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Brevo API error ${res.status}: ${errBody || res.statusText}`);
    }

    const info = await res.json().catch(() => ({} as any));
    logger.info({ messageId: info.messageId, to, subject }, 'Email sent');
    try { await incrementMetric('emailsSent'); } catch {}
  } catch (error: any) {
    logger.error({ error: error.message, to, subject }, 'Email send failed');
    try { await incrementMetric('emailsFailed'); } catch {}
    throw new Error(error.message);
  }
}
