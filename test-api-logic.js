import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);
async function run() {
  const [hittersRes, pitchersRes, aggPitcherRes, aggBatterRes] = await Promise.all([
      mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id'),
      mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id, fip, siera'),
      mlbDb.from('agg_pitcher').select('pitcher_id, w, l, era, so, h, bb, ip, as_of').eq('window_kind', 'fg_season').order('as_of', { ascending: false }).limit(3000),
      mlbDb.from('agg_batter').select('batter_id, hr, rbi, avg, obp, slg, woba, wrc_plus, as_of').eq('window_kind', 'fg_season').order('as_of', { ascending: false }).limit(3000),
  ]);
  
  console.log('aggBatter count:', aggBatterRes.data?.length);
  const ab = aggBatterRes.data.find(r => r.batter_id === 687462);
  console.log('Spencer Horwitz agg_batter:', ab);
}
run();
