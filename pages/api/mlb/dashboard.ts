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
            { data: topBets, error: betsErr },
            { data: pipelineData, error: pipelineErr },
            { data: slateGames, error: slateErr }
        ] = await Promise.all([
            mlbDb.from('pred_best_bets').select('*').eq('official_date', todayStr).order('rank', { ascending: true }).limit(3),
            mlbDb.from('pipeline_runs').select('*').order('run_at', { ascending: false }).limit(1),
            // fact_games or v_daily_slate for game slate
            mlbDb.from('v_daily_slate').select('*').eq('official_date', todayStr).order('event_time', { ascending: true })
        ]);

        const lastUpdate = pipelineData && pipelineData.length > 0 ? pipelineData[0].run_at : null;

        return res.status(200).json({
            todayStr,
            topBets: topBets || [],
            lastUpdate,
            slateGames: slateGames || []
        });

    } catch (error) {
        console.error('[API/MLB/Dashboard] Error fetching dashboard data:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
