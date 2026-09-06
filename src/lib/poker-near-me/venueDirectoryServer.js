import { applyVenueIntegrity } from './venueIntegrityServer.js';
import { parsePokerMapBounds, isVenueWithinPokerMapBounds } from './mapBounds.js';

export const VENUE_DIRECTORY_FIELD_LIST = [
  'id', 'name', 'slug', 'pokeratlas_slug', 'venue_type', 'address', 'city', 'state', 'country', 'zip',
  'latitude', 'longitude', 'lat', 'lng', 'phone', 'website',
  'profile_photo_url', 'cover_photo_url', 'logo_url', 'tagline', 'about',
  'games_offered', 'stakes_cash', 'poker_tables', 'trust_score', 'is_featured',
  'has_tournaments', 'hours', 'hours_weekday', 'hours_weekend', 'timezone',
  'data_quality', 'scrape_status', 'scrape_source', 'source', 'last_scraped',
  'last_scraped_at', 'last_verified_at', 'location_integrity_revision',
  'is_claimed', 'follower_count', 'social_links', 'is_active', 'is_suppressed',
];

export const VENUE_DIRECTORY_FIELDS = VENUE_DIRECTORY_FIELD_LIST.join(',');

function one(value) {
  return Array.isArray(value) ? value[0] : value;
}

