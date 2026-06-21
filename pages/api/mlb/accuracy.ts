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
  clv: string;
  roi: string;
  brier: string;
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
    let kpi: Kpi = { n: 0, clv: '0.00', roi: '0.0', brier: '0.000' };

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
        brier: brierWeight > 0 ? (brierNum / brierWeight).toFixed(3) : '0.000',
        clv: clvWeight > 0 ? (clvNum / clvWeight).toFixed(2) : '0.00',
        roi: totalBets > 0 ? ((totalProfit / totalBets) * 100).toFixed(1) : '0.0',
      };
    } else {
      // FALLBACK: aggregate raw sim_bets (only if the view is empty/unavailable).
      // Each sim_bets row is one placed bet; unit_profit is already stake-normalized
      // to units, so bet_count == row count keeps ROI math identical to the view.
      if (sumErr) {
        console.warn(
          '[API/MLB/Accuracy] v_backtest_summary unavailable, falling back to sim_bets:',
          sumErr.message
        );
      }
      const { count, error: countErr } = await mlbDb
        .from('sim_bets')
        .select('*', { count: 'exact', head: true });

      if (!countErr && count) {
        const limit = 1000;
        const numPages = Math.ceil(count / limit);
        let rows: any[] = [];

        for (let i = 0; i < numPages; i += 5) {
          const promises: any[] = [];
          for (let j = 0; j < 5 && i + j < numPages; j++) {
            const offset = (i + j) * limit;
            promises.push(
              mlbDb
                .from('sim_bets')
                .select('as_of_ts, market, unit_profit')
                .range(offset, offset + limit - 1)
            );
          }
          const results = (await Promise.all(promises)) as any[];
          for (const r of results) {
            if (r.error) throw r.error;
            if (r.data) rows = rows.concat(r.data);
          }
        }

        const groups: Record<string, MarketRow> = {};
        let totalProfit = 0,
          totalBets = 0;

        for (const row of rows) {
          if (row.unit_profit == null) continue;
          const date = row.as_of_ts ? String(row.as_of_ts).split('T')[0] : 'unknown';
          const market = String(row.market || 'unknown').toLowerCase();
          const key = `${date}_${market}`;
          if (!groups[key]) {
            groups[key] = {
              date,
              market,
              n: 0,
              brier: null,
              avg_clv: null,
              sum_unit_profit: 0,
              bet_count: 0,
            };
          }
          const g = groups[key];
          const profit = Number(row.unit_profit) || 0;
          g.n += 1;
          g.bet_count += 1;
          g.sum_unit_profit += profit;
          totalProfit += profit;
          totalBets += 1;
        }

        tableData = Object.values(groups).sort((a, b) =>
          String(b.date).localeCompare(String(a.date))
        );
        kpi = {
          n: totalBets,
          clv: '0.00',
          brier: '0.000',
          roi: totalBets > 0 ? ((totalProfit / totalBets) * 100).toFixed(1) : '0.0',
        };
      }
    }

    return new Response(
      JSON.stringify({
        tableData,
        kpi,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
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
