import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await mlbDb.rpc('execute_sql', { sql: "SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('agg_batter', 'agg_pitcher')" });
  console.log(data || error);
}
run();
