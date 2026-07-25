/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EV CALCULATOR — Per-Move Expected Value Computation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Calculates the expected value (in BB) of each action at a decision node:
 *   - EV of check/bet/call/raise/fold for a given hand on a given board
 *   - EV loss = GTO optimal EV - Player's action EV
 *   - Supports preflop and postflop decisions
 *   - Mixed strategy EV (weighted by GTO frequencies)
 *
 * EV is always expressed in big blinds (BB).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { classifyMadeHand, classifyDraws } from './HandStrengthEngine';
import { getPostflopStrategy, getCbetStrategy, BET_SIZES } from './PostflopStrategyEngine';

// ── EV Estimation Models ─────────────────────────────────────────────────

/**
 * Estimate the EV of each possible action at a postflop decision node.
 * Uses a simplified model calibrated to solver output.
 *
 * @param {Object} params
 * @param {string[]} params.holeCards - Hero's 2 cards
 * @param {string[]} params.board - Board cards (3-5)
 * @param {number} params.potSize - Current pot in BB
 * @param {number} params.effectiveStack - Effective stack in BB
 * @param {string} params.street - 'flop', 'turn', 'river'
 * @param {string} params.position - 'IP' or 'OOP'
 * @param {boolean} [params.isPFR] - Was hero the PFR?
 * @param {number} [params.currentBet] - Bet hero faces (0 if none)
 * @returns {{ actions: Object<string, { ev: number, frequency: number }>, bestAction: string, bestEV: number }}
 */
export function calculateActionEVs(params) {
    const {
        holeCards, board, potSize, effectiveStack, street,
        position, isPFR, currentBet = 0
    } = params;

    const madeHand = classifyMadeHand(holeCards, board);
    const draws = street !== 'river' ? classifyDraws(holeCards, board) : { outs: 0, equity: 0 };

    // Combined equity estimate (made hand strength + draw equity)
    const equity = Math.min(0.95, Math.max(0.05,
        madeHand.strength * 0.7 + (draws.equity || 0) * 0.3
    ));

    const facingBet = currentBet > 0;
    const actions = {};

    if (facingBet) {
        const callAmount = currentBet;
        const potAfterCall = potSize + callAmount;

        // EV of fold = 0 (we lose nothing more)
        actions.fold = {
            ev: 0,
            frequency: 0,
        };

        // EV of call = equity * (pot + call) - (1 - equity) * call
        actions.call = {
            ev: equity * potAfterCall - (1 - equity) * callAmount,
            frequency: 0,
        };

        // EV of raise (simplified: assume opponent folds X% and calls Y%)
        const raiseAmount = Math.min(currentBet * 3, effectiveStack);
        const foldEquity = _estimateFoldEquity(madeHand, street, raiseAmount, potSize);
        const potIfCalled = potSize + raiseAmount + raiseAmount;
        actions.raise = {
            ev: foldEquity * potSize + (1 - foldEquity) * (equity * potIfCalled - (1 - equity) * raiseAmount),
            frequency: 0,
        };
    } else {
        // Not facing a bet
        // EV of check = equity * pot (simplified — we still get pot share)
        actions.check = {
            ev: equity * potSize * 0.6, // Discount: checking doesn't build the pot
            frequency: 0,
        };

        // EV of bet at various sizings
        const sizings = [
            { key: 'bet_small', fraction: 0.33 },
            { key: 'bet_medium', fraction: 0.67 },
            { key: 'bet_large', fraction: 1.0 },
        ];

        for (const { key, fraction } of sizings) {
            const betAmount = potSize * fraction;
            if (betAmount > effectiveStack) continue;

            const foldEquity = _estimateFoldEquity(madeHand, street, betAmount, potSize);
            const potIfCalled = potSize + betAmount * 2;

            actions[key] = {
                ev: foldEquity * potSize + (1 - foldEquity) * (equity * potIfCalled - (1 - equity) * betAmount),
                frequency: 0,
                sizing: fraction,
                amount: betAmount,
            };
        }
    }

    // Find best action
    let bestAction = null;
    let bestEV = -Infinity;
    for (const [action, data] of Object.entries(actions || {})) {
        if (data.ev > bestEV) {
            bestEV = data.ev;
            bestAction = action;
        }
    }

    // Assign GTO frequencies (approximate)
    const gtoStrategy = getPostflopStrategy({
        holeCards, board, position, street,
        isPFR: isPFR ?? true,
        facingBet,
        betSize: currentBet,
        potSize,
    });

    if (gtoStrategy && !gtoStrategy.error) {
        const gtoAction = gtoStrategy.action || (gtoStrategy.shouldBet ? 'bet' : 'check');
        const gtoFreq = gtoStrategy.frequency || 0.5;

        // Map GTO action to our action keys
        for (const key of Object.keys(actions || {})) {
            if (key === gtoAction || key.startsWith(gtoAction)) {
                actions[key].frequency = gtoFreq;
            } else if (key === 'check' && gtoAction === 'check') {
                actions[key].frequency = 1 - gtoFreq;
            }
        }
    }

    return {
        actions,
        bestAction,
        bestEV: Math.round(bestEV * 100) / 100,
        equity: Math.round(equity * 100) / 100,
        handStrength: madeHand.strength,
    };
}

