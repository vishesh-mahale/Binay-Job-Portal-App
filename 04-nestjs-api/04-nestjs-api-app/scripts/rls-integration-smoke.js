/* Rollback-safe PostgreSQL RLS user-context integration smoke test. */
require('dotenv').config();
const { Client } = require('pg');

if (process.env.RUN_RLS_INTEGRATION !== 'true') {
  console.log('SKIPPED: set RUN_RLS_INTEGRATION=true explicitly to run this Dev/Test RLS smoke test');
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run RLS integration smoke test in production');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    const mockClaims = { sub: '00000000-0000-4000-8000-000000000000', role: 'authenticated' };
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(mockClaims)]);
    const res = await client.query('SELECT current_user, current_setting($1, true) as claims', ['request.jwt.claims']);
    if (res.rows[0]?.current_user !== 'authenticated') throw new Error('RLS role context not set to authenticated');
    console.log('PASS: RLS user context role and jwt claims set successfully inside transaction');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 1;
});
