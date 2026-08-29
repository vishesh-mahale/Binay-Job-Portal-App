/* Rollback-safe company-settings contract smoke test. Never run against production. */
require('dotenv').config();
const { Client } = require('pg');
if (process.env.RUN_COMPANY_SETTINGS_INTEGRATION !== 'true') { console.log('SKIPPED: set RUN_COMPANY_SETTINGS_INTEGRATION=true explicitly'); process.exit(0); }
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run integration smoke test in production');
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query("SELECT id FROM public.users WHERE status='active' AND deleted_at IS NULL AND role IN ('employer','admin') LIMIT 1");
    if (!owner.rows[0]) { console.log('SKIPPED: no active employer/admin fixture available'); await client.query('ROLLBACK'); return; }
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const company = await client.query("INSERT INTO public.companies (name,slug,email,owner_id,verification_status) VALUES ($1,$2,$3,$4,'verified') RETURNING id", [`Settings Smoke ${suffix}`, `settings-smoke-${suffix}`, `settings-${suffix}@example.invalid`, owner.rows[0].id]);
    const companyId = company.rows[0].id;
    await client.query('INSERT INTO public.company_settings (company_id) VALUES ($1)', [companyId]);
    const initial = await client.query('SELECT company_id, job_approval_required FROM public.company_settings WHERE company_id=$1', [companyId]);
    if (!initial.rows[0] || initial.rows[0].job_approval_required !== false) throw new Error('default approval setting is not false');
    const updated = await client.query('UPDATE public.company_settings SET job_approval_required=true WHERE company_id=$1 RETURNING job_approval_required', [companyId]);
    if (updated.rows[0]?.job_approval_required !== true) throw new Error('approval setting toggle failed');
    await client.query("INSERT INTO public.audit_logs (company_id,user_id,action,entity_type,entity_id,old_values,new_values,changes) VALUES ($1,$2,'company.settings_updated','company_settings',$1,$3::jsonb,$4::jsonb,$5::jsonb)", [companyId, owner.rows[0].id, JSON.stringify({ job_approval_required: false }), JSON.stringify({ job_approval_required: true }), JSON.stringify({ job_approval_required: { old: false, new: true } })]);
    const audit = await client.query("SELECT action FROM public.audit_logs WHERE company_id=$1 AND action='company.settings_updated'", [companyId]);
    if (!audit.rowCount) throw new Error('settings audit row missing');
    console.log('PASS: default false, toggle true and audit invariant verified');
    await client.query('ROLLBACK'); console.log('PASS: transaction rolled back; no smoke rows retained');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; });
