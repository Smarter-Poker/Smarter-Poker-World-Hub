/**
 * /api/admin/scraper-health.js
 *
 * Returns health data for the Smarter.Poker scraping daemons, and is careful
 * to distinguish "broken" from "we have no telemetry for this".
 *
 * HEARTBEAT SOURCE (fixed 2026-08-26): heartbeats are read from the
 * `scraper_metrics` table in Supabase, NOT from the filesystem. The previous
 * implementation read JSON files under a hardcoded macOS path
 * (/Users/smarter.poker/Documents/...) which never exists on Vercel, so
 * readHeartbeat() always returned null and the healthy/warning/dead counts
 * were permanently 0.
 *
 * HONEST STATUSES (fixed 2026-08-26, round two). Only ONE source publishes
 * into scraper_metrics in production: `pokeratlas` (1,156 rows, last cycle
 * 2026-08-23). Nothing writes `bravo`, and the seven non-live daemons were
 * never instrumented at all. The route nevertheless scored all nine on the
 * same scale, so seven sat permanently at 'unknown', bravo sat permanently at
 * 'unknown', and the /horses nav carried a permanent red alarm for daemons
 * that were never reporting in the first place.
 *
 * The instrumented set is now DISCOVERED from the distinct `source` values in
 * scraper_metrics rather than hardcoded, and each daemon lands in exactly one
 * of five states:
 *
 *   healthy | warning | dead   — instrumented, scored on heartbeat staleness.
 *                                 Only these can be 'dead'.
 *   not_instrumented           — publishes no scraper_metrics row. Not a
 *                                 fault: there is simply no signal. Never
 *                                 counts toward deadCount.
 *   disabled                   — deliberately switched off. Bravo is the only
 *                                 one: the live Bravo scraper is INTENTIONALLY
 *                                 off per .agent/workflows/live-cash-games-policy.md,
 *                                 and Cash Games Running is published from
 *                                 modelled history instead. Reporting that as
 *                                 a failure is reporting a decision as a bug.
 *
 * Uses the shared src/lib/supabaseServerClient (project rule: never import
 * @supabase/supabase-js raw in an API route).
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { classifyScraperHealth } from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';

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

// Upper bound on the scraper_metrics scan used to discover which sources are
// instrumented. The table holds ~1.2k rows in production.
const SOURCE_SCAN_CAP = 5000;

// Daemons that are OFF ON PURPOSE, with the reason a human needs to read.
// These are never scored and never counted as a fault.
const DISABLED_DAEMONS = {
  bravo: 'Intentionally disabled. The Bravo live scraper is switched off by policy (.agent/workflows/live-cash-games-policy.md); Cash Games Running is published from modelled history, not a live Bravo scrape. Absence of Bravo heartbeats is the expected state, not a fault.',
};

// hasOwnProperty, not a bare lookup: daemon ids partly come from a DB column,
// and a source literally named "constructor" would otherwise resolve to a
// truthy inherited property and be reported as deliberately disabled.
function disabledReason(id) {
  return Object.prototype.hasOwnProperty.call(DISABLED_DAEMONS, id) ? DISABLED_DAEMONS[id] : null;
}

// Explanation attached to any daemon that simply does not report telemetry.
const NOT_INSTRUMENTED_REASON =
  'Not instrumented. This daemon writes no rows into scraper_metrics, so there is no heartbeat to score. Its status is unknown-by-design rather than unhealthy, and it is excluded from the dead count. Add a scraper_metrics write to its cycle loop to bring it under monitoring.';

// Daemon display metadata
const DAEMON_META = [
  { id: 'bravo',                      label: 'Bravo Live Scraper',        type: 'live',       interval: '15 min'    },
  { id: 'bravo-simulator',            label: 'Modeled Cash Activity',     type: 'model',      interval: '15 min'    },
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
    const baseColumns = 'source, cycle_start, duration_seconds, venues_scraped, venues_with_data, errors, records_saved, created_at';
    const truthColumns = `${baseColumns}, run_status, records_attempted, records_rejected, status_reason`;
    let result = await getSupabase()
      .from('scraper_metrics')
      .select(truthColumns)
      .eq('source', source)
      .order('cycle_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Deployment compatibility only: code can run while the truth migration is
    // propagating, but legacy rows are explicitly marked and cannot earn a
    // zero-output healthy state.
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
      result = await getSupabase()
        .from('scraper_metrics')
        .select(baseColumns)
        .eq('source', source)
        .order('cycle_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.data) result.data = { ...result.data, run_status: 'legacy' };
    }
    const { data, error } = result;

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
      run_status: data.run_status || 'legacy',
      records_attempted: data.records_attempted ?? null,
      records_rejected: data.records_rejected ?? null,
      status_reason: data.status_reason || null,
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
    let query = getSupabase()
      .from('venue_live_tables')
      .select('scrape_timestamp');
    if (source === 'bravo-simulator') {
      query = query.eq('source', 'bravo').like('scrape_batch_id', 'sim-%');
    } else {
      query = query.eq('source', source);
    }
    const { data, error } = await query
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

/**
 * Which sources actually publish telemetry. PostgREST cannot express
 * SELECT DISTINCT and this project has aggregate functions disabled
 * (`source.count()` returns PGRST123), so the source column is pulled and
 * de-duplicated here. Returns null — not an empty set — when the read fails,
 * so a broken query is never mistaken for "nothing is instrumented".
 */
