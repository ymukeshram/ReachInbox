import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';
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

// ─── System (default) SMTP transporter ───────────────────────────────────────

const systemTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,
  maxConnections: 10,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 10,
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

let smtpReady = false;
async function verifySystemSmtp(retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await systemTransporter.verify();
      smtpReady = true;
      logger.info('System SMTP connection verified');
      return;
    } catch (err: any) {
      logger.warn({ attempt: i+1, error: err.message }, 'System SMTP verification attempt failed');
      if (i < retries-1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  logger.warn('System SMTP verification skipped');
}
verifySystemSmtp().catch(() => {});

// ─── Attachment type ──────────────────────────────────────────────────────────

export interface EmailAttachment {
  filename: string;
  content:  Buffer;   // raw binary (from PostgreSQL BYTEA)
  contentType: string;
}

export interface SendEmailOptions {
  emailId?:     string;
  backendUrl?:  string;
  transporter?: Transporter; // custom SMTP (for rotation)
  fromAddress?: string;      // custom from (for rotation)
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
    backendUrl  = process.env.BACKEND_URL || 'http://localhost:3001',
    transporter = systemTransporter,
    fromAddress = process.env.SMTP_FROM || `Reachify <${process.env.SMTP_USER}>`,
    attachment
  } = options;

  // Ensure system SMTP is ready when using default transporter
  if (transporter === systemTransporter && !smtpReady) {
    await verifySystemSmtp();
  }

  const trackingPixel = emailId
    ? `<img src="${backendUrl}/track/open/${emailId}" width="1" height="1" style="display:none" alt="" />`
    : '';

  const unsubscribeFooter = emailId
    ? `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#718096;">
         You received this because you opted in. &nbsp;
         <a href="${backendUrl}/track/unsubscribe/${emailId}" style="color:#667eea;">Unsubscribe</a>
       </div>`
    : '';

  try {
    const info = await transporter.sendMail({
      from:    fromAddress,
      to,
      subject,
      text:    body.replace(/<[^>]*>/g, '') + (emailId ? `\n\nUnsubscribe: ${backendUrl}/track/unsubscribe/${emailId}` : ''),
      html:    `<!DOCTYPE html><html><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
                <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
                  ${trackingPixel}
                  ${body}
                  ${unsubscribeFooter}
                </body></html>`,
      attachments: attachment
        ? [{ filename: attachment.filename, content: attachment.content, contentType: attachment.contentType }]
        : []
    });

    logger.info({ messageId: info.messageId, to, subject }, 'Email sent');
    try { const { incrementMetric } = await import('../utils/metrics'); await incrementMetric('emailsSent'); } catch {}
  } catch (error: any) {
    logger.error({ error: error.message, to, subject }, 'Email send failed');
    try { const { incrementMetric } = await import('../utils/metrics'); await incrementMetric('emailsFailed'); } catch {}
    throw new Error(error.message);
  }
}

process.on('SIGTERM', () => { systemTransporter.close(); });
process.on('SIGINT',  () => { systemTransporter.close(); });
