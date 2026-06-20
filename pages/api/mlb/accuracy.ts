import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
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
            // v_backtest_summary real columns: date, market, n, brier, avg_clv, roi,
            // sum_unit_profit, bet_count. Aggregate per-date across markets, weighting
            // brier / clv / roi by n so the KPIs and table show real measured values
            // instead of the hardcoded zeros the previous (non-existent-column) read produced.
            const byDate: Record<string, { date: string; n: number; brierNum: number; clvNum: number; roiNum: number }> = {};
            let totalN = 0, gBrierNum = 0, gClvNum = 0, gRoiNum = 0;

            summaryData.forEach((row: any) => {
                const n = Number(row.n) || 0;
                if (n <= 0) return;
                totalN += n;
                const d = row.date;
                if (!byDate[d]) byDate[d] = { date: d, n: 0, brierNum: 0, clvNum: 0, roiNum: 0 };
                const g = byDate[d];
                g.n += n;
                if (row.brier != null) { g.brierNum += Number(row.brier) * n; gBrierNum += Number(row.brier) * n; }
                if (row.avg_clv != null) { g.clvNum += Number(row.avg_clv) * n; gClvNum += Number(row.avg_clv) * n; }
                if (row.roi != null) { g.roiNum += Number(row.roi) * n; gRoiNum += Number(row.roi) * n; }
            });

            tableData = Object.values(byDate).map((g) => ({
                date: g.date,
                market: 'All', // aggregated across all markets for that date
                n: g.n,
                brier: g.n > 0 ? Number((g.brierNum / g.n).toFixed(4)) : null,
                avg_clv: g.n > 0 ? Number((g.clvNum / g.n).toFixed(2)) : null,
                roi: g.n > 0 ? Number((g.roiNum / g.n).toFixed(2)) : null,
            })).sort((a, b) => String(b.date).localeCompare(String(a.date)));

            kpi.n = totalN;
            kpi.brier = totalN > 0 ? (gBrierNum / totalN).toFixed(3) : '0.000';
            kpi.clv = totalN > 0 ? (gClvNum / totalN).toFixed(2) : '0.00';
            kpi.roi = totalN > 0 ? (gRoiNum / totalN).toFixed(1) : '0.0';

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
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900'
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


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host || 'localhost';
        const url = `${protocol}://${host}${req.url}`;
        
        // Safely convert headers to Record<string, string>
        const safeHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                safeHeaders[key] = value.join(', ');
            } else if (value !== undefined) {
                safeHeaders[key] = value;
            }
        }
        
        const requestOptions: RequestInit = {
            method: req.method,
            headers: safeHeaders,
        };
        
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }
        
        const request = new Request(url, requestOptions);
        const response = await edgeHandler(request);
        
        res.status(response.status);
        response.headers.forEach((value, key) => {
            res.setHeader(key, value);
        });
        
        const text = await response.text();
        if (text) {
            try {
                res.json(JSON.parse(text));
            } catch {
                res.send(text);
            }
        } else {
            res.end();
        }
    } catch (err: any) {
        console.error('API Polyfill Error:', err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}