/**
 * TRAINING LOBBY FILTER, SORT & METADATA ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, deterministic filtering, sorting, grouping, and metadata resolution
 * for all 107 games in TRAINING_LIBRARY, powering the Poker Arena-style
 * Training Games lobby without mutating canonical catalog records.
 */

import { resolvePresetForGame, VARIANT_METADATA } from './trainingPresets.mjs';

export const LOBBY_GROUPS = Object.freeze({
  ALL: Object.freeze({ id: 'ALL', label: 'All Games', categories: ['MTT', 'CASH', 'SPINS', 'ADVANCED', 'PSYCHOLOGY'] }),
  DRILLS: Object.freeze({ id: 'DRILLS', label: 'Game Drills', categories: ['MTT', 'CASH', 'SPINS'] }),
  LABS: Object.freeze({ id: 'LABS', label: 'Strategy Labs', categories: ['ADVANCED', 'PSYCHOLOGY'] }),
});

export const LOBBY_CATEGORY_META = Object.freeze({
  MTT: Object.freeze({ id: 'MTT', label: 'Tournaments', shortLabel: "MTTs", group: 'DRILLS', ledTone: 'cobalt' }),
  CASH: Object.freeze({ id: 'CASH', label: 'Cash Games', shortLabel: 'Cash', group: 'DRILLS', ledTone: 'emerald' }),
  SPINS: Object.freeze({ id: 'SPINS', label: 'Spins & SNGs', shortLabel: 'Spins', group: 'DRILLS', ledTone: 'ice' }),
  ADVANCED: Object.freeze({ id: 'ADVANCED', label: 'Poker Strategy', shortLabel: 'Strategy', group: 'LABS', ledTone: 'ice' }),
  PSYCHOLOGY: Object.freeze({ id: 'PSYCHOLOGY', label: 'Mental Game', shortLabel: 'Mental', group: 'LABS', ledTone: 'steel' }),
});

export const LOBBY_CATEGORY_ORDER = Object.freeze(['MTT', 'CASH', 'SPINS', 'ADVANCED', 'PSYCHOLOGY']);

export const QUICK_FILTER_PILLS = Object.freeze([
  { id: 'ALL', label: 'All' },
  { id: 'FOR_YOU', label: 'For You' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'BEGINNER', label: 'Beginner' },
  { id: 'PRO', label: 'Advanced' },
]);

export const DEFAULT_LOBBY_FILTERS = Object.freeze({
  group: 'ALL',
  category: 'ALL',
  favoritesOnly: false,
  quickFilter: 'ALL',
  difficultyTier: 'ALL',
  styleTag: 'ALL',
  statusFilter: 'ALL',
  accessFilter: 'ALL',
  variant: 'ALL',
  query: '',
  sortKey: 'recommended',
  sortDir: 'asc',
});

const FORMAT_BADGE_LABEL = Object.freeze({
  cash: '6-Max',
  mtt: 'MTT',
  spins: '3-Max',
  hu: 'Heads-Up',
  '9max': '9-Max',
});

const STYLE_LABELS = Object.freeze({
  gto: 'GTO',
  math: 'Math',
  exploitative: 'Exploit',
});

// Players type poker terms with or without spaces, apostrophes and hyphens.
function searchWords(value) {
  return String(value).toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\b([3-5])[\s-]*bets?\b/g, '$1bet')
    .replace(/\bsit[\s-]+(?:and[\s-]+|n[\s-]+|&[\s-]+)?go(?:s|es)?\b/g, 'sng')
    .match(/[a-z0-9]+/g) || [];
}

/**
 * Enrich a canonical TRAINING_LIBRARY game entry with deterministic Arena-row
 * telemetry derived from its real fields + resolvePresetForGame().
 */
