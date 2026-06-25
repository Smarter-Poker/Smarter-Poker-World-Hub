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
    const { data: rpcData, error: rpcError } = await mlbDb.rpc('get_mlb_model_intel');

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
          sparkline: []
        })) : [],
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
        // Model intel data changes at most once per day — 30-min cache, 1-hr stale
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
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
      win_pct: null,
      recent_roi: 0,
      overall_roi: 0,
      avg_brier: null,
      avg_clv: null,
      data_through: null,
    },
    gate: { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' },
    tableData: [],
    history: [],
    clvTrend: [],
    calibration: [],
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

  // Build tableData (raw per-market-per-date rows for the Daily Performance Log + Gate)
  const tableData = rows.map((r: any) => ({
    date: r.date,
    market: String(r.market || 'unknown').toLowerCase(),
    n: Number(r.n) || 0,
    brier: r.brier != null ? Number(r.brier) : null,
    avg_clv: r.avg_clv != null ? Number(r.avg_clv) : null,
    sum_unit_profit: Number(r.sum_unit_profit) || 0,
    bet_count: Number(r.bet_count) || 0,
  }));

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
      win_pct: null as number | null,   // not available in summary view — populated by RPC
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

  // Compute gate KPIs from summary data
  const totalProfit2 = dailySorted.reduce((s, g) => s + g.profit, 0);
  const totalBets2 = dailySorted.reduce((s, g) => s + g.bets, 0);
  const totalGraded2 = dailySorted.reduce((s, g) => s + g.graded, 0);
  const bNum2 = dailySorted.reduce((s, g) => s + g.bNum, 0);
  const bDen2 = dailySorted.reduce((s, g) => s + g.bDen, 0);
  const cNum2 = dailySorted.reduce((s, g) => s + g.cNum, 0);
  const cDen2 = dailySorted.reduce((s, g) => s + g.cDen, 0);

  const gate = {
    n: totalGraded2,
    brier: bDen2 > 0 ? (bNum2 / bDen2).toFixed(3) : '0.000',
    clv: cDen2 > 0 ? (cNum2 / cDen2).toFixed(2) : '0.00',
    roi: totalBets2 > 0 ? ((totalProfit2 / totalBets2) * 100).toFixed(1) : '0.0',
  };

  // ── Rolling 14-day CLV trend ──────────────────────────────────────────────
  const clvTrend = dailySorted
    .map((g, i) => {
      const window = dailySorted.slice(Math.max(0, i - 13), i + 1);
      const wN = window.reduce((s: number, d: any) => s + d.cDen, 0);
      const wC = window.reduce((s: number, d: any) => s + d.cNum, 0);
      return { date: g.date, rolling_clv: wN > 0 ? Number((wC / wN).toFixed(2)) : 0 };
    })
    .filter((_: any, i: number) => i >= 13);

  // ── Calibration buckets ───────────────────────────────────────────────────
  const BUCKETS = 10;
  const bucketN = Array(BUCKETS).fill(0);
  const bucketWins = Array(BUCKETS).fill(0);

  for (const r of rows) {
    const brier = r.brier != null ? Number(r.brier) : null;
    const n = Number(r.n) || 0;
    if (brier == null || n === 0) continue;
    const predicted_p = 0.5 + Math.sqrt(Math.max(0, 0.25 - brier));
    const bucket = Math.min(BUCKETS - 1, Math.floor(predicted_p * BUCKETS));
    bucketN[bucket] += n;
    const clv = r.avg_clv != null ? Number(r.avg_clv) : 0;
    
  }

  const calibration = Array.from({ length: BUCKETS }, (_, i) => {
    const low = i * 10;
    const high = low + 10;
    const mid = low + 5;
    const n = bucketN[i];
    return {
      bucket_label: `${low}-${high}%`,
      predicted_prob: mid,
      actual_win_rate: 0,
      n,
    };
  }).filter((b) => b.n > 0);

  // ── Bet-type sparklines (last 8 CLV data points as portfolio proxy) ───────
  const betTypesWithSparklines = betTypes.map((b: any) => ({
    ...b,
    sparkline: [],
  }));

  return {
    intel: {
      model_version: mvRes?.data && mvRes.data.length > 0 ? mvRes.data[0].model_version : null,
      total_bets_tracked: totalBets2,
      graded_predictions: totalGraded2,
      win_pct: null,  // not derivable from v_backtest_summary alone
      recent_roi: rBets > 0 ? Number(((rNum / rBets) * 100).toFixed(2)) : 0,
      overall_roi: totalBets2 > 0 ? Number(((totalProfit2 / totalBets2) * 100).toFixed(2)) : 0,
      avg_brier: bDen2 > 0 ? Number((bNum2 / bDen2).toFixed(4)) : null,
      avg_clv: cDen2 > 0 ? Number((cNum2 / cDen2).toFixed(2)) : null,
      data_through: history.length > 0 ? history[history.length - 1].date : null,
    },
    gate,
    tableData,
    history,
    clvTrend,
    calibration,
    markets: marketsArr,
    betTypes: betTypesWithSparklines,
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
