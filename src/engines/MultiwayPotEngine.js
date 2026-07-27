/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * MULTIWAY POT ENGINE — 3+ Player Postflop Scenario Support
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Extends the 2-player solver framework to handle multiway pots:
 *   - Range advantage shifts with 3+ players (narrower ranges dominate)
 *   - C-bet frequency adjustments (much lower multiway)
 *   - Protection betting emphasis (more vulnerable to draws)
 *   - Pot geometry changes (larger pots, lower SPR faster)
 *   - Position multiplier (being IP vs multiple opponents)
 *   - Bluff frequency reduction (more callers = less bluffing)
 *
 * Engine #23 — calibrated to solver outputs for 3-way and 4-way pots.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { classifyMadeHand, classifyDraws } from './HandStrengthEngine';
import { analyzeBoard } from './BoardTextureEngine';

// ●● Multiway Adjustments ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Multiway c-bet frequency multiplier.
 * As more players see the flop, c-bet frequency drops dramatically.
 *
 * 2-way: 1.0x (baseline solver)
 * 3-way: 0.55x (only strong hands + some draws)
 * 4-way: 0.35x (very strong hands only)
 * 5+:    0.20x (near-nuts only)
 */
const MULTIWAY_CBET_MULTIPLIER = {
    2: 1.0,
    3: 0.55,
    4: 0.35,
    5: 0.20,
    6: 0.15,
};

/**
 * Multiway bluff frequency multiplier.
 * Bluffing becomes much less profitable with more players to get through.
 */
const MULTIWAY_BLUFF_MULTIPLIER = {
    2: 1.0,
    3: 0.40,
    4: 0.20,
    5: 0.10,
    6: 0.05,
};

/**
 * Protection bet frequency multiplier.
 * With more draws possible, protecting made hands becomes more important.
 */
const MULTIWAY_PROTECTION_MULTIPLIER = {
    2: 1.0,
    3: 1.4,
    4: 1.6,
    5: 1.7,
    6: 1.8,
};

/**
 * Sizing adjustments: multiway pots use larger sizings for value/protection.
 */
const MULTIWAY_SIZING_ADJUSTMENT = {
    2: { valueMult: 1.0, bluffMult: 1.0, preferredSize: '50%' },
    3: { valueMult: 1.15, bluffMult: 0.85, preferredSize: '66%' },
    4: { valueMult: 1.30, bluffMult: 0.70, preferredSize: '75%' },
    5: { valueMult: 1.40, bluffMult: 0.60, preferredSize: '75%' },
    6: { valueMult: 1.50, bluffMult: 0.50, preferredSize: '100%' },
};

// ●● Hand Strength Requirements ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Minimum hand class for various actions in multiway pots.
 * In heads-up, you can c-bet with overcards. Multiway you need much more.
 */
const MULTIWAY_MIN_CBET = {
    2: ['air'],                    // Can bluff freely HU
    3: ['second_pair', 'gutshot'], // Need at least middle pair or draw 3-way
    4: ['tpwk', 'oesd'],          // Need top pair or strong draw 4-way
    5: ['tpgk', 'combo_draw'],    // Top pair good kicker+ 5-way
    6: ['overpair', 'nuts_plus'], // Only overpair+ 6-way
};

const MULTIWAY_MIN_VALUE = {
    2: ['tpgk'],
    3: ['overpair'],
    4: ['nuts_plus'],
    5: ['nuts_plus'],
    6: ['nuts_plus'],
};

// ●● Core Functions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Get multiway-adjusted strategy for a postflop decision.
 *
 * @param {Object} params
 * @param {string[]} params.holeCards - Hero's hole cards
 * @param {string[]} params.board - Board cards
 * @param {number} params.numPlayers - Players in the pot (2-6)
 * @param {number} params.potSize - Current pot in BB
 * @param {number} params.effectiveStack - Effective stack in BB
 * @param {string} params.street - 'flop' | 'turn' | 'river'
 * @param {string} params.position - 'IP' | 'OOP' | 'MIDDLE' (between opponents)
 * @param {boolean} [params.isPFR] - Was hero the preflop raiser?
 * @param {Object} [params.huStrategy] - Base heads-up strategy to adjust
 * @returns {Object} Multiway-adjusted strategy
 */
