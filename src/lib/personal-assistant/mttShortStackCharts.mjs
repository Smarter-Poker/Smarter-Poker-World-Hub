/**
 * MTT short-stack push/fold + 3-bet-pot reference (deterministic study guidance)
 *
 * PURE. ZERO DEPENDENCIES. DETERMINISTIC. NEVER TIER-1 SOLVER EVIDENCE.
 *
 * Two reference families, each with an explicit truth level so Coaching can
 * tell them apart from `solver_verified: true` training_question_cache data:
 *
 *   1. Short-stack push/fold, 8bb-20bb, UTG/HJ/CO/BTN/SB, ante + ICM bubble
 *      factor adjusted.                       truthLevel 'deterministic_icm_model'
 *   2. 3-bet pot c-bet / defense baseline by flop texture (and the SRP
 *      comparison).                           truthLevel 'deterministic_heuristic_reference'
 *
 * Both are parametric models, not solver output. Every result carries
 * `solverVerified: false` / `solver_verified: false` so it can never be
 * mistaken for (or promoted to) exact-node solver evidence.
 */

export const MTT_SHORT_STACK_VERSION = 'mtt-short-stack-v1';

export const TRUTH_LEVELS = Object.freeze({
  SOLVER_VERIFIED: 'solver_verified_tier1',
  ICM_MODEL: 'deterministic_icm_model',
  HEURISTIC_REFERENCE: 'deterministic_heuristic_reference',
  UNSUPPORTED: 'unsupported',
});

export const COVERAGE_TIERS = Object.freeze({
  SOLVER_VERIFIED: 'solver_verified',
  SOLVER_ELIGIBLE: 'solver_eligible',
  ICM_MODEL: 'deterministic_icm_model',
  HEURISTIC_REFERENCE: 'deterministic_heuristic_reference',
  UNSUPPORTED: 'unsupported',
});

export const SHORT_STACK_MIN_BB = 8;
export const SHORT_STACK_MAX_BB = 20;
export const SHORT_STACK_POSITIONS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB']);
const MAX_BUBBLE_FACTOR = 3;

// ── Baseline first-in shove ranges (% of starting hands), ante-less, chip-EV ──
// Anchored at 8/10/12/15/20bb and linearly interpolated between anchors.
const ANCHOR_STACKS = Object.freeze([8, 10, 12, 15, 20]);
const BASE_PUSH_PCT = Object.freeze({
  UTG: Object.freeze([20, 16, 13, 10, 8]),
  HJ: Object.freeze([26, 21, 17, 13, 10]),
  CO: Object.freeze([35, 28, 22, 17, 13]),
  BTN: Object.freeze([52, 43, 35, 27, 21]),
  SB: Object.freeze([70, 58, 48, 38, 29]),
});

const DEFAULT_TABLE_SIZE = 9;
const ANTE_WIDEN_PER_DEAD_BB = 0.35 / 1.5; // widen 35% when ante-dead money equals the blinds
const MAX_WIDEN_FACTOR = 1.6;

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function normalizeShortStackPosition(position) {
  const raw = String(position || '').trim().toUpperCase().replace(/\s+/g, '');
  if (raw === 'BU' || raw === 'BUTTON' || raw === 'DEALER') return 'BTN';
  if (raw === 'CUTOFF') return 'CO';
  if (raw === 'HIJACK') return 'HJ';
  if (raw === 'SMALLBLIND') return 'SB';
  if (raw === 'UTG+1' || raw === 'UTG1' || raw === 'MP' || raw === 'LJ' || raw === 'LOJACK') return 'HJ';
  return SHORT_STACK_POSITIONS.includes(raw) ? raw : null;
}

