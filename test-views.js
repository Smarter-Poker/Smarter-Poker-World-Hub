import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const { data } = await mlbDb.rpc('get_views');
  console.log(data);
  // Also try to query just the recent snapshot of agg_batter
  const { data: latest } = await mlbDb.from('agg_batter').select('as_of').order('as_of', { ascending: false }).limit(1);
  console.log('Latest agg_batter as_of:', latest);
}
run();
