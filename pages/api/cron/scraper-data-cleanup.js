/**
 * Cron: /api/cron/scraper-data-cleanup
 * Runs daily at 3am UTC.
 * 
 * Retention policy:
 *   - venue_live_history: 90 days
 *   - scraper_metrics: 90 days
 *   - Prevents unbounded table growth (~19K rows/day → ~1.7M rows/90 days)
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
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabase();
  const results = { cleaned_at: new Date().toISOString(), tables: {} };
  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Clean venue_live_history (>90 days)
  try {
    const { count, error } = await supabase
      .from('venue_live_history')
      .delete({ count: 'exact' })
      .lt('snapshot_time', cutoff90);
    results.tables.venue_live_history = { deleted: count || 0, error: error?.message || null };
  } catch (err) {
    results.tables.venue_live_history = { deleted: 0, error: err.message };
  }

  // Clean scraper_metrics (>90 days)
  try {
    const { count, error } = await supabase
      .from('scraper_metrics')
      .delete({ count: 'exact' })
      .lt('cycle_start', cutoff90);
    results.tables.scraper_metrics = { deleted: count || 0, error: error?.message || null };
  } catch (err) {
    results.tables.scraper_metrics = { deleted: 0, error: err.message };
  }

  // Clean game_live_history (>90 days)
  try {
    const { count, error } = await supabase
      .from('game_live_history')
      .delete({ count: 'exact' })
      .lt('snapshot_time', cutoff90);
    results.tables.game_live_history = { deleted: count || 0, error: error?.message || null };
  } catch (err) {
    results.tables.game_live_history = { deleted: 0, error: err.message };
  }

  // Clean stale venue_live_tables (>2 hours old) — protects against dead daemons leaving ghost data
  try {
    const cutoff2Hours = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('venue_live_tables')
      .delete({ count: 'exact' })
      .lt('scrape_timestamp', cutoff2Hours);
    results.tables.venue_live_tables = { deleted: count || 0, error: error?.message || null };
  } catch (err) {
    results.tables.venue_live_tables = { deleted: 0, error: err.message };
  }

  // Clean stale game_trends_snapshot entries from watchdog state (>7 days old unused keys)
  try {
    const staleKeys = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('scraper_watchdog_state')
      .delete({ count: 'exact' })
      .lt('updated_at', staleKeys)
      .neq('key', 'game_trends_snapshot'); // Keep the trends snapshot
    results.tables.scraper_watchdog_state = { deleted: count || 0 };
  } catch (err) {
    results.tables.scraper_watchdog_state = { deleted: 0, error: err.message };
  }

  // Log execution results to watchdog state for audit trailing
  try {
    await supabase
      .from('scraper_watchdog_state')
      .upsert({
        key: 'last_cleanup_execution',
        value: JSON.stringify(results),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
  } catch (err) {
    console.error('Failed to log cleanup execution:', err.message);
  }

  return res.status(200).json(results);
}
