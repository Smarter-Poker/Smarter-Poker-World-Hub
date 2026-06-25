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

        // ── Find the best available slate date (for GAMES) ─────────────────────
        // Always try to show today's games. If no games today (e.g. All-Star Break),
        // fall back to the most recent date with games.
        let slateDate = todayStr;

        const { data: todayGames } = await mlbDb
            .from('fact_games')
            .select('game_pk')
            .eq('official_date', todayStr)
            .limit(1);

        if (!todayGames || todayGames.length === 0) {
            const { data: latestGames } = await mlbDb
                .from('fact_games')
                .select('official_date')
                .lte('official_date', todayStr)
                .order('official_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestGames?.official_date) {
                slateDate = latestGames.official_date;
            }
        }

        // ── Find the best available bets date (for MODEL OUTPUT) ────────────────
        // Top Bets might not be generated for today yet. Fall back to the most recent date.
        let betsDate = todayStr;
        const { data: todayBets } = await mlbDb
            .from('pred_best_bets')
            .select('official_date')
            .eq('official_date', todayStr)
            .limit(1);

        if (!todayBets || todayBets.length === 0) {
            const { data: latestBets } = await mlbDb
                .from('pred_best_bets')
                .select('official_date')
                .lte('official_date', todayStr)
                .order('official_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestBets?.official_date) {
                betsDate = latestBets.official_date;
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
                .eq('official_date', betsDate)
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
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

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
