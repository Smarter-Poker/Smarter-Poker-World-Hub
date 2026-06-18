import type { NextApiRequest, NextApiResponse } from 'next';
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import Cors from 'cors';

const cors = Cors({
  methods: ['GET', 'HEAD'],
});

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return handleRequest(req, res);
}

async function handleRequest(req: NextApiRequest, res: NextApiResponse) {
    await runMiddleware(req, res, cors);
    try {
        const mlbDb = getMlbSupabase();
        
        // Compute 'today' in America/Chicago
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const todayStr = formatter.format(new Date());
        
        // 24 hours ago
        const yesterdayDate = new Date();
        yesterdayDate.setHours(yesterdayDate.getHours() - 24);
        const last24hIso = yesterdayDate.toISOString();

        // Use the optimized RPC to gather all metrics in a single network trip
        const { data: rpcData, error: rpcError } = await mlbDb.rpc('get_mlb_status_metrics', {
            last_24h_iso: last24hIso,
            today_str: todayStr
        });

        if (rpcError) throw rpcError;

        const pipelineData = rpcData?.pipeline_runs || [];
        const latestPred = rpcData?.latest_pred_as_of ? [{ as_of_ts: rpcData.latest_pred_as_of }] : [];
        const marketBetsCount = rpcData?.market_bets_count || 0;
        const propsCount = rpcData?.props_count || 0;
        const bestBetsCount = rpcData?.best_bets_count || 0;
        const sizeMarket = rpcData?.size_market || 0;
        const sizeProps = rpcData?.size_props || 0;
        const sizeFactGames = rpcData?.size_fact_games || 0;
        const sizeOdds = rpcData?.size_odds || 0;

        const latestRuns: any = {};
        const stages = ['ingest', 'heal', 'evaluate', 'export', 'alert', 'track', 'grade_props', 'grade', 'push', 'predict'];
        let hasError = false;

        if (pipelineData) {
            pipelineData.forEach(run => {
                if (!latestRuns[run.stage] && stages.includes(run.stage)) {
                    latestRuns[run.stage] = run;
                    if (run.status === 'error') {
                        hasError = true;
                    }
                }
            });
        }
        
        // 2. Freshness
        let aggMarketAsOf = latestPred?.[0]?.as_of_ts || null;
        let marketDateStr: string | null = null;
        let isDateStale = true; // Default to stale if no data exists
        
        if (aggMarketAsOf) {
            const marketDate = new Date(aggMarketAsOf);
            // If the latest prediction is newer than 24 hours ago, it's fresh
            if (marketDate >= yesterdayDate) {
                isDateStale = false;
            }
            
            // Format for UI display (simplifying the ISO string for visual display)
            if (aggMarketAsOf.includes('T')) {
                marketDateStr = aggMarketAsOf.split('T')[0];
            }
        }

        // Determine System Freshness
        const isSystemFresh = !hasError && !isDateStale;
        
        return res.status(200).json({
            todayStr,
            aggMarketAsOf: marketDateStr,
            isSystemFresh,
            marketBetsCount: marketBetsCount || 0,
            propsCount: propsCount || 0,
            bestBetsCount: bestBetsCount || 0,
            latestRuns,
            sizes: {
                market: sizeMarket || 0,
                props: sizeProps || 0,
                games: sizeFactGames || 0,
                odds: sizeOdds || 0
            }
        });
    } catch (err) {
        console.error('Error fetching status data:', err);
        return res.status(500).json({ error: true });
    }
}
