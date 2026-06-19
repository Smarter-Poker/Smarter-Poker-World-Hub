import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data, error } = await mlbDb.from('pred_props').select('*').limit(1);
  console.log(data);
}
run();
