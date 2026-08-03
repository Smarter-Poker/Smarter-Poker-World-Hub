/**
 * API: /api/poker/scraper-health
 * Health check endpoint for venue data scraper daemons.
 * 
 * Returns:
 *   - Status of each scraper (healthy/stale/dead)
 *   - Last scrape timestamp
 *   - Record counts
 *   - Minutes since last scrape
 *   - Any detected issues
 *
 * Thresholds (must match the code below and scraper-watchdog):
 *   - healthy: data < 30 min old
 *   - stale: data 30-60 min old
 *   - dead: data > 60 min old
 *
 * Buckets:
 *   - pokeratlas        — real scraped rows (source='pokeratlas')
 *   - bravo             — real scraped rows (source='bravo', batch id NOT 'sim-%').
 *                         Reports 'inactive' (not an issue) when the real Bravo
 *                         daemon is not running, so the check can't be permanently red.
 *   - bravo_simulated   — MODELLED rows written by bravo-simulator-daemon.py
 *                         (scrape_batch_id LIKE 'sim-%'). Always reports 'degraded'
 *                         while present: these rows reach users but are not observations.
 *   - venue_daily_tournaments / venue-scraper — pipeline freshness, so a dead
 *                         tournament or Manus pipeline is visible here too.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Supabase project-level cap is 1000 rows per query — .limit(10000) was
// silently truncated, which biased the latest-timestamp scan and made the
// records>5000 anomaly branch unreachable. Paginate with .range() instead.
const PAGE_SIZE = 1000;
const MAX_PAGES = 12;

// Pipeline cadences (hours) used for freshness checks.
const TOURNAMENT_CYCLE_HOURS = 72;   // tournament-schedule-daemon
const VENUE_SCRAPER_CYCLE_HOURS = 72; // venue-scraper cron (Mon/Thu)
const SIM_BATCH_MAX_AGE_MIN = 30;    // simulator writes at least this often
// A source whose newest row is older than this has stopped writing entirely.
// Its leftover rows are NOT served (live-tables discards anything >24h), so it
// must report 'inactive' rather than 'dead' — otherwise a decommissioned daemon
// pins this endpoint at critical/503 forever, which is exactly the unclearable
// alert that caused bravo monitoring to be deleted on 2026-05-23.
const DECOMMISSIONED_AFTER_MIN = 24 * 60;
// Rows per venue above which a source is duplicating rows rather than simply
// covering a large catalog (a venue lists on the order of 5-15 distinct games).
const ROWS_PER_VENUE_ANOMALY = 25;

async function fetchAllPages(buildQuery) {
    let rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await buildQuery().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) return { rows, error, truncated: false };
        if (!data || data.length === 0) return { rows, error: null, truncated: false };
        rows = rows.concat(data);
        if (data.length < PAGE_SIZE) return { rows, error: null, truncated: false };
    }
    return { rows, error: null, truncated: true };
}

function isSimulatedRow(row) {
    return typeof row?.scrape_batch_id === 'string' && row.scrape_batch_id.startsWith('sim-');
}

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const now = new Date();
    const issues = [];

    // Single paginated query to get all live tables data instead of 6 separate queries
    const { rows: allData, error, truncated } = await fetchAllPages(() => supabase
      .from('venue_live_tables')
      .select('source, bravo_slug, tables_running, players_waiting, scrape_timestamp, scrape_batch_id'));

    if (error) {
      throw new Error(`Failed to fetch live tables: ${error.message}`);
    }
    if (truncated) {
      issues.push(`venue_live_tables: result set exceeded ${MAX_PAGES * PAGE_SIZE} rows — health figures are partial`);
    }

    // Group the data by source. 'bravo' is split into real scrapes and
    // simulator output (scrape_batch_id LIKE 'sim-%'), because the simulator is
    // currently the source of user-visible live-table data and must be monitored.
    // Removing the bravo check entirely (2026-05-23) silenced the alert, not the cause.
    const sources = ['pokeratlas', 'bravo', 'bravo_simulated'];
    // Buckets that must NOT raise a hard issue when empty (absence is a valid state).
    const optionalSources = new Set(['bravo', 'bravo_simulated']);
    const buckets = {};
    sources.forEach(src => { buckets[src] = []; });
    for (const row of (allData || [])) {
      if (row.source === 'bravo') {
        buckets[isSimulatedRow(row) ? 'bravo_simulated' : 'bravo'].push(row);
      } else if (buckets[row.source]) {
        buckets[row.source].push(row);
      }
    }
    const health = {};

    for (const source of sources) {
      const sourceData = buckets[source];

      if (!sourceData || sourceData.length === 0) {
        health[source] = {
          status: optionalSources.has(source) ? 'inactive' : 'dead',
          last_scrape: null,
          minutes_ago: null,
          records: 0,
          venues: 0,
          tables_running: 0,
          players_waiting: 0,
          batch_id: null,
          note: optionalSources.has(source)
            ? 'No rows from this source — not currently writing.'
            : undefined,
        };
        if (!optionalSources.has(source)) issues.push(`${source}: NO DATA FOUND`);
        continue;
      }

      // Find the most recent scrape timestamp from the grouped data
      let latestRecord = sourceData[0];
      for (const row of sourceData) {
        if (row.scrape_timestamp > latestRecord.scrape_timestamp) {
          latestRecord = row;
        }
      }

      const lastScrape = new Date(latestRecord.scrape_timestamp);
      const minutesAgo = Math.round((now - lastScrape) / 60000);
      const records = sourceData.length;

      // Count unique venues + aggregate stats
      const venues = new Set(sourceData.map(r => r.bravo_slug)).size;
      const tablesRunning = sourceData.reduce((sum, r) => sum + (r.tables_running || 0), 0);
      const playersWaiting = sourceData.reduce((sum, r) => sum + (r.players_waiting || 0), 0);

      let status = 'healthy';
      const isOptional = optionalSources.has(source);
      if (isOptional && minutesAgo > DECOMMISSIONED_AFTER_MIN) {
        // Stale leftovers from a source that stopped writing long ago. Visible,
        // but never escalated to critical/503 (see DECOMMISSIONED_AFTER_MIN).
        status = 'inactive';
        issues.push(`${source}: no new rows for ${Math.round(minutesAgo / 60)}h — source appears decommissioned (stale rows remain in venue_live_tables but are not served)`);
      } else if (minutesAgo > 60) {
        status = 'dead';
        issues.push(`${source}: data is ${minutesAgo} min old (>60 min = DEAD)`);
      } else if (minutesAgo > 30) {
        status = 'stale';
        issues.push(`${source}: data is ${minutesAgo} min old (>30 min = STALE)`);
      } else if (records < 10 || (records > 5000 && venues > 0 && records / venues > ROWS_PER_VENUE_ANOMALY)) {
        // The upper bound was calibrated when .limit(10000) was silently capped
        // at 1000 rows, so it could never fire. Now that the query pages, a
        // healthy full PokerAtlas catalog can exceed 5000 rows on its own — and
        // 'anomaly' escalates this endpoint to critical/503. Require the row
        // count to ALSO be implausible per venue (duplicate accumulation), which
        // is what "structurally compromised" actually means.
        status = 'anomaly';
        issues.push(`${source}: anomaly detected structurally compromised table counts (${records} rows across ${venues} venues)`);
      }

      health[source] = {
        status,
        last_scrape: latestRecord.scrape_timestamp,
        minutes_ago: minutesAgo,
        records,
        venues,
        tables_running: tablesRunning,
        players_waiting: playersWaiting,
        batch_id: latestRecord.scrape_batch_id,
      };

      // The simulator bucket is never "healthy": its rows are modelled, not
      // observed, and they are served to users. Report degraded while present,
      // and still surface staleness (a dead simulator leaves 24h-old rows visible).
      if (source === 'bravo_simulated') {
        health[source].is_simulated = true;
        health[source].data_quality = 'modeled_estimate';
        if (status === 'healthy') health[source].status = 'degraded';
        // Rows older than the retention window are no longer served by
        // live-tables, so don't claim they are reaching users.
        issues.push(
          status === 'inactive'
            ? `bravo_simulated: ${records} stale SIMULATED rows across ${venues} venues remain in venue_live_tables (batch ${latestRecord.scrape_batch_id}, ${Math.round(minutesAgo / 60)}h old, no longer served)`
            : `bravo_simulated: ${records} SIMULATED rows across ${venues} venues are being served as live data (batch ${latestRecord.scrape_batch_id}, ${minutesAgo} min old)`
        );
        if (minutesAgo > SIM_BATCH_MAX_AGE_MIN && status === 'healthy') {
          health[source].status = 'stale';
          issues.push(`bravo_simulated: newest batch is ${minutesAgo} min old (>${SIM_BATCH_MAX_AGE_MIN} min = simulator not writing)`);
        }
      }
    }

    // ── Pipeline freshness beyond venue_live_tables ──
    // Without these, venue_daily_tournaments and the Manus venue pipeline could
    // stop for a month while this endpoint kept answering status:'healthy'.
    const pipelines = {};

    try {
      const { data: dtRow, error: dtErr } = await supabase
        .from('venue_daily_tournaments')
        .select('last_scraped')
        .not('last_scraped', 'is', null)
        .order('last_scraped', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dtErr) throw new Error(dtErr.message);
      const lastScraped = dtRow?.last_scraped ? new Date(dtRow.last_scraped) : null;
      const hoursAgo = lastScraped ? Math.round((now - lastScraped) / 3600000) : null;
      let dtStatus = 'healthy';
      if (hoursAgo === null) {
        dtStatus = 'unknown';
        issues.push('venue_daily_tournaments: no last_scraped timestamp found');
      } else if (hoursAgo > TOURNAMENT_CYCLE_HOURS * 2) {
        dtStatus = 'dead';
        issues.push(`venue_daily_tournaments: last scrape was ${hoursAgo}h ago (>${TOURNAMENT_CYCLE_HOURS * 2}h = DEAD)`);
      } else if (hoursAgo > TOURNAMENT_CYCLE_HOURS) {
        dtStatus = 'stale';
        issues.push(`venue_daily_tournaments: last scrape was ${hoursAgo}h ago (>${TOURNAMENT_CYCLE_HOURS}h cycle = STALE)`);
      }
      pipelines.venue_daily_tournaments = {
        status: dtStatus,
        last_scrape: dtRow?.last_scraped || null,
        hours_ago: hoursAgo,
        cycle_hours: TOURNAMENT_CYCLE_HOURS,
      };
    } catch (dtCheckErr) {
      // A failed check is itself an issue — never silently green.
      pipelines.venue_daily_tournaments = { status: 'unknown', error: dtCheckErr.message };
      issues.push(`venue_daily_tournaments: freshness check failed (${dtCheckErr.message})`);
    }

    try {
      const { data: runRow, error: runErr } = await supabase
        .from('scraper_runs')
        .select('source, status, started_at')
        .like('source', 'venue-scraper%')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runErr) throw new Error(runErr.message);
      const startedAt = runRow?.started_at ? new Date(runRow.started_at) : null;
      const hoursAgo = startedAt ? Math.round((now - startedAt) / 3600000) : null;
      let vsStatus = 'healthy';
      if (hoursAgo === null) {
        vsStatus = 'unknown';
        issues.push('venue-scraper: no run recorded in scraper_runs');
      } else if (hoursAgo > VENUE_SCRAPER_CYCLE_HOURS * 2) {
        vsStatus = 'dead';
        issues.push(`venue-scraper: last run was ${hoursAgo}h ago (>${VENUE_SCRAPER_CYCLE_HOURS * 2}h = DEAD)`);
      } else if (hoursAgo > VENUE_SCRAPER_CYCLE_HOURS) {
        vsStatus = 'stale';
        issues.push(`venue-scraper: last run was ${hoursAgo}h ago (>${VENUE_SCRAPER_CYCLE_HOURS}h cron = STALE)`);
      }
      if (runRow && runRow.status && runRow.status !== 'success' && runRow.status !== 'running') {
        if (vsStatus === 'healthy') vsStatus = 'degraded';
        issues.push(`venue-scraper: last run (${runRow.source}) ended with status '${runRow.status}'`);
      }
      pipelines.venue_scraper = {
        status: vsStatus,
        last_run: runRow?.started_at || null,
        last_run_source: runRow?.source || null,
        last_run_status: runRow?.status || null,
        hours_ago: hoursAgo,
        cycle_hours: VENUE_SCRAPER_CYCLE_HOURS,
      };
    } catch (vsCheckErr) {
      pipelines.venue_scraper = { status: 'unknown', error: vsCheckErr.message };
      issues.push(`venue-scraper: freshness check failed (${vsCheckErr.message})`);
    }

    // Fetch alert history timeline
    let alertHistory = [];
    try {
      const { data: ahData } = await supabase
        .from('scraper_watchdog_state')
        .select('value')
        .eq('key', 'alert_history')
        .maybeSingle();
      if (ahData && ahData.value) {
        alertHistory = typeof ahData.value === 'string' ? JSON.parse(ahData.value) : ahData.value;
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // A source with zero rows is the WORST failure mode (scraper dead long enough
    // that cleanup purged its rows), so it must escalate to critical/503 too.
    const overallStatus = issues.length === 0 ? 'healthy' :
      issues.some(i => i.includes('DEAD') || i.includes('anomaly') || i.includes('NO DATA')) ? 'critical' : 'warning';

    // Return 200 for healthy/stale (operational), 503 only for dead/critical
    // This prevents external monitors from flagging normal staleness as outages
    const httpStatus = overallStatus === 'critical' ? 503 : 200;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(httpStatus).json({
      status: overallStatus,
      checked_at: now.toISOString(),
      scrapers: health,
      pipelines,
      simulated_data_present: (buckets.bravo_simulated || []).length > 0,
      truncated,
      issues,
      alert_history: alertHistory,
      thresholds: {
        healthy: '< 30 minutes',
        stale: '30-60 minutes',
        dead: '> 60 minutes',
        tournament_cycle_hours: TOURNAMENT_CYCLE_HOURS,
        venue_scraper_cycle_hours: VENUE_SCRAPER_CYCLE_HOURS,
      },
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Scraper health check error:', err);
    return res.status(500).json({ error: 'Health check failed', details: err.message });
  }
}
