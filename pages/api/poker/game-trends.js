/**
 * API: /api/poker/game-trends
 * Analyzes game type trends from venue_live_tables data.
 * Compares current snapshot against a cached previous snapshot
 * stored in scraper_watchdog_state to show real trend arrows.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { gameShortLabel } from '../../../src/components/poker-near-me/normalize-game';
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

// Project row cap is 1000; `.limit(5000)` was silently truncated (see
// live-tables.js / events-calendar.js / leaderboards.js).
const PAGE_SIZE = 1000;
const MAX_PAGES = 10; // 10,000-row ceiling
// venue_live_tables keeps a row per game per venue per scrape cycle for 24h+,
// so an unbounded read smears many batches together.
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // This was the only route in the directory with no rate limit, while it ran a
  // multi-thousand-row scan plus an upsert write on every request.
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const supabase = getSupabase();

    // Get the current snapshot. Paged with .range() over a bounded recent
    // window; the old single `.limit(5000)` was capped at 1000 rows.
    const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
    let currentData = [];
    let currentErr = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data: pageRows, error } = await supabase
        .from('venue_live_tables')
        .select('game_name, source, bravo_slug, venue_name, scrape_batch_id, scrape_timestamp')
        .gte('scrape_timestamp', since)
        .order('scrape_timestamp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) { currentErr = error; break; }
      if (!pageRows || pageRows.length === 0) break;
      currentData = currentData.concat(pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }

    if (currentErr) {
      console.warn('Game trends: live tables query failed:', currentErr.message);
      return res.status(200).json({ trends: [], total_games_now: 0, has_historical_data: false, analyzed_at: new Date().toISOString() });
    }

    // BATCH DEDUP: keep only the newest scrape batch per venue. Without this a
    // single live game was counted once per batch it appeared in, so the trend
    // arrows compared one multi-batch smear against another (live-tables.js
    // applies the same filter).
    const latestBatchByVenue = {};
    for (const row of currentData) {
      const key = row.bravo_slug || row.venue_name || 'unknown';
      const ts = new Date(row.scrape_timestamp).getTime();
      if (isNaN(ts)) continue;
      if (!latestBatchByVenue[key] || ts > latestBatchByVenue[key].timestamp) {
        latestBatchByVenue[key] = { batch_id: row.scrape_batch_id, timestamp: ts };
      }
    }
    const latestRows = currentData.filter(row => {
      const key = row.bravo_slug || row.venue_name || 'unknown';
      const latest = latestBatchByVenue[key];
      if (!latest || !row.scrape_batch_id) return true;
      return row.scrape_batch_id === latest.batch_id;
    });

    // Aggregate current games by type
    const currentCounts = {};
    latestRows.forEach(row => {
      const game = gameShortLabel(row.game_name || 'Unknown');
      currentCounts[game] = (currentCounts[game] || 0) + 1;
    });

    // --- HISTORICAL COMPARISON ---
    // Load previous snapshot from scraper_watchdog_state
    let previousCounts = {};
    let prevSnapshotData = null;
    let hasHistoricalData = false;
    try {
      const { data: prevSnap } = await supabase
        .from('scraper_watchdog_state')
        .select('value')
        .eq('key', 'game_trends_snapshot')
        .maybeSingle();
      if (prevSnap?.value) {
        prevSnapshotData = JSON.parse(prevSnap.value);
        previousCounts = prevSnapshotData.counts || {};
        
        // We consider it "historical" if we have prior counts AND they aren't from just right now.
        // To avoid locking in 'stable' if the system just started, we require a minimum data payload.
        const currentTotal = Object.keys(currentCounts || {}).length;
        const prevTotal = Object.keys(previousCounts || {}).length;
        hasHistoricalData = prevTotal > 0 && currentTotal > 0 && prevTotal >= Math.min(5, currentTotal / 2);
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // Determine age of previous snapshot to avoid saving too frequently (e.g., only update every 30m)
    let shouldSaveSnapshot = true;
    if (prevSnapshotData && prevSnapshotData.saved_at) {
      const ageMinutes = (new Date() - new Date(prevSnapshotData.saved_at)) / 60000;
      if (ageMinutes < 30) {
        shouldSaveSnapshot = false;
      }
    }

    // Save current snapshot for next comparison (debounced to 30m interval)
    if (shouldSaveSnapshot) {
      try {
        const { error: err_scraper_watchdog_state_c1ues } = await supabase
          .from('scraper_watchdog_state')
          .upsert({
            key: 'game_trends_snapshot',
            value: JSON.stringify({ counts: currentCounts, saved_at: new Date().toISOString() }),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });
        if (err_scraper_watchdog_state_c1ues) console.warn('[Supabase] Silent mutation failed in scraper_watchdog_state:', err_scraper_watchdog_state_c1ues.message);
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }

    // Build trend analysis
    const allGames = new Set([...Object.keys(currentCounts || {}), ...Object.keys(previousCounts || {})]);
    const trends = [];
    
    allGames.forEach(game => {
      const current = currentCounts[game] || 0;
      const previous = previousCounts[game] || 0;
      const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
      
      trends.push({
        game,
        current_tables: current,
        previous_tables: previous,
        change_pct: change,
        trend: previous === 0 ? (hasHistoricalData ? 'new' : 'stable') : (change > 10 ? 'up' : (change < -10 ? 'down' : 'stable')),
      });
    });

    // Sort by current table count descending
    trends.sort((a, b) => b.current_tables - a.current_tables);

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      trends: trends.slice(0, 20),
      // Count of live games in the newest batch per venue — not raw row count,
      // which used to report the (truncated) multi-batch row total.
      total_games_now: latestRows.length,
      has_historical_data: hasHistoricalData,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Game trends error:', err);
    res.status(500).json({ error: err.message });
  }
}
