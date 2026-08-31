import footerRegistry from './world-footer-navigation.json';

/**
 * Canonical World Hub navigation identity.
 *
 * The six primary destinations are intentionally sourced from the same
 * registry that renders every world footer. The command drawer, floating
 * fallback trigger, route laws, and footer therefore cannot disagree about a
 * world's name, route ownership, accent, or primary destinations.
 */

const MENU_KEY_BY_WORLD = Object.freeze({
  'personal-assistant': 'personal-assistant',
  training: 'training',
  news: 'news',
  trivia: 'trivia',
  'social-media': 'social',
  'diamond-arena': 'diamond-arena',
  'my-clubs': 'my-clubs',
  'video-library': 'video-library',
  'odds-calculator': 'odds-calculator',
  'bankroll-manager': 'bankroll-manager',
  'toke-tracker': 'toke-tracker',
  'preflop-charts': 'preflop-charts',
  'poker-near-me': 'poker-near-me',
  marketplace: 'marketplace',
});

const PURPOSE_BY_WORLD = Object.freeze({
  'personal-assistant': 'Coaching, Analysis, And Study Tools',
  training: 'Practice, Progress, Goals, And Rankings',
  news: 'Reporting, Video, Events, And Saved Coverage',
  trivia: 'Daily Play, Arcade Modes, Competition, And Results',
  'social-media': 'Publishing, Friends, Messaging, Reels, And Pages',
  'diamond-arena': 'Competition, Schedule, Rankings, And Rewards',
  'my-clubs': 'Clubs, Venues, Home Games, And Club Pages',
  'video-library': 'Strategy Video, Saved Content, And Watch History',
  'odds-calculator': 'Odds, Equity, ICM, Ranges, And Hand Analysis',
  'bankroll-manager': 'Sessions, Trips, Reports, Rules, And Exports',
  'toke-tracker': 'Shifts, Tokes, Taxes, Venues, And Dealer Records',
  'preflop-charts': 'Ranges, Speed Drills, Progress, And Tutorials',
  'poker-near-me': 'Venues, Events, Live Games, Maps, And Saved Places',
  marketplace: 'Diamonds, Merchandise, Clubs, VIP, And Orders',
});

const MENU_PALETTE_BY_WORLD = Object.freeze({
  'social-media': Object.freeze({
    scheme: 'facebook',
    accent: '#1877F2',
    accentPressed: '#166FE5',
  }),
  'poker-near-me': Object.freeze({
    scheme: 'casino-realism',
    accent: '#38bdf8',
    accentPressed: '#1596d2',
  }),
});

const cleanPath = (value) => {
  const raw = String(value || '/').split(/[?#]/, 1)[0];
  return raw.replace(/\/+$/, '') || '/';
};

export const WORLD_MENU_DEFINITIONS = Object.freeze(
  footerRegistry.worlds.map((world) => Object.freeze({
    ...world,
    menuKey: MENU_KEY_BY_WORLD[world.id],
    purpose: PURPOSE_BY_WORLD[world.id],
    menuPalette: MENU_PALETTE_BY_WORLD[world.id] || Object.freeze({
      scheme: 'world',
      accent: world.accent,
      accentPressed: world.accent,
    }),
    primaryItems: Object.freeze(
      world.items.map((item) => Object.freeze({
        ...item,
        description: item.title,
        hardNav: item.href.startsWith('/hub/club-arena'),
      }))
    ),
  }))
);

const WORLD_BY_ID = new Map(WORLD_MENU_DEFINITIONS.map((world) => [world.id, world]));
const WORLD_BY_MENU_KEY = new Map(
  WORLD_MENU_DEFINITIONS.map((world) => [world.menuKey, world])
);

export const getWorldMenuById = (id) => WORLD_BY_ID.get(id) || null;
export const getWorldMenuByKey = (menuKey) => WORLD_BY_MENU_KEY.get(menuKey) || null;

export const resolveWorldMenu = (value) => {
  const path = cleanPath(value);
  return (
    [...WORLD_MENU_DEFINITIONS]
      .sort((a, b) => {
        const aLongest = Math.max(...a.routePrefixes.map((prefix) => prefix.length));
        const bLongest = Math.max(...b.routePrefixes.map((prefix) => prefix.length));
        return bLongest - aLongest;
      })
      .find((world) =>
        world.routePrefixes.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`)
        )
      ) || null
  );
};

export const WORLD_NAVIGATION_CAPABILITIES = Object.freeze({
  PUBLIC: 'public',
  AUTHENTICATED: 'authenticated',
  PROFILE_COMPLETE: 'profile-complete',
  CLUB_MEMBER: 'club-member',
  CLUB_STAFF: 'club-staff',
  PLATFORM_STAFF: 'platform-staff',
});

export const getWorldMenuInventory = () =>
  WORLD_MENU_DEFINITIONS.map((world) => ({
    id: world.id,
    label: world.label,
    menuKey: world.menuKey,
    purpose: world.purpose,
    routePrefixes: [...world.routePrefixes],
    primaryItems: world.primaryItems.map((item) => ({ ...item })),
  }));
