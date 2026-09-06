/**
 * Shared cash-game estimate adapter for every Poker Near Me surface.
 *
 * The live-tables API publishes observed, modeled, and catalog rows together.
 * Consumers must preserve that provenance: modeled rows are useful but are
 * never described as observations, while catalog rows keep an unknown count.
 */

import {
  normalizeForMatch,
  normalizeVenueName,
  resolveVenueName,
} from './venueMatching.js';

export function normalizeLiveVenueName(value) {
  return normalizeForMatch(value);
}
function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function gameBasis(game) {
  const explicit = String(game?.observation_kind || '').trim().toLowerCase();
  if (explicit === 'catalog') return 'catalog';
  if (['estimated', 'modeled', 'modelled', 'simulated'].includes(explicit)) return 'estimated';
  if (explicit === 'observed') return 'observed';
  if (explicit) return 'unqualified';
  if (game?.is_simulated === true) return 'estimated';
  if (String(game?.source || '').trim().toLowerCase() === 'pokeratlas') return 'catalog';
  return 'observed';
}

export function buildLiveCashGameEntry(venue, metadata = {}, seenAt = Date.now()) {
  const games = Array.isArray(venue?.games) ? venue.games : [];
  const activityGames = games.filter((game) => (
    ['observed', 'estimated'].includes(gameBasis(game))
    && game?.live_count_known !== false
    && game?.is_stale !== true
  ));
  const catalogGames = games.filter((game) => gameBasis(game) === 'catalog');
  const hasObservedEvidence = activityGames.some((game) => gameBasis(game) === 'observed');
  const hasEstimatedEvidence = activityGames.some((game) => gameBasis(game) === 'estimated');
  const liveCountKnown = venue?.live_count_known === false
    ? false
    : venue?.live_count_known === true
      ? true
      : activityGames.length > 0;
  const calculatedTables = activityGames.reduce((sum, game) => sum + finiteCount(game?.tables_running), 0);
  const calculatedWaiting = activityGames.reduce((sum, game) => sum + finiteCount(game?.players_waiting), 0);
  const tablesRunning = liveCountKnown
    && venue?.tables_running_total !== null
    && venue?.tables_running_total !== undefined
    && Number.isFinite(Number(venue.tables_running_total))
    ? finiteCount(venue.tables_running_total)
    : liveCountKnown ? calculatedTables : null;
  const observedTables = Number.isFinite(Number(venue?.tables_running_observed))
    ? finiteCount(venue.tables_running_observed)
    : activityGames.reduce((sum, game) => sum + (
      gameBasis(game) === 'observed' ? finiteCount(game?.tables_running) : 0
    ), 0);
  const simulatedTables = Number.isFinite(Number(venue?.tables_running_simulated))
    ? finiteCount(venue.tables_running_simulated)
    : activityGames.reduce((sum, game) => sum + (
      gameBasis(game) === 'estimated' ? finiteCount(game?.tables_running) : 0
    ), 0);
  const inferredDataMode = !liveCountKnown && catalogGames.length > 0
    ? 'catalog'
    : hasObservedEvidence
      ? (hasEstimatedEvidence ? 'mixed' : 'live')
      : (hasEstimatedEvidence || venue?.is_simulated ? 'estimated' : 'none');
  const explicitDataMode = String(venue?.data_mode || '').trim().toLowerCase();
  // Older live-tables deployments called a modeled zero-table venue "none"
  // even though its per-game rows retained modeled provenance. Recover the
  // stronger row-level evidence so cached responses render "Approx. 0" rather
  // than silently presenting a model as unavailable.
  const dataMode = explicitDataMode === 'none' && inferredDataMode !== 'none'
    ? inferredDataMode
    : (explicitDataMode || inferredDataMode);

  return {
    tables_running: tablesRunning,
    tables_running_observed: observedTables,
    tables_running_simulated: simulatedTables,
    players_waiting: liveCountKnown ? calculatedWaiting : null,
    games,
    data_mode: dataMode,
    is_simulated: venue?.is_simulated === true || dataMode === 'estimated',
    is_stale: venue?.is_stale === true,
    live_count_known: liveCountKnown,
    has_catalog_data: venue?.has_catalog_data === true || catalogGames.length > 0,
    catalog_game_count: catalogGames.length,
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
  if (!Object.prototype.hasOwnProperty.call(index, key)) {
    index[key] = entry;
  } else if (index[key] !== entry) {
    // Fuzzy identity keys must fail closed. Two independently identified feed
    // venues can share a generic normalized name; silently choosing the last
    // one would attach live counts to the wrong casino card.
    index[key] = null;
  }
}

function addTaggedIndexKey(index, tag, value, entry) {
  const key = String(value || '').trim().toLowerCase();
  if (key) addIndexKey(index, `${tag}:${key}`, entry);
}

/** Build a deterministic, ambiguity-safe index of directory venue identity. */
export function buildVenueDirectoryIdentityIndex(venues) {
  const index = {};
  for (const venue of Array.isArray(venues) ? venues : []) {
    [venue?.bravo_slug, venue?.pokeratlas_slug, venue?.slug].forEach((rawSlug) => {
      const slug = String(rawSlug || '').trim().toLowerCase();
      if (!slug) return;
      addTaggedIndexKey(index, 'slug', slug, venue);
      if (slug.startsWith('pa-')) addTaggedIndexKey(index, 'slug', slug.slice(3), venue);
      else addTaggedIndexKey(index, 'slug', `pa-${slug}`, venue);
    });

    const rawName = venue?.name || venue?.venue_name;
    const canonicalName = resolveVenueName(rawName);
    addTaggedIndexKey(index, 'name', normalizeLiveVenueName(rawName), venue);
    addTaggedIndexKey(index, 'name', normalizeLiveVenueName(canonicalName), venue);
    addTaggedIndexKey(index, 'core', normalizeVenueName(canonicalName), venue);
  }
  return index;
}

/** Resolve one live/catalog feed venue to one directory venue, never a guess. */
export function findVenueDirectoryEntry(liveVenue, index) {
  if (!liveVenue || !index) return null;
  const rawName = liveVenue.venue_name || liveVenue.name;
  const canonicalName = resolveVenueName(rawName);
  const slugCandidates = [
    liveVenue.bravo_slug,
    liveVenue.pokeratlas_slug,
    liveVenue.slug,
  ];
  for (const rawSlug of slugCandidates) {
    const slug = String(rawSlug || '').trim().toLowerCase();
    if (!slug) continue;
    const candidates = slug.startsWith('pa-') ? [slug, slug.slice(3)] : [slug, `pa-${slug}`];
    for (const candidate of candidates) {
      const matched = index[`slug:${candidate}`];
      if (matched) return matched;
    }
  }

  const identityCandidates = [
    ['name', normalizeLiveVenueName(rawName)],
    ['name', normalizeLiveVenueName(canonicalName)],
    ['core', normalizeVenueName(canonicalName)],
  ];
  for (const [tag, value] of identityCandidates) {
    const matched = index[`${tag}:${String(value || '').trim().toLowerCase()}`];
    if (value && matched) return matched;
  }
  return null;
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
    const normalizedCore = normalizeVenueName(venue?.venue_name);
    if (normalizedCore) addIndexKey(index, `core:${normalizedCore}`, entry);
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
    normalizeVenueName(venue.name) ? `core:${normalizeVenueName(venue.name)}` : null,
  ];
  for (const candidate of candidates) {
    const key = String(candidate || '').trim().toLowerCase();
    if (key && index[key]) return index[key];
  }
  return null;
}

