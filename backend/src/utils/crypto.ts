import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.SMTP_ENCRYPTION_KEY || '';
  if (hex.length === 64) return Buffer.from(hex, 'hex');
  // Fallback: derive 32-byte key from SESSION_SECRET (not ideal but keeps app running)
  const seed = process.env.SESSION_SECRET || 'reachify-default-key-change-me!!';
  return Buffer.from(seed.padEnd(32, '0').slice(0, 32));
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('Invalid ciphertext format');
  const key      = getKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return (
    decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') +
    decipher.final('utf8')
  );
}
