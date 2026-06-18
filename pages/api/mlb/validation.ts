import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

        const { days: queryDays } = req.query;
        const days = queryDays ? parseInt(queryDays as string, 10) : null;
        const mlbDb = getMlbSupabase();
        
        let cutoffDate: string | null = null;
        if (days && !isNaN(days)) {
            cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
        }

        const { data: stats, error } = await mlbDb.rpc('get_mlb_validation_stats', {
            cutoff: cutoffDate
        });
            
        if (error) {
            console.error("RPC failed:", error.message);
            throw error;
        }
        
        if (!stats || !stats.all || stats.all.count === 0) {
            return res.status(200).json({ stats: null });
        }

        if (days && !isNaN(days)) {
            stats.activeDays = days;
        } else {
            stats.activeDays = null;
        }
        
        return res.status(200).json({ stats });
    } catch (err: any) {
        console.error('Error fetching validation stats:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
