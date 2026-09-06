/**
 * Canonical Trivia lobby catalogue.
 *
 * This module is deliberately framework-free so the lobby, route guards and
 * Node contract tests can all read the same fifteen-mode definition. Gameplay
 * pricing remains owned by triviaEngine; this catalogue owns presentation,
 * destinations and default launch availability only.
 */

export const TRIVIA_LOBBY_ROUTE = '/hub/trivia';

export const TRIVIA_MODE_PLACEMENT = Object.freeze({
  FEATURED: 'featured',
  MIDDLE: 'middle',
  QUICK_STAKES: 'quick-stakes',
});

export const TRIVIA_MODE_AVAILABILITY = Object.freeze({
  LIVE: 'live',
  MAINTENANCE: 'maintenance',
});

const defineMode = (definition) => Object.freeze({
  availability: TRIVIA_MODE_AVAILABILITY.LIVE,
  enabledByDefault: true,
  maintenanceLabel: 'Maintenance',
  maintenanceMessage: 'This Mode Is Temporarily Unavailable While It Is Being Upgraded.',
  ...definition,
});

export const TRIVIA_MODES = Object.freeze([
  defineMode({
    id: 'daily',
    placement: TRIVIA_MODE_PLACEMENT.FEATURED,
    category: 'featured',
    name: 'Daily Trivia',
    description: '10 Questions Fresh Every Day',
    route: '/hub/trivia/daily',
    image: '/images/trivia/daily-trivia-header-final.webp?v=v6',
    imageAlt: 'Daily Trivia - 10 Questions Fresh Every Day',
    imageWidth: 1024,
    imageHeight: 309,
  }),
  defineMode({
    id: 'mtt',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '01',
    category: 'strategy',
    name: 'MTT Scenarios',
    description: 'Multi-table Tournament Situations and Decisions',
    icon: 'target',
    color: '#f97316',
    glowColor: '#f97316',
    diamondReward: 5,
    perfectBonus: 10,
    route: '/hub/trivia/mtt',
    image: '/images/trivia/modes-v2/mtt.webp',
  }),
  defineMode({
    id: 'cash',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '02',
    category: 'strategy',
    name: 'Cash Game',
    description: 'Deep Stack Scenarios, Implied Odds, Table Dynamics',
    icon: 'banknote',
    color: '#31a24c',
    glowColor: '#31a24c',
    diamondReward: 5,
    perfectBonus: 10,
    route: '/hub/trivia/cash',
    image: '/images/trivia/modes-v2/cash.webp',
  }),
  defineMode({
    id: 'icm',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '03',
    category: 'strategy',
    name: 'ICM & Chip EV',
    description: 'Tournament Equity, Chip Value vs $EV Decisions',
    icon: 'calculator',
    color: '#2374e1',
    glowColor: '#2374e1',
    diamondReward: 5,
    perfectBonus: 10,
    route: '/hub/trivia/icm',
    image: '/images/trivia/modes-v2/icm.webp',
  }),
  defineMode({
    id: 'history',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '04',
    category: 'knowledge',
    name: 'Poker History',
    description: 'Iconic Moments, Famous Hands, Legendary Players',
    icon: 'trophy',
    color: '#FFD700',
    glowColor: '#FFD700',
    diamondReward: 3,
    perfectBonus: 5,
    route: '/hub/trivia/history',
    image: '/images/trivia/modes-v2/history.webp',
  }),
  defineMode({
    id: 'tournaments',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '05',
    category: 'competitive',
    name: 'Tournaments',
    description: 'Nightly 8 PM Central Time Brackets With Big Prize Pools',
    icon: 'calendar',
    color: '#FFD700',
    glowColor: '#FFD700',
    diamondReward: 'Prize pool',
    perfectBonus: null,
    route: '/hub/trivia/tournaments',
    image: '/images/trivia/modes-v2/tournaments.webp',
    availability: TRIVIA_MODE_AVAILABILITY.MAINTENANCE,
    enabledByDefault: false,
    maintenanceMessage: 'Nightly Tournament Upgrades Are In Progress. Tournaments Will Return Soon.',
  }),
  defineMode({
    id: 'pro',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '06',
    category: 'knowledge',
    name: 'Pro Knowledge',
    description: 'Strategy Concepts, GTO Basics, Advanced Trivia',
    icon: 'graduation-cap',
    color: '#9D4EDD',
    glowColor: '#9D4EDD',
    diamondReward: 5,
    perfectBonus: 10,
    route: '/hub/trivia/pro',
    image: '/images/trivia/modes-v2/pro.webp',
  }),
  defineMode({
    id: 'survival',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '07',
    category: 'challenge',
    name: 'Survival Mode',
    description: '10 Levels, 20 Questions Each. All Categories Combined!',
    icon: 'heart',
    color: '#f02849',
    glowColor: '#f02849',
    diamondReward: '10+',
    perfectBonus: null,
    route: '/hub/trivia/survival-game',
    image: '/images/trivia/modes-v2/survival.webp',
  }),
  defineMode({
    id: 'endless',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '08',
    category: 'challenge',
    name: 'Endless Mode',
    description: 'All Questions, Random Order. Answer Until You Miss!',
    icon: 'infinity',
    color: '#8b5cf6',
    glowColor: '#8b5cf6',
    diamondReward: '1+/Q',
    perfectBonus: null,
    route: '/hub/trivia/endless',
    image: '/images/trivia/modes-v2/endless.webp',
  }),
  defineMode({
    id: 'mixed',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '09',
    category: 'challenge',
    name: 'Mixed Mode',
    description: 'Seven Poker Categories, Rotating Every Question',
    icon: 'shuffle',
    color: '#00D4FF',
    glowColor: '#00D4FF',
    diamondReward: '5+ / +10 perfect',
    perfectBonus: null,
    route: '/hub/trivia/mixed',
    image: '/images/trivia/modes-v2/mixed.webp',
  }),
  defineMode({
    id: 'time-attack',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '10',
    category: 'challenge',
    name: 'Time Attack',
    description: 'Thirty Seconds. Answer as Many as You Can.',
    icon: 'timer',
    color: '#14b8a6',
    glowColor: '#14b8a6',
    diamondReward: '1 / correct',
    perfectBonus: null,
    route: '/hub/trivia/time-attack',
    image: '/images/trivia/modes-v2/time-attack.webp',
  }),
  defineMode({
    id: 'pvp',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '11',
    category: 'competitive',
    name: '1v1 Battle',
    description: 'Challenge Real Players for Diamonds!',
    icon: 'swords',
    color: '#f02849',
    glowColor: '#f02849',
    diamondReward: '1.8x stake',
    perfectBonus: null,
    route: '/hub/trivia/pvp',
    image: '/images/trivia/modes-v2/pvp.webp',
    availability: TRIVIA_MODE_AVAILABILITY.MAINTENANCE,
    enabledByDefault: false,
    maintenanceMessage: 'Matchmaking Upgrades Are In Progress. 1v1 Battle Will Return Soon.',
  }),
  defineMode({
    id: 'rules',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '12',
    category: 'knowledge',
    name: 'Rules Quiz',
    description: 'Test Your Understanding of Official Poker Rules',
    icon: 'book-open',
    color: '#4a90d9',
    glowColor: '#4a90d9',
    diamondReward: 3,
    perfectBonus: 5,
    route: '/hub/trivia/rules',
    image: '/images/trivia/modes-v2/rules.webp',
  }),
  defineMode({
    id: 'gto',
    placement: TRIVIA_MODE_PLACEMENT.MIDDLE,
    code: '13',
    category: 'competitive',
    name: 'GTO Master',
    description: 'Solver-based Scenarios Combining MTT, Cash, and ICM',
    icon: 'brain',
    color: '#a855f7',
    glowColor: '#a855f7',
    diamondReward: 8,
    perfectBonus: 15,
    route: '/hub/trivia/gto',
    image: '/images/trivia/modes-v2/gto.webp',
  }),
  defineMode({
    id: 'arcade',
    placement: TRIVIA_MODE_PLACEMENT.QUICK_STAKES,
    category: 'challenge',
    name: 'Quick Stakes',
    description: 'Timed Arcade Round',
    route: '/hub/trivia/arcade',
    image: '/images/trivia/quick-stakes.webp?v=v6',
    imageWidth: 1600,
    imageHeight: 763,
  }),
]);

