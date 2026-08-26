/**
 * /api/admin/scraper-health.js
 *
 * Returns live health data for all 9 Smarter.Poker scraping daemons.
 *
 * HEARTBEAT SOURCE (fixed 2026-08-26): heartbeats are read from the
 * `scraper_metrics` table in Supabase, NOT from the filesystem. The previous
 * implementation read JSON files under a hardcoded macOS path
 * (/Users/smarter.poker/Documents/...) which never exists on Vercel, so
 * readHeartbeat() always returned null, every daemon reported status
 * 'unknown', and the healthy/warning/dead counts were permanently 0.
 *
 * `scraper_metrics` carries one row per scrape cycle per source with
 * cycle_start, records_saved, venues_with_data, errors and duration_seconds —
 * the same fields the heartbeat JSON carried. A daemon with no row in that
 * table reports status 'unknown', which is honest: we have no signal for it.
 *
 * Uses the shared src/lib/supabaseServerClient (project rule: never import
 * @supabase/supabase-js raw in an API route).
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Sources that publish a per-cycle heartbeat row into scraper_metrics.
const HEARTBEAT_SOURCES = { bravo: 'bravo', pokeratlas: 'pokeratlas' };

// Daemon display metadata
const DAEMON_META = [
  { id: 'bravo',                      label: 'Bravo Live Scraper',        type: 'live',       interval: '15 min'    },
  { id: 'pokeratlas',                 label: 'PokerAtlas Live Scraper',    type: 'live',       interval: '15 min'    },
  { id: 'series-scraper',             label: 'Series Scraper',             type: 'tournament', interval: 'KeepAlive' },
  { id: 'tournament-schedule-daemon', label: 'Tournament Schedule',        type: 'tournament', interval: 'KeepAlive' },
  { id: 'pokeratlas-tournaments',     label: 'PokerAtlas Tournaments',     type: 'tournament', interval: 'Interval'  },
  { id: 'charity-scraper',            label: 'Charity Scraper',            type: 'charity',    interval: '72 hours'  },
  { id: 'completeness-scraper',       label: 'Completeness Scraper',       type: 'tournament', interval: '6 hours'   },
  { id: 'scraper-watchdog',           label: 'Scraper Watchdog',           type: 'monitor',    interval: '5 min'     },
  { id: 'memory-watchdog',            label: 'Memory Watchdog',            type: 'monitor',    interval: '5 min'     },
];

/**
 * Reads the most recent scrape-cycle row for a source and shapes it like the
 * old heartbeat JSON so the response contract is unchanged for the frontend.
 * Returns null when there is no row (daemon then reports 'unknown').
 */
async function readHeartbeat(source) {
  try {
    const { data, error } = await getSupabase()
      .from('scraper_metrics')
      .select('source, cycle_start, duration_seconds, venues_scraped, venues_with_data, errors, records_saved, created_at')
      .eq('source', source)
      .order('cycle_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[scraper-health] scraper_metrics read failed for', source, error.message || error);
      return null;
    }
    if (!data) return null;

    return {
      status: (data.errors || 0) > 0 ? 'errors' : 'ok',
      pid: null,
      cycle: null,
      records_saved: data.records_saved,
      venues_with_data: data.venues_with_data,
      progress: data.venues_scraped != null && data.venues_with_data != null
        ? `${data.venues_with_data}/${data.venues_scraped}`
        : null,
      regions_scraped: null,
      errors: data.errors,
      duration_seconds: data.duration_seconds,
      timestamp: data.cycle_start || data.created_at,
    };
  } catch (err) {
    console.warn('[scraper-health] heartbeat lookup threw for', source, err?.message || err);
    return null;
  }
}

// Latest live-table write timestamp for a source (data freshness, not liveness).
async function readLastSave(source) {
  try {
    const { data, error } = await getSupabase()
      .from('venue_live_tables')
      .select('scrape_timestamp')
      .eq('source', source)
      .order('scrape_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[scraper-health] venue_live_tables read failed for', source, error.message || error);
      return null;
    }
    return data?.scrape_timestamp || null;
  } catch (err) {
    console.warn('[scraper-health] last-save lookup threw for', source, err?.message || err);
    return null;
  }
}

