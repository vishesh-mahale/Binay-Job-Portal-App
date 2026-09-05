const { Pool } = require('../04-nestjs-api/04-nestjs-api-app/node_modules/pg');
const fs = require('fs');

const env = fs.readFileSync('./04-nestjs-api/04-nestjs-api-app/.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim();
const pool = new Pool({ connectionString: dbUrl });

async function main() {
  await pool.query('ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS rejection_reason TEXT;');
  console.log('Added rejection_reason column to public.companies table.');

  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'");
  console.log('Company columns:', res.rows.map(x => x.column_name));
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
