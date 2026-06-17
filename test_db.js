import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const client = createClient(supabaseUrl, supabaseKey);

const test = async () => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    console.log('Today CST:', todayStr);

    const { data: games, error } = await client.from('fact_games')
        .select('game_pk, official_date, first_pitch_utc, home_team_id, away_team_id')
        .eq('official_date', todayStr)
        .order('first_pitch_utc', { ascending: true })
        .limit(15);
    console.log('Games error:', error);
    console.log('Games count:', (games || []).length);
    
    if (games && games.length > 0) {
        const { data: teamsData } = await client.from('dim_teams').select('team_id, abbr');
        const teamsMap = {};
        (teamsData || []).forEach(t => { teamsMap[t.team_id] = t.abbr; });
        
        const gamePks = games.map(g => g.game_pk);
        const { data: preds } = await client.from('pred_market_output')
            .select('game_pk, market, selection, edge_pts, rec')
            .in('game_pk', gamePks);
        
        games.slice(0, 3).forEach(g => {
            const pitchTime = g.first_pitch_utc ? new Date(g.first_pitch_utc).toLocaleTimeString('en-US', {
                timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
            }) : 'TBD';
            const gamePreds = (preds || []).filter(p => p.game_pk === g.game_pk && p.rec === true);
            const maxEdge = gamePreds.length > 0 ? Math.max(...gamePreds.map(p => p.edge_pts || 0)) : null;
            console.log(`${teamsMap[g.away_team_id]} @ ${teamsMap[g.home_team_id]} — ${pitchTime} — edge: ${maxEdge}`);
        });
    }
};
test();
