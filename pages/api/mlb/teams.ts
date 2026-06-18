import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        const [teamsRes, aggRes] = await Promise.all([
            mlbDb.from('v_team_profile').select('*').order('name', { ascending: true }),
            mlbDb.from('agg_team').select('team_id, era, fip, xfip, siera, pitching_war, avg, obp, slg, ops, hr, sb, hitting_war, def, uzr, drs, oaa').eq('window_kind', 'season')
        ]);

        if (teamsRes.error) {
            console.error('[API/MLB/Teams] Error fetching teams:', teamsRes.error);
            return res.status(500).json({ error: 'Failed to fetch team data' });
        }

        const teams = teamsRes.data || [];
        const aggData = aggRes.data || [];

        // Merge advanced stats into teams
        const mergedTeams = teams.map(team => {
            // Find latest stats for team
            const teamStats = aggData.filter(a => a.team_id === team.team_id);
            const latestStats = teamStats.length > 0 ? teamStats[0] : null;
            return {
                ...team,
                adv_stats: latestStats
            };
        });

        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ teams: mergedTeams });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
