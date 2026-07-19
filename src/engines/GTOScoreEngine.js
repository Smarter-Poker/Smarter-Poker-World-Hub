/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GTO SCORE ENGINE — Session Scoring & Performance Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Real-time scoring during training sessions:
 *   - GTO Score (0-100%) = weighted accuracy across all moves
 *   - Per-move classification: correct, inaccuracy, mistake, blunder
 *   - EV loss tracking (cumulative and per-move)
 *   - Color coding: green (>90%), yellow (70-90%), red (<70%)
 *   - Streak tracking within session
 *   - Session summary with detailed breakdown
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Classification Thresholds ────────────────────────────────────────────

export const MOVE_CLASSIFICATIONS = {
    CORRECT: { key: 'correct', label: 'Correct', color: '#27ae60', evThreshold: 0.25 },
    INACCURACY: { key: 'inaccuracy', label: 'Inaccuracy', color: '#f39c12', evThreshold: 1.0 },
    MISTAKE: { key: 'mistake', label: 'Mistake', color: '#e67e22', evThreshold: 3.0 },
    BLUNDER: { key: 'blunder', label: 'Blunder', color: '#e74c3c', evThreshold: Infinity },
};

/**
 * Classify a move by EV loss.
 * @param {number} evLoss - EV loss in BB
 * @returns {{ key: string, label: string, color: string }}
 */
export function classifyMove(evLoss) {
    if (evLoss < MOVE_CLASSIFICATIONS.CORRECT.evThreshold) return MOVE_CLASSIFICATIONS.CORRECT;
    if (evLoss < MOVE_CLASSIFICATIONS.INACCURACY.evThreshold) return MOVE_CLASSIFICATIONS.INACCURACY;
    if (evLoss < MOVE_CLASSIFICATIONS.MISTAKE.evThreshold) return MOVE_CLASSIFICATIONS.MISTAKE;
    return MOVE_CLASSIFICATIONS.BLUNDER;
}

// ── GTO Score Color ──────────────────────────────────────────────────────

/**
 * Get the color for a GTO score percentage.
 */
export function getScoreColor(score) {
    if (score >= 90) return '#27ae60'; // Green
    if (score >= 70) return '#f39c12'; // Yellow/Orange
    return '#e74c3c';                   // Red
}

/**
 * Get the grade label for a GTO score.
 */
