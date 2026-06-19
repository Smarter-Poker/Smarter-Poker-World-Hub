import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Get today in CST
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const todayStr = formatter.format(new Date());

        // Find the most recent slate date (may be yesterday if today not loaded yet)
        const { data: latestRow } = await mlbDb
            .from('fact_games')
            .select('official_date')
            .order('official_date', { ascending: false })
            .limit(1)
            .single();

        const slateDate = latestRow?.official_date || todayStr;

        const [topBetsResult, pipelineResult, slateResult] = await Promise.all([
            mlbDb
                .from('pred_best_bets')
                .select('*')
                .eq('official_date', slateDate)
                .order('rank', { ascending: true })
                .limit(10),
            mlbDb
                .from('pred_props')
                .select('as_of_ts')
                .order('as_of_ts', { ascending: false })
                .limit(1),
            mlbDb
                .from('v_daily_slate')
                .select('*')
                .eq('official_date', slateDate)
                .order('event_time', { ascending: true }),
        ]);

        if (slateResult.error) {
            console.error('[API/MLB/Dashboard] v_daily_slate error:', slateResult.error);
            // Fall back to empty
        }

        const lastUpdate =
            pipelineResult.data && pipelineResult.data.length > 0
                ? pipelineResult.data[0].as_of_ts
                : null;

        return res.status(200).json({
            todayStr: slateDate,
            topBets: topBetsResult.data || [],
            lastUpdate,
            slateGames: slateResult.data || [],
        });
    } catch (error: any) {
        console.error('[API/MLB/Dashboard] Error:', error);
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
