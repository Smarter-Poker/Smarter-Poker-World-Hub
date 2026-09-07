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
  'my-clubs': 'Managed Clubs, Club Pages, Community, And Club Tools',
  'video-library': 'Strategy Video, Saved Content, And Watch History',
  'odds-calculator': 'Odds, Equity, ICM, Ranges, And Hand Analysis',
  'bankroll-manager': 'Sessions, Trips, Reports, Rules, And Exports',
  'toke-tracker': 'Shifts, Tokes, Taxes, Venues, And Dealer Records',
  'preflop-charts': 'Ranges, Speed Drills, Progress, And Tutorials',
  'poker-near-me': 'Venues, Home Games, Events, Live Games, Maps, And Saved Places',
  marketplace: 'Diamonds, Merchandise, Clubs, VIP, And Orders',
});

/**
 * Phase 2 premium menu materials.
 *
 * These are semantic surface tokens, not icon instructions. The approved
 * hamburger and every command icon remain owned by their existing JSX and
 * artwork. Keeping the materials here gives the drawer, fallback trigger, and
 * recovery state one visual source of truth for every World Hub family.
 */
const MENU_PALETTE_BY_WORLD = Object.freeze({
  'personal-assistant': Object.freeze({
    scheme: 'intelligence', accent: '#4599FF', accentPressed: '#7C5CFF',
    secondary: '#9B7CFF', focus: '#8DC8FF', canvas: '#030711', canvasRaised: '#081426',
    rail: '#050B16', panel: '#0A1629', tile: '#071120', tileActive: '#102548',
    border: '#3E6389', text: '#F2F7FF', muted: '#9AAFC6', glow: 'rgba(69,153,255,.34)',
    texture: 'circuit',
  }),
  training: Object.freeze({
    scheme: 'training-pulse', accent: '#22E67A', accentPressed: '#13BFF2',
    secondary: '#18D5D5', focus: '#86FFD0', canvas: '#020B08', canvasRaised: '#071B14',
    rail: '#04140E', panel: '#092219', tile: '#061A13', tileActive: '#0D3221',
    border: '#32745B', text: '#F0FFF7', muted: '#98CBB1', glow: 'rgba(34,230,122,.3)',
    texture: 'pulse',
  }),
  news: Object.freeze({
    scheme: 'newsroom', accent: '#FF7A1A', accentPressed: '#E74B2B',
    secondary: '#D9482F', focus: '#FFC08A', canvas: '#0B0705', canvasRaised: '#21110A',
    rail: '#170B07', panel: '#28140B', tile: '#1A0D08', tileActive: '#3B1B0D',
    border: '#865232', text: '#FFF7F0', muted: '#C6A28D', glow: 'rgba(255,122,26,.32)',
    texture: 'ticker',
  }),
  trivia: Object.freeze({
    scheme: 'arcade', accent: '#20D6FF', accentPressed: '#8B5CF6',
    secondary: '#A36CFF', focus: '#8CEBFF', canvas: '#040510', canvasRaised: '#101027',
    rail: '#090919', panel: '#15122E', tile: '#0D0C22', tileActive: '#1C1A43',
    border: '#4B4E89', text: '#F7F4FF', muted: '#ABA4D0', glow: 'rgba(32,214,255,.31)',
    texture: 'scanline',
  }),
  'social-media': Object.freeze({
    scheme: 'facebook', accent: '#1877F2', accentPressed: '#166FE5',
    secondary: '#42B72A', focus: '#1877F2', canvas: '#FFFFFF', canvasRaised: '#F7F9FC',
    rail: '#FFFFFF', panel: '#E7F3FF', tile: '#FFFFFF', tileActive: '#E7F3FF',
    border: '#DADDE1', text: '#050505', muted: '#65676B', glow: 'rgba(24,119,242,.22)',
    texture: 'facebook-clean',
  }),
  'diamond-arena': Object.freeze({
    scheme: 'diamond-lacquer', accent: '#FFE34D', accentPressed: '#D8A83D',
    secondary: '#F4C873', focus: '#FFF2A0', canvas: '#080704', canvasRaised: '#1C1609',
    rail: '#110D05', panel: '#211A0B', tile: '#171207', tileActive: '#32270C',
    border: '#8D7440', text: '#FFF9DD', muted: '#CDBE8F', glow: 'rgba(255,227,77,.29)',
    texture: 'facets',
  }),
  'my-clubs': Object.freeze({
    scheme: 'club-crest', accent: '#28C9FF', accentPressed: '#24C980',
    secondary: '#37D18A', focus: '#8DE8FF', canvas: '#02090E', canvasRaised: '#071B26',
    rail: '#04131B', panel: '#092332', tile: '#061924', tileActive: '#0C3040',
    border: '#387189', text: '#F0FBFF', muted: '#91B8C8', glow: 'rgba(40,201,255,.31)',
    texture: 'crest',
  }),
  'video-library': Object.freeze({
    scheme: 'cinema', accent: '#FF5B5B', accentPressed: '#D9485F',
    secondary: '#45BFEA', focus: '#FFADAD', canvas: '#090304', canvasRaised: '#21090C',
    rail: '#150507', panel: '#280C10', tile: '#1A080A', tileActive: '#3A1015',
    border: '#82434B', text: '#FFF4F4', muted: '#C79A9D', glow: 'rgba(255,91,91,.31)',
    texture: 'cinema',
  }),
  'odds-calculator': Object.freeze({
    scheme: 'analytics', accent: '#4E9CFF', accentPressed: '#22D3EE',
    secondary: '#22D3EE', focus: '#A4D0FF', canvas: '#020812', canvasRaised: '#091B33',
    rail: '#061326', panel: '#0B2340', tile: '#071A31', tileActive: '#10325D',
    border: '#3D679A', text: '#F0F7FF', muted: '#94AFCC', glow: 'rgba(78,156,255,.31)',
    texture: 'analytic-grid',
  }),
  'bankroll-manager': Object.freeze({
    scheme: 'ledger', accent: '#F15AFF', accentPressed: '#49D17D',
    secondary: '#49D17D', focus: '#F7A3FF', canvas: '#0A030D', canvasRaised: '#210A27',
    rail: '#16061A', panel: '#2A0E30', tile: '#1C0A20', tileActive: '#3D1547',
    border: '#824B88', text: '#FFF3FF', muted: '#C6A0CA', glow: 'rgba(241,90,255,.3)',
    texture: 'ledger',
  }),
  'toke-tracker': Object.freeze({
    scheme: 'chip-vault', accent: '#FFB020', accentPressed: '#399DEB',
    secondary: '#399DEB', focus: '#FFD58A', canvas: '#0A0702', canvasRaised: '#211608',
    rail: '#160E04', panel: '#2A1B09', tile: '#1C1206', tileActive: '#3B270D',
    border: '#85633A', text: '#FFF8E9', muted: '#C9B18B', glow: 'rgba(255,176,32,.3)',
    texture: 'chip-rings',
  }),
  'preflop-charts': Object.freeze({
    scheme: 'range-matrix', accent: '#22E6E6', accentPressed: '#D8B45A',
    secondary: '#D8B45A', focus: '#8FFFFF', canvas: '#020A0B', canvasRaised: '#082122',
    rail: '#041617', panel: '#0A292A', tile: '#071C1D', tileActive: '#0E393A',
    border: '#3B7778', text: '#F0FFFF', muted: '#99C7C7', glow: 'rgba(34,230,230,.29)',
    texture: 'range-matrix',
  }),
  'poker-near-me': Object.freeze({
    scheme: 'casino-realism', accent: '#38bdf8', accentPressed: '#1596d2',
    secondary: '#A7C7DC', focus: '#78D8FF', canvas: '#090F15', canvasRaised: '#0A1118',
    rail: '#0A1118', panel: '#0A1118', tile: '#090F15', tileActive: '#0A1822',
    border: '#516A7D', text: '#EDF6FC', muted: '#9AB0C0', glow: 'rgba(56,189,248,.24)',
    texture: 'machined',
  }),
  marketplace: Object.freeze({
    scheme: 'luxury-market', accent: '#FFD84A', accentPressed: '#3FC7E8',
    secondary: '#3FC7E8', focus: '#FFE996', canvas: '#080603', canvasRaised: '#1C1507',
    rail: '#120D04', panel: '#241A08', tile: '#181105', tileActive: '#35260B',
    border: '#8E7137', text: '#FFF9E5', muted: '#CDBB8C', glow: 'rgba(255,216,74,.3)',
    texture: 'luxury-facets',
  }),
});

