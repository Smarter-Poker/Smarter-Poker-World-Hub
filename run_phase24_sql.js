require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Pool } = require('pg');

const DB_PASSWORD = '215SlalomCt!';

// Using the exact pooler URL retrieved from configuration
const connString = `postgresql://postgres.kuklfnapbkmacvwxktbh:${DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const sql = fs.readFileSync('supabase/migrations/20260308_daily_challenge_tables.sql', 'utf-8');

async function run() {
  let client, pool;
  try {
    console.log('Connecting to us-west-2 pooler...');
    pool = new Pool({ connectionString: connString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    client = await pool.connect();
    console.log('CONNECTED to us-west-2 pooler');
  } catch (e) {
    console.log('Failed:', e.message);
    process.exit(1);
  }

  try {
    console.log('Running SQL...');
    await client.query(sql);
    console.log('SQL executed successfully!');
  } catch (e) {
    console.error('SQL Error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
