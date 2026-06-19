import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseServiceKey = process.env.MLB_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const mlbDb = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
    console.log("Fetching...");
    const [hittersRes, pitchersRes] = await Promise.all([
        mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id').limit(1),
        mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id').limit(1)
    ]);
    console.log("Hitters error:", hittersRes.error);
    console.log("Pitchers error:", pitchersRes.error);
    console.log("Hitters data:", hittersRes.data);
    
    const { data: propsData } = await mlbDb
        .from('pred_props')
        .select('*')
        .limit(1);
    console.log("Props data:", propsData);
}

test().catch(console.error);