export const getWorldMenuStyleVariables = (world) => {
  const palette = world?.menuPalette || MENU_PALETTE_BY_WORLD['personal-assistant'];
  return {
    '--world-accent': palette.accent,
    '--world-accent-pressed': palette.accentPressed,
    '--world-secondary': palette.secondary,
    '--world-focus': palette.focus,
    '--world-canvas': palette.canvas,
    '--world-canvas-raised': palette.canvasRaised,
    '--world-rail': palette.rail,
    '--world-panel': palette.panel,
    '--world-tile': palette.tile,
    '--world-tile-active': palette.tileActive,
    '--world-border': palette.border,
    '--world-text': palette.text,
    '--world-muted': palette.muted,
    '--world-glow': palette.glow,
  };
};

const cleanPath = (value) => {
  const raw = String(value || '/').split(/[?#]/, 1)[0];
  return raw.replace(/\/+$/, '') || '/';
};

export const WORLD_MENU_DEFINITIONS = Object.freeze(
  footerRegistry.worlds.map((world) => Object.freeze({
    ...world,
    menuKey: MENU_KEY_BY_WORLD[world.id],
    purpose: PURPOSE_BY_WORLD[world.id],
    menuPalette: MENU_PALETTE_BY_WORLD[world.id],
    primaryItems: Object.freeze(
      world.items.map((item) => Object.freeze({
        ...item,
        description: item.title,
        hardNav: item.href.startsWith('/hub/club-arena'),
      }))
    ),
  }))
);

const WORLD_BY_MENU_KEY = new Map(
  WORLD_MENU_DEFINITIONS.map((world) => [world.menuKey, world])
);

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
