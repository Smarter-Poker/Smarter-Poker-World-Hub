import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const ab = await sb.from('agg_batter').select('batter_id, hr, rbi, avg, obp, slg, woba, wrc_plus').eq('batter_id', 687462).eq('window_kind', 'fg_season').limit(1);
  console.log('agg_batter Spencer Horwitz:', ab);
}
run();
