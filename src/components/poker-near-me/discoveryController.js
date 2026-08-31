/**
 * Pure route, filter, and persistence controller for Poker Near Me discovery.
 *
 * The route page owns orchestration and rendering. This module owns canonical
 * slugs and filter semantics so list, map, URL, voice, and persisted state use
 * the same independently testable rules.
 */

export const PAGE_SIZE = 20;
export const PAGE_SIZE_DAILY = 50;
export const PAGE_SIZE_LIVE = 30;
export const SEARCH_HISTORY_MAX = 8;
export const DEFAULT_RADIUS_MILES = 50;
export const DIRECTORY_PAGE_SIZE = 160;
export const MAX_RADIUS_MILES = 150;
export const RADIUS_TIERS = [50, 100, 150];

export function snapshotAgeDays(generatedAt, now = Date.now()) {
  const timestamp = Date.parse(String(generatedAt || ''));
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now - timestamp) / 86400000))
    : undefined;
}

export function normalizeRadiusMiles(value) {
  if (String(value).toLowerCase() === 'any') return MAX_RADIUS_MILES;
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) return DEFAULT_RADIUS_MILES;
  return Math.min(radius, MAX_RADIUS_MILES);
}

export const TAB_ORDER = ['venues', 'events', 'live', 'map', 'saved', 'more'];
export const PRIMARY_TABS = [
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'live', label: 'Live' },
  { id: 'map', label: 'Map' },
  { id: 'saved', label: 'Saved' },
  { id: 'more', label: 'More' },
];
export const EVENTS_SUB_TABS = ['tours', 'series', 'daily', 'calendar'];
export const MORE_SUB_TABS = [
  'overview',
  'roadtrip',
  'social',
  'alerts',
  'nearmenow',
  'tripcost',
];

export const ROUTE_META = {
  venues: {
    heading: 'POKER NEAR ME',
    breadcrumb: 'Venues',
    title: 'Poker Near Me — Find Live Poker Rooms & Casinos',
    description:
      'Discover live poker rooms, casinos, and card rooms near you with current schedules, map discovery, and venue details across the United States.',
  },
  map: {
    heading: 'POKER ROOM MAP',
    breadcrumb: 'Map',
    title: 'Poker Room Map — Casinos & Card Rooms Near You',
    description:
      'Explore poker rooms, casinos, card rooms, and live-game locations on an interactive map with location-aware discovery.',
  },
  saved: {
    heading: 'SAVED POKER PLACES',
    breadcrumb: 'Saved',
    title: 'Saved Poker Rooms, Casinos & Card Rooms',
    description:
      'Return to your saved poker rooms, casinos, card rooms, tours, and series in one private discovery workspace.',
  },
  'live-games': {
    heading: 'CASH GAMES NEAR ME',
    breadcrumb: 'Live Games',
    title: 'Live Cash Games — Find Poker Rooms & Casinos Near You',
    description:
      'Discover live cash games, poker rooms, casinos, and card rooms near you with observed and modeled table availability clearly identified.',
  },
  tours: {
    heading: 'POKER TOURS',
    breadcrumb: 'Tours',
    title: 'Poker Tours — Circuits & Tour Stops Near You',
    description:
      'Explore poker tours, traveling circuits, upcoming stops, schedules, and host venues across the live poker network.',
  },
  series: {
    heading: 'POKER SERIES',
    breadcrumb: 'Series',
    title: 'Poker Series — Tournament Series Near You',
    description:
      'Find current and upcoming poker series, festival schedules, host venues, buy-ins, and guarantees.',
  },
  'daily-tournaments': {
    heading: 'DAILY TOURNAMENTS',
    breadcrumb: 'Daily Tournaments',
    title: 'Daily Poker Tournaments Near You',
    description:
      'Find daily poker tournaments by day, game, buy-in, guarantee, distance, and venue.',
  },
  'events-calendar': {
    heading: 'EVENTS CALENDAR',
    breadcrumb: 'Events Calendar',
    title: 'Poker Events Calendar — Tournaments Near You',
    description:
      'Browse poker tournaments and live events in a location-aware calendar with clear schedules and venue details.',
  },
  more: {
    heading: 'DISCOVERY TOOLS',
    breadcrumb: 'Tools',
    title: 'Poker Discovery Tools — Trends, Alerts & Trip Planning',
    description:
      'Plan poker trips, compare venues, review game trends, configure alerts, and use community discovery tools.',
  },
  roadtrip: {
    heading: 'POKER ROAD TRIP',
    breadcrumb: 'Road Trip Planner',
    title: 'Poker Road Trip Planner — Rooms Along Your Route',
    description:
      'Plan a poker road trip and find casinos, card rooms, tournaments, and poker stops along your route.',
  },
  alerts: {
    heading: 'TOURNAMENT ALERTS',
    breadcrumb: 'Alerts',
    title: 'Poker Tournament Alerts — Games Near You',
    description:
      'Configure location-aware poker tournament and live-game alerts by distance, schedule, and game type.',
  },
};

