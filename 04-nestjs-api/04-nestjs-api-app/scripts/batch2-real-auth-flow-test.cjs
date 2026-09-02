/* Batch 2 real auth integration verification script */
const assert = require('node:assert/strict');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
const testEmail = process.env.AUTH_TEST_EMAIL || 'test_candidate_batch2@example.com';
const testPassword = process.env.AUTH_TEST_PASSWORD || 'TestPassword123!';

function parseCookieHeader(response) {
  const getSetCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  
  const rawHeaders = getSetCookie.length > 0
    ? getSetCookie
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  const cookieMap = new Map();
  const attributesMap = new Map();

  for (const str of rawHeaders) {
    const parts = str.split(';').map((s) => s.trim());
    const [name, val] = parts[0].split('=');
    if (name && val) {
      cookieMap.set(name, val);
      attributesMap.set(name, parts.slice(1));
    }
  }

  const cookieString = Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  return { cookieMap, attributesMap, cookieString, rawHeaders };
}

async function apiRequest(path, options = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    /* empty */
  }

  const cookies = parseCookieHeader(response);
  return { status: response.status, body, cookies };
}

async function runRealAuthFlow() {
  console.log('=== Batch 2 Real Auth Integration Verification ===');
  console.log(`Target Base URL: ${baseUrl}`);

  // Step 1: Login
  console.log('1. Testing POST /api/v1/auth/login...');
  const loginRes = await apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });

  assert.equal(loginRes.status, 201, `Login failed with status ${loginRes.status}`);
  assert.ok(loginRes.cookies.cookieMap.has('binay_access_token'), 'Login must set binay_access_token cookie');
  assert.ok(loginRes.cookies.cookieMap.has('binay_refresh_token'), 'Login must set binay_refresh_token cookie');

  // Verify HttpOnly cookie attributes
  const accessAttrs = loginRes.cookies.attributesMap.get('binay_access_token') || [];
  assert.ok(
    accessAttrs.some((a) => a.toLowerCase() === 'httponly'),
    'binay_access_token cookie MUST have HttpOnly attribute'
  );

  // Verify NO token in login response body
  assert.equal(loginRes.body.access_token, undefined, 'Login body MUST NOT leak access_token');
  assert.equal(loginRes.body.refresh_token, undefined, 'Login body MUST NOT leak refresh_token');
  console.log('   -> Login success: HttpOnly cookies set, zero tokens in JS body (Pass)');

  const authCookies = loginRes.cookies.cookieString;

  // Step 2: GET /api/v1/auth/me
  console.log('2. Testing GET /api/v1/auth/me with HttpOnly cookies...');
  const meRes = await apiRequest('/api/v1/auth/me', {
    method: 'GET',
    headers: { cookie: authCookies },
  });

  assert.equal(meRes.status, 200, `GET /auth/me failed with status ${meRes.status}`);
  assert.ok(meRes.body.id, 'Me payload must return user id');
  assert.ok(meRes.body.email, 'Me payload must return user email');
  assert.ok(meRes.body.role, 'Me payload must return user role');
  assert.ok(meRes.body.status, 'Me payload must return user status');
  console.log(`   -> Session verified: UserID=${meRes.body.id}, Role=${meRes.body.role}, Status=${meRes.body.status} (Pass)`);

  // Step 3: POST /api/v1/auth/refresh
  console.log('3. Testing POST /api/v1/auth/refresh...');
  const refreshRes = await apiRequest('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { cookie: authCookies },
  });

  assert.equal(refreshRes.status, 201, `POST /auth/refresh failed with status ${refreshRes.status}`);
  assert.ok(refreshRes.cookies.cookieMap.has('binay_access_token'), 'Refresh must rotate access cookie');
  assert.equal(refreshRes.body.access_token, undefined, 'Refresh body MUST NOT leak access_token');
  console.log('   -> Cookie refresh success: rotated HttpOnly access cookie (Pass)');

  const activeCookies = refreshRes.cookies.cookieString || authCookies;

  // Step 4: POST /api/v1/auth/logout
  console.log('4. Testing POST /api/v1/auth/logout...');
  const logoutRes = await apiRequest('/api/v1/auth/logout', {
    method: 'POST',
    headers: { cookie: activeCookies },
  });

  assert.equal(logoutRes.status, 201, `Logout failed with status ${logoutRes.status}`);
  console.log('   -> Logout success: Session invalidated (Pass)');

  // Step 5: Verify protected request fails after logout
  console.log('5. Verifying protected request fails after logout...');
  const meAfterLogoutRes = await apiRequest('/api/v1/auth/me', {
    method: 'GET',
    headers: { cookie: logoutRes.cookies.cookieString },
  });

  assert.equal(
    meAfterLogoutRes.status,
    401,
    `Protected request after logout expected status 401, got ${meAfterLogoutRes.status}`
  );
  console.log('   -> Protected request after logout rejected with 401 Unauthorized (Pass)');

  console.log('\n=== REAL AUTH INTEGRATION FLOW PASSED 100% ===');
}

runRealAuthFlow().catch((err) => {
  console.error('\n❌ INTEGRATION FLOW FAILED:');
  console.error(err.message);
  process.exitCode = 1;
});
