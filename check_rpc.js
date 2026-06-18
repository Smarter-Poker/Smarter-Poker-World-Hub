const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});

const mlbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const mlbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await db.rpc('get_mlb_status_metrics', {
      last_24h_iso: new Date().toISOString(),
      today_str: '2026-06-18'
  });
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