export function buildLobbyGameMeta(game) {
  if (!game) return null;
  const preset = resolvePresetForGame(game);
  const category = game.category || 'MTT';
  const catMeta = LOBBY_CATEGORY_META[category] || LOBBY_CATEGORY_META.MTT;
  const difficulty = Math.max(1, Math.min(5, Number(game.difficulty) || 2));
  const estMinutes = Math.max(1, Number(game.estMinutes) || 10);
  const handsTarget = Math.max(1, Number(game.handsTarget) || 20);
  const tags = Array.isArray(game.tags) ? game.tags : [];

  const styleTokens = tags
    .map((tag) => STYLE_LABELS[String(tag).toLowerCase()])
    .filter(Boolean);
  const styleLabel = styleTokens.length > 0
    ? styleTokens.slice(0, 2).join(' · ')
    : category === 'PSYCHOLOGY'
      ? 'Mental'
      : 'Core';

  const formatShort = FORMAT_BADGE_LABEL[preset?.format] || catMeta.shortLabel;
  const stackLabel = preset?.stackDepthBb ? `${preset.stackDepthBb}BB` : '';
  const plaqueLabel = game.vipOnly
    ? `VIP · Lvl ${difficulty}`
    : category === 'PSYCHOLOGY'
      ? 'Mental Game'
      : [stackLabel, formatShort].filter(Boolean).join(' · ') || catMeta.shortLabel;

  const difficultyTier =
    difficulty <= 2 ? 'BEGINNER'
      : difficulty === 3 ? 'INTERMEDIATE'
        : difficulty === 4 ? 'ADVANCED'
          : 'BOSS';

  const variantShort = VARIANT_METADATA[preset?.variant]?.shortLabel || 'NLH';

  const words = searchWords([
    game.id,
    game.name,
    game.focus,
    catMeta.label,
    catMeta.shortLabel,
    plaqueLabel,
    styleLabel,
    VARIANT_METADATA[preset?.variant]?.label,
    variantShort,
    ...tags,
    game.vipOnly ? 'vip boss level 10' : 'free',
    `level ${difficulty}`,
    `lvl ${difficulty}`,
  ]
    .filter(Boolean)
    .join(' '));

  return {
    id: game.id,
    category,
    group: catMeta.group,
    categoryLabel: catMeta.label,
    categoryShort: catMeta.shortLabel,
    ledTone: game.vipOnly ? 'crimson' : catMeta.ledTone,
    difficulty,
    difficultyTier,
    estMinutes,
    handsTarget,
    tags,
    styleLabel,
    plaqueLabel,
    variantShort,
    preset,
    vipOnly: Boolean(game.vipOnly),
    searchWords: words,
  };
}

/**
 * Count active filters inside the slide-up Filters drawer (excluding primary
 * group/category/favorites toggles already visible on the main deck).
 */
export function countAdvancedFilters(filters) {
  let count = 0;
  if (filters.difficultyTier && filters.difficultyTier !== 'ALL') count += 1;
  if (filters.styleTag && filters.styleTag !== 'ALL') count += 1;
  if (filters.statusFilter && filters.statusFilter !== 'ALL') count += 1;
  if (filters.accessFilter && filters.accessFilter !== 'ALL') count += 1;
  if (filters.variant && filters.variant !== 'ALL') count += 1;
  if (filters.sortKey && filters.sortKey !== 'recommended') count += 1;
  return count;
}

/**
 * Determine whether a game qualifies for the "For You" quick filter.
 */
export function isRecommendedForPlayer(game, meta, ctx = {}) {
  if (!game) return false;
  if (ctx.recommendedGameId && game.id === ctx.recommendedGameId) return true;
  if (ctx.leakGameId && game.id === ctx.leakGameId) return true;
  const progress = Number(ctx.getProgress?.(game.id) ?? 0);
  if (progress > 0 && progress < 100) return true;
  // Starter essentials when a player has no active recommendation or leak yet
  if (!ctx.recommendedGameId && !ctx.leakGameId) {
    return meta.difficulty <= 2 && !meta.vipOnly;
  }
  return false;
}

/**
 * Filter and sort the canonical TRAINING_LIBRARY according to all lobby controls.
 */
