/**
 * Shared provenance rules for Poker Near Me activity data.
 *
 * Current activity may combine observed and modeled rows, but an observed row
 * always wins for the same venue and game. Historical recommendations are
 * stricter: only positive table counts from an approved observed source may
 * drive a prediction or heatmap.
 */

export const PNM_TRUTH_CONTRACT_VERSION = '2026-09-06.1';

export const QUALIFIED_OBSERVED_SOURCES = Object.freeze([
  'bravo',
  'bravo_scrape',
  'community_verified',
  'manual_verified',
  'operator',
  'operator_feed',
  'venue_reported',
]);

const OBSERVED_SOURCE_SET = new Set(QUALIFIED_OBSERVED_SOURCES);

function normalizedToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function nonNegativeTableCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function tableCountFromRow(row) {
  return nonNegativeTableCount(row?.tables_running ?? row?.tables ?? row?.total_tables);
}

export function isModeledActivityRow(row) {
  const source = normalizedToken(row?.source);
  const quality = normalizedToken(row?.data_quality);
  const kind = normalizedToken(row?.observation_kind);
  const batchId = normalizedToken(row?.scrape_batch_id ?? row?.batch_id);

  return row?.is_simulated === true
    || batchId.startsWith('sim_')
    || source.includes('simulat')
    || source.includes('model')
    || source.includes('estimat')
    || quality.includes('simulat')
    || quality.includes('model')
    || quality.includes('estimat')
    || kind.includes('simulat')
    || kind.includes('model')
    || kind.includes('estimat');
}

export function isQualifiedObservedActivityRow(row) {
  if (!row || isModeledActivityRow(row)) return false;
  const kind = normalizedToken(row.observation_kind);
  const quality = normalizedToken(row.data_quality);
  if (kind && kind !== 'observed') return false;
  if (quality.includes('catalog') || quality.includes('unverified')) return false;
  return OBSERVED_SOURCE_SET.has(normalizedToken(row.source));
}

export function activityRowBasis(row) {
  if (isModeledActivityRow(row)) return 'estimated';
  if (isQualifiedObservedActivityRow(row)) return 'observed';
  return 'unqualified';
}

function venueKey(row) {
  return normalizedToken(row?.bravo_slug || row?.venue_name || row?.venue_id || 'unknown');
}

function rowTimestamp(row) {
  const value = new Date(
    row?.scrape_timestamp || row?.scraped_at || row?.snapshot_time || row?.created_at || 0
  ).getTime();
  return Number.isFinite(value) ? value : 0;
}

/**
 * Decide whether an incoming row may replace the selected row for the same
 * venue and normalized game. Observed evidence always beats a model, even
 * when the model was published more recently; equal-basis rows use freshness.
 */
export function activityRowWins(existing, incoming) {
  if (!existing) return activityRowBasis(incoming) !== 'unqualified';
  const existingBasis = activityRowBasis(existing);
  const incomingBasis = activityRowBasis(incoming);
  if (incomingBasis === 'unqualified') return false;
  if (existingBasis === 'unqualified') return true;
  if (existingBasis !== incomingBasis) return incomingBasis === 'observed';
  return rowTimestamp(incoming) > rowTimestamp(existing);
}

function rowBatchId(row) {
  return String(row?.scrape_batch_id || row?.batch_id || '').trim();
}

/**
 * Keep the newest batch for each venue and provenance class independently.
 * This prevents a newer model publication from suppressing a valid observed
 * scrape for the same venue.
 */
