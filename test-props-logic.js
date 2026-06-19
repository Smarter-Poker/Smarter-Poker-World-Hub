import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const ids = [687462];
  
  const [hittersRes, aggBatterRes] = await Promise.all([
    mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id, splits').in('player_id', ids).limit(1000),
    mlbDb.from('agg_batter').select('*').in('batter_id', ids).eq('window_kind', 'fg_season').limit(1000)
  ]);
  
  console.log('v_hitter_profile:', hittersRes.data);
  console.log('agg_batter count:', aggBatterRes.data?.length);
  
  const aggBatters = aggBatterRes.data || [];
  const aggBatterMap = new Map();
  for (const row of aggBatters) {
      if (row.batter_id != null && !aggBatterMap.has(row.batter_id)) {
          aggBatterMap.set(row.batter_id, {
              avg: row.avg ?? null,
              hr: row.hr ?? null,
              rbi: row.rbi ?? null,
              woba: row.woba ?? null,
              wrc_plus: row.wrc_plus ?? null,
          });
      }
  }
  
  console.log('aggBatterMap entry:', aggBatterMap.get(687462));
}
run();
