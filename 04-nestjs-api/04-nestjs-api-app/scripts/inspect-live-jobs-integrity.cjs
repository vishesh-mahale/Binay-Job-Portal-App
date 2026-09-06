const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('FAIL-CLOSED: DATABASE_URL environment variable is missing!');
}

async function run() {
  const client = new Client({
    connectionString: dbUrl,
  });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL Database successfully.');

    // 1. Check interview_rounds array integrity
    const resInterview = await client.query(`
      SELECT id, title, interview_rounds, jsonb_typeof(interview_rounds) as typeof_val
      FROM public.jobs
      WHERE interview_rounds IS NOT NULL AND jsonb_typeof(interview_rounds) != 'array'
    `);
    console.log(`\n--- INVALID INTERVIEW_ROUNDS ROWS (${resInterview.rowCount}) ---`);
    if (resInterview.rowCount > 0) {
      console.table(resInterview.rows);
    } else {
      console.log('✅ ALL jobs.interview_rounds rows are valid JSONB arrays.');
    }

    // 2. Check custom_skills array integrity
    const resSkills = await client.query(`
      SELECT id, title, custom_skills, jsonb_typeof(custom_skills) as typeof_val
      FROM public.jobs
      WHERE custom_skills IS NOT NULL AND jsonb_typeof(custom_skills) != 'array'
    `);
    console.log(`\n--- INVALID CUSTOM_SKILLS ROWS (${resSkills.rowCount}) ---`);
    if (resSkills.rowCount > 0) {
      console.table(resSkills.rows);
    } else {
      console.log('✅ ALL jobs.custom_skills rows are valid JSONB arrays.');
    }

    // 3. Check max_notice_period_days non-negative constraint
    const resNotice = await client.query(`
      SELECT id, title, max_notice_period_days
      FROM public.jobs
      WHERE max_notice_period_days IS NOT NULL AND max_notice_period_days < 0
    `);
    console.log(`\n--- INVALID MAX_NOTICE_PERIOD_DAYS ROWS (${resNotice.rowCount}) ---`);
    if (resNotice.rowCount > 0) {
      console.table(resNotice.rows);
    } else {
      console.log('✅ ALL jobs.max_notice_period_days rows are non-negative or NULL.');
    }

    // 4. Check existing constraints on jobs table
    const resConstraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE conrelid = 'public.jobs'::regclass
      ORDER BY conname
    `);
    console.log(`\n--- CURRENT JOBS TABLE CONSTRAINTS (${resConstraints.rowCount}) ---`);
    console.table(resConstraints.rows);

  } catch (err) {
    console.error('Error running DB integrity inspection:', err.message);
  } finally {
    await client.end();
  }
}

run();
