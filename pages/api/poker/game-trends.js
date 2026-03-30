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
        const currentTotal = Object.keys(currentCounts).length;
        const prevTotal = Object.keys(previousCounts).length;
        hasHistoricalData = prevTotal > 0 && currentTotal > 0 && prevTotal >= Math.min(5, currentTotal / 2);
      }
    } catch (_) {
      // Table may not exist — just skip
    }

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

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
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
  let g = raw.trim().toUpperCase();
  
  // Remove dollar signs for cleaner strings
  g = g.replace(/\$(\d+)/g, '$1'); 
  // Normalize stakes formats across Bravo (1/2) and PokerAtlas (1-2)
  // e.g., "1-3 NL" -> "1/3 NL"
  g = g.replace(/(\d+)\s*-\s*(\d+)/g, '$1/$2');

  // Normalize common patterns for cleaner grouping
  g = g.replace(/NO LIMIT HOLD'?EM/i, 'NLH')
       .replace(/LIMIT HOLD'?EM/i, 'LHE')
       .replace(/POT LIMIT OMAHA/i, 'PLO')
       .replace(/NO LIMIT/i, 'NL')
       .replace(/POT LIMIT/i, 'PL')
       .replace(/HOLD'?EM/i, 'Holdem')
       .replace(/OMAHA/i, 'Omaha');
       
  // Title case the remainder (e.g., "1/3 NLH" instead of "1/3 NLH" -> actually we uppercase everything above)
  // Since acronyms like NLH / PLO are best upper, and "Limit" is better Title, let's keep acronyms upper
  g = g.replace(/HOLDEM/i, 'Holdem')
       .replace(/LIMIT/i, 'Limit')
       .replace(/MIXED/i, 'Mixed');

  // Specific fix for the duplicate issue
  g = g.replace(/NL HOLDEM/gi, 'NLH');

  return g;
}
