import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        const { data: teams, error } = await mlbDb
            .from('v_team_terminal_stats')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('[API/MLB/Teams] Error fetching teams:', error);
            return res.status(500).json({ error: 'Failed to fetch team data' });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ teams: teams || [] });
    } catch (err) {
        console.error('[API/MLB/Teams] Unhandled error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
