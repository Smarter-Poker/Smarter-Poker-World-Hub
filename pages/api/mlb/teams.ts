import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        // Fetch teams, advanced stats, dimension info, and current market edges
        const [teamsRes, aggRes, dimRes, predRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('agg_team').select('team_id, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, hitting_war, def, uzr, drs, oaa').eq('window_kind', 'season'),
            mlbDb.from('dim_teams').select('team_id, name, abbr, league, division'),
            mlbDb.from('pred_market_output').select('team, market, edge').gt('edge', 0)
        ]);

        if (teamsRes.error) {
            console.warn('[API/MLB/Teams] Error fetching teams (table may be missing):', teamsRes.error.message);
            return res.status(200).json({ teams: [], globalEdgeActive: false });
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
            // Note: team name matching because pred_market_output uses 'team' name (e.g. 'NYY') or we match loosely
            const hasEdge = predData.some(p => p.team === dimInfo?.abbr || p.team === team.team_id || p.team === team.name || p.team === dimInfo?.name);

            return {
                ...team,
                league: team.league || dimInfo?.league,
                division: team.division || dimInfo?.division,
                has_active_edge: hasEdge,
                adv_stats: latestStats
            };
        });

        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ 
            teams: mergedTeams,
            globalEdgeActive
        });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
