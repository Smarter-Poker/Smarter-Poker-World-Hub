const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({path: '.env.local'});

const mlbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const mlbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!mlbUrl || !mlbKey) {
  console.error('Missing MLB Supabase credentials');
  process.exit(1);
}

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  try {
    const sql = fs.readFileSync('supabase/migrations/20260618000004_mlb_status_rpc.sql', 'utf8');
    
    const { data, error } = await db.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
       console.error('RPC exec_sql failed:', error);
    } else {
       console.log('Successfully pushed RPC to MLB database!');
    }
  } catch (err) {
    console.error(err);
  }
}
run();
