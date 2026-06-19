import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: hitter } = await sb.from('v_hitter_profile').select('player_id, full_name, team_id, woba, wrc_plus, pa, splits').eq('player_id', 687462);
  console.log('Spencer Horwitz:', hitter);

  const { data: pitcher } = await sb.from('agg_pitcher').select('pitcher_id, w, l, era, as_of').eq('pitcher_id', 605488).eq('window_kind', 'fg_season');
  console.log('Jeffrey Springs:', pitcher);
}
run();
