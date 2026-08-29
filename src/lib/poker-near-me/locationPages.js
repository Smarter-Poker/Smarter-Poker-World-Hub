import {
  US_STATES_BY_CODE,
  cityTitleToSlug,
  stateCodeToName,
  stateCodeToSlug,
  stateSlugToCode,
} from '../home-games/locationUtils';

const SITE_ORIGIN = 'https://smarter.poker';
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
const locationRequestCache = new Map();

function requestOrigin(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : SITE_ORIGIN;
}

function forwardedHeaders(req) {
  const headers = { 'User-Agent': 'sp-location-ssr' };
  const realIp = String(req?.headers?.['x-real-ip'] || '').split(',')[0].trim();
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').trim();
  if (realIp) headers['x-real-ip'] = realIp;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  else if (realIp) headers['x-forwarded-for'] = realIp;
  return headers;
}

function normalizeVenue(row) {
  if (!row || !row.id || !row.name || ['series', 'tour', 'home_game'].includes(row.venue_type)) return null;
  return {
    id: row.id,
    name: row.name,
    city: row.city || '',
    state: String(row.state || '').toUpperCase().slice(0, 2),
    venue_type: row.venue_type || 'poker_room',
    address: row.address || row.street_address || '',
    profile_photo_url: row.profile_photo_url || row.logo_url || '',
    cover_photo_url: row.cover_photo_url || row.image_url || '',
    trust_score: Number(row.trust_score) || 0,
    is_featured: !!row.is_featured,
    updated_at: row.updated_at || row.last_verified_at || row.last_scraped_at || null,
  };
}

export async function fetchPokerVenueLocation({ req, state, city }) {
  const cacheKey = `${state || 'all'}:${city || 'all'}`.toLowerCase();
  const cached = locationRequestCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const query = new URLSearchParams({ limit: '1000' });
  if (state) query.set('state', state);
  if (city) query.set('city', city);

  const promise = (async () => {
    const response = await fetch(`${requestOrigin(req)}/api/poker/venues?${query.toString()}`, {
      headers: forwardedHeaders(req),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Venue API returned ${response.status}`);
    const payload = await response.json();
    const venues = (Array.isArray(payload.data) ? payload.data : [])
      .map(normalizeVenue)
      .filter(Boolean)
      .filter((venue) => !state || venue.state === state)
      .filter((venue) => !city || cityTitleToSlug(venue.city) === cityTitleToSlug(city))
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || b.trust_score - a.trust_score || a.name.localeCompare(b.name));
    return {
      venues,
      degraded: !!payload.degraded,
      fetchedAt: new Date().toISOString(),
    };
  })();

  locationRequestCache.set(cacheKey, { promise });
  try {
    const value = await promise;
    locationRequestCache.set(cacheKey, { value, expiresAt: Date.now() + LOCATION_CACHE_TTL_MS });
    return value;
  } catch (error) {
    locationRequestCache.delete(cacheKey);
    throw error;
  }
}

export function aggregateVenueStates(venues) {
  const counts = new Map();
  venues.forEach((venue) => {
    if (!US_STATES_BY_CODE[venue.state]) return;
    const current = counts.get(venue.state) || { code: venue.state, name: stateCodeToName(venue.state), venueCount: 0, cityCount: new Set() };
    current.venueCount += 1;
    if (venue.city) current.cityCount.add(venue.city.toLowerCase());
    counts.set(venue.state, current);
  });
  return [...counts.values()]
    .map((entry) => ({ ...entry, cityCount: entry.cityCount.size, href: `/hub/poker-near-me/in/${stateCodeToSlug(entry.code)}` }))
    .sort((a, b) => b.venueCount - a.venueCount || a.name.localeCompare(b.name));
}

export function aggregateVenueCities(venues, stateCode) {
  const counts = new Map();
  venues.forEach((venue) => {
    if (!venue.city) return;
    const key = venue.city.toLowerCase();
    const current = counts.get(key) || { name: venue.city, venueCount: 0 };
    current.venueCount += 1;
    counts.set(key, current);
  });
  return [...counts.values()]
    .map((entry) => ({ ...entry, href: `/hub/poker-near-me/in/${stateCodeToSlug(stateCode)}/${cityTitleToSlug(entry.name)}` }))
    .sort((a, b) => b.venueCount - a.venueCount || a.name.localeCompare(b.name));
}

export function resolveStateSlug(slug) {
  const code = stateSlugToCode(slug);
  if (!code) return null;
  return { code, name: stateCodeToName(code), slug: stateCodeToSlug(code) };
}

export function venueLocationCanonical(stateCode, city) {
  if (!stateCode) return `${SITE_ORIGIN}/hub/poker-near-me/in`;
  const base = `${SITE_ORIGIN}/hub/poker-near-me/in/${stateCodeToSlug(stateCode)}`;
  return city ? `${base}/${cityTitleToSlug(city)}` : base;
}
