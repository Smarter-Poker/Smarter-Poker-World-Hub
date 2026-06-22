import { getMlbSupabase } from '../../../utils/supabase/mlb';

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const mlbDb = getMlbSupabase();

    // Directory RPCs return the full hitter/pitcher lists with real season stat lines
    // (AVG/HR/RBI/OBP/SLG/OPS + wRC+/wOBA/PA for hitters; W-L/SV/ERA/WHIP/K/IP/FIP for
    // pitchers) from the engine's daily fg_season snapshot. Each is isolated so one
    // failing list doesn't blank the other. Hitters come pre-sorted by wRC+ desc,
    // pitchers by strikeouts desc; the page re-sorts/filters per tab.
    let hitters: any[] = [];
    let pitchers: any[] = [];
    let hittersFailed = false;
    let pitchersFailed = false;

    const [hRes, pRes] = await Promise.allSettled([
      mlbDb.rpc('get_mlb_hitter_directory'),
      mlbDb.rpc('get_mlb_pitcher_directory'),
    ]);

    if (hRes.status === 'fulfilled' && !hRes.value.error) {
      hitters = Array.isArray(hRes.value.data) ? hRes.value.data : [];
    } else {
      hittersFailed = true;
      console.error(
        '[MLB Players] hitter directory failed:',
        hRes.status === 'fulfilled' ? hRes.value.error : hRes.reason
      );
    }

    if (pRes.status === 'fulfilled' && !pRes.value.error) {
      pitchers = Array.isArray(pRes.value.data) ? pRes.value.data : [];
    } else {
      pitchersFailed = true;
      console.error(
        '[MLB Players] pitcher directory failed:',
        pRes.status === 'fulfilled' ? pRes.value.error : pRes.reason
      );
    }

    const fetchError = hittersFailed || pitchersFailed;
    // If BOTH lists failed, return a real error status so the client renders its error
    // state instead of a deceptively-successful empty directory. A partial failure keeps
    // 200 plus the list that did load, with fetchError flagged for the inline banner.
    const status = hittersFailed && pitchersFailed ? 503 : 200;

    return new Response(
      JSON.stringify({
        hitters,
        pitchers,
        fetchError,
      }),
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...(status === 200
            ? { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
            : {}),
        },
      }
    );
  } catch (err) {
    console.error('Error fetching players:', err);
    return new Response(
      JSON.stringify({
        hitters: [],
        pitchers: [],
        fetchError: true,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
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
