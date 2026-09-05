import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isNeon = (process.env.DATABASE_URL || '').includes('neon.tech');
const useSsl = isNeon || process.env.DB_SSL === 'true';

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ...(useSsl ? { ssl: { rejectUnauthorized: isNeon } } : {}),
        max: 10,
        min: 0,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 30_000,
        statement_timeout: 30_000,
        query_timeout: 30_000,
        allowExitOnIdle: false,
      }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        max: 10,
        min: 0,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 30_000,
      }
);

pool.on('error', (err) => console.error('Unexpected pool error:', err.message));
pool.on('connect', (client) => {
  console.log('New database client connected');
  // Set session parameters for better performance
  client.query('SET statement_timeout = 60000').catch(() => {});
  client.query('SET idle_in_transaction_session_timeout = 60000').catch(() => {});
});
pool.on('remove', () => console.log('Database client removed from pool'));

export async function initDatabase() {
  let retries = 2; // Shorter retry count for fast local feedback
  let client;

  while (retries > 0) {
    try {
      console.log('Attempting to connect to database...');
      client = await pool.connect();
      console.log('Database connected successfully!');
      break;
    } catch (err: any) {
      retries--;
      if (retries > 0) {
        console.log(`Database connection failed: ${err.message}. Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.warn('⚠️ Could not connect to PostgreSQL database on localhost:5432.');
        console.warn('Backend running in database-offline mode. Install PostgreSQL or set DATABASE_URL in backend/.env to connect.');
        return; // Non-fatal exit
      }
    }
  }
  
  if (!client) return;
  
  try {
    // Users table for persistent user data
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        avatar TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Emails table with foreign key to users
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_email VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        scheduled_at TIMESTAMP NOT NULL,
        sent_at TIMESTAMP NULL,
        status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'failed', 'cancelled')),
        error_message TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Email templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    // Optimized indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at ON emails(scheduled_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_emails_user_status ON emails(user_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_user_id ON email_templates(user_id)`);
    
    // Payment orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(50) NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed')),
        razorpay_order_id VARCHAR(255) UNIQUE,
        razorpay_payment_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Subscriptions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`);

  } finally {
    client.release();
  }
}
