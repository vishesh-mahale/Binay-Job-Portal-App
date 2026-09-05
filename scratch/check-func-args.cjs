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

async function checkFunc() {
  const client = await pool.connect();
  const res = await client.query(`
    SELECT proname, pg_get_function_arguments(oid)
    FROM pg_proc
    WHERE proname = 'change_application_status'
  `);
  console.log("Function args:");
  for (const r of res.rows) {
    console.log(` - ${r.proname}(${r.pg_get_function_arguments})`);
  }
  client.release();
  await pool.end();
}

checkFunc().catch(console.error);
