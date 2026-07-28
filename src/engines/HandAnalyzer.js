/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND ANALYZER — Map Played Hands to GTO Solutions
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Analyzes parsed hand histories against GTO strategy:
 *   - Map each decision point to closest solver solution
 *   - Calculate EV loss per decision
 *   - Classify mistakes (blunder/mistake/inaccuracy/correct)
 *   - Generate overall GTO Report for a session
 *
 * Works with HandHistoryParser for input and PostflopStrategyEngine
 * for GTO reference at each node.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { getHeroDecisionPoints, getBoardAtStreet } from './HandHistoryParser';
import { classifyMadeHand, classifyDraws, evaluateHand } from './HandStrengthEngine';
import { analyzeBoard } from './BoardTextureEngine';
import { getPostflopStrategy } from './PostflopStrategyEngine';
import { calculateEVLoss, calculateActionEVs } from './EVCalculator';
import { classifyMove, MOVE_CLASSIFICATIONS } from './GTOScoreEngine';
import { postflopActionIndex } from './positionOrder';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HAND ANALYSIS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Analyze a single parsed hand, evaluating all hero decision points.
 *
 * @param {Object} hand - Parsed hand from HandHistoryParser
 * @returns {{ decisions: Array, summary: Object, handId: string }}
 */
export function analyzeHand(hand) {
    if (!hand || !hand.hero || !hand.hero.holeCards) {
        return { decisions: [], summary: null, handId: hand?.id };
    }

    const decisionPoints = getHeroDecisionPoints(hand);
    const decisions = [];
    let totalEVLoss = 0;

    for (const point of decisionPoints) {
        const analysis = analyzeDecision(point, hand);
        decisions.push(analysis);
        totalEVLoss += analysis.evLoss;
    }

    const classifications = decisions.map(d => d.classification);
    const correct = classifications.filter(c => c === 'correct').length;
    const total = decisions.length;

    return {
        handId: hand.id,
        hero: hand.hero,
        decisions,
        summary: {
            totalDecisions: total,
            correctDecisions: correct,
            accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
            totalEVLoss: Math.round(totalEVLoss * 100) / 100,
            worstDecision: decisions.reduce((worst, d) =>
                d.evLoss > (worst?.evLoss || 0) ? d : worst, null),
            classifications: {
                correct: classifications.filter(c => c === 'correct').length,
                inaccuracy: classifications.filter(c => c === 'inaccuracy').length,
                mistake: classifications.filter(c => c === 'mistake').length,
                blunder: classifications.filter(c => c === 'blunder').length,
            },
        },
    };
}

/**
 * Analyze a single decision point.
 *
 * @param {Object} point - Decision point from getHeroDecisionPoints
 * @param {Object} hand - Full parsed hand context
 * @returns {Object} Analysis result
 */
