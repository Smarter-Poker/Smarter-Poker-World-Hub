const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: 'deploy/mlb.env'});

const mlbUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const mlbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MLB_SUPABASE_SERVICE_KEY;

if (!mlbKey) {
  console.log("No MLB key found");
  process.exit(1);
}

const db = createClient(mlbUrl, mlbKey, { auth: { persistSession: false } });

async function run() {
  const { data, error } = await db.from('pipeline_runs').select('*').limit(1);
  console.log("Pipeline error:", error);
  console.log("Pipeline data:", data);
}
run();
