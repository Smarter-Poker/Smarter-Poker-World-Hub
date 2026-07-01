import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Shape returned to the client. Kept stable so the page never has to guess.
interface ModelIntelResponse {
  intel: {
    model_version: string | null;
    total_bets_tracked: number;
    graded_predictions: number;
    win_pct: number | null;
    recent_roi: number;
    overall_roi: number;
    avg_brier: number | null;
    avg_clv: number | null;
    data_through: string | null;
  };
  gate: {
    n: number;
    clv: string;
    roi: string;
    brier: string;
  };
  tableData: Array<{
    date: string;
    market: string;
    n: number;
    brier: number | null;
    avg_clv: number | null;
    sum_unit_profit: number;
    bet_count: number;
  }>;
  history: Array<{ date: string; pnl: number; cum_pnl: number; bets: number; roi: number }>;
  // Rolling 14-day CLV trend (one point per active date)
  clvTrend: Array<{ date: string; rolling_clv: number }>;
  // Calibration buckets — predicted probability vs actual win rate
  calibration: Array<{
    bucket_label: string;
    predicted_prob: number;
    actual_win_rate: number;
    n: number;
  }>;
  markets: Array<{
    market: string;
    n: number;
    bets: number;
    win_pct: number | null;
    brier: number | null;
    avg_clv: number | null;
    roi: number | null;
    units: number;
  }>;
  betTypes: Array<{
    bet_type: string;
    category: string | null;
    sample_n: number;
    win_pct: number | null;
    roi: number | null;
    avg_clv: number | null;
    status: string | null;
    score_mult: number | null;
    // Sparkline: last 8 daily CLV data points for this bet type
    sparkline: Array<{ date: string; clv: number }>;
  }>;
}

const num = (v: any): number | null => {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function edgeHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    // PRIMARY PATH: a single bounded RPC that aggregates v_backtest_summary server-side
    // (one row per date), computes the correct cumulative P&L curve + n-weighted Brier/CLV
    // + portfolio ROI, and bundles the bet-type trust ledger and real model_version.
    const { data: rpcDataRaw, error: rpcError } = await mlbDb.rpc('get_mlb_model_intel');
    const rpcData = rpcDataRaw as any; // RPC not in generated Supabase types

    let payload: ModelIntelResponse | null = null;

    if (!rpcError && rpcData && rpcData.kpi) {
      const k = rpcData.kpi || {};
      payload = {
        intel: {
          model_version: rpcData.model_version ?? null,
          total_bets_tracked: Number(k.total_bets) || 0,
          graded_predictions: Number(k.graded_predictions) || 0,
          win_pct: num(k.win_pct),
          recent_roi: num(rpcData.recent_roi) ?? 0,
          overall_roi: num(k.overall_roi) ?? 0,
          avg_brier: num(k.avg_brier),
          avg_clv: num(k.avg_clv),
          data_through: k.data_through ?? null,
        },
        gate: rpcData.gate ?? { 
          n: Number(k.graded_predictions) || 0, 
          // Format as strings to match TypeScript interface declaration (clv: string, roi: string, brier: string)
          clv: (num(k.avg_clv) ?? 0).toFixed(2), 
          roi: (num(k.overall_roi) ?? 0).toFixed(1), 
          brier: (num(k.avg_brier) ?? 0).toFixed(3) 
        },
        tableData: Array.isArray(rpcData.table_data) ? rpcData.table_data : [],
        history: Array.isArray(rpcData.history) ? rpcData.history : [],
        clvTrend: Array.isArray(rpcData.clv_trend) ? rpcData.clv_trend : [],
        calibration: Array.isArray(rpcData.calibration) ? rpcData.calibration : [],
        markets: Array.isArray(rpcData.markets) ? rpcData.markets : [],
        betTypes: Array.isArray(rpcData.bet_types) ? rpcData.bet_types.map((b: any) => ({
          ...b,
          // Preserve sparkline from RPC if it returned one; fall back to [] if absent/invalid.
          sparkline: Array.isArray(b.sparkline) ? b.sparkline : [],
        })) : [],
      };
    } else if (rpcError) {
      console.error('[API/MLB/ModelIntel] RPC failed:', rpcError?.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // RPC succeeded but returned empty/null kpi (e.g. pre-season, no graded data yet)
      // Return an empty payload with 200 rather than crashing with 500
      payload = {
        intel: { model_version: null, total_bets_tracked: 0, graded_predictions: 0, win_pct: null, recent_roi: 0, overall_roi: 0, avg_brier: null, avg_clv: null, data_through: null },
        gate: { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' },
        tableData: [], history: [], clvTrend: [], calibration: [], markets: [], betTypes: [],
      };
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Model intel data changes at most once per day — 30-min cache, 1-hr stale
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[API/MLB/ModelIntel] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // x-forwarded-proto can be a comma-separated list behind multiple proxies (e.g. "https, http").
    // Always take the first value to avoid malformed URLs.
    const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : (req.headers['x-forwarded-proto'] || 'http');
    const protocol = rawProto.split(',')[0].trim();
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
