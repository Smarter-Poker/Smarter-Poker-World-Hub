import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

        const { days: queryDays } = req.query;
        const days = queryDays ? parseInt(queryDays as string, 10) : null;
        const mlbDb = getMlbSupabase();
        
        let rows: any[] = [];
        let activeDays: number | null = null;
        
        if (days && !isNaN(days)) {
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const { data, error } = await mlbDb
                .from('backtest_market_output')
                .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                .gte('created_at', cutoff)
                .not('actual_result', 'is', null);
                
            if (error) {
                console.warn('Filter by created_at failed (possibly missing column). Falling back to unfiltered.', error.message);
                const fallback = await mlbDb
                    .from('backtest_market_output')
                    .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                    .not('actual_result', 'is', null);
                if (fallback.error) throw fallback.error;
                rows = fallback.data || [];
            } else {
                rows = data || [];
                activeDays = days;
            }
        } else {
            const { data, error } = await mlbDb
                .from('backtest_market_output')
                .select('model_prob, market_novig_prob, actual_result, edge_pts, unit_profit, rec')
                .not('actual_result', 'is', null);
            if (error) throw error;
            rows = data || [];
        }
        
        if (!rows || rows.length === 0) {
            return res.status(200).json({ stats: null });
        }
        
        const brier = (prob: number | null, result: any) => {
            if (typeof prob !== 'number') return 0;
            const isWin = result === true || String(result).toLowerCase() === 'true' || result === 1;
            return Math.pow(prob - (isWin ? 1 : 0), 2);
        };
        
        // 1. ALL GRADED OUTCOMES
        let allModelBrierSum = 0;
        let allMktBrierSum = 0;
        let allModelCount = 0;
        let allMktCount = 0;
        
        rows.forEach(r => {
            if (r.model_prob !== null) {
                allModelBrierSum += brier(r.model_prob, r.actual_result);
                allModelCount++;
            }
            if (r.market_novig_prob !== null) {
                allMktBrierSum += brier(r.market_novig_prob, r.actual_result);
                allMktCount++;
            }
        });
        
        const allModelBrier = allModelCount > 0 ? allModelBrierSum / allModelCount : 0;
        const allMktBrier = allMktCount > 0 ? allMktBrierSum / allMktCount : null;
        
        // 2. ENGINE'S FLAGGED BETS
        const flagged = rows.filter(r => (r.rec || '').includes('BET'));
        
        let flagWins = 0;
        let flagUnitProfit = 0;
        let flagModelBrierSum = 0;
        let flagModelCount = 0;
        let flagMktBrierSum = 0;
        let flagMktCount = 0;
        
        flagged.forEach(r => {
            const isWin = r.actual_result === true || String(r.actual_result).toLowerCase() === 'true' || r.actual_result === 1;
            if (isWin) flagWins++;
            flagUnitProfit += Number(r.unit_profit || 0);
            if (r.model_prob !== null) {
                flagModelBrierSum += brier(r.model_prob, r.actual_result);
                flagModelCount++;
            }
            if (r.market_novig_prob !== null) {
                flagMktBrierSum += brier(r.market_novig_prob, r.actual_result);
                flagMktCount++;
            }
        });
        
        const flagWinRate = flagged.length > 0 ? (flagWins / flagged.length) * 100 : 0;
        const flagRoi = flagged.length > 0 ? (flagUnitProfit / flagged.length) * 100 : 0;
        const flagModelBrier = flagModelCount > 0 ? flagModelBrierSum / flagModelCount : 0;
        const flagMktBrier = flagMktCount > 0 ? flagMktBrierSum / flagMktCount : null;
        
        // 3. ROI BY EDGE SIZE
        const buckets: Record<string, { n: number; wins: number; profit: number }> = {
            '10+ pts': { n: 0, wins: 0, profit: 0 },
            '7-10 pts': { n: 0, wins: 0, profit: 0 },
            '5-7 pts': { n: 0, wins: 0, profit: 0 },
            '3-5 pts': { n: 0, wins: 0, profit: 0 },
        };
        
        flagged.forEach((r) => {
            const e = Number(r.edge_pts || 0);
            let b: string | null = null;
            if (e >= 10) b = '10+ pts';
            else if (e >= 7 && e < 10) b = '7-10 pts';
            else if (e >= 5 && e < 7) b = '5-7 pts';
            else if (e >= 3 && e < 5) b = '3-5 pts';
            
            if (b) {
                buckets[b].n++;
                const isWin = r.actual_result === true || String(r.actual_result).toLowerCase() === 'true' || r.actual_result === 1;
                if (isWin) buckets[b].wins++;
                buckets[b].profit += Number(r.unit_profit || 0);
            }
        });
        
        const edgeData = ['10+ pts', '7-10 pts', '5-7 pts', '3-5 pts'].map(k => {
            const b = buckets[k];
            const winPct = b.n > 0 ? Math.round((b.wins / b.n) * 100) : 0;
            const roi = b.n > 0 ? (b.profit / b.n) * 100 : 0;
            return { edge: k, n: b.n, winPct, roi };
        });

        return res.status(200).json({
            stats: {
                activeDays,
                all: {
                    count: rows.length,
                    modelBrier: allModelBrier,
                    mktBrier: allMktBrier
                },
                flagged: {
                    count: flagged.length,
                    winRate: flagWinRate,
                    roi: flagRoi,
                    modelBrier: flagModelBrier,
                    mktBrier: flagMktBrier
                },
                edgeData
            }
        });
    } catch (err: any) {
        console.error('Error fetching validation stats:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
