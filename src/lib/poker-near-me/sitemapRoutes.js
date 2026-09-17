import { US_STATES_BY_CODE, cityTitleToSlug } from '../home-games/locationUtils.js';

const EXCLUDED_VENUE_TYPES = new Set(['series', 'tour', 'home_game']);

/** Public discovery surfaces with distinct search intent and server HTML. */
export const POKER_DISCOVERY_SITEMAP_ROUTES = Object.freeze([
  { path: '/hub/poker-near-me/venues', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/poker-near-me/live-games', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/poker-near-me/map', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/poker-near-me/tours', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/poker-near-me/series', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/poker-near-me/daily-tournaments', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/poker-near-me/events-calendar', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/poker-near-me/more', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/poker-near-me/roadtrip', priority: '0.6', changefreq: 'weekly' },
]);

export const PRIVATE_POKER_DISCOVERY_SLUGS = Object.freeze(['saved', 'alerts']);

export function isPokerDiscoveryRouteIndexable(slug) {
  return !PRIVATE_POKER_DISCOVERY_SLUGS.includes(String(slug || ''));
}

/**
 * LASTMOD IS EVIDENCE, NOT A TIMESTAMP OF GENERATION (AEO phase 1, 2026-09-17).
 * A venue entry carries the most recent verification or scrape time the
 * directory holds for it; a state or city entry carries the newest of its
 * venues. An entry with no evidence carries no lastmod at all. Bing states
 * that a lastmod set to generation time is ignored and discounts the sitemap;
 * every entry previously said "today".
 */
export function venueLastmod(venue) {
  for (const candidate of [venue?.last_verified_at, venue?.last_scraped_at, venue?.updated_at]) {
    if (!candidate) continue;
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time) && time > 0) return new Date(time).toISOString();
  }
  return null;
}

function newerOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Project the public venue directory into canonical sitemap entries.
 *
 * The caller is expected to pass the same integrity-filtered directory used by
 * discovery and location pages. The defensive checks here keep malformed or
 * duplicated records from creating dead or repeated URLs.
 */
export function buildPokerVenueSitemapUrls(venues = []) {
  const urls = [];
  const venueIds = new Set();
  const states = new Map();
  const cities = new Map();

  for (const venue of Array.isArray(venues) ? venues : []) {
    const id = String(venue?.id ?? '').trim();
    const name = String(venue?.name ?? '').trim();
    const venueType = String(venue?.venue_type ?? '').trim().toLowerCase();
    if (!id || !name || EXCLUDED_VENUE_TYPES.has(venueType)) continue;
    if (venue?.is_active === false || venue?.is_suppressed === true) continue;

    const lastmod = venueLastmod(venue);
    if (!venueIds.has(id)) {
      venueIds.add(id);
      urls.push({
        path: `/hub/venues/${encodeURIComponent(id)}`,
        priority: '0.7',
        changefreq: 'daily',
        ...(lastmod ? { lastmod } : {}),
      });
    }

    const state = String(venue?.state ?? '').trim().toUpperCase();
    if (!US_STATES_BY_CODE[state]) continue;
    const stateSlug = state.toLowerCase();
    if (!states.has(stateSlug)) {
      const entry = {
        path: `/hub/poker-near-me/in/${stateSlug}`,
        priority: '0.7',
        changefreq: 'daily',
      };
      states.set(stateSlug, entry);
      urls.push(entry);
    }
    if (lastmod) {
      const entry = states.get(stateSlug);
      entry.lastmod = newerOf(entry.lastmod, lastmod);
    }

    const citySlug = cityTitleToSlug(venue?.city);
    const cityKey = `${stateSlug}/${citySlug}`;
    if (citySlug && !cities.has(cityKey)) {
      const entry = {
        path: `/hub/poker-near-me/in/${cityKey}`,
        priority: '0.6',
        changefreq: 'daily',
      };
      cities.set(cityKey, entry);
      urls.push(entry);
    }
    if (citySlug && lastmod) {
      const entry = cities.get(cityKey);
      entry.lastmod = newerOf(entry.lastmod, lastmod);
    }
  }

  return urls;
}
