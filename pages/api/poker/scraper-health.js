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

  // Unauthenticated and uncacheable, this used to be a full-table read that
  // anyone could hammer. Rate-limit it and let the edge hold the answer briefly.
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const supabase = getSupabase();
    const now = new Date();
    const issues = [];

    // 'bravo' is no longer scraped (removed 2026-05-23) — monitoring it emitted a
    // permanent "bravo: NO DATA FOUND" issue that could never clear.
    const sources = ['pokeratlas'];
    const health = {};

    for (const source of sources) {
      // Latest scrape for this source — one row, not 10,000.
      const { data: latestRows, error: latestErr } = await supabase
        .from('venue_live_tables')
        .select('scrape_timestamp, scrape_batch_id')
        .eq('source', source)
        .order('scrape_timestamp', { ascending: false })
        .limit(1);
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
      // `records` is now the size of the LATEST BATCH, which is what the anomaly
      // rule is meant to judge. It used to be every live row for the source.
      const records = sourceData.length;

      // Count unique venues + aggregate stats
      const venues = new Set(sourceData.map(r => r.bravo_slug)).size;
      const tablesRunning = sourceData.reduce((sum, r) => sum + (r.tables_running || 0), 0);
      const playersWaiting = sourceData.reduce((sum, r) => sum + (r.players_waiting || 0), 0);

      let status = 'healthy';
      if (minutesAgo > 60) {
        status = 'dead';
        issues.push(`${source}: data is ${minutesAgo} min old (>60 min = DEAD)`);
      } else if (minutesAgo > 30) {
        status = 'stale';
        issues.push(`${source}: data is ${minutesAgo} min old (>30 min = STALE)`);
      } else if (records < 10) {
        // The old rule also fired on `records > 5000`. That ceiling was measured
        // against EVERY live row for the source, so as venue coverage expanded
        // the endpoint would permanently report 'anomaly' and return HTTP 503 —
        // paging whatever external monitor watches it, forever, over growth.
        // Only the low side (a batch that produced almost nothing) is a real
        // scraper failure signal.
        status = 'anomaly';
        issues.push(`${source}: anomaly detected structurally compromised table counts (${records} tables)`);
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
    const overallStatus = issues.length === 0 ? 'healthy' :
      issues.some(i => i.includes('DEAD') || i.includes('anomaly') || i.includes('NO DATA')) ? 'critical' : 'warning';

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
