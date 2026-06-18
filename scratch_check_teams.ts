import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/deploy/mlb.env' });
const supabaseUrl = process.env.SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = process.env.MLB_SUPABASE_SERVICE_KEY;
if (!supabaseKey) { console.error('No key'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
    const { data: pData } = await supabase.from('pred_market_output').select('team').limit(5);
    console.log('pred_market_output teams:', pData);

    const { data: vData } = await supabase.from('v_team_profile').select('team_id, name').limit(5);
    console.log('v_team_profile teams:', vData);

    const { data: dData } = await supabase.from('dim_teams').select('team_id, name, abbr').limit(5);
    console.log('dim_teams teams:', dData);
}
run();
