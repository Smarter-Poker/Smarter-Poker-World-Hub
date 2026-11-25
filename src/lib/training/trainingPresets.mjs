/**
 * CANONICAL TRAINING PRESETS & VALIDATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * Single maintained source of truth for Training Games defaults, preset
 * validation, human-readable summaries, and remembered per-account/per-game
 * preferences across all variants, betting structures, and formats:
 *   - Variants: Hold'em (nlh), PLO4 (plo4), PLO5 (plo5), PLO6 (plo6),
 *               PLO8 (plo8 = 4-Card Omaha Hi-Lo 8-or-Better, never 8-card Omaha)
 *   - Betting Structures: No-Limit (no_limit), Pot-Limit (pot_limit),
 *                         Fixed-Limit (fixed_limit)
 *   - Formats: Cash 6-Max (cash), Tournaments (mtt), Spins 3-Max (spins),
 *              Heads-Up 2-Max (hu), Full-Ring 9-Max (9max)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { TRAINING_LIBRARY } from '../../data/TRAINING_LIBRARY.js';

export const SUPPORTED_VARIANTS = Object.freeze(['nlh', 'plo4', 'plo5', 'plo6', 'plo8']);
export const SUPPORTED_STRUCTURES = Object.freeze(['no_limit', 'pot_limit', 'fixed_limit']);
export const SUPPORTED_FORMATS = Object.freeze(['cash', 'mtt', 'spins', 'hu', '9max']);

export const VARIANT_METADATA = Object.freeze({
  nlh: Object.freeze({
    id: 'nlh',
    label: "Hold'em",
    shortLabel: 'NLH',
    holeCards: 2,
    mustUseExactlyTwoHoleCards: false,
    hiLoEightOrBetter: false,
    defaultStructure: 'no_limit',
    allowedStructures: Object.freeze(['no_limit', 'pot_limit', 'fixed_limit']),
    ruleSummary: '2 Hole Cards · Best 5-Card Hand',
  }),
  plo4: Object.freeze({
    id: 'plo4',
    label: 'PLO4 Omaha',
    shortLabel: 'PLO4',
    holeCards: 4,
    mustUseExactlyTwoHoleCards: true,
    hiLoEightOrBetter: false,
    defaultStructure: 'pot_limit',
    allowedStructures: Object.freeze(['pot_limit', 'fixed_limit']),
    ruleSummary: '4 Hole Cards · Must Use Exactly 2 Hole + 3 Board Cards',
  }),
  plo5: Object.freeze({
    id: 'plo5',
    label: 'PLO5 Omaha',
    shortLabel: 'PLO5',
    holeCards: 5,
    mustUseExactlyTwoHoleCards: true,
    hiLoEightOrBetter: false,
    defaultStructure: 'pot_limit',
    allowedStructures: Object.freeze(['pot_limit', 'fixed_limit']),
    ruleSummary: '5 Hole Cards · Must Use Exactly 2 Hole + 3 Board Cards',
  }),
  plo6: Object.freeze({
    id: 'plo6',
    label: 'PLO6 Omaha',
    shortLabel: 'PLO6',
    holeCards: 6,
    mustUseExactlyTwoHoleCards: true,
    hiLoEightOrBetter: false,
    defaultStructure: 'pot_limit',
    allowedStructures: Object.freeze(['pot_limit', 'fixed_limit']),
    ruleSummary: '6 Hole Cards · Must Use Exactly 2 Hole + 3 Board Cards',
  }),
  plo8: Object.freeze({
    id: 'plo8',
    label: 'PLO8 Hi-Lo (8-Or-Better)',
    shortLabel: 'PLO8',
    holeCards: 4,
    mustUseExactlyTwoHoleCards: true,
    hiLoEightOrBetter: true,
    defaultStructure: 'pot_limit',
    allowedStructures: Object.freeze(['pot_limit', 'fixed_limit']),
    ruleSummary: '4 Hole Cards · Hi-Lo 8-Or-Better Split Pot · Exactly 2 Hole + 3 Board Cards',
  }),
});

export const STRUCTURE_METADATA = Object.freeze({
  no_limit: Object.freeze({
    id: 'no_limit',
    label: 'No-Limit',
    shortLabel: 'NL',
    legalSizingLabel: 'Min-Raise To All-In (33% / 50% / 75% / 100% / All-In)',
  }),
  pot_limit: Object.freeze({
    id: 'pot_limit',
    label: 'Pot-Limit',
    shortLabel: 'PL',
    legalSizingLabel: 'Capped At Pot + 2x Call (25% / 50% / 75% / 100% Pot)',
  }),
  fixed_limit: Object.freeze({
    id: 'fixed_limit',
    label: 'Fixed-Limit',
    shortLabel: 'FL',
    legalSizingLabel: '1 BB Small Bet (Preflop/Flop) · 2 BB Big Bet (Turn/River) · Cap 4 Raises',
  }),
});

export const FORMAT_METADATA = Object.freeze({
  cash: Object.freeze({
    id: 'cash',
    label: '6-Max Cash',
    tableSize: 6,
    defaultStackBb: 100,
    blindsLabel: '0.5 / 1 BB (No Ante)',
    positions: Object.freeze(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']),
    stageObjective: 'Chip-EV Ring Game Strategy',
  }),
  mtt: Object.freeze({
    id: 'mtt',
    label: 'MTT Tournament',
    tableSize: 8,
    defaultStackBb: 35,
    blindsLabel: '0.5 / 1 BB + 1 BB Ante',
    positions: Object.freeze(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']),
    stageObjective: 'Tournament ICM & Pay-Jump Pressure',
  }),
  spins: Object.freeze({
    id: 'spins',
    label: '3-Max Spins',
    tableSize: 3,
    defaultStackBb: 20,
    blindsLabel: '0.5 / 1 BB (Hyper-Turbo)',
    positions: Object.freeze(['BTN', 'SB', 'BB']),
    stageObjective: '3-Max Hyper-Turbo Multiplier Play',
  }),
  hu: Object.freeze({
    id: 'hu',
    label: 'Heads-Up (1v1)',
    tableSize: 2,
    defaultStackBb: 40,
    blindsLabel: '0.5 / 1 BB (BTN Is SB)',
    positions: Object.freeze(['BTN', 'BB']),
    stageObjective: '1v1 Heads-Up Wide-Range Duels',
  }),
  '9max': Object.freeze({
    id: '9max',
    label: '9-Max Full Ring',
    tableSize: 9,
    defaultStackBb: 100,
    blindsLabel: '0.5 / 1 BB (Full Ring)',
    positions: Object.freeze(['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']),
    stageObjective: 'Full-Ring Early-Position Discipline',
  }),
});

/**
 * Curated, domain-accurate presets for one-tap start across Training Games.
 */
