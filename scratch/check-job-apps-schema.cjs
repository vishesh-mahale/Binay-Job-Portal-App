const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app', '.env');
const envConfig = fs.readFileSync(envPath, 'utf8');
for (const line of envConfig.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}

const { Pool } = require(path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
  const client = await pool.connect();
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'job_applications'
  `);
  console.log("Columns in job_applications:");
  for (const r of res.rows) {
    console.log(` - ${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`);
  }

  const consRes = await client.query(`
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'public.job_applications'::regclass
  `);
  console.log("\nConstraints on job_applications:");
  for (const r of consRes.rows) {
    console.log(` - ${r.conname}: ${r.pg_get_constraintdef}`);
  }

  client.release();
  await pool.end();
}

checkSchema().catch(console.error);
