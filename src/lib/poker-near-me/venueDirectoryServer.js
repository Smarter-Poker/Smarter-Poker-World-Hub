import { applyVenueIntegrity } from './venueIntegrityServer.js';
import { parsePokerMapBounds, isVenueWithinPokerMapBounds } from './mapBounds.js';

export const VENUE_DIRECTORY_FIELDS = [
  'id', 'name', 'slug', 'venue_type', 'address', 'city', 'state', 'country', 'zip',
  'latitude', 'longitude', 'lat', 'lng', 'phone', 'website',
  'profile_photo_url', 'cover_photo_url', 'logo_url', 'tagline', 'about',
  'games_offered', 'stakes_cash', 'poker_tables', 'trust_score', 'is_featured',
  'has_tournaments', 'hours', 'hours_weekday', 'hours_weekend', 'timezone',
  'data_quality', 'scrape_status', 'scrape_source', 'source', 'last_scraped',
  'last_scraped_at', 'last_verified_at', 'location_integrity_revision',
  'is_claimed', 'follower_count', 'social_links', 'is_active', 'is_suppressed',
].join(',');

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
  const filtered = integrity.venues.filter((venue) => (
    venue?.location_quality?.mappable !== false
    && isVenueWithinPokerMapBounds(venue, bounds)
  ));
  const page = bounds ? filtered.slice(offset, offset + limit) : filtered;
  return {
    data: page,
    total: bounds ? filtered.length : (count ?? page.length),
    offset,
    limit,
    viewport: bounds,
    data_integrity: integrity.summary,
  };
}

export const venueDirectoryServerContract = Object.freeze({
  view: 'directory',
  maximumPageSize: 1000,
  excludesCanonicalAliases: true,
});