export const TRAINING_PRESETS = Object.freeze({
  cash_nlh_6max: Object.freeze({
    id: 'cash_nlh_6max',
    title: "6-Max Hold'em Cash (100 BB)",
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Master 100 BB 6-Max Cash Game Fundamentals',
  }),
  mtt_nlh_icm: Object.freeze({
    id: 'mtt_nlh_icm',
    title: "MTT Tournament ICM (35 BB)",
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'mtt',
    tableSize: 8,
    stackDepthBb: 35,
    blindsLabel: '0.5 / 1 BB + 1 BB Ante',
    heroPosition: 'CO',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Navigate Tournament Bubble & Final Table ICM Pressure',
  }),
  mtt_short_push_fold: Object.freeze({
    id: 'mtt_short_push_fold',
    title: 'Short-Stack Push / Fold (15 BB)',
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'mtt',
    tableSize: 8,
    stackDepthBb: 15,
    blindsLabel: '0.5 / 1 BB + 1 BB Ante',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'spot',
    targetStreet: 'preflop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Execute Unexploitable 10-20 BB All-In & Reshove Ranges',
  }),
  spins_hyper_3max: Object.freeze({
    id: 'spins_hyper_3max',
    title: '3-Max Spins Hyper (20 BB)',
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'spins',
    tableSize: 3,
    stackDepthBb: 20,
    blindsLabel: '0.5 / 1 BB (3-Max Hyper)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'standard',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Dominate 3-Max Spin & Go Short-Stack Multipliers',
  }),
  hu_duel_2max: Object.freeze({
    id: 'hu_duel_2max',
    title: 'Heads-Up 1v1 Duel (40 BB)',
    variant: 'nlh',
    bettingStructure: 'no_limit',
    format: 'hu',
    tableSize: 2,
    stackDepthBb: 40,
    blindsLabel: '0.5 / 1 BB (Heads-Up)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Battle Wide Ranges In 1v1 Heads-Up Matchups',
  }),
  plo4_pot_limit_cash: Object.freeze({
    id: 'plo4_pot_limit_cash',
    title: 'PLO4 Pot-Limit Omaha (100 BB)',
    variant: 'plo4',
    bettingStructure: 'pot_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB (Pot-Limit)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: '4-Card Pot-Limit Omaha Nut Draws, Wraps & Pot Control',
  }),
  plo5_pot_limit_cash: Object.freeze({
    id: 'plo5_pot_limit_cash',
    title: 'PLO5 5-Card Omaha (100 BB)',
    variant: 'plo5',
    bettingStructure: 'pot_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB (Pot-Limit)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: '5-Card Pot-Limit Omaha Nut Advantage & Redraw Discipline',
  }),
  plo6_pot_limit_cash: Object.freeze({
    id: 'plo6_pot_limit_cash',
    title: 'PLO6 6-Card Omaha (100 BB)',
    variant: 'plo6',
    bettingStructure: 'pot_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB (Pot-Limit)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: '6-Card Pot-Limit Omaha Ultra-Nut Equity & Blocker Play',
  }),
  plo8_hilo_split: Object.freeze({
    id: 'plo8_hilo_split',
    title: 'PLO8 Hi-Lo 8-Or-Better (100 BB)',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB (Hi-Lo Split)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: '4-Card Omaha Hi-Lo 8-Or-Better Two-Way Scoop & Quartering Defense',
  }),
  fixed_limit_ring: Object.freeze({
    id: 'fixed_limit_ring',
    title: 'Fixed-Limit Ring Game (1 BB / 2 BB)',
    variant: 'nlh',
    bettingStructure: 'fixed_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 60,
    blindsLabel: '1 BB Small Bet / 2 BB Big Bet (Cap 4)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'full',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Fixed-Limit Small/Big Bet Increments & 4-Raise Cap Defense',
  }),
});

