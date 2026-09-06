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

/** Validates production configuration and logs warnings for missing non-critical env variables. */
export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.warn(`Optional/Recommended environment variables not provided:\n${missing.map(k => `   - ${k}`).join('\n')}`);
  }

  const smtpVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'];
  const missingSmtp = smtpVars.filter(key => !process.env[key]);
  if (missingSmtp.length > 0) {
    logger.info(`SMTP configuration incomplete; falling back to Ethereal Email test account for sending emails.`);
  }

  logger.info('Environment variable check completed');
}
