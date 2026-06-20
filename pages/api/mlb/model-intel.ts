import { getMlbSupabase } from '../../../utils/supabase/mlb';

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    // Pull the per-(date,market) backtest summary plus the real model version stamped on the
    // simulated bet ledger (no fabricated version string). v_backtest_summary columns:
    // date, market, n, brier, avg_clv, roi, sum_unit_profit, bet_count. Order desc + limit so
    // the most recent dates survive once the table grows past the 1000-row response cap.
    const [summaryRes, versionRes] = await Promise.all([
      mlbDb
        .from('v_backtest_summary')
        .select('date, sum_unit_profit, bet_count')
        .order('date', { ascending: false })
        .limit(2000),
      mlbDb
        .from('sim_bets')
        .select('model_version')
        .not('model_version', 'is', null)
        .order('as_of_ts', { ascending: false })
        .limit(1),
    ]);

    const { data: summaryRows, error: summaryError } = summaryRes;
    if (summaryError) {
      console.warn('[API/MLB/ModelIntel] Error fetching backtest summary:', summaryError.message);
    }

    // Collapse markets into one row per date and build a cumulative P&L (equity) curve.
    // "bets" is the real bet count; ROI is a portfolio return (profit / bets placed).
    const byDate = new Map<string, { date: string; bets: number; pnl: number }>();
    (summaryRows || []).forEach((r: any) => {
      const d = r.date;
      if (!byDate.has(d)) byDate.set(d, { date: d, bets: 0, pnl: 0 });
      const g = byDate.get(d)!;
      g.bets += Number(r.bet_count) || 0;
      g.pnl += Number(r.sum_unit_profit) || 0;
    });
    const dates = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    const history = dates.map((g) => {
      cum += g.pnl;
      return {
        date: g.date,
        pnl: Number(g.pnl.toFixed(2)),
        cum_pnl: Number(cum.toFixed(2)),
        bets: g.bets,
        roi: g.bets > 0 ? Number(((g.pnl / g.bets) * 100).toFixed(2)) : 0,
      };
    });

    const totalBets = dates.reduce((s, g) => s + g.bets, 0);
    // recent_roi = n-weighted ROI over the most recent 14 active dates (not one noisy day).
    let roiNum = 0,
      roiDen = 0;
    history.slice(-14).forEach((h) => {
      if (h.bets > 0) {
        roiNum += h.roi * h.bets;
        roiDen += h.bets;
      }
    });
    const recentRoi = roiDen > 0 ? Number((roiNum / roiDen).toFixed(2)) : 0;
    const asOfTs =
      history.length > 0 ? history[history.length - 1].date : new Date().toISOString().split('T')[0];
    const modelVersion =
      versionRes?.data && versionRes.data.length > 0 && versionRes.data[0].model_version
        ? versionRes.data[0].model_version
        : null;

    return new Response(
      JSON.stringify({
        intel: {
          total_bets_tracked: totalBets,
          recent_roi: recentRoi,
          model_version: modelVersion,
          last_training_date: asOfTs,
        },
        history,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
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
