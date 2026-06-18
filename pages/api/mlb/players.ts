import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    try {
        const mlbDb = getMlbSupabase();

        // Fetch Hitters and Pitchers concurrently
        const [hittersResult, pitchersResult] = await Promise.all([
            mlbDb
                .from('v_hitter_profile')
                .select('player_id, full_name, team_id, wrc_plus, woba, pa')
                .order('wrc_plus', { ascending: false }),
            mlbDb
                .from('v_pitcher_profile')
                .select('player_id, full_name, team_id, fip, siera, bf')
                .order('fip', { ascending: true }) // Lower FIP is better
        ]);

        if (hittersResult.error) {
            console.warn('[MLB Players] Fallback error on v_hitter_profile:', hittersResult.error.message);
        }
        if (pitchersResult.error) {
            console.warn('[MLB Players] Fallback error on v_pitcher_profile:', pitchersResult.error.message);
        }

        return res.status(200).json({
            hitters: hittersResult.data || [],
            pitchers: pitchersResult.data || [],
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
