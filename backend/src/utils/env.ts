import { logger } from './logger';

const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'FRONTEND_URL',
  'BACKEND_URL',
  'SESSION_SECRET',
];

const NUMERIC_VARS = ['PORT', 'REDIS_PORT'];
const URL_VARS = ['DATABASE_URL', 'FRONTEND_URL', 'BACKEND_URL', 'GOOGLE_CALLBACK_URL'];

function fail(message: string): never {
  logger.fatal(message);
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** Validates production configuration and exits before serving traffic if it is incomplete. */
export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    fail(`Missing required environment variables:\n${missing.map(k => `   - ${k}`).join('\n')}`);
  }

  for (const key of NUMERIC_VARS) {
    const value = process.env[key];
    if (value && isNaN(parseInt(value))) {
      fail(`${key} must be a valid number, got: ${value}`);
    }
  }

  for (const key of URL_VARS) {
    const value = process.env[key];
    if (value) {
      try { new URL(value); } catch { fail(`${key} must be a valid URL, got: ${value}`); }
    }
  }

  const smtpVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'];
  const missingSmtp = smtpVars.filter(key => !process.env[key]);
  if (missingSmtp.length > 0) {
    fail(`Missing production SMTP variables:\n${missingSmtp.map(k => `   - ${k}`).join('\n')}`);
  }

  logger.info('Environment variables validated');
}
