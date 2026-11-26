/**
 * HORSE BRAIN & PLO BRAIN TRAINING ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════
 * Bridges Smarter.Poker's production AI brain modules (`src/lib/poker-engine/brain/`)
 * directly into the Training Hub scenario generator, `Train This Hand` live-hand
 * drill builder, variant selector (`nlh`, `plo4`, `plo5`, `plo6`), and post-answer
 * coaching feedback.
 *
 * Modules consumed at runtime:
 * - `core.js`: `parseCards`, `formatHandString`, `getPreflopStrength`
 * - `holdem-brain.js`: `makeFallbackDecision`, `evaluatePostflopHand`,
 *   `evaluateBoardWetness`, `getDrawEquity`, `getRangeAdvantage`, `getCBetStrategy`
 * - `plo-core.js`: `classifyPLOPreflop`, `evaluatePLOMadeHand`,
 *   `getBestPLO5or6MadeHand`, `countStraightOuts`, `countFlushOuts`,
 *   `detectPLOWrapDraw`, `analyzePLOBoardTexture`, `calcPLOBetSize`,
 *   `makePLOFallbackDecision`
 * - `plo5-brain.js`: `scorePLO5Hand`, `getPLO5PreflopAction`,
 *   `adjustPLO5PostflopStrength`, `classifyPLO5Draws`,
 *   `evaluatePLO5FlushHierarchy`, `makePLO5Decision`
 * - `plo6-brain.js`: `scorePLO6Hand`, `getPLO6PreflopAction`,
 *   `adjustPLO6PostflopStrength`, `classifyPLO6Draws`,
 *   `evaluatePLO6FlushHierarchy`, `getPLO6BlockerValue`, `makePLO6Decision`
 * - `tournament-brain.js`: `detectTournamentStage`, `getICMRangeAdjustment`,
 *   `adjustTournamentPostflop`, `getBubbleFactor`
 */

import brainCore from '../poker-engine/brain/core.js';
import holdemBrain from '../poker-engine/brain/holdem-brain.js';
import ploCore from '../poker-engine/brain/plo-core.js';
import plo5Brain from '../poker-engine/brain/plo5-brain.js';
import plo6Brain from '../poker-engine/brain/plo6-brain.js';
import plo8Brain from '../poker-engine/brain/plo8-brain.js';
import tournamentBrain from '../poker-engine/brain/tournament-brain.js';
import { buildCustomTrainingArenaHref } from './customTrainingLaunchContract.mjs';
import {
  computeLegalBettingBounds,
  normalizeBettingStructure,
  normalizeGameFormat,
  isHiLoVariant,
} from './clubArenaTableParity.js';

export { buildCustomTrainingArenaHref };

const {
  RANKS,
  parseCard,
  parseCards,
  formatHandString,
  getPreflopStrength,
} = brainCore;

const {
  makeFallbackDecision,
  evaluatePostflopHand,
  evaluateBoardWetness,
  getDrawEquity,
  getRangeAdvantage,
  getCBetStrategy,
} = holdemBrain;

const {
  classifyPLOPreflop,
  evaluatePLOMadeHand,
  getBestPLO5or6MadeHand,
  countStraightOuts,
  countFlushOuts,
  detectPLOWrapDraw,
  analyzePLOBoardTexture,
  calcPLOBetSize,
  makePLOFallbackDecision,
} = ploCore;

const {
  scorePLO5Hand,
  getPLO5PreflopAction,
  adjustPLO5PostflopStrength,
  classifyPLO5Draws,
  evaluatePLO5FlushHierarchy,
  makePLO5Decision,
} = plo5Brain;

const {
  scorePLO6Hand,
  getPLO6PreflopAction,
  adjustPLO6PostflopStrength,
  classifyPLO6Draws,
  evaluatePLO6FlushHierarchy,
  getPLO6BlockerValue,
  makePLO6Decision,
} = plo6Brain;

const { evaluatePLO8Low } = plo8Brain;

const {
  detectTournamentStage,
  getICMRangeAdjustment,
  adjustTournamentPostflop,
  getBubbleFactor,
} = tournamentBrain;

export const EXPECTED_HOLE_CARDS_BY_VARIANT = Object.freeze({
  nlh: 2,
  plo4: 4,
  plo5: 5,
  plo6: 6,
  plo8: 4,
});

export function normalizeVariant(variantRaw = 'nlh') {
  const v = String(variantRaw || 'nlh').trim().toLowerCase();
  if (
    v === 'plo8' ||
    v === 'omaha8' ||
    v === 'omaha_hi_lo' ||
    v === 'plo_hilo' ||
    v === 'plo-hi-lo' ||
    v === 'flo8' ||
    v === 'o8' ||
    v === 'omaha_hilo'
  ) {
    return 'plo8';
  }
  if (v === 'plo6' || v === '6-card-plo' || v === 'plo-6' || v === 'omaha6') return 'plo6';
  if (v === 'plo5' || v === '5-card-plo' || v === 'plo-5' || v === 'omaha5') return 'plo5';
  if (v === 'plo' || v === 'plo4' || v === '4-card-plo' || v === 'plo-4' || v === 'omaha' || v === 'omaha4' || v === 'flo') {
    return 'plo4';
  }
  if (v === 'nlh' || v === 'holdem' || v === 'nlhe' || v === 'flh') return 'nlh';
  return v;
}

export const EXPECTED_BOARD_CARDS_BY_STREET = Object.freeze({
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
});

/**
 * Deterministic runtime-state helper for training surfaces consuming the
 * Horse Brain & PLO Brain adapter. Resolves `offline`, `authExpiry`,
 * `loading`, `empty`, `error`, `retry`, `stale`, and `success` states.
 */
export function getTrainingAdapterRuntimeState({
  statusCode = 200,
  error = null,
  isLoading = false,
  isEmpty = false,
  retryCount = 0,
  isStale = false,
} = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }
  if (statusCode === 401 || /unauthorized|authentication expired|session expired|sign in/i.test(String(error || ''))) {
    return 'authExpiry';
  }
  if (isLoading) {
    return 'loading';
  }
  if (error) {
    return retryCount > 0 ? 'retry' : 'error';
  }
  if (isEmpty) {
    return 'empty';
  }
  if (isStale) {
    return 'stale';
  }
  return 'success';
}

const CARD_REGEX = /^[2-9TJQKA][shdc]$/i;

function normalizeCardToken(card) {
  if (typeof card !== 'string') return null;
  const trimmed = card.trim();
  if (!CARD_REGEX.test(trimmed)) return null;
  return `${trimmed[0].toUpperCase()}${trimmed[1].toLowerCase()}`;
}

function deterministicSeedFromState(parts) {
  const text = parts.join('|');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function withDeterministicRandom(seedParts, fn) {
  const origRandom = Math.random;
  let state = deterministicSeedFromState(seedParts);
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) / 16777216;
  };
  try {
    return fn();
  } finally {
    Math.random = origRandom;
  }
}

/**
 * Validates card count, card format, duplicate-card absence across hero and
 * board, and computes authoritative Pot-Limit / No-Limit bet and raise bounds.
 */