export function liveCashGameEntrySignature(entry) {
  if (!entry) return 'none';
  const games = (Array.isArray(entry.games) ? entry.games : [])
    .map((game) => [
      String(game?.game || '').trim().toLowerCase(),
      gameBasis(game) === 'catalog' ? 'unknown' : finiteCount(game?.tables_running),
      gameBasis(game) === 'catalog' ? 'unknown' : finiteCount(game?.players_waiting),
      gameBasis(game),
      game?.is_stale === true ? 'stale' : 'fresh',
    ].join(':'))
    .sort()
    .join(',');
  return [
    entry.last_updated || '',
    entry.live_count_known === false ? 'unknown' : finiteCount(entry.tables_running),
    finiteCount(entry.tables_running_observed),
    finiteCount(entry.tables_running_simulated),
    finiteCount(entry.players_waiting),
    entry.data_mode || '',
    entry.live_count_known === false ? 'count-unknown' : 'count-known',
    entry.is_stale === true ? 'stale' : 'fresh',
    games,
  ].join('|');
}

export function isModeledCashGameData(liveData) {
  return liveData?.data_mode === 'estimated'
    || liveData?.is_simulated === true
    || (finiteCount(liveData?.tables_running_simulated) > 0 && finiteCount(liveData?.tables_running_observed) === 0);
}