export function getScoreGrade(score) {
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

// ═══════════════════════════════════════════════════════════════════════════
// SESSION SCORER — Tracks scoring across a training session
// ═══════════════════════════════════════════════════════════════════════════

export class SessionScorer {
    constructor() {
        this.moves = [];
        this.startTime = Date.now();
        this.currentStreak = 0;
        this.bestStreak = 0;
    }

    /**
     * Record a move and update scores.
     *
     * @param {Object} move
     * @param {string} move.handId - Scenario/hand identifier
     * @param {string} move.street - 'preflop', 'flop', 'turn', 'river'
     * @param {string} move.heroCards - Hero's hand notation
     * @param {string[]} [move.board] - Board cards
     * @param {string} move.playerAction - Action taken by player
     * @param {string} move.gtoAction - GTO optimal action
     * @param {number} move.evLoss - EV loss in BB
     * @param {number} [move.score] - Score (0-100) if pre-calculated
     * @returns {{ classification: Object, sessionScore: number, streak: number }}
     */
    recordMove(move) {
        const classification = classifyMove(move.evLoss);
        const score = move.score ?? _evLossToScore(move.evLoss);

        const entry = {
            ...move,
            classification: classification.key,
            score,
            timestamp: Date.now(),
            moveNumber: this.moves.length + 1,
        };

        this.moves.push(entry);

        // Update streak
        if (classification.key === 'correct') {
            this.currentStreak++;
            if (this.currentStreak > this.bestStreak) this.bestStreak = this.currentStreak;
        } else {
            this.currentStreak = 0;
        }

        return {
            classification,
            sessionScore: this.getGTOScore(),
            streak: this.currentStreak,
            bestStreak: this.bestStreak,
            moveNumber: entry.moveNumber,
        };
    }

    /**
     * Get the overall GTO Score for the session (0-100%).
     * Weighted: recent moves count slightly more than older ones.
     */
    getGTOScore() {
        if (this.moves.length === 0) return 100;

        let weightedSum = 0;
        let totalWeight = 0;

        for (let i = 0; i < this.moves.length; i++) {
            // Recency weight: newer moves have slightly higher weight
            const weight = 1 + (i / this.moves.length) * 0.3;
            weightedSum += this.moves[i].score * weight;
            totalWeight += weight;
        }

        return Math.round(weightedSum / totalWeight);
    }

    /**
     * Get total EV loss across the session.
     * @returns {{ total: number, average: number, worst: Object }}
     */
    getEVLoss() {
        if (this.moves.length === 0) return { total: 0, average: 0, worst: null };

        let total = 0;
        let worst = null;

        for (const m of this.moves) {
            total += m.evLoss;
            if (!worst || m.evLoss > worst.evLoss) worst = m;
        }

        return {
            total: Math.round(total * 100) / 100,
            average: Math.round((total / this.moves.length) * 100) / 100,
            worst,
        };
    }

    /**
     * Get classification breakdown.
     * @returns {{ correct: number, inaccuracy: number, mistake: number, blunder: number }}
     */
    getBreakdown() {
        const counts = { correct: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
        for (const m of this.moves) {
            counts[m.classification] = (counts[m.classification] || 0) + 1;
        }
        return counts;
    }

    /**
     * Get breakdown by street.
     * @returns {Object} Score per street
     */
    getStreetBreakdown() {
        const streets = {};
        for (const m of this.moves) {
            if (!streets[m.street]) {
                streets[m.street] = { moves: 0, totalScore: 0, totalEVLoss: 0 };
            }
            streets[m.street].moves++;
            streets[m.street].totalScore += m.score;
            streets[m.street].totalEVLoss += m.evLoss;
        }

        for (const key of Object.keys(streets || {})) {
            streets[key].avgScore = Math.round(streets[key].totalScore / streets[key].moves);
            streets[key].avgEVLoss = Math.round((streets[key].totalEVLoss / streets[key].moves) * 100) / 100;
        }

        return streets;
    }

    /**
     * Get the complete session summary.
     */
    getSummary() {
        const duration = Math.round((Date.now() - this.startTime) / 1000);
        const gtoScore = this.getGTOScore();

        return {
            gtoScore,
            grade: getScoreGrade(gtoScore),
            color: getScoreColor(gtoScore),
            handsPlayed: this.moves.length,
            duration,
            evLoss: this.getEVLoss(),
            breakdown: this.getBreakdown(),
            streetBreakdown: this.getStreetBreakdown(),
            bestStreak: this.bestStreak,
            currentStreak: this.currentStreak,
            biggestMistakes: this._getBiggestMistakes(3),
            bestPlays: this._getBestPlays(3),
        };
    }

    /** Get the N biggest mistakes in the session */
    _getBiggestMistakes(n) {
        return [...this.moves]
            .sort((a, b) => b.evLoss - a.evLoss)
            .slice(0, n);
    }

    /** Get the N best plays in the session */
    _getBestPlays(n) {
        return [...this.moves]
            .filter(m => m.classification === 'correct')
            .sort((a, b) => b.score - a.score)
            .slice(0, n);
    }

    /** Reset the session */
    reset() {
        this.moves = [];
        this.startTime = Date.now();
        this.currentStreak = 0;
        this.bestStreak = 0;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert EV loss to a score (0-100).
 */
function _evLossToScore(evLoss) {
    if (evLoss <= 0) return 100;
    if (evLoss < 0.25) return 95;
    if (evLoss < 0.5) return 85;
    if (evLoss < 1.0) return 70;
    if (evLoss < 2.0) return 50;
    if (evLoss < 3.0) return 30;
    if (evLoss < 5.0) return 15;
    return 5;
}

// ── Diamond Rewards ──────────────────────────────────────────────────────

/**
 * Calculate diamond rewards for a completed session.
 *
 * @param {Object} summary - Output from SessionScorer.getSummary()
 * @param {number} levelMultiplier - Level-based multiplier from LEVEL_CONFIG
 * @returns {{ diamonds: number, breakdown: Object }}
 */
export function calculateSessionDiamonds(summary, levelMultiplier = 1.0) {
    // 2026-07-19 AUDIT FIX (wave-1 E2E): callers pass two different summary
    // shapes ({handsPlayed, gtoScore, breakdown.correct} vs the legacy
    // {totalMoves, score, correctMoves}) — the legacy shape threw
    // "Cannot read properties of undefined (reading 'correct')" on every
    // arena session completion, so the reward was always 0. Accept both.
    // Also clamp the multiplier: a caller once passed the raw LEVEL (1-12)
    // where a 1.0-2.0 registry multiplier belongs.
    const handsPlayed = summary.handsPlayed ?? summary.totalMoves ?? 0;
    const gtoScore = summary.gtoScore ?? summary.score ?? 0;
    const bestStreak = summary.bestStreak ?? 0;
    const correctCount = summary.breakdown?.correct ?? summary.correctMoves ?? 0;
    const safeMultiplier = Math.max(0.5, Math.min(2.0, Number(levelMultiplier) || 1.0));

    const base = 10; // Base diamonds per hand
    const handDiamonds = handsPlayed * base;

    // Score bonus: higher GTO score = more diamonds
    const scoreBonus = gtoScore >= 90 ? 2.0
        : gtoScore >= 80 ? 1.5
        : gtoScore >= 70 ? 1.2
        : 1.0;

    // Streak bonus
    const streakBonus = Math.min(50, bestStreak * 5);

    // Accuracy bonus
    const accuracyBonus = correctCount * 5;

    const total = Math.round((handDiamonds * scoreBonus + streakBonus + accuracyBonus) * safeMultiplier);

    return {
        diamonds: total,
        breakdown: {
            base: handDiamonds,
            scoreBonus: Math.round(handDiamonds * (scoreBonus - 1)),
            streakBonus,
            accuracyBonus,
            levelMultiplier: safeMultiplier,
        },
    };
}

export default {
    classifyMove,
    getScoreColor,
    getScoreGrade,
    SessionScorer,
    calculateSessionDiamonds,
    MOVE_CLASSIFICATIONS,
};
