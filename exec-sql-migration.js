require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Pool } = require('pg');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

// Try various connection string patterns
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY;

const connStrings = [
  process.env.DATABASE_URL,
  process.env.SUPABASE_DB_URL,
  `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${DB_PASSWORD}@db.${projectRef}.supabase.co:5432/postgres`,
].filter(Boolean);

const sql = fs.readFileSync('migrations/create-missing-tables.sql', 'utf-8');

async function tryConnect(connStr) {
  const pool = new Pool({ 
    connectionString: connStr, 
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
  const client = await pool.connect();
  return { client, pool };
}

async function run() {
  let client, pool;
  
  for (const cs of connStrings) {
    const masked = cs.substring(0, 30) + '...';
    try {
      console.log(`Trying: ${masked}`);
      ({ client, pool } = await tryConnect(cs));
      console.log('CONNECTED!');
      break;
    } catch(e) {
      console.log(`  Failed: ${e.message.substring(0, 80)}`);
    }
  }
  
  if (!client) {
    console.log('\n⚠️  Could not connect to Postgres directly.');
    console.log('SQL file ready at: migrations/create-missing-tables.sql');
    console.log('Please copy/paste into Supabase Dashboard > SQL Editor');
    process.exit(1);
  }
  
  // Execute each block
  const blocks = sql.split(/(?=CREATE TABLE)/).filter(b => b.trim().length > 10);
  let success = 0, skipped = 0, errors = 0;
  
  for (const block of blocks) {
    // Get table name for logging
    const match = block.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    const name = match ? match[1] : 'unknown';
    
    try {
      await client.query(block);
      success++;
      console.log(`  ✓ ${name}`);
    } catch(e) {
      if (e.message.includes('already exists')) {
        skipped++;
        console.log(`  ○ ${name} (already exists)`);
      } else {
        errors++;
        console.log(`  ✗ ${name}: ${e.message.substring(0, 100)}`);
      }
    }
  }
  
  console.log(`\nDone: ${success} created, ${skipped} already existed, ${errors} errors`);
  
  client.release();
  await pool.end();
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
