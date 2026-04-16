/**
 * /api/admin/scraper-health.js
 *
 * Returns live health data for all 9 Smarter.Poker scraping daemons.
 * Reads heartbeat JSON files (written by each daemon) + queries Supabase
 * for data freshness. Admin-only: requires valid Supabase session.
 *
 * Uses native fetch for all Supabase calls — no raw @supabase/supabase-js import
 * per the project's pre-push safety rules.
 */

import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Minimal REST fetch helper using service-role key (not subject to RLS)
async function sbFetch(endpoint) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1${endpoint}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Paths to heartbeat files written by each daemon
const BASE_DIR = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
const HEARTBEAT_PATHS = {
  bravo: path.join(BASE_DIR, 'data/bravo-logs/heartbeat.json'),
  pokeratlas: path.join(BASE_DIR, 'data/pokeratlas-logs/heartbeat.json'),
};

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

function readHeartbeat(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch {
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

  // Auth check — require valid Supabase session token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  // Verify token via Supabase Auth REST endpoint (native fetch — no raw SDK)
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Invalid session' });
    const userData = await authRes.json();
    const adminEmails = ['admin@smarter.poker', 'me@smarter.poker'];
    if (!adminEmails.includes(userData?.email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
  } catch {
    return res.status(401).json({ error: 'Auth failed' });
  }

  // Read heartbeats from daemon-written JSON files
  const bravoHb = readHeartbeat(HEARTBEAT_PATHS.bravo);
  const paHb = readHeartbeat(HEARTBEAT_PATHS.pokeratlas);

  // Query Supabase for live data freshness (maybeSingle via REST array[0])
  const bravoData = await sbFetch(
    '/venue_live_tables?source=eq.bravo&select=scrape_timestamp&order=scrape_timestamp.desc&limit=1'
  );
  const paData = await sbFetch(
    '/venue_live_tables?source=eq.pokeratlas&select=scrape_timestamp&order=scrape_timestamp.desc&limit=1'
  );
  const bravoLastSave = bravoData?.[0]?.scrape_timestamp || null;
  const paLastSave = paData?.[0]?.scrape_timestamp || null;

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
    // WARNING  = 25–45min (missed one cycle)
    // DEAD     = >45min or missing heartbeat (with heartbeat-capable daemon)
    // UNKNOWN  = no heartbeat file expected for this daemon type
    let status = 'unknown';
    if (heartbeat) {
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

  const summary = {
    healthyCount: daemons.filter(d => d.status === 'healthy').length,
    warningCount: daemons.filter(d => d.status === 'warning').length,
    deadCount:    daemons.filter(d => d.status === 'dead').length,
    unknownCount: daemons.filter(d => d.status === 'unknown').length,
    bravoFresh:      bravoStaleMin !== null && bravoStaleMin <= 25,
    pokeratlasFresh: paStaleMin    !== null && paStaleMin    <= 25,
    dataFresh: (bravoDbStaleMin !== null && bravoDbStaleMin <= 25) ||
               (paDbStaleMin   !== null && paDbStaleMin   <= 25),
  };

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    summary,
    daemons,
  });
}