export function getMultiwayStrategy(params) {
    const {
        holeCards, board, numPlayers = 2, potSize, effectiveStack,
        street, position, isPFR = false, huStrategy = null,
    } = params;

    const players = Math.min(6, Math.max(2, numPlayers));

    try {
        const madeHand = classifyMadeHand(holeCards, board);
        const draws = street !== 'river' ? classifyDraws(holeCards, board) : { outs: 0, equity: 0 };
        const boardAnalysis = analyzeBoard(board);

        const handStrength = madeHand.strength || 0.5;
        const drawEquity = draws.equity || 0;
        const handClass = madeHand.rank || 'air';
        const isStrong = handStrength >= 0.7;
        const isMedium = handStrength >= 0.4 && handStrength < 0.7;
        const isWeak = handStrength < 0.4;
        const hasGoodDraw = drawEquity >= 0.15;

        // Get multipliers
        const cbetMult = MULTIWAY_CBET_MULTIPLIER[players] || 0.15;
        const bluffMult = MULTIWAY_BLUFF_MULTIPLIER[players] || 0.05;
        const protMult = MULTIWAY_PROTECTION_MULTIPLIER[players] || 1.8;
        const sizingAdj = MULTIWAY_SIZING_ADJUSTMENT[players] || MULTIWAY_SIZING_ADJUSTMENT[6];

        // Calculate bet frequency
        let betFrequency = 0;
        let betMotivation = 'none';

        if (isStrong) {
            // Strong hands: bet for value, increase with protection needs
            const wetBoard = boardAnalysis.wet || boardAnalysis.flushDraw || boardAnalysis.connected;
            betFrequency = Math.min(1.0, 0.85 * (wetBoard ? protMult * 0.7 : 1.0));
            betMotivation = wetBoard ? 'value + protection' : 'value';
        } else if (isMedium && hasGoodDraw) {
            // Medium hand with draw: semi-bluff (reduced multiway)
            betFrequency = Math.min(0.7, 0.50 * cbetMult * 1.2);
            betMotivation = 'semi-bluff';
        } else if (isMedium && !hasGoodDraw) {
            // Medium hand no draw: pot control, check more multiway
            betFrequency = Math.min(0.4, 0.35 * cbetMult);
            betMotivation = 'thin value / pot control';
        } else if (isWeak && hasGoodDraw) {
            // Weak hand with draw: semi-bluff (much less multiway)
            betFrequency = Math.min(0.5, 0.40 * bluffMult * 1.5);
            betMotivation = 'semi-bluff (draw)';
        } else {
            // Air: bluff (rarely multiway)
            betFrequency = Math.min(0.3, 0.25 * bluffMult);
            betMotivation = 'bluff';
        }

        // PFR gets higher c-bet frequency
        if (isPFR && street === 'flop') {
            betFrequency = Math.min(1.0, betFrequency * 1.2);
        }

        // Position bonus
        if (position === 'IP') {
            betFrequency = Math.min(1.0, betFrequency * 1.15);
        } else if (position === 'MIDDLE') {
            betFrequency *= 0.75; // Sandwiched = less betting
        }

        // Determine sizing
        const spr = effectiveStack / potSize;
        let sizing;
        if (isStrong) {
            sizing = spr > 4 ? sizingAdj.preferredSize : 'pot';
        } else if (betMotivation.includes('bluff') || betMotivation.includes('semi')) {
            sizing = '33%';
        } else {
            sizing = sizingAdj.preferredSize;
        }

        // Build action frequencies
        const checkFrequency = 1 - betFrequency;
        const frequencies = { check: checkFrequency };

        if (betFrequency > 0.01) {
            if (sizing === '33%') frequencies.bet_small = betFrequency;
            else if (sizing === '50%') frequencies.bet_medium = betFrequency;
            else if (sizing === '66%' || sizing === '75%') frequencies.bet_large = betFrequency;
            else frequencies.bet_pot = betFrequency;
        }

        // Recommended action
        const action = betFrequency >= 0.5 ? 'bet' : 'check';

        return {
            action,
            sizing: betFrequency >= 0.5 ? sizing : null,
            frequencies,
            betFrequency,
            checkFrequency,
            motivation: betMotivation,
            handStrength,
            handClass,
            drawEquity,
            numPlayers: players,
            adjustments: {
                cbetMultiplier: cbetMult,
                bluffMultiplier: bluffMult,
                protectionMultiplier: protMult,
                sizingAdjustment: sizingAdj,
            },
            explanation: generateMultiwayExplanation(players, betMotivation, handClass, position, street, isPFR),
        };
    } catch (e) {
        console.warn('[App] Handled exception:', e?.message || e);
        return {
            action: 'check',
            sizing: null,
            frequencies: { check: 1.0 },
            betFrequency: 0,
            checkFrequency: 1.0,
            motivation: 'fallback',
            numPlayers: players,
            explanation: `In a ${players}-way pot, default to checking without strong read.`,
        };
    }
}