export function formatPresetSummary(preset = {}) {
  const variantMeta = VARIANT_METADATA[preset.variant] || VARIANT_METADATA.nlh;
  const structMeta = STRUCTURE_METADATA[preset.bettingStructure] || STRUCTURE_METADATA.no_limit;
  const formatMeta = FORMAT_METADATA[preset.format] || FORMAT_METADATA.cash;
  const stackBb = Number(preset.stackDepthBb) || formatMeta.defaultStackBb;
  const timerLabel = preset.timer === 'blitz'
    ? '7s Blitz Clock'
    : preset.timer === 'quick'
      ? '15s Quick Clock'
      : preset.timer === 'standard'
        ? '25s Clock'
        : 'No Timer';
  const diffLabel = preset.difficulty === 'expert'
    ? 'Expert Grading'
    : preset.difficulty === 'beginner'
      ? 'Beginner Grading'
      : 'Standard Coaching';
  return `${formatMeta.label} · ${variantMeta.label} (${structMeta.shortLabel}) · ${stackBb} BB · ${diffLabel} · ${timerLabel}`;
}

/**
 * Validates any candidate preset/config for variant, bettingStructure, and format coherence.
 * Never confuses PLO8 with 8-card Omaha and never applies No-Limit to Omaha variants.
 */