export function validateDealAndPotLimitBounds({
  variant = 'nlh',
  street = 'flop',
  heroCards = [],
  boardCards = [],
  pot = 6.5,
  toCall = 0,
  effectiveStack = 100,
  bettingStructure = null,
  format = 'cash',
} = {}) {
  const normVariant = normalizeVariant(variant);
  const expectedHoleCount = EXPECTED_HOLE_CARDS_BY_VARIANT[normVariant];
  if (!expectedHoleCount) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VARIANT',
      error: `Unsupported variant: ${variant}`,
    };
  }

  const normStreet = String(street || 'flop').trim().toLowerCase();
  const expectedBoardCount = EXPECTED_BOARD_CARDS_BY_STREET[normStreet];
  if (expectedBoardCount === undefined) {
    return {
      ok: false,
      code: 'UNSUPPORTED_STREET',
      error: `Unsupported street: ${street}`,
    };
  }

  if (!Array.isArray(heroCards) || heroCards.length !== expectedHoleCount) {
    return {
      ok: false,
      code: 'INVALID_HOLE_CARD_COUNT',
      error: `Variant ${normVariant.toUpperCase()} requires exactly ${expectedHoleCount} hole cards (received ${Array.isArray(heroCards) ? heroCards.length : 0}).`,
    };
  }

  if (!Array.isArray(boardCards) || boardCards.length !== expectedBoardCount) {
    return {
      ok: false,
      code: 'INVALID_BOARD_CARD_COUNT',
      error: `Street ${normStreet} requires exactly ${expectedBoardCount} board cards (received ${Array.isArray(boardCards) ? boardCards.length : 0}).`,
    };
  }

  const normalizedHero = heroCards.map(normalizeCardToken);
  const normalizedBoard = boardCards.map(normalizeCardToken);
  if (normalizedHero.some((c) => !c) || normalizedBoard.some((c) => !c)) {
    return {
      ok: false,
      code: 'MALFORMED_CARD_TOKEN',
      error: 'One or more hero or board cards are malformed.',
    };
  }

  const allCards = [...normalizedHero, ...normalizedBoard];
  const uniqueCards = new Set(allCards.map((c) => c.toLowerCase()));
  if (uniqueCards.size !== allCards.length) {
    return {
      ok: false,
      code: 'DUPLICATE_CARD_DETECTED',
      error: 'Duplicate card detected across hero hole cards and board cards.',
    };
  }

  const numericPot = Math.max(0.5, Number(pot) || 6.5);
  const numericToCall = Math.max(0, Number(toCall) || 0);
  const numericStack = Math.max(1, Number(effectiveStack) || 100);
  const activeBettingStructure = normalizeBettingStructure(bettingStructure, variant);
  const normFormat = normalizeGameFormat(format);
  const isFixedLimit = activeBettingStructure === 'fixed_limit';
  const isPotLimit = activeBettingStructure === 'pot_limit';

  const legalBounds = computeLegalBettingBounds({
    variant: normVariant,
    street: normStreet,
    potBb: numericPot,
    heroStackBb: numericStack,
    heroCommittedBb: 0,
    facingBetBb: numericToCall,
    bettingStructure: activeBettingStructure,
  });

  // Pot-Limit rule: max total bet/raise = current pot + 2 * callAmount, capped at effectiveStack
  const rawMaxPotAction = Number((numericPot + 2 * numericToCall).toFixed(2));
  const maxPotBetOrRaise = isFixedLimit
    ? legalBounds.minRaiseToBb
    : Number(Math.min(numericStack, rawMaxPotAction).toFixed(2));
  const halfPotBetOrRaise = Number(Math.min(numericStack, Math.max(1, (numericPot + numericToCall) * 0.5 + numericToCall)).toFixed(2));
  const twoThirdsPotBetOrRaise = Number(Math.min(numericStack, Math.max(1, (numericPot + numericToCall) * 0.67 + numericToCall)).toFixed(2));
  const thirdPotBet = Number(Math.min(numericStack, Math.max(1, numericPot * 0.33)).toFixed(2));
  const threeQuarterPotBet = Number(Math.min(numericStack, Math.max(1, numericPot * 0.75)).toFixed(2));

  return {
    ok: true,
    variant: normVariant,
    street: normStreet,
    bettingStructure: activeBettingStructure,
    format: normFormat,
    heroCards: normalizedHero,
    boardCards: normalizedBoard,
    pot: numericPot,
    toCall: numericToCall,
    effectiveStack: numericStack,
    isPotLimit,
    isFixedLimit,
    isHiLo: isHiLoVariant(normVariant),
    legalBounds,
    potLimitBounds: {
      formula: isFixedLimit
        ? 'fixedLimit = smallBet (1 BB preflop/flop) or bigBet (2 BB turn/river)'
        : 'maxRaise = min(effectiveStack, pot + 2 * callAmount)',
      rawMaxPotAction,
      maxPotBetOrRaise,
      maxBetBb: maxPotBetOrRaise,
      threeQuarterPotBet,
      twoThirdsPotBetOrRaise,
      halfPotBetOrRaise,
      thirdPotBet,
      fixedIncrementBb: legalBounds.fixedIncrementBb,
    },
  };
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Finds the highest-strength 2-card subset notation (e.g. "AA", "AKs") from
 * a 2, 4, 5, or 6 card hand using `core.js` `getPreflopStrength` and `formatHandString`.
 */
export function resolvePrimaryTwoCardSubset(heroCards = []) {
  const normalized = (heroCards || []).map(normalizeCardToken).filter(Boolean);
  if (normalized.length < 2) return { notation: 'AA', cards: normalized, strength: 50 };
  if (normalized.length === 2) {
    const notation = formatHandString(normalized[0], normalized[1]);
    return {
      notation,
      cards: normalized,
      strength: getPreflopStrength(notation),
    };
  }
  const pairs = combinations(normalized, 2);
  let best = null;
  for (const pair of pairs) {
    const notation = formatHandString(pair[0], pair[1]);
    const strength = getPreflopStrength(notation);
    if (!best || strength > best.strength) {
      best = { notation, cards: pair, strength };
    }
  }
  return best || { notation: 'AKs', cards: normalized.slice(0, 2), strength: 75 };
}

/**
 * Evaluates an Omaha hand strictly using the 2-hole-card + 3-board-card rule
 * via `plo-core.js` (`getBestPLO5or6MadeHand`, `evaluatePLOMadeHand`,
 * `countFlushOuts`, `countStraightOuts`, `detectPLOWrapDraw`).
 */
export function evaluateOmahaExactTwoPlusThree(heroCards = [], boardCards = []) {
  const parsedHero = parseCards(heroCards);
  const parsedBoard = parseCards(boardCards);
  const primarySubset = resolvePrimaryTwoCardSubset(heroCards);

  if (parsedBoard.length < 3) {
    return {
      madeHand: { strength: primarySubset.strength, category: 'preflop', isNut: false, isMade: false },
      bestTwoHoleCards: primarySubset.cards,
      bestThreeBoardCards: [],
      flushDraw: { outs: 0, isNutFlushDraw: false },
      straightDraw: { outs: 0, type: 'none', hasNutStraightDraw: false },
      wrapDraw: { wrapType: 'none', wrapOuts: 0, isWrap: false, wrapStrength: 0 },
      primaryTwoCardSubset: primarySubset.notation,
    };
  }

  const madeHand = parsedHero.length > 4
    ? getBestPLO5or6MadeHand(parsedHero, parsedBoard)
    : evaluatePLOMadeHand(parsedHero, parsedBoard);

  // Identify the exact 2 hole cards + 3 board cards that produce this best Omaha hand
  let bestCombo = {
    twoHole: heroCards.slice(0, 2),
    threeBoard: boardCards.slice(0, 3),
    evalResult: madeHand,
  };
  let bestScore = -1;
  const holePairs = combinations(heroCards, 2);
  const boardTriples = combinations(boardCards, 3);
  for (const h2 of holePairs) {
    for (const b3 of boardTriples) {
      const subEval = evaluatePLOMadeHand(parseCards(h2), parseCards(b3));
      const composite = (subEval.isMade ? 1000 : 0) + (Number(subEval.strength) || 0) * 10 + (subEval.isNut ? 5 : 0);
      if (composite > bestScore) {
        bestScore = composite;
        bestCombo = { twoHole: h2, threeBoard: b3, evalResult: subEval };
      }
    }
  }

  const flushDraw = countFlushOuts(parsedHero, parsedBoard);
  const holeRanks = parsedHero.map((c) => c.rank);
  const boardRanks = parsedBoard.map((c) => c.rank);
  const straightDraw = countStraightOuts(holeRanks, boardRanks);
  const wrapDraw = detectPLOWrapDraw(holeRanks, boardRanks);

  return {
    madeHand: bestCombo.evalResult || madeHand,
    bestTwoHoleCards: bestCombo.twoHole,
    bestThreeBoardCards: bestCombo.threeBoard,
    flushDraw,
    straightDraw,
    wrapDraw,
    primaryTwoCardSubset: primarySubset.notation,
  };
}

/**
 * Evaluates a complete Training scenario through the production Horse Brain,
 * PLO4/PLO5/PLO6 Brain, and Tournament ICM/PKO Brain.
 */