function interpolate(position, stackBb) {
  const series = BASE_PUSH_PCT[position];
  if (stackBb <= ANCHOR_STACKS[0]) return series[0];
  for (let i = 1; i < ANCHOR_STACKS.length; i += 1) {
    if (stackBb <= ANCHOR_STACKS[i]) {
      const lo = ANCHOR_STACKS[i - 1];
      const hi = ANCHOR_STACKS[i];
      const t = (stackBb - lo) / (hi - lo);
      return series[i - 1] + (series[i] - series[i - 1]) * t;
    }
  }
  return series[series.length - 1];
}

function unsupportedPushFold(reason, extra = {}) {
  return {
    supported: false,
    reason,
    truthLevel: TRUTH_LEVELS.UNSUPPORTED,
    solverVerified: false,
    solver_verified: false,
    modelVersion: MTT_SHORT_STACK_VERSION,
    ...extra,
  };
}

/**
 * Deterministic first-in shove frequency for one position/stack.
 * `anteBb` is the ante PER PLAYER in big blinds (a 9-handed big-blind ante of
 * one full BB is `anteBb: 1, tableSize: 9, bigBlindAnte: true`).
 * `bubbleFactor` >= 1 is the ICM risk premium (1 = chip EV); it tightens the range.
 */
export function pushRangePercent({
  position,
  stackBb,
  anteBb = 0,
  bubbleFactor = 1,
  tableSize = DEFAULT_TABLE_SIZE,
  bigBlindAnte = false,
} = {}) {
  const pos = normalizeShortStackPosition(position);
  if (!pos) return unsupportedPushFold('position_not_covered', { position: position ?? null });
  const stack = finite(stackBb);
  if (stack === null || stack < SHORT_STACK_MIN_BB || stack > SHORT_STACK_MAX_BB) {
    return unsupportedPushFold('stack_outside_8_to_20bb', { position: pos, stackBb: stack });
  }
  const ante = Math.max(0, finite(anteBb) ?? 0);
  const players = Math.max(2, Math.min(10, Math.round(finite(tableSize) ?? DEFAULT_TABLE_SIZE)));
  const anteDeadBb = bigBlindAnte ? ante : ante * players;
  const widen = Math.min(MAX_WIDEN_FACTOR, 1 + anteDeadBb * ANTE_WIDEN_PER_DEAD_BB);
  const requestedBubble = finite(bubbleFactor);
  const bubble = Math.min(MAX_BUBBLE_FACTOR, Math.max(1, requestedBubble ?? 1));
  const tighten = 1 + 0.8 * (bubble - 1);

  const base = interpolate(pos, stack);
  const pct = Math.max(1, Math.min(100, (base * widen) / tighten));
  return {
    supported: true,
    position: pos,
    stackBb: stack,
    anteBb: ante,
    anteDeadBb: round1(anteDeadBb),
    bubbleFactorApplied: bubble,
    icmAdjusted: bubble > 1,
    baselinePushRangePct: round1(base),
    pushRangePct: round1(pct),
    truthLevel: TRUTH_LEVELS.ICM_MODEL,
    solverVerified: false,
    solver_verified: false,
    modelVersion: MTT_SHORT_STACK_VERSION,
  };
}

// ── Hand ranking (deterministic, Chen-style score with stable tie-breaks) ─────

const RANKS = '23456789TJQKA';
const RANK_VALUE = Object.freeze(Object.fromEntries([...RANKS].map((ch, index) => [ch, index + 2])));

function chenScore(high, low, suited) {
  const points = rank => (rank === 14 ? 10 : rank === 13 ? 8 : rank === 12 ? 7 : rank === 11 ? 6 : rank / 2);
  let score = points(high);
  if (high === low) return Math.max(5, score * 2);
  if (suited) score += 2;
  const gap = high - low - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  if (gap <= 1 && high < 12) score += 1;
  score += points(low) * 0.15; // keep A5s > A2s style ordering stable
  return score;
}

