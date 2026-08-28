/* Rollback-safe PostgreSQL RLS user-context integration smoke test with live fixtures. */
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

    // 1. Create test users and candidate profile fixtures under postgres/service role.
    // uploaded_documents is intentionally default-deny for direct authenticated reads;
    // candidate_profiles is the approved personal-read RLS surface.
    const mockUserA = '11111111-1111-4111-8111-111111111111';
    const mockUserB = '99999999-9999-4999-8999-999999999999';

    await client.query(`
      INSERT INTO public.users (id, email, password_hash, role, status)
      VALUES 
        ($1, 'user-a-rls-smoke@example.com', 'hash', 'candidate', 'active'),
        ($2, 'user-b-rls-smoke@example.com', 'hash', 'candidate', 'active')
      ON CONFLICT (id) DO NOTHING
    `, [mockUserA, mockUserB]);

    await client.query(`
      INSERT INTO public.candidate_profiles (id, user_id, professional_title)
      VALUES
        ('a1111111-1111-4111-8111-111111111111', $1, 'RLS smoke User A'),
        ('b2222222-2222-4222-8222-222222222222', $2, 'RLS smoke User B')
      ON CONFLICT (id) DO NOTHING
    `, [mockUserA, mockUserB]);

    // 2. Switch to authenticated role as User A
    await client.query('SET LOCAL ROLE authenticated');
    const mockClaimsUserA = { sub: mockUserA, role: 'authenticated' };
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(mockClaimsUserA)]);

    const contextCheck = await client.query('SELECT current_user, current_setting($1, true) as claims', ['request.jwt.claims']);
    if (contextCheck.rows[0]?.current_user !== 'authenticated') throw new Error('RLS role context not set to authenticated');

    // 3. Assert RLS isolation: User A CAN read User A's candidate profile (1 row)
    const ownProfiles = await client.query('SELECT * FROM public.candidate_profiles WHERE user_id = $1', [mockUserA]);
    if (ownProfiles.rows.length !== 1) {
      throw new Error(`RLS ERROR: User A could not read own candidate profile (expected 1 row, got ${ownProfiles.rows.length})`);
    }

    // 4. Assert RLS isolation: User A CANNOT read User B's candidate profile (must return 0 rows)
    const otherProfiles = await client.query('SELECT * FROM public.candidate_profiles WHERE user_id = $1', [mockUserB]);
    if (otherProfiles.rows.length !== 0) {
      throw new Error(`RLS BREACH: User A accessed ${otherProfiles.rows.length} candidate profile(s) belonging to User B`);
    }

    console.log('PASS: RLS user-context role, jwt claims, own-row candidate_profiles read (1 row) and cross-user isolation (0 rows) verified with live fixtures inside transaction');
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
