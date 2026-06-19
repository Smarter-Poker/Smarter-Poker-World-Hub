import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();
        
        // Formatter for 'today' in US Central Time (America/Chicago)
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());

        const [
            topBetsResult,
            pipelineResult,
            slateResult
        ] = await Promise.all([
            mlbDb.from('pred_best_bets').select('*').eq('official_date', todayStr).order('rank', { ascending: true }).limit(3),
            mlbDb.from('pred_props').select('as_of_ts').order('as_of_ts', { ascending: false }).limit(1),
            mlbDb.from('v_daily_slate').select('*').eq('official_date', todayStr).order('event_time', { ascending: true })
        ]);

        if (slateResult.error) {
            console.error('[API/MLB/Dashboard] Error fetching slateGames:', slateResult.error);
            throw new Error(`Failed to fetch slate games: ${slateResult.error.message}`);
        }

        const lastUpdate = pipelineResult.data && pipelineResult.data.length > 0 ? pipelineResult.data[0].as_of_ts : null;

        return res.status(200).json({
            todayStr,
            topBets: topBetsResult.data || [],
            lastUpdate,
            slateGames: slateResult.data || []
        });

    } catch (error: any) {
        console.error('[API/MLB/Dashboard] Error fetching dashboard data:', error);
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
