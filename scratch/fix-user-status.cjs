const { Pool } = require('../04-nestjs-api/04-nestjs-api-app/node_modules/pg');
const fs = require('fs');

const env = fs.readFileSync('./04-nestjs-api/04-nestjs-api-app/.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim();
const pool = new Pool({ connectionString: dbUrl });

async function main() {
  const r = await pool.query("UPDATE public.users SET status = 'active' WHERE status != 'active'");
  console.log(`Updated ${r.rowCount} users to status = 'active'.`);

  const users = await pool.query("SELECT id, email, role, status FROM public.users");
  console.log('All DB Users:', users.rows);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  pool.end();
});
