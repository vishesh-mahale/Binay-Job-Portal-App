const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('FAIL-CLOSED: DATABASE_URL environment variable is missing!');
}

async function run() {
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL Database successfully.');

    // Step 1: Preflight Read-only Check
    console.log('\n=== STEP 1: PREFLIGHT READ-ONLY DATA INTEGRITY CHECK ===');
    const resInterview = await client.query(`
      SELECT COUNT(*)::int as count FROM public.jobs
      WHERE interview_rounds IS NOT NULL AND jsonb_typeof(interview_rounds) != 'array'
    `);
    const resSkills = await client.query(`
      SELECT COUNT(*)::int as count FROM public.jobs
      WHERE custom_skills IS NOT NULL AND jsonb_typeof(custom_skills) != 'array'
    `);
    const resNotice = await client.query(`
      SELECT COUNT(*)::int as count FROM public.jobs
      WHERE max_notice_period_days IS NOT NULL AND max_notice_period_days < 0
    `);

    console.log(`- Invalid interview_rounds rows: ${resInterview.rows[0].count}`);
    console.log(`- Invalid custom_skills rows: ${resSkills.rows[0].count}`);
    console.log(`- Negative max_notice_period_days rows: ${resNotice.rows[0].count}`);

    if (resInterview.rows[0].count > 0 || resSkills.rows[0].count > 0 || resNotice.rows[0].count > 0) {
      throw new Error('PREFLIGHT FAILED: Existing invalid data present in jobs table!');
    }
    console.log('✅ Preflight check passed cleanly. No invalid data found.');

    // Step 2: Apply Migration 20260906000002_add_job_integrity_constraints.sql
    console.log('\n=== STEP 2: APPLYING MIGRATION 20260906000002_add_job_integrity_constraints.sql ===');
    const migrationPath = path.join(__dirname, '../../../02-database/migrations/20260906000002_add_job_integrity_constraints.sql');
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found at: ${migrationPath}`);
    }
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    await client.query(migrationSql);
    console.log('✅ Migration SQL executed successfully.');

    // Step 3: Verify pg_constraint on jobs table
    console.log('\n=== STEP 3: POST-MIGRATION PG_CONSTRAINT VERIFICATION ===');
    const requiredConstraints = [
      'interview_rounds_array',
      'custom_skills_array',
      'max_notice_period_days_non_negative',
    ];

    const resConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'public.jobs'::regclass
        AND conname = ANY($1::text[])
    `, [requiredConstraints]);

    console.table(resConstraints.rows);

    const foundNames = resConstraints.rows.map(r => r.conname);
    const missing = requiredConstraints.filter(c => !foundNames.includes(c));

    if (missing.length > 0) {
      throw new Error(`VERIFICATION FAILED: Missing constraints after migration: ${missing.join(', ')}`);
    }

    console.log('✅ ALL THREE INTEGRITY CONSTRAINTS VERIFIED IN PG_CONSTRAINT LIVE SCHEMA:');
    requiredConstraints.forEach(name => {
      const match = resConstraints.rows.find(r => r.conname === name);
      console.log(`   - [VERIFIED] ${name}: ${match.def}`);
    });

  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
