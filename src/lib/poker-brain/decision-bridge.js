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

  // Variant-aware hole-card validation. PLO requires 4, PLO5 = 5, PLO6 = 6.
  const requiredHole = PokerBrainEngine.expectedHoleCount(gameType);
  if (hole.length < requiredHole) {
    return {
      ready: false,
      reason: hole.length === 0
        ? `No hole cards detected yet - waiting for deal (${gameType.toUpperCase()} needs ${requiredHole})`
        : `Only ${hole.length}/${requiredHole} hole cards detected - waiting for all cards`,
      action: 'WAIT',
      street: 'waiting',
      variant: gameType,
      requiredHoleCount: requiredHole,
      holeCards: hole,
      boardCards: board,
      detection: {
        holeConfidence: holeResult.minConfidence,
        boardConfidence: boardResult.minConfidence,
        unknownCount,
      },
    };
  }
  // If we have MORE cards than the variant expects (e.g. PLO5 hand on a
  // PLO detection run), drop the extras deterministically so the engine
  // gets the right shape. This can happen during variant switching.
  const holeTrimmed = hole.length > requiredHole ? hole.slice(0, requiredHole) : hole;

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
      holeCards: holeTrimmed,
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

  // Hand strength label (for UI, computed from current made hand).
  // For Omaha variants we must honor the 2-from-hole rule, which
  // getBestFiveCardFromCards does NOT enforce. So we iterate explicit
  // 2-from-hole / 3-from-board combos when isOmaha.
  let handStrength = null;
  let texture = null;
  const isOmahaVariant = PokerBrainEngine.isHiLoVariant
    ? String(gameType).toLowerCase().includes('plo')
    : false;
  if (effectiveBoard.length >= 3) {
    try {
      if (isOmahaVariant) {
        let best = null;
        for (let i = 0; i < holeTrimmed.length; i++) {
          for (let j = i + 1; j < holeTrimmed.length; j++) {
            for (let a = 0; a < effectiveBoard.length; a++) {
              for (let b = a + 1; b < effectiveBoard.length; b++) {
                for (let c = b + 1; c < effectiveBoard.length; c++) {
                  const five = [holeTrimmed[i], holeTrimmed[j], effectiveBoard[a], effectiveBoard[b], effectiveBoard[c]];
                  const h = PokerBrainEngine.getBestFiveCardFromCards(five);
                  if (h && (!best || h.score > best.score)) best = h;
                }
              }
            }
          }
        }
        if (best) handStrength = best.name || best.rank;
      } else {
        const best = PokerBrainEngine.getBestFiveCardFromCards([...holeTrimmed, ...effectiveBoard]);
        if (best) handStrength = best.name || best.rank;
      }
    } catch (err) { /* swallow */ }
    try {
      texture = PokerBrainEngine.classifyTexture(effectiveBoard);
    } catch (err) { /* swallow */ }
  }
  // Outs counter only meaningful on flop/turn with full hole + board.
  // countOuts assumes 2-card hole; skip for Omaha variants.
  let outs = 0;
  let outsImproves = [];
  if (!isOmahaVariant && (effectiveBoard.length === 3 || effectiveBoard.length === 4)) {
    try {
      const o = PokerBrainEngine.countOuts(holeTrimmed, effectiveBoard);
      outs = o.outs;
      outsImproves = o.improves || [];
    } catch (err) { /* swallow */ }
  }
  const spr = PokerBrainEngine.calculateStackToPot(stackSize, potSize);
  const bbStack = bigBlind > 0 ? stackSize / bigBlind : null;
  const mRatio = PokerBrainEngine.calculateM(stackSize, bigBlind, numPlayers);
  // Push-fold hint for tournament short stacks
  let pushFoldHint = null;
  if (isTournament && !isOmahaVariant && street === 'preflop' && bbStack != null && bbStack <= 20) {
    try {
      const range = PokerBrainEngine.getPushFoldRange(bbStack);
      if (range && holeTrimmed.length >= 2) {
        const code = PokerBrainEngine.getHandType(holeTrimmed[0], holeTrimmed[1]);
        const normalized = code;
        pushFoldHint = {
          bbStack: Math.round(bbStack * 10) / 10,
          handCode: normalized,
          inRange: range.has(normalized),
        };
      }
    } catch (err) { /* swallow */ }
  }

  return {
    ready: true,
    reason: null,
    action: engineResult.action,
    raiseAmount: engineResult.raiseAmount,
    confidence: engineResult.confidence,
    reasoning: engineResult.reasoning,
    equity: engineResult.equity,
    potOdds: engineResult.potOdds,
    highEquity: engineResult.highEquity,
    lowEquity: engineResult.lowEquity,
    bubbleFactor: engineResult.bubbleFactor,
    bbStack: engineResult.bbStack,
    variant: engineResult.variant || gameType,
    isHiLo: !!engineResult.isHiLo,
    isOmaha: !!engineResult.isOmaha,
    street,
    handStrength,
    texture,
    outs,
    outsImproves,
    spr: Number.isFinite(spr) ? Math.round(spr * 10) / 10 : null,
    mRatio: Number.isFinite(mRatio) ? Math.round(mRatio * 10) / 10 : null,
    pushFoldHint,
    isTournament,
    tournamentStage,
    holeCards: holeTrimmed,
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
