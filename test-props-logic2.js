import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const ids = [687462]; // Spencer Horwitz
  
  const { data: aggBatterRes } = await mlbDb.from('agg_batter')
    .select('batter_id, hr, rbi, avg, obp, slg, woba, wrc_plus, as_of')
    .in('batter_id', ids)
    .eq('window_kind', 'fg_season')
    .eq('vs_hand', 'A')
    .order('as_of', { ascending: false })
    .limit(1000);
    
  console.log('aggBatter count:', aggBatterRes?.length);
  console.log('Latest row for Spencer:', aggBatterRes[0]);
}
run();
