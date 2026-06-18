import { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

        const mlbDb = getMlbSupabase();
        
        let tableData: any[] = [];
        let kpi = { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' };

        // Try getting view first
        const { data: summaryData, error: sumErr } = await mlbDb
            .from('v_backtest_summary')
            .select('*')
            .order('date', { ascending: false });
            
        if (!sumErr && summaryData && summaryData.length > 0) {
            let totalN = 0;
            let sumBrier = 0;
            let brierCount = 0;
            let sumClv = 0;
            let clvCount = 0;
            let totalProfit = 0;
            let totalBets = 0;

            summaryData.forEach((row: any) => {
                if (!row.n) return;
                totalN += row.n;
                
                if (row.brier !== null) {
                    sumBrier += row.brier;
                    brierCount++;
                }
                if (row.avg_clv !== null) {
                    sumClv += row.avg_clv;
                    clvCount++;
                }
                if (row.sum_unit_profit !== null && row.bet_count !== null) {
                    totalProfit += row.sum_unit_profit;
                    totalBets += row.bet_count;
                }
                tableData.push(row);
            });

            kpi.n = totalN;
            kpi.clv = clvCount > 0 ? (sumClv / clvCount).toFixed(2) : '0.00';
            kpi.roi = totalBets > 0 ? ((totalProfit / totalBets) * 100).toFixed(1) : '0.0';
            kpi.brier = brierCount > 0 ? (sumBrier / brierCount).toFixed(3) : '0.000';

        } else {
            // Fallback: manually aggregate backtest_market_output
            const { count, error: countErr } = await mlbDb
                .from('backtest_market_output')
                .select('*', { count: 'exact', head: true });
                
            if (!countErr && count !== null) {
                let allMarketRows: any[] = [];
                const limit = 1000;
                const numPages = Math.ceil((count || 0) / limit);
                
                if (numPages > 0) {
                    for (let i = 0; i < numPages; i += 5) {
                        const promises: any[] = [];
                        for (let j = 0; j < 5 && (i + j) < numPages; j++) {
                            const offset = (i + j) * limit;
                            promises.push(
                                mlbDb
                                    .from('backtest_market_output')
                                    .select('as_of_ts, market, brier_score, unit_profit, rec, actual_result')
                                    .range(offset, offset + limit - 1)
                            );
                        }
                        const results = await Promise.all(promises) as any[];
                        for (const r of results) {
                            if (r.error) throw r.error;
                            if (r.data) allMarketRows = allMarketRows.concat(r.data);
                        }
                    }
                }

                // Aggregate by date and market
                const groups: Record<string, any> = {};
                let totalN = 0;
                let sumBrier = 0;
                let brierCount = 0;
                let totalProfit = 0;

                for (const row of allMarketRows) {
                    if (!row.rec || !row.rec.includes('BET') || row.rec.includes('NO BET')) continue;
                    
                    const date = row.as_of_ts ? row.as_of_ts.split('T')[0] : 'Unknown';
                    const market = row.market || 'Unknown';
                    const key = `${date}_${market}`;
                    
                    if (!groups[key]) {
                        groups[key] = { date, market, n: 0, brierSum: 0, brierCount: 0, profitSum: 0 };
                    }
                    
                    groups[key].n++;
                    totalN++;
                    
                    if (row.brier_score != null) {
                        groups[key].brierSum += Number(row.brier_score);
                        groups[key].brierCount++;
                        sumBrier += Number(row.brier_score);
                        brierCount++;
                    }
                    
                    groups[key].profitSum += Number(row.unit_profit || 0);
                    totalProfit += Number(row.unit_profit || 0);
                }

                tableData = Object.values(groups).map(g => ({
                    date: g.date,
                    market: g.market,
                    n: g.n,
                    brier: g.brierCount > 0 ? g.brierSum / g.brierCount : null,
                    avg_clv: null,
                    roi: g.n > 0 ? (g.profitSum / g.n) * 100 : null
                })).sort((a, b) => b.date.localeCompare(a.date));

                kpi.n = totalN;
                kpi.clv = '0.00';
                kpi.roi = totalN > 0 ? ((totalProfit / totalN) * 100).toFixed(1) : '0.0';
                kpi.brier = brierCount > 0 ? (sumBrier / brierCount).toFixed(3) : '0.000';
            }
        }

        return res.status(200).json({
            tableData,
            kpi
        });
    } catch (error) {
        console.error('[API/MLB/Accuracy] Error fetching backtest summary:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
