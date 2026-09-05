const { Pool } = require('../04-nestjs-api/04-nestjs-api-app/node_modules/pg');
const fs = require('fs');

const env = fs.readFileSync('./04-nestjs-api/04-nestjs-api-app/.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim();
const pool = new Pool({ connectionString: dbUrl });

async function main() {
  const hrEmails = ['visheshmahale1@gmail.com', 'visheshmahale102@gmail.com'];

  console.log('Starting cleanup of Company and HR records...');

  // Disable user triggers on append-only audit tables, candidate_profiles, and users
  await pool.query('ALTER TABLE public.audit_logs DISABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.user_security_log DISABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.login_history DISABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.candidate_profiles DISABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.users DISABLE TRIGGER USER');

  // 1. Delete Company Invitations
  const delInv = await pool.query('DELETE FROM public.company_invitations');
  console.log(`Deleted ${delInv.rowCount} company_invitations.`);

  // 2. Delete Outbox Events
  const delOutbox = await pool.query("DELETE FROM public.outbox_events");
  console.log(`Deleted ${delOutbox.rowCount} outbox_events.`);

  // 3. Delete Audit Logs
  const delAudit = await pool.query('DELETE FROM public.audit_logs');
  console.log(`Deleted ${delAudit.rowCount} audit_logs.`);

  // 4. Delete Company Members
  const delMem = await pool.query('DELETE FROM public.company_members');
  console.log(`Deleted ${delMem.rowCount} company_members.`);

  // 5. Delete Teams, Departments, Branches, Settings
  const delTeams = await pool.query('DELETE FROM public.teams');
  console.log(`Deleted ${delTeams.rowCount} teams.`);

  const delDepts = await pool.query('DELETE FROM public.departments');
  console.log(`Deleted ${delDepts.rowCount} departments.`);

  const delBranches = await pool.query('DELETE FROM public.company_branches');
  console.log(`Deleted ${delBranches.rowCount} company_branches.`);

  const delSettings = await pool.query('DELETE FROM public.company_settings');
  console.log(`Deleted ${delSettings.rowCount} company_settings.`);

  // 6. Delete Companies
  const delComp = await pool.query('DELETE FROM public.companies');
  console.log(`Deleted ${delComp.rowCount} companies.`);

  // 7. Delete User logs, candidate_profiles & login history for HR users
  const delSec = await pool.query('DELETE FROM public.user_security_log WHERE user_id IN (SELECT id FROM public.users WHERE email = ANY($1::text[]))', [hrEmails]);
  console.log(`Deleted ${delSec.rowCount} user_security_log.`);

  const delLogin = await pool.query('DELETE FROM public.login_history WHERE user_id IN (SELECT id FROM public.users WHERE email = ANY($1::text[]))', [hrEmails]);
  console.log(`Deleted ${delLogin.rowCount} login_history.`);

  const delCand = await pool.query('DELETE FROM public.candidate_profiles WHERE user_id IN (SELECT id FROM public.users WHERE email = ANY($1::text[]))', [hrEmails]);
  console.log(`Deleted ${delCand.rowCount} candidate_profiles.`);

  // 8. Delete HR Users
  const delUsers = await pool.query('DELETE FROM public.users WHERE email = ANY($1::text[])', [hrEmails]);
  console.log(`Deleted ${delUsers.rowCount} HR users (${hrEmails.join(', ')}).`);

  // Re-enable user triggers
  await pool.query('ALTER TABLE public.audit_logs ENABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.user_security_log ENABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.login_history ENABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.candidate_profiles ENABLE TRIGGER USER');
  await pool.query('ALTER TABLE public.users ENABLE TRIGGER USER');

  console.log('Cleanup completed successfully!');
  await pool.end();
}

main().catch(async (err) => {
  console.error('Error during cleanup:', err);
  try {
    await pool.query('ALTER TABLE public.audit_logs ENABLE TRIGGER USER');
    await pool.query('ALTER TABLE public.user_security_log ENABLE TRIGGER USER');
    await pool.query('ALTER TABLE public.login_history ENABLE TRIGGER USER');
    await pool.query('ALTER TABLE public.candidate_profiles ENABLE TRIGGER USER');
    await pool.query('ALTER TABLE public.users ENABLE TRIGGER USER');
  } catch {}
  pool.end();
  process.exit(1);
});
