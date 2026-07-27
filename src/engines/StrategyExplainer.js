/**
 * StrategyExplainer — GTO Wizard-Style "WHY" Engine
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Generates human-readable explanations of WHY the solver takes each action
 * for a specific hand on a specific board. Goes beyond "bet 60%" to explain
 * the strategic reasoning: range advantage, nut advantage, board texture
 * interaction, equity denial, protection, value extraction, bluffing, etc.
 *
 * Used by FeedbackCard to show explanation after each training hand.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { classifyHandClass, classifyBoardTexture } from './PostflopStrategyEngine';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND CLASS PROPERTIES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const HAND_CLASS_META = {
    nuts_plus: {
        strength: 'monster',
        canValue: true,
        canBluff: false,
        needsProtection: false,
        description: 'a very strong hand (set or better)',
    },
    overpair: {
        strength: 'strong',
        canValue: true,
        canBluff: false,
        needsProtection: true,
        description: 'an overpair',
    },
    tpgk: {
        strength: 'strong',
        canValue: true,
        canBluff: false,
        needsProtection: true,
        description: 'top pair with a good kicker',
    },
    tpwk: {
        strength: 'medium',
        canValue: true,
        canBluff: false,
        needsProtection: true,
        description: 'top pair with a weak kicker',
    },
    second_pair: {
        strength: 'medium',
        canValue: false,
        canBluff: false,
        needsProtection: true,
        description: 'second pair',
    },
    weak_pair: {
        strength: 'weak_made',
        canValue: false,
        canBluff: false,
        needsProtection: true,
        description: 'a weak pair',
    },
    flush_draw: {
        strength: 'draw',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'a flush draw',
    },
    oesd: {
        strength: 'draw',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'an open-ended straight draw',
    },
    gutshot: {
        strength: 'draw',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'a gutshot straight draw',
    },
    combo_draw: {
        strength: 'draw',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'a combo draw (flush + straight)',
    },
    overcards: {
        strength: 'nothing',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'overcards with no pair',
    },
    backdoor: {
        strength: 'nothing',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'backdoor draws only',
    },
    air: {
        strength: 'nothing',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'no pair and no draw',
    },
    missed_fd: {
        strength: 'nothing',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'a missed flush draw',
    },
    missed_sd: {
        strength: 'nothing',
        canValue: false,
        canBluff: true,
        needsProtection: false,
        description: 'a missed straight draw',
    },
    rivered_flush: {
        strength: 'monster',
        canValue: true,
        canBluff: false,
        needsProtection: false,
        description: 'a rivered flush',
    },
    rivered_straight: {
        strength: 'monster',
        canValue: true,
        canBluff: false,
        needsProtection: false,
        description: 'a rivered straight',
    },
    rivered_2p: {
        strength: 'strong',
        canValue: true,
        canBluff: false,
        needsProtection: false,
        description: 'a rivered two pair or better',
    },
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BOARD TEXTURE REASONING
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const TEXTURE_REASONING = {
    dry_rainbow_high: {
        rangeAdvantage: 'raiser',
        cbetFreq: 'high',
        reasoning: 'Dry high boards favor the preflop raiser\'s range, enabling high c-bet frequency.',
    },
    dry_rainbow_low: {
        rangeAdvantage: 'caller',
        cbetFreq: 'medium',
        reasoning: 'Low dry boards connect better with the caller\'s range, requiring more selective c-betting.',
    },
    monotone_high: {
        rangeAdvantage: 'neutral',
        cbetFreq: 'low',
        reasoning: 'Monotone boards reduce range advantage and increase equity shifts — smaller and less frequent bets.',
    },
    monotone_low: {
        rangeAdvantage: 'caller',
        cbetFreq: 'low',
        reasoning: 'Low monotone boards strongly favor the caller. C-betting should be very selective.',
    },
    two_tone_high: {
        rangeAdvantage: 'raiser',
        cbetFreq: 'medium-high',
        reasoning: 'Two-tone high boards slightly favor the raiser with flush draw possibilities on both sides.',
    },
    two_tone_low: {
        rangeAdvantage: 'caller',
        cbetFreq: 'medium',
        reasoning: 'Low two-tone boards give the caller more suited combos that connect.',
    },
    paired_high: {
        rangeAdvantage: 'raiser',
        cbetFreq: 'high',
        reasoning: 'High paired boards give the raiser a strong range advantage — fewer combos connect for the caller.',
    },
    paired_low: {
        rangeAdvantage: 'caller',
        cbetFreq: 'medium',
        reasoning: 'Low paired boards give the caller more pocket pairs that make trips.',
    },
    connected_wet: {
        rangeAdvantage: 'neutral',
        cbetFreq: 'low',
        reasoning: 'Connected wet boards distribute equity more evenly — both ranges connect well.',
    },
    broadway_dry: {
        rangeAdvantage: 'raiser',
        cbetFreq: 'high',
        reasoning: 'Broadway-heavy boards strongly favor the preflop raiser\'s range of big cards.',
    },
    low_connected: {
        rangeAdvantage: 'caller',
        cbetFreq: 'low',
        reasoning: 'Low connected boards heavily favor the caller who defends with more suited connectors.',
    },
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// EXPLANATION GENERATOR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a human-readable explanation of WHY the solver takes a specific action.
 *
 * @param {Object} params
 * @param {string[]} params.holeCards - e.g. ['Ah', 'Kd']
 * @param {string[]} params.board - e.g. ['Qd', '7c', '2s']
 * @param {string} params.correctAction - e.g. 'Bet 33%', 'Check', 'Fold'
 * @param {string} params.userAction - what the user actually chose
 * @param {string} params.position - 'IP' or 'OOP'
 * @param {string} params.street - 'flop', 'turn', 'river'
 * @param {string} params.spotType - 'cbet', 'checkraise', 'facing_bet', etc.
 * @param {number} params.betFrequency - solver bet frequency 0-100
 * @param {Object} params.frequencies - { actionId: pct } full frequency map
 * @param {boolean} params.is3BetPot - whether this is a 3-bet pot
 * @returns {Object} { explanation: string, keyFactors: string[], strategicConcept: string }
 */
