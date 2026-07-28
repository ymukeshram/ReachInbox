import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const REQUIRED_VARS = [
  'DATABASE_URL',
  'REDIS_HOST',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'FRONTEND_URL',
  'BREVO_API_KEY',
  'BREVO_FROM_EMAIL',
];

const NUMERIC_VARS = ['PORT', 'REDIS_PORT'];
const URL_VARS = ['DATABASE_URL', 'FRONTEND_URL', 'GOOGLE_CALLBACK_URL'];

function fail(message: string): never {
  logger.fatal(message);
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** Validates required env vars, checks formats, and ensures a persistent session secret. Exits the process on failure. */
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

  // Generate a persistent session secret if not provided
  if (!process.env.SESSION_SECRET) {
    const secretPath = path.join(__dirname, '../../.session-secret');

    if (fs.existsSync(secretPath)) {
      process.env.SESSION_SECRET = fs.readFileSync(secretPath, 'utf-8').trim();
    } else {
      const secret = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretPath, secret);
      process.env.SESSION_SECRET = secret;
      logger.info('Generated new session secret');
    }
  }

  logger.info('Environment variables validated');
}
