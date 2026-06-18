import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/deploy/mlb.env' });
const supabaseUrl = process.env.SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = process.env.MLB_SUPABASE_SERVICE_KEY;
if (!supabaseKey) { console.error('No key'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
    const { data, error } = await supabase.from('dim_teams').select('team_id, name, league, division').limit(5);
    console.log(JSON.stringify(data, null, 2));
}
run();
