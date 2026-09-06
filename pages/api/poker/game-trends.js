/**
 * API: /api/poker/game-trends
 *
 * Publishes current observed and modeled table activity without merging their
 * provenance. Historical arrows are compared only against a prior snapshot
 * produced by the same truth contract.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { gameShortLabel } from '../../../src/components/poker-near-me/normalize-game';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  aggregateCurrentActivity,
  sameTrendSnapshotContract,
} from '../../../src/lib/poker-near-me/dataTruth';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const SNAPSHOT_KEY = 'game_trends_snapshot_v2';

function emptyResponse(message = 'No qualified activity is available right now.') {
  return {
    trends: [],
    total_games_now: 0,
    total_tables_observed: 0,
    total_tables_estimated: 0,
    data_mode: 'none',
    has_historical_data: false,
    truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
    message,
    analyzed_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const supabase = getSupabase();
    const since = new Date(Date.now() - MAX_AGE_MS).toISOString();
    let currentData = [];
    let currentErr = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const { data: pageRows, error } = await supabase
        .from('venue_live_tables')
        .select('game_name, tables_running, source, data_quality, bravo_slug, venue_name, scrape_batch_id, scrape_timestamp')
        .gte('scrape_timestamp', since)
        .order('scrape_timestamp', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        currentErr = error;
        break;
      }
      if (!pageRows || pageRows.length === 0) break;
      currentData = currentData.concat(pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }

    if (currentErr) {
      console.warn('Game trends: activity query failed:', currentErr.message);
      return res.status(200).json(emptyResponse('Activity data could not be verified right now.'));
    }

    const current = aggregateCurrentActivity(currentData, gameShortLabel);
    let previousCounts = {};
    let previousBasis = {};
    let previousSnapshot = null;
    let hasHistoricalData = false;

    try {
      const { data: saved } = await supabase
        .from('scraper_watchdog_state')
        .select('value')
        .eq('key', SNAPSHOT_KEY)
        .maybeSingle();
      if (saved?.value) {
        previousSnapshot = typeof saved.value === 'string'
          ? JSON.parse(saved.value)
          : saved.value;
        if (sameTrendSnapshotContract(previousSnapshot)) {
          previousCounts = previousSnapshot.counts;
          previousBasis = previousSnapshot.basis_by_game;
          hasHistoricalData = Object.keys(previousCounts).length > 0
            && Object.keys(current.counts).length > 0;
        }
      }
    } catch (snapshotError) {
      console.warn('Game trends: prior snapshot could not be read:', snapshotError?.message || snapshotError);
    }

    const allGames = new Set([...Object.keys(current.counts), ...Object.keys(previousCounts)]);
    const trends = [];
    for (const game of allGames) {
      const currentTables = current.counts[game] || 0;
      const previousTables = previousCounts[game] || 0;
      const basis = current.basisByGame[game] || previousBasis[game] || 'unavailable';
      const comparable = hasHistoricalData
        && previousBasis[game] === current.basisByGame[game]
        && !!current.basisByGame[game];
      const change = comparable && previousTables > 0
        ? Math.round(((currentTables - previousTables) / previousTables) * 100)
        : 0;

      trends.push({
        game,
        current_tables: currentTables,
        previous_tables: comparable ? previousTables : null,
        change_pct: change,
        trend: !comparable
          ? 'stable'
          : previousTables === 0
            ? 'new'
            : change > 10
              ? 'up'
              : change < -10
                ? 'down'
                : 'stable',
        basis,
      });
    }
    trends.sort((a, b) => b.current_tables - a.current_tables);

    const savedAt = previousSnapshot?.saved_at ? new Date(previousSnapshot.saved_at).getTime() : 0;
    const shouldSave = current.qualifiedRows > 0
      && (!Number.isFinite(savedAt) || Date.now() - savedAt >= 30 * 60 * 1000);
    if (shouldSave) {
      try {
        const value = JSON.stringify({
          contract_version: PNM_TRUTH_CONTRACT_VERSION,
          counts: current.counts,
          basis_by_game: current.basisByGame,
          data_mode: current.dataMode,
          saved_at: new Date().toISOString(),
        });
        const { error } = await supabase
          .from('scraper_watchdog_state')
          .upsert({ key: SNAPSHOT_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) console.warn('Game trends: current snapshot could not be saved:', error.message);
      } catch (snapshotError) {
        console.warn('Game trends: current snapshot write failed:', snapshotError?.message || snapshotError);
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      trends: trends.slice(0, 20),
      total_games_now: current.publishedTables,
      total_tables_observed: current.observedTables,
      total_tables_estimated: current.estimatedTables,
      data_mode: current.dataMode,
      source_rows: current.sourceRows,
      qualified_rows: current.qualifiedRows,
      has_historical_data: hasHistoricalData,
      truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
      message: current.dataMode === 'none' ? 'No qualified activity is available right now.' : null,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (sentryError) {
      console.warn('Game trends: error reporting failed:', sentryError?.message || sentryError);
    }
    console.warn('Game trends error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
