/* Opt-in password-auth HTTP smoke test. Requires a dedicated test account. */
const assert = require('node:assert/strict');

if (process.env.RUN_PASSWORD_AUTH_HTTP_SMOKE !== 'true') {
  console.log('SKIPPED: set RUN_PASSWORD_AUTH_HTTP_SMOKE=true to run password-auth smoke');
  process.exit(0);
}

const baseUrl = process.env.API_BASE_URL;
const email = process.env.AUTH_TEST_EMAIL;
const password = process.env.AUTH_TEST_PASSWORD;
if (!baseUrl || !email || !password) throw new Error('API_BASE_URL, AUTH_TEST_EMAIL and AUTH_TEST_PASSWORD are required');

function cookieHeader(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return cookies.map((value) => value.split(';', 1)[0]).join('; ');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers ?? {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* empty response */ }
  return { response, body, setCookies: cookieHeader(response) };
}

async function main() {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 201, `login failed: ${login.response.status}`);
  assert.ok(login.setCookies.includes('collabfor_access_token='), 'login must set access cookie');
  assert.ok(login.setCookies.includes('collabfor_refresh_token='), 'login must set refresh cookie');

  const me = await request('/api/v1/auth/me', { headers: { cookie: login.setCookies } });
  assert.equal(me.response.status, 200, `me failed: ${me.response.status}`);
  assert.ok(me.body && typeof me.body.id === 'string', 'me must return user id');

  const refresh = await request('/api/v1/auth/refresh', { method: 'POST', headers: { cookie: login.setCookies } });
  assert.equal(refresh.response.status, 201, `refresh failed: ${refresh.response.status}`);
  assert.ok(refresh.setCookies.includes('collabfor_access_token='), 'refresh must rotate access cookie');

  const refreshedCookies = refresh.setCookies || login.setCookies;
  const logout = await request('/api/v1/auth/logout', { method: 'POST', headers: { cookie: `${login.setCookies}; ${refreshedCookies}` } });
  assert.equal(logout.response.status, 201, `logout failed: ${logout.response.status}`);
  console.log('Password auth HTTP smoke passed: login → me → refresh → logout');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
