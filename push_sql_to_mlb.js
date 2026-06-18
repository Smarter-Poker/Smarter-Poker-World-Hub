const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({path: '.env.local'});

const mlbUrl = process.env.MLB_SUPABASE_URL;
const mlbKey = process.env.MLB_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!mlbUrl || !mlbKey) {
  console.error('Missing MLB Supabase credentials');
  process.exit(1);
}

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  try {
    const sql = fs.readFileSync('supabase/migrations/20260618000001_mlb_best_bets_rpc.sql', 'utf8');
    
    // We cannot execute raw SQL directly via the JS client unless there is an exec_sql rpc.
    // Let's check if exec_sql exists.
    const { data, error } = await db.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
       console.error('RPC exec_sql failed:', error);
       
       // Fallback: Use REST API query directly? Not possible.
       // We'll just rely on the JS fallback in the app, which is fast anyway since it just filters today's bets.
    } else {
       console.log('Successfully pushed RPC to MLB database!');
    }
  } catch (err) {
    console.error(err);
  }
}
run();