function staleness(isoTimestamp) {
  if (!isoTimestamp) return null;
  const diff = (Date.now() - new Date(isoTimestamp).getTime()) / 1000 / 60;
  return Math.round(diff);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // The dashboard polls this every 60 seconds — bound it.
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  // Auth check — require valid Supabase session token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  // Verify the bearer JWT, then authorize on profiles.role — the same pattern
  // every sibling admin route uses. The previous hardcoded email allowlist
  // (admin@smarter.poker / me@smarter.poker) matched NO account in production,
  // so this endpoint 403'd for every real administrator.
  let user = null;
  try {
    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    user = authData?.user || null;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });
  } catch (err) {
    console.warn('[scraper-health] auth check threw:', err?.message || err);
    return res.status(401).json({ error: 'Auth failed' });
  }

  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Read heartbeats + data freshness from Supabase
  const [bravoHb, paHb, bravoLastSave, paLastSave] = await Promise.all([
    readHeartbeat(HEARTBEAT_SOURCES.bravo),
    readHeartbeat(HEARTBEAT_SOURCES.pokeratlas),
    readLastSave('bravo'),
    readLastSave('pokeratlas'),
  ]);

  // Build per-daemon health records
  const bravoStaleMin = staleness(bravoHb?.timestamp);
  const paStaleMin = staleness(paHb?.timestamp);
  const bravoDbStaleMin = staleness(bravoLastSave);
  const paDbStaleMin = staleness(paLastSave);

  const daemons = DAEMON_META.map((d) => {
    let heartbeat = null;
    let dbStaleMin = null;

    if (d.id === 'bravo')      { heartbeat = bravoHb; dbStaleMin = bravoDbStaleMin; }
    if (d.id === 'pokeratlas') { heartbeat = paHb;    dbStaleMin = paDbStaleMin;   }

    const hbStaleMin = staleness(heartbeat?.timestamp);

    // HEALTHY  = heartbeat < 25min (one 15min cycle + 10min buffer)
    // WARNING  = 25-45min (missed one cycle)
    // DEAD     = >45min
    // UNKNOWN  = no heartbeat row exists for this daemon (no signal either way)
    let status = 'unknown';
    if (heartbeat && hbStaleMin !== null) {
      if (hbStaleMin <= 25) status = 'healthy';
      else if (hbStaleMin <= 45) status = 'warning';
      else status = 'dead';
    }

    return {
      id: d.id,
      label: d.label,
      type: d.type,
      interval: d.interval,
      status,
      heartbeat: heartbeat ? {
        daemonStatus: heartbeat.status,
        pid: heartbeat.pid,
        cycle: heartbeat.cycle,
        recordsSaved: heartbeat.records_saved,
        venuesWithData: heartbeat.venues_with_data,
        progress: heartbeat.progress,
        regionsScraped: heartbeat.regions_scraped,
        errors: heartbeat.errors,
        durationSeconds: heartbeat.duration_seconds,
        timestamp: heartbeat.timestamp,
        staleMinutes: hbStaleMin,
      } : null,
      database: {
        lastSaveTimestamp: d.id === 'bravo' ? bravoLastSave : (d.id === 'pokeratlas' ? paLastSave : null),
        staleMinutes: dbStaleMin,
      },
    };
  });

  const unknownCount = daemons.filter(d => d.status === 'unknown').length;

  const summary = {
    healthyCount: daemons.filter(d => d.status === 'healthy').length,
    warningCount: daemons.filter(d => d.status === 'warning').length,
    deadCount:    daemons.filter(d => d.status === 'dead').length,
    unknownCount,
    bravoFresh:      bravoStaleMin !== null && bravoStaleMin <= 25,
    pokeratlasFresh: paStaleMin    !== null && paStaleMin    <= 25,
    dataFresh: (bravoDbStaleMin !== null && bravoDbStaleMin <= 25) ||
               (paDbStaleMin   !== null && paDbStaleMin   <= 25),
  };

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    heartbeatSource: 'scraper_metrics',
    notice: unknownCount > 0
      ? `${unknownCount} of ${daemons.length} daemons publish no heartbeat into scraper_metrics, so their status is reported as unknown rather than guessed. Only sources that write scraper_metrics rows can be scored healthy, warning or dead.`
      : null,
    summary,
    daemons,
  });
}
