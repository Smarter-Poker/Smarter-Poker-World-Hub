// @ts-nocheck
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

    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // todayStr is in America/Chicago (CST/CDT). Games stored in UTC (raw_games.event_time).
    // Window = TODAY 06:00Z (1am CDT) + 30h so the full slate including West Coast night
    // games is covered. (Previous code anchored on the PRIOR day, so today's games always
    // fell outside the window and the tracker was permanently empty; it also queried a
    // nonexistent start_time column and swallowed the 42703 error as an empty 200.)
    const windowStart = `${todayStr}T06:00:00Z`;
    const windowEnd = new Date(new Date(windowStart).getTime() + 30 * 60 * 60 * 1000).toISOString();

    const { data: dataRaw, error } = await mlbDb
      .from('raw_games')
      .select('game_pk, event_time, status, knowledge_time, payload')
      .not('event_time', 'is', null)
      .gte('event_time', windowStart)
      .lt('event_time', windowEnd)
      .order('knowledge_time', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[API/MLB/Tracker] Error fetching games from raw_games:', error.message);
      return new Response(JSON.stringify({ games: [], error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' },
      });
    }

<<<<<<< Updated upstream
    try {
        const mlbDb = getMlbSupabase();
        
        const todayStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        // todayStr is in America/Chicago (CST/CDT). Games stored in UTC (raw_games.event_time).
        // Window = TODAY 06:00Z (1am CDT) + 30h so the full slate including West Coast night
        // games is covered. (Previous code anchored on the PRIOR day, so today's games always
        // fell outside the window and the tracker was permanently empty; it also queried a
        // nonexistent start_time column and swallowed the 42703 error as an empty 200.)
        const windowStart = `${todayStr}T06:00:00Z`;
        const windowEnd = new Date(new Date(windowStart).getTime() + 30 * 60 * 60 * 1000).toISOString();

        const { data: dataRaw, error } = await mlbDb
            .from('raw_games')
            .select('game_pk, event_time, status, knowledge_time, payload')
            .not('event_time', 'is', null)
            .gte('event_time', windowStart)
            .lt('event_time', windowEnd)
            .order('knowledge_time', { ascending: false })
            .limit(200);

        if (error) {
            console.warn('[API/MLB/Tracker] Error fetching games from raw_games:', error.message);
            return new Response(JSON.stringify({ games: [], error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' }
            });
        }

        // raw_games is bi-temporal (one row per ingest snapshot) — keep only the freshest
        // snapshot per game_pk, then order by first pitch.
        const latestByGame = new Map<number, any>();
        for (const row of (dataRaw as any[]) || []) {
            if (!latestByGame.has(row.game_pk)) latestByGame.set(row.game_pk, row);
        }
        const mappedGames = Array.from(latestByGame.values())
            .map((game: any) => {
                const teams = game.payload?.teams || {};
                return {
                    game_pk: game.game_pk,
                    start_time: game.event_time,
                    away_team: teams.away?.team?.name || 'TBD',
                    home_team: teams.home?.team?.name || 'TBD',
                    away_score: teams.away?.score ?? null,
                    home_score: teams.home?.score ?? null,
                    status: game.payload?.status?.detailedState || game.status || 'Scheduled',
                    inning: '',
                    inning_state: ''
                };
            })
            .sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));

        return new Response(JSON.stringify({ 
            games: mappedGames 
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                // Live game data — never serve stale from CDN; SWR polls every 15s.
                'Cache-Control': 'no-store, max-age=0'
            }
        });
    } catch (err) {
        console.error('[API/MLB/Tracker] Unhandled error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
=======
    // raw_games is bi-temporal (one row per ingest snapshot) — keep only the freshest
    // snapshot per game_pk, then order by first pitch.
    const latestByGame = new Map<number, any>();
    for (const row of (dataRaw as any[]) || []) {
      if (!latestByGame.has(row.game_pk)) latestByGame.set(row.game_pk, row);
>>>>>>> Stashed changes
    }
    const mappedGames = Array.from(latestByGame.values())
      .map((game: any) => {
        const teams = game.payload?.teams || {};
        return {
          game_pk: game.game_pk,
          start_time: game.event_time,
          away_team: teams.away?.team?.name || 'TBD',
          home_team: teams.home?.team?.name || 'TBD',
          away_score: teams.away?.score ?? null,
          home_score: teams.home?.score ?? null,
          status: game.payload?.status?.detailedState || game.status || 'Scheduled',
          inning: '',
          inning_state: '',
        };
      })
      .sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));

    return new Response(
      JSON.stringify({
        games: mappedGames,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Live game data — never serve stale from CDN; SWR polls every 15s.
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err) {
    console.error('[API/MLB/Tracker] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // x-forwarded-proto can be comma-separated behind multiple proxies — always take first.
    const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : req.headers['x-forwarded-proto'] || 'http';
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
