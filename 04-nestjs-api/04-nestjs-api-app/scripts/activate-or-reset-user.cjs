require('dotenv').config();
const { Client } = require('pg');
const { loadConfig } = require('../dist/src/infrastructure/config/config');

const config = loadConfig(process.env);
const targetEmail = process.argv[2] || 'visheshmahale1994@gmail.com';
const newPassword = process.argv[3] || 'Password123!';

async function activateUser() {
  console.log(`Activating test account for email: ${targetEmail}...`);

  const pgClient = new Client({ connectionString: config.DATABASE_URL });
  await pgClient.connect();

  const result = await pgClient.query('SELECT id FROM public.users WHERE email = $1', [targetEmail]);
  const userId = result.rows[0]?.id;

  if (!userId) {
    console.log(`User ${targetEmail} not found in public.users.`);
    await pgClient.end();
    return;
  }

  console.log(`1. Updating Supabase Auth password & confirming email for user ${userId}...`);
  const res = await fetch(`${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SECRET_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      password: newPassword,
      email_confirm: true,
    }),
  });

  const body = await res.json();
  if (res.ok) {
    console.log('   -> Supabase Auth updated successfully.');
  } else {
    console.error('   -> Supabase Auth update failed:', res.status, body);
  }

  console.log(`2. Updating public.users table status to 'active'...`);
  await pgClient.query("UPDATE public.users SET status = 'active', updated_at = NOW() WHERE id = $1", [userId]);
  console.log(`   -> public.users status updated to 'active'.`);

  await pgClient.end();
  console.log(`\n✅ User ${targetEmail} is now ACTIVE and ready for login with password: ${newPassword}`);
}

activateUser().catch(console.error);