export function normalizeRouteSlug(value) {
  const slug = Array.isArray(value) ? value[0] : value;
  if (slug === 'live') return 'live-games';
  if (slug === 'daily') return 'daily-tournaments';
  if (slug === 'calendar') return 'events-calendar';
  if (slug === 'events') return 'series';
  return ROUTE_META[slug] ? slug : null;
}

export function getTabSlug({ showLiveTab, activeTab, activeEventTab, activeMoreTab }) {
  if (showLiveTab) return 'live-games';
  if (activeTab === 'map') return 'map';
  if (activeTab === 'saved') return 'saved';
  if (activeTab === 'more') {
    if (activeMoreTab === 'alerts') return 'alerts';
    if (activeMoreTab === 'roadtrip') return 'roadtrip';
    return 'more';
  }
  if (activeTab === 'events') {
    if (activeEventTab === 'daily') return 'daily-tournaments';
    if (activeEventTab === 'calendar') return 'events-calendar';
    return activeEventTab || 'events';
  }
  return 'venues';
}

const SAFE_VENUE_TYPES = new Set([
  'casino',
  'card_room',
  'poker_club',
  'home_game',
  'charity',
  'tour_stop',
]);

export function normalizeVenueType(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'poker_tour') return 'tour_stop';
  if (raw === 'cardroom' || raw === 'card_room') return 'poker_club';
  return SAFE_VENUE_TYPES.has(raw) ? raw : null;
}

export function buildDiscoveryUrl({
  showLiveTab,
  activeTab,
  activeEventTab,
  activeMoreTab,
  searchQuery,
  venueType,
}) {
  const pathSlug = getTabSlug({ showLiveTab, activeTab, activeEventTab, activeMoreTab });
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  if (SAFE_VENUE_TYPES.has(venueType)) params.set('filter', venueType);
  const query = params.toString();
  return {
    pathSlug,
    url: `/hub/poker-near-me/${pathSlug}${query ? `?${query}` : ''}`,
  };
}

export function resolveDiscoveryDeepLink({ pathname = '', search = '' } = {}) {
  const params = new URLSearchParams(search);
  const query = params.get('q') || '';
  const legacyTab = params.get('tab');
  const sub = params.get('sub');
  const filter = params.get('filter');
  const slug = pathname.split('/').filter(Boolean).at(-1) || '';

  let activeTab = null;
  let activeEventTab = null;
  let activeMoreTab = null;
  let showLiveTab = false;

  if (slug === 'live-games') {
    showLiveTab = true;
  } else if (['venues', 'map', 'saved'].includes(slug)) {
    activeTab = slug;
  } else if (
    [
      'series',
      'tours',
      'events',
      'daily-tournaments',
      'events-calendar',
      'daily',
      'calendar',
    ].includes(slug)
  ) {
    activeTab = 'events';
    if (slug === 'daily-tournaments' || slug === 'daily') activeEventTab = 'daily';
    else if (slug === 'events-calendar' || slug === 'calendar') activeEventTab = 'calendar';
    else activeEventTab = slug === 'events' ? 'series' : slug;
  } else if (['roadtrip', 'alerts', 'more'].includes(slug)) {
    activeTab = 'more';
    if (slug === 'roadtrip' || slug === 'alerts') activeMoreTab = slug;
  } else if (legacyTab) {
    if (legacyTab === 'live') showLiveTab = true;
    else activeTab = legacyTab === 'favorites' ? 'saved' : legacyTab;
  }

  if (sub && EVENTS_SUB_TABS.includes(sub)) {
    activeTab = 'events';
    activeEventTab = sub;
    showLiveTab = false;
  } else if (sub && MORE_SUB_TABS.includes(sub)) {
    activeTab = 'more';
    activeMoreTab = sub;
    showLiveTab = false;
  }

  if (activeTab && !TAB_ORDER.includes(activeTab)) activeTab = null;
  const venueType = filter === 'all' ? 'all' : normalizeVenueType(filter);

  return {
    query,
    openSearch: Boolean(query),
    showLiveTab,
    activeTab,
    activeEventTab,
    activeMoreTab,
    venueType,
    canonicalLiveUrl: showLiveTab
      ? `/hub/poker-near-me/live-games${query ? `?q=${encodeURIComponent(query)}` : ''}`
      : null,
  };
}