export function cashGameCountLabel(liveData) {
  if (!liveData) return null;
  if (liveData.data_mode === 'catalog') {
    return 'Games Listed, Live Count Unknown';
  }
  if (liveData.live_count_known === false) return 'Live Count Unavailable';
  const count = finiteCount(liveData.tables_running);
  const noun = count === 1 ? 'Table' : 'Tables';
  if (isModeledCashGameData(liveData)) return `Approx. ${count} ${noun}`;
  if (liveData.data_mode === 'mixed') return `${count} ${noun} (Live + Estimated)`;
  if (liveData.data_mode === 'live') return `Live Now: ${count} ${noun}`;
  return `${count} ${noun}`;
}

/**
 * Age a client-side last-good venue snapshot without reviving its counts.
 * Network failures may preserve identity, game names, and last-known values,
 * but after the contract window the snapshot becomes explicitly unavailable.
 */
export function expireCachedLiveCashGameEntry(
  entry,
  seenAt = Date.now(),
  maxAgeMs = 3 * 60 * 60 * 1000,
) {
  if (!entry || entry.data_mode === 'catalog') return entry;
  const stamp = Date.parse(String(entry.last_activity_updated || entry.last_updated || ''));
  const age = seenAt - stamp;
  if (Number.isFinite(stamp) && age >= 0 && age <= maxAgeMs) return entry;

  const games = (Array.isArray(entry.games) ? entry.games : []).map((game) => {
    if (gameBasis(game) === 'catalog') return game;
    return {
      ...game,
      last_known_tables_running: game?.last_known_tables_running ?? finiteCount(game?.tables_running),
      last_known_players_waiting: game?.last_known_players_waiting ?? finiteCount(game?.players_waiting),
      tables_running: 0,
      players_waiting: 0,
      live_count_known: false,
      is_stale: true,
    };
  });
  const hasCatalogData = entry.has_catalog_data === true
    || games.some((game) => gameBasis(game) === 'catalog');

  return {
    ...entry,
    games,
    last_known_data_mode: entry.data_mode || null,
    tables_running_last_known: entry.tables_running_last_known
      ?? (entry.tables_running_total ?? entry.totalTables ?? null),
    players_waiting_last_known: entry.players_waiting_last_known
      ?? (entry.total_players_waiting ?? entry.totalWait ?? null),
    tables_running_observed: 0,
    tables_running_simulated: 0,
    tables_running_total: null,
    totalTables: null,
    totalWait: null,
    live_count_known: false,
    is_stale: true,
    has_stale_activity: true,
    is_simulated: false,
    has_simulated_data: false,
    data_mode: hasCatalogData ? 'catalog' : 'none',
  };
}

export function expireCachedLiveCashGameMap(entries, seenAt, maxAgeMs) {
  return Object.fromEntries(Object.entries(entries || {}).map(([key, entry]) => [
    key,
    expireCachedLiveCashGameEntry(entry, seenAt, maxAgeMs),
  ]));
}
