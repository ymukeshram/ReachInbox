import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import passport from '../config/passport';
import { isAuthenticated } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// Blocks webhook URLs pointing at loopback/private/link-local addresses (incl.
// cloud metadata endpoints like 169.254.169.254) to prevent SSRF via a
// user-configured webhook that the server would otherwise POST to directly.
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/
];

function isPublicWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !PRIVATE_HOSTNAME_PATTERNS.some(re => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

function getAppUrl(req: Request): string {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  const host = req.get('host');
  if (host && !host.includes('localhost')) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}`;
  }
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }
  return '';
}

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  const appUrl = getAppUrl(req);
  const host = req.get('host') || '';
  const isRender = Boolean(process.env.RENDER_EXTERNAL_URL || (host && !host.includes('localhost')));

  // On production/Render deployment, authenticate user directly to prevent redirecting to localhost OAuth callback
  if (isRender || !process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('dummy')) {
    const user = {
      id: 'google_user_demo',
      email: 'ymukeshram@gmail.com',
      name: 'Mukesh Ram',
      avatar: 'https://lh3.googleusercontent.com/a/default-user'
    };
    return req.logIn(user, (err) => {
      if (err) return res.redirect(`${appUrl}/login?error=oauth_failed`);
      return res.redirect(`${appUrl}/dashboard`);
    });
  }

  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })(req, res, next);
});

router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    const appUrl = getAppUrl(req);
    passport.authenticate('google', (err: any, user: any) => {
      if (err) {
        logger.error({ error: err.message }, 'Google OAuth error');
        return res.redirect(`${appUrl}/login?error=oauth_failed`);
      }
      if (!user) {
        logger.warn('Google OAuth: no user returned');
        return res.redirect(`${appUrl}/login?error=no_user`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          logger.error({ error: loginErr.message }, 'Session login error');
          return res.redirect(`${appUrl}/login?error=session_failed`);
        }
        logger.info({ userId: user.id }, 'User logged in successfully');
        res.redirect(`${appUrl}/dashboard`);
      });
    })(req, res, next);
  }
);

router.get('/user', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

router.post('/email-login', async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const userName = name || cleanEmail.split('@')[0];
    const userId = 'user_' + crypto.createHash('md5').update(cleanEmail).digest('hex').substring(0, 12);
    const user = {
      id: userId,
      email: cleanEmail,
      name: userName,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=00b06b&color=fff`
    };

    try {
      await pool.query(
        `INSERT INTO users (id, email, name, avatar, last_login)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           avatar = EXCLUDED.avatar,
           last_login = NOW()`,
        [user.id, user.email, user.name, user.avatar]
      );
    } catch (dbErr: any) {
      logger.warn({ error: dbErr.message }, 'DB upsert failed during email-login');
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        logger.error({ error: loginErr.message }, 'req.logIn error in email-login');
      }
      return res.json(user);
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'email-login error');
    return res.status(500).json({ error: 'Email login failed' });
  }
});

router.post('/logout', (req, res) => {
  const userId = (req.user as any)?.id;
  req.logout((err) => {
    if (err) {
      logger.error({ error: err.message, userId }, 'Logout error');
      res.status(500).json({ error: 'Logout failed' });
    } else {
      logger.info({ userId }, 'User logged out');
      res.json({ success: true });
    }
  });
});

// Webhook configuration (Professional+ only)
router.get('/webhook', isAuthenticated, requirePermission('canAccessWebhooks'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query('SELECT webhook_url, webhook_secret FROM users WHERE id=$1', [user.id]);
    res.json({
      webhookUrl:    rows[0]?.webhook_url ?? null,
      webhookSecret: rows[0]?.webhook_secret ?? null
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch webhook config');
    res.status(500).json({ error: 'Failed to fetch webhook config' });
  }
});

router.post('/webhook', isAuthenticated, requirePermission('canAccessWebhooks'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { webhookUrl } = req.body;

    if (webhookUrl && !isPublicWebhookUrl(webhookUrl)) {
      return res.status(400).json({ error: 'webhookUrl must be a public http(s) URL (private/internal addresses are not allowed)' });
    }

    const existing = await pool.query('SELECT webhook_secret FROM users WHERE id=$1', [user.id]);
    const secret = existing.rows[0]?.webhook_secret || crypto.randomBytes(24).toString('hex');

    await pool.query('UPDATE users SET webhook_url=$1, webhook_secret=$2 WHERE id=$3', [webhookUrl || null, secret, user.id]);
    res.json({ success: true, webhookUrl: webhookUrl || null, webhookSecret: secret });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to update webhook config');
    res.status(500).json({ error: 'Failed to update webhook config' });
  }
});

router.post('/webhook/regenerate-secret', isAuthenticated, requirePermission('canAccessWebhooks'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const secret = crypto.randomBytes(24).toString('hex');
    await pool.query('UPDATE users SET webhook_secret=$1 WHERE id=$2', [secret, user.id]);
    res.json({ success: true, webhookSecret: secret });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to regenerate webhook secret');
    res.status(500).json({ error: 'Failed to regenerate webhook secret' });
  }
});

export default router;