export function safeSetItem(key, value, storageOverride) {
  try {
    const storage = storageOverride || window.localStorage;
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
      const storage = storageOverride || (typeof window !== 'undefined' ? window.localStorage : null);
      const evictKeys = ['sp-offline-venues', 'sp-search-analytics', 'poker-near-me-map-filters'];
      if (!storage) return false;
      for (const evictKey of evictKeys) {
        if (evictKey !== key && storage.getItem(evictKey)) {
          storage.removeItem(evictKey);
          try {
            storage.setItem(key, value);
            return true;
          } catch (retryError) {
            console.warn('[App] Handled exception:', retryError?.message || retryError);
          }
        }
      }
      console.warn('[PNM] localStorage quota exhausted — could not write:', key);
    }
    return false;
  }
}

export function trackSearchEvent(eventName, data, runtimeWindow) {
  try {
    const browserWindow = runtimeWindow || window;
    if (browserWindow.__SEARCH_ANALYTICS__) {
      browserWindow.__SEARCH_ANALYTICS__.push({
        event: eventName,
        data,
        timestamp: Date.now(),
      });
    }
    const storage = browserWindow.localStorage;
    const existing = JSON.parse(storage.getItem('sp-search-analytics') || '[]');
    const safeData = { ...data };
    delete safeData.venues;
    delete safeData.results;
    delete safeData.filteredData;
    existing.push({ event: eventName, ...safeData, ts: Date.now() });
    if (existing.length > 50) existing.splice(0, existing.length - 50);
    return safeSetItem('sp-search-analytics', JSON.stringify(existing), storage);
  } catch (error) {
    console.warn('[App] Handled exception:', error?.message || error);
    return false;
  }
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function gameName(game) {
  return (game?.game_type || game?.name || game || '').toString().toLowerCase();
}

export function venueMatchesGameType(venue, gameType) {
  if (!gameType || gameType === 'all') return true;
  const games = venue?.games_offered || [];
  if (!Array.isArray(games) || games.length === 0) return true;
  const hasNLH = games.some((game) => {
    const name = gameName(game);
    return name.includes('nlh') || name.includes('hold') || name.includes('holdem');
  });
  const hasPLO = games.some((game) => {
    const name = gameName(game);
    return name.includes('plo') || name.includes('omaha') || name.includes('pot limit');
  });
  const hasMixed = games.some((game) => {
    const name = gameName(game);
    return (
      name.includes('mix') ||
      name.includes('horse') ||
      name.includes('hors') ||
      name.includes('8-game') ||
      name.includes('dealer')
    );
  });
  const hasPLO8 = games.some((game) => {
    const name = gameName(game);
    return (
      name.includes('plo8') ||
      name.includes('omaha hi') ||
      name.includes('o8') ||
      name.includes('big o')
    );
  });
  const hasStud = games.some((game) => gameName(game).includes('stud'));
  if (gameType === 'nlh') return hasNLH;
  if (gameType === 'plo') return hasPLO;
  if (gameType === 'plo8') return hasPLO8;
  if (gameType === 'mixed') return hasMixed || (hasNLH && hasPLO);
  if (gameType === 'stud') return hasStud;
  if (gameType === 'cash') return games.length > 0;
  if (gameType === 'mtt') return Boolean(venue?.has_tournaments);
  if (gameType === 'other') return !hasNLH && !hasPLO && !hasPLO8 && !hasStud;
  return true;
}

export function venueMatchesStakes(venue, stakes) {
  if (!stakes || stakes === 'all' || stakes === 'any') return true;
  const availableStakes = venue?.stakes_cash;
  if (!Array.isArray(availableStakes) || availableStakes.length === 0) return true;
  const has = (...needles) =>
    availableStakes.some((stake) =>
      needles.some((needle) => String(stake || '').includes(needle))
    );
  if (stakes === '$1/2') return has('1/2', '1/3');
  if (stakes === '$2/5') return has('2/5');
  if (stakes === '$5/10+') return has('5/10', '10/20', '25/50');
  return true;
}

export function getCurrentDay(date = new Date()) {
  return DAYS_OF_WEEK[date.getDay()];
}