function buildHandTable() {
  const hands = [];
  for (let i = 12; i >= 0; i -= 1) {
    for (let j = i; j >= 0; j -= 1) {
      const high = RANKS[i];
      const low = RANKS[j];
      if (i === j) {
        hands.push({ hand: `${high}${low}`, combos: 6, score: chenScore(i + 2, j + 2, false) });
      } else {
        hands.push({ hand: `${high}${low}s`, combos: 4, score: chenScore(i + 2, j + 2, true) });
        hands.push({ hand: `${high}${low}o`, combos: 12, score: chenScore(i + 2, j + 2, false) });
      }
    }
  }
  hands.sort((a, b) => b.score - a.score || RANK_VALUE[b.hand[0]] - RANK_VALUE[a.hand[0]]
    || RANK_VALUE[b.hand[1]] - RANK_VALUE[a.hand[1]] || a.hand.localeCompare(b.hand));
  let cumulative = 0;
  return hands.map((entry, index) => {
    cumulative += entry.combos;
    return { ...entry, rank: index + 1, cumulativePct: round1((cumulative / 1326) * 100) };
  });
}

const HAND_TABLE = Object.freeze(buildHandTable());
const HAND_INDEX = new Map(HAND_TABLE.map(entry => [entry.hand, entry]));

/** Normalize 'AKs' / 'AhKd' / ['Ah','Kd'] / 'KA' to a canonical hand class like 'AKo'. */
export function normalizeHandClass(input) {
  let cards = null;
  if (Array.isArray(input)) cards = input.map(String);
  else if (typeof input === 'string') {
    const compact = input.replace(/[\s,\[\]]+/g, '');
    if (/^[AKQJT2-9]{2}[so]?$/i.test(compact)) {
      const a = compact[0].toUpperCase();
      const b = compact[1].toUpperCase();
      const suffix = compact[2] ? compact[2].toLowerCase() : '';
      if (a === b) return `${a}${b}`;
      const [hi, lo] = RANK_VALUE[a] >= RANK_VALUE[b] ? [a, b] : [b, a];
      return suffix ? `${hi}${lo}${suffix}` : null;
    }
    cards = compact.match(/(?:10|[AKQJT2-9])[shdc]/gi);
  }
  if (!cards || cards.length !== 2) return null;
  const parsed = cards.map(card => {
    const match = String(card).trim().match(/^(10|[AKQJT2-9])([shdc])$/i);
    if (!match) return null;
    return { rank: match[1] === '10' ? 'T' : match[1].toUpperCase(), suit: match[2].toLowerCase() };
  });
  if (parsed.some(item => !item)) return null;
  const [first, second] = parsed;
  if (first.rank === second.rank) return first.suit === second.suit ? null : `${first.rank}${second.rank}`;
  const [hi, lo] = RANK_VALUE[first.rank] >= RANK_VALUE[second.rank] ? [first, second] : [second, first];
  return `${hi.rank}${lo.rank}${hi.suit === lo.suit ? 's' : 'o'}`;
}

/** Hand classes inside the top `pct` percent of starting hands (by combos). */
export function pushRangeHands(pct) {
  const limit = Math.max(0, Math.min(100, finite(pct) ?? 0));
  // A hand is in the range when the midpoint of its combo slice is inside the
  // percentage; evaluatePushFoldSpot uses the identical rule.
  return HAND_TABLE
    .filter(entry => entry.cumulativePct - ((entry.combos / 1326) * 100) / 2 <= limit)
    .map(entry => entry.hand);
}

/** Full chart for one stack depth: every covered position. */
export function getPushFoldChart({ stackBb, anteBb = 0, bubbleFactor = 1, tableSize = DEFAULT_TABLE_SIZE, bigBlindAnte = false } = {}) {
  const stack = finite(stackBb);
  if (stack === null || stack < SHORT_STACK_MIN_BB || stack > SHORT_STACK_MAX_BB) {
    return unsupportedPushFold('stack_outside_8_to_20bb', { stackBb: stack, positions: [] });
  }
  const positions = SHORT_STACK_POSITIONS.map(position => {
    const row = pushRangePercent({ position, stackBb: stack, anteBb, bubbleFactor, tableSize, bigBlindAnte });
    return { ...row, action: 'push_range', hands: pushRangeHands(row.pushRangePct) };
  });
  return {
    supported: true,
    stackBb: stack,
    anteBb: Math.max(0, finite(anteBb) ?? 0),
    bubbleFactorApplied: positions[0].bubbleFactorApplied,
    positions,
    truthLevel: TRUTH_LEVELS.ICM_MODEL,
    solverVerified: false,
    solver_verified: false,
    modelVersion: MTT_SHORT_STACK_VERSION,
  };
}

