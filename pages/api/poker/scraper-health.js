/**
 * API: /api/poker/scraper-health
 * Health check endpoint for Bravo + PokerAtlas scraper daemons.
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

      // Count records and unique venues
      const { data: countData } = await supabase
        .from('venue_live_tables')
        .select('venue_name')
        .eq('source', source);

      const records = countData ? countData.length : 0;
      const venues = countData ? new Set(countData.map(r => r.venue_name)).size : 0;

      let status = 'healthy';
      if (minutesAgo > 60) {
        status = 'dead';
        issues.push(`${source}: data is ${minutesAgo} min old (>60 min = DEAD)`);
      } else if (minutesAgo > 20) {
        status = 'stale';
        issues.push(`${source}: data is ${minutesAgo} min old (>20 min = STALE)`);
      }

      health[source] = {
        status,
        last_scrape: data[0].scrape_timestamp,
        minutes_ago: minutesAgo,
        records,
        venues,
        batch_id: data[0].scrape_batch_id,
      };
    }

    const overallStatus = issues.length === 0 ? 'healthy' : 
      issues.some(i => i.includes('DEAD')) ? 'critical' : 'warning';

    res.setHeader('Cache-Control', 'no-store');
    return res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      checked_at: now.toISOString(),
      scrapers: health,
      issues,
      thresholds: {
        healthy: '< 20 minutes',
        stale: '20-60 minutes',
        dead: '> 60 minutes',
      },
    });
  } catch (err) {
    console.error('Scraper health check error:', err);
    return res.status(500).json({ error: 'Health check failed', details: err.message });
  }
}
