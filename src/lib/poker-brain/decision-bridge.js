/**
 * Poker Brain - Decision Bridge
 * =============================
 * Glue between the raw matcher output (hole/board cards with confidence) and
 * the FULL Horse Brain decision engine via the /api/poker-brain/decide route.
 *
 * Architecture:
 *   The Horse Brain (20,000+ lines, 32 anti-exploit modules, GTO solver,
 *   personality overlays, live opponent modeling, tournament ICM, PLO variant
 *   brains) runs SERVER-SIDE via the API route. This bridge:
 *
 *   1. Filters cards by confidence floor (same as before)
 *   2. POSTs the OCR state to /api/poker-brain/decide
 *   3. The server runs the FULL Horse Brain pipeline (router.getDecision)
 *   4. Returns the recommendation for the HUD popup
 *
 *   The local engine.js is kept ONLY as a fast offline fallback if the API
 *   is unreachable. The Horse Brain is the primary decision source.
 *
 * The HUD user sees the same quality recommendation a Horse would get —
 * they just click the buttons themselves.
 */

import PokerBrainEngine from './engine.js';
// NOTE: ../supabase.js is a no-op mock for Node ESM test runner.
// In Next.js (Webpack), the alias in next.config.js forces resolution
// to supabase.ts (real client). See next.config.js webpack section.
import { supabase } from '../supabase.js';

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
 * Call the FULL Horse Brain via the server-side API route.
 * This gives the HUD user 100% of the same decision engine that
 * the automated Horses use — all 32 anti-exploit modules, GTO solver,
 * PLO/PLO5/PLO6/PLO8 variant brains, tournament ICM, opponent modeling.
 *
 * @param {object} params - OCR-scraped game state
 * @param {string} authToken - Supabase JWT for authentication
 * @returns {Promise<object|null>} Horse Brain decision or null on failure
 */
/**
 * Retry config for Horse Brain API. Exponential backoff with jitter.
 * Max 2 retries (3 total attempts) to keep latency under ~1.5s.
 */
const HB_MAX_RETRIES = 2;
const HB_BASE_DELAY_MS = 150;

async function callHorseBrain(params, authToken) {
  let lastErr = null;
  for (let attempt = 0; attempt <= HB_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch('/api/poker-brain/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(params),
      });
      if (resp.ok) {
        try { return await resp.json(); }
        catch (jsonErr) { lastErr = jsonErr; continue; }
      }
      // 4xx = client error, don't retry
      if (resp.status >= 400 && resp.status < 500) return null;
      // 5xx = server error, retry
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      lastErr = err;
    }
    // Exponential backoff with jitter before retry
    if (attempt < HB_MAX_RETRIES) {
      const delay = HB_BASE_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.warn('[decision-bridge] Horse Brain API unreachable after retries, falling back to local engine:', lastErr?.message);
  return null;
}

/**
 * Get the current Supabase auth token for API calls.
 * Returns null if not authenticated.
 */
async function getAuthToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch (err) {
    return null;
  }
}

/**
 * Main entry point — ASYNC. Calls the full Horse Brain server-side.
 * Falls back to the local engine only if the API is unreachable.
 *
 * Returns a decision object shaped for the HUD:
 *   {
 *     ready: boolean,          // true if engine produced a real decision
 *     reason: string,          // explanation of why not (if !ready)
 *     action, raiseAmount, confidence, reasoning, equity, potOdds,
 *     street, handStrength, holeCards, boardCards,
 *     source: 'horse_brain' | 'local_fallback',
 *     engineMs: number,        // server-side computation time (ms)
 *     detection: { holeConfidence, boardConfidence, unknownCount },
 *   }
 */
