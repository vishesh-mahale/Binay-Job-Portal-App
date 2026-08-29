import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

export type SearchCursorPayload = {
  v: 1;
  sort: string;
  filterHash: string;
  position: string;
  expiresAt: number;
};

export class InvalidSearchCursorError extends Error {
  constructor() { super('INVALID_CURSOR'); }
}

function b64(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function unb64(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/** Stable hash for already-normalized query filters. */
export function canonicalFilterHash(filters: Record<string, unknown>): string {
  const canonical = Object.keys(filters).sort().map((key) => {
    const value = filters[key];
    return `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`;
  }).join('&');
  return createHash('sha256').update(canonical).digest('hex');
}

export function signSearchCursor(payload: SearchCursorPayload, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('SEARCH_CURSOR_SECRET_TOO_SHORT');
  const encoded = b64(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(encoded).digest();
  return `v1.${encoded}.${b64(signature)}`;
}

export function verifySearchCursor(token: string, secret: string, now = Date.now()): SearchCursorPayload {
  try {
    if (!secret || secret.length < 32) throw new InvalidSearchCursorError();
    const [version, encoded, signature] = token.split('.');
    if (version !== 'v1' || !encoded || !signature) throw new InvalidSearchCursorError();
    const expected = createHmac('sha256', secret).update(encoded).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new InvalidSearchCursorError();
    }
    const payload = JSON.parse(unb64(encoded)) as SearchCursorPayload;
    if (payload.v !== 1 || typeof payload.sort !== 'string' || typeof payload.filterHash !== 'string' ||
        typeof payload.position !== 'string' || !Number.isFinite(payload.expiresAt) ||
        payload.expiresAt <= now) throw new InvalidSearchCursorError();
    return payload;
  } catch (error) {
    if (error instanceof InvalidSearchCursorError) throw error;
    throw new InvalidSearchCursorError();
  }
}

export function assertPageSize(value: number | undefined, max = 50, fallback = 20): number {
  const pageSize = value ?? fallback;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > max) throw new Error('VALIDATION_ERROR');
  return pageSize;
}