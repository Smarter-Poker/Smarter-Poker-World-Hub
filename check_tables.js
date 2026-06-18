const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});

const mlbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const mlbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await db.rpc('exec_sql', { sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';" });
  if (error) {
     // If exec_sql doesn't exist, we can't do this. Let's just do a normal select from something common.
     console.log("No exec_sql, trying to fetch tables via PostgREST OpenAPI spec...");
     const response = await fetch(`${mlbUrl}/rest/v1/`, { headers: { 'apikey': mlbKey, 'Authorization': `Bearer ${mlbKey}` }});
     const json = await response.json();
     console.log(Object.keys(json.definitions || {}).join(", "));
  }
}
run();
