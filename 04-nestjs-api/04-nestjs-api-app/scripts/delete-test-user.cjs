require('dotenv').config();
const { Client } = require('pg');
const { loadConfig } = require('../dist/src/infrastructure/config/config');

const config = loadConfig(process.env);
const targetEmail = process.argv[2] || 'visheshmahale1994@gmail.com';

async function deleteTestUser() {
  console.log(`Deleting test user: ${targetEmail}...`);

  const pgClient = new Client({ connectionString: config.DATABASE_URL });
  await pgClient.connect();

  const result = await pgClient.query('SELECT id FROM public.users WHERE email = $1', [targetEmail]);
  const userId = result.rows[0]?.id;

  if (userId) {
    console.log(`Deleting from Supabase Auth Admin API (User ID: ${userId})...`);
    const res = await fetch(`${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY}`,
      },
    });

    if (res.ok) {
      console.log('Successfully deleted user from Supabase Auth.');
    } else {
      console.log('Supabase Auth delete response status:', res.status);
    }

    console.log(`Deleting from public.users table...`);
    await pgClient.query('DELETE FROM public.users WHERE id = $1', [userId]);
    console.log('Successfully deleted from public.users table.');
  } else {
    console.log(`User ${targetEmail} not found in public.users.`);
  }

  await pgClient.end();
  console.log('User cleanup finished.');
}

deleteTestUser().catch(console.error);
