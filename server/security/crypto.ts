import crypto from 'crypto';

const EPHEMERAL_FALLBACK_KEY = crypto.randomBytes(32);
let warnedMissingEncryptionKey = false;

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw && raw.trim().length >= 16) {
    return crypto.createHash('sha256').update(raw.trim()).digest();
  }
  if (!warnedMissingEncryptionKey) {
    warnedMissingEncryptionKey = true;
    console.warn('[security] TOKEN_ENCRYPTION_KEY not configured; using process-scoped ephemeral key.');
  }
  return EPHEMERAL_FALLBACK_KEY;
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || crypto.createHash('sha256').update(getEncryptionKey()).digest('hex');
}

export function getSsoSigningSecret(): string {
  return process.env.SSO_SIGNING_SECRET?.trim() || getJwtSecret();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function encryptSecret(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(payload: { ciphertext: string; iv: string; authTag: string }): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
