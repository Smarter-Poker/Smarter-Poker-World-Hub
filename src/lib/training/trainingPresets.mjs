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
  plo8_scoop_quartering_defense: Object.freeze({
    id: 'plo8_scoop_quartering_defense',
    title: 'PLO8 Scoop vs. Quartering Defense (100 BB)',
    variant: 'plo8',
    bettingStructure: 'pot_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 100,
    blindsLabel: '0.5 / 1 BB (Hi-Lo 8-Or-Better)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'spot',
    targetStreet: 'flop',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Protect Nut-Low Redraws & Avoid Getting Quartered In PLO8 Split Pots',
  }),
  fixed_limit_cap_geometry: Object.freeze({
    id: 'fixed_limit_cap_geometry',
    title: 'Fixed-Limit Cap & Big-Bet Turn Transition (60 BB)',
    variant: 'nlh',
    bettingStructure: 'fixed_limit',
    format: 'cash',
    tableSize: 6,
    stackDepthBb: 60,
    blindsLabel: '1 BB Small Bet / 2 BB Big Bet (4-Raise Cap)',
    heroPosition: 'BTN',
    villainPosition: 'BB',
    opponentProfile: 'gto_baseline',
    difficulty: 'standard',
    timer: 'relaxed',
    scope: 'spot',
    targetStreet: 'turn',
    tables: '1',
    handSelection: 'all',
    coachingTiming: 'every_street',
    objective: 'Master Small-Bet To Big-Bet Street Transitions & 4-Raise Cap Equity',
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

function computeSharedPackChecksum(str = '') {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Encodes a Study Group / Coach Shared Drill Pack configuration into a compact,
 * checksum-verified URL-safe token for 1-tap permalink sharing.
 */
export function encodeSharedDrillPack(config = {}) {
  const validated = validateTrainingPreset(config).preset;
  const payload = {
    v: 1,
    t: String(config.title || config.name || validated.title || 'Study Group Drill Pack').slice(0, 72),
    g: String(config.gameId || 'cash-001'),
    vr: validated.variant,
    bs: validated.bettingStructure,
    fm: validated.format,
    sd: validated.stackDepthBb,
    pos: validated.heroPosition,
    st: validated.targetStreet,
    qc: Math.max(5, Math.min(50, Number(config.questionsCount) || 10)),
  };
  const json = JSON.stringify(payload);
  const sig = computeSharedPackChecksum(json);
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `sp1.${urlSafe}.${sig}`;
}

/**
 * Decodes and validates a Shared Drill Pack token (`sp1.<payload>.<checksum>`).
 * Returns null if tampered or malformed.
 */
export function decodeSharedDrillPack(token = '') {
  if (typeof token !== 'string' || !token.startsWith('sp1.')) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [, urlSafe, sig] = parts;
  try {
    const padded = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(padded, 'base64').toString('utf8')
      : decodeURIComponent(escape(atob(padded)));
    if (computeSharedPackChecksum(json) !== sig) return null;
    const parsed = JSON.parse(json);
    if (!parsed || parsed.v !== 1) return null;
    const validated = validateTrainingPreset({
      title: parsed.t,
      variant: parsed.vr,
      bettingStructure: parsed.bs,
      format: parsed.fm,
      stackDepthBb: parsed.sd,
      heroPosition: parsed.pos,
      targetStreet: parsed.st,
    }).preset;
    return Object.freeze({
      title: parsed.t || validated.title,
      gameId: parsed.g || 'cash-001',
      variant: validated.variant,
      bettingStructure: validated.bettingStructure,
      format: validated.format,
      stackDepthBb: validated.stackDepthBb,
      heroPosition: validated.heroPosition,
      targetStreet: validated.targetStreet,
      questionsCount: Math.max(5, Math.min(50, Number(parsed.qc) || 10)),
      summary: validated.summary,
      preset: validated,
    });
  } catch (_) {
    return null;
  }
}

/**
 * Encodes a Real-Time Co-Op Study Room & Coach Broadcast invitation token (`coop1.<payload>.<checksum>`).
 */
export function encodeCoopStudyRoom(config = {}) {
  const validated = validateTrainingPreset(config).preset;
  const payload = {
    v: 1,
    r: String(config.roomId || `room-${validated.variant}-${validated.heroPosition}-${validated.targetStreet}`).slice(0, 48),
    c: String(config.coachName || 'Club Study Host').slice(0, 40),
    t: String(config.title || `${validated.title} Co-Op Study Room`).slice(0, 72),
    g: String(config.gameId || 'cash-001'),
    vr: validated.variant,
    bs: validated.bettingStructure,
    fm: validated.format,
    sd: validated.stackDepthBb,
    pos: validated.heroPosition,
    st: validated.targetStreet,
  };
  const json = JSON.stringify(payload);
  const sig = computeSharedPackChecksum(json);
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `coop1.${urlSafe}.${sig}`;
}

/**
 * Decodes and validates a Real-Time Co-Op Study Room token (`coop1.<payload>.<checksum>`).
 */
export function decodeCoopStudyRoom(token = '') {
  if (typeof token !== 'string' || !token.startsWith('coop1.')) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [, urlSafe, sig] = parts;
  try {
    const padded = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof Buffer !== 'undefined'
      ? Buffer.from(padded, 'base64').toString('utf8')
      : decodeURIComponent(escape(atob(padded)));
    if (computeSharedPackChecksum(json) !== sig) return null;
    const parsed = JSON.parse(json);
    if (!parsed || parsed.v !== 1) return null;
    const validated = validateTrainingPreset({
      title: parsed.t,
      variant: parsed.vr,
      bettingStructure: parsed.bs,
      format: parsed.fm,
      stackDepthBb: parsed.sd,
      heroPosition: parsed.pos,
      targetStreet: parsed.st,
    }).preset;
    return Object.freeze({
      roomId: parsed.r || 'coop-study-room',
      coachName: parsed.c || 'Club Study Host',
      title: parsed.t || `${validated.title} Co-Op Study Room`,
      gameId: parsed.g || 'cash-001',
      variant: validated.variant,
      bettingStructure: validated.bettingStructure,
      format: validated.format,
      stackDepthBb: validated.stackDepthBb,
      heroPosition: validated.heroPosition,
      targetStreet: validated.targetStreet,
      summary: validated.summary,
      preset: validated,
    });
  } catch (_) {
    return null;
  }
}

/**
 * Generates a Post-Tournament / Post-Session "3-Hand Leak Receipt" with a signed Shared Drill Pack permalink.
 */
export function buildThreeHandLeakReceipt(input = {}) {
  const validated = validateTrainingPreset(input).preset;
  const gameId = String(input.gameId || (validated.format === 'mtt' ? 'mtt-005' : validated.variant === 'plo8' ? 'omaha-002' : 'cash-002'));
  const title = String(input.title || `${validated.format.toUpperCase()} ${validated.variant.toUpperCase()} 3-Hand Leak Receipt`);
  const packToken = encodeSharedDrillPack({
    title,
    gameId,
    variant: validated.variant,
    bettingStructure: validated.bettingStructure,
    format: validated.format,
    stackDepthBb: validated.stackDepthBb,
    heroPosition: validated.heroPosition,
    targetStreet: validated.targetStreet,
    questionsCount: 5,
  });
  const spots = Array.isArray(input.spots) && input.spots.length === 3
    ? input.spots
    : [
        {
          id: 'leak-spot-1',
          street: validated.targetStreet,
          position: validated.heroPosition,
          label: `${validated.heroPosition} ${validated.targetStreet.toUpperCase()} C-Bet / Probe Defense`,
          evLossBb: 1.45,
        },
        {
          id: 'leak-spot-2',
          street: 'turn',
          position: validated.heroPosition,
          label: `${validated.heroPosition} TURN Barrel & Sizing Geometry`,
          evLossBb: 1.15,
        },
        {
          id: 'leak-spot-3',
          street: 'river',
          position: validated.heroPosition,
          label: `${validated.heroPosition} RIVER Bluff-Catch & MDF Threshold`,
          evLossBb: 0.95,
        },
      ];
  const totalEvLossBb = Number(
    spots.reduce((acc, s) => acc + (Number(s?.evLossBb) || 0), 0).toFixed(2),
  );
  return Object.freeze({
    receiptId: `leak-receipt-${validated.variant}-${validated.format}-${validated.heroPosition}`.toLowerCase(),
    title,
    gameId,
    variant: validated.variant,
    bettingStructure: validated.bettingStructure,
    format: validated.format,
    heroPosition: validated.heroPosition,
    targetStreet: validated.targetStreet,
    stackDepthBb: validated.stackDepthBb,
    spots,
    totalEvLossBb,
    packToken,
    href: `/hub/training/arena/${encodeURIComponent(gameId)}?level=1&pack=${encodeURIComponent(packToken)}&source=three-hand-leak-receipt`,
  });
}

export const RANGE_PAINTER_5X5_CLUSTERS = Object.freeze([
  ['AA', 'AKs', 'AQs', 'AJs', 'ATs'],
  ['AKo', 'KK', 'KQs', 'KJs', 'KTs'],
  ['AQo', 'KQo', 'QQ', 'QJs', 'QTs'],
  ['AJo', 'KJo', 'QJo', 'JJ', 'JTs'],
  ['ATo', 'A5s', 'TT', '99', '88'],
]);

/**
 * Computes deterministic solver reference clusters & user range-reading accuracy (0-100%)
 * for the Interactive Range Matrix Painter inside the Active Table Study Drawer.
 */
export function scoreRangePainterEstimate(paintedCells = [], context = {}) {
  const street = String(context.street || 'flop').toLowerCase();
  const facingBetBb = Number(context.facingBetBb) || 0;
  const referenceSet = new Set(
    street === 'preflop'
      ? ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', 'AKs', 'AQs', 'AJs', 'ATs', 'AKo', 'AQo', 'KQs', 'QJs', 'JTs']
      : facingBetBb > 0
        ? ['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'KQs', 'QJs', 'JTs', 'A5s']
        : ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs', 'A5s'],
  );
  const paintedSet = new Set(
    (Array.isArray(paintedCells) ? paintedCells : []).map((c) => String(c || '').trim()).filter(Boolean),
  );
  const allCells = RANGE_PAINTER_5X5_CLUSTERS.flat();
  let matches = 0;
  let hits = 0;
  for (const cell of allCells) {
    const inRef = referenceSet.has(cell);
    const inPainted = paintedSet.has(cell);
    if (inRef === inPainted) matches += 1;
    if (inRef && inPainted) hits += 1;
  }
  const accuracyPct = allCells.length > 0 ? Math.round((matches / allCells.length) * 100) : 100;
  return Object.freeze({
    accuracyPct,
    paintedCount: paintedSet.size,
    referenceCount: referenceSet.size,
    overlapHits: hits,
    referenceCells: [...referenceSet],
    gradeLabel:
      accuracyPct >= 80
        ? 'Elite Range Read'
        : accuracyPct >= 64
          ? 'Solid Range Read'
          : 'Calibration Needed',
  });
}


