/**
 * Poker Brain - Decision Bridge
 * =============================
 * Glue between the raw matcher output (hole/board cards with confidence) and
 * the real decision engine in engine.js.
 *
 * Responsibilities:
 *   - Convert matcher card objects ({rank, suit, confidence, key}) to the
 *     shape engine expects ({rank, suit})
 *   - Enforce a confidence floor - low-confidence matches are dropped and
 *     reported as unknown so the engine does not get garbage input
 *   - Handle partial-board cases (e.g., 2 of 3 flop cards matched) by either
 *     refusing to call the engine or degrading gracefully to preflop
 *   - Estimate remaining game state fields (pot, stack, players, position)
 *     from whatever signals the HUD has available (OCR output, user input,
 *     defaults)
 *   - Return a unified object with the engine decision plus metadata the
 *     HUD needs to render confidence indicators and explain the reasoning
 *
 * Pure JS. Imports engine.js (default export PokerBrainEngine).
 */

import PokerBrainEngine from './engine';

const DEFAULT_CONFIDENCE_FLOOR = 0.80;  // 80% match confidence required
const STRONG_CONFIDENCE_FLOOR  = 0.90;  // Used for high-stakes decisions

/**
 * Extract and filter cards from matcher output.
 * Returns { cards, hadUnknown, minConfidence, dropped } so the caller knows
 * exactly how much of the input survived the confidence filter.
 */
export function extractCards(matcherCards, confidenceFloor = DEFAULT_CONFIDENCE_FLOOR) {
  if (!Array.isArray(matcherCards) || matcherCards.length === 0) {
    return { cards: [], hadUnknown: false, minConfidence: 1, dropped: 0 };
  }
  const cards = [];
  let dropped = 0;
  let minConfidence = 1;
  for (const c of matcherCards) {
    if (!c || c.rank == null || c.suit == null) {
      dropped += 1;
      continue;
    }
    const conf = typeof c.confidence === 'number' ? c.confidence : 0;
    if (conf < confidenceFloor) {
      dropped += 1;
      continue;
    }
    cards.push({ rank: c.rank.toUpperCase(), suit: c.suit.toLowerCase() });
    if (conf < minConfidence) minConfidence = conf;
  }
  return {
    cards,
    hadUnknown: dropped > 0,
    minConfidence: cards.length > 0 ? minConfidence : 0,
    dropped,
  };
}

/**
 * Main entry point. Returns a decision object shaped for the HUD:
 *   {
 *     ready: boolean,          // true if engine produced a real decision
 *     reason: string,          // explanation of why not (if !ready)
 *     action, raiseAmount, confidence, reasoning, equity, potOdds,
 *     street, handStrength, holeCards, boardCards,
 *     detection: { holeConfidence, boardConfidence, unknownCount },
 *   }
 */
