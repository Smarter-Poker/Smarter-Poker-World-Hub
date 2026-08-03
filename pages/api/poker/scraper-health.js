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

  try {
    const supabase = getSupabase();
    const now = new Date();
    const issues = [];

    // Single query to get all live tables data instead of 6 separate queries
    const { data: allData, error } = await supabase
      .from('venue_live_tables')
      .select('source, bravo_slug, tables_running, players_waiting, scrape_timestamp, scrape_batch_id')
      .limit(10000); // Override Supabase 1000-row default truncation

    if (error) {
      throw new Error(`Failed to fetch live tables: ${error.message}`);
    }

    // Group the data by source
    // 'bravo' is no longer scraped (removed 2026-05-23) — monitoring it emitted a
    // permanent "bravo: NO DATA FOUND" issue that could never clear.
    const sources = ['pokeratlas'];
    const buckets = {};
    sources.forEach(src => { buckets[src] = []; });
    if (allData) {
      allData.forEach(row => {
        if (buckets[row.source]) {
          buckets[row.source].push(row);
        }
      });
    }
    const health = {};

    for (const source of sources) {
      const sourceData = buckets[source];

      if (!sourceData || sourceData.length === 0) {
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
      if (minutesAgo > 60) {
        status = 'dead';
        issues.push(`${source}: data is ${minutesAgo} min old (>60 min = DEAD)`);
      } else if (minutesAgo > 30) {
        status = 'stale';
        issues.push(`${source}: data is ${minutesAgo} min old (>30 min = STALE)`);
      } else if (records < 10 || records > 5000) {
        status = 'anomaly';
        issues.push(`${source}: anomaly detected structurally compromised table counts (${records} tables)`);
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
    return res.status(500).json({ error: 'Health check failed', details: err.message });
  }
}
