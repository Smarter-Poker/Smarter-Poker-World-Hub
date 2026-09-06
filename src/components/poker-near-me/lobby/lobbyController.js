/**
 * Pure controller contract for the cinematic Poker Near Me lobby.
 *
 * Keeping URL, filter, persistence, and batching semantics outside the page
 * component makes them independently testable and prevents the visual shell
 * from becoming the source of truth for data behavior.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const GAME_TYPE_API_PARAM = {
  nlh: 'hasNLH',
  plo: 'hasPLO',
  mixed: 'hasMixed',
};

export const LOBBY_DESTINATIONS = [
  { label: 'Poker Near Me', href: '/hub/poker-near-me/venues' },
  { label: 'Home Games', href: '/hub/home-games' },
  { label: 'Live Games', href: '/hub/poker-near-me/live-games' },
  { label: 'Poker Tours', href: '/hub/poker-tours' },
  { label: 'Map View', href: '/hub/poker-near-me/map' },
  { label: 'Calendar', href: '/hub/events-calendar' },
  { label: 'Poker Series', href: '/hub/poker-near-me/series' },
  { label: 'Trip Planner', href: '/hub/poker-near-me/roadtrip' },
  { label: 'Daily Grind', href: '/hub/daily-tournaments' },
  { label: 'Saved Venues', href: '/hub/poker-near-me/saved' },
  { label: 'Friends', href: '/hub/friends' },
  { label: 'Tournament Alerts', href: '/hub/poker-near-me/alerts' },
];

export function createLobbyJsonLd(websiteSchema, siteUrl = 'https://smarter.poker') {
  return {
    '@graph': [
      websiteSchema,
      {
        '@type': 'ItemList',
        name: 'Poker Near Me',
        itemListElement: LOBBY_DESTINATIONS.map((destination, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: destination.label,
          url: `${siteUrl}${destination.href}`,
        })),
      },
    ],
  };
}

export const WIDE_VENUE_LIMIT = 200;
export const CHECKIN_BATCH_SIZE = 50;
export const CHECKIN_BATCH_MAX_IDS = 200;
export const POD_RADIUS_OPTIONS = [5, 10, 25, 50, 100, 150];

const SAFE_VENUE_TYPES = new Set([
  'casino',
  'card_room',
  'poker_club',
  'home_game',
  'charity',
]);

export function normalizeVoiceFilters(raw) {
  const next = {};
  if (!raw || typeof raw !== 'object') return next;

  const gameType = String(raw.gameType || '').toLowerCase();
  if (GAME_TYPE_API_PARAM[gameType]) {
    next.gameType = gameType;
    next.svGameType = gameType;
  }

  const venueType = String(raw.venueType || '').toLowerCase();
  if (SAFE_VENUE_TYPES.has(venueType)) {
    next.venueType = venueType;
    next.svVenueType = venueType;
  }

  const parsedRadius = parseInt(raw.radius, 10);
  if (parsedRadius && !Number.isNaN(parsedRadius)) {
    const snapped = POD_RADIUS_OPTIONS.find((option) => option >= parsedRadius) || 150;
    next.radius = String(snapped);
    next.svRadius = String(snapped);
    next.nmRadius = String(snapped);
  }

  const minBuyin = Number(raw.minBuyin);
  if (raw.minBuyin != null && !Number.isNaN(minBuyin) && minBuyin > 0) {
    next.svMinBuyin = String(minBuyin);
    next.nmMinBuyin = String(minBuyin);
  }

  const maxBuyin = Number(raw.maxBuyin);
  if (raw.maxBuyin != null && !Number.isNaN(maxBuyin) && maxBuyin > 0) {
    next.svMaxBuyin = String(maxBuyin);
    next.nmMaxBuyin = String(maxBuyin);
  }

  return next;
}

export function persistSharedGpsLocation(location, storageOverride, dispatchTargetOverride) {
  if (!location || location.lat == null || location.lng == null) return false;
  try {
    const storage = storageOverride || window.localStorage;
    const dispatchTarget = dispatchTargetOverride || window;
    storage.setItem(
      'sp-user-gps',
      JSON.stringify({ lat: location.lat, lng: location.lng, time: Date.now() })
    );
    const EventConstructor = dispatchTarget.Event || Event;
    dispatchTarget.dispatchEvent?.(new EventConstructor('sp_user_gps_updated'));
    return true;
  } catch (error) {
    console.warn('[App] Handled exception:', error?.message || error);
    return false;
  }
}

export function clearSharedGpsLocation(storageOverride, dispatchTargetOverride) {
  try {
    const storage = storageOverride || window.localStorage;
    const dispatchTarget = dispatchTargetOverride || window;
    storage.removeItem('sp-user-gps');
    const EventConstructor = dispatchTarget.Event || Event;
    dispatchTarget.dispatchEvent?.(new EventConstructor('sp_user_gps_updated'));
    return true;
  } catch (error) {
    console.warn('[App] Handled exception:', error?.message || error);
    return false;
  }
}

export const POD_FEATURES = {
  search: { title: 'Search Venues', tab: 'venues' },
  nearme: { title: 'Near Me', tab: 'nearnow' },
  homegames: { title: 'Home Games', tab: 'homegames' },
  livegames: { title: 'Live Games', tab: 'live' },
  mapview: { title: 'Map View', tab: 'map' },
  tours: { title: 'Tours', tab: 'tours' },
  calendar: { title: 'Calendar', tab: 'calendar' },
  daily: { title: 'Daily', tab: 'daily' },
  series: { title: 'Series', tab: 'series' },
  roadtrip: { title: 'Trip Planner', tab: 'roadtrip' },
  favorites: { title: 'Saved', tab: 'favorites' },
  social: { title: 'Friends', tab: 'social' },
  alerts: { title: 'Alerts', tab: 'alerts' },
  tripcost: { title: 'Trip Cost Calculator', tab: 'tripcost' },
  compare: { title: 'Compare Venues', tab: 'compare' },
  scraperhealth: { title: 'Scraper Health', tab: 'scraperhealth' },
  peakheatmap: { title: 'Peak Activity', tab: 'peakheatmap' },
  gametrends: { title: 'Game Trends', tab: 'gametrends' },
  gamealerts: { title: 'Game Alerts', tab: 'gamealerts' },
};
