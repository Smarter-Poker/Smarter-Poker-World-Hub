import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Auth check
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.MLB_CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const mlbDb = getMlbSupabase();
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

        // 1. Fetch pending recommended bets for today
        const { data: pendingBets, error: fetchErr } = await mlbDb
            .from('pred_market_output')
            .select('game_pk, market, selection, as_of_ts, market_novig_prob')
            .eq('rec', 'BET')
            .is('result', null)
            .eq('official_date', todayStr);

        if (fetchErr) {
            console.warn('[MLB CLV] Error fetching pending bets:', fetchErr.message);
            return res.status(200).json({ message: 'Table missing or error', updated: 0 });
        }

        if (!pendingBets || pendingBets.length === 0) {
            return res.status(200).json({ message: 'No pending bets to update', updated: 0 });
        }

        // 2. Fetch latest raw_odds for these games
        const gamePks = [...new Set(pendingBets.map(b => b.game_pk))];
        const { data: rawOdds, error: oddsErr } = await mlbDb
            .from('raw_odds')
            .select('game_pk, market, outcome_name, implied_prob_novig, as_of_ts')
            .in('game_pk', gamePks);

        if (oddsErr) {
            console.warn('[MLB CLV] Error fetching raw odds:', oddsErr.message);
            return res.status(200).json({ message: 'raw_odds table missing or error', updated: 0 });
        }

        // Group latest odds
        const latestOdds: Record<string, any> = {};
        for (const r of (rawOdds || [])) {
            // we map moneyline/spread to market
            const m = r.market.toLowerCase();
            const k = `${r.game_pk}_${m}_${r.outcome_name}`;
            if (!latestOdds[k] || r.as_of_ts > latestOdds[k].as_of_ts) {
                latestOdds[k] = r;
            }
        }

        let updateCount = 0;
        
        // 3. Update closing_prob and clv_pts
        // Promise.all for updates
        const updatePromises = pendingBets.map(async (bet) => {
            // Note: bet.selection (e.g. 'NYY') might not exactly match outcome_name (e.g. 'New York Yankees').
            // We need a mapping, or we just rely on the predictor engine to do the CLV since it has the team mappings.
        });

        await Promise.all(updatePromises);

        return res.status(200).json({ message: 'Success (No-op in Hub)', updated: updateCount });

    } catch (error: any) {
        console.error('CLV Update Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
