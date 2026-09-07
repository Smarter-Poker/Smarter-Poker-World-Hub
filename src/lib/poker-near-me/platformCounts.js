import {
  PNM_TRUTH_CONTRACT_VERSION,
  activityRowBasis,
  aggregateCurrentActivity,
  isCurrentActivityRow,
} from './dataTruth.js';

export const PNM_COUNT_CONTRACT_VERSION = '2026-09-06.2';
export const PNM_CURRENT_ACTIVITY_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const PNM_CATALOG_RETENTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function finiteNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nullableCount(value) {
  if (value === null || value === undefined) return null;
  return Math.trunc(finiteNonNegative(value));
}

function rowTimestamp(row) {
  const parsed = Date.parse(String(
    row?.scrape_timestamp || row?.snapshot_time || row?.created_at || ''
  ));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Convert the venue-integrity result into one stable, reconciled count shape.
 * The public directory total and map total are intentionally different facts.
 */
export function buildDirectoryCountContract({
  catalogActive = null,
  rawPublicRows = 0,
  integritySummary = {},
  publicOutput = 0,
  source = 'supabase',
  revision = null,
} = {}) {
  const publicPlayable = Math.trunc(finiteNonNegative(
    publicOutput || integritySummary?.output
  ));
  const mappedPublic = Math.min(
    publicPlayable,
    Math.trunc(finiteNonNegative(integritySummary?.mapped))
  );
  const heldFromMap = publicPlayable - mappedPublic;

  return {
    catalog_active: nullableCount(catalogActive),
    raw_public_rows: Math.trunc(finiteNonNegative(rawPublicRows)),
    public_playable: publicPlayable,
    mapped_public: mappedPublic,
    held_from_map: heldFromMap,
    missing_coordinates: Math.min(
      heldFromMap,
      Math.trunc(finiteNonNegative(integritySummary?.missing))
    ),
    coordinate_conflicts: Math.min(
      heldFromMap,
      Math.trunc(finiteNonNegative(integritySummary?.held))
    ),
    duplicate_rows_removed: Math.trunc(finiteNonNegative(integritySummary?.duplicate_count)),
    source,
    revision,
  };
}
/**
 * Current activity is limited to fresh rows before provenance aggregation.
 * The returned published total always reconciles to observed + estimated.
 */
export function buildCurrentActivityCountContract(rows, {
  now = Date.now(),
  maxAgeMs = PNM_CURRENT_ACTIVITY_MAX_AGE_MS,
  catalogMaxAgeMs = PNM_CATALOG_RETENTION_MAX_AGE_MS,
} = {}) {
  const input = Array.isArray(rows) ? rows : [];
  const rowAge = (row) => {
    const timestamp = rowTimestamp(row);
    return timestamp === null ? null : now - timestamp;
  };
  const retainedRows = input.filter((row) => {
    const age = rowAge(row);
    if (age === null || age < 0) return false;
    const basis = activityRowBasis(row);
    if (basis === 'catalog') return age <= catalogMaxAgeMs;
    if (basis !== 'observed' && basis !== 'estimated') return false;
    return isCurrentActivityRow(row, { now, maxCurrentAgeMs: maxAgeMs });
  });
  const currentWindowRows = retainedRows.filter((row) => {
    const age = rowAge(row);
    return age !== null && age <= maxAgeMs;
  });
  const activity = aggregateCurrentActivity(retainedRows);
  const countBearingRows = retainedRows.filter((row) => {
    const basis = activityRowBasis(row);
    return basis === 'observed' || basis === 'estimated';
  });
  const timestamps = countBearingRows.map(rowTimestamp).filter(Number.isFinite);
  const newest = timestamps.length ? Math.max(...timestamps) : null;

  return {
    observed: activity.observedTables,
    estimated: activity.estimatedTables,
    published: activity.publishedTables,
    data_mode: activity.dataMode,
    live_count_known: activity.liveCountKnown,
    catalog_venues: activity.catalogVenueCount,
    catalog_games: activity.catalogGameCount,
    venues_with_fresh_rows: new Set(countBearingRows.map((row) => (
      String(row?.bravo_slug || row?.venue_name || row?.venue_id || '').trim().toLowerCase()
    )).filter(Boolean)).size,
    rows_scanned: input.length,
    rows_fresh: currentWindowRows.length,
    rows_retained: retainedRows.length,
    rows_qualified: activity.qualifiedRows,
    rows_catalog: activity.catalogRows,
    as_of: newest === null ? null : new Date(newest).toISOString(),
    age_minutes: newest === null ? null : Math.max(0, Math.round((now - newest) / 60000)),
    freshness_threshold_minutes: Math.round(maxAgeMs / 60000),
    catalog_retention_minutes: Math.round(catalogMaxAgeMs / 60000),
    truth_contract_version: PNM_TRUTH_CONTRACT_VERSION,
  };
}

export function buildPlatformCountEnvelope({ directory, currentTables, degraded = false } = {}) {
  const safeDirectory = directory || buildDirectoryCountContract();
  const safeTables = currentTables || buildCurrentActivityCountContract([]);
  if (safeDirectory.mapped_public + safeDirectory.held_from_map !== safeDirectory.public_playable) {
    throw new Error('Poker Near Me directory counts do not reconcile');
  }
  if (safeTables.observed + safeTables.estimated !== safeTables.published) {
    throw new Error('Poker Near Me table counts do not reconcile');
  }
  return {
    success: true,
    count_contract_version: PNM_COUNT_CONTRACT_VERSION,
    generated_at: new Date().toISOString(),
    degraded: Boolean(degraded),
    directory: safeDirectory,
    current_tables: safeTables,
  };
}
