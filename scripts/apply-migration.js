const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.SUPABASE_DB_URL || 
    process.env.DATABASE_URL ||
    `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres`;
    
  console.log('Connecting to database...');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected! Reading migration file...');
    const sql = fs.readFileSync('supabase/migrations/20260309_mystery_bounty_audit.sql', 'utf8');
    
    console.log('Executing SQL...');
    await client.query(sql);
    console.log('✅ Migration applied successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
