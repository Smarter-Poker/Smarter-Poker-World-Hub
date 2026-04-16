/**
 * /api/admin/scraper-health.js
 * 
 * Returns live health data for all 9 Smarter.Poker scraping daemons.
 * Reads heartbeat JSON files (written by each daemon) + queries Supabase
 * for data freshness. Admin-only: requires valid Supabase session.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Paths to heartbeat files written by each daemon
const BASE_DIR = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
const HEARTBEAT_PATHS = {
  bravo: path.join(BASE_DIR, 'data/bravo-logs/heartbeat.json'),
  pokeratlas: path.join(BASE_DIR, 'data/pokeratlas-logs/heartbeat.json'),
};

// Daemon display metadata
const DAEMON_META = [
  { id: 'bravo',                      label: 'Bravo Live Scraper',           type: 'live',        interval: '15 min' },
  { id: 'pokeratlas',                 label: 'PokerAtlas Live Scraper',       type: 'live',        interval: '15 min' },
  { id: 'series-scraper',             label: 'Series Scraper',                type: 'tournament',  interval: 'KeepAlive' },
  { id: 'tournament-schedule-daemon', label: 'Tournament Schedule Daemon',    type: 'tournament',  interval: 'KeepAlive' },
  { id: 'pokeratlas-tournaments',     label: 'PokerAtlas Tournaments',        type: 'tournament',  interval: 'Interval' },
  { id: 'charity-scraper',            label: 'Charity Scraper',               type: 'charity',     interval: '72 hours' },
  { id: 'completeness-scraper',       label: 'Completeness Scraper',          type: 'tournament',  interval: '6 hours' },
  { id: 'scraper-watchdog',           label: 'Scraper Watchdog',              type: 'monitor',     interval: '5 min' },
  { id: 'memory-watchdog',            label: 'Memory Watchdog',               type: 'monitor',     interval: '5 min' },
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

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

    // Only admins — check admin_users table or email allowlist
    const adminEmails = ['admin@smarter.poker', 'me@smarter.poker'];
    if (!adminEmails.includes(user.email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Auth failed' });
  }

  // Read heartbeats
  const bravoHb = readHeartbeat(HEARTBEAT_PATHS.bravo);
  const paHb = readHeartbeat(HEARTBEAT_PATHS.pokeratlas);

  // Query Supabase for data freshness
  let bravoLastSave = null;
  let paLastSave = null;
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const { data: bravoRow } = await supabase
      .from('venue_live_tables')
      .select('scrape_timestamp')
      .eq('source', 'bravo')
      .order('scrape_timestamp', { ascending: false })
      .limit(1)
      .single();
    
    const { data: paRow } = await supabase
      .from('venue_live_tables')
      .select('scrape_timestamp')
      .eq('source', 'pokeratlas')
      .order('scrape_timestamp', { ascending: false })
      .limit(1)
      .single();

    bravoLastSave = bravoRow?.scrape_timestamp || null;
    paLastSave = paRow?.scrape_timestamp || null;
  } catch (e) {
    // Non-fatal — heartbeats are the primary signal
  }

  // Build response
  const bravoStaleMin = staleness(bravoHb?.timestamp);
  const paStaleMin = staleness(paHb?.timestamp);
  const bravoDbStaleMin = staleness(bravoLastSave);
  const paDbStaleMin = staleness(paLastSave);

  const daemons = DAEMON_META.map((d) => {
    let heartbeat = null;
    let dbStaleMin = null;

    if (d.id === 'bravo') {
      heartbeat = bravoHb;
      dbStaleMin = bravoDbStaleMin;
    } else if (d.id === 'pokeratlas') {
      heartbeat = paHb;
      dbStaleMin = paDbStaleMin;
    }

    const hbStaleMin = staleness(heartbeat?.timestamp);
    
    // Status logic:
    // HEALTHY = heartbeat < 25min old (covers a full 15min cycle + buffer)
    // WARNING = 25-45min 
    // DEAD = >45min or no heartbeat
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
    deadCount: daemons.filter(d => d.status === 'dead').length,
    unknownCount: daemons.filter(d => d.status === 'unknown').length,
    bravoFresh: bravoStaleMin !== null && bravoStaleMin <= 25,
    pokeratlasFresh: paStaleMin !== null && paStaleMin <= 25,
    dataFresh: (bravoDbStaleMin !== null && bravoDbStaleMin <= 25) || 
               (paDbStaleMin !== null && paDbStaleMin <= 25),
  };

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    summary,
    daemons,
  });
}
