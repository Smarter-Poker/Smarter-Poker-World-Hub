import { getMlbSupabase } from '../../../../utils/supabase/mlb';



export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const url = new URL(req.url);
        const segments = url.pathname.split('/');
        const id = segments[segments.length - 1]; // get the dynamic id
        
        if (!id) {
            return new Response(JSON.stringify({ error: 'Missing Team ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const mlbDb = getMlbSupabase();
        
        // Fetch team profile
        const { data: teamData, error: teamErr } = await mlbDb
            .from('v_team_profile')
            .select('*')
            .eq('team_id', id)
            .maybeSingle();

        // Fetch team advanced stats
        const { data: statsData } = await mlbDb
            .from('agg_team')
            .select('*')
            .eq('team_id', id)
            .eq('window_kind', 'season')
            .maybeSingle();
            
        // Fetch team dimension info for names
        const { data: dimData } = await mlbDb
            .from('dim_teams')
            .select('*')
            .eq('team_id', id)
            .maybeSingle();

        const teamName = teamData?.name || dimData?.name || id;
        const teamAbbr = teamData?.abbr || dimData?.abbr || id;

        // Fetch recent/upcoming games for team
        // Using raw_games
        const { data: gamesData } = await mlbDb
            .from('raw_games')
            .select('*')
            .or(`home_team.eq.${teamName},away_team.eq.${teamName},home_team.eq.${teamAbbr},away_team.eq.${teamAbbr}`)
            .order('start_time', { ascending: false })
            .limit(10);
            
        // Fetch predictive props for team
        const [hittersRes, pitchersRes] = await Promise.all([
            mlbDb.from('v_hitter_profile').select('player_id, full_name, team_id').eq('team_id', id),
            mlbDb.from('v_pitcher_profile').select('player_id, full_name, team_id').eq('team_id', id)
        ]);
        
        const playerMap = new Map<number, string>();
        (hittersRes.data || []).forEach(h => { if (h.player_id) playerMap.set(h.player_id, h.full_name); });
        (pitchersRes.data || []).forEach(p => { if (p.player_id) playerMap.set(p.player_id, p.full_name); });
        
        const playerIds = Array.from(playerMap.keys());
        let propsData = [];

        if (playerIds.length > 0) {
            const { data } = await mlbDb
                .from('pred_props')
                .select('*')
                .in('player_id', playerIds)
                .order('edge_pts', { ascending: false, nullsFirst: false })
                .limit(10);
                
            propsData = (data || []).map(p => {
                const isOver = p.rec === 'over';
                const odds = Number(p.best_price);
                return {
                    ...p,
                    player_name: playerMap.get(p.player_id) || `Unknown (${p.player_id})`,
                    team_abbr: teamAbbr,
                    prop_type: p.prop,
                    implied_prob: p.prob_over,
                    model_proj: p.proj_mean,
                    over_odds: isOver ? odds : null,
                    under_odds: !isOver ? odds : null,
                    isOver,
                    odds
                };
            });
        }
        if (teamErr && !dimData) {
            console.warn(`[API/MLB/Teams/${id}] Team not found`);
            return new Response(JSON.stringify({ error: 'Team not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ 
            team: teamData || dimData || { team_id: id, name: id },
            stats: statsData || null,
            games: gamesData || [],
            props: propsData || []
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams/[id]] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
