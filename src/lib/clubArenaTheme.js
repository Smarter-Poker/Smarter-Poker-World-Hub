/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA THEME BRIDGE - one table look, every surface (Dan 2026-08-30)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dan, verbatim: "WHAT EVER TABLE YOU HAVE SELECTED ... TABLE, BACKGROUND,
 * BUTTONS, CARDS SHOULD BE LOCKED IN AT EVERY TABLE ACROSS THE BOARD ... ITS
 * THE TABLE THAT SHOULD LOAD ON EVERY TABLE THROUGHOUT THE CLUB ARENA, AND AS
 * WELL AS THE TRAINING GAMES PAGES AND THE PERSONAL ASSISTANT VIRTUAL SANDBOX."
 *
 * Club Arena persists the player's table look in Supabase
 * (user_theme_settings) and mirrors the raw rows into localStorage under
 * `ca_user_theme_rows:<userId>` (see club-arena's useUserThemeSettings.ts).
 * Both apps are same-origin on smarter.poker, so that cache is readable HERE,
 * synchronously, with no network. This module resolves it into paintable CSS
 * for the World Hub surfaces that render a poker table: the training game
 * pages and the personal-assistant sandbox.
 *
 * The id -> asset maps below are a DERIVED COPY of club-arena's catalogs
 * (src/assets/tableAssets.ts, src/lib/tableTheme.ts, CardImage.tsx
 * CARD_BACK_CATALOG). The artwork itself is copied to
 * public/hub/table-theme/{tables,backgrounds} because the Arena bundle's own
 * asset URLs are content-hashed and change every build. If Arena adds a skin,
 * add it here and copy the file. Unknown ids fall back exactly the way Arena
 * falls back: classic_green felt, midnight background, classic_blue back.
 */

const SKIN_BASE = '/hub/table-theme/tables';
const BG_BASE = '/hub/table-theme/backgrounds';
const CARD_BACK_BASE = '/hub/club-arena/cards/backs/table';

/** Canonical skin ids -> file names (aliases included, mirroring Arena). */
const SKIN_FILES = {
  classic_green: 'skin_classic_green.png',
  'classic-green': 'skin_classic_green.png',
  'green-casino': 'skin_classic_green.png',
  ocean_blue: 'skin_ocean_blue.png',
  'royal-blue': 'skin_ocean_blue.png',
  'neon-blue-felt': 'skin_ocean_blue.png',
  crimson: 'skin_crimson.png',
  'wine-red': 'skin_crimson.png',
  'red-leather': 'skin_crimson.png',
  electric_purple: 'skin_electric_purple.png',
  'purple-haze': 'skin_electric_purple.png',
  golden_sand: 'skin_golden_sand.png',
  emerald: 'skin_golden_sand.png',
  neon_city: 'skin_neon_city.png',
  'dark-felt': 'skin_neon_city.png',
  ice_cavern: 'skin_ice_cavern.png',
  carbon_red: 'skin_carbon_red.png',
  arctic_white: 'skin_arctic_white.png',
  mahogany_red: 'skin_mahogany_red.png',
  'brown-felt': 'skin_mahogany_red.png',
  amethyst_cavern: 'skin_amethyst_cavern.png',
  carbon_ion: 'skin_carbon_ion.png',
  jade_city: 'skin_jade_city.png',
  final_table: 'skin_final_table.png',
};

/** Theme-preset ids -> the skin they bundle (Arena THEME_PRESET_CATALOG). */
const PRESET_SKINS = {
  'default-dark': 'classic_green',
  'classic-brown': 'carbon_red',
  'neon-blue': 'ice_cavern',
  'rustic-wood': 'golden_sand',
  'casino-green': 'jade_city',
  'ocean-depths': 'ocean_blue',
  'crimson-club': 'crimson',
  'arctic-suite': 'arctic_white',
  'amethyst-night': 'amethyst_cavern',
  'carbon-ion': 'carbon_ion',
  // Legacy receipt aliases (Arena THEME_PRESET_ALIASES)
  neon: 'ice_cavern',
  midnight_casino: 'carbon_ion',
  cosmic: 'amethyst_cavern',
  midnight_felt: 'carbon_ion',
  midnight_a: 'carbon_ion',
  royal_gold: 'golden_sand',
  royal_b: 'golden_sand',
};

const BACKGROUND_FILES = {
  midnight: 'bg_midnight.jpg',
  'diamond-pattern': 'bg_midnight.jpg',
  royal_indigo: 'bg_royal_indigo.jpg',
  emerald_room: 'bg_emerald_room.jpg',
  crimson_lounge: 'bg_crimson_lounge.jpg',
  ocean_abyss: 'bg_ocean_abyss.jpg',
  golden_dusk: 'bg_golden_dusk.jpg',
  'hardwood-floor': 'bg_golden_dusk.jpg',
  galaxy: 'bg_galaxy.jpg',
  'galaxy-nebula': 'bg_galaxy.jpg',
  carbon_grid: 'bg_carbon_grid.jpg',
  'stone-concrete': 'bg_carbon_grid.jpg',
  ice_frost: 'bg_ice_frost.jpg',
  jade_neon: 'bg_jade_neon.jpg',
  'teal-tile': 'bg_jade_neon.jpg',
  place_las_vegas: 'bg_place_las_vegas.jpg',
  place_paris: 'bg_place_paris.jpg',
  place_london: 'bg_place_london.jpg',
  place_tokyo: 'bg_place_tokyo.jpg',
  place_dubai: 'bg_place_dubai.jpg',
  place_sydney: 'bg_place_sydney.jpg',
  place_rio: 'bg_place_rio.jpg',
  place_santorini: 'bg_place_santorini.jpg',
  place_new_york: 'bg_place_new_york.jpg',
  place_monaco: 'bg_place_monaco.jpg',
  skin_shadow_suits: 'bg_skin_shadow_suits.jpg',
  skin_gilded_fall: 'bg_skin_gilded_fall.jpg',
  skin_crimson_damask: 'bg_skin_crimson_damask.jpg',
  skin_graphite_embossed: 'bg_skin_graphite_embossed.jpg',
  skin_obsidian_micro: 'bg_skin_obsidian_micro.jpg',
  skin_emerald_argyle: 'bg_skin_emerald_argyle.jpg',
  skin_ultraviolet_suits: 'bg_skin_ultraviolet_suits.jpg',
  skin_black_gold_chips: 'bg_skin_black_gold_chips.jpg',
  skin_golden_sparks: 'bg_skin_golden_sparks.jpg',
  skin_platinum_deco: 'bg_skin_platinum_deco.jpg',
  final_table_broadcast: 'bg_final_table_broadcast.jpg',
};

/**
 * DEALER BUTTON per Controls design (Arena button_id).
 *
 * Copied VERBATIM from club-arena/src/components/table/ControlThemeTokens.css,
 * which sets seven CSS custom properties per design. Only these two are
 * carried here, and deliberately so: the other five style Fold / Check /
 * Raise, and no World Hub surface has those controls. Shipping the full sheet
 * would put five variables in the bundle that nothing reads - the exact
 * "defined 37 times, read by var() zero times" defect Arena's own comments
 * record. If a Hub surface ever grows real action controls, port the rest
 * then, next to their consumer.
 */
const DEALER_BUTTON_STYLES = {
  'classic-white': {
    bg: 'linear-gradient(145deg, #ffffff 0%, #e8e8e8 50%, #d0d0d0 100%)',
    color: '#111',
  },
  'red-d-gear': { bg: 'linear-gradient(135deg, #c62828, #e53935)', color: '#fff' },
  'gray-d-gear': { bg: 'linear-gradient(135deg, #616161, #757575)', color: '#fff' },
  'blue-crystal': { bg: 'linear-gradient(135deg, #1565c0, #42a5f5)', color: '#fff' },
  'gold-star': { bg: 'linear-gradient(135deg, #f57f17, #fbc02d)', color: '#1a1a1e' },
  'sports-themed': { bg: 'linear-gradient(135deg, #2ea043, #4dc660)', color: '#fff' },
  'jade-seal': {
    bg: 'radial-gradient(circle at 34% 28%, #d6f7df 0%, #4dc660 35%, #145039 74%, #09271d 100%)',
    color: '#f4fff8',
  },
  'amethyst-chip': {
    bg: 'radial-gradient(circle at 34% 28%, #ecdfff 0%, #9c69d2 34%, #4a2476 72%, #1e0d34 100%)',
    color: '#fff',
  },
  'carbon-ion': {
    bg: 'conic-gradient(from 20deg, #12181b, #38464a, #0d1214, #263438, #12181b)',
    color: '#65ead8',
  },
  'ocean-pearl': {
    bg: 'radial-gradient(circle at 32% 25%, #ffffff 0%, #dff5fb 30%, #71b8d2 70%, #2c708d 100%)',
    color: '#092b3d',
  },
};

/** Theme-preset ids -> the Controls design they bundle (Arena catalog). */
const PRESET_BUTTONS = {
  'default-dark': 'classic-white',
  'classic-brown': 'gray-d-gear',
  'neon-blue': 'blue-crystal',
  'rustic-wood': 'gold-star',
  'casino-green': 'gold-star',
  'ocean-depths': 'classic-white',
  'crimson-club': 'red-d-gear',
  'arctic-suite': 'ocean-pearl',
  'amethyst-night': 'amethyst-chip',
  'carbon-ion': 'carbon-ion',
};

const CARD_BACK_IDS = [
  'classic_blue', 'classic_red', 'royal', 'neon', 'galaxy', 'diamond',
  'dragon', 'gold', 'carbon', 'holographic', 'club-branded', 'diamond-foil',
];

/** Loading/failure fallback gradients per skin (Arena FELT_META thumbnails). */
const FELT_GRADIENTS = {
  classic_green: 'linear-gradient(135deg, #0f9d63, #0a3d24)',
  carbon_red: 'linear-gradient(135deg, #232326 55%, #b3221f)',
  ocean_blue: 'linear-gradient(135deg, #1a4a7a, #0a243d)',
  crimson: 'linear-gradient(135deg, #7a1a3a, #3d0a20)',
  electric_purple: 'linear-gradient(135deg, #4a1a7a, #240a3d)',
  golden_sand: 'linear-gradient(135deg, #7a6a1a, #3d380a)',
  neon_city: 'linear-gradient(135deg, #2b2b33 40%, #d446b8 75%, #2ad4d4)',
  ice_cavern: 'linear-gradient(135deg, #0c1524 40%, #3f6fae 75%, #bcd6ee)',
  arctic_white: 'linear-gradient(135deg, #f2f2f0 35%, #3f8fd4)',
  mahogany_red: 'linear-gradient(135deg, #3a1410 30%, #b3273a 70%, #d8a437)',
  amethyst_cavern: 'linear-gradient(135deg, #180c24 40%, #7d3fae 75%, #d9bcee)',
  carbon_ion: 'linear-gradient(135deg, #232326 55%, #1fb392)',
  jade_city: 'linear-gradient(135deg, #14261c 40%, #2fae6f 75%, #9fe8c0)',
  final_table: 'linear-gradient(135deg, #1b2442 40%, #2d4c8a 75%, #0c1428)',
};

/** Clean catalog of Club Arena table skins for customizer pickers. */
export const CLUB_ARENA_SKINS = [
  { id: 'classic_green', label: 'Classic Green', swatch: '#0f9d63' },
  { id: 'ocean_blue', label: 'Ocean Blue', swatch: '#1a4a7a' },
  { id: 'crimson', label: 'Crimson', swatch: '#7a1a3a' },
  { id: 'electric_purple', label: 'Electric Purple', swatch: '#4a1a7a' },
  { id: 'golden_sand', label: 'Golden Sand', swatch: '#7a6a1a' },
  { id: 'neon_city', label: 'Neon City', swatch: '#2ad4d4' },
  { id: 'ice_cavern', label: 'Ice Cavern', swatch: '#3f6fae' },
  { id: 'carbon_red', label: 'Carbon Red', swatch: '#b3221f' },
  { id: 'arctic_white', label: 'Arctic White', swatch: '#3f8fd4' },
  { id: 'mahogany_red', label: 'Mahogany Red', swatch: '#8b2620' },
  { id: 'amethyst_cavern', label: 'Amethyst Cavern', swatch: '#7d3fae' },
  { id: 'carbon_ion', label: 'Carbon Ion', swatch: '#1fb392' },
  { id: 'jade_city', label: 'Jade City', swatch: '#2fae6f' },
  { id: 'final_table', label: 'Final Table', swatch: '#2d4c8a' },
];

/** Clean catalog of key Club Arena room backdrops. */
export const CLUB_ARENA_BACKGROUNDS = [
  { id: 'midnight', label: 'Midnight', swatch: '#0b1424' },
  { id: 'royal_indigo', label: 'Royal Indigo', swatch: '#1e2756' },
  { id: 'emerald_room', label: 'Emerald Room', swatch: '#0e3b2c' },
  { id: 'crimson_lounge', label: 'Crimson Lounge', swatch: '#4a1524' },
  { id: 'ocean_abyss', label: 'Ocean Abyss', swatch: '#0c2d48' },
  { id: 'golden_dusk', label: 'Golden Dusk', swatch: '#4d3a1a' },
  { id: 'galaxy', label: 'Galaxy', swatch: '#24194a' },
  { id: 'carbon_grid', label: 'Carbon Grid', swatch: '#1f2937' },
  { id: 'ice_frost', label: 'Ice Frost', swatch: '#1e3a5f' },
  { id: 'jade_neon', label: 'Jade Neon', swatch: '#0f4c43' },
  { id: 'final_table_broadcast', label: 'Final Table Broadcast', swatch: '#1a2744' },
];

/** Clean catalog of all 12 Club Arena card backs. */
export const CLUB_ARENA_CARD_BACKS = [
  { id: 'classic_blue', label: 'Classic Blue', swatch: '#1565c0' },
  { id: 'classic_red', label: 'Classic Red', swatch: '#b91c1c' },
  { id: 'royal', label: 'Royal', swatch: '#1d4ed8' },
  { id: 'neon', label: 'Neon', swatch: '#0891b2' },
  { id: 'galaxy', label: 'Galaxy', swatch: '#4c1d95' },
  { id: 'diamond', label: 'Diamond', swatch: '#0ea5e9' },
  { id: 'dragon', label: 'Dragon', swatch: '#991b1b' },
  { id: 'gold', label: 'Gold', swatch: '#92400e' },
  { id: 'carbon', label: 'Carbon', swatch: '#1f2937' },
  { id: 'holographic', label: 'Holographic', swatch: '#0284c7' },
  { id: 'club-branded', label: 'Club Branded', swatch: '#0f766e' },
  { id: 'diamond-foil', label: 'Diamond Foil', swatch: '#38bdf8' },
];

/** Clean catalog of all 10 Club Arena dealer button designs. */
export const CLUB_ARENA_DEALER_BUTTONS = [
  { id: 'classic-white', label: 'Classic White', ...DEALER_BUTTON_STYLES['classic-white'] },
  { id: 'red-d-gear', label: 'Red Gear', ...DEALER_BUTTON_STYLES['red-d-gear'] },
  { id: 'gray-d-gear', label: 'Steel Gear', ...DEALER_BUTTON_STYLES['gray-d-gear'] },
  { id: 'blue-crystal', label: 'Blue Crystal', ...DEALER_BUTTON_STYLES['blue-crystal'] },
  { id: 'gold-star', label: 'Gold Star', ...DEALER_BUTTON_STYLES['gold-star'] },
  { id: 'sports-themed', label: 'Emerald Sport', ...DEALER_BUTTON_STYLES['sports-themed'] },
  { id: 'jade-seal', label: 'Jade Seal', ...DEALER_BUTTON_STYLES['jade-seal'] },
  { id: 'amethyst-chip', label: 'Amethyst Chip', ...DEALER_BUTTON_STYLES['amethyst-chip'] },
  { id: 'carbon-ion', label: 'Carbon Ion', ...DEALER_BUTTON_STYLES['carbon-ion'] },
  { id: 'ocean-pearl', label: 'Ocean Pearl', ...DEALER_BUTTON_STYLES['ocean-pearl'] },
];

/* Arena's ambience/backdrop, verbatim, so the page composition matches. */
const AMBIENCE = [
  'radial-gradient(ellipse 120% 100% at 50% 55%, transparent 30%, rgba(0,0,0,0.5) 100%)',
  'radial-gradient(ellipse 88% 60% at 50% 46%, rgba(84,116,168,0.30) 0%, rgba(38,54,86,0.16) 45%, transparent 74%)',
].join(', ');
const BACKDROP = [
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.014) 0px, rgba(255,255,255,0.014) 1px, transparent 1px, transparent 14px)',
  'linear-gradient(180deg, #101828 0%, #0b1424 45%, #060a12 100%)',
].join(', ');

