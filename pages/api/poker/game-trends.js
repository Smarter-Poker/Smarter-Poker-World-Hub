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
      .select('game, source')
      .order('scrape_timestamp', { ascending: false })
      .limit(5000);

    if (currentErr) throw currentErr;

    // Get historical snapshot from ~7 days ago
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: histData, error: histErr } = await supabase
      .from('venue_live_history')
      .select('snapshot_data')
      .gte('snapshot_time', weekAgo)
      .order('snapshot_time', { ascending: true })
      .limit(1);

    // Aggregate current games by type
    const currentCounts = {};
    (currentData || []).forEach(row => {
      const game = normalizeGameType(row.game);
      currentCounts[game] = (currentCounts[game] || 0) + 1;
    });

    // Parse historical data if available
    const historicalCounts = {};
    if (histData && histData.length > 0 && histData[0].snapshot_data) {
      const snap = typeof histData[0].snapshot_data === 'string' 
        ? JSON.parse(histData[0].snapshot_data) 
        : histData[0].snapshot_data;
      if (Array.isArray(snap)) {
        snap.forEach(row => {
          const game = normalizeGameType(row.game || row.game_type);
          historicalCounts[game] = (historicalCounts[game] || 0) + 1;
        });
      }
    }

    // Build trend analysis
    const allGames = new Set([...Object.keys(currentCounts), ...Object.keys(historicalCounts)]);
    const trends = [];
    
    allGames.forEach(game => {
      const current = currentCounts[game] || 0;
      const previous = historicalCounts[game] || 0;
      const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
      
      trends.push({
        game,
        current_tables: current,
        previous_tables: previous,
        change_pct: change,
        trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
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
