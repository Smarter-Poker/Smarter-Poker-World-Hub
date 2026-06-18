import { getMlbSupabase } from '../../../utils/supabase/mlb';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // Auth check
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.MLB_CRON_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
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
            return new Response(JSON.stringify({ message: 'Table missing or error', updated: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (!pendingBets || pendingBets.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending bets to update', updated: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. Fetch latest raw_odds for these games
        const gamePks = [...new Set(pendingBets.map(b => b.game_pk))];
        const { data: rawOdds, error: oddsErr } = await mlbDb
            .from('raw_odds')
            .select('game_pk, market, outcome_name, implied_prob_novig, as_of_ts')
            .in('game_pk', gamePks);

        if (oddsErr) {
            console.warn('[MLB CLV] Error fetching raw odds:', oddsErr.message);
            return new Response(JSON.stringify({ message: 'raw_odds table missing or error', updated: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

        return new Response(JSON.stringify({ message: 'Success (No-op in Hub)', updated: updateCount }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('CLV Update Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
