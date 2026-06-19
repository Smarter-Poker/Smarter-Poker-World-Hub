import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = {
    runtime: 'edge',
};




export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch teams, advanced stats, dimension info, and current market edges
        const [teamsRes, aggRes, dimRes, predRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('agg_team').select('team_id, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, hitting_war, def, uzr, drs, oaa').eq('window_kind', 'season'),
            mlbDb.from('dim_teams').select('team_id, name, abbr, league, division'),
            mlbDb.from('pred_props').select('team_abbr, prop_type, edge_pts').gt('edge_pts', 0)
        ]);

        if (teamsRes.error) {
            console.warn('[API/MLB/Teams] Error fetching teams (table may be missing):', teamsRes.error.message);
            return new Response(JSON.stringify({ teams: [], globalEdgeActive: false }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            });
        }

        const teams = teamsRes.data || [];
        const aggData = aggRes.data || [];
        const dimData = dimRes.data || [];
        const predData = predRes.data || [];

        // Determine if there is a global MLB Edge available today
        const globalEdgeActive = predData.length > 0;

        // Merge advanced stats, dim info, and predictions into teams
        const mergedTeams = teams.map(team => {
            // Find latest stats for team
            const teamStats = aggData.filter(a => a.team_id === team.team_id);
            const latestStats = teamStats.length > 0 ? teamStats[0] : null;
            
            // Find dimension info
            const dimInfo = dimData.find(d => d.team_id === team.team_id) || null;

            // Check if this specific team has an active predictive edge today
            const hasEdge = predData.some(p => p.team_abbr === dimInfo?.abbr || p.team_abbr === team.name || p.team_abbr === dimInfo?.name);

            return {
                ...team,
                league: team.league || dimInfo?.league,
                division: team.division || dimInfo?.division,
                has_active_edge: hasEdge,
                adv_stats: latestStats
            };
        });

        return new Response(JSON.stringify({ 
            teams: mergedTeams,
            globalEdgeActive
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
