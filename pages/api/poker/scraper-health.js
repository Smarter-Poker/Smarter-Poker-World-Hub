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
 * Sources: pokeratlas only. Bravo was removed permanently (2026-05-23).
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { classifyScraperHealth } from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';

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

async function readLatestMetric(supabase, source) {
  const legacyColumns = 'source, cycle_start, records_saved, venues_scraped, venues_with_data, errors';
  const truthColumns = `${legacyColumns}, run_status, records_attempted, records_rejected, status_reason`;
  let result = await supabase
    .from('scraper_metrics')
    .select(truthColumns)
    .eq('source', source)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
    result = await supabase
      .from('scraper_metrics')
      .select(legacyColumns)
      .eq('source', source)
      .order('cycle_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.data) result.data = { ...result.data, run_status: 'legacy' };
  }
  if (result.error) throw new Error(`Failed to fetch scraper metric: ${result.error.message}`);
  return result.data || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Unauthenticated and uncacheable, this used to be a full-table read that
  // anyone could hammer. Rate-limit it and let the edge hold the answer briefly.
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const supabase = getSupabase();
    const now = new Date();
    const issues = [];

    // 'bravo' is no longer scraped (removed 2026-05-23) — monitoring it emitted a
    // permanent "bravo: NO DATA FOUND" issue that could never clear.
    // DO NOT RETIRE POKERATLAS WITHOUT CHECKING scraper_metrics FIRST.
    // It was removed on 2026-08-29 on the belief that it was decommissioned.
    // It was not - it was six days into an outage, and it recovered the same
    // evening (watchdog: "ALL CLEAR ... recovered! Data is now 7 min fresh."
    // at 20:00:06 UTC). An empty sources list makes this endpoint report
    // "healthy" while monitoring nothing, which is worse than no endpoint.
    // A silent scraper and a retired scraper look identical from here; the
    // difference is visible in scraper_metrics.cycle_start. Check that.
    const sources = ['pokeratlas'];
    const health = {};

    for (const source of sources) {
      // Read persisted data and its write-cycle metric together. Fresh source
      // rows alone cannot prove the latest scraper cycle succeeded.
      const [latestDataResult, latestMetric] = await Promise.all([
        supabase
          .from('venue_live_tables')
          .select('scrape_timestamp, scrape_batch_id')
          .eq('source', source)
          .order('scrape_timestamp', { ascending: false })
          .limit(1),
        readLatestMetric(supabase, source),
      ]);
      const { data: latestRows, error: latestErr } = latestDataResult;
      if (latestErr) {
        throw new Error(`Failed to fetch live tables: ${latestErr.message}`);
      }
      const latestRecord = (latestRows || [])[0] || null;

      // Total rows for the source, straight from Postgres.
      const { count: totalRecords } = await supabase
        .from('venue_live_tables')
        .select('bravo_slug', { count: 'exact', head: true })
        .eq('source', source);

      // Only the CURRENT batch is aggregated — that is the set the health of the
      // scraper is actually about, and it is a fraction of the table.
      let sourceData = [];
      if (latestRecord?.scrape_batch_id) {
        const { data: batchRows } = await supabase
          .from('venue_live_tables')
          .select('bravo_slug, tables_running, players_waiting')
          .eq('source', source)
          .eq('scrape_batch_id', latestRecord.scrape_batch_id)
          .limit(10000);
        sourceData = batchRows || [];
      }

      if (!latestRecord) {
        health[source] = {
          status: 'dead',
          last_scrape: null,
          minutes_ago: null,
          records: 0,
          venues: 0,
          tables_running: 0,
          players_waiting: 0,
          batch_id: null,
        };
        issues.push(`${source}: NO DATA FOUND`);
        continue;
      }

      const lastScrape = new Date(latestRecord.scrape_timestamp);
      const minutesAgo = Math.round((now - lastScrape) / 60000);
      const metricMinutesAgo = latestMetric?.cycle_start
        ? Math.round((now - new Date(latestMetric.cycle_start)) / 60000)
        : null;
      // `records` is now the size of the LATEST BATCH, which is what the anomaly
      // rule is meant to judge. It used to be every live row for the source.
      const records = sourceData.length;

      // Count unique venues + aggregate stats
      const venues = new Set(sourceData.map(r => r.bravo_slug)).size;
      const tablesRunning = sourceData.reduce((sum, r) => sum + (r.tables_running || 0), 0);
      const playersWaiting = sourceData.reduce((sum, r) => sum + (r.players_waiting || 0), 0);

      const classification = classifyScraperHealth({
        heartbeat: latestMetric,
        heartbeatStaleMinutes: metricMinutesAgo,
        dataStaleMinutes: minutesAgo,
        healthyMinutes: 30,
        deadMinutes: 60,
      });
      let status = classification.status;
      if (classification.reason) issues.push(`${source}: ${classification.reason}`);

      if (status !== 'dead' && records < 10) {
        // The old rule also fired on `records > 5000`. That ceiling was measured
        // against EVERY live row for the source, so as venue coverage expanded
        // the endpoint would permanently report 'anomaly' and return HTTP 503 —
        // paging whatever external monitor watches it, forever, over growth.
        // Only the low side (a batch that produced almost nothing) is a real
        // scraper failure signal.
        status = 'anomaly';
        issues.push(`${source}: anomaly detected structurally compromised table counts (${records} tables)`);
      } else if (status !== 'dead') {
        // Completeness floor: alert if venues drop below ~60% of trailing median
        try {
          const { data: metricsData } = await supabase
            .from('scraper_metrics')
            .select('venues_scraped')
            .eq('source', source)
            .not('venues_scraped', 'is', null)
            .order('cycle_start', { ascending: false })
            .limit(15);
          
          if (metricsData && metricsData.length > 0) {
            const trailingVenues = metricsData.map(m => m.venues_scraped).sort((a, b) => a - b);
            const medianVenues = trailingVenues[Math.floor(trailingVenues.length / 2)];
            const floor = Math.round(medianVenues * 0.6);
            if (venues < floor) {
              status = 'anomaly';
              issues.push(`${source}: anomaly detected poor completeness (${venues} venues vs trailing median ${medianVenues})`);
            }
          }
        } catch (_) { /* ignore metrics failure */ }
      }

      health[source] = {
        status,
        last_scrape: latestRecord.scrape_timestamp,
        minutes_ago: minutesAgo,
        records,
        total_records: typeof totalRecords === 'number' ? totalRecords : null,
        venues,
        tables_running: tablesRunning,
        players_waiting: playersWaiting,
        batch_id: latestRecord.scrape_batch_id,
        last_cycle: latestMetric?.cycle_start || null,
        cycle_minutes_ago: metricMinutesAgo,
        run_status: latestMetric?.run_status || null,
        records_attempted: latestMetric?.records_attempted ?? null,
        records_saved: latestMetric?.records_saved ?? null,
        records_rejected: latestMetric?.records_rejected ?? null,
        status_reason: classification.reason,
      };
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
    const scraperStatuses = Object.values(health).map(item => item.status);
    const overallStatus = scraperStatuses.some(status => ['dead', 'anomaly'].includes(status))
      ? 'critical'
      : scraperStatuses.some(status => ['warning', 'stale', 'unknown'].includes(status))
        ? 'warning'
        : 'healthy';

    // Return 200 for healthy/stale (operational), 503 only for dead/critical
    // This prevents external monitors from flagging normal staleness as outages
    const httpStatus = overallStatus === 'critical' ? 503 : 200;
    // Short edge cache: still fresh enough for a monitor, but a burst of
    // requests no longer becomes a burst of queries.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(httpStatus).json({
      status: overallStatus,
      checked_at: now.toISOString(),
      scrapers: health,
      issues,
      alert_history: alertHistory,
      thresholds: {
        healthy: '< 30 minutes',
        stale: '30-60 minutes',
        dead: '> 60 minutes',
      },
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Scraper health check error:', err);
    return res.status(500).json({ error: 'Health check failed' });
  }
}
