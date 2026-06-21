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

    // Fetch Hitters and Pitchers concurrently
    // PostgREST caps responses at 1000 rows regardless of .limit(); page through with
    // .range() so the directory returns the full pool (~1950 hitters / ~1220 pitchers)
    // instead of the first 1000.
    const fetchAllRows = async (
      build: () => any,
      pageSize = 1000,
      maxRows = 20000
    ): Promise<any[]> => {
      let all: any[] = [];
      for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await build().range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        all = all.concat(rows);
        if (rows.length < pageSize) break;
      }
      return all;
    };

    // Hitters: only rows that have actually batted (pa > 0). This excludes the ~1100
    // pitchers/non-batters that exist in v_hitter_profile with NULL wRC+ and would
    // otherwise float to the TOP of the directory under Postgres' default
    // "DESC => NULLS FIRST" ordering. nullsFirst:false is a belt-and-suspenders guard.
    // player_id is a deterministic tiebreak so .range() pagination is stable across pages.
    const buildHitters = () =>
      mlbDb
        .from('v_hitter_profile')
        .select('player_id, full_name, team_id, wrc_plus, woba, pa')
        .gt('pa', 0)
        .order('wrc_plus', { ascending: false, nullsFirst: false })
        .order('pa', { ascending: false, nullsFirst: false })
        .order('player_id', { ascending: true });

    // Pitchers: only rows that have faced a batter (bf > 0). Lower FIP is better.
    const buildPitchers = () =>
      mlbDb
        .from('v_pitcher_profile')
        .select('player_id, full_name, team_id, fip, siera, bf')
        .gt('bf', 0)
        .order('fip', { ascending: true, nullsFirst: false })
        .order('bf', { ascending: false, nullsFirst: false })
        .order('player_id', { ascending: true });

    let hitters: any[] = [];
    let pitchers: any[] = [];
    let hittersFailed = false;
    let pitchersFailed = false;

    // Isolate the two fetches: a failure in one view must not blank the other.
    const [hRes, pRes] = await Promise.allSettled([
      fetchAllRows(buildHitters),
      fetchAllRows(buildPitchers),
    ]);

    if (hRes.status === 'fulfilled') {
      hitters = hRes.value;
    } else {
      hittersFailed = true;
      console.error('[MLB Players] hitter fetch failed:', hRes.reason);
    }

    if (pRes.status === 'fulfilled') {
      pitchers = pRes.value;
    } else {
      pitchersFailed = true;
      console.error('[MLB Players] pitcher fetch failed:', pRes.reason);
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