export async function getBridgedDecision(input) {
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
    actionSummary = null, // from ActionTracker: { numLimpers, lastRaiser, preflopAction, ... }
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

  // ═══════════════════════════════════════════════════════════════════
  // PRIMARY: Call the FULL Horse Brain via server-side API
  // This gives the HUD user 100% of the same decision engine as Horses
  // ═══════════════════════════════════════════════════════════════════
  const authToken = await getAuthToken();
  if (authToken) {
    // Convert card objects to string format the API expects: ['As', 'Kh']
    const holeStrings = holeTrimmed.map(c => `${c.rank}${c.suit}`);
    const boardStrings = effectiveBoard.map(c => `${c.rank}${c.suit}`);

    const horseBrainResult = await callHorseBrain({
      holeCards: holeStrings,
      boardCards: boardStrings,
      potSize,
      betToCall,
      stackSize,
      bigBlind,
      position,
      numPlayers,
      gameType,
      street,
      isTournament,
      tournamentStage,
      villainStacks: input.villainStacks || {},
      // ActionTracker-derived opponent context (replaces hardcoded nulls in API)
      numLimpers: actionSummary?.numLimpers ?? 0,
      lastRaiser: actionSummary?.lastRaiser ?? null,
      preflopAction: actionSummary?.preflopAction ?? preflopAction ?? null,
      raiseCount: actionSummary?.raiseCount ?? 0,
      numCallers: actionSummary?.numCallers ?? 0,
      activePlayers: actionSummary?.activePlayers ?? numPlayers,
    }, authToken);

    if (horseBrainResult && horseBrainResult.action) {
      // Horse Brain returned a valid decision — use it.
      // Compute supplemental client-side metadata (hand strength label,
      // texture, outs) for the HUD display since the Horse Brain API
      // returns the action decision but the HUD needs visual context too.
      const warnings = [];
      // If Horse Brain returned a warning (e.g. invalid router result, defaulted to CHECK),
      // flag this decision as degraded so the HUD can display a visual indicator.
      const degraded = !!horseBrainResult.warning;
      if (horseBrainResult.warning) {
        warnings.push(`[horseBrain] ${horseBrainResult.warning}`);
      }
      let handStrength = null;
      let texture = null;
      const isOmahaVariant = String(gameType).toLowerCase().includes('plo');
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
        } catch (err) { warnings.push(`[handStrength] ${err.message}`); }
        try {
          texture = PokerBrainEngine.classifyTexture(effectiveBoard);
        } catch (err) { warnings.push(`[texture] ${err.message}`); }
      }
      // PLO Hi-Lo: evaluate best low hand (2 from hole + 3 from board, Omaha rules)
      let lowHandStrength = null;
      const isHiLo = String(gameType).includes('hilo') || String(gameType).includes('plo8');
      if (isHiLo && effectiveBoard.length >= 3 && PokerBrainEngine.getBestLowFromCards) {
        try {
          // Omaha low: must use exactly 2 hole cards + 3 board cards
          let bestLow = null;
          for (let i = 0; i < holeTrimmed.length; i++) {
            for (let j = i + 1; j < holeTrimmed.length; j++) {
              for (let a = 0; a < effectiveBoard.length; a++) {
                for (let b = a + 1; b < effectiveBoard.length; b++) {
                  for (let c = b + 1; c < effectiveBoard.length; c++) {
                    const five = [holeTrimmed[i], holeTrimmed[j], effectiveBoard[a], effectiveBoard[b], effectiveBoard[c]];
                    const low = PokerBrainEngine.getBestLowFromCards(five);
                    if (low && (!bestLow || low.score < bestLow.score)) bestLow = low;
                  }
                }
              }
            }
          }
          if (bestLow) lowHandStrength = bestLow.rank;
        } catch (err) { warnings.push(`[lowHand] ${err.message}`); }
      }
      let outs = 0;
      let outsImproves = [];
      if (!isOmahaVariant && (effectiveBoard.length === 3 || effectiveBoard.length === 4)) {
        try {
          const o = PokerBrainEngine.countOuts(holeTrimmed, effectiveBoard);
          outs = o.outs;
          outsImproves = o.improves || [];
        } catch (err) { warnings.push(`[outs] ${err.message}`); }
      }
      const spr = PokerBrainEngine.calculateStackToPot(stackSize, potSize);
      const bbStack = bigBlind > 0 ? stackSize / bigBlind : null;
      const mRatio = PokerBrainEngine.calculateM(stackSize, bigBlind, numPlayers);

      // Map Horse Brain action to HUD display — the API already returns
      // uppercase action names (FOLD, CALL, RAISE, etc.)
      const action = horseBrainResult.action;
      const amount = horseBrainResult.amount;

      return {
        ready: true,
        reason: null,
        action,
        raiseAmount: amount,
        confidence: 95, // Horse Brain is high-confidence by design (0-100 scale, matching engine convention)
        reasoning: `Horse Brain [${horseBrainResult.variant || gameType}] ${horseBrainResult.street || street} - ${horseBrainResult.engineMs || '?'}ms`,
        equity: horseBrainResult.equity ?? null, // Pass through if Horse Brain returns it
        potOdds: potSize > 0 && betToCall > 0 ? Math.round((betToCall / (potSize + betToCall)) * 10000) / 100 : null, // 0-100 percentage scale to match engine convention
        highEquity: null,
        lowEquity: null,
        bubbleFactor: null,
        bbStack: bbStack,
        variant: horseBrainResult.variant || gameType,
        isHiLo: String(gameType).includes('hilo') || String(gameType).includes('plo8'),
        isOmaha: isOmahaVariant,
        street,
        handStrength,
        lowHandStrength,
        texture,
        outs,
        outsImproves,
        spr: Number.isFinite(spr) ? Math.round(spr * 10) / 10 : null,
        mRatio: Number.isFinite(mRatio) ? Math.round(mRatio * 10) / 10 : null,
        pushFoldHint: null, // Horse Brain handles push-fold internally
        isTournament,
        tournamentStage,
        holeCards: holeTrimmed,
        boardCards: effectiveBoard,
        source: 'horse_brain',
        engineMs: horseBrainResult.engineMs,
        degraded,
        warnings,
        detection: {
          holeConfidence: holeResult.minConfidence,
          boardConfidence: boardResult.minConfidence,
          unknownCount,
        },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FALLBACK: Local engine (only if Horse Brain API is unreachable)
  // This should rarely be hit — only if auth fails or network is down.
  // ═══════════════════════════════════════════════════════════════════
  console.warn('[decision-bridge] Using LOCAL fallback engine - Horse Brain API unavailable');
  const warnings = [];
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
      source: 'error',
      degraded: true,
      warnings: [`[engine] ${err.message || 'unknown'}`],
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
  let handStrength = null;
  let texture = null;
  const isOmahaVariant = String(gameType).toLowerCase().includes('plo');
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
    } catch (err) { warnings.push(`[handStrength] ${err.message}`); }
    try {
      texture = PokerBrainEngine.classifyTexture(effectiveBoard);
    } catch (err) { warnings.push(`[texture] ${err.message}`); }
  }
  // PLO Hi-Lo low hand eval (fallback engine path)
  let lowHandStrength2 = null;
  const isHiLo2 = !!engineResult?.isHiLo || String(gameType).includes('hilo') || String(gameType).includes('plo8');
  if (isHiLo2 && effectiveBoard.length >= 3 && PokerBrainEngine.getBestLowFromCards) {
    try {
      let bestLow = null;
      for (let i = 0; i < holeTrimmed.length; i++) {
        for (let j = i + 1; j < holeTrimmed.length; j++) {
          for (let a = 0; a < effectiveBoard.length; a++) {
            for (let b = a + 1; b < effectiveBoard.length; b++) {
              for (let c = b + 1; c < effectiveBoard.length; c++) {
                const five = [holeTrimmed[i], holeTrimmed[j], effectiveBoard[a], effectiveBoard[b], effectiveBoard[c]];
                const low = PokerBrainEngine.getBestLowFromCards(five);
                if (low && (!bestLow || low.score < bestLow.score)) bestLow = low;
              }
            }
          }
        }
      }
      if (bestLow) lowHandStrength2 = bestLow.rank;
    } catch (err) { warnings.push(`[lowHand] ${err.message}`); }
  }
  let outs = 0;
  let outsImproves = [];
  if (!isOmahaVariant && (effectiveBoard.length === 3 || effectiveBoard.length === 4)) {
    try {
      const o = PokerBrainEngine.countOuts(holeTrimmed, effectiveBoard);
      outs = o.outs;
      outsImproves = o.improves || [];
    } catch (err) { warnings.push(`[outs] ${err.message}`); }
  }
  const spr = PokerBrainEngine.calculateStackToPot(stackSize, potSize);
  const bbStack = bigBlind > 0 ? stackSize / bigBlind : null;
  const mRatio = PokerBrainEngine.calculateM(stackSize, bigBlind, numPlayers);
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
    } catch (err) { warnings.push(`[pushFold] ${err.message}`); }
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
    lowHandStrength: lowHandStrength2,
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
    source: 'local_fallback',
    degraded: false,
    warnings,
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
