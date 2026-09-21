import {
  US_STATES_BY_CODE,
  cityTitleToSlug,
  stateCodeToName,
  stateCodeToSlug,
  stateSlugToCode,
} from '../home-games/locationUtils';
import { createClient } from '../supabaseServerClient';
import { fetchVenueDirectoryResilient } from './venueDirectoryServer';
import directorySnapshotData from '../../../data/poker-venue-directory-snapshot.json';

const SITE_ORIGIN = 'https://smarter.poker';
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
const locationRequestCache = new Map();

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
    location_quality: row.location_quality || null,
    updated_at: row.updated_at || row.last_verified_at || row.last_scraped_at || null,
  };
}

export async function fetchPokerVenueLocation({ state, city }) {
  const cacheKey = `${state || 'all'}:${city || 'all'}`.toLowerCase();
  const cached = locationRequestCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const payload = await fetchVenueDirectoryResilient({
      supabase: createClient(),
      // City slugs intentionally remove punctuation ("St. Augustine" becomes
      // "st-augustine"). Fetch the bounded state projection, then apply the
      // same slug normalizer below; an exact database city filter would turn
      // those canonical public URLs into false 404s.
      params: { limit: 1000, state },
      fallbackVenues: directorySnapshotData.venues || [],
      fallbackMetadata: directorySnapshotData.metadata || {},
      onFallback: (error) => {
        console.warn('[poker-near-me] Location directory database unavailable; using snapshot:', error?.message || error);
      },
    });
    const venues = (Array.isArray(payload.data) ? payload.data : [])
      .map(normalizeVenue)
      .filter(Boolean)
      .filter((venue) => !state || venue.state === state)
      .filter((venue) => !city || cityTitleToSlug(venue.city) === cityTitleToSlug(city))
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || b.trust_score - a.trust_score || a.name.localeCompare(b.name));
    return {
      venues,
      degraded: payload.degraded === true,
      dataSource: payload.data_source || 'unavailable',
      dataRevision: payload.data_revision || null,
      snapshot: payload.snapshot || null,
      fetchedAt: new Date().toISOString(),
    };
  })();

  locationRequestCache.set(cacheKey, { promise });
  try {
    const value = await promise;
    locationRequestCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + (value.degraded ? 60_000 : LOCATION_CACHE_TTL_MS),
    });
    return value;
  } catch (error) {
    console.warn('[poker-near-me] Location directory fallback failed:', error?.message || error);
    const value = {
      venues: [],
      degraded: true,
      dataSource: 'unavailable',
      dataRevision: null,
      snapshot: null,
      fetchedAt: new Date().toISOString(),
    };
    locationRequestCache.set(cacheKey, { value, expiresAt: Date.now() + 60_000 });
    return value;
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

/**
 * A VENUE THAT BELONGS TO NO STATE (AEO phase 3, 2026-09-19).
 *
 * aggregateVenueStates skips any venue whose state is not a US state code,
 * which is correct for a state index and left two real pages reachable from
 * nowhere: /hub/venues/2834 and /hub/venues/2835, the Charity Series of
 * Poker and Poker For Good, both carrying "MULTI" because they run in more
 * than one state. They are in the sitemap, they have content, and no
 * location page could ever list them.
 *
 * They are listed on the national index instead, under their own heading,
 * so the state index stays a state index and the pages stop being orphans.
 */
export function venuesWithoutAState(venues) {
  return (venues || [])
    .filter((venue) => venue?.id && venue?.name && !US_STATES_BY_CODE[venue.state])
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      where: [venue.city, venue.state].filter(Boolean).join(', ') || null,
      href: `/hub/venues/${venue.id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