async function readInstrumentedSources() {
  try {
    const { data, error } = await getSupabase()
      .from('scraper_metrics')
      .select('source')
      .not('source', 'is', null)
      .limit(SOURCE_SCAN_CAP);

    if (error) {
      console.warn('[scraper-health] scraper_metrics source scan failed:', error.message || error);
      return null;
    }
    return new Set((data || []).map(r => r.source).filter(Boolean));
  } catch (err) {
    console.warn('[scraper-health] source scan threw:', err?.message || err);
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

  // Which daemons actually report telemetry, discovered rather than assumed.
  const instrumented = await readInstrumentedSources();
  const scanFailed = instrumented === null;
  const instrumentedSet = instrumented || new Set();

  // Anything writing scraper_metrics that has no DAEMON_META entry is still
  // shown, so a newly instrumented scraper appears without a code change.
  const knownIds = new Set(DAEMON_META.map(d => d.id));
  const meta = [
    ...DAEMON_META,
    ...[...instrumentedSet]
      .filter(id => !knownIds.has(id))
      .map(id => ({ id, label: id, type: 'unclassified', interval: 'unknown' })),
  ];

  // Score only what can be scored. A disabled daemon is never read, and an
  // uninstrumented one has nothing to read.
  const scored = meta.filter(d => !disabledReason(d.id) && instrumentedSet.has(d.id));

  const readings = await Promise.all(scored.map(async (d) => {
    const [heartbeat, lastSave] = await Promise.all([readHeartbeat(d.id), readLastSave(d.id)]);
    return [d.id, { heartbeat, lastSave }];
  }));
  const byId = new Map(readings);

  const daemons = meta.map((d) => {
    const reading = byId.get(d.id) || { heartbeat: null, lastSave: null };
    const heartbeat = reading.heartbeat;
    const hbStaleMin = staleness(heartbeat?.timestamp);
    const dbStaleMin = staleness(reading.lastSave);

    // DISABLED         = off on purpose. Not a fault, never scored.
    // NOT_INSTRUMENTED = writes no scraper_metrics row. No signal, so no
    //                    verdict. Never counts as dead.
    // HEALTHY          = heartbeat < 25min (one 15min cycle + 10min buffer)
    // WARNING          = 25-45min (missed one cycle)
    // DEAD             = >45min. Reachable ONLY when the daemon is genuinely
    //                    instrumented and its heartbeat is genuinely stale.
    // UNKNOWN          = instrumented, but the heartbeat read came back empty
    //                    or the source scan itself failed.
    let status;
    let statusReason = null;

    const offByPolicy = disabledReason(d.id);
    if (offByPolicy) {
      status = 'disabled';
      statusReason = offByPolicy;
    } else if (scanFailed) {
      status = 'unknown';
      statusReason = 'The scraper_metrics source scan failed, so no daemon could be classified on this request.';
    } else if (!instrumentedSet.has(d.id)) {
      status = 'not_instrumented';
      statusReason = NOT_INSTRUMENTED_REASON;
    } else if (heartbeat && hbStaleMin !== null) {
      const classification = classifyScraperHealth({
        heartbeat,
        heartbeatStaleMinutes: hbStaleMin,
        dataStaleMinutes: dbStaleMin,
        healthyMinutes: 25,
        deadMinutes: 45,
      });
      status = classification.status;
      statusReason = classification.reason;
    } else {
      status = 'unknown';
      statusReason = 'This source appears in scraper_metrics but its latest cycle row could not be read.';
    }

    return {
      id: d.id,
      label: d.label,
      type: d.type,
      interval: d.interval,
      status,
      statusReason,
      instrumented: !offByPolicy && instrumentedSet.has(d.id),
      disabled: Boolean(offByPolicy),
      heartbeat: heartbeat ? {
        daemonStatus: heartbeat.status,
        pid: heartbeat.pid,
        cycle: heartbeat.cycle,
        recordsSaved: heartbeat.records_saved,
        venuesWithData: heartbeat.venues_with_data,
        progress: heartbeat.progress,
        regionsScraped: heartbeat.regions_scraped,
        errors: heartbeat.errors,
        runStatus: heartbeat.run_status,
        recordsAttempted: heartbeat.records_attempted,
        recordsRejected: heartbeat.records_rejected,
        statusReason: heartbeat.status_reason,
        durationSeconds: heartbeat.duration_seconds,
        timestamp: heartbeat.timestamp,
        staleMinutes: hbStaleMin,
      } : null,
      database: {
        lastSaveTimestamp: reading.lastSave,
        staleMinutes: dbStaleMin,
      },
    };
  });

  const countOf = (s) => daemons.filter(d => d.status === s).length;
  const notInstrumentedCount = countOf('not_instrumented');
  const disabledCount = countOf('disabled');
  const unknownCount = countOf('unknown');
  const deadCount = countOf('dead');

  const paDaemon = daemons.find(d => d.id === 'pokeratlas');
  const paStaleMin = paDaemon?.heartbeat?.staleMinutes ?? null;
  const paDbStaleMin = paDaemon?.database?.staleMinutes ?? null;

  const summary = {
    healthyCount: countOf('healthy'),
    warningCount: countOf('warning'),
    // Only genuinely instrumented-and-stale daemons land here. Disabled and
    // uninstrumented daemons cannot inflate this number, which is what the
    // /horses nav badge counts.
    deadCount,
    notInstrumentedCount,
    disabledCount,
    unknownCount,
    instrumentedCount: daemons.filter(d => d.instrumented).length,
    totalCount: daemons.length,
    // Bravo is off by policy, so it has no freshness to report.
    bravoFresh: null,
    pokeratlasFresh: paStaleMin !== null && paStaleMin <= 25,
    dataFresh: paDbStaleMin !== null && paDbStaleMin <= 25,
  };

  const noticeParts = [];
  if (scanFailed) {
    noticeParts.push('The scraper_metrics source scan failed on this request, so no daemon could be classified.');
  }
  if (disabledCount > 0) {
    noticeParts.push(`${disabledCount} daemon(s) are switched off on purpose and are not scored.`);
  }
  if (notInstrumentedCount > 0) {
    noticeParts.push(`${notInstrumentedCount} of ${daemons.length} daemons publish no heartbeat into scraper_metrics, so they are reported as not instrumented rather than as failing. They are excluded from the dead count.`);
  }
  if (deadCount > 0) {
    noticeParts.push(`${deadCount} instrumented daemon(s) are stale and need attention.`);
  }

  return res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    heartbeatSource: 'scraper_metrics',
    instrumentedSources: [...instrumentedSet].sort(),
    notice: noticeParts.length > 0 ? noticeParts.join(' ') : null,
    summary,
    daemons,
  });
}
