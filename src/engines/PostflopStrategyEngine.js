/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POSTFLOP STRATEGY ENGINE — GTO Postflop Decision Framework
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Generates solver-approximate GTO decisions for postflop play:
 *   - C-bet frequencies by board texture (IP/OOP)
 *   - Check-raise frequencies by board texture
 *   - Bet sizing logic (25%/33%/50%/75%/100%/150% pot)
 *   - Turn barrel frequencies based on runout
 *   - River value/bluff ratios
 *
 * Strategy is derived from board texture (BoardTextureEngine) and
 * hand classification (HandStrengthEngine). Approximates GTO frequencies
 * using heuristic models calibrated to PioSolver outputs.
 *
 * Used by PostflopScenarioGenerator to build L8-L10 training scenarios.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { analyzeBoard, FLUSH_TEXTURE, PAIR_TEXTURE, CONNECTIVITY, HEIGHT } from './BoardTextureEngine';
import { classifyMadeHand, classifyDraws, MADE_HANDS, DRAWS, evaluateHand } from './HandStrengthEngine';
import {
    FLOP_CBET_MATRIX,
    FLOP_CHECKRAISE_MATRIX,
    TURN_BARREL_MATRIX,
    RIVER_STRATEGY_MATRIX,
    FACING_BET_MATRIX,
    THREE_BET_POT_ADJUSTMENTS,
    lookupCbetStrategy,
    lookupCheckRaiseStrategy,
    lookupTurnStrategy,
    lookupRiverStrategy,
    lookupFacingBetStrategy,
    classifyBetSize,
    calculateGeometricSizing,
} from '../config/postflopSolverData';

// ── Bet Sizing Constants ─────────────────────────────────────────────────

export const BET_SIZES = {
    SMALL: { label: '33% pot', fraction: 0.33 },
    MEDIUM: { label: '50% pot', fraction: 0.50 },
    LARGE: { label: '75% pot', fraction: 0.75 },
    POT: { label: 'Pot', fraction: 1.0 },
    OVERBET: { label: '150% pot', fraction: 1.5 },
};

// ── Position Context ─────────────────────────────────────────────────────

export const POSITION_CONTEXT = {
    IP: 'in_position',     // Acting last (has positional advantage)
    OOP: 'out_of_position', // Acting first
};

// ── Action Types ─────────────────────────────────────────────────────────

export const ACTIONS = {
    CHECK: 'check',
    BET: 'bet',
    CALL: 'call',
    RAISE: 'raise',
    FOLD: 'fold',
};

// ═══════════════════════════════════════════════════════════════════════════
// C-BET STRATEGY — Flop continuation betting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GTO C-bet frequency tables by board texture.
 * IP = In Position (acting last), OOP = Out of Position (acting first).
 *
 * Calibrated to solver output for single-raised pots.
 * Format: { frequency: 0-1, preferredSize: BET_SIZES key }
 */
const CBET_STRATEGY = {
    // DRY BOARDS — High c-bet frequency, small sizing
    dry_high: {
        IP: { frequency: 0.72, preferredSize: 'SMALL', altSize: 'MEDIUM' },
        OOP: { frequency: 0.55, preferredSize: 'SMALL', altSize: 'MEDIUM' },
    },
    dry_low: {
        IP: { frequency: 0.65, preferredSize: 'SMALL', altSize: 'MEDIUM' },
        OOP: { frequency: 0.48, preferredSize: 'SMALL', altSize: 'MEDIUM' },
    },
    // WET BOARDS — Lower frequency, larger sizing
    wet_high: {
        IP: { frequency: 0.42, preferredSize: 'LARGE', altSize: 'POT' },
        OOP: { frequency: 0.30, preferredSize: 'LARGE', altSize: 'POT' },
    },
    wet_low: {
        IP: { frequency: 0.38, preferredSize: 'MEDIUM', altSize: 'LARGE' },
        OOP: { frequency: 0.28, preferredSize: 'MEDIUM', altSize: 'LARGE' },
    },
    // MEDIUM BOARDS — Moderate frequency, medium sizing
    medium_high: {
        IP: { frequency: 0.58, preferredSize: 'MEDIUM', altSize: 'SMALL' },
        OOP: { frequency: 0.42, preferredSize: 'MEDIUM', altSize: 'SMALL' },
    },
    medium_low: {
        IP: { frequency: 0.52, preferredSize: 'SMALL', altSize: 'MEDIUM' },
        OOP: { frequency: 0.38, preferredSize: 'SMALL', altSize: 'MEDIUM' },
    },
    // MONOTONE BOARDS — Polarized: either bet large or check
    monotone: {
        IP: { frequency: 0.35, preferredSize: 'LARGE', altSize: 'POT' },
        OOP: { frequency: 0.22, preferredSize: 'LARGE', altSize: 'POT' },
    },
    // PAIRED BOARDS — High frequency, small sizing (range advantage)
    paired: {
        IP: { frequency: 0.78, preferredSize: 'SMALL', altSize: 'MEDIUM' },
        OOP: { frequency: 0.60, preferredSize: 'SMALL', altSize: 'MEDIUM' },
    },
};

/**
 * Determine the board category key for c-bet lookup
 */
function getBoardCbetKey(boardAnalysis) {
    const { flush, pair, wetness, height } = boardAnalysis;

    if (flush.texture === FLUSH_TEXTURE.MONOTONE) return 'monotone';
    if (pair.texture !== PAIR_TEXTURE.UNPAIRED) return 'paired';

    const wetKey = wetness.isDry ? 'dry' : wetness.isWet ? 'wet' : 'medium';
    const heightKey = height.height === HEIGHT.HIGH ? 'high' : 'low';

    return `${wetKey}_${heightKey}`;
}

