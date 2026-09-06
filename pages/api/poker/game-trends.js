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
import { fetchAllRows } from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  activityRowBasis,
  aggregateCurrentActivity,
  isCurrentActivityRow,
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

const MAX_CURRENT_ROWS = 10000;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_SNAPSHOT_AGE_MS = 3 * 60 * 60 * 1000;
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
    const responseNow = Date.now();
    const since = new Date(responseNow - MAX_AGE_MS).toISOString();
    const responseNowIso = new Date(responseNow).toISOString();
    const currentResult = await fetchAllRows(() => supabase
        .from('venue_live_tables')
        .select('id, game_name, tables_running, source, data_quality, observation_kind, bravo_slug, venue_name, scrape_batch_id, scrape_timestamp')
        .gte('scrape_timestamp', since)
        .lte('scrape_timestamp', responseNowIso)
        .order('scrape_timestamp', { ascending: false })
        .order('id', { ascending: false }), { maxRows: MAX_CURRENT_ROWS });

    if (currentResult.error || currentResult.truncated) {
      console.warn('Game trends: activity query incomplete:', currentResult.error?.message || 'row ceiling reached');
      return res.status(200).json({
        ...emptyResponse('Activity data could not be completely verified right now.'),
        degraded: true,
        truncated: currentResult.truncated,
      });
    }

    // The timestamp range alone is insufficient: a daemon may explicitly
    // mark a recent row stale. Keep recent catalog identity, but allow only
    // freshness-qualified observed/modeled rows to contribute a trend count.
    const currentData = currentResult.rows.filter((row) => {
      const basis = activityRowBasis(row);
      return basis === 'catalog' || isCurrentActivityRow(row, {
        now: responseNow,
        maxCurrentAgeMs: MAX_AGE_MS,
      });
    });
    const current = aggregateCurrentActivity(currentData, gameShortLabel);
    if (current.qualifiedRows === 0) {
      const catalogAvailable = current.catalogGameCount > 0;
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({
        ...emptyResponse(catalogAvailable
          ? 'Cash games are listed, but current table counts are unknown.'
          : 'No qualified activity is available right now.'),
        data_mode: catalogAvailable ? 'catalog' : 'none',
        catalog_game_count: current.catalogGameCount,
        catalog_venue_count: current.catalogVenueCount,
        source_rows: current.sourceRows,
        qualified_rows: 0,
      });
    }
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
        const previousSavedAt = Date.parse(String(previousSnapshot?.saved_at || ''));
        const previousAge = responseNow - previousSavedAt;
        if (sameTrendSnapshotContract(previousSnapshot)
          && Number.isFinite(previousSavedAt)
          && previousAge >= 0
          && previousAge <= MAX_SNAPSHOT_AGE_MS) {
          previousCounts = previousSnapshot.counts;
          previousBasis = previousSnapshot.basis_by_game;
          hasHistoricalData = Object.keys(previousCounts).length > 0
            && Object.keys(current.counts).length > 0;
        }
      }
    } catch (snapshotError) {
      console.warn('Game trends: prior snapshot could not be read:', snapshotError?.message || snapshotError);
    }

    // Absence from the current contracted snapshot is not a zero observation.
    // Do not manufacture a current zero/trend for games present only in the
    // prior snapshot.
    const allGames = new Set(Object.keys(current.counts));
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
      && (!Number.isFinite(savedAt) || responseNow - savedAt >= 30 * 60 * 1000);
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
      catalog_game_count: current.catalogGameCount,
      catalog_venue_count: current.catalogVenueCount,
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
