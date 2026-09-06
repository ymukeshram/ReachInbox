import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { sendWebhook } from '../services/webhookService';

const router = Router();

// Only allow redirecting to http(s) links — blocks javascript:/data:/file: URI abuse
// of this endpoint as an open redirector with a non-web scheme.
function isSafeRedirectUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// 1x1 transparent GIF for email open tracking
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Track email opens
router.get('/open/:emailId', async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    // Update email with opened_at timestamp
    const { rows: openedRows } = await pool.query(
      `UPDATE emails
       SET opened_at = COALESCE(opened_at, NOW()),
           open_count = COALESCE(open_count, 0) + 1,
           last_opened_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING recipient_email, user_id`,
      [emailId]
    );

    if (openedRows.length > 0) {
      sendWebhook({
        event: 'email.opened',
        emailId,
        recipientEmail: openedRows[0].recipient_email,
        status: 'opened',
        timestamp: new Date().toISOString(),
        userId: openedRows[0].user_id
      }).catch(() => {});
    }

    // Log the open event (optional - for detailed analytics)
    await pool.query(
      `INSERT INTO email_opens (id, email_id, opened_at, user_agent, ip_address)
       VALUES (gen_random_uuid(), $1, NOW(), $2, $3)
       ON CONFLICT DO NOTHING`,
      [emailId, userAgent, ipAddress]
    ).catch(() => {}); // Ignore if table doesn't exist yet

    logger.info({ emailId, userAgent }, 'Email opened');
  } catch (err: any) {
    logger.error({ error: err.message, emailId: req.params.emailId }, 'Failed to track email open');
  }

  // Always return the tracking pixel (even if tracking fails)
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': TRACKING_PIXEL.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(TRACKING_PIXEL);
});

// Track email clicks
router.get('/click/:emailId', async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;
    const { url } = req.query;
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (!url || typeof url !== 'string' || !isSafeRedirectUrl(url)) {
      return res.status(400).send('Invalid URL');
    }

    // Update email with clicked_at timestamp
    const { rows: clickedRows } = await pool.query(
      `UPDATE emails
       SET clicked_at = COALESCE(clicked_at, NOW()),
           click_count = COALESCE(click_count, 0) + 1,
           last_clicked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING recipient_email, user_id`,
      [emailId]
    );

    if (clickedRows.length > 0) {
      sendWebhook({
        event: 'email.clicked',
        emailId,
        recipientEmail: clickedRows[0].recipient_email,
        status: 'clicked',
        timestamp: new Date().toISOString(),
        userId: clickedRows[0].user_id
      }).catch(() => {});
    }

    // Log the click event
    await pool.query(
      `INSERT INTO email_clicks (id, email_id, url, clicked_at, user_agent, ip_address)
       VALUES (gen_random_uuid(), $1, $2, NOW(), $3, $4)`,
      [emailId, url, userAgent, ipAddress]
    ).catch(() => {}); // Ignore if table doesn't exist yet

    logger.info({ emailId, url, userAgent }, 'Email link clicked');

    // Redirect to the original URL
    res.redirect(url);
  } catch (err: any) {
    logger.error({ error: err.message, emailId: req.params.emailId }, 'Failed to track email click');
    
    // Still redirect even if tracking fails
    const url = req.query.url as string;
    if (url && isSafeRedirectUrl(url)) {
      res.redirect(url);
    } else {
      res.status(400).send('Invalid URL');
    }
  }
});

// Unsubscribe handler
router.get('/unsubscribe/:emailId', async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;

    // Get email details
    const result = await pool.query(
      'SELECT recipient_email, user_id FROM emails WHERE id = $1',
      [emailId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('<h1>Email not found</h1>');
    }

    const { recipient_email, user_id } = result.rows[0];

    // Mark as unsubscribed in contacts table (if exists)
    await pool.query(
      `UPDATE contacts 
       SET subscribed = false, 
           unsubscribed_at = NOW(),
           updated_at = NOW()
       WHERE email = $1 AND user_id = $2`,
      [recipient_email, user_id]
    ).catch(() => {}); // Ignore if contacts table doesn't exist

    // Also create an unsubscribe record
    await pool.query(
      `INSERT INTO unsubscribes (id, email, user_id, unsubscribed_at, source_email_id)
       VALUES (gen_random_uuid(), $1, $2, NOW(), $3)
       ON CONFLICT (email, user_id) DO NOTHING`,
      [recipient_email, user_id, emailId]
    ).catch(() => {}); // Ignore if table doesn't exist

    logger.info({ emailId, email: recipient_email }, 'User unsubscribed');

    // Return a nice unsubscribe confirmation page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed - ReachInbox</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f3faf6; color: #1f2937; }
          .container { text-align: center; background: white; padding: 48px 40px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01); max-width: 440px; width: 90%; border: 1px solid #e5e7eb; }
          .icon { width: 64px; height: 64px; background: #d1fae5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 24px; }
          h1 { color: #111827; margin: 0 0 16px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; }
          p { color: #6b7280; margin: 0 0 24px; line-height: 1.6; font-size: 15px; }
          .email { font-weight: 600; color: #374151; background: #f9fafb; padding: 8px 16px; border-radius: 8px; display: inline-block; margin-bottom: 32px; border: 1px solid #f3f4f6; }
          .button { display: inline-block; background: linear-gradient(to right, #10b981, #059669); color: white; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2); }
          .button:hover { transform: translateY(-1px); box-shadow: 0 6px 8px -1px rgba(16, 185, 129, 0.3); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>You've Been Unsubscribed</h1>
          <p>We're sorry to see you go! You will no longer receive emails from us at:</p>
          <div class="email">${recipient_email}</div>
          <p>If this was a mistake, you can resubscribe anytime by contacting us.</p>
          <a href="${process.env.FRONTEND_URL || ''}" class="button">Visit ReachInbox</a>
        </div>
      </body>
      </html>
    `);
  } catch (err: any) {
    logger.error({ error: err.message, emailId: req.params.emailId }, 'Failed to process unsubscribe');
    res.status(500).send('<h1>Error processing unsubscribe</h1><p>Please try again later.</p>');
  }
});

export default router;