export const TRIVIA_MODE_BY_ID = Object.freeze(Object.fromEntries(
  TRIVIA_MODES.map((mode) => [mode.id, mode]),
));

export const TRIVIA_FEATURED_MODE = TRIVIA_MODES.find(
  (mode) => mode.placement === TRIVIA_MODE_PLACEMENT.FEATURED,
);

export const TRIVIA_MIDDLE_MODES = Object.freeze(TRIVIA_MODES.filter(
  (mode) => mode.placement === TRIVIA_MODE_PLACEMENT.MIDDLE,
));

export const TRIVIA_QUICK_STAKES_MODE = TRIVIA_MODES.find(
  (mode) => mode.placement === TRIVIA_MODE_PLACEMENT.QUICK_STAKES,
);

export const TRIVIA_MODE_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All Modes' }),
  Object.freeze({ id: 'strategy', label: 'Strategy' }),
  Object.freeze({ id: 'knowledge', label: 'Knowledge' }),
  Object.freeze({ id: 'challenge', label: 'Challenge' }),
  Object.freeze({ id: 'competitive', label: 'Competitive' }),
]);

export const TRIVIA_MODE_FILTER_COUNTS = Object.freeze(Object.fromEntries(
  TRIVIA_MODE_FILTERS.map((filter) => [
    filter.id,
    filter.id === 'all'
      ? TRIVIA_MIDDLE_MODES.length
      : TRIVIA_MIDDLE_MODES.filter((mode) => mode.category === filter.id).length,
  ]),
));

export function getTriviaMode(modeId) {
  const key = String(modeId || '').trim().toLowerCase();
  return TRIVIA_MODE_BY_ID[key] || null;
}

export function getTriviaModeRoute(modeId) {
  return getTriviaMode(modeId)?.route || TRIVIA_LOBBY_ROUTE;
}

/**
 * Resolve the lobby launch state. Runtime capability checks may pass boolean
 * overrides later; until they do, PvP and Tournaments fail closed.
 */
export function resolveTriviaModeAvailability(modeId, overrides = undefined) {
  const mode = getTriviaMode(modeId);
  if (!mode) {
    return {
      enabled: false,
      state: TRIVIA_MODE_AVAILABILITY.MAINTENANCE,
      label: 'Unavailable',
      message: 'That Trivia Mode Is Not Available.',
    };
  }

  const override = overrides && typeof overrides[mode.id] === 'boolean'
    ? overrides[mode.id]
    : undefined;
  const enabled = override ?? mode.enabledByDefault;

  return {
    enabled,
    state: enabled
      ? TRIVIA_MODE_AVAILABILITY.LIVE
      : TRIVIA_MODE_AVAILABILITY.MAINTENANCE,
    label: enabled ? 'Live' : mode.maintenanceLabel,
    message: enabled ? '' : mode.maintenanceMessage,
  };
}
