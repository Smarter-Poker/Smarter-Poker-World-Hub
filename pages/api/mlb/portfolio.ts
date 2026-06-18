import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { fetchPortfolioStats } from '../../../utils/mlbStats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();
        const stats = await fetchPortfolioStats(mlbDb);

        return res.status(200).json(stats);

    } catch (err: any) {
        console.error('[MLB Portfolio API] Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