export function filterAndSortTrainingGames(library, filters, ctx = {}) {
  const f = { ...DEFAULT_LOBBY_FILTERS, ...(filters || {}) };
  const query = String(f.query || '').trim().toLowerCase();
  const queryTerms = searchWords(query);
  const favoriteSet = ctx.favoriteIds instanceof Set ? ctx.favoriteIds : new Set(ctx.favoriteIds || []);
  const getProgress = typeof ctx.getProgress === 'function' ? ctx.getProgress : () => 0;

  const groupCategories = LOBBY_GROUPS[f.group]?.categories || LOBBY_GROUPS.ALL.categories;

  const enriched = [];
  for (let index = 0; index < library.length; index += 1) {
    const game = library[index];
    const meta = ctx.metaMap?.get(game.id) || buildLobbyGameMeta(game);
    const progress = Math.max(0, Math.min(100, Number(getProgress(game.id)) || 0));
    const isFavorite = favoriteSet.has(game.id);
    const isRecommended = Boolean(
      (ctx.recommendedGameId && game.id === ctx.recommendedGameId)
      || (ctx.leakGameId && game.id === ctx.leakGameId)
    );
    const isLeakTarget = Boolean(ctx.leakGameId && game.id === ctx.leakGameId);

    if (f.group !== 'ALL' && !groupCategories.includes(meta.category)) continue;
    if (f.category !== 'ALL' && meta.category !== f.category) continue;
    if (f.favoritesOnly && !isFavorite) continue;

    if (f.quickFilter === 'FOR_YOU' && !isRecommendedForPlayer(game, meta, ctx)) continue;
    if (f.quickFilter === 'IN_PROGRESS' && !(progress > 0 && progress < 100)) continue;
    if (f.quickFilter === 'BEGINNER' && meta.difficulty > 2) continue;
    if (f.quickFilter === 'PRO' && meta.difficulty < 4) continue;

    if (f.difficultyTier !== 'ALL' && meta.difficultyTier !== f.difficultyTier) continue;

    if (f.styleTag !== 'ALL') {
      if (f.styleTag === 'mental') {
        if (meta.category !== 'PSYCHOLOGY') continue;
      } else if (!meta.tags.includes(f.styleTag)) {
        continue;
      }
    }

    if (f.statusFilter === 'NEW' && progress !== 0) continue;
    if (f.statusFilter === 'IN_PROGRESS' && !(progress > 0 && progress < 100)) continue;
    if (f.statusFilter === 'MASTERED' && progress < 100) continue;

    if (f.accessFilter === 'FREE' && meta.vipOnly) continue;
    if (f.accessFilter === 'VIP' && !meta.vipOnly) continue;

    // Variant filter matches games whose default preset matches OR that can be launched in that variant
    // (mental-game drills don't run PLO variant trees, whereas table drills do).
    if (f.variant !== 'ALL') {
      if (meta.category === 'PSYCHOLOGY') continue;
      if (f.variant !== 'nlh' && meta.category === 'SPINS' && f.variant === 'plo6') continue;
    }

    if (queryTerms.length > 0 && !queryTerms.every((term) => meta.searchWords.some((word) => word.startsWith(term)))) {
      continue;
    }

    enriched.push({
      game,
      meta,
      progress,
      isFavorite,
      isRecommended,
      isLeakTarget,
      catalogIndex: index,
    });
  }

  const dir = f.sortDir === 'desc' ? -1 : 1;

  enriched.sort((a, b) => {
    if (f.sortKey === 'name') {
      return a.game.name.localeCompare(b.game.name) * dir;
    }
    if (f.sortKey === 'difficulty') {
      const diff = (a.meta.difficulty - b.meta.difficulty) * dir;
      return diff !== 0 ? diff : a.catalogIndex - b.catalogIndex;
    }
    if (f.sortKey === 'length') {
      const diff = (a.meta.estMinutes - b.meta.estMinutes) * dir;
      return diff !== 0 ? diff : a.catalogIndex - b.catalogIndex;
    }
    if (f.sortKey === 'progress') {
      const diff = (a.progress - b.progress) * dir;
      return diff !== 0 ? diff : a.catalogIndex - b.catalogIndex;
    }

    // Default 'recommended' order:
    // 1) Active Leak target & Jarvis recommendation first
    // 2) Starred favorites next when not already isolated
    // 3) In-progress drills
    // 4) Original curated library order
    const rank = (item) => {
      if (item.isLeakTarget) return 0;
      if (item.isRecommended) return 1;
      if (item.isFavorite) return 2;
      if (item.progress > 0 && item.progress < 100) return 3;
      return 4;
    };
    const rDiff = rank(a) - rank(b);
    return rDiff !== 0 ? rDiff : a.catalogIndex - b.catalogIndex;
  });

  return enriched;
}

/**
 * Group visible lobby items under Arena-style metallic section dividers when
 * browsing in default recommended order without an explicit column sort.
 */
export function buildLobbySections(items, filters) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const f = { ...DEFAULT_LOBBY_FILTERS, ...(filters || {}) };

  // When a specific sort column or search query or favorites-only is active,
  // keep one clean flat ranked list so sort order is never visually broken.
  if (f.sortKey !== 'recommended' || f.favoritesOnly || String(f.query || '').trim() || f.category !== 'ALL') {
    const label = f.favoritesOnly
      ? 'Favorite Training Games'
      : f.category !== 'ALL'
        ? (LOBBY_CATEGORY_META[f.category]?.label || 'Training Games')
        : 'Matching Training Games';
    return [{ id: 'flat', label, items }];
  }

  const sections = [];
  const featured = items.filter((it) => it.isLeakTarget || it.isRecommended || it.isFavorite);
  const featuredIds = new Set(featured.map((it) => it.game.id));

  if (featured.length > 0) {
    sections.push({
      id: 'featured',
      label: 'Recommended & Favorites',
      items: featured,
    });
  }

  for (const cat of LOBBY_CATEGORY_ORDER) {
    const catItems = items.filter((it) => it.meta.category === cat && !featuredIds.has(it.game.id));
    if (catItems.length > 0) {
      sections.push({
        id: cat.toLowerCase(),
        label: LOBBY_CATEGORY_META[cat].label,
        items: catItems,
      });
    }
  }

  return sections;
}
