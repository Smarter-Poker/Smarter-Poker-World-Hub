import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await mlbDb.rpc('execute_sql', { sql: "SELECT table_type FROM information_schema.tables WHERE table_name = 'v_hitter_profile'" });
  console.log("execute_sql returned:", error || data);
  // fallback if execute_sql doesn't work, just insert a dummy or select
}
run();
