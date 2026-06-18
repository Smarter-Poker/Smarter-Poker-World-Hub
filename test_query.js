import { getMlbSupabase } from './utils/supabase/mlb.js';

const client = getMlbSupabase();

const test = async () => {
    const { data: teams, error } = await client.from('v_team_profile').select('*').limit(2);
    console.log('v_team_profile:', JSON.stringify(teams, null, 2));

    const { data: agg, error2 } = await client.from('agg_team').select('*').limit(2);
    console.log('agg_team:', JSON.stringify(agg, null, 2));
};
test();