export function validateTrainingPreset(config = {}) {
  const warnings = [];
  const rawVariant = String(config.variant || 'nlh').trim().toLowerCase();
  let variant = SUPPORTED_VARIANTS.includes(rawVariant) ? rawVariant : null;
  if (!variant) {
    if (rawVariant === 'plo' || rawVariant === 'omaha') variant = 'plo4';
    else if (rawVariant === 'omaha8' || rawVariant === 'o8' || rawVariant === 'flo8') variant = 'plo8';
    else {
      warnings.push(`Unsupported variant "${rawVariant}" recovered to Hold'em (nlh).`);
      variant = 'nlh';
    }
  }

  const variantMeta = VARIANT_METADATA[variant];
  const rawStructure = String(config.bettingStructure || variantMeta.defaultStructure).trim().toLowerCase();
  let bettingStructure = SUPPORTED_STRUCTURES.includes(rawStructure)
    ? rawStructure
    : variantMeta.defaultStructure;

  // Omaha variants (PLO4, PLO5, PLO6, PLO8) are played Pot-Limit or Fixed-Limit in live rules
  if (!variantMeta.allowedStructures.includes(bettingStructure)) {
    warnings.push(
      `${variantMeta.label} uses ${variantMeta.defaultStructure.replace('_', '-')} rules; adjusted from ${bettingStructure}.`
    );
    bettingStructure = variantMeta.defaultStructure;
  }

  const rawFormat = String(config.format || config.gameType || 'cash').trim().toLowerCase();
  let format = SUPPORTED_FORMATS.includes(rawFormat) ? rawFormat : 'cash';
  if (!SUPPORTED_FORMATS.includes(rawFormat)) {
    warnings.push(`Unsupported format "${rawFormat}" recovered to 6-Max Cash.`);
  }

  const formatMeta = FORMAT_METADATA[format] || FORMAT_METADATA.cash;
  const rawStack = Number(config.stackDepthBb ?? config.stackDepth);
  const stackDepthBb = Number.isFinite(rawStack) && rawStack >= 5 && rawStack <= 300
    ? Math.round(rawStack)
    : formatMeta.defaultStackBb;

  const difficulty = ['beginner', 'standard', 'expert'].includes(String(config.difficulty || '').toLowerCase())
    ? String(config.difficulty).toLowerCase()
    : 'standard';
  const timer = ['relaxed', 'standard', 'quick', 'blitz'].includes(String(config.timer || '').toLowerCase())
    ? String(config.timer).toLowerCase()
    : 'relaxed';
  const scope = ['full', 'spot', 'street'].includes(String(config.scope || config.gameMode || '').toLowerCase())
    ? String(config.scope || config.gameMode).toLowerCase()
    : 'full';
  const targetStreet = ['preflop', 'flop', 'turn', 'river'].includes(String(config.targetStreet || '').toLowerCase())
    ? String(config.targetStreet).toLowerCase()
    : 'flop';
  const tables = ['1', '2', '4'].includes(String(config.tables || '1')) ? String(config.tables) : '1';
  const handSelection = ['all', 'no-trivial', 'close'].includes(String(config.handSelection || '').toLowerCase())
    ? String(config.handSelection).toLowerCase()
    : 'all';

  const normalized = Object.freeze({
    id: config.id || `${format}_${variant}_${bettingStructure}`,
    title: config.title || `${formatMeta.label} · ${variantMeta.label}`,
    variant,
    holeCardCount: variantMeta.holeCards,
    mustUseExactlyTwoHoleCards: variantMeta.mustUseExactlyTwoHoleCards,
    hiLoEightOrBetter: variantMeta.hiLoEightOrBetter,
    bettingStructure,
    format,
    tableSize: formatMeta.tableSize,
    stackDepthBb,
    blindsLabel: config.blindsLabel || formatMeta.blindsLabel,
    legalSizingLabel: STRUCTURE_METADATA[bettingStructure].legalSizingLabel,
    ruleSummary: variantMeta.ruleSummary,
    heroPosition: formatMeta.positions.includes(String(config.heroPosition || '').toUpperCase())
      ? String(config.heroPosition).toUpperCase()
      : 'BTN',
    villainPosition: 'BB',
    difficulty,
    timer,
    scope,
    gameMode: scope,
    targetStreet,
    tables,
    handSelection,
    coachingTiming: config.coachingTiming === 'end_of_hand' ? 'end_of_hand' : 'every_street',
    walletMutationAllowed: false,
    summary: formatPresetSummary({
      variant,
      bettingStructure,
      format,
      stackDepthBb,
      difficulty,
      timer,
    }),
  });

  return Object.freeze({
    valid: warnings.length === 0,
    warnings: Object.freeze(warnings),
    preset: normalized,
  });
}

/**
 * Resolves the exact default preset for any game in TRAINING_LIBRARY or custom request.
 */
export function resolvePresetForGame(gameOrId, overrides = {}) {
  const gameObj = typeof gameOrId === 'string'
    ? TRAINING_LIBRARY.find((g) => g.id === gameOrId) || { id: gameOrId }
    : (gameOrId || {});
  const gameId = String(gameObj.id || gameObj.slug || 'cash-001').toLowerCase();
  const category = String(gameObj.category || '').toUpperCase();

  let basePreset = TRAINING_PRESETS.cash_nlh_6max;
  if (gameId === 'mtt-015' || gameId === 'spins-004' || /heads[- ]?up/i.test(String(gameObj.name || ''))) {
    basePreset = TRAINING_PRESETS.hu_duel_2max;
  } else if (gameId.startsWith('spins-') || category === 'SPINS') {
    basePreset = TRAINING_PRESETS.spins_hyper_3max;
  } else if (['mtt-001', 'mtt-008', 'mtt-009', 'mtt-016'].includes(gameId)) {
    basePreset = TRAINING_PRESETS.mtt_short_push_fold;
  } else if (gameId.startsWith('mtt-') || category === 'MTT' || gameId === 'tournament-prep' || gameId === 'final-table-sim') {
    basePreset = TRAINING_PRESETS.mtt_nlh_icm;
  } else if (['cash-005', 'cash-015', 'mtt-018'].includes(gameId)) {
    basePreset = TRAINING_PRESETS.plo4_pot_limit_cash;
  } else if (gameId === 'cash-009') {
    basePreset = { ...TRAINING_PRESETS.cash_nlh_6max, stackDepthBb: 200, title: "Deep Stack Hold'em Cash (200 BB)" };
  } else if (gameId === 'cash-010') {
    basePreset = { ...TRAINING_PRESETS.cash_nlh_6max, stackDepthBb: 40, title: "Short Stack Hold'em Cash (40 BB)" };
  }

  const merged = {
    ...basePreset,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };
  return validateTrainingPreset(merged).preset;
}