export const ARENA_BACKGROUND_SIZE = 'cover, cover, cover, auto, cover';
export const ARENA_BACKGROUND_REPEAT = 'no-repeat, no-repeat, no-repeat, repeat, no-repeat';
export const ARENA_BACKDROP_COLOR = '#0a1020';

function canonicalSkinId(id) {
  if (!id) return 'classic_green';
  if (SKIN_FILES[id]) {
    // Resolve alias to the canonical id that names the same file.
    const file = SKIN_FILES[id];
    const canonical = Object.keys(FELT_GRADIENTS).find((k) => SKIN_FILES[k] === file);
    return canonical || 'classic_green';
  }
  const viaPreset = PRESET_SKINS[id];
  return viaPreset || 'classic_green';
}

export function resolveArenaSkinUrl(tableId, themeId) {
  const id = canonicalSkinId(tableId || themeId);
  return `${SKIN_BASE}/${SKIN_FILES[id] || SKIN_FILES.classic_green}`;
}

export function resolveArenaFeltGradient(tableId, themeId) {
  return FELT_GRADIENTS[canonicalSkinId(tableId || themeId)] || FELT_GRADIENTS.classic_green;
}

/** Full felt background value: the real skin artwork over a gradient floor. */
export function resolveArenaFeltLayers(tableId, themeId) {
  return `url(${resolveArenaSkinUrl(tableId, themeId)}) center / cover no-repeat, ${resolveArenaFeltGradient(tableId, themeId)}`;
}

