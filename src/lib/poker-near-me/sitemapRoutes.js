import { US_STATES_BY_CODE, cityTitleToSlug } from '../home-games/locationUtils.js';

const EXCLUDED_VENUE_TYPES = new Set(['series', 'tour', 'home_game']);

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
  const states = new Set();
  const cities = new Set();

  for (const venue of Array.isArray(venues) ? venues : []) {
    const id = String(venue?.id ?? '').trim();
    const name = String(venue?.name ?? '').trim();
    const venueType = String(venue?.venue_type ?? '').trim().toLowerCase();
    if (!id || !name || EXCLUDED_VENUE_TYPES.has(venueType)) continue;
    if (venue?.is_active === false || venue?.is_suppressed === true) continue;

    if (!venueIds.has(id)) {
      venueIds.add(id);
      urls.push({
        path: `/hub/venues/${encodeURIComponent(id)}`,
        priority: '0.7',
        changefreq: 'daily',
      });
    }

    const state = String(venue?.state ?? '').trim().toUpperCase();
    if (!US_STATES_BY_CODE[state]) continue;
    const stateSlug = state.toLowerCase();
    if (!states.has(stateSlug)) {
      states.add(stateSlug);
      urls.push({
        path: `/hub/poker-near-me/in/${stateSlug}`,
        priority: '0.7',
        changefreq: 'daily',
      });
    }

    const citySlug = cityTitleToSlug(venue?.city);
    const cityKey = `${stateSlug}/${citySlug}`;
    if (citySlug && !cities.has(cityKey)) {
      cities.add(cityKey);
      urls.push({
        path: `/hub/poker-near-me/in/${cityKey}`,
        priority: '0.6',
        changefreq: 'daily',
      });
    }
  }

  return urls;
}
