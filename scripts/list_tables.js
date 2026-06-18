require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.SUPABASE_CONNECTION_POOL_URL || process.env.SUPABASE_URL_WITH_PASS, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  const res = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  console.log(res.rows.map(r => r.tablename));
  await client.end();
}
run();
