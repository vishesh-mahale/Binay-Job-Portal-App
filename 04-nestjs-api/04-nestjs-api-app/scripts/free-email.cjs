require('dotenv').config();
const { Client } = require('pg');
const { loadConfig } = require('../dist/src/infrastructure/config/config');

const config = loadConfig(process.env);
const targetEmail = 'visheshmahale1994@gmail.com';

async function freeEmail() {
  const pgClient = new Client({ connectionString: config.DATABASE_URL });
  await pgClient.connect();

  const archivedEmail = `archived_${Date.now()}@example.com`;
  console.log(`Frees email ${targetEmail} by archiving old DB row to ${archivedEmail}...`);

  const res = await pgClient.query(
    'UPDATE public.users SET email = $1, deleted_at = NOW() WHERE email = $2',
    [archivedEmail, targetEmail]
  );

  console.log(`Updated ${res.rowCount} rows in public.users.`);
  await pgClient.end();
  console.log(`Email ${targetEmail} is now 100% FREE for new account creation!`);
}

freeEmail().catch(console.error);
