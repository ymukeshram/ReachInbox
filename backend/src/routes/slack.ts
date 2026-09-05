import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { pool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
const slackClientId = process.env.SLACK_CLIENT_ID || '';
const slackClientSecret = process.env.SLACK_CLIENT_SECRET || '';
const slackRedirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:3001/api/slack/callback';

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

router.get('/connect', isAuthenticated, (req: Request, res: Response) => {
  if (!slackClientId || !slackClientSecret) {
    return res.status(503).json({ error: 'Slack OAuth is not configured' });
  }

  const state = crypto.randomBytes(24).toString('hex');
  (req.session as any).slackOAuthState = state;
  const params = new URLSearchParams({
    client_id: slackClientId,
    scope: 'chat:write,incoming-webhook',
    redirect_uri: slackRedirectUri,
    state
  });
  return res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

router.get('/callback', isAuthenticated, async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const expectedState = (req.session as any).slackOAuthState;
  delete (req.session as any).slackOAuthState;

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(`${frontendUrl()}/dashboard?slack=state_error`);
  }

  try {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: slackClientId,
        client_secret: slackClientSecret,
        code,
        redirect_uri: slackRedirectUri
      },
      timeout: 10_000
    });
    const data = response.data;
    if (!data.ok || !data.access_token) {
      logger.warn({ error: data.error }, 'Slack OAuth exchange failed');
      return res.redirect(`${frontendUrl()}/dashboard?slack=connect_error`);
    }

    const user = req.user as any;
    await pool.query(
      `UPDATE users SET
        slack_access_token=$1,
        slack_team_id=$2,
        slack_team_name=$3,
        slack_webhook_url=$4,
        slack_connected_at=NOW()
       WHERE id=$5`,
      [
        data.access_token,
        data.team?.id || null,
        data.team?.name || null,
        data.incoming_webhook?.url || null,
        user.id
      ]
    );
    return res.redirect(`${frontendUrl()}/dashboard?slack=connected`);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Slack OAuth callback failed');
    return res.redirect(`${frontendUrl()}/dashboard?slack=connect_error`);
  }
});

router.get('/status', isAuthenticated, async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await pool.query(
    'SELECT slack_team_name, slack_connected_at FROM users WHERE id=$1',
    [user.id]
  );
  return res.json({
    connected: Boolean(result.rows[0]?.slack_connected_at),
    teamName: result.rows[0]?.slack_team_name || null
  });
});

router.post('/disconnect', isAuthenticated, async (req: Request, res: Response) => {
  const user = req.user as any;
  await pool.query(
    `UPDATE users SET slack_access_token=NULL, slack_team_id=NULL, slack_team_name=NULL,
      slack_webhook_url=NULL, slack_connected_at=NULL WHERE id=$1`,
    [user.id]
  );
  return res.json({ connected: false });
});

export default router;
