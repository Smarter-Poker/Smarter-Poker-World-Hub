import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        const days = req.query.days ? parseInt(req.query.days as string, 10) : null;
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
            return res.status(200).json(null);
        }

        if (days && !isNaN(days)) {
            stats.activeDays = days;
        } else {
            stats.activeDays = null;
        }
        
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(stats);
    } catch (error: any) {
        console.error('Error fetching validation stats:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch validation stats', 
            details: error.message 
        });
    }
}
