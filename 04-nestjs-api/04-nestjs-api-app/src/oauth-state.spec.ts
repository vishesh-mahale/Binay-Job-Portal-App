import { openOAuthState, sealOAuthState, statesEqual, type OAuthStatePayload } from './oauth-state';

const payload: OAuthStatePayload = { state: 'state-1', codeVerifier: 'verifier-1', issuedAt: 1000, expiresAt: 2000, keyVersion: 1 };
const secret = '12345678901234567890123456789012';

test('seals and opens an OAuth state payload', () => {
  expect(openOAuthState(sealOAuthState(payload, secret), secret, 1500)).toMatchObject(payload);
});
test('rejects tampered and expired state', () => {
  const token = sealOAuthState(payload, secret);
  expect(() => openOAuthState(`${token}x`, secret, 1500)).toThrow('INVALID_OAUTH_STATE');
  expect(() => openOAuthState(token, secret, 2000)).toThrow('EXPIRED_OAUTH_STATE');
});
test('compares states in constant time', () => {
  expect(statesEqual('abc', 'abc')).toBe(true); expect(statesEqual('abc', 'abd')).toBe(false);
});
