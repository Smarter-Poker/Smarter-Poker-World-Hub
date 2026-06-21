import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Full-backtest analytics for the MLB Portfolio page. These views aggregate the entire
// sim_bets history (they are intentionally NOT filtered by the page's timeframe/market
// chips — they describe the complete simulated track record), so this route takes no
// query params. Each block is best-effort: if one view is unavailable the rest still
// render, and the page degrades gracefully (sections simply hide).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();

        const [riskRes, marketRes, baselineRes, gradeRes, equityRes] = await Promise.all([
            mlbDb.from('sim_risk_metrics').select('*').limit(1).maybeSingle(),
            mlbDb.from('sim_market_summary').select('*').order('bets', { ascending: false }),
            mlbDb.from('sim_baseline_compare').select('*').limit(1).maybeSingle(),
            mlbDb.from('sim_bet_grade_summary').select('*'),
            mlbDb.from('sim_equity_daily').select('day, bets, day_pnl, end_bankroll, drawdown').order('day', { ascending: true }),
        ]);

        const equityDaily = equityRes.data || [];
        const firstDay = equityDaily.length > 0 ? equityDaily[0].day : null;
        const lastDay = equityDaily.length > 0 ? equityDaily[equityDaily.length - 1].day : null;

        // Canonical tier ordering for display (best -> worst).
        const TIER_ORDER: Record<string, number> = { ELITE: 0, STRONG: 1, LEAN: 2, THIN: 3, PASS: 4 };
        const gradeSummary = (gradeRes.data || []).slice().sort(
            (a: any, b: any) => (TIER_ORDER[a.bet_tier] ?? 99) - (TIER_ORDER[b.bet_tier] ?? 99)
        );

        const payload = {
            riskMetrics: riskRes.error ? null : riskRes.data,
            marketSummary: marketRes.error ? [] : (marketRes.data || []),
            baseline: baselineRes.error ? null : baselineRes.data,
            gradeSummary: gradeRes.error ? [] : gradeSummary,
            equityDaily: equityRes.error ? [] : equityDaily,
            dataWindow: { firstDay, lastDay, days: equityDaily.length },
        };

        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
        return res.status(200).json(payload);
    } catch (err: any) {
        console.error('[MLB Portfolio Extras] Exception:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
