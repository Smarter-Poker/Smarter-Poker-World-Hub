import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid player ID' });
    }

    try {
        const mlbDb = getMlbSupabase();

        // 1. Try to fetch as hitter
        const { data: hitterData, error: hitterError } = await mlbDb
            .from('v_hitter_profile')
            .select('*')
            .eq('player_id', id)
            .maybeSingle();

        if (hitterData) {
            return res.status(200).json({
                type: 'hitter',
                profile: hitterData
            });
        }

        // 2. Try to fetch as pitcher
        const { data: pitcherData, error: pitcherError } = await mlbDb
            .from('v_pitcher_profile')
            .select('*')
            .eq('player_id', id)
            .maybeSingle();

        if (pitcherData) {
            return res.status(200).json({
                type: 'pitcher',
                profile: pitcherData
            });
        }

        // 3. Not found
        return res.status(404).json({ error: 'Player not found in primary profiles' });
    } catch (err) {
        console.error('Error fetching player detail:', err);
        return res.status(500).json({ error: 'Internal server error fetching player' });
    }
}
