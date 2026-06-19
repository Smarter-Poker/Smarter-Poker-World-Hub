import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data } = await mlbDb.from('agg_batter').select('*').eq('batter_id', 687462).limit(1);
  console.log('agg_batter row:', data);
}
run();
