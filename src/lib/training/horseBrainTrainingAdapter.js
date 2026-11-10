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
import tournamentBrain from '../poker-engine/brain/tournament-brain.js';

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
});

export const EXPECTED_BOARD_CARDS_BY_STREET = Object.freeze({
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
});

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
} = {}) {
  const normVariant = String(variant || 'nlh').trim().toLowerCase();
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

  // Pot-Limit rule: max total bet/raise = current pot + 2 * callAmount, capped at effectiveStack
  const rawMaxPotAction = Number((numericPot + 2 * numericToCall).toFixed(2));
  const maxPotBetOrRaise = Number(Math.min(numericStack, rawMaxPotAction).toFixed(2));
  const halfPotBetOrRaise = Number(Math.min(numericStack, Math.max(1, (numericPot + numericToCall) * 0.5 + numericToCall)).toFixed(2));
  const twoThirdsPotBetOrRaise = Number(Math.min(numericStack, Math.max(1, (numericPot + numericToCall) * 0.67 + numericToCall)).toFixed(2));
  const thirdPotBet = Number(Math.min(numericStack, Math.max(1, numericPot * 0.33)).toFixed(2));
  const threeQuarterPotBet = Number(Math.min(numericStack, Math.max(1, numericPot * 0.75)).toFixed(2));

  return {
    ok: true,
    variant: normVariant,
    street: normStreet,
    heroCards: normalizedHero,
    boardCards: normalizedBoard,
    pot: numericPot,
    toCall: numericToCall,
    effectiveStack: numericStack,
    isPotLimit: normVariant.startsWith('plo'),
    potLimitBounds: {
      formula: 'maxRaise = min(effectiveStack, pot + 2 * callAmount)',
      rawMaxPotAction,
      maxPotBetOrRaise,
      threeQuarterPotBet,
      twoThirdsPotBetOrRaise,
      halfPotBetOrRaise,
      thirdPotBet,
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
    const parsed = parseCards(normalized);
    return {
      notation: formatHandString(normalized[0], normalized[1]),
      cards: normalized,
      strength: getPreflopStrength(parsed),
    };
  }
  const pairs = combinations(normalized, 2);
  let best = null;
  for (const pair of pairs) {
    const parsed = parseCards(pair);
    const strength = getPreflopStrength(parsed);
    const notation = formatHandString(pair[0], pair[1]);
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
  const straightDraw = countStraightOuts(parsedHero, parsedBoard);
  const holeRanks = parsedHero.map((c) => c.value);
  const boardRanks = parsedBoard.map((c) => c.value);
  const wrapDraw = detectPLOWrapDraw(holeRanks, boardRanks);

  return {
    madeHand,
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
  variant = 'nlh',
  street = 'flop',
  heroCards = ['As', 'Kd'],
  boardCards,
  board,
  heroPosition = 'BTN',
  villainPosition = 'BB',
  pot = 6.5,
  toCall = 0,
  stackDepth,
  effectiveStackBb,
  isPKO = false,
  bountyBb = null,
  isICM = false,
  bubbleFactor = null,
  payoutPressure = null,
  villainStats = null,
  villainArchetype = null,
} = {}) {
  const resolvedBoardCards = boardCards !== undefined
    ? boardCards
    : board !== undefined
      ? board
      : String(street || '').toLowerCase() === 'preflop'
        ? []
        : ['Qs', '7d', '2c'];
  const resolvedStackDepth = Number.isFinite(Number(stackDepth))
    ? Number(stackDepth)
    : Number.isFinite(Number(effectiveStackBb))
      ? Number(effectiveStackBb)
      : 100;
  const validation = validateDealAndPotLimitBounds({
    variant,
    street,
    heroCards,
    boardCards: resolvedBoardCards,
    pot,
    toCall,
    effectiveStack: resolvedStackDepth,
  });

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const {
    variant: normVariant,
    street: normStreet,
    heroCards: cleanHero,
    boardCards: cleanBoard,
    pot: cleanPot,
    toCall: cleanToCall,
    effectiveStack: cleanStack,
    isPotLimit,
    potLimitBounds,
  } = validation;

  const parsedHero = parseCards(cleanHero);
  const parsedBoard = parseCards(cleanBoard);
  const primarySubset = resolvePrimaryTwoCardSubset(cleanHero);
  const isIP = ['BTN', 'CO'].includes(String(heroPosition || '').toUpperCase())
    && !['BTN'].includes(String(villainPosition || '').toUpperCase());

  // Build legal actions for the brain's decision function
  const maxBetOrRaise = isPotLimit
    ? potLimitBounds.maxPotBetOrRaise
    : cleanStack;
  const minBetOrRaise = cleanToCall > 0
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
    numActivePlayers: 2,
    numPlayers: 6,
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

    if (normVariant === 'nlh') {
      engineModule = 'holdem-brain.js';
      const preflopStrength = getPreflopStrength(parsedHero);
      if (normStreet === 'preflop') {
        handScore = preflopStrength;
        madeHandCategory = parsedHero[0].value === parsedHero[1].value
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
      const preflopEval = classifyPLOPreflop(parsedHero);
      preflopProfile = preflopEval;
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
      isNutFlushDraw = Boolean(omahaEval.flushDraw?.isNutFlushDraw || omahaEval.flushDraw?.isNut);
      straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
      wrapType = omahaEval.wrapDraw?.wrapType || omahaEval.straightDraw?.type || 'none';
      if (normStreet === 'preflop') {
        handScore = Number(preflopEval.score) || 50;
        madeHandCategory = `PLO4 ${preflopEval.tier} (${preflopEval.suitCategory})`;
      } else {
        const drawBonus = Math.min(28, flushOuts * 1.6 + straightOuts * 1.2);
        handScore = Math.min(100, Math.round((Number(omahaEval.madeHand?.strength) || 35) + drawBonus));
        madeHandCategory = omahaEval.madeHand?.category || omahaEval.madeHand?.description || 'plo4_hand';
        boardProfile = analyzePLOBoardTexture(parsedBoard);
      }
      rawBrainDecision = makePLOFallbackDecision('hero-brain', gameState, brainLegalActions);
    } else if (normVariant === 'plo5') {
      engineModule = 'plo5-brain.js';
      const preflopEval = scorePLO5Hand(parsedHero);
      preflopProfile = preflopEval;
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      if (normStreet === 'preflop') {
        handScore = Number(preflopEval.score) || 50;
        madeHandCategory = `PLO5 ${preflopEval.category} (${preflopEval.suitPattern}${preflopEval.hasDangler ? ', dangler' : ', coordinated'})`;
      } else {
        const boardTex = analyzePLOBoardTexture(parsedBoard);
        const draws5 = classifyPLO5Draws(parsedHero, parsedBoard, omahaEval.madeHand);
        const flushHier5 = evaluatePLO5FlushHierarchy(parsedHero, parsedBoard);
        const adjStrengthObj = adjustPLO5PostflopStrength(omahaEval.madeHand, boardTex, parsedHero, parsedBoard);
        const adjBase = Number(adjStrengthObj?.adjustedStrength ?? adjStrengthObj ?? omahaEval.madeHand?.strength) || 35;
        flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
        isNutFlushDraw = Boolean(draws5?.nutFlushDraw || flushHier5?.hasNutFlushDraw || omahaEval.flushDraw?.isNutFlushDraw);
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
      const preflopEval = scorePLO6Hand(parsedHero);
      preflopProfile = preflopEval;
      const omahaEval = evaluateOmahaExactTwoPlusThree(cleanHero, cleanBoard);
      bestTwoHoleCards = omahaEval.bestTwoHoleCards;
      bestThreeBoardCards = omahaEval.bestThreeBoardCards;
      if (normStreet === 'preflop') {
        handScore = Number(preflopEval.score) || 50;
        madeHandCategory = `PLO6 ${preflopEval.category} (${preflopEval.suitPattern}, ${preflopEval.danglerCount || 0} danglers)`;
      } else {
        const boardTex = analyzePLOBoardTexture(parsedBoard);
        const draws6 = classifyPLO6Draws(parsedHero, parsedBoard, omahaEval.madeHand);
        const flushHier6 = evaluatePLO6FlushHierarchy(parsedHero, parsedBoard);
        const blockerVal6 = getPLO6BlockerValue(parsedHero, parsedBoard);
        const adjStrengthObj = adjustPLO6PostflopStrength(omahaEval.madeHand, boardTex, parsedHero, parsedBoard);
        const adjBase = Number(adjStrengthObj?.adjustedStrength ?? adjStrengthObj ?? omahaEval.madeHand?.strength) || 35;
        flushOuts = Number(omahaEval.flushDraw?.outs) || 0;
        isNutFlushDraw = Boolean(draws6?.nutFlushDraw || flushHier6?.hasNutFlushDraw || omahaEval.flushDraw?.isNutFlushDraw);
        straightOuts = Math.max(Number(omahaEval.straightDraw?.outs) || 0, Number(omahaEval.wrapDraw?.wrapOuts) || 0);
        const totalCleanOuts = Math.max(Number(draws6?.totalOuts) || 0, flushOuts + straightOuts);
        wrapType = draws6?.drawLabel || omahaEval.wrapDraw?.wrapType || 'none';
        handScore = Math.min(100, Math.round(adjBase + Math.min(36, totalCleanOuts * 2.1) + (isNutFlushDraw ? 8 : 0) + (blockerVal6?.hasNutBlocker ? 5 : 0)));
        madeHandCategory = `${omahaEval.madeHand?.category || 'plo6_hand'} (${draws6?.drawLabel || 'nut-focused'})`;
        boardProfile = boardTex;
      }
      rawBrainDecision = makePLO6Decision('hero-brain', gameState, brainLegalActions);
    }

    // Apply Tournament ICM / Bubble Factor adjustments via `tournament-brain.js`
    let icmAdjustment = null;
    const numericBubbleFactor = Number.isFinite(Number(bubbleFactor)) && Number(bubbleFactor) > 1
      ? Number(bubbleFactor)
      : isICM ? 1.65 : 1.0;

    if (isICM || numericBubbleFactor > 1.05) {
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
    if (isPotLimit) {
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

    const omahaRuleSummary = isPotLimit && cleanBoard.length >= 3
      ? `Omaha 2-Hole + 3-Board Evaluation (${engineModule}): Best 5-card hand uses hole [${bestTwoHoleCards.join(' ')}] + board [${bestThreeBoardCards.join(' ')}] → ${madeHandCategory} (Flush Outs: ${flushOuts}${isNutFlushDraw ? ' [Nut]' : ''}, Straight/Wrap Outs: ${straightOuts}${wrapType !== 'none' ? ` [${wrapType}]` : ''}). Pot-Limit max action = pot (${cleanPot} BB) + 2 × call (${cleanToCall} BB) = ${potLimitBounds.maxPotBetOrRaise} BB.`
      : isPotLimit
        ? `Omaha Preflop Evaluation (${engineModule}): ${madeHandCategory} (Primary 2-card subset: ${primarySubset.notation}, Score: ${handScore}/100). Pot-Limit max raise = ${potLimitBounds.maxPotBetOrRaise} BB.`
        : `Hold'em Evaluation (${engineModule}): Hero [${cleanHero.join(' ')}] (${primarySubset.notation}) on ${cleanBoard.length ? `[${cleanBoard.join(' ')}]` : 'Preflop'} → ${madeHandCategory} (Strength: ${handScore}/100).`;

    const contextNotes = [
      omahaRuleSummary,
      icmAdjustment ? `ICM / Payout Pressure (tournament-brain.js): ${icmAdjustment.payoutPressure} tightens continuation threshold by ${icmAdjustment.tightenPercent}%.` : null,
      pkoBountyAdjustment ? `PKO Bounty Math: ${pkoBountyAdjustment.bountyBb} BB bounty adds +${pkoBountyAdjustment.bountyChipEquivalenceBb} BB chip equivalence (-${pkoBountyAdjustment.effectivePotOddsDiscountPct}% required equity).` : null,
      hudExploitAdjustment ? `Exploit Telemetry: ${hudExploitAdjustment.note}` : null,
      `Optimal play: ${options[bestIdx].text} (${gtoFrequencies[correctAnswer]}% frequency, ${actionEVs[correctAnswer] >= 0 ? '+' : ''}${actionEVs[correctAnswer]} BB EV).`,
    ].filter(Boolean);

    const explanation = contextNotes.join(' ');

    const brainEvaluation = {
      engineModule,
      variant: normVariant,
      street: normStreet,
      handScore,
      madeHandCategory,
      primaryTwoCardSubset: primarySubset.notation,
      omahaBestTwoHole: isPotLimit ? bestTwoHoleCards : null,
      omahaBestThreeBoard: isPotLimit && cleanBoard.length >= 3 ? bestThreeBoardCards : null,
      flushOuts,
      isNutFlushDraw,
      straightOuts,
      wrapType,
      potLimitBounds,
      icmAdjustment,
      pkoBountyAdjustment,
      hudExploitAdjustment,
      rawBrainDecision,
    };

    const structuredExplanation = {
      verdict: `${options[bestIdx].text} is the highest-EV action (${gtoFrequencies[correctAnswer]}% frequency, ${actionEVs[correctAnswer] >= 0 ? '+' : ''}${actionEVs[correctAnswer]} BB).`,
      why: omahaRuleSummary,
      keyFactors: [
        `Engine Authority: ${engineModule} (${normVariant.toUpperCase()} ${normStreet.toUpperCase()})`,
        `Hero Holding: ${cleanHero.join(' ')} (${madeHandCategory}, Score ${handScore}/100)`,
        isPotLimit
          ? `Pot-Limit Sizing Bound: max = ${cleanPot} + 2×${cleanToCall} = ${potLimitBounds.maxPotBetOrRaise} BB`
          : `Effective Stack: ${cleanStack} BB | Pot: ${cleanPot} BB`,
        ...(icmAdjustment ? [`ICM Pressure: BF ${icmAdjustment.bubbleFactor}x (${icmAdjustment.payoutPressure})`] : []),
        ...(pkoBountyAdjustment ? [`PKO Bounty: ${pkoBountyAdjustment.bountyBb} BB (+${pkoBountyAdjustment.bountyChipEquivalenceBb} BB chip eq)`] : []),
        ...(hudExploitAdjustment ? [`Villain HUD: VPIP ${hudExploitAdjustment.vpip}% / PFR ${hudExploitAdjustment.pfr}% (${hudExploitAdjustment.profile})`] : []),
      ],
      takeaway: explanation,
    };

    return {
      ok: true,
      options,
      correctAnswer,
      correctAnswerText: options[bestIdx]?.text || correctAnswer,
      gtoFrequencies,
      actionEVs,
      evLoss: 0,
      handScore,
      madeHandCategory,
      primaryTwoCardSubset: primarySubset.notation,
      potLimitSizing: potLimitBounds,
      brainEvaluation,
      explanation,
      structuredExplanation,
    };
  });
}
