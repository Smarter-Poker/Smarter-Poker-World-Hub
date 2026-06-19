import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { getSlate } from '../../../src/lib/mlb_data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Get today in CST (Central Standard Time — where most US sportsbooks reference)
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // ── Find the best available slate date ─────────────────────────────────
        // Strategy: Try today first in agg_market (which only has dates with real model output).
        // If today has no data yet, fall back to the most recent date that does.
        // NEVER use fact_games — it contains the full season schedule (returns Sept dates).
        let slateDate = todayStr;

        const { data: todayCheck } = await mlbDb
            .from('agg_market')
            .select('as_of')
            .eq('as_of', todayStr)
            .limit(1);

        if (!todayCheck || todayCheck.length === 0) {
            // Today not yet initialized — find the most recent date with model data
            const { data: latestRow } = await mlbDb
                .from('agg_market')
                .select('as_of')
                .lte('as_of', todayStr) // only look at past/today, not future
                .order('as_of', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestRow?.as_of) {
                slateDate = latestRow.as_of;
            }
        }

        // ── Fetch all data in parallel ──────────────────────────────────────────
        const [slateGames, topBetsResult, pipelineResult] = await Promise.all([
            // Use getSlate() — this builds proper GameCard objects with all joined data
            getSlate(slateDate).catch((err) => {
                console.error('[API/MLB/Dashboard] getSlate error:', err);
                return [];
            }),
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
        ]);

        const lastUpdate =
            pipelineResult.data && pipelineResult.data.length > 0
                ? pipelineResult.data[0].as_of_ts
                : null;

        // Set cache headers: short cache (60s) with stale-while-revalidate
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

        return res.status(200).json({
            todayStr: slateDate,
            topBets: topBetsResult.data || [],
            lastUpdate,
            slateGames,
        });
    } catch (error: any) {
        console.error('[API/MLB/Dashboard] Error:', error);
        return res.status(500).json({ error: error?.message || 'Internal Server Error' });
    }
}
