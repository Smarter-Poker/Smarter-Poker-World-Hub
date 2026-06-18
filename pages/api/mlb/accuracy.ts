import { getMlbSupabase } from '../../../utils/supabase/mlb';



export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
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
            // Fallback: manually aggregate sim_bets
            const { count, error: countErr } = await mlbDb
                .from('sim_bets')
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
                                    .from('sim_bets')
                                    .select('as_of_ts, market, pnl, result')
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
                let totalProfit = 0;

                for (const row of allMarketRows) {
                    if (row.pnl === null) continue;
                    
                    const date = row.as_of_ts ? row.as_of_ts.split('T')[0] : 'Unknown';
                    const market = row.market || 'Unknown';
                    const key = `${date}_${market}`;
                    
                    if (!groups[key]) {
                        groups[key] = { date, market, n: 0, profitSum: 0 };
                    }
                    
                    groups[key].n++;
                    totalN++;
                    
                    groups[key].profitSum += Number(row.pnl || 0);
                    totalProfit += Number(row.pnl || 0);
                }

                tableData = Object.values(groups).map(g => ({
                    date: g.date,
                    market: g.market,
                    n: g.n,
                    brier: null,
                    avg_clv: null,
                    roi: g.n > 0 ? (g.profitSum / g.n) * 100 : null
                })).sort((a, b) => b.date.localeCompare(a.date));

                kpi.n = totalN;
                kpi.clv = '0.00';
                kpi.roi = totalN > 0 ? ((totalProfit / totalN) * 100).toFixed(1) : '0.0';
                kpi.brier = '0.000';
            }
        }

        return new Response(JSON.stringify({
            tableData,
            kpi
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (error) {
        console.error('[API/MLB/Accuracy] Error fetching backtest summary:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
