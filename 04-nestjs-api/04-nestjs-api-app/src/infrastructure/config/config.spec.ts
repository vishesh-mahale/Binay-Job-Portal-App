import { loadConfig } from './config';
test('fails when trusted configuration is missing', () => { expect(() => loadConfig({})).toThrow(); });
const baseEnv = { DATABASE_URL: 'postgres://user:pass@example.com/db', SUPABASE_JWT_SECRET: '1234567890123456', FRONTEND_URL: 'http://localhost:3001' };
test('parses the explicit CORS allowlist and proxy flag', () => {
  expect(loadConfig({ ...baseEnv, CORS_ORIGINS: 'https://app.example, https://admin.example', TRUST_PROXY: 'true' })).toMatchObject({ CORS_ORIGINS: 'https://app.example, https://admin.example', TRUST_PROXY: true });
});
test('keeps proxy trust disabled by default', () => {
  expect(loadConfig(baseEnv).TRUST_PROXY).toBe(false);
});
test('applies safe OAuth state TTL default', () => {
  expect(loadConfig(baseEnv).OAUTH_STATE_TTL_SECONDS).toBe(600);
});
test('defaults AUTH_AUTO_CONFIRM_EMAIL to true and parses string/boolean values', () => {
  expect(loadConfig(baseEnv).AUTH_AUTO_CONFIRM_EMAIL).toBe(true);
  expect(loadConfig({ ...baseEnv, AUTH_AUTO_CONFIRM_EMAIL: 'false' }).AUTH_AUTO_CONFIRM_EMAIL).toBe(false);
  expect(loadConfig({ ...baseEnv, AUTH_AUTO_CONFIRM_EMAIL: '0' }).AUTH_AUTO_CONFIRM_EMAIL).toBe(false);
  expect(loadConfig({ ...baseEnv, AUTH_AUTO_CONFIRM_EMAIL: 'true' }).AUTH_AUTO_CONFIRM_EMAIL).toBe(true);
  expect(loadConfig({ ...baseEnv, AUTH_AUTO_CONFIRM_EMAIL: '1' }).AUTH_AUTO_CONFIRM_EMAIL).toBe(true);
});
test('rejects a weak OAuth state secret when configured', () => {
  expect(() => loadConfig({ ...baseEnv, OAUTH_STATE_SECRET: 'too-short' })).toThrow();
});
test('accepts validated OAuth URLs and TTL', () => {
  expect(loadConfig({ ...baseEnv, OAUTH_CALLBACK_URL: 'https://api.example.com/api/v1/auth/oauth/callback', OAUTH_FRONTEND_SUCCESS_URL: 'https://app.example.com/dashboard', OAUTH_FRONTEND_ERROR_URL: 'https://app.example.com/auth/error', OAUTH_STATE_SECRET: '12345678901234567890123456789012', OAUTH_STATE_TTL_SECONDS: '900' })).toMatchObject({ OAUTH_STATE_TTL_SECONDS: 900 });
});
test('enforces mandatory issuer and audience in preprod and production environments', () => {
  const prodEnv = { ...baseEnv, NODE_ENV: 'production', AUTH_AUTO_CONFIRM_EMAIL: 'true' };
  expect(() => loadConfig(prodEnv)).toThrow();
  expect(() => loadConfig({ ...prodEnv, NODE_ENV: 'preprod' })).toThrow();
  expect(() => loadConfig({ ...prodEnv, SUPABASE_JWT_ISSUER: 'https://auth.example.com', SUPABASE_JWT_AUDIENCE: 'authenticated' })).toThrow(/SUPABASE_JWKS_URL or SUPABASE_URL/);
  expect(loadConfig({ ...prodEnv, SUPABASE_JWT_ISSUER: 'https://auth.example.com', SUPABASE_JWT_AUDIENCE: 'authenticated', SUPABASE_URL: 'https://project.supabase.co' })).toMatchObject({ SUPABASE_URL: 'https://project.supabase.co', FRONTEND_URL: 'http://localhost:3001' });
});
test('requires explicit AUTH_AUTO_CONFIRM_EMAIL in preprod and production environments', () => {
  const prodEnvNoAutoConfirm = {
    ...baseEnv,
    NODE_ENV: 'production',
    SUPABASE_JWT_ISSUER: 'https://auth.example.com',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    SUPABASE_URL: 'https://project.supabase.co'
  };
  expect(() => loadConfig(prodEnvNoAutoConfirm)).toThrow(/AUTH_AUTO_CONFIRM_EMAIL must be explicitly set/);
  expect(loadConfig({ ...prodEnvNoAutoConfirm, AUTH_AUTO_CONFIRM_EMAIL: 'true' }).AUTH_AUTO_CONFIRM_EMAIL).toBe(true);
});
test('enforces mandatory FRONTEND_URL across all environments', () => {
  const { FRONTEND_URL, ...noFrontendEnv } = baseEnv;
  expect(() => loadConfig(noFrontendEnv)).toThrow();
});
test('accepts JWKS-only configuration and rejects missing verification material', () => {
  const jwksEnv = { DATABASE_URL: baseEnv.DATABASE_URL, FRONTEND_URL: baseEnv.FRONTEND_URL, SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json' };
  expect(loadConfig(jwksEnv)).toMatchObject({ SUPABASE_JWKS_URL: jwksEnv.SUPABASE_JWKS_URL });
  expect(() => loadConfig({ DATABASE_URL: baseEnv.DATABASE_URL, FRONTEND_URL: baseEnv.FRONTEND_URL })).toThrow(/Configure SUPABASE/);
});