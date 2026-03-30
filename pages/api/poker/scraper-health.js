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
 * Thresholds:
 *   - healthy: data < 20 min old
 *   - stale: data 20-60 min old  
 *   - dead: data > 60 min old
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

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

    // Check each source independently
    const sources = ['bravo', 'pokeratlas'];
    const health = {};

    for (const source of sources) {
      const { data, error } = await supabase
        .from('venue_live_tables')
        .select('scrape_timestamp, venue_name, scrape_batch_id')
        .eq('source', source)
        .order('scrape_timestamp', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        health[source] = {
          status: 'dead',
          last_scrape: null,
          minutes_ago: null,
          records: 0,
          venues: 0,
        };
        issues.push(`${source}: NO DATA FOUND`);
        continue;
      }

      const lastScrape = new Date(data[0].scrape_timestamp);
      const minutesAgo = Math.round((now - lastScrape) / 60000);

      // Count records efficiently (single query instead of fetching all rows)
      const { count: records } = await supabase
        .from('venue_live_tables')
        .select('id', { count: 'exact', head: true })
        .eq('source', source);

      // Count unique venues + aggregate stats
      const { data: venueRows } = await supabase
        .from('venue_live_tables')
        .select('bravo_slug, tables_running, players_waiting')
        .eq('source', source);
      const venues = venueRows ? new Set(venueRows.map(r => r.bravo_slug)).size : 0;
      const tablesRunning = (venueRows || []).reduce((s, r) => s + (r.tables_running || 0), 0);
      const playersWaiting = (venueRows || []).reduce((s, r) => s + (r.players_waiting || 0), 0);

      let status = 'healthy';
      if (minutesAgo > 60) {
        status = 'dead';
        issues.push(`${source}: data is ${minutesAgo} min old (>60 min = DEAD)`);
      } else if (minutesAgo > 30) {
        status = 'stale';
        issues.push(`${source}: data is ${minutesAgo} min old (>30 min = STALE)`);
      }

      health[source] = {
        status,
        last_scrape: data[0].scrape_timestamp,
        minutes_ago: minutesAgo,
        records,
        venues,
        tables_running: tablesRunning,
        players_waiting: playersWaiting,
        batch_id: data[0].scrape_batch_id,
      };
    }

    const overallStatus = issues.length === 0 ? 'healthy' : 
      issues.some(i => i.includes('DEAD')) ? 'critical' : 'warning';

    // Return 200 for healthy/stale (operational), 503 only for dead/critical
    // This prevents external monitors from flagging normal staleness as outages
    const httpStatus = overallStatus === 'critical' ? 503 : 200;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(httpStatus).json({
      status: overallStatus,
      checked_at: now.toISOString(),
      scrapers: health,
      issues,
      thresholds: {
        healthy: '< 30 minutes',
        stale: '30-60 minutes',
        dead: '> 60 minutes',
      },
    });
  } catch (err) {
    console.error('Scraper health check error:', err);
    return res.status(500).json({ error: 'Health check failed', details: err.message });
  }
}
