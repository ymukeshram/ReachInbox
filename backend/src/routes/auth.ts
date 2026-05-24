import { Router, Request, Response, NextFunction } from 'express';
import passport from '../config/passport';
import { logger } from '../utils/logger';

const router = Router();

router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'], 
  prompt: 'select_account' 
}));

router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    // FRONTEND_URL takes priority; fall back to RENDER_EXTERNAL_URL so OAuth
    // works when the frontend is served directly from this backend service.
    const appUrl = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || '';
    passport.authenticate('google', (err: any, user: any) => {
      if (err) {
        logger.error({ error: err.message }, 'Google OAuth error');
        return res.redirect(`${appUrl}?error=oauth_failed`);
      }
      if (!user) {
        logger.warn('Google OAuth: no user returned');
        return res.redirect(`${appUrl}?error=no_user`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          logger.error({ error: loginErr.message }, 'Session login error');
          return res.redirect(`${appUrl}?error=session_failed`);
        }
        logger.info({ userId: user.id }, 'User logged in successfully');
        res.redirect(`${appUrl}/dashboard`);
      });
    })(req, res, next);
  }
);

router.get('/user', (req, res) => {
  logger.info({ 
    isAuthenticated: req.isAuthenticated(), 
    sessionID: req.sessionID,
    user: req.user ? 'exists' : 'null',
    cookies: req.headers.cookie ? 'present' : 'missing'
  }, 'User check request');
  
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ 
      error: 'Not authenticated',
      sessionID: req.sessionID,
      hasCookies: !!req.headers.cookie
    });
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

export default router;