/**
 * Evaluate one first-in decision. Returns an explicit `action` ('push' | 'fold'),
 * or 'range_only' when no hero hand was supplied.
 */
export function evaluatePushFoldSpot({ heroHand = null, ...spot } = {}) {
  const range = pushRangePercent(spot);
  if (range.supported !== true) return { ...range, action: null };
  if (heroHand === null || heroHand === undefined || heroHand === '') {
    return { ...range, action: 'range_only', handClass: null, handPercentile: null };
  }
  const handClass = normalizeHandClass(heroHand);
  const entry = handClass ? HAND_INDEX.get(handClass) : null;
  if (!entry) return { ...range, action: null, supported: false, reason: 'hand_not_recognized', handClass };
  const shoves = entry.cumulativePct - (entry.combos / 1326) * 100 / 2 <= range.pushRangePct;
  return {
    ...range,
    handClass,
    handPercentile: entry.cumulativePct,
    action: shoves ? 'push' : 'fold',
    marginPct: round1(range.pushRangePct - entry.cumulativePct),
  };
}

// ── 3-bet pot postflop reference (heuristic study baseline) ───────────────────

export const THREE_BET_POT_TEXTURES = Object.freeze(['dry_high_card', 'monotone', 'paired', 'low_connected', 'mixed_mid']);

function parseBoardCard(card) {
  const match = String(card || '').trim().match(/^(10|[AKQJT2-9])([shdc])$/i);
  if (!match) return null;
  return { rank: RANK_VALUE[match[1] === '10' ? 'T' : match[1].toUpperCase()], suit: match[2].toLowerCase() };
}

/** Classify a flop (3 cards, any of 'Ah' / '10h' forms) into a reference texture. */
export function classifyThreeBetPotTexture(board) {
  const cards = (Array.isArray(board) ? board : String(board || '').match(/(?:10|[AKQJT2-9])[shdc]/gi) || [])
    .slice(0, 3).map(parseBoardCard);
  if (cards.length < 3 || cards.some(card => !card)) return { supported: false, reason: 'flop_required', texture: null };
  const ranks = cards.map(card => card.rank).sort((a, b) => b - a);
  const suitCounts = cards.reduce((map, card) => map.set(card.suit, (map.get(card.suit) || 0) + 1), new Map());
  const maxSuit = Math.max(...suitCounts.values());
  const paired = new Set(ranks).size < 3;
  const span = ranks[0] - ranks[2];
  let texture;
  if (maxSuit === 3) texture = 'monotone';
  else if (paired) texture = 'paired';
  else if (ranks[0] <= 9 && span <= 4) texture = 'low_connected';
  else if (ranks[0] >= 12 && span >= 5) texture = 'dry_high_card';
  else texture = 'mixed_mid';
  return { supported: true, texture, flushDraw: maxSuit === 2, highCard: ranks[0], span };
}

