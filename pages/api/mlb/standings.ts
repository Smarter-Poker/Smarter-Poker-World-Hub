import { getMlbSupabase } from '../../../utils/supabase/mlb';

// Live MLB standings. Reads public.v_mlb_standings on the mlb-analytics-engine DB,
// which computes W/L/PCT/GB/run-diff/L10/streak/home-away splits + a 0-100
// power_score from fact_games for the current season. The page maps power_score
// onto the canonical ELITE/STRONG/LEAN/THIN/PASS tiers (src/lib/betScore.ts).
async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const EMPTY = (extra: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({ teams: [], season: null, updated: new Date().toISOString(), ...extra }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      }
    );

  try {
    const mlbDb = getMlbSupabase();

    const [standingsRes, seasonRes] = await Promise.all([
      // get_mlb_standings_ext() returns the base v_mlb_standings rows enriched with
      // runs_per_game, runs_allowed_per_game, era, whip, team_avg/obp/slg/ops sourced
      // from the daily-refreshed agg_team snapshots. (Plain v_mlb_standings has none of
      // those, which is why ERA/AVG/R-G/RA-G rendered as "--".)
      mlbDb.rpc('get_mlb_standings_ext'),
      mlbDb
        .from('fact_games')
        .select('official_date')
        .eq('final', true)
        .order('official_date', { ascending: false })
        .limit(1),
    ]);

    if (standingsRes.error) {
      console.warn('[API/MLB/Standings] Error fetching standings:', standingsRes.error.message);
      return EMPTY({ error: 'standings_unavailable', last_game_date: null });
    }

    // RPC returns a jsonb array of team rows.
    const teams = Array.isArray(standingsRes.data) ? standingsRes.data : [];
    const latestDate: string | undefined = seasonRes.data?.[0]?.official_date;
    const season = latestDate ? new Date(latestDate).getUTCFullYear() : null;

    return new Response(
      JSON.stringify({
        teams,
        season,
        last_game_date: latestDate ?? null,
        updated: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
        },
      }
    );
  } catch (err) {
    console.error('[API/MLB/Standings] Unhandled error:', err);
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