/** Full page background, layered exactly like Arena's table page. */
export function resolveArenaBackgroundLayers(backgroundId) {
  const file = BACKGROUND_FILES[backgroundId] || BACKGROUND_FILES.midnight;
  return `${AMBIENCE}, url(${BG_BASE}/${file}), ${BACKDROP}`;
}

/**
 * The dealer-button paint for a saved button_id, falling back through the
 * theme preset and finally to Arena's own default. Never returns undefined:
 * a table with no dealer marker is worse than one wearing the default.
 */
export function resolveArenaDealerButton(buttonId, themeId) {
  const direct = buttonId && DEALER_BUTTON_STYLES[buttonId];
  if (direct) return direct;
  const viaPreset = themeId && PRESET_BUTTONS[themeId];
  if (viaPreset && DEALER_BUTTON_STYLES[viaPreset]) return DEALER_BUTTON_STYLES[viaPreset];
  return DEALER_BUTTON_STYLES['classic-white'];
}

export function resolveArenaCardBackUrl(cardsId) {
  const id = CARD_BACK_IDS.includes(cardsId) ? cardsId : 'classic_blue';
  return `${CARD_BACK_BASE}/${id}.webp`;
}

/**
 * Resolve a playing card artwork URL for either Club Arena's 4-color WebP deck
 * or the classic 2-color bundled PNG deck (spades/clubs black, hearts/diamonds red).
 */
