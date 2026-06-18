import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Fetch Hitters (Selecting ONLY necessary columns)
        const { data: hittersData, error: hittersErr } = await mlbDb
            .from('v_hitter_profile')
            .select('player_id, full_name, team_id, wrc_plus, woba, pa')
            .order('wrc_plus', { ascending: false });

        if (hittersErr) throw hittersErr;

        // Fetch Pitchers (Selecting ONLY necessary columns)
        const { data: pitchersData, error: pitchersErr } = await mlbDb
            .from('v_pitcher_profile')
            .select('player_id, full_name, team_id, fip, siera, bf')
            .order('fip', { ascending: true }); // Lower FIP is better

        if (pitchersErr) throw pitchersErr;

        return res.status(200).json({
            hitters: hittersData || [],
            pitchers: pitchersData || [],
            fetchError: false
        });
    } catch (err) {
        console.error('Error fetching players:', err);
        return res.status(500).json({ 
            hitters: [], 
            pitchers: [], 
            fetchError: true 
        });
    }
}
