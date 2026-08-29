import { assertAllowedProvider, assertExactRedirect, parseAllowlist } from './oauth-config';

test('parses and normalizes an explicit provider allowlist', () => {
  expect(parseAllowlist(' Google, github ,,')).toEqual(['google', 'github']);
  expect(assertAllowedProvider(' GOOGLE ', ['google'])).toBe('google');
});
test('rejects providers outside the allowlist', () => {
  expect(() => assertAllowedProvider('facebook', ['google'])).toThrow('OAUTH_PROVIDER_NOT_ALLOWED');
});
test('requires an exact redirect URI match', () => {
  expect(assertExactRedirect('https://api.example/callback', 'https://api.example/callback')).toBe('https://api.example/callback');
  expect(() => assertExactRedirect('https://evil.example/callback', 'https://api.example/callback')).toThrow('OAUTH_REDIRECT_NOT_ALLOWED');
});