/**
 * API: /api/poker/game-trends
 * Analyzes game type trends from venue_live_tables data.
 * Compares current snapshot against a cached previous snapshot
 * stored in scraper_watchdog_state to show real trend arrows.
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
  try {
    const supabase = getSupabase();
    
    // Get current snapshot (latest batch)
    const { data: currentData, error: currentErr } = await supabase
      .from('venue_live_tables')
      .select('game_name, source')
      .order('scrape_timestamp', { ascending: false })
      .limit(5000);

    if (currentErr) {
      console.warn('Game trends: live tables query failed:', currentErr.message);
      return res.status(200).json({ trends: [], total_games_now: 0, has_historical_data: false, analyzed_at: new Date().toISOString() });
    }

    // Aggregate current games by type
    const currentCounts = {};
    (currentData || []).forEach(row => {
      const game = normalizeGameType(row.game_name);
      currentCounts[game] = (currentCounts[game] || 0) + 1;
    });

    // --- HISTORICAL COMPARISON ---
    // Load previous snapshot from scraper_watchdog_state
    let previousCounts = {};
    let hasHistoricalData = false;
    try {
      const { data: prevSnap } = await supabase
        .from('scraper_watchdog_state')
        .select('value')
        .eq('key', 'game_trends_snapshot')
        .maybeSingle();
      if (prevSnap?.value) {
        const parsed = JSON.parse(prevSnap.value);
        previousCounts = parsed.counts || {};
        hasHistoricalData = Object.keys(previousCounts).length > 0;
      }
    } catch (_) {
      // Table may not exist — just skip
    }

    // Save current snapshot for next comparison (runs ~every page load, but state is persisted)
    try {
      await supabase
        .from('scraper_watchdog_state')
        .upsert({
          key: 'game_trends_snapshot',
          value: JSON.stringify({ counts: currentCounts, saved_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
    } catch (_) {
      // Silent — non-critical
    }

    // Build trend analysis
    const allGames = new Set([...Object.keys(currentCounts), ...Object.keys(previousCounts)]);
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

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.status(200).json({
      trends: trends.slice(0, 20),
      total_games_now: currentData?.length || 0,
      has_historical_data: hasHistoricalData,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Game trends error:', err);
    res.status(500).json({ error: err.message });
  }
}

function normalizeGameType(raw) {
  if (!raw) return 'Unknown';
  let g = raw.trim();
  // Normalize common patterns for cleaner grouping
  g = g.replace(/No Limit Hold'?em/i, 'NLH')
       .replace(/Pot Limit Omaha/i, 'PLO')
       .replace(/Limit Hold'?em/i, 'LHE')
       .replace(/No Limit/i, 'NL')
       .replace(/Pot Limit/i, 'PL');
  return g;
}