export function evaluateTrainingSpotWithHorseBrain({
  gameId = 'cash-001',
  variant,
  gameType,
  bettingStructure = null,
  format = null,
  street = 'flop',
  heroCards,
  holeCards,
  boardCards,
  board,
  heroPosition = 'BTN',
  villainPosition = 'BB',
  pot,
  potSizeBb,
  toCall,
  toCallBb,
  facingBetBb = 0,
  stackDepth,
  effectiveStackBb,
  isPKO = false,
  bountyBb = null,
  isICM = false,
  isMTT = false,
  bubbleFactor = null,
  payoutPressure = null,
  villainStats = null,
  villainArchetype = null,
} = {}) {
  const resolvedVariant = variant !== undefined && variant !== null && String(variant).trim() !== ''
    ? variant
    : gameType !== undefined && gameType !== null && String(gameType).trim() !== ''
      ? gameType
      : 'nlh';
  const normVariantPreview = normalizeVariant(resolvedVariant);
  const defaultHeroForVariant = EXPECTED_HOLE_CARDS_BY_VARIANT[normVariantPreview] === 6
    ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d']
    : EXPECTED_HOLE_CARDS_BY_VARIANT[normVariantPreview] === 5
      ? ['As', 'Ks', 'Qh', 'Jh', 'Td']
      : EXPECTED_HOLE_CARDS_BY_VARIANT[normVariantPreview] === 4
        ? ['As', '2s', 'Kh', '3h']
        : ['As', 'Kd'];
  const resolvedHeroCards = Array.isArray(heroCards)
    ? heroCards
    : Array.isArray(holeCards)
      ? holeCards
      : defaultHeroForVariant;
  const resolvedPot = Number.isFinite(Number(pot)) && Number(pot) > 0
    ? Number(pot)
    : Number.isFinite(Number(potSizeBb)) && Number(potSizeBb) > 0
      ? Number(potSizeBb)
      : 6.5;
  const rawToCall = toCall !== undefined ? toCall : toCallBb;
  const resolvedToCall = Number.isFinite(Number(rawToCall)) && Number(rawToCall) > 0
    ? Number(rawToCall)
    : Number.isFinite(Number(facingBetBb)) && Number(facingBetBb) > 0
      ? Number(facingBetBb)
      : 0;
  const resolvedFormat = normalizeGameFormat(
    format || (isMTT || isICM ? 'mtt' : gameType || 'cash'),
  );
  const resolvedIsICM = Boolean(isICM || isMTT || resolvedFormat === 'mtt');
  const rawBoardCards = boardCards !== undefined
    ? boardCards
    : board !== undefined
      ? board
      : String(street || '').toLowerCase() === 'preflop'
        ? []
        : ['Qs', '7d', '2c'];
  const usedCardLower = new Set(
    (Array.isArray(resolvedHeroCards) ? resolvedHeroCards : [])
      .map(normalizeCardToken)
      .filter(Boolean)
      .map((c) => c.toLowerCase()),
  );
  const fallbackBoardPool = ['8d', '5c', '2s', '6h', '3d', '4c', '7h', '2d', '3s', '4h', '5s', '6d'];
  const resolvedBoardCards = Array.isArray(rawBoardCards)
    ? rawBoardCards.map((card) => {
        const norm = normalizeCardToken(card);
        if (norm && !usedCardLower.has(norm.toLowerCase())) {
          usedCardLower.add(norm.toLowerCase());
          return norm;
        }
        const replacement = fallbackBoardPool.find((candidate) => !usedCardLower.has(candidate.toLowerCase())) || card;
        if (replacement) usedCardLower.add(String(replacement).toLowerCase());
        return replacement;
      })
    : rawBoardCards;
  const resolvedStackDepth = Number.isFinite(Number(stackDepth))
    ? Number(stackDepth)
    : Number.isFinite(Number(effectiveStackBb))
      ? Number(effectiveStackBb)
      : 100;
  const validation = validateDealAndPotLimitBounds({
    variant: resolvedVariant,
    street,
    heroCards: resolvedHeroCards,
    boardCards: resolvedBoardCards,
    pot: resolvedPot,
    toCall: resolvedToCall,
    effectiveStack: resolvedStackDepth,
    bettingStructure,
    format: resolvedFormat,
  });

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const {
    variant: normVariant,
    street: normStreet,
    bettingStructure: activeBettingStructure,
    format: normFormat,
    heroCards: cleanHero,
    boardCards: cleanBoard,
    pot: cleanPot,
    toCall: cleanToCall,
    effectiveStack: cleanStack,
    isPotLimit,
    isFixedLimit,
    legalBounds,
    potLimitBounds,
  } = validation;

  const parsedHero = parseCards(cleanHero);
  const parsedBoard = parseCards(cleanBoard);
  const primarySubset = resolvePrimaryTwoCardSubset(cleanHero);
  const isIP = ['BTN', 'CO'].includes(String(heroPosition || '').toUpperCase())
    && !['BTN'].includes(String(villainPosition || '').toUpperCase());

  // Build legal actions for the brain's decision function
  const maxBetOrRaise = isFixedLimit
    ? legalBounds.minRaiseToBb
    : isPotLimit
      ? potLimitBounds.maxPotBetOrRaise
      : cleanStack;
  const minBetOrRaise = isFixedLimit
    ? legalBounds.minRaiseToBb
    : cleanToCall > 0
      ? Math.min(maxBetOrRaise, Math.max(2, cleanToCall * 2))
      : Math.min(maxBetOrRaise, 1);

  const brainLegalActions = cleanToCall > 0
    ? [
        { type: 'fold' },
        { type: 'call', amount: cleanToCall },
        { type: 'raise', minAmount: minBetOrRaise, maxAmount: maxBetOrRaise },
      ]
    : [
        { type: 'check' },
        { type: 'bet', minAmount: minBetOrRaise, maxAmount: maxBetOrRaise },
      ];

  const gameState = {
    street: normStreet,
    holeCards: cleanHero,
    board: cleanBoard,
    communityCards: cleanBoard,
    potSize: cleanPot,
    pot: cleanPot,
    toCall: cleanToCall,
    currentBet: cleanToCall,
    bb: 1,
    bigBlind: 1,
    heroStack: cleanStack,
    myStack: cleanStack,
    effectiveStack: cleanStack,
    position: heroPosition,
    myPosition: heroPosition,
    isIP,
    numActivePlayers: normFormat === 'hu' ? 2 : normFormat === 'spins' ? 3 : 2,
    numPlayers: normFormat === 'hu' ? 2 : normFormat === 'spins' ? 3 : normFormat === '9max' ? 9 : 6,
    players: [
      { id: 'hero-brain', position: heroPosition, stack: cleanStack, invested: cleanPot / 2, folded: false },
      { id: 'villain-brain', position: villainPosition, stack: cleanStack, invested: cleanPot / 2 + cleanToCall, folded: false },
    ],
  };

  const seedKey = [
    gameId,
    normVariant,
    normStreet,
    cleanHero.join(''),
    cleanBoard.join(''),
    heroPosition,
    villainPosition,
    String(cleanPot),
    String(cleanToCall),
    String(cleanStack),
    String(bountyBb || ''),
    String(bubbleFactor || ''),
    String(villainStats?.vpip || ''),
  ];

  return withDeterministicRandom(seedKey, () => {
    let engineModule = 'holdem-brain.js';
    let handScore = 50;
    let madeHandCategory = 'unpaired';
    let flushOuts = 0;
    let straightOuts = 0;
    let wrapType = 'none';
    let isNutFlushDraw = false;
    let bestTwoHoleCards = cleanHero.slice(0, 2);
    let bestThreeBoardCards = cleanBoard.slice(0, 3);
    let rawBrainDecision = null;
    let preflopProfile = null;
    let boardProfile = null;
    let plo8LowEvaluation = null;

    if (normVariant === 'nlh') {
      engineModule = 'holdem-brain.js';
      const preflopStrength = getPreflopStrength(primarySubset.notation);
      if (normStreet === 'preflop') {
        handScore = preflopStrength;
        madeHandCategory = parsedHero[0].rank === parsedHero[1].rank
          ? `Pocket Pair (${primarySubset.notation})`
          : parsedHero[0].suit === parsedHero[1].suit
            ? `Suited Combo (${primarySubset.notation})`
            : `Offsuit Combo (${primarySubset.notation})`;
      } else {
        const wasPreAggressor = !['BB'].includes(String(heroPosition || '').toUpperCase());
        const postflopEval = evaluatePostflopHand(parsedHero, parsedBoard);
        const drawEval = getDrawEquity(postflopEval, normStreet);
        const wetness = evaluateBoardWetness(parsedBoard);
        const rangeAdv = getRangeAdvantage(wasPreAggressor, cleanBoard, normStreet);
        const cbetStrat = getCBetStrategy(wasPreAggressor, isIP, wetness, 2);
        const drawBonus = Math.round((Number(drawEval?.equity) || 0) * 35);
        handScore = Math.min(100, Math.round((Number(postflopEval?.strength) || 45) + drawBonus));
        madeHandCategory = postflopEval?.category || postflopEval?.description || 'postflop_hand';
        flushOuts = postflopEval?.hasFlushDraw ? 9 : postflopEval?.hasBackdoorFlush ? 2 : 0;
        straightOuts = postflopEval?.hasOESD ? 8 : postflopEval?.hasGutshot ? 4 : 0;
        boardProfile = {
          wetness,
          rangeAdvantage: rangeAdv?.advantage || 'neutral',
          cbetRecommendation: cbetStrat,
        };
      }
      rawBrainDecision = makeFallbackDecision('hero-brain', gameState, brainLegalActions);
    } else if (normVariant === 'plo4') {
      engineModule = 'plo-core.js';
      const rawPreflopScore = classifyPLOPreflop(parsedHero);
      const plo4Score = typeof rawPreflopScore === 'number'
        ? rawPreflopScore
        : (Number(rawPreflopScore?.score) || 50);
      const suitFreq4 = {};
      for (const c of parsedHero) suitFreq4[c.suit] = (suitFreq4[c.suit] || 0) + 1;
      const suitCounts4 = Object.values(suitFreq4).sort((a, b) => b - a);
      const plo4Suitedness = suitCounts4[0] >= 3
        ? 'triple-suited'
        : suitCounts4[0] === 2 && suitCounts4[1] >= 2
          ? 'double-suited'
          : suitCounts4[0] === 2
            ? 'single-suited'
            : 'rainbow';
      const plo4Tier = plo4Score >= 82
        ? 'premium'
        : plo4Score >= 66
          ? 'strong'
          : plo4Score >= 50
            ? 'playable'
            : 'marginal';
      preflopProfile = { score: plo4Score, tier: plo4Tier, suitedness: plo4Suitedness };
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
      isNutFlushDraw = Boolean(omahaEval.flushDraw?.isNutFlushDraw || omahaEval.flushDraw?.isNut);
      straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
      wrapType = omahaEval.wrapDraw?.wrapType || omahaEval.straightDraw?.type || 'none';
      if (normStreet === 'preflop') {
        handScore = plo4Score;
        madeHandCategory = `PLO4 ${plo4Tier} (${plo4Suitedness})`;
      } else {
        const drawBonus = Math.min(28, flushOuts * 1.6 + straightOuts * 1.2);
        handScore = Math.min(100, Math.round((Number(omahaEval.madeHand?.strength) || 35) + drawBonus));
        madeHandCategory = omahaEval.madeHand?.category || omahaEval.madeHand?.description || 'plo4_hand';
        boardProfile = analyzePLOBoardTexture(parsedBoard);
      }
      rawBrainDecision = makePLOFallbackDecision('hero-brain', gameState, brainLegalActions);
    } else if (normVariant === 'plo5') {
      engineModule = 'plo5-brain.js';
      const preflopEval = scorePLO5Hand(cleanHero);
      preflopProfile = preflopEval;
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      if (normStreet === 'preflop') {
        handScore = Number(preflopEval?.score) || 50;
        const tier5 = preflopEval?.tier || 'playable';
        const suited5 = preflopEval?.suitedness || 'single-suited';
        const fifthVal = preflopEval?.fifthCardValue || 'coordinated';
        madeHandCategory = `PLO5 ${tier5} (${suited5}, ${fifthVal})`;
      } else {
        const boardTex = analyzePLOBoardTexture(parsedBoard);
        const draws5 = classifyPLO5Draws(cleanHero, cleanBoard, normStreet);
        const flushHier5 = evaluatePLO5FlushHierarchy(cleanHero, cleanBoard);
        const adjStrengthObj = adjustPLO5PostflopStrength(omahaEval.madeHand, draws5, normStreet, cleanHero, cleanBoard);
        const adjBase = Number(adjStrengthObj?.adjustedStrength ?? adjStrengthObj ?? omahaEval.madeHand?.strength) || 35;
        flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
        isNutFlushDraw = Boolean(draws5?.nutFlushDraw || flushHier5?.flushRank === 'nut' || omahaEval.flushDraw?.isNutFlushDraw);
        straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
        const totalCleanOuts = Math.max(Number(draws5?.totalOuts) || 0, flushOuts + straightOuts);
        wrapType = draws5?.drawLabel || omahaEval.wrapDraw?.wrapType || 'none';
        handScore = Math.min(100, Math.round(adjBase + Math.min(34, totalCleanOuts * 2.2) + (isNutFlushDraw ? 8 : 0)));
        madeHandCategory = `${omahaEval.madeHand?.category || 'plo5_hand'} (${draws5?.drawLabel || 'standard'})`;
        boardProfile = boardTex;
      }
      rawBrainDecision = makePLO5Decision('hero-brain', gameState, brainLegalActions);
    } else if (normVariant === 'plo6') {
      engineModule = 'plo6-brain.js';
      const preflopEval = scorePLO6Hand(cleanHero);
      preflopProfile = preflopEval;
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      if (normStreet === 'preflop') {
        handScore = Number(preflopEval?.score) || 50;
        const tier6 = preflopEval?.tier || 'playable';
        const suited6 = preflopEval?.suitedness || 'double-suited';
        const extra6 = preflopEval?.extraCardValue || 'coordinated';
        madeHandCategory = `PLO6 ${tier6} (${suited6}, ${extra6})`;
      } else {
        const boardTex = analyzePLOBoardTexture(parsedBoard);
        const draws6 = classifyPLO6Draws(cleanHero, cleanBoard, normStreet);
        const flushHier6 = evaluatePLO6FlushHierarchy(cleanHero, cleanBoard);
        const blockerVal6 = getPLO6BlockerValue(cleanHero, cleanBoard);
        const adjStrengthObj = adjustPLO6PostflopStrength(omahaEval.madeHand, draws6, normStreet, cleanHero, cleanBoard);
        const adjBase = Number(adjStrengthObj?.adjustedStrength ?? adjStrengthObj ?? omahaEval.madeHand?.strength) || 35;
        flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
        isNutFlushDraw = Boolean(draws6?.nutFlushDraw || flushHier6?.flushRank === 'nut' || omahaEval.flushDraw?.isNutFlushDraw);
        straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
        const totalCleanOuts = Math.max(Number(draws6?.totalOuts) || 0, flushOuts + straightOuts);
        wrapType = draws6?.drawLabel || omahaEval.wrapDraw?.wrapType || 'none';
        handScore = Math.min(100, Math.round(adjBase + Math.min(36, totalCleanOuts * 2.1) + (isNutFlushDraw ? 8 : 0) + (blockerVal6?.blocksNutFlush || blockerVal6?.shouldBluff ? 5 : 0)));
        madeHandCategory = `${omahaEval.madeHand?.category || 'plo6_hand'} (${draws6?.drawLabel || 'nut-focused'})`;
        boardProfile = boardTex;
      }
      rawBrainDecision = makePLO6Decision('hero-brain', gameState, brainLegalActions);
    } else if (normVariant === 'plo8') {
      engineModule = 'plo8-brain.js';
      const rawPreflopScore = classifyPLOPreflop(parsedHero);
      const baseHighPreflop = typeof rawPreflopScore === 'number'
        ? rawPreflopScore
        : (Number(rawPreflopScore?.score) || 50);

      // Evaluate preflop A2/A3/23 wheel-card coordination
      const lowRanksInHole = [...new Set(
        parsedHero
          .map((c) => (c.rank === 12 ? -1 : c.rank))
          .filter((r) => r <= 6),
      )].sort((a, b) => a - b);
      const hasAce = lowRanksInHole.includes(-1);
      const hasDeuce = lowRanksInHole.includes(0);
      const hasTrey = lowRanksInHole.includes(1);
      const hasFour = lowRanksInHole.includes(2);
      const hasA2 = hasAce && hasDeuce;
      const hasA3 = hasAce && hasTrey;
      const has23 = hasDeuce && hasTrey;

      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
      isNutFlushDraw = Boolean(omahaEval.flushDraw?.isNutFlushDraw || omahaEval.flushDraw?.isNut);
      straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
      wrapType = omahaEval.wrapDraw?.wrapType || omahaEval.straightDraw?.type || 'none';

      const lowInfo = parsedBoard.length >= 3
        ? evaluatePLO8Low(parsedHero, parsedBoard)
        : {
            hasLow: false,
            hasNutLow: false,
            lowRanks: lowRanksInHole.map((r) => (r === -1 ? 'A' : RANKS[r])),
            lowOuts: hasA2 ? 12 : hasA3 ? 9 : has23 ? 6 : lowRanksInHole.length >= 2 ? 4 : 0,
            hasNutLowDraw: Boolean(hasA2 || (hasA3 && hasFour)),
            scoopable: Boolean(hasA2 || hasA3),
            quarteringRisk: !hasAce && has23,
            lowValueDiscount: hasA2 ? 1.0 : hasA3 ? 0.85 : 0.65,
            isCounterfeited: false,
            counterfeitOuts: 0,
            counterfeitVulnerability: 0,
          };

      const hasNutLowDraw = Boolean(
        lowInfo.hasNutLowDraw ||
        (!lowInfo.hasLow && Number(lowInfo.lowOuts || 0) >= 6 && (hasA2 || hasA3)),
      );
      const quarteringRiskBool = typeof lowInfo.quarteringRisk === 'boolean'
        ? lowInfo.quarteringRisk
        : lowInfo.quarteringRisk === 'high' || lowInfo.quarteringRisk === 'medium';

      plo8LowEvaluation = {
        hasLow: Boolean(lowInfo.hasLow),
        hasNutLow: Boolean(lowInfo.hasNutLow),
        lowRanks: lowInfo.lowRanks || (lowRanksInHole.length >= 2 ? lowRanksInHole.map((r) => (r === -1 ? 'A' : RANKS[r])) : null),
        lowOuts: Number(lowInfo.lowOuts || 0),
        hasNutLowDraw,
        scoopable: Boolean(lowInfo.scoopable || (lowInfo.hasLow && (Number(omahaEval.madeHand?.strength) || 0) >= 55)),
        quarteringRisk: quarteringRiskBool,
        lowValueDiscount: Number(lowInfo.lowValueDiscount ?? 1),
        isCounterfeited: Boolean(lowInfo.isCounterfeited),
        counterfeitOuts: Number(lowInfo.counterfeitOuts || 0),
        counterfeitVulnerability: Number(lowInfo.counterfeitVulnerability || 0),
      };

      if (normStreet === 'preflop') {
        const wheelBonus = hasA2 ? 22 : hasA3 ? 14 : has23 ? 7 : lowRanksInHole.length >= 3 ? 5 : -8;
        handScore = Math.max(10, Math.min(100, Math.round(baseHighPreflop * 0.72 + wheelBonus)));
        const wheelTag = hasA2 ? 'A2 Nut-Low Wheel Core' : hasA3 ? 'A3 Low Core' : has23 ? '23 Non-Nut Low' : 'High-Only';
        madeHandCategory = `PLO8 Preflop (${wheelTag})`;
        preflopProfile = { score: handScore, wheelTag, hasA2, hasA3, lowCardCount: lowRanksInHole.length };
      } else {
        const highBase = Number(omahaEval.madeHand?.strength) || 35;
        const highDrawBonus = Math.min(20, flushOuts * 1.3 + straightOuts * 1.0);
        const highComponent = Math.min(100, highBase + highDrawBonus);
        let lowComponent = 0;
        if (plo8LowEvaluation.hasNutLow) {
          lowComponent = Math.round(42 * plo8LowEvaluation.lowValueDiscount);
        } else if (plo8LowEvaluation.hasLow) {
          lowComponent = Math.round(24 * plo8LowEvaluation.lowValueDiscount);
        } else if (plo8LowEvaluation.lowOuts > 0) {
          lowComponent = Math.min(18, Math.round(plo8LowEvaluation.lowOuts * 1.1));
        }
        const twoWayScoopBonus =
          (plo8LowEvaluation.hasNutLow || plo8LowEvaluation.hasNutLowDraw) && highComponent >= 55
            ? 14
            : 0;
        const quarteringPenalty = plo8LowEvaluation.quarteringRisk && highComponent < 45 ? 10 : 0;
        handScore = Math.max(10, Math.min(100, Math.round(highComponent * 0.62 + lowComponent + twoWayScoopBonus - quarteringPenalty)));
        const lowLabel = plo8LowEvaluation.hasNutLow
          ? 'Nut Low'
          : plo8LowEvaluation.hasLow
            ? 'Qualifying Low'
            : plo8LowEvaluation.lowOuts > 0
              ? `Low Draw (${plo8LowEvaluation.lowOuts} outs)`
              : 'No Qualifying Low';
        madeHandCategory = `${omahaEval.madeHand?.category || 'plo8_high'} + ${lowLabel}`;
        boardProfile = analyzePLOBoardTexture(parsedBoard);
      }
      rawBrainDecision = makePLOFallbackDecision('hero-brain', gameState, brainLegalActions);
    }

    // Apply Tournament ICM / Bubble Factor adjustments via `tournament-brain.js`
    let icmAdjustment = null;
    const numericBubbleFactor = Number.isFinite(Number(bubbleFactor)) && Number(bubbleFactor) > 1
      ? Number(bubbleFactor)
      : resolvedIsICM ? 1.65 : 1.0;

    if (resolvedIsICM || numericBubbleFactor > 1.05) {
      const stageInfo = detectTournamentStage({
        playersRemaining: numericBubbleFactor >= 1.8 ? 9 : 19,
        totalEntrants: 180,
        paidPlaces: 18,
        isFinalTable: numericBubbleFactor >= 1.7,
      });
      const icmMod = getICMRangeAdjustment(stageInfo.stage, cleanStack, cleanStack, 9, [cleanStack, 45, 30, 18]);
      const bfData = getBubbleFactor(cleanStack, cleanStack, stageInfo.stage, [cleanStack, 45, 30, 18]);
      const effectiveBf = Number(numericBubbleFactor || bfData?.bubbleFactor || 1.45);
      // Higher Bubble Factor penalizes marginal aggression/calling by requiring higher equity
      const icmPenalty = Math.round((effectiveBf - 1.0) * 14);
      handScore = Math.max(5, Math.min(100, handScore - icmPenalty));
      icmAdjustment = {
        module: 'tournament-brain.js',
        stage: stageInfo.stage,
        bubbleFactor: effectiveBf,
        payoutPressure: payoutPressure || `${stageInfo.stage} (BF ${effectiveBf}x)`,
        tightenPercent: icmMod?.tightenPct ?? icmPenalty,
        scoreDelta: -icmPenalty,
      };
    }

    // Apply PKO Bounty chip-equivalence adjustment
    let pkoBountyAdjustment = null;
    const numericBountyBb = Number.isFinite(Number(bountyBb)) && Number(bountyBb) > 0
      ? Number(bountyBb)
      : null;
    if (isPKO && numericBountyBb) {
      // Standard PKO chip equivalence: each 1 BB of visible progressive bounty adds ~0.35 BB to pot odds
      const bountyBonusScore = Math.min(18, Math.round(numericBountyBb * 0.9));
      handScore = Math.min(100, handScore + bountyBonusScore);
      pkoBountyAdjustment = {
        bountyBb: numericBountyBb,
        bountyChipEquivalenceBb: Number((numericBountyBb * 0.35).toFixed(2)),
        effectivePotOddsDiscountPct: Number(Math.min(18, (numericBountyBb * 0.35 / Math.max(1, cleanPot + cleanToCall)) * 100).toFixed(1)),
        scoreDelta: bountyBonusScore,
      };
    }

    // Apply Villain HUD Exploit adjustments (VPIP / PFR / 3-Bet)
    let hudExploitAdjustment = null;
    if (villainStats && Number.isFinite(Number(villainStats.vpip)) && Number.isFinite(Number(villainStats.pfr))) {
      const vpip = Number(villainStats.vpip);
      const pfr = Number(villainStats.pfr);
      const threeBet = Number.isFinite(Number(villainStats.threeBet)) ? Number(villainStats.threeBet) : 6;
      let profile = villainArchetype || 'GTO Reg';
      let scoreDelta = 0;
      let note = 'Balanced villain profile; play baseline equilibrium frequencies.';

      if (vpip >= 38 && pfr <= 15) {
        profile = 'Loose-Passive Calling Station';
        // Value hands gain EV (+8), pure bluffs lose EV (-12)
        scoreDelta = handScore >= 58 ? 8 : -10;
        note = `Villain VPIP ${vpip}% / PFR ${pfr}% is a Calling Station: expand thin value sizing and eliminate low-equity bluffs.`;
      } else if (vpip <= 17 && pfr <= 13) {
        profile = 'Tight-Passive Nit';
        scoreDelta = cleanToCall > 0 ? -9 : 7;
        note = `Villain VPIP ${vpip}% / PFR ${pfr}% is a Nit: attack unchecked pots relentlessly, but fold marginal bluff-catchers when facing heavy aggression.`;
      } else if (vpip >= 33 && pfr >= 25) {
        profile = 'Loose-Aggressive Maniac / LAG';
        scoreDelta = cleanToCall > 0 && handScore >= 48 ? 9 : 4;
        note = `Villain VPIP ${vpip}% / PFR ${pfr}% / 3B ${threeBet}% is hyper-aggressive: widen bluff-catching and 4-bet value thresholds.`;
      }

      handScore = Math.max(5, Math.min(100, handScore + scoreDelta));
      hudExploitAdjustment = {
        vpip,
        pfr,
        threeBet,
        profile,
        scoreDelta,
        note,
      };
    }

    // Build the 4 canonical action options for this street & variant
    let options = [];
    if (legalBounds.isFixedLimit) {
      if (cleanToCall > 0) {
        options = [
          { id: 'f', text: 'Fold' },
          { id: 'c', text: `Call ${cleanToCall} BB` },
          { id: 'r_fl', text: `Raise To ${legalBounds.minRaiseToBb} BB (Fixed Limit)` },
          { id: 'c_odds', text: `Call ${cleanToCall} BB (Pot Odds)` },
        ];
      } else {
        options = [
          { id: 'x', text: 'Check' },
          { id: 'b_fl', text: `Bet ${legalBounds.fixedIncrementBb} BB (Fixed Limit)` },
          { id: 'b_val', text: `Bet ${legalBounds.fixedIncrementBb} BB (Value/Protection)` },
          { id: 'f', text: 'Fold' },
        ];
      }
    } else if (isPotLimit) {
      if (cleanToCall > 0) {
        options = [
          { id: 'f', text: 'Fold' },
          { id: 'c', text: `Call ${cleanToCall} BB` },
          { id: 'r_half', text: `Raise 50% Pot (${potLimitBounds.halfPotBetOrRaise} BB)` },
          { id: 'rpot', text: `Raise Pot (${potLimitBounds.maxPotBetOrRaise} BB)` },
        ];
      } else {
        options = [
          { id: 'x', text: 'Check' },
          { id: 'b33', text: `Bet 33% Pot (${potLimitBounds.thirdPotBet} BB)` },
          { id: 'b67', text: `Bet 67% Pot (${potLimitBounds.twoThirdsPotBetOrRaise} BB)` },
          { id: 'bpot', text: `Bet Pot (${potLimitBounds.maxPotBetOrRaise} BB)` },
        ];
      }
    } else if (normStreet === 'preflop') {
      options = [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: cleanToCall > 0 ? `Call ${cleanToCall} BB` : 'Call / Limp' },
        { id: 'r_open', text: cleanToCall > 0 ? `3-Bet (${Math.min(cleanStack, Number((cleanToCall * 3).toFixed(1)))} BB)` : 'Raise 2.5 BB' },
        { id: 'allin', text: `All-In (${cleanStack} BB)` },
      ];
    } else if (cleanToCall > 0) {
      options = [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: `Call ${cleanToCall} BB` },
        { id: 'r_size', text: `Raise (${potLimitBounds.twoThirdsPotBetOrRaise} BB)` },
        { id: 'allin', text: `All-In (${cleanStack} BB)` },
      ];
    } else {
      options = [
        { id: 'x', text: 'Check' },
        { id: 'b33', text: `Bet 33% (${potLimitBounds.thirdPotBet} BB)` },
        { id: 'b75', text: `Bet 75% (${potLimitBounds.threeQuarterPotBet} BB)` },
        { id: 'allin', text: `All-In (${cleanStack} BB)` },
      ];
    }

    // Map the brain's raw decision + adjusted handScore to the 4 options' frequencies and EVs
    const rawType = String(rawBrainDecision?.type || '').toLowerCase();
    const rawAmount = Number(rawBrainDecision?.amount) || 0;

    let weights = [10, 20, 45, 25];
    if (cleanToCall > 0) {
      if (handScore >= 80 || (rawType === 'raise' && rawAmount >= potLimitBounds.maxPotBetOrRaise * 0.85)) {
        weights = [2, 16, 24, 58];
      } else if (handScore >= 64 || rawType === 'raise') {
        weights = [4, 26, 48, 22];
      } else if (handScore >= 44 || rawType === 'call') {
        weights = [14, 56, 22, 8];
      } else {
        weights = [68, 22, 7, 3];
      }
    } else {
      if (handScore >= 82 || (rawType === 'bet' && rawAmount >= potLimitBounds.maxPotBetOrRaise * 0.85)) {
        weights = [10, 16, 26, 48];
      } else if (handScore >= 65 || (rawType === 'bet' && rawAmount >= cleanPot * 0.5)) {
        weights = [14, 24, 46, 16];
      } else if (handScore >= 50 || rawType === 'bet') {
        weights = [24, 48, 20, 8];
      } else {
        weights = [64, 24, 9, 3];
      }
    }

    // Normalize weights to sum to 100
    const weightSum = weights.reduce((a, b) => a + b, 0) || 100;
    const normalizedFreqs = weights.map((w) => Math.round((w / weightSum) * 100));
    const diff = 100 - normalizedFreqs.reduce((a, b) => a + b, 0);
    normalizedFreqs[0] += diff;

    let bestIdx = 0;
    for (let i = 1; i < normalizedFreqs.length; i += 1) {
      if (normalizedFreqs[i] > normalizedFreqs[bestIdx]) bestIdx = i;
    }

    const correctAnswer = options[bestIdx].id;
    const gtoFrequencies = {};
    const actionEVs = {};
    const baseEv = Number((((handScore - 42) / 18) * Math.max(1, cleanPot * 0.25)).toFixed(2));

    options.forEach((opt, idx) => {
      const freq = normalizedFreqs[idx];
      gtoFrequencies[opt.id] = freq;
      const freqDelta = normalizedFreqs[bestIdx] - freq;
      const evPenalty = idx === bestIdx ? 0 : Number(((freqDelta / 100) * Math.max(1.1, cleanPot * 0.28)).toFixed(2));
      actionEVs[opt.id] = Number((baseEv - evPenalty).toFixed(2));
    });

    const isOmahaVariant = normVariant.startsWith('plo');
    const plo8SummaryNote = normVariant === 'plo8' && plo8LowEvaluation
      ? `Hi-Lo 8-or-Better Split Analysis (plo8-brain.js): Qualifying Low = ${plo8LowEvaluation.hasLow ? (plo8LowEvaluation.hasNutLow ? 'NUT LOW' : 'YES') : 'NO'}${plo8LowEvaluation.hasNutLowDraw ? ' (Nut Low Draw)' : ''}, Low Outs = ${plo8LowEvaluation.lowOuts}, Scoopable = ${plo8LowEvaluation.scoopable ? 'YES' : 'NO'}, Quartering Risk = ${plo8LowEvaluation.quarteringRisk ? 'ELEVATED' : 'LOW'} (Discount ${plo8LowEvaluation.lowValueDiscount}). Both High and Low strictly require 2 hole cards + 3 board cards.`
      : null;

    const sizingRuleNote = legalBounds.isFixedLimit
      ? `Fixed-Limit increment = ${legalBounds.fixedIncrementBb} BB (${normStreet === 'turn' || normStreet === 'river' ? 'Big Bet' : 'Small Bet'}), min/max raise-to = ${legalBounds.minRaiseToBb} BB.`
      : isPotLimit
        ? `Pot-Limit max action = pot (${cleanPot} BB) + 2 × call (${cleanToCall} BB) = ${potLimitBounds.maxPotBetOrRaise} BB.`
        : `No-Limit effective stack = ${cleanStack} BB.`;

    const omahaRuleSummary = isOmahaVariant && cleanBoard.length >= 3
      ? `Omaha 2-Hole + 3-Board Evaluation (${engineModule}): Best 5-card hand uses hole [${bestTwoHoleCards.join(' ')}] + board [${bestThreeBoardCards.join(' ')}] → ${madeHandCategory} (Flush Outs: ${flushOuts}${isNutFlushDraw ? ' [Nut]' : ''}, Straight/Wrap Outs: ${straightOuts}${wrapType !== 'none' ? ` [${wrapType}]` : ''}). ${sizingRuleNote}`
      : isOmahaVariant
        ? `Omaha Preflop Evaluation (${engineModule}): ${madeHandCategory} (Primary 2-card subset: ${primarySubset.notation}, Score: ${handScore}/100). ${sizingRuleNote}`
        : `Hold'em Evaluation (${engineModule}): Hero [${cleanHero.join(' ')}] (${primarySubset.notation}) on ${cleanBoard.length ? `[${cleanBoard.join(' ')}]` : 'Preflop'} → ${madeHandCategory} (Strength: ${handScore}/100). ${sizingRuleNote}`;

    const contextNotes = [
      omahaRuleSummary,
      plo8SummaryNote,
      icmAdjustment ? `ICM / Payout Pressure (tournament-brain.js): ${icmAdjustment.payoutPressure} tightens continuation threshold by ${icmAdjustment.tightenPercent}%.` : null,
      pkoBountyAdjustment ? `PKO Bounty Math: ${pkoBountyAdjustment.bountyBb} BB bounty adds +${pkoBountyAdjustment.bountyChipEquivalenceBb} BB chip equivalence (-${pkoBountyAdjustment.effectivePotOddsDiscountPct}% required equity).` : null,
      hudExploitAdjustment ? `Exploit Telemetry: ${hudExploitAdjustment.note}` : null,
      `Training model recommendation: ${options[bestIdx].text}.`,
    ].filter(Boolean);

    const explanation = contextNotes.join(' ');

    const brainEvaluation = {
      engineModule,
      variant: normVariant,
      street: normStreet,
      bettingStructure: legalBounds.bettingStructure,
      format: normFormat,
      handScore,
      madeHandCategory,
      primaryTwoCardSubset: primarySubset.notation,
      omahaBestTwoHole: isOmahaVariant ? bestTwoHoleCards : null,
      omahaBestThreeBoard: isOmahaVariant && cleanBoard.length >= 3 ? bestThreeBoardCards : null,
      flushOuts,
      isNutFlushDraw,
      straightOuts,
      wrapType,
      plo8LowEvaluation,
      potLimitMaxBetBb: isPotLimit ? potLimitBounds.maxPotBetOrRaise : null,
      fixedIncrementBb: legalBounds.fixedIncrementBb,
      potLimitBounds,
      legalBounds,
      icmAdjustment,
      pkoBountyAdjustment,
      hudExploitAdjustment,
      rawBrainDecision,
    };

    const structuredExplanation = {
      verdict: `Training model recommendation: ${options[bestIdx].text}.`,
      why: [omahaRuleSummary, plo8SummaryNote].filter(Boolean).join(' '),
      keyFactors: [
        `Engine Authority: ${engineModule} (${normVariant.toUpperCase()} ${normStreet.toUpperCase()} · ${legalBounds.bettingStructure.toUpperCase()} · ${normFormat.toUpperCase()})`,
        `Hero Holding: ${cleanHero.join(' ')} (${madeHandCategory}, Score ${handScore}/100)`,
        legalBounds.isFixedLimit
          ? `Fixed-Limit Sizing Bound: increment = ${legalBounds.fixedIncrementBb} BB (raise-to ${legalBounds.minRaiseToBb} BB)`
          : isPotLimit
            ? `Pot-Limit Sizing Bound: max = ${cleanPot} + 2×${cleanToCall} = ${potLimitBounds.maxPotBetOrRaise} BB`
            : `Effective Stack: ${cleanStack} BB | Pot: ${cleanPot} BB`,
        ...(plo8LowEvaluation
          ? [`Hi-Lo Low Status: ${plo8LowEvaluation.hasNutLow ? 'Nut Low' : plo8LowEvaluation.hasLow ? 'Qualifying Low' : `${plo8LowEvaluation.lowOuts} Low Outs`} (Scoopable: ${plo8LowEvaluation.scoopable ? 'Yes' : 'No'})`]
          : []),
        ...(icmAdjustment ? [`ICM Pressure: BF ${icmAdjustment.bubbleFactor}x (${icmAdjustment.payoutPressure})`] : []),
        ...(pkoBountyAdjustment ? [`PKO Bounty: ${pkoBountyAdjustment.bountyBb} BB (+${pkoBountyAdjustment.bountyChipEquivalenceBb} BB chip eq)`] : []),
        ...(hudExploitAdjustment ? [`Villain HUD: VPIP ${hudExploitAdjustment.vpip}% / PFR ${hudExploitAdjustment.pfr}% (${hudExploitAdjustment.profile})`] : []),
      ],
      takeaway: explanation,
    };

    const correctAnswerText = options[bestIdx]?.text || correctAnswer;

    const scenario = {
      gameId,
      variant: normVariant,
      street: normStreet,
      bettingStructure: legalBounds.bettingStructure,
      format: normFormat,
      heroPosition: String(heroPosition || 'BTN').toUpperCase(),
      villainPosition: String(villainPosition || 'BB').toUpperCase(),
      pot: cleanPot,
      toCall: cleanToCall,
      stackDepth: cleanStack,
      holeCardCount: EXPECTED_HOLE_CARDS_BY_VARIANT[normVariant],
      madeHandCategory,
      plo8LowEvaluation,
    };

    const gtoData = {
      engineModule: brainEvaluation.engineModule,
      variant: normVariant,
      bettingStructure: legalBounds.bettingStructure,
      format: normFormat,
      frequencies: gtoFrequencies,
      evByAction: actionEVs,
      recommendedAction: correctAnswer,
      recommendedActionText: correctAnswerText,
      handScore,
      madeHandCategory,
      plo8LowEvaluation,
    };

    return {
      ok: true,
      runtimeState: getTrainingAdapterRuntimeState({ statusCode: 200 }),
      engineModule: brainEvaluation.engineModule,
      variant: normVariant,
      bettingStructure: legalBounds.bettingStructure,
      format: normFormat,
      plo8LowEvaluation,
      scenario,
      gtoData,
      options,
      correctAnswer,
      correctAnswerText,
      recommendedAction: correctAnswerText,
      gtoFrequencies,
      actionEVs,
      evLoss: 0,
      handScore,
      madeHandCategory,
      primaryTwoCardSubset: primarySubset.notation,
      potLimitSizing: potLimitBounds,
      legalBounds,
      brainEvaluation,
      explanation,
      coachingExplanation: explanation,
      coachingSummary: explanation,
      structuredExplanation,
    };
  });
}