// [cbet frequency %, preferred size % pot] for the preflop aggressor.
const AGGRESSOR_BASELINE = Object.freeze({
  srp: Object.freeze({
    dry_high_card: { cbetFreqPct: [65, 80], sizePctPot: [25, 33] },
    monotone: { cbetFreqPct: [35, 50], sizePctPot: [25, 33] },
    paired: { cbetFreqPct: [65, 80], sizePctPot: [25, 33] },
    low_connected: { cbetFreqPct: [35, 50], sizePctPot: [50, 75] },
    mixed_mid: { cbetFreqPct: [45, 60], sizePctPot: [33, 50] },
  }),
  '3bp': Object.freeze({
    dry_high_card: { cbetFreqPct: [75, 90], sizePctPot: [20, 33] },
    monotone: { cbetFreqPct: [25, 40], sizePctPot: [20, 33] },
    paired: { cbetFreqPct: [70, 85], sizePctPot: [20, 33] },
    low_connected: { cbetFreqPct: [30, 45], sizePctPot: [33, 50] },
    mixed_mid: { cbetFreqPct: [45, 60], sizePctPot: [25, 40] },
  }),
});

// [continue vs c-bet % (call + raise), check-raise %] for the preflop caller.
const DEFENDER_BASELINE = Object.freeze({
  srp: Object.freeze({
    dry_high_card: { continuePct: [40, 55], checkRaisePct: [6, 10] },
    monotone: { continuePct: [45, 60], checkRaisePct: [4, 8] },
    paired: { continuePct: [35, 50], checkRaisePct: [5, 9] },
    low_connected: { continuePct: [55, 70], checkRaisePct: [9, 14] },
    mixed_mid: { continuePct: [45, 60], checkRaisePct: [7, 11] },
  }),
  '3bp': Object.freeze({
    dry_high_card: { continuePct: [45, 60], checkRaisePct: [4, 8] },
    monotone: { continuePct: [50, 65], checkRaisePct: [3, 6] },
    paired: { continuePct: [40, 55], checkRaisePct: [3, 6] },
    low_connected: { continuePct: [55, 70], checkRaisePct: [7, 12] },
    mixed_mid: { continuePct: [50, 65], checkRaisePct: [5, 9] },
  }),
});

function sprBucket(spr) {
  const value = finite(spr);
  if (value === null || value <= 0) return null;
  if (value <= 2) return 'low';
  if (value <= 5) return 'medium';
  return 'high';
}

/**
 * Study baseline for a flop in a single-raised or 3-bet pot.
 * `role`: 'aggressor' (the preflop raiser / 3-bettor) or 'defender' (the caller).
 * NEVER solver evidence: truthLevel is the heuristic reference and
 * `solver_verified` is always false.
 */
export function threeBetPotReference({ potType = '3bp', board, role = 'aggressor', spr = null } = {}) {
  const normalizedPot = String(potType).toLowerCase().replace(/[^a-z0-9]/g, '');
  const pot = normalizedPot === 'srp' ? 'srp' : (normalizedPot === '3bp' || normalizedPot === '3bet' || normalizedPot === '3betpot') ? '3bp' : null;
  if (!pot) return { supported: false, reason: 'pot_type_not_covered', truthLevel: TRUTH_LEVELS.UNSUPPORTED, solverVerified: false, solver_verified: false };
  const roleKey = String(role).toLowerCase() === 'defender' ? 'defender' : 'aggressor';
  const classified = classifyThreeBetPotTexture(board);
  if (!classified.supported) {
    return { supported: false, reason: classified.reason, truthLevel: TRUTH_LEVELS.UNSUPPORTED, solverVerified: false, solver_verified: false };
  }
  const table = roleKey === 'aggressor' ? AGGRESSOR_BASELINE : DEFENDER_BASELINE;
  return {
    supported: true,
    potType: pot,
    role: roleKey,
    texture: classified.texture,
    flushDraw: classified.flushDraw,
    sprBucket: sprBucket(spr),
    guidance: { ...table[pot][classified.texture] },
    truthLevel: TRUTH_LEVELS.HEURISTIC_REFERENCE,
    referenceOnly: true,
    solverVerified: false,
    solver_verified: false,
    modelVersion: MTT_SHORT_STACK_VERSION,
  };
}

// ── Coverage hints for the Coaching Workspace ─────────────────────────────────

