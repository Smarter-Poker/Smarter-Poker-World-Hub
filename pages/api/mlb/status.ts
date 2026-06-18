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

        // Parallelize all DB queries
        const [
            { data: pipelineData },
            { data: latestPred },
            { count: marketBetsCount },
            { count: propsCount },
            { count: bestBetsCount },
            { count: sizeMarket },
            { count: sizeProps },
            { count: sizeFactGames },
            { count: sizeOdds }
        ] = await Promise.all([
            mlbDb.from('pipeline_runs').select('*').order('run_at', { ascending: false }).limit(100),
            mlbDb.from('pred_market_output').select('as_of_ts').order('as_of_ts', { ascending: false }).limit(1),
            mlbDb.from('pred_market_output').select('*', { count: 'exact', head: true }).gte('as_of_ts', last24hIso),
            mlbDb.from('pred_props').select('*', { count: 'exact', head: true }).gte('as_of_ts', last24hIso),
            mlbDb.from('pred_best_bets').select('*', { count: 'exact', head: true }).eq('official_date', todayStr),
            mlbDb.from('pred_market_output').select('*', { count: 'exact', head: true }),
            mlbDb.from('pred_props').select('*', { count: 'estimated', head: true }),
            mlbDb.from('fact_games').select('*', { count: 'estimated', head: true }),
            mlbDb.from('raw_odds').select('*', { count: 'estimated', head: true })
        ]);

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
        if (aggMarketAsOf && aggMarketAsOf.includes('T')) {
            marketDateStr = aggMarketAsOf.split('T')[0]; // Simplify to YYYY-MM-DD
        }

        // Determine System Freshness
        const yesterdayStr = formatter.format(yesterdayDate);
        const isDateStale = marketDateStr && marketDateStr < yesterdayStr;
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
