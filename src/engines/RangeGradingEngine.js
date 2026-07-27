/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * RANGE GRADING ENGINE — Compare Player Ranges to GTO Solutions
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Grades a player's 13x13 hand range grid against the solver solution:
 *   - Input: user's grid with action assignments (raise/call/fold)
 *   - Compare to solver solution for the spot
 *   - Output: 0-100% accuracy score
 *   - Per-hand deviation report (which hands are most wrong)
 *   - Category breakdown (pairs, suited connectors, broadways, etc.)
 *
 * Used by RangeBuilderPage to grade range-building exercises.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { ALL_HANDS, getHandFromGrid, getCombos } from '../config/solverRanges';

// ●● Hand Categories ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const HAND_CATEGORIES = {
    PAIRS: 'pairs',
    SUITED_BROADWAYS: 'suited_broadways',
    OFFSUIT_BROADWAYS: 'offsuit_broadways',
    SUITED_CONNECTORS: 'suited_connectors',
    SUITED_ACES: 'suited_aces',
    SUITED_GAPPERS: 'suited_gappers',
    OFFSUIT_HANDS: 'offsuit_hands',
};

/**
 * Categorize a hand for breakdown analysis.
 */
function categorizeHand(hand) {
    if (!hand) return HAND_CATEGORIES.OFFSUIT_HANDS;
    if (hand.length === 2) return HAND_CATEGORIES.PAIRS;

    const r1 = hand[0], r2 = hand[1], type = hand[2];
    const isSuited = type === 's';
    const broadways = 'AKQJT';
    const isBroadway = broadways.includes(r1) && broadways.includes(r2);

    if (isSuited) {
        if (r1 === 'A') return HAND_CATEGORIES.SUITED_ACES;
        if (isBroadway) return HAND_CATEGORIES.SUITED_BROADWAYS;
        // Check if connector (adjacent ranks)
        const ranks = 'AKQJT98765432';
        const gap = Math.abs(ranks.indexOf(r1) - ranks.indexOf(r2));
        if (gap === 1) return HAND_CATEGORIES.SUITED_CONNECTORS;
        if (gap <= 3) return HAND_CATEGORIES.SUITED_GAPPERS;
        return HAND_CATEGORIES.SUITED_CONNECTORS;
    } else {
        if (isBroadway) return HAND_CATEGORIES.OFFSUIT_BROADWAYS;
        return HAND_CATEGORIES.OFFSUIT_HANDS;
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GRADING ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Grade a player's range against the solver solution.
 *
 * @param {Object} playerRange - Player's 13x13 grid: { hand: action } or { hand: { raise: freq, call: freq, fold: freq } }
 * @param {Object} solverSolution - Solver solution: { hand: action } (binary) or { hand: { raise: freq, ... } }
 * @param {Object} [enrichedSolution] - Enriched solver solution with frequencies
 * @param {Object} [options]
 * @param {string} [options.mode='binary'] - 'binary' (raise/call/fold match) or 'frequency' (frequency accuracy)
 * @param {number} [options.tolerance=0.15] - Frequency tolerance for mixed strategies
 * @returns {{ score: number, grade: string, breakdown: Object, deviations: Array, categoryScores: Object }}
 */
export function gradeRange(playerRange, solverSolution, enrichedSolution, options = {}) {
    const mode = options.mode || 'binary';
    const tolerance = options.tolerance || 0.15;

    let totalScore = 0;
    let totalCombos = 0;
    const deviations = [];
    const categoryStats = {};

    for (const hand of ALL_HANDS) {
        const combos = getCombos(hand);
        const category = categorizeHand(hand);

        // Initialize category tracking
        if (!categoryStats[category]) {
            categoryStats[category] = { correct: 0, total: 0, combos: 0, correctCombos: 0 };
        }

        const playerAction = _getPlayerAction(playerRange, hand);
        const solverAction = _getSolverAction(solverSolution, hand);
        const enriched = enrichedSolution?.[hand];

        let handScore;
        let deviation = null;

        if (mode === 'frequency' && enriched) {
            handScore = _scoreFrequencyMatch(playerRange[hand], enriched, tolerance);
        } else {
            handScore = _scoreBinaryMatch(playerAction, solverAction, enriched);
        }

        totalScore += handScore * combos;
        totalCombos += combos;
        categoryStats[category].total++;
        categoryStats[category].combos += combos;

        if (handScore >= 0.8) {
            categoryStats[category].correct++;
            categoryStats[category].correctCombos += combos;
        }

        // Track deviations (wrong hands)
        if (handScore < 0.8) {
            deviation = {
                hand,
                combos,
                playerAction,
                solverAction,
                enriched,
                score: Math.round(handScore * 100),
                category,
            };
            deviations.push(deviation);
        }
    }

    // Calculate overall score
    const rawScore = totalCombos > 0 ? (totalScore / totalCombos) * 100 : 0;
    const score = Math.round(rawScore);

    // Category scores
    const categoryScores = {};
    for (const [cat, stats] of Object.entries(categoryStats || {})) {
        categoryScores[cat] = {
            score: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 100,
            comboScore: stats.combos > 0 ? Math.round((stats.correctCombos / stats.combos) * 100) : 100,
            total: stats.total,
            correct: stats.correct,
        };
    }

    // Sort deviations by severity (worst first)
    deviations.sort((a, b) => a.score - b.score);

    return {
        score,
        grade: _getGrade(score),
        breakdown: {
            totalHands: ALL_HANDS.length,
            correctHands: ALL_HANDS.length - deviations.length,
            totalCombos,
            deviationCount: deviations.length,
        },
        deviations: deviations.slice(0, 20), // Top 20 worst deviations
        categoryScores,
    };
}

/**
 * Score a binary action match.
 */
function _scoreBinaryMatch(playerAction, solverAction, enriched) {
    // Exact match = perfect
    if (playerAction === solverAction) return 1.0;

    // If no action assigned by player but solver says fold, that's correct
    if (!playerAction && solverAction === 'fold') return 1.0;
    if (!playerAction && solverAction !== 'fold') return 0.0;

    // Check enriched frequencies for mixed spots
    if (enriched) {
        const playerFreq = enriched[playerAction] || 0;
        // If the player's action has significant solver frequency, partial credit
        if (playerFreq >= 0.30) return 0.7; // Mixed spot, partial credit
        if (playerFreq >= 0.10) return 0.3; // Rare but not zero
    }

    // Wrong action
    return 0.0;
}

/**
 * Score a frequency match (for advanced mode).
 */
function _scoreFrequencyMatch(playerFreqs, solverFreqs, tolerance) {
    if (!playerFreqs || !solverFreqs) return 0;

    const actions = ['raise', 'call', 'fold'];
    let totalError = 0;

    for (const action of actions) {
        const playerF = typeof playerFreqs === 'string'
            ? (playerFreqs === action ? 1.0 : 0.0)
            : (playerFreqs[action] || 0);
        const solverF = solverFreqs[action] || 0;
        totalError += Math.abs(playerF - solverF);
    }

    // Max error is 2.0 (complete opposite), convert to 0-1 score
    const score = Math.max(0, 1 - totalError / 2);

    // Apply tolerance: if within tolerance, bump score up
    if (totalError <= tolerance * 3) return Math.max(score, 0.9);

    return score;
}

/**
 * Get the player's assigned action for a hand.
 */
function _getPlayerAction(playerRange, hand) {
    const entry = playerRange?.[hand];
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    // Frequency object: return the dominant action
    if (typeof entry === 'object') {
        const { raise = 0, call = 0, fold = 0 } = entry;
        if (raise >= call && raise >= fold) return 'raise';
        if (call >= raise && call >= fold) return 'call';
        return 'fold';
    }
    return null;
}

/**
 * Get the solver's action for a hand.
 */
function _getSolverAction(solverSolution, hand) {
    const entry = solverSolution?.[hand];
    if (!entry) return 'fold';
    if (typeof entry === 'string') return entry;
    if (typeof entry === 'object') {
        const { raise = 0, call = 0, fold = 0 } = entry;
        if (raise >= call && raise >= fold) return 'raise';
        if (call >= raise && call >= fold) return 'call';
        return 'fold';
    }
    return 'fold';
}

/**
 * Get letter grade from numeric score.
 */
function _getGrade(score) {
    if (score >= 95) return 'S';
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RANGE COMPARISON VISUALIZATION
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Generate a heatmap grid showing correctness per cell.
 * Returns a 13x13 grid where each cell has a color and correctness flag.
 *
 * @param {Object} playerRange
 * @param {Object} solverSolution
 * @param {Object} [enrichedSolution]
 * @returns {Array<Array<{ hand: string, correct: boolean, playerAction: string, solverAction: string, color: string }>>}
 */
export function generateHeatmapGrid(playerRange, solverSolution, enrichedSolution) {
    const grid = [];

    for (let row = 0; row < 13; row++) {
        const gridRow = [];
        for (let col = 0; col < 13; col++) {
            const hand = getHandFromGrid(row, col);
            const playerAction = _getPlayerAction(playerRange, hand);
            const solverAction = _getSolverAction(solverSolution, hand);
            const enriched = enrichedSolution?.[hand];

            const score = _scoreBinaryMatch(playerAction, solverAction, enriched);
            const correct = score >= 0.8;

            let color;
            if (score >= 0.8) color = '#27ae60';      // Green — correct
            else if (score >= 0.3) color = '#f39c12';  // Yellow — partial
            else if (playerAction || solverAction !== 'fold') color = '#e74c3c'; // Red — wrong
            else color = '#2c3e50';                     // Dark — both fold (neutral)

            gridRow.push({
                hand,
                row,
                col,
                correct,
                score: Math.round(score * 100),
                playerAction: playerAction || 'fold',
                solverAction,
                enriched,
                color,
            });
        }
        grid.push(gridRow);
    }

    return grid;
}

/**
 * Generate a text summary of the grading result.
 */
export function generateGradingSummary(result) {
    const { score, grade, breakdown, categoryScores, deviations } = result;

    let summary = `Range Grade: ${grade} (${score}%)\n`;
    summary += `${breakdown.correctHands}/${breakdown.totalHands} hands correct\n\n`;

    summary += `Category Breakdown:\n`;
    for (const [cat, data] of Object.entries(categoryScores || {})) {
        const label = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        summary += `  ${label}: ${data.score}% (${data.correct}/${data.total})\n`;
    }

    if (deviations.length > 0) {
        summary += `\nBiggest Deviations:\n`;
        for (const d of deviations.slice(0, 5)) {
            summary += `  ${d.hand}: You ${d.playerAction || 'folded'}, GTO ${d.solverAction}\n`;
        }
    }

    return summary;
}

export default {
    gradeRange,
    generateHeatmapGrid,
    generateGradingSummary,
    categorizeHand,
    HAND_CATEGORIES,
};
