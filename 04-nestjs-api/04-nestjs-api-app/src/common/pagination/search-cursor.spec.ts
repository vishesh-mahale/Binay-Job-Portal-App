import { assertPageSize, canonicalFilterHash, InvalidSearchCursorError, signSearchCursor, verifySearchCursor } from './search-cursor';

describe('search cursor', () => {
  const secret = 's'.repeat(32);
  const payload = { v: 1 as const, sort: 'relevance', filterHash: canonicalFilterHash({ q: 'java', mode: 'hybrid' }), position: '2026-08-28T00:00:00Z|abc', expiresAt: 2_000 };

  it('signs and verifies a cursor and canonical hash is order independent', () => {
    const token = signSearchCursor(payload, secret);
    expect(verifySearchCursor(token, secret, 1_000)).toEqual(payload);
    expect(canonicalFilterHash({ mode: 'hybrid', q: 'java' })).toBe(payload.filterHash);
  });

  it('rejects tampering, wrong secret and expiry', () => {
    const token = signSearchCursor(payload, secret);
    expect(() => verifySearchCursor(`${token}x`, secret, 1_000)).toThrow(InvalidSearchCursorError);
    expect(() => verifySearchCursor(token, 'x'.repeat(32), 1_000)).toThrow(InvalidSearchCursorError);
    expect(() => verifySearchCursor(token, secret, 2_000)).toThrow(InvalidSearchCursorError);
  });

  it('enforces approved page bounds', () => {
    expect(assertPageSize(undefined)).toBe(20);
    expect(assertPageSize(50)).toBe(50);
    expect(() => assertPageSize(51)).toThrow('VALIDATION_ERROR');
  });
});