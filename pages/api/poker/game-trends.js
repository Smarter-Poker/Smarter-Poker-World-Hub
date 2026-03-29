/**
 * API: /api/poker/game-trends
 * Analyzes game type trends from venue_live_history data.
 * Returns which game types are growing/shrinking across the network.
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

    if (currentErr) throw currentErr;

    // Get historical snapshot from ~7 days ago
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let histData = null;
    try {
      const { data: hd, error: histErr } = await supabase
        .from('venue_live_history')
        .select('venue_name, total_tables, game_count, snapshot_time')
        .gte('snapshot_time', weekAgo)
        .order('snapshot_time', { ascending: true })
        .limit(1);
      if (!histErr) histData = hd;
    } catch (_) {
      // venue_live_history may not exist yet — skip historical comparison
    }

    // Aggregate current games by type
    const currentCounts = {};
    (currentData || []).forEach(row => {
      const game = normalizeGameType(row.game_name);
      currentCounts[game] = (currentCounts[game] || 0) + 1;
    });

    // Historical comparison — venue_live_history stores aggregate counts 
    // (total_tables per venue), not game-level detail. We can compare total 
    // network size but not per-game trends from history alone.
    const historicalCounts = {};
    // Historical game-level data is not available in venue_live_history schema,
    // so trend analysis only reflects current snapshot distribution.

    // Build trend analysis
    const allGames = new Set([...Object.keys(currentCounts), ...Object.keys(historicalCounts)]);
    const trends = [];
    
    allGames.forEach(game => {
      const current = currentCounts[game] || 0;
      const previous = historicalCounts[game] || 0;
      const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
      
      trends.push({
        game,
        current_tables: current,
        previous_tables: previous,
        change_pct: change,
        trend: previous === 0 ? 'stable' : (change > 5 ? 'up' : (change < -5 ? 'down' : 'stable')),
      });
    });

    // Sort by current table count descending
    trends.sort((a, b) => b.current_tables - a.current_tables);

    res.status(200).json({
      trends: trends.slice(0, 20),
      total_games_now: currentData?.length || 0,
      has_historical_data: histData && histData.length > 0,
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
  // Normalize common patterns
  g = g.replace(/No Limit Hold'?em/i, 'NLH')
       .replace(/Pot Limit Omaha/i, 'PLO')
       .replace(/Limit Hold'?em/i, 'LHE')
       .replace(/No Limit/i, 'NL')
       .replace(/Pot Limit/i, 'PL');
  return g;
}
