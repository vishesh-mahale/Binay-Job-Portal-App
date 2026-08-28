import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

type OAuthStatePayload = { state: string; codeVerifier: string; issuedAt: number; expiresAt: number; keyVersion: number };

function key(secret: string): Buffer { return createHash('sha256').update(secret, 'utf8').digest(); }

export function sealOAuthState(payload: OAuthStatePayload, secret: string): string {
  if (secret.length < 32) throw new Error('OAUTH_STATE_SECRET_TOO_WEAK');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${payload.keyVersion}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function openOAuthState(value: string, secret: string, now = Date.now()): OAuthStatePayload {
  if (secret.length < 32) throw new Error('OAUTH_STATE_SECRET_TOO_WEAK');
  const parts = value.split('.'); if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) throw new Error('INVALID_OAUTH_STATE');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const parsed = JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')) as OAuthStatePayload;
    if (!parsed.state || !parsed.codeVerifier || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now) throw new Error('EXPIRED_OAUTH_STATE');
    return parsed;
  } catch (error) { throw new Error(error instanceof Error && error.message === 'EXPIRED_OAUTH_STATE' ? error.message : 'INVALID_OAUTH_STATE'); }
}

export function statesEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected); const b = Buffer.from(actual); return a.length === b.length && timingSafeEqual(a, b);
}

export type { OAuthStatePayload };