const UNSUPPORTED_VARIANT_RE = /\b(plo|plo4|plo5|plo6|omaha|short[\s_-]*deck|6\+|hi[\s_-]*lo)\b/i;

/**
 * Where does study guidance for this spot come from?
 *
 *   solver_verified                 -> the decision row is exact-node solver evidence
 *   deterministic_icm_model         -> MTT 8-20bb first-in push/fold model (this module)
 *   deterministic_heuristic_reference -> 3-bet pot flop baseline (this module)
 *   unsupported                     -> PLO / Short Deck / multiway limped: no honest guidance
 *   solver_eligible                 -> an exact solver match could price it; none has yet
 */
export function describeCoverageTier(spot = {}) {
  const variantText = String(spot.variant || spot.gameVariant || spot.game_id || spot.gameId || '');
  const spotType = String(spot.spotType ?? spot.spot_type ?? '').toLowerCase();
  const street = String(spot.street || '').toLowerCase();
  const format = String(spot.format || '').toLowerCase();
  const isTournament = format.includes('tournament') || format.includes('mtt');
  const stackBucket = String(spot.stackBucket ?? spot.stack_bucket ?? '').toLowerCase();
  const stackBb = finite(spot.stackBb ?? spot.stack_bb);
  const entry = (tier, truthLevel, label, studyGuidance) => ({
    tier,
    truthLevel,
    label,
    studyGuidance,
    solverVerified: tier === COVERAGE_TIERS.SOLVER_VERIFIED,
  });

  if (spot.solverVerified === true || spot.solver_verified === true) {
    return entry(COVERAGE_TIERS.SOLVER_VERIFIED, TRUTH_LEVELS.SOLVER_VERIFIED, 'Solver Verified',
      'Graded against an exact solver node.');
  }
  if (UNSUPPORTED_VARIANT_RE.test(variantText)) {
    return entry(COVERAGE_TIERS.UNSUPPORTED, TRUTH_LEVELS.UNSUPPORTED, 'Unsupported Format',
      'Only No-Limit Hold\'em is graded. Omaha and Short Deck hands are never scored against NLHE solver data.');
  }
  if (/multiway|multi-way|limped/.test(spotType) || spot.multiway === true || spot.limped === true) {
    return entry(COVERAGE_TIERS.UNSUPPORTED, TRUTH_LEVELS.UNSUPPORTED, 'Unsupported Format',
      'Multiway and limped pots have no solved baseline here, so they are not scored.');
  }
  const shortStack = stackBucket === 'short' || (stackBb !== null && stackBb >= SHORT_STACK_MIN_BB && stackBb <= SHORT_STACK_MAX_BB);
  if (isTournament && street === 'preflop' && shortStack) {
    return entry(COVERAGE_TIERS.ICM_MODEL, TRUTH_LEVELS.ICM_MODEL, 'ICM Study Model',
      'Use the 8-20bb push/fold chart with your ante and bubble factor. It is a deterministic model, not a solver result.');
  }
  if (street === 'flop' && /3[\s_-]*bet|three[\s_-]*bet|4[\s_-]*bet/.test(spotType)) {
    return entry(COVERAGE_TIERS.HEURISTIC_REFERENCE, TRUTH_LEVELS.HEURISTIC_REFERENCE, '3-Bet Pot Study Baseline',
      'Compare against the 3-bet pot c-bet and defense baseline for this flop texture. It is a heuristic reference, not a solver result.');
  }
  return entry(COVERAGE_TIERS.SOLVER_ELIGIBLE, null, 'Awaiting Solver Coverage',
    'This NLHE spot could be priced by an exact solver match, but none exists yet.');
}

export default {
  MTT_SHORT_STACK_VERSION,
  TRUTH_LEVELS,
  COVERAGE_TIERS,
  pushRangePercent,
  pushRangeHands,
  getPushFoldChart,
  evaluatePushFoldSpot,
  normalizeHandClass,
  classifyThreeBetPotTexture,
  threeBetPotReference,
  describeCoverageTier,
};