/**
 * Estimate fold equity based on hand strength, street, and bet size.
 */
function _estimateFoldEquity(madeHand, street, betAmount, potSize) {
    // Base fold equity by street (opponents fold less on later streets)
    const baseFold = street === 'flop' ? 0.45
        : street === 'turn' ? 0.40
        : 0.35; // river

    // Larger bets generate more fold equity
    const sizeMultiplier = Math.min(1.5, betAmount / potSize);

    // Boards with fewer draws = more fold equity
    const strengthAdjust = madeHand.strength > 0.5 ? 0.05 : -0.05;

    return Math.max(0.10, Math.min(0.80, baseFold * sizeMultiplier + strengthAdjust));
}

// ── EV Loss Calculation ──────────────────────────────────────────────────

/**
 * Calculate EV loss for a specific player action vs the GTO optimal action.
 *
 * @param {Object} params - Same as calculateActionEVs
 * @param {string} playerAction - The action the player took ('fold', 'call', 'bet_small', etc.)
 * @returns {{ evLoss: number, gtoAction: string, gtoEV: number, playerEV: number, classification: string }}
 */
export function calculateEVLoss(params, playerAction) {
    const evs = calculateActionEVs(params);

    const playerEV = evs.actions[playerAction]?.ev ?? 0;
    const gtoEV = evs.bestEV;
    const evLoss = Math.max(0, gtoEV - playerEV);

    // Classify the move
    let classification;
    if (evLoss < 0.25) classification = 'correct';      // < 0.25BB = negligible
    else if (evLoss < 1.0) classification = 'inaccuracy'; // 0.25-1BB = small mistake
    else if (evLoss < 3.0) classification = 'mistake';    // 1-3BB = significant
    else classification = 'blunder';                       // > 3BB = major error

    return {
        evLoss: Math.round(evLoss * 100) / 100,
        gtoAction: evs.bestAction,
        gtoEV: Math.round(gtoEV * 100) / 100,
        playerEV: Math.round(playerEV * 100) / 100,
        classification,
        allActionEVs: evs.actions,
    };
}

// ── Mixed Strategy EV ────────────────────────────────────────────────────

/**
 * Calculate the EV of a mixed strategy (playing multiple actions at GTO frequencies).
 *
 * @param {Object} actionEVs - Output from calculateActionEVs
 * @returns {{ mixedEV: number, description: string }}
 */
export function calculateMixedStrategyEV(actionEVs) {
    let totalEV = 0;
    let totalFreq = 0;

    for (const [action, data] of Object.entries(actionEVs.actions || {})) {
        if (data.frequency > 0) {
            totalEV += data.ev * data.frequency;
            totalFreq += data.frequency;
        }
    }

    // Normalize
    const mixedEV = totalFreq > 0 ? totalEV / totalFreq : actionEVs.bestEV;

    return {
        mixedEV: Math.round(mixedEV * 100) / 100,
        description: `Mixed strategy EV: ${mixedEV.toFixed(2)}BB (pure best: ${actionEVs.bestEV.toFixed(2)}BB)`,
    };
}

// ── Preflop EV ───────────────────────────────────────────────────────────

/**
 * Simple preflop EV estimate for raise/call/fold decisions.
 * Based on hand equity vs random range and pot odds.
 *
 * @param {string} hand - Hand notation (e.g., "AKs")
 * @param {string} action - 'raise', 'call', 'fold'
 * @param {number} potSize - Current pot in BB
 * @param {number} callAmount - Amount to call in BB
 * @returns {{ ev: number }}
 */
export function calculatePreflopEV(hand, action, potSize, callAmount) {
    // Rough hand equity vs random range
    const equityMap = {
        'AA': 0.85, 'KK': 0.82, 'QQ': 0.80, 'JJ': 0.77, 'TT': 0.75,
        '99': 0.72, '88': 0.69, '77': 0.66, '66': 0.63, '55': 0.60,
        '44': 0.57, '33': 0.54, '22': 0.51,
        'AKs': 0.67, 'AKo': 0.65, 'AQs': 0.66, 'AQo': 0.64,
        'AJs': 0.65, 'ATs': 0.64, 'A5s': 0.60, 'A4s': 0.59,
        'KQs': 0.63, 'KJs': 0.62, 'KQo': 0.61, 'QJs': 0.60,
        'JTs': 0.57, 'T9s': 0.54, '98s': 0.52, '87s': 0.50,
        '76s': 0.48, '65s': 0.47, '54s': 0.46,
    };

    const equity = equityMap[hand] || 0.45;

    if (action === 'fold') return { ev: 0 };

    if (action === 'call') {
        return { ev: Math.round((equity * (potSize + callAmount) - (1 - equity) * callAmount) * 100) / 100 };
    }

    if (action === 'raise') {
        const raiseSize = Math.max(callAmount * 3, 2.5);
        const foldEquity = 0.35;
        const potIfCalled = potSize + raiseSize * 2;
        return {
            ev: Math.round((foldEquity * potSize + (1 - foldEquity) * (equity * potIfCalled - (1 - equity) * raiseSize)) * 100) / 100,
        };
    }

    return { ev: 0 };
}

export default {
    calculateActionEVs,
    calculateEVLoss,
    calculateMixedStrategyEV,
    calculatePreflopEV,
};