/**
 * Get the GTO c-bet strategy for a given board and position context.
 *
 * @param {string[]} board - Board cards (flop)
 * @param {string} posContext - 'IP' or 'OOP'
 * @param {string[]} holeCards - Hero's hole cards
 * @returns {{ shouldBet: boolean, frequency: number, sizing: Object, reason: string, handCategory: string }}
 */
export function getCbetStrategy(board, posContext, holeCards) {
    const boardAnalysis = analyzeBoard(board);
    if (boardAnalysis.error) return { shouldBet: false, frequency: 0, sizing: null, reason: 'Invalid board' };

    const cbetKey = getBoardCbetKey(boardAnalysis);
    const baseStrategy = CBET_STRATEGY[cbetKey]?.[posContext] || CBET_STRATEGY.medium_high[posContext];

    // Adjust frequency based on hand strength
    const madeHand = classifyMadeHand(holeCards, board);
    const draws = classifyDraws(holeCards, board);

    let freqAdjust = 0;
    let reason = '';

    // Strong made hands — always bet (or sometimes trap)
    if (madeHand.strength >= 0.75) {
        freqAdjust = 0.30;
        reason = `Strong ${madeHand.description} — value bet`;
    }
    // Top pair+ — bet most of the time
    else if (madeHand.strength >= 0.45) {
        freqAdjust = 0.15;
        reason = `${madeHand.description} — standard value c-bet`;
    }
    // Middle pair — check more on wet boards, bet on dry
    else if (madeHand.strength >= 0.25) {
        freqAdjust = boardAnalysis.wetness.isDry ? 0.05 : -0.15;
        reason = boardAnalysis.wetness.isDry
            ? `${madeHand.description} on dry board — thin value`
            : `${madeHand.description} on wet board — check to control pot`;
    }
    // Nothing or bottom pair — bluff candidates
    else {
        // Good draw = semi-bluff candidate
        if (draws.outs >= 8) {
            freqAdjust = 0.10;
            reason = `${draws.description} — semi-bluff with equity`;
        } else if (draws.outs >= 4) {
            freqAdjust = -0.05;
            reason = `Weak ${madeHand.description} with ${draws.description} — marginal bluff`;
        } else {
            freqAdjust = -0.20;
            reason = `${madeHand.description}, no draw — give up or thin bluff`;
        }
    }

    const adjustedFreq = Math.max(0, Math.min(1, baseStrategy.frequency + freqAdjust));

    // Select sizing: strong hands and draws prefer larger on wet boards
    let sizingKey = baseStrategy.preferredSize;
    if (madeHand.strength >= 0.75 && boardAnalysis.wetness.isWet) {
        sizingKey = baseStrategy.altSize || 'LARGE';
    }

    return {
        shouldBet: adjustedFreq > 0.50,
        frequency: Math.round(adjustedFreq * 100) / 100,
        sizing: BET_SIZES[sizingKey],
        sizingKey,
        reason,
        handCategory: madeHand.category,
        drawInfo: draws,
        boardTexture: boardAnalysis.description,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK-RAISE STRATEGY — Facing a c-bet
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check-raise frequencies by board type (defender's perspective, OOP).
 * Solvers check-raise ~8-15% overall depending on texture.
 */
const CHECKRAISE_BASE = {
    dry_high: 0.08,
    dry_low: 0.10,
    wet_high: 0.14,
    wet_low: 0.12,
    medium_high: 0.10,
    medium_low: 0.11,
    monotone: 0.06,
    paired: 0.09,
};

/**
 * Determine check-raise strategy when facing a c-bet.
 *
 * @param {string[]} board
 * @param {string[]} holeCards
 * @param {number} betSizeFraction - The c-bet size as fraction of pot
 * @returns {{ shouldRaise: boolean, frequency: number, sizing: Object, reason: string }}
 */
export function getCheckRaiseStrategy(board, holeCards, betSizeFraction = 0.33) {
    const boardAnalysis = analyzeBoard(board);
    if (boardAnalysis.error) return { shouldRaise: false, frequency: 0, reason: 'Invalid board' };

    const cbetKey = getBoardCbetKey(boardAnalysis);
    const baseFreq = CHECKRAISE_BASE[cbetKey] || 0.10;

    const madeHand = classifyMadeHand(holeCards, board);
    const draws = classifyDraws(holeCards, board);

    let freqAdjust = 0;
    let reason = '';

    // Monster hands — check-raise for value
    if (madeHand.strength >= 0.70) {
        freqAdjust = 0.60;
        reason = `${madeHand.description} — check-raise for value`;
    }
    // Two pair / overpair — strong check-raise candidate
    else if (madeHand.strength >= 0.50) {
        freqAdjust = 0.30;
        reason = `${madeHand.description} — check-raise for value/protection`;
    }
    // Strong draws — check-raise as semi-bluff
    else if (draws.isCombo || draws.outs >= 12) {
        freqAdjust = 0.40;
        reason = `${draws.description} — check-raise semi-bluff (combo draw)`;
    }
    else if (draws.outs >= 8) {
        freqAdjust = 0.20;
        reason = `${draws.description} — check-raise semi-bluff`;
    }
    // Gutshots with backdoor equity — occasional bluff raise
    else if (draws.outs >= 4) {
        freqAdjust = 0.05;
        reason = `${draws.description} — occasional bluff check-raise`;
    }
    // Nothing — only raise with blocker effects or as pure bluff at low freq
    else if (madeHand.strength <= 0.15) {
        freqAdjust = -0.05;
        reason = `${madeHand.description} — mostly fold to c-bet`;
    }
    // Middle pair type hands — call, don't raise
    else {
        freqAdjust = -0.05;
        reason = `${madeHand.description} — call rather than raise`;
    }

    // Larger c-bets discourage check-raises slightly
    if (betSizeFraction >= 0.67) freqAdjust -= 0.05;

    const adjustedFreq = Math.max(0, Math.min(1, baseFreq + freqAdjust));

    // Check-raise sizing: typically 3x the bet on flop
    const raiseSizing = betSizeFraction <= 0.33
        ? BET_SIZES.LARGE  // vs small bet, raise to ~75% pot
        : BET_SIZES.POT;    // vs larger bet, raise to pot

    return {
        shouldRaise: adjustedFreq > 0.50,
        frequency: Math.round(adjustedFreq * 100) / 100,
        sizing: raiseSizing,
        reason,
        handCategory: madeHand.category,
        drawInfo: draws,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TURN BARREL STRATEGY — Continuation after flop c-bet
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine turn strategy after c-betting the flop.
 * Considers runout (the turn card) and how it changes the board texture.
 *
 * @param {string[]} holeCards
 * @param {string[]} board - 4 cards (flop + turn)
 * @param {string} flopAction - What hero did on flop ('bet', 'check')
 * @param {string} posContext - 'IP' or 'OOP'
 * @returns {{ action: string, frequency: number, sizing: Object, reason: string }}
 */
export function getTurnStrategy(holeCards, board, flopAction, posContext) {
    if (board.length < 4) return { action: ACTIONS.CHECK, frequency: 0, reason: 'Not on turn yet' };

    const boardAnalysis = analyzeBoard(board);
    if (boardAnalysis.error) return { action: ACTIONS.CHECK, frequency: 0, reason: 'Invalid board' };

    const madeHand = classifyMadeHand(holeCards, board);
    const draws = classifyDraws(holeCards, board);

    // Turn card analysis: did the turn change things?
    const flopBoard = board.slice(0, 3);
    const flopAnalysis = analyzeBoard(flopBoard);
    const turnCard = board[3];
    const turnBrought = analyzeTurnRunout(flopAnalysis, boardAnalysis, turnCard);

    let baseFreq = flopAction === 'bet' ? 0.55 : 0.35; // Lower if we checked flop
    let reason = '';
    let sizingKey = 'MEDIUM';

    // Strong made hands — barrel for value
    if (madeHand.strength >= 0.70) {
        baseFreq = 0.90;
        sizingKey = boardAnalysis.wetness.isWet ? 'LARGE' : 'MEDIUM';
        reason = `${madeHand.description} — value barrel`;
    }
    // Good top pair — continue betting
    else if (madeHand.strength >= 0.45) {
        baseFreq = 0.65;
        sizingKey = 'MEDIUM';
        reason = `${madeHand.description} — continue value`;

        // Scary turn card reduces frequency
        if (turnBrought.completedDraw) {
            baseFreq -= 0.20;
            reason += ` (draw completed — slow down)`;
        }
    }
    // Medium hands — check for pot control
    else if (madeHand.strength >= 0.25) {
        baseFreq = 0.25;
        sizingKey = 'SMALL';
        reason = `${madeHand.description} — pot control`;

        if (turnBrought.improvesTexture) {
            baseFreq -= 0.10;
        }
    }
    // Draws — semi-bluff barrel
    else if (draws.outs >= 8) {
        baseFreq = 0.60;
        sizingKey = 'MEDIUM';
        reason = `${draws.description} — semi-bluff barrel`;
    }
    else if (draws.outs >= 4) {
        baseFreq = 0.30;
        sizingKey = 'MEDIUM';
        reason = `${draws.description} — occasional barrel`;
    }
    // Nothing — give up or bluff with backdoor blockers
    else {
        baseFreq = 0.15;
        reason = `${madeHand.description} — mostly give up`;

        // Blank turn card is better for bluffing
        if (turnBrought.isBlank) {
            baseFreq += 0.10;
            reason = `${madeHand.description} — blank turn, occasional bluff`;
        }
    }

    // IP gets to bet more often
    if (posContext === 'IP') baseFreq += 0.05;

    const finalFreq = Math.max(0, Math.min(1, baseFreq));

    return {
        action: finalFreq > 0.50 ? ACTIONS.BET : ACTIONS.CHECK,
        frequency: Math.round(finalFreq * 100) / 100,
        sizing: BET_SIZES[sizingKey],
        sizingKey,
        reason,
        handCategory: madeHand.category,
        drawInfo: draws,
        turnAnalysis: turnBrought,
    };
}

/**
 * Analyze how the turn card changed the board texture
 */
function analyzeTurnRunout(flopAnalysis, turnAnalysis, turnCard) {
    const flopFlush = flopAnalysis.flush;
    const turnFlush = turnAnalysis.flush;
    const flopConn = flopAnalysis.connectivity;
    const turnConn = turnAnalysis.connectivity;

    return {
        // Did a flush complete?
        completedFlush: !flopFlush.flushPossible && turnFlush.flushPossible,
        // Did a straight likely complete?
        completedStraight: !flopConn.straightPossible && turnConn.straightPossible,
        // Did any draw complete?
        completedDraw: (!flopFlush.flushPossible && turnFlush.flushPossible) ||
                       (!flopConn.straightPossible && turnConn.straightPossible),
        // Is the turn card a blank (doesn't change texture much)?
        isBlank: turnAnalysis.wetness.wetness <= flopAnalysis.wetness.wetness + 0.5,
        // Did it improve draw potential?
        improvesTexture: turnAnalysis.wetness.wetness > flopAnalysis.wetness.wetness + 1,
        // Board pairing
        boardPaired: turnAnalysis.pair.texture !== PAIR_TEXTURE.UNPAIRED &&
                     flopAnalysis.pair.texture === PAIR_TEXTURE.UNPAIRED,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RIVER STRATEGY — Value/Bluff ratio & river decisions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine river strategy.
 * On the river, there are no more cards to come — decisions are purely
 * about value bets, bluffs, and bluff-catchers.
 *
 * GTO river betting ratio: ~2 value bets : 1 bluff (at pot-sized bet)
 * Adjusts based on sizing: smaller bets = more bluffs allowed.
 *
 * @param {string[]} holeCards
 * @param {string[]} board - 5 cards
 * @param {string} posContext - 'IP' or 'OOP'
 * @param {string} prevAction - Previous street action ('bet', 'check')
 * @returns {{ action: string, frequency: number, sizing: Object, reason: string, category: string }}
 */
export function getRiverStrategy(holeCards, board, posContext, prevAction) {
    if (board.length < 5) return { action: ACTIONS.CHECK, frequency: 0, reason: 'Not on river yet' };

    const madeHand = classifyMadeHand(holeCards, board);
    const eval5 = evaluateHand(holeCards, board);

    let action = ACTIONS.CHECK;
    let frequency = 0;
    let sizingKey = 'MEDIUM';
    let reason = '';
    let category = 'check'; // value, bluff, bluff_catcher, check

    // CLEAR VALUE HANDS — Bet for value
    if (madeHand.strength >= 0.70) {
        action = ACTIONS.BET;
        frequency = 0.90;
        sizingKey = 'LARGE';
        category = 'value';
        reason = `${madeHand.description} — clear value bet`;

        // Nuts: consider overbet
        if (madeHand.strength >= 0.93) {
            sizingKey = 'OVERBET';
            reason = `${madeHand.description} — overbet for max value`;
        }
    }
    // STRONG TOP PAIR+ — Thin value bet
    else if (madeHand.strength >= 0.45) {
        action = ACTIONS.BET;
        frequency = 0.60;
        sizingKey = 'MEDIUM';
        category = 'value';
        reason = `${madeHand.description} — thin value bet`;

        // Scary board reduces thin value
        const boardAnalysis = analyzeBoard(board);
        if (boardAnalysis.wetness.isWet || boardAnalysis.flush.flushPossible) {
            frequency -= 0.15;
            reason += ` (caution: draw-completing board)`;
        }
    }
    // BLUFF CATCHERS — Medium-strength hands
    else if (madeHand.strength >= 0.20) {
        action = ACTIONS.CHECK;
        frequency = 0.10; // Rarely bet, mostly check-call
        category = 'bluff_catcher';
        reason = `${madeHand.description} — bluff catcher, check and evaluate`;

        // If we were the aggressor, sometimes we can still bet thin
        if (prevAction === 'bet') {
            frequency = 0.20;
            sizingKey = 'SMALL';
            reason = `${madeHand.description} — thin value/block bet`;
        }
    }
    // NOTHING — Bluff candidate
    else {
        // Missed draws are the best bluff candidates
        category = 'bluff';

        // Busted flush draw — good bluff candidate (blocks opponent's flushes)
        const boardAnalysis = analyzeBoard(board);
        const heroSuits = holeCards.map(c => c[1]);
        const hasSuitedToBoard = heroSuits.some(s =>
            boardAnalysis.flush.suitCounts[s] >= 3
        );

        if (hasSuitedToBoard && prevAction === 'bet') {
            action = ACTIONS.BET;
            frequency = 0.40;
            sizingKey = 'LARGE';
            reason = `Missed draw with flush blockers — river bluff`;
        } else if (prevAction === 'bet') {
            // Triple barrel bluff — need to follow through sometimes
            action = ACTIONS.BET;
            frequency = 0.25;
            sizingKey = 'LARGE';
            reason = `${madeHand.description} — follow-through bluff`;
        } else {
            action = ACTIONS.CHECK;
            frequency = 0.05;
            reason = `${madeHand.description} — give up`;
        }
    }

    // IP bluffs slightly more (can realize fold equity better)
    if (posContext === 'IP' && category === 'bluff') frequency += 0.05;

    return {
        action,
        frequency: Math.max(0, Math.min(1, Math.round(frequency * 100) / 100)),
        sizing: BET_SIZES[sizingKey],
        sizingKey,
        reason,
        category,
        handCategory: madeHand.category,
        handStrength: madeHand.strength,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FACING A BET — Call/Raise/Fold decisions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine the correct action when facing a bet on any street.
 * Uses pot odds and hand strength to determine call/raise/fold.
 *
 * @param {string[]} holeCards
 * @param {string[]} board
 * @param {number} betSize - Bet amount in BB
 * @param {number} potSize - Current pot in BB
 * @param {string} street - 'flop', 'turn', or 'river'
 * @returns {{ action: string, frequency: number, reason: string }}
 */
export function getFacingBetStrategy(holeCards, board, betSize, potSize, street) {
    const madeHand = classifyMadeHand(holeCards, board);
    const draws = street !== 'river' ? classifyDraws(holeCards, board) : { draws: [DRAWS.NONE], outs: 0, equity: 0 };

    // Calculate pot odds
    const potOdds = betSize / (potSize + betSize + betSize); // call amount / (pot + call)
    const impliedOdds = street === 'river' ? 0 : 0.05; // Can win more on future streets

    let action = ACTIONS.FOLD;
    let frequency = 0;
    let reason = '';

    // MONSTER HANDS — Raise
    if (madeHand.strength >= 0.70) {
        action = ACTIONS.RAISE;
        frequency = 0.75;
        reason = `${madeHand.description} — raise for value`;
    }
    // STRONG HANDS — Call (sometimes raise)
    else if (madeHand.strength >= 0.45) {
        action = ACTIONS.CALL;
        frequency = 0.85;
        reason = `${madeHand.description} — call, ahead of betting range`;

        // Raise sometimes with top pair good kicker+ for protection
        if (madeHand.strength >= 0.55) {
            frequency = 0.80;
            reason = `${madeHand.description} — call (occasional raise)`;
        }
    }
    // MEDIUM HANDS + DRAWS — Call if odds are right
    else if (madeHand.strength >= 0.20 || draws.outs >= 8) {
        const equity = Math.max(madeHand.strength, draws.equity || 0);
        if (equity >= potOdds - impliedOdds) {
            action = ACTIONS.CALL;
            frequency = 0.65;
            reason = `${madeHand.description} / ${draws.description} — call with ${Math.round(equity * 100)}% equity vs ${Math.round(potOdds * 100)}% pot odds`;
        } else {
            action = ACTIONS.FOLD;
            frequency = 0.55;
            reason = `${madeHand.description} — insufficient equity (${Math.round(equity * 100)}% vs ${Math.round(potOdds * 100)}% needed)`;
        }
    }
    // WEAK DRAWS — Call only with good odds
    else if (draws.outs >= 4) {
        if (draws.equity >= potOdds) {
            action = ACTIONS.CALL;
            frequency = 0.55;
            reason = `${draws.description} — call with direct odds`;
        } else {
            action = ACTIONS.FOLD;
            frequency = 0.60;
            reason = `${draws.description} — fold, insufficient odds`;
        }
    }
    // NOTHING — Fold (occasionally bluff-raise)
    else {
        action = ACTIONS.FOLD;
        frequency = 0.85;
        reason = `${madeHand.description} — fold to bet`;
    }

    return {
        action,
        frequency: Math.round(frequency * 100) / 100,
        reason,
        handCategory: madeHand.category,
        drawInfo: draws,
        potOdds: Math.round(potOdds * 100) / 100,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE POSTFLOP DECISION — Master strategy for any postflop node
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the full GTO strategy at a postflop decision node.
 * This is the master function that routes to the correct sub-strategy.
 *
 * @param {Object} params
 * @param {string[]} params.holeCards - Hero's 2 cards
 * @param {string[]} params.board - Board cards (3-5)
 * @param {string} params.position - 'IP' or 'OOP'
 * @param {string} params.street - 'flop', 'turn', 'river'
 * @param {boolean} params.isPFR - Was hero the preflop raiser?
 * @param {boolean} params.facingBet - Is hero facing a bet?
 * @param {number} [params.betSize] - Bet size in BB (if facingBet)
 * @param {number} [params.potSize] - Current pot in BB
 * @param {string} [params.prevAction] - What hero did on previous street
 * @returns {Object} Complete strategy recommendation
 */
export function getPostflopStrategy(params) {
    const { holeCards, board, position, street, isPFR, facingBet, betSize, potSize, prevAction, is3BetPot } = params;

    // Validate inputs
    if (!holeCards || holeCards.length < 2) return { error: 'Need 2 hole cards' };
    if (!board || board.length < 3) return { error: 'Need at least 3 board cards' };

    // Route to correct strategy based on context — use ENHANCED solver-data versions
    if (facingBet) {
        return {
            type: 'facing_bet',
            street,
            ...getEnhancedFacingBetStrategy(holeCards, board, betSize || 3, potSize || 6, street),
        };
    }

    if (street === 'flop') {
        if (isPFR) {
            return {
                type: 'cbet',
                street: 'flop',
                ...getEnhancedCbetStrategy(board, position, holeCards, { is3BetPot }),
            };
        } else {
            // As the defender (caller), check to PFR most of the time
            // Use enhanced check-raise lookup from solver data
            const boardAnalysis = analyzeBoard(board);
            const textureKey = classifyBoardTexture(boardAnalysis);
            const handClass = classifyHandClass(holeCards, board);
            let xrData = null;

            try {
                xrData = lookupCheckRaiseStrategy(textureKey, handClass);
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

            const checkRaiseInfo = xrData
                ? {
                    shouldRaise: xrData.raise > 0.30,
                    frequency: xrData.raise,
                    callFreq: xrData.call,
                    foldFreq: xrData.fold,
                    raiseSizing: xrData.raiseSizing,
                    handClass,
                    boardTexture: textureKey,
                    isEnhanced: true,
                }
                : getCheckRaiseStrategy(board, holeCards);

            return {
                type: 'defender_flop',
                street: 'flop',
                action: ACTIONS.CHECK,
                frequency: 0.85,
                reason: `As the caller (${handClass}), check to the preflop raiser`,
                checkRaiseInfo,
                handClass,
            };
        }
    }

    if (street === 'turn') {
        return {
            type: 'turn_barrel',
            street: 'turn',
            ...getEnhancedTurnStrategy(holeCards, board, prevAction || 'bet', position),
        };
    }

    if (street === 'river') {
        return {
            type: 'river_decision',
            street: 'river',
            ...getEnhancedRiverStrategy(holeCards, board, position, prevAction || 'check'),
        };
    }

    return { error: `Unknown street: ${street}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// BET SIZING CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate actual bet amount from pot size and sizing fraction.
 * @param {number} potSize - Current pot in BB
 * @param {string} sizingKey - Key from BET_SIZES
 * @returns {{ amount: number, label: string, fraction: number }}
 */
export function calculateBetAmount(potSize, sizingKey) {
    const sizing = BET_SIZES[sizingKey] || BET_SIZES.MEDIUM;
    return {
        amount: Math.round(potSize * sizing.fraction * 10) / 10,
        label: sizing.label,
        fraction: sizing.fraction,
    };
}

/**
 * Get all valid bet sizing options for a given pot size.
 * Filters out sizes that are too small or too large for the context.
 * @param {number} potSize
 * @param {number} effectiveStack
 * @returns {Array<{ key: string, amount: number, label: string }>}
 */
export function getValidBetSizes(potSize, effectiveStack) {
    return Object.entries(BET_SIZES || {})
        .map(([key, size]) => ({
            key,
            amount: Math.round(potSize * size.fraction * 10) / 10,
            label: size.label,
            fraction: size.fraction,
        }))
        .filter(s => s.amount >= 1 && s.amount <= effectiveStack);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED SOLVER-DATA LOOKUP — Uses granular postflopSolverData tables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a hand into one of the solver data hand classes.
 * Maps from HandStrengthEngine output → postflopSolverData hand class keys.
 */
export function classifyHandClass(holeCards, board) {
    const madeHand = classifyMadeHand(holeCards, board);
    const draws = classifyDraws(holeCards, board);
    const street = board.length === 5 ? 'river' : (board.length === 4 ? 'turn' : 'flop');

    // Combo draw takes priority (flush draw + straight draw)
    if (draws.isCombo || (draws.outs >= 12 && street !== 'river')) return 'combo_draw';

    // On river: check for rivered hands or missed draws
    if (street === 'river') {
        // Check if hand improved on river card
        const board4 = board.slice(0, 4);
        const madeHand4 = classifyMadeHand(holeCards, board4);

        if (madeHand.strength >= 0.80 && madeHand4.strength < 0.50) {
            // Rivered a big hand
            if (madeHand.category === MADE_HANDS.FLUSH) return 'rivered_flush';
            if (madeHand.category === MADE_HANDS.STRAIGHT) return 'rivered_straight';
            return 'rivered_2p';
        }

        // Missed draws
        const draws4 = classifyDraws(holeCards, board4);
        if (draws4.outs >= 8 && madeHand.strength < 0.20) {
            if (draws4.draws?.includes?.(DRAWS.FLUSH_DRAW)) return 'missed_fd';
            return 'missed_sd';
        }
    }

    // Strong made hands
    if (madeHand.strength >= 0.70) return 'nuts_plus';
    if (madeHand.category === MADE_HANDS.OVERPAIR || (madeHand.strength >= 0.55 && madeHand.strength < 0.70)) return 'overpair';
    if (madeHand.strength >= 0.45) return 'tpgk';
    if (madeHand.strength >= 0.35) return 'tpwk';
    if (madeHand.strength >= 0.25) return 'second_pair';

    // Draws (pre-river)
    if (street !== 'river') {
        if (draws.draws?.includes?.(DRAWS.FLUSH_DRAW) || draws.outs >= 9) return 'flush_draw';
        if (draws.draws?.includes?.(DRAWS.OESD) || draws.outs >= 8) return 'oesd';
        if (draws.outs >= 4) return 'gutshot';
    }

    // Weak made hand
    if (madeHand.strength >= 0.15) return 'weak_pair';

    // No pair
    const boardAnalysis = analyzeBoard(board);
    const heroRanks = holeCards.map(c => c[0]);
    const boardRanks = board.map(c => c[0]);
    const RANK_VALS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    const maxBoardRank = Math.max(...boardRanks.map(r => RANK_VALS[r] || 0));
    const hasOvercards = heroRanks.filter(r => (RANK_VALS[r] || 0) > maxBoardRank).length >= 2;

    // On the river unimproved overcards are just air — the river matrices have no 'overcards' row
    if (hasOvercards) return street === 'river' ? 'air' : 'overcards';

    // Check for backdoor draws (flop only)
    if (street === 'flop' && draws.outs >= 1) return 'backdoor';

    return 'air';
}

/**
 * Classify the board texture into one of the solver data texture keys.
 * Maps from BoardTextureEngine output → postflopSolverData texture keys.
 */
export function classifyBoardTexture(boardAnalysis) {
    const { flush, pair, connectivity, wetness, height } = boardAnalysis;
    const isHigh = height.height === HEIGHT.HIGH;

    if (flush.texture === FLUSH_TEXTURE.MONOTONE) {
        return isHigh ? 'monotone_high' : 'monotone_low';
    }

    if (pair.texture !== PAIR_TEXTURE.UNPAIRED) {
        return isHigh ? 'paired_high' : 'paired_low';
    }

    // Check for connected/wet boards
    if (connectivity?.straightPossible || wetness.wetness >= 7) {
        if (isHigh) return 'connected_wet';
        return 'low_connected';
    }

    // Broadway dry (all cards T+)
    const RANK_VALS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    if (boardAnalysis.board && boardAnalysis.board.every(c => (RANK_VALS[c[0]] || 0) >= 10)) {
        return 'broadway_dry';
    }

    // Two-tone vs rainbow
    if (flush.texture === FLUSH_TEXTURE.TWO_TONE) {
        return isHigh ? 'two_tone_high' : 'two_tone_low';
    }

    // Rainbow dry
    return isHigh ? 'dry_rainbow_high' : 'dry_rainbow_low';
}

/**
 * Classify the turn runout type for the turn barrel matrix.
 */
export function classifyTurnRunout(flopAnalysis, turnAnalysis, turnCard) {
    const RANK_VALS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    const turnRank = RANK_VALS[turnCard?.[0]] || 0;

    // Check flush completing
    if (turnAnalysis.flush?.flushPossible && !flopAnalysis.flush?.flushPossible) {
        return 'flush_completing';
    }

    // Check straight completing
    if (turnAnalysis.connectivity?.straightPossible && !flopAnalysis.connectivity?.straightPossible) {
        return 'straight_completing';
    }

    // Check board pairing
    if (turnAnalysis.pair?.texture !== PAIR_TEXTURE.UNPAIRED && flopAnalysis.pair?.texture === PAIR_TEXTURE.UNPAIRED) {
        return 'board_pairing';
    }

    // Check if overcard
    const flopCards = flopAnalysis.board || [];
    const maxFlopRank = Math.max(...flopCards.map(c => RANK_VALS[c?.[0]] || 0));
    if (turnRank > maxFlopRank && turnRank >= 11) { // J+ overcard
        return 'overcard';
    }

    // Blank
    return turnRank >= 10 ? 'blank_high' : 'blank_low';
}

/**
 * Classify the river board state for the river strategy matrix.
 */
export function classifyRiverBoardState(boardAnalysis) {
    const hasPair = boardAnalysis.pair?.texture !== PAIR_TEXTURE.UNPAIRED;
    const hasFlush = boardAnalysis.flush?.flushPossible;
    const hasStraight = boardAnalysis.connectivity?.straightPossible;

    if (hasPair) return 'board_paired';
    if (hasFlush && hasStraight) return 'flush_possible'; // Simplify: use flush as primary
    if (hasFlush) return 'flush_possible';
    if (hasStraight) return 'straight_possible';
    return 'dry_no_draws';
}

/**
 * ENHANCED c-bet strategy using solver data tables.
 * Uses the granular hand-class × board-texture matrix for per-hand frequencies.
 *
 * @param {string[]} board - Flop cards
 * @param {string} posContext - 'IP' or 'OOP'
 * @param {string[]} holeCards - Hero's hole cards
 * @param {Object} [opts] - Options { is3BetPot: false }
 * @returns {Object} Enhanced strategy with solver-calibrated frequencies
 */
export function getEnhancedCbetStrategy(board, posContext, holeCards, opts = {}) {
    try {
        const boardAnalysis = analyzeBoard(board);
        if (boardAnalysis.error) return getCbetStrategy(board, posContext, holeCards); // fallback

        const textureKey = classifyBoardTexture(boardAnalysis);
        const handClass = classifyHandClass(holeCards, board);
        const strategy = lookupCbetStrategy(textureKey, handClass, posContext);

        // Apply 3-bet pot adjustments
        let betFreq = strategy.betFreq;
        if (opts.is3BetPot && THREE_BET_POT_ADJUSTMENTS[handClass]) {
            const adj = THREE_BET_POT_ADJUSTMENTS[handClass];
            betFreq = Math.min(1, betFreq * adj.betFreqMult);
        }

        // Select preferred sizing from size distribution
        const sizes = strategy.sizes || { s50: 1.0 };
        const sizeEntries = Object.entries(sizes || {}).sort((a, b) => b[1] - a[1]);
        const preferredSizeKey = sizeEntries[0]?.[0] || 's50';
        const sizeMap = { s33: 'SMALL', s50: 'MEDIUM', s75: 'LARGE', s100: 'POT', s150: 'OVERBET' };
        const sizingKey = sizeMap[preferredSizeKey] || 'MEDIUM';

        const madeHand = classifyMadeHand(holeCards, board);
        const draws = classifyDraws(holeCards, board);

        return {
            shouldBet: betFreq > 0.50,
            frequency: Math.round(betFreq * 100) / 100,
            sizing: BET_SIZES[sizingKey],
            sizingKey,
            sizeDistribution: sizes,
            reason: `${madeHand.description} (${handClass}) on ${textureKey} — solver freq ${Math.round(betFreq * 100)}%`,
            handCategory: madeHand.category,
            handClass,
            boardTexture: textureKey,
            drawInfo: draws,
            isEnhanced: true,
        };
    } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
        return getCbetStrategy(board, posContext, holeCards);
    }
}

/**
 * ENHANCED turn strategy using solver data tables.
 */
export function getEnhancedTurnStrategy(holeCards, board, flopAction, posContext, opts = {}) {
    try {
        if (board.length < 4) return getTurnStrategy(holeCards, board, flopAction, posContext);

        const boardAnalysis = analyzeBoard(board);
        const flopAnalysis = analyzeBoard(board.slice(0, 3));
        const turnCard = board[3];

        const runoutKey = classifyTurnRunout(flopAnalysis, boardAnalysis, turnCard);
        const handClass = classifyHandClass(holeCards, board);
        const strategy = lookupTurnStrategy(runoutKey, handClass, posContext);

        let betFreq = strategy.betFreq;
        if (flopAction !== 'bet') betFreq *= 0.65; // Lower if we didn't c-bet

        const sizes = strategy.sizes || { s50: 1.0 };
        const sizeEntries = Object.entries(sizes || {}).sort((a, b) => b[1] - a[1]);
        const preferredSizeKey = sizeEntries[0]?.[0] || 's50';
        const sizeMap = { s50: 'MEDIUM', s75: 'LARGE', s100: 'POT', s150: 'OVERBET' };
        const sizingKey = sizeMap[preferredSizeKey] || 'MEDIUM';

        const madeHand = classifyMadeHand(holeCards, board);
        const draws = classifyDraws(holeCards, board);

        return {
            action: betFreq > 0.50 ? ACTIONS.BET : ACTIONS.CHECK,
            frequency: Math.round(betFreq * 100) / 100,
            sizing: BET_SIZES[sizingKey],
            sizingKey,
            sizeDistribution: sizes,
            reason: `${madeHand.description} (${handClass}) — ${runoutKey} turn — solver freq ${Math.round(betFreq * 100)}%`,
            handCategory: madeHand.category,
            handClass,
            turnRunout: runoutKey,
            drawInfo: draws,
            isEnhanced: true,
        };
    } catch (e) {
        return getTurnStrategy(holeCards, board, flopAction, posContext);
    }
}

/**
 * ENHANCED river strategy using solver data tables.
 */
export function getEnhancedRiverStrategy(holeCards, board, posContext, prevAction) {
    try {
        if (board.length < 5) return getRiverStrategy(holeCards, board, posContext, prevAction);

        const boardAnalysis = analyzeBoard(board);
        const boardState = classifyRiverBoardState(boardAnalysis);
        const handClass = classifyHandClass(holeCards, board);
        const strategy = lookupRiverStrategy(boardState, handClass, posContext);

        let betFreq = strategy.betFreq;
        if (prevAction !== 'bet') betFreq *= 0.70; // Lower if we weren't the aggressor

        const sizes = strategy.sizes || { s75: 1.0 };
        const sizeEntries = Object.entries(sizes || {}).sort((a, b) => b[1] - a[1]);
        const preferredSizeKey = sizeEntries[0]?.[0] || 's75';
        const sizeMap = { s50: 'MEDIUM', s75: 'LARGE', s100: 'POT', s150: 'OVERBET' };
        const sizingKey = sizeMap[preferredSizeKey] || 'LARGE';

        const madeHand = classifyMadeHand(holeCards, board);

        // Determine category
        let category = 'check';
        if (handClass === 'nuts_plus' || handClass === 'overpair' || handClass === 'tpgk' ||
            handClass === 'rivered_flush' || handClass === 'rivered_straight' || handClass === 'rivered_2p') {
            category = betFreq > 0.40 ? 'value' : 'check';
        } else if (handClass === 'missed_fd' || handClass === 'missed_sd' || handClass === 'air') {
            category = betFreq > 0.15 ? 'bluff' : 'check';
        } else {
            category = 'bluff_catcher';
        }

        // Bluff catchers face a call/fold decision, not a bet/check one
        const action = category === 'bluff_catcher'
            ? (madeHand.strength >= 0.25 ? ACTIONS.CALL : ACTIONS.FOLD)
            : (betFreq > 0.50 ? ACTIONS.BET : ACTIONS.CHECK);

        return {
            action,
            frequency: Math.round(betFreq * 100) / 100,
            sizing: BET_SIZES[sizingKey],
            sizingKey,
            sizeDistribution: sizes,
            reason: `${madeHand.description} (${handClass}) on ${boardState} river — solver freq ${Math.round(betFreq * 100)}%`,
            category,
            handCategory: madeHand.category,
            handClass,
            boardState,
            handStrength: madeHand.strength,
            isEnhanced: true,
        };
    } catch (e) {
        return getRiverStrategy(holeCards, board, posContext, prevAction);
    }
}

/**
 * ENHANCED facing-bet strategy using solver data tables.
 */
export function getEnhancedFacingBetStrategy(holeCards, board, betSize, potSize, street) {
    try {
        const handClass = classifyHandClass(holeCards, board);
        const betFraction = potSize > 0 ? betSize / potSize : 0.5;
        const sizeCategory = classifyBetSize(betFraction);
        const strategy = lookupFacingBetStrategy(street, sizeCategory, handClass);

        const madeHand = classifyMadeHand(holeCards, board);
        const draws = street !== 'river' ? classifyDraws(holeCards, board) : { draws: [DRAWS.NONE], outs: 0, equity: 0 };
        const potOdds = betSize / (potSize + betSize + betSize);

        let action = ACTIONS.FOLD;
        if (strategy.raise >= strategy.call && strategy.raise >= strategy.fold) action = ACTIONS.RAISE;
        else if (strategy.call >= strategy.fold) action = ACTIONS.CALL;

        const actionFreq = action === ACTIONS.RAISE ? strategy.raise : (action === ACTIONS.CALL ? strategy.call : strategy.fold);

        return {
            action,
            frequency: Math.round(actionFreq * 100) / 100,
            callFreq: strategy.call,
            raiseFreq: strategy.raise,
            foldFreq: strategy.fold,
            reason: `${madeHand.description} (${handClass}) vs ${sizeCategory} bet — ${action} ${Math.round(actionFreq * 100)}%`,
            handCategory: madeHand.category,
            handClass,
            drawInfo: draws,
            potOdds: Math.round(potOdds * 100) / 100,
            isEnhanced: true,
        };
    } catch (e) {
        return getFacingBetStrategy(holeCards, board, betSize, potSize, street);
    }
}

// ── Default export ───────────────────────────────────────────────────────

export default {
    getPostflopStrategy,
    getCbetStrategy,
    getCheckRaiseStrategy,
    getTurnStrategy,
    getRiverStrategy,
    getFacingBetStrategy,
    calculateBetAmount,
    getValidBetSizes,
    // Enhanced solver-data versions
    getEnhancedCbetStrategy,
    getEnhancedTurnStrategy,
    getEnhancedRiverStrategy,
    getEnhancedFacingBetStrategy,
    classifyHandClass,
    classifyBoardTexture,
    classifyTurnRunout,
    classifyRiverBoardState,
    BET_SIZES,
    POSITION_CONTEXT,
    ACTIONS,
};
