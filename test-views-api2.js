require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
async function run() {
    const supabase = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_KEY);
    const { data: hitters, error: errH } = await supabase.from('v_hitter_profile').select('*').limit(1);
    console.log("v_hitter_profile:", errH ? errH.message : "Exists!");
    
    const { data: pitchers, error: errP } = await supabase.from('v_pitcher_profile').select('*').limit(1);
    console.log("v_pitcher_profile:", errP ? errP.message : "Exists!");
    
    const { data: team, error: errT } = await supabase.from('v_team_profile').select('*').limit(1);
    console.log("v_team_profile:", errT ? errT.message : "Exists!");
}
run();
