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

            if ((latestGames as any)?.official_date) {
                slateDate = (latestGames as any).official_date;
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

            if ((latestBets as any)?.official_date) {
                betsDate = (latestBets as any).official_date;
            }
        }

        // ── Fetch all data in parallel ──────────────────────────────────────────
        // topBets and lastUpdate from pred_best_bets/pred_props removed — both were
        // dead weight (never consumed by index.tsx or game/[id].tsx). lastUpdate now
        // comes from pred_market_output which is the correct pipeline freshness proxy.
        const [slateGames, lastUpdateResult] = await Promise.all([
            // Use getSlate() — builds proper GameCard objects with all joined data
            getSlate(slateDate).catch((err) => {
                console.error('[API/MLB/Dashboard] getSlate error:', err);
                return [];
            }),
            mlbDb
                .from('pred_market_output')
                .select('as_of_ts')
                .order('as_of_ts', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);

        const lastUpdate = (lastUpdateResult.data as any)?.as_of_ts ?? null;

        // Set cache headers: short cache (60s) with stale-while-revalidate
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

        return res.status(200).json({
            todayStr: slateDate,
            lastUpdate,
            slateGames,
        });
    } catch (error: any) {
        console.error('[API/MLB/Dashboard] Error:', error);
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.status(200).json({ error: error?.message || 'Internal Server Error', slateGames: [], topBets: [], lastUpdate: null, todayStr: null });
    }
}
