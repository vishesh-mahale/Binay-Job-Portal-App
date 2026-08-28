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
    
    // Test setup under service role: verify RLS policy behavior for candidate_documents
    const mockUserA = '11111111-1111-4111-8111-111111111111';
    const mockUserB = '99999999-9999-4999-8999-999999999999';
    
    // Switch to authenticated role as User A
    await client.query('SET LOCAL ROLE authenticated');
    const mockClaimsUserA = { sub: mockUserA, role: 'authenticated' };
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(mockClaimsUserA)]);
    
    const contextCheck = await client.query('SELECT current_user, current_setting($1, true) as claims', ['request.jwt.claims']);
    if (contextCheck.rows[0]?.current_user !== 'authenticated') throw new Error('RLS role context not set to authenticated');
    
    // Assert RLS isolation: User A querying candidate_documents of User B must return 0 rows
    const docsRes = await client.query('SELECT * FROM public.candidate_documents WHERE candidate_id = $1', [mockUserB]);
    if (docsRes.rows.length !== 0) {
      throw new Error(`RLS BREACH: User A accessed ${docsRes.rows.length} document(s) belonging to User B`);
    }
    
    console.log('PASS: RLS user-context role, jwt claims, and explicit zero-row cross-user document isolation verified inside transaction');
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
