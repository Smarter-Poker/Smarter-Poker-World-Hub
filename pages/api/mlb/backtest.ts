import { getMlbSupabase } from '../../../utils/supabase/mlb';





async function edgeHandler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const mlbDb = getMlbSupabase();

        // Fetch daily trend
        const { data: accuracyData, error: accErr } = await mlbDb
            .from('v_backtest_summary')
            .select('*')
            .order('date', { ascending: false })
            .limit(14);

        if (accErr) {
            console.error("Failed to fetch v_backtest_summary:", accErr);
        }

        let statsData;
        let marketBreakdown;

        // Try RPC first
        const { data: rpcData, error: rpcErr } = await mlbDb.rpc('get_mlb_backtest_stats');
        
        if (!rpcErr && rpcData) {
            statsData = rpcData.stats;
            marketBreakdown = rpcData.marketBreakdown;
        } else {
            // Fallback logic using sim_bets
            console.warn('RPC failed or not found, falling back to manual aggregation on sim_bets', rpcErr);
            const { count, error: countErr } = await mlbDb
                .from('sim_bets')
                .select('*', { count: 'exact', head: true });
                
            if (countErr) throw countErr;

            let allMarketRows: any[] = [];
            const limit = 1000;
            const numPages = Math.ceil((count || 0) / limit);
            
            if (numPages > 0) {
                // Chunk the requests to prevent Vercel 504 timeouts on large datasets
                for (let i = 0; i < numPages; i += 5) {
                    const promises: any[] = [];
                    for (let j = 0; j < 5 && (i + j) < numPages; j++) {
                        const offset = (i + j) * limit;
                        promises.push(
                            mlbDb
                                .from('sim_bets')
                                .select('market, pnl, result')
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

            const totalPredictions = allMarketRows.length;
            
            const wonBets = allMarketRows.filter(r => Number(r.pnl || 0) > 0);
            const lostBets = allMarketRows.filter(r => Number(r.pnl || 0) <= 0 && r.result != null);
            const winRate = totalPredictions > 0 ? (wonBets.length / totalPredictions) * 100 : 0;
            
            // Note: sim_bets fallback lacks brier and CLV columns — return null
            // so the UI shows '—' rather than a false 0 that triggers FAIL on Lock-In Gate
            const avgBrier = null;
            const brierVsBaseline = null;
            const avgClv = null;

            const unitsWon = allMarketRows.reduce((sum: number, r: any) => sum + Number(r.pnl || 0), 0);
            const cumulativeRoi = totalPredictions > 0 ? (unitsWon / totalPredictions) * 100 : 0;

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
                
                marketGroups[m].n += 1;
                if (Number(row.pnl || 0) > 0) marketGroups[m].wins += 1;
                marketGroups[m].profitSum += Number(row.pnl || 0);
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
                    avgBrier: null,
                    roi: mg.n > 0 ? (mg.profitSum / mg.n) * 100 : null
                };
            });
        }

        return new Response(JSON.stringify({
            dailyTrend: accuracyData || [],
            marketBreakdown: marketBreakdown || [],
            stats: statsData || {
                totalPredictions: 0, wonBets: 0, lostBets: 0, winRate: 0, avgBrier: 0,
                brierVsBaseline: 0, cumulativeRoi: 0, unitsWon: 0, avgClv: 0
            }
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900'
            }
        });
    } catch (err: any) {
        console.error('Error in /api/mlb/backtest:', err);
        return new Response(JSON.stringify({ error: err.message }), {
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