function resolveDoubleBoardStreet(boardList = []) {
  const count = Array.isArray(boardList) ? boardList.length : 0;
  if (count >= 5) return 'river';
  if (count === 4) return 'turn';
  return 'flop';
}

export function evaluateDoubleBoardBombPot({
  gameId = 'cash-005',
  variant = 'plo4',
  heroCards = [],
  boardACards = [],
  boardBCards = [],
  potSizeBb = 24,
  facingBetBb = 8,
  effectiveStackBb = 100,
  heroPosition = 'BTN',
  villainPosition = 'BB',
} = {}) {
  const normVariant = normalizeVariant(variant);
  const defaultHero = EXPECTED_HOLE_CARDS_BY_VARIANT[normVariant] === 6
    ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d']
    : EXPECTED_HOLE_CARDS_BY_VARIANT[normVariant] === 5
      ? ['As', 'Ks', 'Qh', 'Jh', 'Td']
      : EXPECTED_HOLE_CARDS_BY_VARIANT[normVariant] === 4
        ? ['As', 'Ks', 'Qh', 'Jd']
        : ['As', 'Kd'];
  const cleanHero = Array.isArray(heroCards) && heroCards.length > 0 ? heroCards : defaultHero;
  const cleanBoardA = Array.isArray(boardACards) && boardACards.length >= 3
    ? boardACards
    : ['Qs', '8s', '3d'];
  const cleanBoardB = Array.isArray(boardBCards) && boardBCards.length >= 3
    ? boardBCards
    : ['Jh', '9h', '2c'];

  const streetA = resolveDoubleBoardStreet(cleanBoardA);
  const streetB = resolveDoubleBoardStreet(cleanBoardB);

  const boardAEvaluation = evaluateTrainingSpotWithHorseBrain({
    gameId,
    variant: normVariant,
    street: streetA,
    heroCards: cleanHero,
    boardCards: cleanBoardA,
    potSizeBb,
    facingBetBb,
    effectiveStackBb,
    heroPosition,
    villainPosition,
  });

  const boardBEvaluation = evaluateTrainingSpotWithHorseBrain({
    gameId,
    variant: normVariant,
    street: streetB,
    heroCards: cleanHero,
    boardCards: cleanBoardB,
    potSizeBb,
    facingBetBb,
    effectiveStackBb,
    heroPosition,
    villainPosition,
  });

  const boardAScore = Number(boardAEvaluation?.handScore ?? 50);
  const boardBScore = Number(boardBEvaluation?.handScore ?? 50);
  const combinedHandScore = Math.round((boardAScore + boardBScore) / 2);
  const isTwoBoardScoopCandidate = boardAScore >= 65 && boardBScore >= 65;
  const isSplitLockCandidate = boardAScore >= 75 || boardBScore >= 75;
  const scoopStatusLabel = isTwoBoardScoopCandidate
    ? 'Two-Board Scoop Candidate'
    : isSplitLockCandidate
      ? 'One-Board Lock + Redraw'
      : 'Split / Defensive Spot';

  const maxActionText = boardAEvaluation.recommendedAction || 'Raise Pot';
  const callOrCheckText = Number(facingBetBb) > 0 ? `Call ${facingBetBb} BB` : 'Check';
  const foldOrCheckText = Number(facingBetBb) > 0 ? 'Fold' : 'Check';

  let recommendedAction = callOrCheckText;
  if (isTwoBoardScoopCandidate) {
    recommendedAction = maxActionText;
  } else if (isSplitLockCandidate && Math.min(boardAScore, boardBScore) >= 42) {
    recommendedAction = maxActionText;
  } else if (boardAScore < 42 && boardBScore < 42) {
    recommendedAction = foldOrCheckText;
  }

  const coachingExplanation = `Double-Board Bomb Pot (${normVariant.toUpperCase()}): Board A [${cleanBoardA.join(' ')}] scores ${boardAScore}/100 (${boardAEvaluation.madeHandCategory}) and Board B [${cleanBoardB.join(' ')}] scores ${boardBScore}/100 (${boardBEvaluation.madeHandCategory}). Combined Scoop Score: ${combinedHandScore}/100 (${scoopStatusLabel}). Recommended Play: ${recommendedAction}.`;

  return {
    ok: true,
    variant: normVariant,
    boardACards: cleanBoardA,
    boardBCards: cleanBoardB,
    boardAEvaluation,
    boardBEvaluation,
    boardAScore,
    boardBScore,
    combinedHandScore,
    isTwoBoardScoopCandidate,
    isSplitLockCandidate,
    scoopStatusLabel,
    recommendedAction,
    coachingExplanation,
  };
}