export function latestActivityRowsByVenueAndBasis(rows) {
  const input = Array.isArray(rows) ? rows : [];
  const grouped = new Map();
  for (const row of input) {
    const basis = activityRowBasis(row);
    if (basis === 'unqualified') continue;
    const key = `${venueKey(row)}:${basis}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const selectedRows = new Set();
  for (const venueRows of grouped.values()) {
    const latestRow = venueRows.reduce((latest, row) => (
      !latest || rowTimestamp(row) > rowTimestamp(latest) ? row : latest
    ), null);
    const latestBatch = rowBatchId(latestRow);

    if (latestBatch) {
      for (const row of venueRows) {
        if (rowBatchId(row) === latestBatch) selectedRows.add(row);
      }
      continue;
    }

    // Legacy rows were written without a batch identifier and individual
    // games often received slightly different timestamps. Keeping only the
    // venue's single newest timestamp erased every other game. In that legacy
    // case, select the newest batchless row independently per normalized game.
    const newestByGame = new Map();
    for (const row of venueRows) {
      if (rowBatchId(row)) continue;
      const game = normalizedToken(row?.game_name || row?.game_type || 'unknown');
      const current = newestByGame.get(game);
      if (!current || rowTimestamp(row) > rowTimestamp(current)) newestByGame.set(game, row);
    }
    for (const row of newestByGame.values()) selectedRows.add(row);
  }

  return input.filter((row) => selectedRows.has(row));
}

/**
 * Aggregate the publishable current snapshot. Observed data takes precedence
 * over an estimate for the same venue and normalized game.
 */
export function aggregateCurrentActivity(rows, normalizeGame = (value) => String(value || 'Unknown')) {
  const latestRows = latestActivityRowsByVenueAndBasis(rows);
  const byVenueGame = new Map();

  for (const row of latestRows) {
    const game = normalizeGame(row?.game_name || row?.game_type || 'Unknown');
    const key = `${venueKey(row)}:${normalizedToken(game)}`;
    const basis = activityRowBasis(row);
    const current = byVenueGame.get(key) || { game, observed: [], estimated: [] };
    current[basis].push(row);
    byVenueGame.set(key, current);
  }

  const counts = {};
  const basisByGame = {};
  let observedTables = 0;
  let estimatedTables = 0;

  for (const entry of byVenueGame.values()) {
    const basis = entry.observed.length > 0 ? 'observed' : 'estimated';
    const count = entry[basis].reduce((sum, row) => sum + tableCountFromRow(row), 0);
    counts[entry.game] = (counts[entry.game] || 0) + count;
    if (!basisByGame[entry.game]) basisByGame[entry.game] = new Set();
    basisByGame[entry.game].add(basis);
    if (basis === 'observed') observedTables += count;
    else estimatedTables += count;
  }

  const publishedTables = observedTables + estimatedTables;
  const dataMode = observedTables > 0
    ? (estimatedTables > 0 ? 'mixed' : 'live')
    : (estimatedTables > 0 ? 'estimated' : 'none');

  return {
    counts,
    basisByGame: Object.fromEntries(Object.entries(basisByGame).map(([game, values]) => [
      game,
      values.size > 1 ? 'mixed' : [...values][0],
    ])),
    dataMode,
    observedTables,
    estimatedTables,
    publishedTables,
    sourceRows: Array.isArray(rows) ? rows.length : 0,
    qualifiedRows: latestRows.length,
  };
}

export function qualifiedPositiveHistory(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    isQualifiedObservedActivityRow(row)
    && tableCountFromRow(row) > 0
    && rowTimestamp(row) > 0
  ));
}

export function historicalCoverage(rows) {
  const qualified = qualifiedPositiveHistory(rows);
  const dates = new Set(qualified.map((row) => new Date(
    row.snapshot_time || row.scrape_timestamp || row.created_at
  ).toISOString().slice(0, 10)));
  return {
    qualifiedRows: qualified,
    dataPoints: qualified.length,
    observedDays: dates.size,
    sufficientForPrediction: dates.size >= 7,
  };
}

export function sameTrendSnapshotContract(snapshot) {
  return !!(snapshot?.contract_version === PNM_TRUTH_CONTRACT_VERSION
    && snapshot?.counts
    && snapshot?.basis_by_game);
}
