const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function runSeed() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[match[1]]) process.env[match[1]] = value.trim();
      }
    }
  }

  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('=== RUNNING MASTER DATA SEEDER ===');

    const seedSqlPath = path.join(__dirname, '..', '..', '..', '02-database', 'seeds', '05_jobs_master_seeds.sql');
    if (!fs.existsSync(seedSqlPath)) {
      throw new Error(`Seed SQL file not found at: ${seedSqlPath}`);
    }

    const sqlContent = fs.readFileSync(seedSqlPath, 'utf8');
    console.log(`Executing SQL file: ${seedSqlPath}...`);

    const result = await client.query(sqlContent);
    console.log('✅ SEED EXECUTED SUCCESSFULLY!');

    // Fetch counts
    const catCount = await client.query('SELECT count(*) FROM public.job_categories');
    const skillCount = await client.query('SELECT count(*) FROM public.skills');
    console.log(`📊 Total Job Categories in DB: ${catCount.rows[0].count}`);
    console.log(`📊 Total Master Skills in DB: ${skillCount.rows[0].count}`);

  } catch (err) {
    console.error('❌ SEEDING FAILED:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();