function analyzeDecision(point, hand) {
    const { street, board, holeCards, action, amount, position } = point;

    // Determine position context
    const posContext = _getPositionContext(position, hand, street);
    const isPFR = _wasHeroPFR(hand);

    // Get board analysis
    const boardAnalysis = board.length >= 3 ? analyzeBoard(board) : null;

    // Get made hand and draws
    const madeHand = board.length >= 3 ? classifyMadeHand(holeCards, board) : null;
    const draws = board.length >= 3 && board.length < 5 ? classifyDraws(holeCards, board) : null;

    // Get GTO strategy for this node
    let gtoStrategy = null;
    let evLossResult = null;

    if (street === 'preflop') {
        // Preflop: use solver ranges (simplified)
        gtoStrategy = { action: isPFR ? 'raise' : 'call', reason: 'Preflop solver range' };
        evLossResult = { evLoss: 0, classification: 'correct' }; // Simplified for preflop
    } else if (board.length >= 3) {
        // Postflop: use PostflopStrategyEngine
        const potSize = _estimatePotSize(hand, street);

        gtoStrategy = getPostflopStrategy({
            holeCards,
            board,
            position: posContext,
            street,
            isPFR,
            facingBet: _isFacingBet(hand, street, position),
            betSize: amount || 0,
            potSize,
        });

        // Calculate EV loss
        // EVCalculator decides which actions exist from currentBet > 0, so the
        // key mapping has to read facingBet off the SAME value or the two
        // disagree about which branch of the tree we are in.
        const currentBet = _getCurrentBet(hand, street);
        evLossResult = calculateEVLoss({
            holeCards,
            board,
            potSize,
            effectiveStack: _getEffectiveStack(hand),
            street,
            position: posContext,
            isPFR,
            currentBet,
        }, _mapActionToEVKey(action, amount, potSize, currentBet > 0));
    }

    const evLoss = evLossResult?.evLoss || 0;
    // An action we could not price is not a correct action — it is an unknown
    // one. Grading it 'correct' off a 0 EV loss would be the same silent lie in
    // the other direction, so surface it as its own tier.
    const classification = evLossResult?.actionUnavailable
        ? { key: 'unpriced', label: 'Not priced', color: '#94a3b8' }
        : classifyMove(evLoss);

    return {
        street,
        board: [...board],
        holeCards: [...holeCards],
        position,
        posContext,
        action,
        amount,
        gtoAction: gtoStrategy?.action || gtoStrategy?.type,
        gtoReason: gtoStrategy?.reason || '',
        evLoss: Math.round(evLoss * 100) / 100,
        classification: classification.key,
        classificationColor: classification.color,
        madeHand: madeHand?.description || null,
        madeHandStrength: madeHand?.strength || null,
        draws: draws?.description || null,
        boardTexture: boardAnalysis?.description || null,
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SESSION ANALYSIS — Analyze multiple hands
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Analyze an entire session of hands.
 *
 * @param {Array} hands - Array of parsed hands from HandHistoryParser
 * @returns {Object} Complete session analysis
 */
export function analyzeSession(hands) {
    if (!hands || hands.length === 0) {
        return { hands: [], report: null };
    }

    const analyzed = hands.map(h => analyzeHand(h));
    const allDecisions = analyzed.flatMap(a => a.decisions);

    // Aggregate statistics
    const totalDecisions = allDecisions.length;
    const totalEVLoss = allDecisions.reduce((a, d) => a + d.evLoss, 0);

    const classifications = {
        correct: allDecisions.filter(d => d.classification === 'correct').length,
        inaccuracy: allDecisions.filter(d => d.classification === 'inaccuracy').length,
        mistake: allDecisions.filter(d => d.classification === 'mistake').length,
        blunder: allDecisions.filter(d => d.classification === 'blunder').length,
    };

    // Per-street breakdown
    const streetStats = {};
    for (const d of allDecisions) {
        if (!streetStats[d.street]) {
            streetStats[d.street] = { decisions: 0, evLoss: 0, correct: 0 };
        }
        streetStats[d.street].decisions++;
        streetStats[d.street].evLoss += d.evLoss;
        if (d.classification === 'correct') streetStats[d.street].correct++;
    }

    for (const key of Object.keys(streetStats || {})) {
        streetStats[key].accuracy = Math.round(
            (streetStats[key].correct / streetStats[key].decisions) * 100
        );
        streetStats[key].avgEVLoss = Math.round(
            (streetStats[key].evLoss / streetStats[key].decisions) * 100
        ) / 100;
    }

    // Per-position breakdown
    const positionStats = {};
    for (const d of allDecisions) {
        const pos = d.position || 'unknown';
        if (!positionStats[pos]) {
            positionStats[pos] = { decisions: 0, evLoss: 0, correct: 0 };
        }
        positionStats[pos].decisions++;
        positionStats[pos].evLoss += d.evLoss;
        if (d.classification === 'correct') positionStats[pos].correct++;
    }

    for (const key of Object.keys(positionStats || {})) {
        positionStats[key].accuracy = Math.round(
            (positionStats[key].correct / positionStats[key].decisions) * 100
        );
    }

    // Top mistakes (highest EV loss decisions)
    const topMistakes = [...allDecisions]
        .sort((a, b) => b.evLoss - a.evLoss)
        .slice(0, 10);

    const gtoScore = totalDecisions > 0
        ? Math.round((classifications.correct / totalDecisions) * 100)
        : 0;

    return {
        hands: analyzed,
        report: {
            handsAnalyzed: hands.length,
            totalDecisions,
            gtoScore,
            totalEVLoss: Math.round(totalEVLoss * 100) / 100,
            avgEVLossPerDecision: totalDecisions > 0
                ? Math.round((totalEVLoss / totalDecisions) * 100) / 100
                : 0,
            classifications,
            streetStats,
            positionStats,
            topMistakes,
        },
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HELPERS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Positions of every opponent still in the pot at the given street.
 * A player is out once they fold on that street or any earlier one.
 */
function _liveOpponentPositions(hand, street) {
    const order = ['preflop', 'flop', 'turn', 'river'];
    const upTo = order.slice(0, Math.max(0, order.indexOf(street)) + 1);
    const folded = new Set();
    for (const st of upTo) {
        for (const a of hand?.streets?.[st]?.actions || []) {
            if (a.action === 'fold' && a.player) folded.add(a.player);
        }
    }
    const heroName = hand?.hero?.name;
    return (hand?.players || [])
        .filter(p => p.name !== heroName && !folded.has(p.name) && p.position)
        .map(p => p.position);
}

/**
 * 'IP' or 'OOP' for hero at this decision point.
 *
 * Position is relative. This used to read `['BTN','CO'].includes(position)`,
 * which is wrong by construction: it ignored the opponent entirely, so CO
 * against the button was reported IP when the button acts after it, and HJ
 * against UTG was reported OOP when the hijack acts after it. Every strategy
 * lookup keyed on the result then read the wrong frequency column.
 *
 * Hero is in position only when hero acts after EVERY opponent still in the
 * pot, so a multiway pot with one opponent behind is OOP even from the CO.
 */
function _getPositionContext(position, hand, street) {
    const opponents = _liveOpponentPositions(hand, street);
    const heroIdx = postflopActionIndex(position);
    if (heroIdx < 0 || opponents.length === 0) {
        // Unknown seat, or no opponent we can name: we genuinely do not know.
        // Report the acts-first side rather than claim positional advantage.
        return 'OOP';
    }
    const latestOpponent = opponents.reduce((m, p) => Math.max(m, postflopActionIndex(p)), -1);
    if (latestOpponent < 0) return 'OOP';
    return heroIdx > latestOpponent ? 'IP' : 'OOP';
}

function _wasHeroPFR(hand) {
    if (!hand.streets.preflop || !hand.hero) return false;
    return hand.streets.preflop.actions.some(a =>
        a.isHero && (a.action === 'raise' || a.action === 'bet')
    );
}

function _isFacingBet(hand, street, position) {
    const streetData = hand.streets[street];
    if (!streetData) return false;

    // Check if there's an opponent bet before hero's action
    for (const action of streetData.actions) {
        if (action.isHero) return false; // Hero acted first, not facing bet
        if (action.action === 'bet' || action.action === 'raise') return true;
    }
    return false;
}

function _getCurrentBet(hand, street) {
    const streetData = hand.streets[street];
    if (!streetData) return 0;

    let maxBet = 0;
    for (const action of streetData.actions) {
        if (action.amount > maxBet) maxBet = action.amount;
    }
    return maxBet;
}

function _estimatePotSize(hand, street) {
    let pot = 0;
    const streets = ['preflop', 'flop', 'turn', 'river'];

    for (const s of streets) {
        const streetData = hand.streets[s];
        if (!streetData) break;
        for (const action of streetData.actions) {
            if (action.action === 'call' || action.action === 'bet' || action.action === 'raise') {
                pot += action.amount;
            }
        }
        if (s === street) break;
    }

    return Math.max(pot, 1); // Minimum pot of 1BB
}

function _getEffectiveStack(hand) {
    if (!hand.hero) return 100;
    const heroPlayer = hand.players.find(p => p.name === hand.hero.name);
    return heroPlayer?.stack || 100;
}

/**
 * Map a hand-history action onto an EVCalculator action key.
 *
 * The key set depends on the node. Facing a bet, EVCalculator prices
 * fold / call / raise. Not facing a bet, it prices check / bet_small /
 * bet_medium / bet_large. This function used to map every bet AND every raise
 * onto a bet_* key regardless, so a hero raise facing a bet landed on a key
 * that did not exist at that node, and EVCalculator's `?? 0` fallback then
 * priced it as a fold. And the final `return 'check'` claimed hero checked
 * whenever the parser produced any action string this list did not name.
 *
 * @param {string} action - parsed action ('fold'|'check'|'call'|'bet'|'raise')
 * @param {number} amount
 * @param {number} potSize
 * @param {boolean} facingBet - is there a live bet in front of hero?
 * @returns {string|null} key, or null when the action has no key at this node
 */
function _mapActionToEVKey(action, amount, potSize, facingBet) {
    if (action === 'fold') return facingBet ? 'fold' : null;
    if (action === 'check') return facingBet ? null : 'check';
    if (action === 'call') return facingBet ? 'call' : null;

    if (action === 'raise') return facingBet ? 'raise' : _betSizeKey(amount, potSize);
    if (action === 'bet') return facingBet ? 'raise' : _betSizeKey(amount, potSize);

    return null;
}

function _betSizeKey(amount, potSize) {
    const fraction = potSize > 0 ? amount / potSize : 0;
    if (fraction < 0.40) return 'bet_small';
    if (fraction < 0.80) return 'bet_medium';
    return 'bet_large';
}

export default {
    analyzeHand,
    analyzeSession,
};
