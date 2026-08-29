/* Opt-in, read-only HTTP smoke test. Never runs unless explicitly enabled. */
const assert = require('node:assert/strict');

if (process.env.RUN_IDENTITY_COMPANY_HTTP_SMOKE !== 'true') {
  console.log('SKIPPED: set RUN_IDENTITY_COMPANY_HTTP_SMOKE=true to run this read-only smoke test');
  process.exit(0);
}

const baseUrl = process.env.API_BASE_URL;
const token = process.env.ACCESS_TOKEN;
const companyId = process.env.COMPANY_ID;
const otherCompanyId = process.env.OTHER_COMPANY_ID;
if (!baseUrl || !token || !companyId || !otherCompanyId) throw new Error('API_BASE_URL, ACCESS_TOKEN, COMPANY_ID and OTHER_COMPANY_ID are required');

async function request(path) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  let body = null;
  try { body = await response.json(); } catch { /* empty response */ }
  return { status: response.status, body };
}

async function main() {
  const me = await request('/api/v1/auth/me');
  assert.equal(me.status, 200, `GET /auth/me failed: ${me.status}`);
  assert.ok(me.body && typeof me.body.id === 'string', 'me response must contain a user id');

  const sessions = await request('/api/v1/auth/sessions');
  assert.equal(sessions.status, 200, `GET /auth/sessions failed: ${sessions.status}`);
  assert.ok(Array.isArray(sessions.body), 'sessions response must be an array');

  const ownCompany = await request(`/api/v1/companies/${encodeURIComponent(companyId)}`);
  assert.equal(ownCompany.status, 200, `own company read failed: ${ownCompany.status}`);

  const otherCompany = await request(`/api/v1/companies/${encodeURIComponent(otherCompanyId)}`);
  assert.ok([403, 404].includes(otherCompany.status), `cross-company read must be denied, got ${otherCompany.status}`);
  console.log('Identity/company HTTP smoke checks passed');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
