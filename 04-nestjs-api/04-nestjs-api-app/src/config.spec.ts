import { loadConfig } from './config';
test('fails when trusted configuration is missing', () => { expect(() => loadConfig({})).toThrow(); });
const baseEnv = { DATABASE_URL: 'postgres://user:pass@example.com/db', SUPABASE_JWT_SECRET: '1234567890123456' };
test('parses the explicit CORS allowlist and proxy flag', () => {
  expect(loadConfig({ ...baseEnv, CORS_ORIGINS: 'https://app.example, https://admin.example', TRUST_PROXY: 'true' })).toMatchObject({ CORS_ORIGINS: 'https://app.example, https://admin.example', TRUST_PROXY: true });
});
test('keeps proxy trust disabled by default', () => {
  expect(loadConfig(baseEnv).TRUST_PROXY).toBe(false);
});
test('applies safe OAuth state TTL default', () => {
  expect(loadConfig(baseEnv).OAUTH_STATE_TTL_SECONDS).toBe(600);
});
test('rejects a weak OAuth state secret when configured', () => {
  expect(() => loadConfig({ ...baseEnv, OAUTH_STATE_SECRET: 'too-short' })).toThrow();
});
test('accepts validated OAuth URLs and TTL', () => {
  expect(loadConfig({ ...baseEnv, OAUTH_CALLBACK_URL: 'https://api.example.com/api/v1/auth/oauth/callback', OAUTH_FRONTEND_SUCCESS_URL: 'https://app.example.com/dashboard', OAUTH_FRONTEND_ERROR_URL: 'https://app.example.com/auth/error', OAUTH_STATE_SECRET: '12345678901234567890123456789012', OAUTH_STATE_TTL_SECONDS: '900' })).toMatchObject({ OAUTH_STATE_TTL_SECONDS: 900 });
});
