import { Pool } from 'pg';
import { logger } from '../utils/logger';

interface Migration {
  version: number;
  name: string;
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (pool: Pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255),
          avatar TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    },
    down: async (pool: Pool) => {
      await pool.query('DROP TABLE IF EXISTS users CASCADE');
    }
  },
  {
    version: 2,
    name: 'add_webhook_support',
    up: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS webhook_url TEXT,
        ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255)
      `);
    },
    down: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE users
        DROP COLUMN IF EXISTS webhook_url,
        DROP COLUMN IF EXISTS webhook_secret
      `);
    }
  },
  {
    version: 3,
    name: 'add_email_tracking',
    up: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE emails
        ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS bounced BOOLEAN DEFAULT FALSE
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_emails_opened
        ON emails(opened_at) WHERE opened_at IS NOT NULL
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_opens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email_id VARCHAR(36) REFERENCES emails(id) ON DELETE CASCADE,
          opened_at TIMESTAMP DEFAULT NOW(),
          user_agent TEXT,
          ip_address TEXT,
          UNIQUE(email_id, opened_at)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_clicks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email_id VARCHAR(36) REFERENCES emails(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          clicked_at TIMESTAMP DEFAULT NOW(),
          user_agent TEXT,
          ip_address TEXT
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS unsubscribes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          unsubscribed_at TIMESTAMP DEFAULT NOW(),
          source_email_id VARCHAR(36) REFERENCES emails(id) ON DELETE SET NULL,
          reason TEXT,
          UNIQUE(email, user_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          custom_fields JSONB,
          subscribed BOOLEAN DEFAULT true,
          soft_bounce_count INTEGER DEFAULT 0,
          hard_bounced BOOLEAN DEFAULT false,
          bounce_reason TEXT,
          unsubscribed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, email)
        )
      `);

      await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_opens_email_id  ON email_opens(email_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_clicks_email_id ON email_clicks(email_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_clicks_url      ON email_clicks(url)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_unsubscribes_email    ON unsubscribes(email)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_unsubscribes_user_id  ON unsubscribes(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_email   ON contacts(user_id, email)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_subscribed   ON contacts(subscribed) WHERE subscribed = true`);
    },
    down: async (pool: Pool) => {
      await pool.query('DROP TABLE IF EXISTS email_opens CASCADE');
      await pool.query('DROP TABLE IF EXISTS email_clicks CASCADE');
      await pool.query('DROP TABLE IF EXISTS unsubscribes CASCADE');
      await pool.query('DROP TABLE IF EXISTS contacts CASCADE');
      await pool.query(`
        ALTER TABLE emails
        DROP COLUMN IF EXISTS opened_at,
        DROP COLUMN IF EXISTS open_count,
        DROP COLUMN IF EXISTS last_opened_at,
        DROP COLUMN IF EXISTS clicked_at,
        DROP COLUMN IF EXISTS click_count,
        DROP COLUMN IF EXISTS last_clicked_at,
        DROP COLUMN IF EXISTS bounced
      `);
    }
  },
  {
    version: 4,
    name: 'add_campaigns_and_bounce_type',
    up: async (pool: Pool) => {
      // Campaigns table — groups emails into named batches
      await pool.query(`
        CREATE TABLE IF NOT EXISTS campaigns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          status VARCHAR(20) DEFAULT 'active'
            CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
          total_emails INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, name)
        )
      `);

      await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)`);

      // Link emails to campaigns
      await pool.query(`
        ALTER TABLE emails ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id)`);

      // Bounce type for smarter retry logic
      await pool.query(`
        ALTER TABLE emails
        ADD COLUMN IF NOT EXISTS bounce_type VARCHAR(10)
          CHECK (bounce_type IN ('soft', 'hard', 'unknown'))
      `);
    },
    down: async (pool: Pool) => {
      await pool.query(`ALTER TABLE emails DROP COLUMN IF EXISTS bounce_type`);
      await pool.query(`ALTER TABLE emails DROP COLUMN IF EXISTS campaign_id`);
      await pool.query('DROP TABLE IF EXISTS campaigns CASCADE');
    }
  },
  {
    version: 5,
    name: 'smtp_sequences_tags_attachments',
    up: async (pool: Pool) => {
      // Multi-SMTP account rotation
      await pool.query(`
        CREATE TABLE IF NOT EXISTS smtp_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          host VARCHAR(255) NOT NULL,
          port INTEGER DEFAULT 587,
          secure BOOLEAN DEFAULT false,
          auth_user VARCHAR(255) NOT NULL,
          auth_pass_enc TEXT NOT NULL,
          from_name VARCHAR(255) DEFAULT '',
          from_email VARCHAR(255) NOT NULL,
          daily_limit INTEGER DEFAULT 500,
          sent_today INTEGER DEFAULT 0,
          reset_date DATE,
          is_active BOOLEAN DEFAULT true,
          is_verified BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_smtp_user_id ON smtp_accounts(user_id)`);

      // Contact tags
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          color VARCHAR(7) DEFAULT '#6366f1',
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, name)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_tags (
          contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
          tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY(contact_id, tag_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id)`);

      // Email attachments (stored once per campaign, shared across all emails in batch)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_attachments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          mimetype VARCHAR(100) NOT NULL,
          size_bytes INTEGER NOT NULL,
          content BYTEA NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES email_attachments(id) ON DELETE SET NULL`);

      // Email sequences (follow-up automation)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sequences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sequence_steps (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
          step_number INTEGER NOT NULL,
          subject VARCHAR(500) NOT NULL,
          body TEXT NOT NULL,
          delay_days INTEGER NOT NULL DEFAULT 3,
          condition VARCHAR(20) DEFAULT 'no_open'
            CHECK (condition IN ('always','no_open','no_click','opened','clicked')),
          UNIQUE(sequence_id, step_number)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sequence_enrollments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_email VARCHAR(255) NOT NULL,
          current_step INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active'
            CHECK (status IN ('active','completed','unsubscribed','paused')),
          source_email_id VARCHAR(36) REFERENCES emails(id) ON DELETE SET NULL,
          next_check_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(sequence_id, recipient_email)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_seq_enrollments_next ON sequence_enrollments(next_check_at) WHERE status='active'`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_sequences_user ON sequences(user_id)`);
    },
    down: async (pool: Pool) => {
      await pool.query('DROP TABLE IF EXISTS sequence_enrollments CASCADE');
      await pool.query('DROP TABLE IF EXISTS sequence_steps CASCADE');
      await pool.query('DROP TABLE IF EXISTS sequences CASCADE');
      await pool.query('ALTER TABLE emails DROP COLUMN IF EXISTS attachment_id');
      await pool.query('DROP TABLE IF EXISTS email_attachments CASCADE');
      await pool.query('DROP TABLE IF EXISTS contact_tags CASCADE');
      await pool.query('DROP TABLE IF EXISTS tags CASCADE');
      await pool.query('DROP TABLE IF EXISTS smtp_accounts CASCADE');
    }
  },
  {
    version: 6,
    name: 'add_subscription_trial_flag',
    up: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE subscriptions
        ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false
      `);
    },
    down: async (pool: Pool) => {
      await pool.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS is_trial`);
    }
  },
  {
    version: 7,
    name: 'remove_smtp_accounts',
    up: async (pool: Pool) => {
      // Custom SMTP rotation has been replaced by a single Brevo API integration
      await pool.query('DROP TABLE IF EXISTS smtp_accounts CASCADE');
    },
    down: async () => {
      // Irreversible — the custom-SMTP feature has been removed from the app
    }
  },
  {
    version: 8,
    name: 'add_slack_oauth_support',
    up: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS slack_access_token TEXT,
        ADD COLUMN IF NOT EXISTS slack_team_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS slack_team_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT,
        ADD COLUMN IF NOT EXISTS slack_connected_at TIMESTAMP
      `);
    },
    down: async (pool: Pool) => {
      await pool.query(`
        ALTER TABLE users
        DROP COLUMN IF EXISTS slack_access_token,
        DROP COLUMN IF EXISTS slack_team_id,
        DROP COLUMN IF EXISTS slack_team_name,
        DROP COLUMN IF EXISTS slack_webhook_url,
        DROP COLUMN IF EXISTS slack_connected_at
      `);
    }
  }
];

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  const currentVersion = result.rows[0]?.version || 0;
  logger.info({ currentVersion }, 'Current database version');

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info({ version: migration.version, name: migration.name }, 'Running migration');
      try {
        await migration.up(pool);
        await pool.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );
        logger.info({ version: migration.version, name: migration.name }, 'Migration completed');
      } catch (error: any) {
        logger.error({ error: error.message, version: migration.version }, 'Migration failed');
        throw error;
      }
    }
  }
}
