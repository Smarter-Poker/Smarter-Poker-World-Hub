import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Shape returned to the client. Kept stable so the page never has to guess.
interface ModelIntelResponse {
  intel: {
    model_version: string | null;
    total_bets_tracked: number;
    graded_predictions: number;
    markets_tracked: number;
    recent_roi: number; // bets-weighted portfolio ROI, most recent 14 active dates
    overall_roi: number; // all-time portfolio ROI
    avg_brier: number | null; // n-weighted, lower is better
    avg_clv: number | null; // n-weighted closing-line value (pts)
    data_through: string | null; // most recent graded date (NOT a training date)
  };
  history: Array<{ date: string; pnl: number; cum_pnl: number; bets: number; roi: number }>;
  markets: Array<{
    market: string;
    n: number;
    bets: number;
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
    const { data: rpcData, error: rpcError } = await mlbDb.rpc('get_mlb_model_intel');

    let payload: ModelIntelResponse | null = null;

    if (!rpcError && rpcData && rpcData.kpi) {
      const k = rpcData.kpi || {};
      payload = {
        intel: {
          model_version: rpcData.model_version ?? null,
          total_bets_tracked: Number(k.total_bets) || 0,
          graded_predictions: Number(k.graded_predictions) || 0,
          markets_tracked: Number(k.markets_tracked) || 0,
          recent_roi: num(rpcData.recent_roi) ?? 0,
          overall_roi: num(k.overall_roi) ?? 0,
          avg_brier: num(k.avg_brier),
          avg_clv: num(k.avg_clv),
          data_through: k.data_through ?? null,
        },
        history: Array.isArray(rpcData.history) ? rpcData.history : [],
        markets: Array.isArray(rpcData.markets) ? rpcData.markets : [],
        betTypes: Array.isArray(rpcData.bet_types) ? rpcData.bet_types : [],
      };
    } else {
      if (rpcError) {
        console.warn('[API/MLB/ModelIntel] RPC unavailable, using fallback:', rpcError.message);
      }
      payload = await fallbackAggregate(mlbDb);
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
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

// FALLBACK: replicate the RPC aggregation in JS straight off v_backtest_summary.
// Paginated so it stays correct even if the view grows past the row cap (mirrors
// the proven chunked pattern in pages/api/mlb/accuracy.ts). Used only if the RPC errors.
async function fallbackAggregate(mlbDb: any): Promise<ModelIntelResponse> {
  const empty: ModelIntelResponse = {
    intel: {
      model_version: null,
      total_bets_tracked: 0,
      graded_predictions: 0,
      markets_tracked: 0,
      recent_roi: 0,
      overall_roi: 0,
      avg_brier: null,
      avg_clv: null,
      data_through: null,
    },
    history: [],
    markets: [],
    betTypes: [],
  };

  // Pull all rows in pages of 1000.
  const pageSize = 1000;
  let rows: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await mlbDb
      .from('v_backtest_summary')
      .select('date, market, n, brier, avg_clv, sum_unit_profit, bet_count')
      .order('date', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.warn('[API/MLB/ModelIntel] fallback summary error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < pageSize) break;
  }

  if (rows.length === 0) return empty;

  // Per-date and per-market rollups.
  const byDate = new Map<string, any>();
  const byMkt = new Map<string, any>();
  const markets = new Set<string>();

  for (const r of rows) {
    const n = Number(r.n) || 0;
    const bets = Number(r.bet_count) || 0;
    const profit = Number(r.sum_unit_profit) || 0;
    const brier = r.brier == null ? null : Number(r.brier);
    const clv = r.avg_clv == null ? null : Number(r.avg_clv);
    const d = r.date;
    const m = r.market || 'unknown';
    markets.add(m);

    if (!byDate.has(d)) {
      byDate.set(d, { date: d, bets: 0, profit: 0, graded: 0, bNum: 0, bDen: 0, cNum: 0, cDen: 0 });
    }
    const gd = byDate.get(d);
    gd.bets += bets;
    gd.profit += profit;
    gd.graded += n;
    if (brier != null) {
      gd.bNum += brier * n;
      gd.bDen += n;
    }
    if (clv != null) {
      gd.cNum += clv * n;
      gd.cDen += n;
    }

    if (!byMkt.has(m)) {
      byMkt.set(m, { market: m, n: 0, bets: 0, profit: 0, bNum: 0, bDen: 0, cNum: 0, cDen: 0 });
    }
    const gm = byMkt.get(m);
    gm.n += n;
    gm.bets += bets;
    gm.profit += profit;
    if (brier != null) {
      gm.bNum += brier * n;
      gm.bDen += n;
    }
    if (clv != null) {
      gm.cNum += clv * n;
      gm.cDen += n;
    }
  }

  const dailySorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const history = dailySorted.map((g) => {
    cum += g.profit;
    return {
      date: g.date,
      pnl: Number(g.profit.toFixed(2)),
      cum_pnl: Number(cum.toFixed(2)),
      bets: g.bets,
      roi: g.bets > 0 ? Number(((g.profit / g.bets) * 100).toFixed(2)) : 0,
    };
  });

  const marketsArr = Array.from(byMkt.values())
    .map((g) => ({
      market: g.market,
      n: g.n,
      bets: g.bets,
      brier: g.bDen > 0 ? Number((g.bNum / g.bDen).toFixed(4)) : null,
      avg_clv: g.cDen > 0 ? Number((g.cNum / g.cDen).toFixed(2)) : null,
      roi: g.bets > 0 ? Number(((g.profit / g.bets) * 100).toFixed(2)) : null,
      units: Number(g.profit.toFixed(2)),
    }))
    .sort((a, b) => b.n - a.n);

  const totalBets = dailySorted.reduce((s, g) => s + g.bets, 0);
  const totalProfit = dailySorted.reduce((s, g) => s + g.profit, 0);
  const totalGraded = dailySorted.reduce((s, g) => s + g.graded, 0);
  const bNum = dailySorted.reduce((s, g) => s + g.bNum, 0);
  const bDen = dailySorted.reduce((s, g) => s + g.bDen, 0);
  const cNum = dailySorted.reduce((s, g) => s + g.cNum, 0);
  const cDen = dailySorted.reduce((s, g) => s + g.cDen, 0);

  let rNum = 0,
    rBets = 0;
  history.slice(-14).forEach((h) => {
    rNum += (h.roi * h.bets) / 100;
    rBets += h.bets;
  });

  // bet-type trust ledger + real model version (independent small queries)
  const [btRes, mvRes] = await Promise.all([
    mlbDb
      .from('bet_type_reliability')
      .select('bet_type, category, sample_n, win_pct, roi, avg_clv, status, score_mult')
      .order('sample_n', { ascending: false }),
    mlbDb
      .from('sim_bets')
      .select('model_version')
      .not('model_version', 'is', null)
      .order('as_of_ts', { ascending: false })
      .limit(1),
  ]);

  const betTypes = (btRes.data || []).map((b: any) => ({
    bet_type: b.bet_type,
    category: b.category ?? null,
    sample_n: Number(b.sample_n) || 0,
    win_pct: num(b.win_pct),
    roi: num(b.roi),
    avg_clv: num(b.avg_clv),
    status: b.status ?? null,
    score_mult: num(b.score_mult),
  }));

  return {
    intel: {
      model_version: mvRes?.data && mvRes.data.length > 0 ? mvRes.data[0].model_version : null,
      total_bets_tracked: totalBets,
      graded_predictions: totalGraded,
      markets_tracked: markets.size,
      recent_roi: rBets > 0 ? Number(((rNum / rBets) * 100).toFixed(2)) : 0,
      overall_roi: totalBets > 0 ? Number(((totalProfit / totalBets) * 100).toFixed(2)) : 0,
      avg_brier: bDen > 0 ? Number((bNum / bDen).toFixed(4)) : null,
      avg_clv: cDen > 0 ? Number((cNum / cDen).toFixed(2)) : null,
      data_through: history.length > 0 ? history[history.length - 1].date : null,
    },
    history,
    markets: marketsArr,
    betTypes,
  };
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
