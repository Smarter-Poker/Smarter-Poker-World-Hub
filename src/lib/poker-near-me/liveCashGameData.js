/**
 * Shared cash-game estimate adapter for every Poker Near Me surface.
 *
 * The live-tables API publishes observed and modeled rows together. Consumers
 * must preserve that provenance: modeled rows are useful, but they are never
 * described as live observations.
 */

export function normalizeLiveVenueName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/'/g, '')
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function buildLiveCashGameEntry(venue, metadata = {}, seenAt = Date.now()) {
  const games = Array.isArray(venue?.games) ? venue.games : [];
  const calculatedTables = games.reduce((sum, game) => sum + finiteCount(game?.tables_running), 0);
  const calculatedWaiting = games.reduce((sum, game) => sum + finiteCount(game?.players_waiting), 0);
  const tablesRunning = Number.isFinite(Number(venue?.tables_running_total))
    ? finiteCount(venue.tables_running_total)
    : calculatedTables;
  const observedTables = Number.isFinite(Number(venue?.tables_running_observed))
    ? finiteCount(venue.tables_running_observed)
    : games.reduce((sum, game) => sum + (game?.is_simulated ? 0 : finiteCount(game?.tables_running)), 0);
  const simulatedTables = Number.isFinite(Number(venue?.tables_running_simulated))
    ? finiteCount(venue.tables_running_simulated)
    : games.reduce((sum, game) => sum + (game?.is_simulated ? finiteCount(game?.tables_running) : 0), 0);
  const dataMode = venue?.data_mode
    || (observedTables > 0 ? (simulatedTables > 0 ? 'mixed' : 'live') : (simulatedTables > 0 || venue?.is_simulated ? 'estimated' : 'none'));

  return {
    tables_running: tablesRunning,
    tables_running_observed: observedTables,
    tables_running_simulated: simulatedTables,
    players_waiting: calculatedWaiting,
    games,
    data_mode: dataMode,
    is_simulated: venue?.is_simulated === true || dataMode === 'estimated',
    is_stale: venue?.is_stale === true,
    age_minutes: Number.isFinite(Number(venue?.age_minutes)) ? Number(venue.age_minutes) : null,
    last_updated: venue?.last_updated || null,
    bravo_slug: venue?.bravo_slug || null,
    _seen_at: seenAt,
    feed_data_mode: metadata?.data_mode || null,
  };
}

function addIndexKey(index, value, entry) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return;
  index[key] = entry;
}

export function buildLiveCashGameIndex(payload, seenAt = Date.now()) {
  const index = {};
  const metadata = payload?.metadata || {};
  for (const venue of Array.isArray(payload?.venues) ? payload.venues : []) {
    const entry = buildLiveCashGameEntry(venue, metadata, seenAt);
    const slug = String(venue?.bravo_slug || '').trim().toLowerCase();
    addIndexKey(index, slug, entry);
    if (slug.startsWith('pa-')) addIndexKey(index, slug.slice(3), entry);
    addIndexKey(index, normalizeLiveVenueName(venue?.venue_name), entry);
  }
  return index;
}

export function findLiveCashGameEntry(venue, index) {
  if (!venue || !index) return null;
  const candidates = [
    venue.bravo_slug,
    venue.pokeratlas_slug,
    venue.slug,
    venue.pokeratlas_slug ? `pa-${venue.pokeratlas_slug}` : null,
    venue.slug ? `pa-${venue.slug}` : null,
    normalizeLiveVenueName(venue.name),
  ];
  for (const candidate of candidates) {
    const key = String(candidate || '').trim().toLowerCase();
    if (key && index[key]) return index[key];
  }
  return null;
}

export function isModeledCashGameData(liveData) {
  return liveData?.data_mode === 'estimated'
    || liveData?.is_simulated === true
    || (finiteCount(liveData?.tables_running_simulated) > 0 && finiteCount(liveData?.tables_running_observed) === 0);
}

export function cashGameCountLabel(liveData) {
  if (!liveData) return null;
  const count = finiteCount(liveData.tables_running);
  const noun = count === 1 ? 'Table' : 'Tables';
  if (isModeledCashGameData(liveData)) return `Approx. ${count} ${noun}`;
  if (liveData.data_mode === 'mixed') return `${count} ${noun} (Live + Estimated)`;
  if (liveData.data_mode === 'live') return `Live Now: ${count} ${noun}`;
  return `${count} ${noun}`;
}
