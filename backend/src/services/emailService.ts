import { logger } from '../utils/logger';
import { addClickTracking } from '../utils/emailTracking';
import { incrementMetric } from '../utils/metrics';
import dotenv from 'dotenv';
import * as nodemailer from 'nodemailer';

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

// ─── Nodemailer Setup ──────────────────────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;
let defaultSender = process.env.SMTP_FROM_EMAIL || 'reachinbox@ethereal.email';

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    logger.info('Using custom SMTP configuration');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    logger.info('SMTP credentials not found. Falling back to Ethereal Email.');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    defaultSender = testAccount.user;
    logger.info({ user: testAccount.user, pass: testAccount.pass }, 'Ethereal test account created');
  }
  return transporter;
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

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
              <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
                ${trackingPixel}
                ${trackedBody}
                ${unsubscribeFooter}
              </body></html>`;
              
  const textContent = body.replace(/<[^>]*>/g, '') + (emailId ? `\n\nUnsubscribe: ${backendUrl}/track/unsubscribe/${emailId}` : '');

  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'ReachInbox'}" <${defaultSender}>`,
    to,
    subject,
    text: textContent,
    html: htmlContent,
    attachments: attachment ? [{
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType
    }] : []
  };

  try {
    const t = await getTransporter();
    const info = await t.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to, subject }, 'Email sent');
    
    // If using ethereal, log the preview URL
    if (info.messageId && defaultSender.includes('ethereal')) {
      logger.info({ previewUrl: nodemailer.getTestMessageUrl(info) }, 'Ethereal Preview URL');
    }
    
    try { await incrementMetric('emailsSent'); } catch {}
  } catch (error: any) {
    logger.error({ error: error.message, to, subject }, 'Email send failed');
    try { await incrementMetric('emailsFailed'); } catch {}
    throw new Error(error.message);
  }
}
