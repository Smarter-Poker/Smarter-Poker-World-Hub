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

    // Fetch recent backtest summary for history and global stats, plus the real
    // model version stamped on the simulated bet ledger (no fabricated version string).
    const [summaryRes, versionRes] = await Promise.all([
      mlbDb.from('v_backtest_summary').select('*').order('date', { ascending: false }).limit(10),
      mlbDb
        .from('sim_bets')
        .select('model_version')
        .not('model_version', 'is', null)
        .order('as_of_ts', { ascending: false })
        .limit(1),
    ]);

    const { data: summary, error: summaryError } = summaryRes;
    if (summaryError) {
      console.warn('[API/MLB/ModelIntel] Error fetching backtest summary:', summaryError.message);
    }

    const asOfTs =
      summary && summary.length > 0 ? summary[0].date : new Date().toISOString().split('T')[0];

    // total_bets_tracked = sum of real per-day prediction counts (column `n`).
    // recent_roi = n-weighted average ROI across the recent window (not one noisy day).
    const totalBets = summary
      ? summary.reduce((s: number, day: any) => s + (Number(day.n) || 0), 0)
      : 0;
    let roiNum = 0,
      roiDen = 0;
    if (summary) {
      summary.forEach((day: any) => {
        const n = Number(day.n) || 0;
        if (n > 0 && day.roi != null) {
          roiNum += Number(day.roi) * n;
          roiDen += n;
        }
      });
    }
    const recentRoi = roiDen > 0 ? Number((roiNum / roiDen).toFixed(2)) : 0;
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
        history: summary || [],
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
