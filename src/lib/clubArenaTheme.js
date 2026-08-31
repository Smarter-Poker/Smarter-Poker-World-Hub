/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ARENA THEME BRIDGE — one table look, every surface (Dan 2026-08-30)
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
};

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

export function resolveArenaCardBackUrl(cardsId) {
  const id = CARD_BACK_IDS.includes(cardsId) ? cardsId : 'classic_blue';
  return `${CARD_BACK_BASE}/${id}.webp`;
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
