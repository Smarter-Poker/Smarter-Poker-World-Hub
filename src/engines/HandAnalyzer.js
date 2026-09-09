/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND ANALYZER — Parse Played Hands And Request Auditable Pricing
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * This synchronous compatibility analyzer can classify cards and actions, but
 * it cannot certify GTO actions or EV without a server-matched solved node.
 * Unmatched decisions stay explicitly unpriced.
 *
 * Works with HandHistoryParser for input and PostflopStrategyEngine
 * for GTO reference at each node.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { getHeroDecisionPoints, getBoardAtStreet } from './HandHistoryParser';
import { classifyMadeHand, classifyDraws, evaluateHand } from './HandStrengthEngine';
import { analyzeBoard } from './BoardTextureEngine';
import { getPostflopStrategy } from './PostflopStrategyEngine';
import { calculateEVLoss } from './EVCalculator';
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
    const priced = decisions.filter(d => d.classification !== 'unpriced');
    const correct = priced.filter(d => d.classification === 'correct').length;
    const total = decisions.length;

    return {
        handId: hand.id,
        hero: hand.hero,
        decisions,
        summary: {
            totalDecisions: total,
            pricedDecisions: priced.length,
            unpricedDecisions: total - priced.length,
            correctDecisions: correct,
            accuracy: priced.length > 0 ? Math.round((correct / priced.length) * 100) : null,
            totalEVLoss: Math.round(totalEVLoss * 100) / 100,
            worstDecision: decisions.reduce((worst, d) =>
                d.evLoss > (worst?.evLoss || 0) ? d : worst, null),
            classifications: {
                correct: classifications.filter(c => c === 'correct').length,
                inaccuracy: classifications.filter(c => c === 'inaccuracy').length,
                mistake: classifications.filter(c => c === 'mistake').length,
                blunder: classifications.filter(c => c === 'blunder').length,
                unpriced: classifications.filter(c => c === 'unpriced').length,
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

    // Authoritative grading requires a solved node. This synchronous analyzer
    // has no sealed solver lookup, so its legacy local heuristic may describe a
    // practice concept but may not produce a GTO action, EV loss, or grade.
    let gtoStrategy = null;
    let evLossResult = null;

    if (street === 'preflop') {
        // This synchronous analyzer has no stack/position/action-node chart
        // lookup. Claiming every preflop action was correct hid the platform's
        // most important leaks. The server-side solver audit prices these from
        // memory_charts_gold/training questions; this fallback is honest about
        // what it cannot determine.
        gtoStrategy = { action: null, reason: 'Requires server solver-range match' };
        evLossResult = { evLoss: 0, actionUnavailable: true };
    } else if (board.length >= 3) {
        // Postflop: classify locally, then fail closed for solver grading.
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

        if (
            gtoStrategy?.authority === 'illustrative_local_heuristic'
            || gtoStrategy?.solverVerified === false
            || gtoStrategy?.practiceOnly === true
        ) {
            gtoStrategy = {
                action: null,
                reason: 'Verified postflop solver evidence is required before this decision can be graded.',
                authority: 'unverified',
                solverVerified: false,
            };
            evLossResult = {
                evLoss: 0,
                actionUnavailable: true,
                evLossMeasured: false,
                solverVerified: false,
            };
        } else {
            // Defensive future path: only a source that does not identify itself
            // as local practice can reach the estimator. Server-side review is
            // still the canonical place for measured solver EV.
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
        solverVerified: evLossResult?.solverVerified === true,
        evLossMeasured: evLossResult?.evLossMeasured === true,
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
    const pricedDecisions = allDecisions.filter(d => d.classification !== 'unpriced');
    const totalDecisions = allDecisions.length;
    const totalEVLoss = pricedDecisions.reduce((a, d) => a + d.evLoss, 0);

    const classifications = {
        correct: allDecisions.filter(d => d.classification === 'correct').length,
        inaccuracy: allDecisions.filter(d => d.classification === 'inaccuracy').length,
        mistake: allDecisions.filter(d => d.classification === 'mistake').length,
        blunder: allDecisions.filter(d => d.classification === 'blunder').length,
        unpriced: allDecisions.filter(d => d.classification === 'unpriced').length,
    };

    // Per-street breakdown
    const streetStats = {};
    for (const d of pricedDecisions) {
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
    for (const d of pricedDecisions) {
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
    const topMistakes = [...pricedDecisions]
        .sort((a, b) => b.evLoss - a.evLoss)
        .slice(0, 10);

    const gtoScore = pricedDecisions.length > 0
        ? Math.round((classifications.correct / pricedDecisions.length) * 100)
        : null;

    return {
        hands: analyzed,
        report: {
            handsAnalyzed: hands.length,
            totalDecisions,
            pricedDecisions: pricedDecisions.length,
            unpricedDecisions: totalDecisions - pricedDecisions.length,
            gtoScore,
            totalEVLoss: Math.round(totalEVLoss * 100) / 100,
            avgEVLossPerDecision: pricedDecisions.length > 0
                ? Math.round((totalEVLoss / pricedDecisions.length) * 100) / 100
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