function text(value, max = 120) {
  return typeof one(value) === 'string' ? one(value).trim().slice(0, max) : '';
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(one(value), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function compareDirectoryVenues(a, b) {
  return Number(Boolean(b?.is_featured)) - Number(Boolean(a?.is_featured))
    || (Number(b?.trust_score) || 0) - (Number(a?.trust_score) || 0)
    || String(a?.name || '').localeCompare(String(b?.name || ''));
}

function isoOrNull(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function snapshotEnvelope(metadata = {}, publicCount = 0) {
  const snapshot = metadata?.directory_snapshot || metadata || {};
  const projectedHash = text(snapshot.projected_sha256, 64);
  const generatedAt = isoOrNull(snapshot.generated_at || metadata?.generated_at);
  return {
    schema_version: Number(snapshot.schema_version) || 1,
    generated_at: generatedAt,
    projected_sha256: projectedHash || null,
    public_count: Number(snapshot.public_count) || publicCount,
    source_count: Number(snapshot.source_count) || Number(metadata?.total) || publicCount,
    newest_source_at: isoOrNull(snapshot.newest_source_at),
    oldest_source_at: isoOrNull(snapshot.oldest_source_at),
  };
}

function liveDirectoryRevision({ data = [], total = 0 } = {}) {
  const revisions = data.map((venue) => Number(venue?.location_integrity_revision) || 0);
  const newest = data
    .flatMap((venue) => [venue?.last_verified_at, venue?.last_scraped_at, venue?.last_scraped])
    .map((value) => Date.parse(String(value || '')))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return `supabase:${Number(total) || data.length}:${Math.max(0, ...revisions)}:${newest || 0}`;
}

function projectDirectoryVenue(venue) {
  const projected = {};
  VENUE_DIRECTORY_FIELD_LIST.forEach((field) => {
    if (venue?.[field] !== undefined) projected[field] = venue[field];
  });
  if (venue?.location_quality) projected.location_quality = venue.location_quality;
  return projected;
}

function snapshotMatchesSearch(venue, search) {
  if (!search) return true;
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [venue?.name, venue?.address, venue?.city, venue?.state, venue?.country]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/**
 * Build the exact public directory envelope from the checked-in venue snapshot.
 * This is deliberately projection-only: private/contact and scraper-internal
 * fields in all-venues.json never cross the API or SSR boundary.
 */
export function buildSnapshotVenueDirectory({ params = {}, venues = [], metadata = {} } = {}) {
  const limit = integer(params.limit, 100, 1, 1000);
  const offset = integer(params.offset, 0, 0, 1_000_000);
  const { bounds, error: boundsError } = parsePokerMapBounds(params);
  if (boundsError) {
    const error = new Error(boundsError);
    error.statusCode = 400;
    throw error;
  }

  const state = text(params.state, 40).toUpperCase();
  const city = text(params.city, 120).toLowerCase();
  const type = text(params.type || params.venue_type, 60).toLowerCase();
  const search = text(params.search, 120);
  const featuredOnly = text(params.featured, 8).toLowerCase() === 'true';
  const tournamentsOnly = text(params.tournaments, 8).toLowerCase() === 'true';

  const candidates = (Array.isArray(venues) ? venues : [])
    .filter((venue) => venue?.is_active === true)
    .filter((venue) => venue?.is_suppressed !== true)
    .filter((venue) => venue?.id !== 3109)
    .filter((venue) => venue?.canonical_venue_id == null)
    .filter((venue) => !['series', 'tour', 'home_game'].includes(String(venue?.venue_type || '').toLowerCase()))
    .filter((venue) => !state || String(venue?.state || '').toUpperCase() === state)
    .filter((venue) => !city || String(venue?.city || '').toLowerCase() === city)
    .filter((venue) => !type || String(venue?.venue_type || '').toLowerCase() === type)
    .filter((venue) => !featuredOnly || venue?.is_featured === true)
    .filter((venue) => !tournamentsOnly || venue?.has_tournaments === true)
    .filter((venue) => snapshotMatchesSearch(venue, search))
    .sort(compareDirectoryVenues);

  const integrity = applyVenueIntegrity(candidates);
  // A location conflict is a map hold, not a search deletion. National/list
  // discovery must retain the identity and its review status; only a viewport
  // request is allowed to remove records that cannot be placed truthfully.
  const visible = bounds
    ? integrity.venues.filter((venue) => (
      venue?.location_quality?.mappable !== false
      && isVenueWithinPokerMapBounds(venue, bounds)
    ))
    : integrity.venues;

  const snapshot = snapshotEnvelope(metadata, visible.length);
  return {
    data: visible.slice(offset, offset + limit).map(projectDirectoryVenue),
    total: visible.length,
    offset,
    limit,
    viewport: bounds,
    data_integrity: integrity.summary,
    degraded: true,
    data_source: 'static_snapshot',
    data_revision: snapshot.projected_sha256
      ? `snapshot:${snapshot.projected_sha256.slice(0, 16)}`
      : `snapshot:legacy:${snapshot.public_count}`,
    snapshot,
  };
}

function directoryQuery(supabase, params, { count = 'exact' } = {}) {
  const state = text(params.state, 40).toUpperCase();
  const city = text(params.city, 120);
  const type = text(params.type || params.venue_type, 60);
  const search = text(params.search, 120);
  let query = supabase
    .from('poker_venues')
    .select(VENUE_DIRECTORY_FIELDS, { count })
    .eq('is_active', true)
    .eq('is_suppressed', false)
    .neq('id', 3109)
    .is('canonical_venue_id', null)
    .not('venue_type', 'in', '(series,tour,home_game)');

  if (state) query = query.eq('state', state);
  if (city) query = query.ilike('city', city);
  if (type) query = query.eq('venue_type', type);
  if (text(params.featured, 8).toLowerCase() === 'true') query = query.eq('is_featured', true);
  if (text(params.tournaments, 8).toLowerCase() === 'true') query = query.eq('has_tournaments', true);
  if (search) {
    query = query.textSearch('search_vector', search, { type: 'websearch' });
  }
  return query;
}

/**
 * Lightweight, projection-only venue directory query. The rich venue endpoint
 * still owns detail enrichment; location landing pages and first paint should
 * not run those schedule/social joins for every venue in the country.
 */
export async function fetchVenueDirectory({ supabase, params = {} }) {
  if (!supabase) throw new Error('A Supabase server client is required');
  const limit = integer(params.limit, 100, 1, 1000);
  const offset = integer(params.offset, 0, 0, 1_000_000);
  const { bounds, error: boundsError } = parsePokerMapBounds(params);
  if (boundsError) {
    const error = new Error(boundsError);
    error.statusCode = 400;
    throw error;
  }

  // Fetch an exact DB page when no viewport post-filter is required. A viewport
  // needs all candidate rows so filtering does not under-fill the requested page.
  const rangeStart = bounds ? 0 : offset;
  const rangeEnd = bounds ? 999 : offset + limit - 1;
  let query = directoryQuery(supabase, params)
    .order('is_featured', { ascending: false })
    .order('trust_score', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(rangeStart, rangeEnd);
  const { data, error, count } = await query;
  if (error) throw error;

  const integrity = applyVenueIntegrity(data || []);
  const filtered = bounds
    ? integrity.venues.filter((venue) => (
      venue?.location_quality?.mappable !== false
      && isVenueWithinPokerMapBounds(venue, bounds)
    ))
    : integrity.venues;
  const page = bounds ? filtered.slice(offset, offset + limit) : filtered;
  const result = {
    data: page,
    total: bounds ? filtered.length : (count ?? page.length),
    offset,
    limit,
    viewport: bounds,
    data_integrity: integrity.summary,
  };
  return { ...result, data_revision: liveDirectoryRevision(result) };
}

/**
 * Public-read resilience wrapper. Admin, mutation, auth, and realtime paths do
 * not use this helper and continue to fail closed when Supabase is unavailable.
 */
export async function fetchVenueDirectoryResilient({
  supabase,
  params = {},
  fallbackVenues = [],
  fallbackMetadata = {},
  onFallback,
} = {}) {
  try {
    const directory = await fetchVenueDirectory({ supabase, params });
    if (directory.total === 0 && fallbackVenues.length > 0) {
      const snapshot = buildSnapshotVenueDirectory({ params, venues: fallbackVenues, metadata: fallbackMetadata });
      if (snapshot.total > 0) {
        const error = new Error('Live venue directory returned an unexpected empty projection');
        if (typeof onFallback === 'function') onFallback(error);
        return snapshot;
      }
    }
    return { ...directory, degraded: false, data_source: 'supabase' };
  } catch (error) {
    if (error?.statusCode === 400) throw error;
    if (typeof onFallback === 'function') onFallback(error);
    return buildSnapshotVenueDirectory({ params, venues: fallbackVenues, metadata: fallbackMetadata });
  }
}

export const venueDirectoryServerContract = Object.freeze({
  view: 'directory',
  maximumPageSize: 1000,
  excludesCanonicalAliases: true,
  publicSnapshotFallback: true,
  snapshotProvenance: true,
});
