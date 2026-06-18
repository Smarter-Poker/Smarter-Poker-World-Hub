import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Fetch daily trend
        const { data: accuracyData, error: accErr } = await mlbDb
            .from('backtest_accuracy')
            .select('*')
            .order('backtest_date', { ascending: false })
            .limit(14);

        if (accErr) {
            console.error("Failed to fetch backtest_accuracy:", accErr);
        }

        let statsData;
        let marketBreakdown;

        // Try RPC first
        const { data: rpcData, error: rpcErr } = await mlbDb.rpc('get_mlb_backtest_stats');
        
        if (!rpcErr && rpcData) {
            statsData = rpcData.stats;
            marketBreakdown = rpcData.marketBreakdown;
        } else {
            // Fallback logic
            console.warn('RPC failed or not found, falling back to manual aggregation', rpcErr);
            const { count, error: countErr } = await mlbDb
                .from('backtest_market_output')
                .select('*', { count: 'exact', head: true });
                
            if (countErr) throw countErr;

            let allMarketRows: any[] = [];
            const limit = 1000;
            const numPages = Math.ceil((count || 0) / limit);
            
            if (numPages > 0) {
                const promises: any[] = [];
                for (let i = 0; i < numPages; i++) {
                    const offset = i * limit;
                    promises.push(
                        mlbDb
                            .from('backtest_market_output')
                            .select('market, brier_score, unit_profit, clv_pts, rec, actual_result')
                            .range(offset, offset + limit - 1)
                    );
                }
                const results = await Promise.all(promises) as any[];
                for (const r of results) {
                    if (r.error) throw r.error;
                    if (r.data) allMarketRows = allMarketRows.concat(r.data);
                }
            }

            const allBets = allMarketRows.filter(r => r.rec && r.rec.includes('BET') && !r.rec.includes('NO BET'));
            const totalPredictions = allBets.length;
            
            const wonBets = allBets.filter(r => r.unit_profit > 0);
            const lostBets = allBets.filter(r => r.unit_profit <= 0 && r.actual_result !== null);
            const winRate = totalPredictions > 0 ? (wonBets.length / totalPredictions) * 100 : 0;
            
            const brierScores = allMarketRows.filter(r => r.brier_score !== null).map(r => r.brier_score);
            const avgBrier = brierScores.length > 0 ? brierScores.reduce((a: number, b: number) => a + b, 0) / brierScores.length : 0;
            const brierVsBaseline = brierScores.length > 0 ? avgBrier - 0.2500 : 0;
            
            const unitsWon = allBets.reduce((sum, r) => sum + (r.unit_profit || 0), 0);
            const cumulativeRoi = totalPredictions > 0 ? (unitsWon / totalPredictions) * 100 : 0;

            const avgClv = totalPredictions > 0 ? allBets.reduce((sum, r) => sum + (r.clv_pts || 0), 0) / totalPredictions : 0;

            statsData = {
                totalPredictions,
                wonBets: wonBets.length,
                lostBets: lostBets.length,
                winRate,
                avgBrier,
                brierVsBaseline,
                cumulativeRoi,
                unitsWon,
                avgClv
            };

            // Group by Market
            const marketGroups: any = {};
            for (const row of allMarketRows) {
                const m = row.market || 'Unknown';
                if (!marketGroups[m]) marketGroups[m] = { n: 0, wins: 0, brierSum: 0, brierCount: 0, profitSum: 0 };
                
                if (row.brier_score !== null) {
                    marketGroups[m].brierSum += row.brier_score;
                    marketGroups[m].brierCount += 1;
                }
                
                if (row.rec && row.rec.includes('BET') && !row.rec.includes('NO BET')) {
                    marketGroups[m].n += 1;
                    if (row.unit_profit > 0) marketGroups[m].wins += 1;
                    marketGroups[m].profitSum += (row.unit_profit || 0);
                }
            }
            
            marketBreakdown = Object.keys(marketGroups).map(m => {
                const mg = marketGroups[m];
                
                let displayMarket = m;
                if (m === 'h2h') displayMarket = 'Moneyline (h2h)';
                else if (m === 'total') displayMarket = 'Totals';
                else if (m === 'run_line') displayMarket = 'Run Line';
                else displayMarket = m.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                return {
                    market: displayMarket,
                    n: mg.n,
                    winRate: mg.n > 0 ? (mg.wins / mg.n) * 100 : 0,
                    avgBrier: mg.brierCount > 0 ? mg.brierSum / mg.brierCount : null,
                    roi: mg.n > 0 ? (mg.profitSum / mg.n) * 100 : null
                };
            });
        }

        res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
        return res.status(200).json({
            dailyTrend: accuracyData || [],
            marketBreakdown: marketBreakdown || [],
            stats: statsData || {
                totalPredictions: 0, wonBets: 0, lostBets: 0, winRate: 0, avgBrier: 0,
                brierVsBaseline: 0, cumulativeRoi: 0, unitsWon: 0, avgClv: 0
            }
        });
    } catch (err: any) {
        console.error('Error in /api/mlb/backtest:', err);
        return res.status(500).json({ error: err.message });
    }
}
