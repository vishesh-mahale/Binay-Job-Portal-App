require('dotenv').config();
const { Client } = require('pg');
const { loadConfig } = require('../dist/src/infrastructure/config/config');

const config = loadConfig(process.env);

async function createTestUser() {
  const email = process.env.AUTH_TEST_EMAIL || 'test_candidate_batch2@example.com';
  const password = process.env.AUTH_TEST_PASSWORD || 'TestPassword123!';

  console.log(`Creating active test user via Supabase Admin API: ${email}`);

  const res = await fetch(`${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  const body = await res.json();
  const userId = body.id || body.user?.id;
  console.log(`Supabase User ID: ${userId || 'already created or exists'}`);

  const pgClient = new Client({ connectionString: config.DATABASE_URL });
  await pgClient.connect();

  let finalUserId = userId;
  if (!finalUserId) {
    const existing = await pgClient.query('SELECT id FROM public.users WHERE email = $1', [email]);
    if (existing.rows[0]) {
      finalUserId = existing.rows[0].id;
    }
  }

  if (finalUserId) {
    await pgClient.query(
      `INSERT INTO public.users (id, email, first_name, last_name, role, status, created_at, updated_at)
       VALUES ($1, $2, 'TestCandidate', 'BatchTwo', 'candidate', 'active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'active', role = 'candidate', updated_at = NOW()`,
      [finalUserId, email]
    );
    console.log(`Updated public.users table for ${email} with status='active'`);
  }

  await pgClient.end();
  console.log('Test account setup complete.');
}

createTestUser().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