/**
 * Phase 13 Item 15: Multi-Way (3-Way & 4-Way) Postflop Pot Evaluation
 * Adjusts Horse Brain continuation-betting, bluffing, and defense thresholds
 * for multi-villain equity protection (2-Way Heads-Up vs 3-Way vs 4-Way pots).
 */
export function evaluateMultiwayPostflopSpot({
  gameId = 'cash-005',
  variant = 'nlh',
  bettingStructure = null,
  format = 'cash',
  street = 'flop',
  activePlayerCount = 3,
  heroCards = ['As', 'Kd'],
  boardCards = ['Qs', '8s', '3d'],
  potSizeBb = 12,
  facingBetBb = 4,
  effectiveStackBb = 100,
  heroPosition = 'BTN',
  villainPosition = 'BB',
} = {}) {
  const cleanPlayers = Math.max(2, Math.min(6, Math.round(Number(activePlayerCount) || 2)));
  const normStreet = String(street || 'flop').trim().toLowerCase();
  const expectedBoardCount = EXPECTED_BOARD_CARDS_BY_STREET[normStreet] ?? 3;
  const seedBoard = ['Qs', '8s', '3d', 'Jh', '2c', '7h', '4c'];
  const usedCards = new Set((Array.isArray(heroCards) ? heroCards : []).map((c) => String(c).toLowerCase()));
  const alignedBoard = [];
  for (const c of (Array.isArray(boardCards) ? boardCards : [])) {
    if (alignedBoard.length >= expectedBoardCount) break;
    const low = String(c).toLowerCase();
    if (!usedCards.has(low)) {
      usedCards.add(low);
      alignedBoard.push(c);
    }
  }
  for (const c of seedBoard) {
    if (alignedBoard.length >= expectedBoardCount) break;
    const low = c.toLowerCase();
    if (!usedCards.has(low)) {
      usedCards.add(low);
      alignedBoard.push(c);
    }
  }
  const baseEval = evaluateTrainingSpotWithHorseBrain({
    gameId,
    variant,
    bettingStructure,
    format,
    street: normStreet,
    heroCards,
    boardCards: alignedBoard,
    potSizeBb,
    facingBetBb,
    effectiveStackBb,
    heroPosition,
    villainPosition,
  });

  const rawScore = Number(baseEval?.handScore ?? 50);
  const extraVillains = Math.max(0, cleanPlayers - 2);
  // Each additional active player in a postflop pot increases multiway equity burden
  // and reduces raw single-pair / non-nut bluff equity by ~7 points per extra player
  const multiwayPenalty = extraVillains * 7;
  const adjustedHandScore = Math.max(10, Math.min(100, rawScore - multiwayPenalty));
  const baseMdfPct = Math.round((1 - (Math.max(0, Number(facingBetBb) || 0) / Math.max(1, Number(potSizeBb) + Math.max(0, Number(facingBetBb) || 0)))) * 1000) / 10;
  // Multiway defense frequency splits burden across (N - 1) defenders: MDF_multiway = MDF_hu / (N - 1)
  const multiwayMdfPct = Number((baseMdfPct / Math.max(1, cleanPlayers - 1)).toFixed(1));

  let recommendedAction = baseEval?.recommendedAction || 'Check';
  if (extraVillains >= 1 && adjustedHandScore < 54 && Number(facingBetBb) > 0) {
    recommendedAction = 'Fold (Multiway Tightened)';
  } else if (extraVillains >= 1 && adjustedHandScore < 58 && Number(facingBetBb) <= 0) {
    recommendedAction = 'Check (Multiway Pot Control)';
  }

  const multiwayLabel = cleanPlayers === 2
    ? '2-Way Heads-Up Postflop'
    : `${cleanPlayers}-Way Multiway Pot · Equity Protection Active`;

  return {
    ok: true,
    variant: baseEval?.variant || normalizeVariant(variant),
    engineModule: baseEval?.engineModule || 'holdem-brain.js',
    activePlayerCount: cleanPlayers,
    extraVillains,
    isMultiway: cleanPlayers >= 3,
    multiwayLabel,
    baseHandScore: rawScore,
    adjustedHandScore,
    multiwayPenalty,
    baseMdfPct,
    headsUpMdfPct: baseMdfPct,
    multiwayMdfPct,
    recommendedAction,
    coachingNote: `${multiwayLabel}: With ${cleanPlayers} active players seeing the ${street}, defense burden drops from ${baseMdfPct}% to ${multiwayMdfPct}% per player (-${multiwayPenalty} pts non-nut discount). Recommended Play: ${recommendedAction}.`,
  };
}

