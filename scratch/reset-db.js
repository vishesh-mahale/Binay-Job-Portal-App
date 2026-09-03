const { Client } = require('C:/Users/ADMIN/Desktop/Vishesh/Binay-Job-Portal-App/04-nestjs-api/04-nestjs-api-app/node_modules/pg');

const DB_URL = 'postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

async function resetDatabase() {
  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();
  console.log('Connected to PostgreSQL Database for reset...');

  try {
    console.log('Clearing company members, teams, departments, and branches...');
    await pgClient.query("DELETE FROM public.company_members");
    await pgClient.query("DELETE FROM public.teams");
    await pgClient.query("DELETE FROM public.departments");
    await pgClient.query("DELETE FROM public.company_branches");

    console.log('Clearing auth.users (cascades or clears user sessions)...');
    await pgClient.query("DELETE FROM auth.users");

    console.log('Soft-deleting companies and public.users to bypass triggers...');
    await pgClient.query("UPDATE public.companies SET deleted_at = NOW() WHERE deleted_at IS NULL");
    await pgClient.query("UPDATE public.users SET deleted_at = NOW(), status = 'suspended' WHERE deleted_at IS NULL");

    console.log('\n======================================================');
    console.log('✅ DATABASE RESET COMPLETED SUCCESSFULLY!');
    console.log('   All active users, companies & memberships reset.');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ DB RESET ERROR:', err);
  } finally {
    await pgClient.end();
  }
}

resetDatabase();