export function resolveArenaCardUrl(suitName, rankName, deckStyle = '4color') {
  if (!suitName || !rankName) return null;
  if (deckStyle === '2color') {
    return `/cards/${suitName}_${rankName}.png`;
  }
  return `/hub/club-arena/cards/4color/${suitName}_${rankName}.webp`;
}

/** The signed-in user's id, from the shared same-origin Supabase session. */
function readAuthUserId() {
  try {
    const raw = localStorage.getItem('smarter-poker-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user?.id || parsed?.currentSession?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * The player's saved Arena theme row. Bucket precedence mirrors Arena's
 * pickThemeRow for surfaces outside a specific game: the ALL row wins, else
 * the most recently updated row of any bucket, else null (paint defaults).
 */
export function readArenaThemeRow() {
  try {
    const userId = readAuthUserId();
    if (!userId) return null;
    const raw = localStorage.getItem(`ca_user_theme_rows:${userId}`);
    if (!raw) return null;
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const all = rows.find((r) => r && r.game_type === 'ALL');
    if (all) return all;
    return [...rows]
      .filter(Boolean)
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;
  } catch {
    return null;
  }
}

/**
 * One call for a table-rendering surface: everything resolved, never null
 * resolved fields. `fromCache` is false when the player has no saved theme
 * yet (the defaults are Arena's defaults, so the surfaces still match Arena).
 */
export function getClubArenaTheme() {
  const row = readArenaThemeRow();
  return {
    fromCache: !!row,
    tableId: row?.table_id || null,
    themeId: row?.theme_id || null,
    backgroundId: row?.background_id || null,
    cardsId: row?.cards_id || null,
    feltUrl: resolveArenaSkinUrl(row?.table_id, row?.theme_id),
    feltLayers: resolveArenaFeltLayers(row?.table_id, row?.theme_id),
    feltGradient: resolveArenaFeltGradient(row?.table_id, row?.theme_id),
    backgroundLayers: resolveArenaBackgroundLayers(row?.background_id),
    cardBackUrl: resolveArenaCardBackUrl(row?.cards_id),
    buttonId: row?.button_id || null,
    dealerButton: resolveArenaDealerButton(row?.button_id, row?.theme_id),
  };
}

/**
 * Subscribe to theme changes made in another tab (Arena's Table Studio writes
 * the cache key on every save). Returns an unsubscribe function.
 */
export function onClubArenaThemeChange(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    if (e.key && e.key.startsWith('ca_user_theme_rows:')) callback(getClubArenaTheme());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
