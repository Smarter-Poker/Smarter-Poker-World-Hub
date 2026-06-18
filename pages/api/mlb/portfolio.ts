import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { fetchPortfolioStats } from '../../../utils/mlbStats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { days, market } = req.query;
        const parsedDays = days ? parseInt(days as string, 10) : undefined;
        const parsedMarket = market ? market as string : undefined;

        const mlbDb = getMlbSupabase();
        const stats = await fetchPortfolioStats(mlbDb, parsedDays, parsedMarket);

        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(stats);

    } catch (err: any) {
        console.error('[MLB Portfolio API] Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