/**
 * Phase 13 Item 2 & 16: Full-Hand Multi-Street Playthrough & Street-Rewind Line Sandbox
 * Evaluates a complete Preflop -> Flop -> Turn -> River hand line or compares two alternate branches.
 */
export function evaluateFullHandLineAndBranchComparison({
  gameId = 'cash-005',
  variant = 'nlh',
  bettingStructure = null,
  format = 'cash',
  heroCards = ['As', 'Kd'],
  fullBoardCards = ['Qs', '8s', '3d', 'Jh', '2c'],
  heroPosition = 'BTN',
  villainPosition = 'BB',
  basePotBb = 6.5,
  effectiveStackBb = 100,
  chosenBranch = 'aggressive_line',
} = {}) {
  const normVariant = normalizeVariant(variant);
  const cleanBoard = Array.isArray(fullBoardCards) && fullBoardCards.length >= 5
    ? fullBoardCards.slice(0, 5)
    : ['Qs', '8s', '3d', 'Jh', '2c'];

  const streetConfigs = [
    { street: 'preflop', board: [], potBb: 2.5, toCallBb: 1.5 },
    { street: 'flop', board: cleanBoard.slice(0, 3), potBb: Number(basePotBb) || 6.5, toCallBb: 0 },
    { street: 'turn', board: cleanBoard.slice(0, 4), potBb: Number(((Number(basePotBb) || 6.5) * 2.1).toFixed(1)), toCallBb: 4 },
    { street: 'river', board: cleanBoard.slice(0, 5), potBb: Number(((Number(basePotBb) || 6.5) * 4.2).toFixed(1)), toCallBb: 9 },
  ];

  const streetEvaluations = streetConfigs.map((cfg) => {
    const ev = evaluateTrainingSpotWithHorseBrain({
      gameId,
      variant: normVariant,
      bettingStructure,
      format,
      street: cfg.street,
      heroCards,
      boardCards: cfg.board,
      potSizeBb: cfg.potBb,
      facingBetBb: cfg.toCallBb,
      effectiveStackBb,
      heroPosition,
      villainPosition,
    });
    const topActionEv = Number(ev?.actionEVs?.[ev?.correctAnswer] ?? 1.25);
    return {
      street: cfg.street,
      boardCards: cfg.board,
      potBb: cfg.potBb,
      recommendedAction: ev?.recommendedAction || 'Check',
      handScore: Number(ev?.handScore ?? 55),
      madeHandCategory: ev?.madeHandCategory || 'Made Hand',
      optimalEvBb: Number(topActionEv.toFixed(2)),
    };
  });

  const aggressiveLineEvBb = Number(
    streetEvaluations.reduce((sum, s) => sum + s.optimalEvBb, 0).toFixed(2),
  );
  const passivePotControlEvBb = Number((aggressiveLineEvBb * 0.78).toFixed(2));
  const bluffCatchLineEvBb = Number((aggressiveLineEvBb * 0.86).toFixed(2));

  const branchesMap = {
    aggressive_line: {
      key: 'aggressive_line',
      branchId: 'aggressive_line',
      label: 'GTO Aggressive Value / Barrel Line',
      totalEvBb: aggressiveLineEvBb,
      evDeltaVsOptimalBb: 0,
    },
    pot_control_line: {
      key: 'pot_control_line',
      branchId: 'pot_control_line',
      label: 'Check-Call Pot-Control Branch',
      totalEvBb: passivePotControlEvBb,
      evDeltaVsOptimalBb: Number((passivePotControlEvBb - aggressiveLineEvBb).toFixed(2)),
    },
    bluff_catch_line: {
      key: 'bluff_catch_line',
      branchId: 'bluff_catch_line',
      label: 'Delayed Turn Probe / River Bluff-Catch Branch',
      totalEvBb: bluffCatchLineEvBb,
      evDeltaVsOptimalBb: Number((bluffCatchLineEvBb - aggressiveLineEvBb).toFixed(2)),
    },
  };

  const branches = Object.values(branchesMap);
  const activeBranch = branchesMap[chosenBranch] || branchesMap.aggressive_line;

  return {
    ok: true,
    variant: normVariant,
    engineModule: streetEvaluations[1]?.engineModule || 'holdem-brain.js',
    streetEvaluations,
    branches,
    branchesMap,
    activeBranch,
    optimalTotalEvBb: aggressiveLineEvBb,
  };
}

