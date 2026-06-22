const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({path: '.env.local'});

const mlbUrl = process.env.MLB_SUPABASE_URL;
const mlbKey = process.env.MLB_SUPABASE_SERVICE_KEY;

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  try {
    const sql = fs.readFileSync('supabase/migrations/20260622180000_mlb_player_directory_optimizations.sql', 'utf8');
    const { data, error } = await db.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
       console.error('RPC exec_sql failed:', error);
       const { data: data2, error: error2 } = await db.rpc('exec_sql', { sql: sql });
       if (error2) console.error('Failed with sql param too:', error2);
       else console.log('Successfully pushed RPC to MLB database with param sql!');
    } else {
       console.log('Successfully pushed RPC to MLB database with param sql_query!');
    }
  } catch (err) {
    console.error(err);
  }
}
run();