const PREFS_KEY_PREFIX = 'sp-train-prefs-';
const RESUME_KEY = 'sp-train-last-resumable-session';

export function loadTrainingPreferences(gameId, userId = null) {
  const defaultPreset = resolvePresetForGame(gameId);
  if (typeof window === 'undefined' || !gameId) return defaultPreset;
  try {
    const scopedKey = userId ? `${PREFS_KEY_PREFIX}${userId}-${gameId}` : null;
    const raw = (scopedKey && window.localStorage.getItem(scopedKey))
      || window.localStorage.getItem(`${PREFS_KEY_PREFIX}${gameId}`);
    if (!raw) return defaultPreset;
    const parsed = JSON.parse(raw);
    return resolvePresetForGame(gameId, parsed);
  } catch (_) {
    return defaultPreset;
  }
}

export function saveTrainingPreferences(gameId, prefs = {}, userId = null) {
  const resolved = resolvePresetForGame(gameId, prefs);
  if (typeof window === 'undefined' || !gameId) return resolved;
  try {
    const payload = JSON.stringify({
      variant: resolved.variant,
      bettingStructure: resolved.bettingStructure,
      format: resolved.format,
      stackDepthBb: resolved.stackDepthBb,
      difficulty: resolved.difficulty,
      timer: resolved.timer,
      scope: resolved.scope,
      targetStreet: resolved.targetStreet,
      tables: resolved.tables,
      handSelection: resolved.handSelection,
      updatedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(`${PREFS_KEY_PREFIX}${gameId}`, payload);
    if (userId) {
      window.localStorage.setItem(`${PREFS_KEY_PREFIX}${userId}-${gameId}`, payload);
    }
  } catch (_) {
    /* ignore storage errors */
  }
  return resolved;
}

export function resetTrainingPreferences(gameId, userId = null) {
  if (typeof window !== 'undefined' && gameId) {
    try {
      window.localStorage.removeItem(`${PREFS_KEY_PREFIX}${gameId}`);
      if (userId) {
        window.localStorage.removeItem(`${PREFS_KEY_PREFIX}${userId}-${gameId}`);
      }
    } catch (_) {
      /* ignore */
    }
  }
  return resolvePresetForGame(gameId);
}

export function saveResumableTrainingSession(sessionInfo = {}, userId = null) {
  if (typeof window === 'undefined' || !sessionInfo?.gameId) return null;
  try {
    const game = TRAINING_LIBRARY.find((g) => g.id === sessionInfo.gameId);
    const preset = resolvePresetForGame(sessionInfo.gameId, sessionInfo);
    const record = {
      gameId: sessionInfo.gameId,
      gameName: sessionInfo.gameName || game?.name || 'Training Drill',
      level: Number(sessionInfo.level) || 1,
      variant: preset.variant,
      bettingStructure: preset.bettingStructure,
      format: preset.format,
      difficulty: preset.difficulty,
      timer: preset.timer,
      scope: preset.scope,
      summary: preset.summary,
      updatedAt: new Date().toISOString(),
    };
    const key = userId ? `${RESUME_KEY}-${userId}` : RESUME_KEY;
    window.localStorage.setItem(key, JSON.stringify(record));
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(record));
    return record;
  } catch (_) {
    return null;
  }
}

export function loadResumableTrainingSession(userId = null) {
  if (typeof window === 'undefined') return null;
  try {
    const key = userId ? `${RESUME_KEY}-${userId}` : RESUME_KEY;
    const raw = window.localStorage.getItem(key) || window.localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.gameId) return null;
    const game = TRAINING_LIBRARY.find((g) => g.id === parsed.gameId);
    if (!game) return null;
    const preset = resolvePresetForGame(game, parsed);
    return {
      ...parsed,
      game,
      gameName: game.name,
      summary: preset.summary,
      preset,
    };
  } catch (_) {
    return null;
  }
}
