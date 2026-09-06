/**
 * Shared provenance rules for Poker Near Me activity data.
 *
 * Current activity may combine observed and modeled rows, while catalog rows
 * preserve game identity with no live count. A current observed row wins for
 * the same venue and game; a stale observation yields to a current saved-data
 * estimate. Historical recommendations are stricter: only
 * positive table counts from an approved observed source may drive a
 * prediction or heatmap.
 */

export const PNM_TRUTH_CONTRACT_VERSION = '2026-09-06.2';

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

export function isExpiredActivityRow(row) {
  return normalizedToken(row?.data_quality) === 'expired';
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

/**
 * Catalog rows prove that a venue offers a game, but they do not observe or
 * model how many tables are running. PokerAtlas is a catalog source even for
 * legacy rows written before observation_kind was added.
 */
export function isCatalogActivityRow(row) {
  if (!row) return false;
  const kind = normalizedToken(row.observation_kind);
  if (kind) return kind === 'catalog';
  const source = normalizedToken(row.source);
  const quality = normalizedToken(row.data_quality);
  return source === 'pokeratlas'
    || source === 'poker_atlas'
    || quality.includes('catalog');
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
  // Expired rows are retained for auditability only. In particular, the
  // PokerAtlas cleanup migration marks CTA/non-room discoveries expired so
  // no public catalog consumer can revive them as valid venue identity.
  if (isExpiredActivityRow(row)) return 'unqualified';
  if (isCatalogActivityRow(row)) return 'catalog';
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
 * A current count must be backed by observed or modeled evidence with a
 * readable, non-future timestamp inside the caller's freshness window.
 * Catalog identity is deliberately never a current count.
 */
export function isCurrentActivityRow(row, {
  now = Date.now(),
  maxCurrentAgeMs,
} = {}) {
  const basis = activityRowBasis(row);
  if (basis !== 'observed' && basis !== 'estimated') return false;
  if (normalizedToken(row?.data_quality) === 'stale') return false;
  if (!Number.isFinite(now)
    || !Number.isFinite(maxCurrentAgeMs)
    || maxCurrentAgeMs < 0) return false;
  const stamp = rowTimestamp(row);
  const age = now - stamp;
  return stamp > 0 && age >= 0 && age <= maxCurrentAgeMs;
}

/**
 * Decide whether an incoming row may replace the selected row for the same
 * venue and normalized game. Observed evidence beats a model while both are
 * inside the caller's current-activity window. When only one count-bearing row
 * is current, that row wins so a stale observation cannot suppress a fresh
 * saved-data estimate. Equal-basis rows use freshness.
 */
export function activityRowWins(existing, incoming, {
  now = null,
  maxCurrentAgeMs = null,
} = {}) {
  if (!existing) return activityRowBasis(incoming) !== 'unqualified';
  const existingBasis = activityRowBasis(existing);
  const incomingBasis = activityRowBasis(incoming);
  if (incomingBasis === 'unqualified') return false;
  if (existingBasis === 'unqualified') return true;
  const hasCurrentWindow = Number.isFinite(now)
    && Number.isFinite(maxCurrentAgeMs)
    && maxCurrentAgeMs >= 0;
  const isCountBearing = (basis) => basis === 'observed' || basis === 'estimated';
  if (hasCurrentWindow
    && existingBasis !== incomingBasis
    && isCountBearing(existingBasis)
    && isCountBearing(incomingBasis)) {
    const freshness = { now, maxCurrentAgeMs };
    const existingIsCurrent = isCurrentActivityRow(existing, freshness);
    const incomingIsCurrent = isCurrentActivityRow(incoming, freshness);
    if (existingIsCurrent !== incomingIsCurrent) return incomingIsCurrent;
  }
  if (hasCurrentWindow && existingBasis !== incomingBasis
    && (existingBasis === 'catalog' || incomingBasis === 'catalog')) {
    const countBearingRow = existingBasis === 'catalog' ? incoming : existing;
    const countBearingIsCurrent = isCurrentActivityRow(countBearingRow, {
      now,
      maxCurrentAgeMs,
    });
    if (!countBearingIsCurrent) return incomingBasis === 'catalog';
  }
  const authority = { catalog: 1, estimated: 2, observed: 3 };
  if (existingBasis !== incomingBasis) {
    return (authority[incomingBasis] || 0) > (authority[existingBasis] || 0);
  }
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
  const catalogRowsSelected = latestRows.filter((row) => activityRowBasis(row) === 'catalog');
  const catalogVenues = new Set(catalogRowsSelected.map(venueKey));
  const catalogGames = new Set(catalogRowsSelected.map((row) => (
    `${venueKey(row)}:${normalizedToken(normalizeGame(row?.game_name || row?.game_type || 'Unknown'))}`
  )));

  for (const row of latestRows) {
    const game = normalizeGame(row?.game_name || row?.game_type || 'Unknown');
    const key = `${venueKey(row)}:${normalizedToken(game)}`;
    const basis = activityRowBasis(row);
    const current = byVenueGame.get(key) || {
      game,
      observed: [],
      estimated: [],
      catalog: [],
    };
    current[basis].push(row);
    byVenueGame.set(key, current);
  }

  const counts = {};
  const basisByGame = {};
  let observedTables = 0;
  let estimatedTables = 0;
  let hasObservedEvidence = false;
  let hasEstimatedEvidence = false;

  for (const entry of byVenueGame.values()) {
    const basis = entry.observed.length > 0
      ? 'observed'
      : entry.estimated.length > 0
        ? 'estimated'
        : 'catalog';
    if (basis === 'catalog') {
      continue;
    }
    const count = entry[basis].reduce((sum, row) => sum + tableCountFromRow(row), 0);
    counts[entry.game] = (counts[entry.game] || 0) + count;
    if (!basisByGame[entry.game]) basisByGame[entry.game] = new Set();
    basisByGame[entry.game].add(basis);
    if (basis === 'observed') {
      hasObservedEvidence = true;
      observedTables += count;
    } else {
      hasEstimatedEvidence = true;
      estimatedTables += count;
    }
  }

  const publishedTables = observedTables + estimatedTables;
  const dataMode = hasObservedEvidence
    ? (hasEstimatedEvidence ? 'mixed' : 'live')
    : (hasEstimatedEvidence
      ? 'estimated'
      : (catalogGames.size > 0 && latestRows.every((row) => activityRowBasis(row) === 'catalog')
        ? 'catalog'
        : 'none'));

  const qualifiedRows = latestRows.filter((row) => {
    const basis = activityRowBasis(row);
    return basis === 'observed' || basis === 'estimated';
  }).length;

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
    catalogRows: catalogRowsSelected.length,
    catalogGameCount: catalogGames.size,
    catalogVenueCount: catalogVenues.size,
    liveCountKnown: qualifiedRows > 0,
    sourceRows: Array.isArray(rows) ? rows.length : 0,
    qualifiedRows,
    selectedRows: latestRows.length,
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
