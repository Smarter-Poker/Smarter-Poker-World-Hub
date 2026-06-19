import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await mlbDb.rpc('execute_sql', { sql: "SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('v_hitter_profile', 'v_pitcher_profile')" });
  if (error) console.log("RPC failed:", error);
  console.log("Views:", data);
}
run();
