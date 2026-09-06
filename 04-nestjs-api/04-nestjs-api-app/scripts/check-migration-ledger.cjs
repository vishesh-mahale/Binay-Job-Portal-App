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

    // 1. Find all tables matching migrations in any schema
    const resTables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name LIKE '%migration%' OR table_schema LIKE '%migration%'
      ORDER BY table_schema, table_name
    `);
    console.log('\n--- ALL MIGRATION TABLES ACROSS SCHEMAS ---');
    console.table(resTables.rows);

    // Check if public.schema_migrations exists or if supabase_migrations.schema_migrations exists
    for (const row of resTables.rows) {
      try {
        const fullTable = `"${row.table_schema}"."${row.table_name}"`;
        const res = await client.query(`SELECT * FROM ${fullTable} LIMIT 5`);
        console.log(`\n--- ROWS FROM ${fullTable} (${res.rowCount}) ---`);
        console.table(res.rows);
      } catch (err) {
        console.log(`Could not query ${row.table_schema}.${row.table_name}: ${err.message}`);
      }
    }

  } catch (err) {
    console.error('Migration ledger check error:', err.message);
  } finally {
    await client.end();
  }
}

run();