export function explainStrategy(params) {
    const {
        holeCards, board, correctAction, userAction,
        position, street, spotType, betFrequency,
        frequencies, is3BetPot
    } = params;

    try {
        // Classify hand and board
        let handClass = 'air';
        try { handClass = classifyHandClass(holeCards, board) || 'air'; } catch (e) { console.warn('[App] Handled exception:', e); }

        let boardTexture = 'dry_rainbow_high';
        try {
            // Build minimal board analysis
            const boardRanks = board.map(c => c[0]);
            const boardSuits = board.map(c => c[1]);
            const uniqueSuits = new Set(boardSuits).size;
            const rankOrder = 'AKQJT98765432';
            const rankValues = boardRanks.map(r => 14 - rankOrder.indexOf(r));
            const avgRank = rankValues.reduce((s, v) => s + v, 0) / rankValues.length;
            const isHigh = avgRank >= 9;
            const rankCounts = {};
            boardRanks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
            const hasPair = Object.values(rankCounts || {}).some(c => c >= 2);
            const sorted = [...rankValues].sort((a, b) => b - a);
            const isConnected = sorted[0] - sorted[sorted.length - 1] <= 4;

            if (hasPair) boardTexture = isHigh ? 'paired_high' : 'paired_low';
            else if (uniqueSuits === 1) boardTexture = isHigh ? 'monotone_high' : 'monotone_low';
            else if (isConnected && sorted[0] >= 10) boardTexture = 'broadway_dry';
            else if (isConnected && sorted[0] <= 8) boardTexture = 'low_connected';
            else if (isConnected) boardTexture = 'connected_wet';
            else if (uniqueSuits === 2) boardTexture = isHigh ? 'two_tone_high' : 'two_tone_low';
            else boardTexture = isHigh ? 'dry_rainbow_high' : 'dry_rainbow_low';
        } catch (e) { console.warn('[App] Handled exception:', e); }

        const handMeta = HAND_CLASS_META[handClass] || HAND_CLASS_META.air;
        const textureMeta = TEXTURE_REASONING[boardTexture] || TEXTURE_REASONING.dry_rainbow_high;

        const isBetting = correctAction?.toLowerCase().includes('bet') || correctAction?.toLowerCase().includes('raise');
        const isChecking = correctAction?.toLowerCase().includes('check');
        const isFolding = correctAction?.toLowerCase().includes('fold');
        const isCalling = correctAction?.toLowerCase().includes('call');

        const sentences = [];
        const keyFactors = [];
        let strategicConcept = '';

        // ●●● WHY BET? ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (isBetting) {
            if (handMeta.canValue && handMeta.strength === 'monster') {
                sentences.push(`You have ${handMeta.description} — a premium hand that should bet for value.`);
                keyFactors.push('Strong value hand');
                strategicConcept = 'Value Betting';

                // Explain sizing choice
                if (correctAction.includes('33') || correctAction.includes('small')) {
                    sentences.push('A small sizing extracts thin value and keeps villain\'s calling range wide.');
                } else if (correctAction.includes('75') || correctAction.includes('large')) {
                    sentences.push('A larger sizing builds the pot while still getting calls from second-best hands.');
                }
            }
            else if (handMeta.canValue && handMeta.needsProtection) {
                sentences.push(`With ${handMeta.description}, betting serves dual purpose: extracting value from weaker hands and protecting against draws.`);
                keyFactors.push('Value + Protection');
                strategicConcept = 'Value/Protection';

                if (textureMeta.rangeAdvantage === 'raiser' && position === 'IP') {
                    sentences.push(`${textureMeta.reasoning}`);
                    keyFactors.push('Range advantage on this texture');
                }
            }
            else if (handMeta.canBluff && handMeta.strength === 'draw') {
                sentences.push(`With ${handMeta.description}, betting as a semi-bluff applies pressure while maintaining equity to improve.`);
                keyFactors.push('Semi-bluff with draw equity');
                strategicConcept = 'Semi-Bluff';

                if (betFrequency && betFrequency < 60) {
                    sentences.push(`The solver only bets this hand ${betFrequency}% of the time — it\'s a mixed strategy where you should randomize.`);
                    keyFactors.push('Mixed frequency — randomize');
                }
            }
            else if (handMeta.canBluff && handMeta.strength === 'nothing') {
                sentences.push(`With ${handMeta.description}, this is a pure bluff. The solver selects this hand as a bluff because it has minimal showdown value.`);
                keyFactors.push('Pure bluff — no showdown value');
                strategicConcept = 'Bluffing';

                if (street === 'river') {
                    sentences.push('On the river, bluffs work best with hands that block villain\'s calling range.');
                    keyFactors.push('Blocker value matters on river');
                }
            }
            else if (handMeta.strength === 'medium') {
                sentences.push(`With ${handMeta.description}, the solver sometimes bets for thin value or as a merge bet, targeting weaker pairs.`);
                keyFactors.push('Thin value / merge');
                strategicConcept = 'Thin Value';
            }
        }

        // ●●● WHY CHECK? ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (isChecking) {
            if (handMeta.strength === 'monster') {
                sentences.push(`With ${handMeta.description}, checking traps villain into betting (pot control and trapping).`);
                keyFactors.push('Trapping with a strong hand');
                strategicConcept = 'Slow Play / Trap';
            }
            else if (handMeta.strength === 'strong' || handMeta.strength === 'medium') {
                sentences.push(`With ${handMeta.description}, checking controls the pot size and lets you play as a bluff-catcher on later streets.`);
                keyFactors.push('Pot control');
                strategicConcept = 'Pot Control';

                if (position === 'OOP') {
                    sentences.push('Being out of position makes it harder to realize equity through betting.');
                    keyFactors.push('Positional disadvantage');
                }

                if (textureMeta.rangeAdvantage === 'caller') {
                    sentences.push(`${textureMeta.reasoning}`);
                    keyFactors.push('Opponent has range advantage here');
                }
            }
            else if (handMeta.canBluff) {
                sentences.push(`With ${handMeta.description}, checking gives you the option to bluff later or improve. Not all bluff candidates should fire on every street.`);
                keyFactors.push('Preserve bluffing equity for later');
                strategicConcept = 'Delayed Bluff';
            }
            else if (handMeta.strength === 'weak_made') {
                sentences.push(`With ${handMeta.description}, checking protects your checking range and avoids getting raised off a marginal hand.`);
                keyFactors.push('Range protection');
                strategicConcept = 'Range Protection';
            }
        }

        // ●●● WHY CALL? ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (isCalling) {
            if (handMeta.strength === 'strong' || handMeta.strength === 'monster') {
                sentences.push(`With ${handMeta.description}, calling keeps villain's bluffs in and avoids bloating the pot where a raise might fold out worse hands.`);
                keyFactors.push('Keep bluffs in range');
                strategicConcept = 'Slow Play Call';
            }
            else if (handMeta.strength === 'medium' || handMeta.strength === 'weak_made') {
                sentences.push(`With ${handMeta.description}, you have enough equity to call but not enough to raise for value. This is a classic bluff-catcher spot.`);
                keyFactors.push('Bluff-catching');
                strategicConcept = 'Bluff Catching';
            }
            else if (handMeta.strength === 'draw') {
                sentences.push(`With ${handMeta.description}, calling gets the right price to see the next card and potentially make a strong hand.`);
                keyFactors.push('Drawing with correct odds');
                strategicConcept = 'Drawing';
            }
        }

        // ●●● WHY FOLD? ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (isFolding) {
            sentences.push(`With ${handMeta.description}, folding is correct because you don't have the equity to continue against villain's betting range.`);
            keyFactors.push('Insufficient equity to continue');
            strategicConcept = 'Equity Folding';

            if (handMeta.strength === 'weak_made') {
                sentences.push('Even weak made hands must sometimes fold when facing aggression — not every pair is a bluff-catcher.');
                keyFactors.push('Marginal hand facing pressure');
            }
        }

        // ●●● MIXED STRATEGY NOTE ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (betFrequency && betFrequency > 5 && betFrequency < 95 && frequencies) {
            const actions = Object.entries(frequencies || {})
                .filter(([_, f]) => f > 3)
                .sort((a, b) => b[1] - a[1]);
            if (actions.length >= 2) {
                sentences.push(`Note: This is a mixed strategy spot (${actions.map(([a, f]) => `${a}: ${Math.round(f)}%`).join(', ')}). The solver splits between actions — use a randomizer to approximate the correct frequencies over many hands.`);
                keyFactors.push('Mixed strategy — randomize');
            }
        }

        // ●●● 3-BET POT ADJUSTMENT ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (is3BetPot) {
            sentences.push('In a 3-bet pot, ranges are tighter and SPR is lower. This compresses decisions and increases the value of position.');
            keyFactors.push('3-bet pot dynamics');
        }

        return {
            explanation: sentences.join(' '),
            keyFactors,
            strategicConcept,
            handClass,
            boardTexture,
        };
    } catch (e) {
        return {
            explanation: 'Strategy analysis unavailable for this hand.',
            keyFactors: [],
            strategicConcept: '',
            handClass: 'unknown',
            boardTexture: 'unknown',
        };
    }
}

/**
 * Quick one-line explanation for compact displays.
 */
export function explainStrategyBrief(params) {
    const result = explainStrategy(params);
    if (result.keyFactors.length > 0) {
        return `${result.strategicConcept}: ${result.keyFactors.slice(0, 2).join('. ')}`;
    }
    return result.strategicConcept || 'See full analysis';
}

export default { explainStrategy, explainStrategyBrief };
