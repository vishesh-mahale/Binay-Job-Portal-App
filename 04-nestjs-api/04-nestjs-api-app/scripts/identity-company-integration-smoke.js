/* Rollback-safe company/member hierarchy smoke test. Dev/Test only. */
require('dotenv').config();
const { Client } = require('pg');

if (process.env.RUN_IDENTITY_COMPANY_INTEGRATION !== 'true') {
  console.log('SKIPPED: set RUN_IDENTITY_COMPANY_INTEGRATION=true explicitly to run this Dev/Test smoke test');
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run identity/company integration smoke test in production');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const owner = await client.query(`SELECT id FROM public.users WHERE role='employer' AND status='active' AND deleted_at IS NULL LIMIT 1`);
    const member = await client.query(`SELECT id FROM public.users WHERE role='candidate' AND status='active' AND deleted_at IS NULL AND id <> $1 LIMIT 1`, [owner.rows[0]?.id]);
    let outsider = await client.query(`SELECT id FROM public.users WHERE status='active' AND deleted_at IS NULL AND id <> $1 AND id <> $2 LIMIT 1`, [owner.rows[0]?.id, member.rows[0]?.id]);
    if (!outsider.rows[0]) {
      outsider = await client.query(`INSERT INTO public.users (id, email, first_name, last_name, role, status) VALUES (gen_random_uuid(), $1, 'Smoke', 'Outsider', 'candidate', 'active') RETURNING id`, [`identity-smoke-${suffix}@example.invalid`]);
    }
    if (!owner.rows[0] || !member.rows[0] || !outsider.rows[0]) {
      console.log('SKIPPED: active employer and two distinct non-deleted user fixtures are required');
      await client.query('ROLLBACK');
      return;
    }

    const company = await client.query(`
      INSERT INTO public.companies (name, slug, owner_id, email)
      VALUES ($1, $2, $3, $4) RETURNING id, owner_id`,
      [`Integration Smoke ${suffix}`, `integration-smoke-${suffix}`, owner.rows[0].id, `smoke-${suffix}@example.invalid`]);
    const companyId = company.rows[0].id;
    const ownerMember = await client.query(`
      INSERT INTO public.company_members (company_id, user_id, is_active, joined_at)
      VALUES ($1, $2, true, NOW()) RETURNING id`, [companyId, owner.rows[0].id]);
    const targetMember = await client.query(`
      INSERT INTO public.company_members (company_id, user_id, is_active, joined_at)
      VALUES ($1, $2, true, NOW()) RETURNING id`, [companyId, member.rows[0].id]);
    const branch = await client.query(`
      INSERT INTO public.company_branches (company_id, name, city, country)
      VALUES ($1, 'Smoke HQ', 'Pune', 'IN') RETURNING id`, [companyId]);
    const department = await client.query(`
      INSERT INTO public.departments (company_id, name)
      VALUES ($1, 'Smoke Engineering') RETURNING id`, [companyId]);
    const team = await client.query(`
      INSERT INTO public.teams (department_id, name)
      VALUES ($1, 'Smoke Platform') RETURNING id`, [department.rows[0].id]);
    await client.query(`
      UPDATE public.company_members
      SET branch_id=$1, department_id=$2, team_id=$3
      WHERE id=$4 AND company_id=$5`, [branch.rows[0].id, department.rows[0].id, team.rows[0].id, targetMember.rows[0].id, companyId]);
    await client.query(`UPDATE public.teams SET lead_member_id=$1 WHERE id=$2`, [targetMember.rows[0].id, team.rows[0].id]);
    await client.query(`UPDATE public.departments SET head_member_id=$1 WHERE id=$2`, [targetMember.rows[0].id, department.rows[0].id]);

    const hierarchy = await client.query(`
      SELECT c.owner_id, cm.user_id, b.company_id AS branch_company_id,
             d.company_id AS department_company_id, t.department_id AS team_department_id,
             cm.branch_id, cm.department_id AS member_department_id, cm.team_id,
             t.lead_member_id, d.head_member_id
      FROM public.companies c
      JOIN public.company_members cm ON cm.company_id=c.id AND cm.id=$2
      JOIN public.company_branches b ON b.id=cm.branch_id
      JOIN public.departments d ON d.id=cm.department_id
      JOIN public.teams t ON t.id=cm.team_id
      WHERE c.id=$1`, [companyId, targetMember.rows[0].id]);
    const row = hierarchy.rows[0];
    if (!row || String(row.owner_id) !== String(owner.rows[0].id) || String(row.branch_company_id) !== String(companyId) || String(row.department_company_id) !== String(companyId)
      || String(row.member_department_id) !== String(row.team_department_id)
      || String(row.lead_member_id) !== String(targetMember.rows[0].id)
      || String(row.head_member_id) !== String(targetMember.rows[0].id)) {
      throw new Error('company hierarchy invariant failed');
    }

    await client.query(`SAVEPOINT cross_company_fk`);
    const otherCompany = await client.query(`
      INSERT INTO public.companies (name, slug, owner_id, email)
      VALUES ($1, $2, $3, $4) RETURNING id`,
      [`Other Smoke ${suffix}`, `other-smoke-${suffix}`, owner.rows[0].id, `other-${suffix}@example.invalid`]);
    const otherBranch = await client.query(`
      INSERT INTO public.company_branches (company_id, name, city, country)
      VALUES ($1, 'Other HQ', 'Delhi', 'IN') RETURNING id`, [otherCompany.rows[0].id]);
    try {
      await client.query(`INSERT INTO public.company_members (company_id, user_id, branch_id, is_active, joined_at) VALUES ($1, $2, $3, true, NOW())`, [companyId, outsider.rows[0].id, otherBranch.rows[0].id]);
      throw new Error('cross-company branch assignment unexpectedly succeeded');
    } catch (error) {
      if (error.code !== '23503' || error.constraint !== 'company_members_branch_tenant_fk') throw error;
      console.log('PASS: cross-company branch assignment rejected by company_members_branch_tenant_fk');
    }
    await client.query('ROLLBACK TO SAVEPOINT cross_company_fk');

    const transferred = await client.query(`UPDATE public.companies SET owner_id=$1 WHERE id=$2 AND owner_id=$3 RETURNING owner_id`, [member.rows[0].id, companyId, owner.rows[0].id]);
    if (String(transferred.rows[0]?.owner_id) !== String(member.rows[0].id)) throw new Error('ownership transfer invariant failed');
    console.log('PASS: company, owner/member, branch, department, team hierarchy and ownership transfer invariants verified');
    await client.query('ROLLBACK');
    console.log('PASS: transaction rolled back; no test rows retained');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch((error) => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; });
