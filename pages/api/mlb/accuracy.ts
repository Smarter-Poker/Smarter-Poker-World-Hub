import { getMlbSupabase } from '../../../utils/supabase/mlb';

interface MarketRow {
  date: string;
  market: string;
  n: number;
  brier: number | null;
  avg_clv: number | null;
  sum_unit_profit: number;
  bet_count: number;
}

interface Kpi {
  n: number;
  clv: number;
  roi: number;
  brier: number;
}

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    let tableData: MarketRow[] = [];
    let kpi: Kpi = { n: 0, clv: 0, roi: 0, brier: 0 };

    // PRIMARY: per-market-per-date rows from the summary view. We return the raw
    // per-market breakdown so the client can filter by market category and aggregate
    // by date. KPIs are computed portfolio-wide here:
    //   - Brier / CLV: n-weighted, but ONLY over rows where the metric is present
    //     (rows with a null metric must NOT inflate the denominator — that biases the
    //     average toward zero; e.g. it understated Brier ~0.142 vs the true ~0.165).
    //   - ROI: true portfolio return = total unit profit / total bets placed * 100.
    const { data: summaryData, error: sumErr } = await mlbDb
      .from('v_backtest_summary')
      .select('date, market, n, brier, avg_clv, sum_unit_profit, bet_count')
      .order('date', { ascending: false });

    if (!sumErr && summaryData && summaryData.length > 0) {
      let totalN = 0;
      let brierNum = 0,
        brierWeight = 0;
      let clvNum = 0,
        clvWeight = 0;
      let totalProfit = 0,
        totalBets = 0;

      for (const row of summaryData as any[]) {
        const n = Number(row.n) || 0;
        if (n <= 0) continue;
        const brier = row.brier != null ? Number(row.brier) : null;
        const clv = row.avg_clv != null ? Number(row.avg_clv) : null;
        const profit = Number(row.sum_unit_profit) || 0;
        const bets = Number(row.bet_count) || 0;

        tableData.push({
          date: row.date,
          market: String(row.market || 'unknown').toLowerCase(),
          n,
          brier,
          avg_clv: clv,
          sum_unit_profit: profit,
          bet_count: bets,
        });

        totalN += n;
        totalProfit += profit;
        totalBets += bets;
        if (brier != null) {
          brierNum += brier * n;
          brierWeight += n;
        }
        if (clv != null) {
          clvNum += clv * n;
          clvWeight += n;
        }
      }

      kpi = {
        n: totalN,
        brier: brierWeight > 0 ? (brierNum / brierWeight) : 0,
        clv: clvWeight > 0 ? (clvNum / clvWeight) : 0,
        roi: totalBets > 0 ? ((totalProfit / totalBets) * 100) : 0,
      };
    }
    // Removed fallback stub

    return new Response(
      JSON.stringify({
        tableData,
        kpi,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('[API/MLB/Accuracy] Error fetching backtest summary:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
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