/**
 * Generate human-readable explanation for multiway decisions.
 */
function generateMultiwayExplanation(numPlayers, motivation, handClass, position, street, isPFR) {
    const parts = [];

    parts.push(`${numPlayers}-way pot`);

    if (motivation === 'value + protection') {
        parts.push(`betting for value and to protect against ${numPlayers - 1} opponents' draws`);
    } else if (motivation === 'value') {
        parts.push('betting for value — strong hand on a dry board');
    } else if (motivation === 'semi-bluff') {
        parts.push('semi-bluffing with draw equity, though less frequently multiway');
    } else if (motivation === 'semi-bluff (draw)') {
        parts.push('semi-bluffing with a draw, but cautious with multiple opponents');
    } else if (motivation === 'thin value / pot control') {
        parts.push('pot controlling — medium strength hand plays better as a check multiway');
    } else if (motivation === 'bluff') {
        parts.push('rarely bluffing — need to get through multiple opponents');
    } else {
        parts.push('checking — conservative play with marginal holding');
    }

    if (position === 'IP') parts.push('(benefit of position)');
    else if (position === 'MIDDLE') parts.push('(sandwiched between opponents — extra caution)');
    else parts.push('(out of position)');

    return parts.join('. ') + '.';
}

/**
 * Get multiway-adjusted equity requirement for calling.
 * You need better odds to call multiway because ranges are stronger.
 *
 * @param {number} numPlayers - Players in pot
 * @param {number} potOdds - Pot odds being offered (0-1)
 * @returns {number} Minimum equity needed to call
 */
export function getMultiwayCallEquity(numPlayers, potOdds) {
    // Base equity needed from pot odds
    const baseEquity = potOdds;

    // Multiway: opponents' ranges are stronger on average
    const rangeStrengthAdj = {
        2: 0,
        3: 0.03,
        4: 0.05,
        5: 0.07,
        6: 0.08,
    };

    return Math.min(0.95, baseEquity + (rangeStrengthAdj[numPlayers] || 0.08));
}

/**
 * Calculate implied odds adjustment for multiway pots.
 * Implied odds are better multiway (more money to win), but reverse
 * implied odds are worse (more likely someone has you crushed).
 */
export function getMultiwayImpliedOdds(numPlayers, drawStrength, effectiveStack, potSize) {
    const spr = effectiveStack / potSize;

    // More players = more money behind, but also higher chance of being dominated
    const impliedOddsMult = {
        2: 1.0,
        3: 1.3,  // More money to win
        4: 1.2,  // Starts to decrease — more reverse implied odds
        5: 1.0,  // Wash
        6: 0.8,  // Reverse implied odds dominate
    };

    // Nut draws get big implied odds multiway
    const isNutDraw = drawStrength >= 0.25;
    const nutBonus = isNutDraw ? 1.3 : 0.8;

    return (impliedOddsMult[numPlayers] || 0.8) * nutBonus * Math.min(1.5, spr / 5);
}