export function getBridgedDecision(input) {
  const {
    rawHoleCards = [],
    rawBoardCards = [],
    gameType = 'nlhe',
    potSize = 0,
    betToCall = 0,
    stackSize = 0,
    bigBlind = 0,
    position = 'middle',
    numPlayers = 6,
    blindLevel = 1,
    isTournament = false,
    tournamentStage = 'early',
    preflopAction = null, // optional override: rfi/vs_limp/vs_raise/vs_3bet/vs_4bet
    confidenceFloor = DEFAULT_CONFIDENCE_FLOOR,
  } = input;

  const holeResult = extractCards(rawHoleCards, confidenceFloor);
  const boardResult = extractCards(rawBoardCards, confidenceFloor);

  const hole = holeResult.cards;
  const board = boardResult.cards;
  const unknownCount = holeResult.dropped + boardResult.dropped;

  // Too few hole cards - we are not in a hand or detection is broken
  if (hole.length < 2) {
    return {
      ready: false,
      reason: hole.length === 0
        ? 'No hole cards detected yet - waiting for deal'
        : 'Only one hole card detected - waiting for second card',
      action: 'WAIT',
      street: 'waiting',
      holeCards: hole,
      boardCards: board,
      detection: {
        holeConfidence: holeResult.minConfidence,
        boardConfidence: boardResult.minConfidence,
        unknownCount,
      },
    };
  }

  // Partial board (1 or 2 flop cards) - too early to eval, treat as preflop
  let effectiveBoard = board;
  let street = 'preflop';
  if (board.length === 0) {
    street = 'preflop';
  } else if (board.length === 3) {
    street = 'flop';
  } else if (board.length === 4) {
    street = 'turn';
  } else if (board.length === 5) {
    street = 'river';
  } else {
    // 1 or 2 board cards: mid-deal transient. Fall back to preflop.
    street = 'preflop';
    effectiveBoard = [];
  }

  // Call the real engine
  let engineResult;
  try {
    engineResult = PokerBrainEngine.getDecision({
      gameType,
      holeCards: hole,
      boardCards: effectiveBoard,
      potSize,
      betToCall,
      stackSize,
      bigBlind,
      position,
      numPlayers,
      street,
      blindLevel,
      preflopAction,
      istournament: isTournament,
      tournamentStage,
    });
  } catch (err) {
    return {
      ready: false,
      reason: 'Engine error: ' + (err.message || 'unknown'),
      action: 'WAIT',
      street,
      holeCards: hole,
      boardCards: board,
      detection: {
        holeConfidence: holeResult.minConfidence,
        boardConfidence: boardResult.minConfidence,
        unknownCount,
      },
    };
  }

  // Hand strength label (for UI, computed from current made hand)
  let handStrength = null;
  let texture = null;
  if (effectiveBoard.length >= 3) {
    try {
      const best = PokerBrainEngine.getBestFiveCardFromCards([...hole, ...effectiveBoard]);
      if (best) handStrength = best.name || best.rank;
    } catch (err) { /* swallow */ }
    try {
      texture = PokerBrainEngine.classifyTexture(effectiveBoard);
    } catch (err) { /* swallow */ }
  }
  // Outs counter only meaningful on flop/turn with full hole + board
  let outs = 0;
  let outsImproves = [];
  if (effectiveBoard.length === 3 || effectiveBoard.length === 4) {
    try {
      const o = PokerBrainEngine.countOuts(hole, effectiveBoard);
      outs = o.outs;
      outsImproves = o.improves || [];
    } catch (err) { /* swallow */ }
  }
  const spr = PokerBrainEngine.calculateStackToPot(stackSize, potSize);

  return {
    ready: true,
    reason: null,
    action: engineResult.action,
    raiseAmount: engineResult.raiseAmount,
    confidence: engineResult.confidence,
    reasoning: engineResult.reasoning,
    equity: engineResult.equity,
    potOdds: engineResult.potOdds,
    street,
    handStrength,
    texture,
    outs,
    outsImproves,
    spr: Number.isFinite(spr) ? Math.round(spr * 10) / 10 : null,
    holeCards: hole,
    boardCards: effectiveBoard,
    detection: {
      holeConfidence: holeResult.minConfidence,
      boardConfidence: boardResult.minConfidence,
      unknownCount,
    },
  };
}

/**
 * Lightweight street derivation used when we do not want to run the engine
 * but still need to know what street we are on.
 */
export function streetFromBoardLength(holeLen, boardLen) {
  if (holeLen < 2) return 'waiting';
  if (boardLen === 0) return 'preflop';
  if (boardLen === 3) return 'flop';
  if (boardLen === 4) return 'turn';
  if (boardLen === 5) return 'river';
  return 'transient';
}

export const DECISION_CONFIDENCE = {
  DEFAULT_FLOOR: DEFAULT_CONFIDENCE_FLOOR,
  STRONG_FLOOR: STRONG_CONFIDENCE_FLOOR,
};

export default { getBridgedDecision, extractCards, streetFromBoardLength, DECISION_CONFIDENCE };
