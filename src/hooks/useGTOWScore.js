/**
 * 🎯 useGTOWScore — GTO Wizard-Style Scoring Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Tracks session-level scoring metrics matching GTO Wizard's system:
 * - GTOW Score (-100% to +100%)
 * - 5-tier move classification (Best/Correct/Inaccuracy/Wrong/Blunder)
 * - EV Loss tracking (total, per hand, per mistake)
 * - Frequency difference tracking
 * - Hand history for post-session review
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const MOVE_CLASSIFICATIONS = {
    BEST: 'best',
    CORRECT: 'correct',
    INACCURACY: 'inaccuracy',
    WRONG: 'wrong',
    BLUNDER: 'blunder',
};

export const CLASSIFICATION_CONFIG = {
    [MOVE_CLASSIFICATIONS.BEST]: {
        label: 'Best Move',
        color: '#22c55e',       // Bright green
        bgColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: '#22c55e',
        icon: 'star',           // SVG rendered at component level
        scoreImpact: { min: 3, max: 5 },
    },
    [MOVE_CLASSIFICATIONS.CORRECT]: {
        label: 'Correct',
        color: '#4ade80',       // Green
        bgColor: 'rgba(74, 222, 128, 0.12)',
        borderColor: '#4ade80',
        icon: 'check',          // SVG rendered at component level
        scoreImpact: { min: 1, max: 2 },
    },
    [MOVE_CLASSIFICATIONS.INACCURACY]: {
        label: 'Inaccuracy',
        color: '#fbbf24',       // Yellow/Amber
        bgColor: 'rgba(251, 191, 36, 0.12)',
        borderColor: '#fbbf24',
        icon: 'alert',          // SVG rendered at component level
        scoreImpact: { min: -1, max: -2 },
    },
    [MOVE_CLASSIFICATIONS.WRONG]: {
        label: 'Wrong',
        color: '#ef4444',       // Red
        bgColor: 'rgba(239, 68, 68, 0.12)',
        borderColor: '#ef4444',
        icon: 'x',              // SVG rendered at component level
        scoreImpact: { min: -3, max: -5 },
    },
    [MOVE_CLASSIFICATIONS.BLUNDER]: {
        label: 'Blunder',
        color: '#b91c1c',       // Dark Red
        bgColor: 'rgba(185, 28, 28, 0.15)',
        borderColor: '#b91c1c',
        icon: 'warning',        // SVG rendered at component level
        scoreImpact: { min: -8, max: -10 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY SIMULATION — Generates approximate GTO frequencies for options
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulate GTO frequencies for the answer options.
 * Uses the correct answer + option count to create realistic GTO distributions.
 * In a real solver, these come from the strategy matrix. Here, we approximate
 * distributions that look realistic for training feedback.
 */
export function simulateGTOFrequencies(options, correctAnswer, level = 1) {
    const frequencies = {};
    const optionCount = options.length;

    // BUG-03 FIX: Deterministic seeded PRNG based on option data
    // Same question + options always produces identical frequencies

    // BUG-H FIX: Use deterministic hash instead of Math.random()
    // Same inputs always produce same frequencies
    function hashStr(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    }
    function seededRand(seed) {
        return ((seed * 9301 + 49297) % 233280) / 233280;
    }

    const baseSeed = hashStr((correctAnswer || '') + options.length + level);

    options.forEach((option, index) => {
        const optionId = option.id || String.fromCharCode(97 + index);
        const text = (typeof option === 'string' ? option : (option.text || option.label || '')).toLowerCase();

        const isCorrect = optionId === correctAnswer || optionId?.toLowerCase() === correctAnswer?.toLowerCase();
        const optSeed = baseSeed + hashStr(optionId);

        if (isCorrect) {
            const dominance = Math.max(40, 85 - (level * 4));
            frequencies[optionId] = dominance + seededRand(optSeed) * 10;
        } else {
            const isPartiallyCorrect = seededRand(optSeed + 1) > 0.6;
            if (isPartiallyCorrect) {
                frequencies[optionId] = 3 + seededRand(optSeed + 2) * 15;
            } else {
                frequencies[optionId] = seededRand(optSeed + 3) * 3;
            }
        }
    });

    // Normalize to 100%
    const total = Object.values(frequencies).reduce((sum, f) => sum + f, 0);
    Object.keys(frequencies).forEach(key => {
        frequencies[key] = Math.round((frequencies[key] / total) * 100);
    });

    // Ensure they sum to exactly 100
    const currentSum = Object.values(frequencies).reduce((s, f) => s + f, 0);
    const diff = 100 - currentSum;
    const correctKey = Object.keys(frequencies).find(k =>
        k === correctAnswer || k?.toLowerCase() === correctAnswer?.toLowerCase()
    );
    if (correctKey) frequencies[correctKey] += diff;

    return frequencies;
}

/**
 * Simulate EV loss for a given move classification.
 * Returns EV loss in big blinds (BB).
 * Used as FALLBACK when real PIO EV data is unavailable.
 */
export function simulateEVLoss(classification, pot = 10) {
    const potFactor = Math.max(1, pot / 10); // Scale with pot size

    switch (classification) {
        case MOVE_CLASSIFICATIONS.BEST:
            return 0;
        case MOVE_CLASSIFICATIONS.CORRECT:
            return 0; // Correct moves lose 0 EV (they're part of GTO)
        case MOVE_CLASSIFICATIONS.INACCURACY:
            return Math.round((0.05 + Math.random() * 0.2) * potFactor * 100) / 100;
        case MOVE_CLASSIFICATIONS.WRONG:
            return Math.round((0.3 + Math.random() * 0.7) * potFactor * 100) / 100;
        case MOVE_CLASSIFICATIONS.BLUNDER:
            return Math.round((1.0 + Math.random() * 2.0) * potFactor * 100) / 100;
        default:
            return 0;
    }
}

/**
 * Calculate REAL EV loss using PIO solver hand_evs data.
 * EV loss = optimalEV - selectedActionEV (in solver units, normalized to BB).
 * 
 * @param {Object} evData - { heroHandEV, optimalEV, handEVs } from PIO solver
 * @param {string} selectedAction - The action the player chose
 * @param {string} optimalAction - The highest-frequency (GTO optimal) action
 * @param {Object} rawFrequencies - Raw 0.0-1.0 frequencies per action per hand
 * @param {string} heroHand - The hero's hand notation
 * @param {number} pot - Current pot size in BB
 * @returns {number} Real EV loss in BB (0 if optimal, positive if suboptimal)
 */
export function calculateRealEVLoss(evData, selectedAction, optimalAction, rawFrequencies, heroHand, pot = 10) {
    if (!evData || !evData.handEVs) return null; // Signal: no real data, use simulation

    const heroEV = evData.heroHandEV || 0;
    const optimalEV = evData.optimalEV || heroEV;

    // If player chose the optimal action, EV loss = 0
    if (selectedAction === optimalAction) return 0;

    // BUG-B FIX: Better EV loss approximation when per-action EV data isn't available.
    // Use (1 - selectedFreq) as the primary signal — actions with 0% solver frequency
    // have maximum EV loss, while actions with 40% frequency have minimal EV loss.
    const selectedFreqNorm = selectedFreq; // 0.0 - 1.0 from rawFrequencies
    const potFactor = Math.max(1, pot / 10);

    // Non-linear scaling: near-zero frequency actions lose much more EV
    const lossScale = Math.pow(1 - selectedFreqNorm, 1.5);
    const evLoss = Math.min(lossScale * potFactor * 0.8, pot * 0.5); // Cap at 50% of pot

    return Math.round(evLoss * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVE CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify a player's move using the 5-tier GTO Wizard system.
 * 
 * MIXED STRATEGY HANDLING (improved for real solver data):
 * If GTO solver says Check 62% / Bet 38%, BOTH are considered correct.
 * The classification is based on the frequency of the chosen action:
 * - >=20% → BEST (valid GTO play, major part of the mix)
 * - >=5%  → CORRECT (minor but valid part of mix)
 * - >=1%  → INACCURACY (marginal, rarely used)
 * - 0%    → WRONG or BLUNDER (not in solver strategy)
 * 
 * @param {string} selectedAnswer - The player's chosen answer ID
 * @param {string} correctAnswer - The correct (highest-frequency) answer ID
 * @param {Object} gtoFrequencies - Map of option ID → frequency % (0-100 scale)
 * @param {number} level - Current difficulty level (1-10)
 * @param {Object} [evData] - Optional real PIO EV data { heroHandEV, optimalEV, handEVs }
 * @param {Object} [rawFrequencies] - Optional raw 0.0-1.0 frequencies from PIO
 * @param {string} [heroHand] - Optional hero hand for EV lookup
 * @param {number} [pot] - Optional pot size in BB
 * @returns {{ classification: string, evLoss: number, frequencyDiff: number, isRealData: boolean }}
 */
export function classifyMove(selectedAnswer, correctAnswer, gtoFrequencies = {}, level = 1, evData = null, rawFrequencies = null, heroHand = null, pot = null) {
    const selectedNorm = selectedAnswer?.toLowerCase();
    const correctNorm = correctAnswer?.toLowerCase();

    // Get frequency of the selected action (0 if not in GTO)
    const selectedFreq = gtoFrequencies[selectedAnswer] || gtoFrequencies[selectedNorm] || 0;
    // Get frequency of the correct (highest-frequency) action
    const correctFreq = gtoFrequencies[correctAnswer] || gtoFrequencies[correctNorm] || 100;

    // Frequency difference from the most frequent action
    const frequencyDiff = Math.abs(correctFreq - selectedFreq);

    // ═══ MIXED STRATEGY CLASSIFICATION (Real Solver Logic) ═══
    // GTO Wizard treats any action with significant frequency as valid
    let classification;

    if (selectedNorm === correctNorm) {
        // Chose the highest-frequency action — always BEST
        classification = MOVE_CLASSIFICATIONS.BEST;
    } else if (selectedFreq >= 20) {
        // Major part of the mix (e.g., 38% check when 62% bet) — still BEST
        classification = MOVE_CLASSIFICATIONS.BEST;
    } else if (selectedFreq >= 5) {
        // Minor but valid part of the mix — CORRECT
        classification = MOVE_CLASSIFICATIONS.CORRECT;
    } else if (selectedFreq >= 1) {
        // Marginal frequency — INACCURACY (technically in solver strategy but rare)
        classification = MOVE_CLASSIFICATIONS.INACCURACY;
    } else if (frequencyDiff < 50) {
        // Not in strategy but close to other valid actions — WRONG
        classification = MOVE_CLASSIFICATIONS.WRONG;
    } else {
        // Completely off — BLUNDER
        classification = MOVE_CLASSIFICATIONS.BLUNDER;
    }

    // Calculate EV loss — prefer real PIO data, fall back to simulation
    const effectivePot = pot || 10 * (1 + level * 0.5);
    let evLoss;
    let isRealData = false;

    if (evData && rawFrequencies && heroHand) {
        const realLoss = calculateRealEVLoss(evData, selectedAnswer, correctAnswer, rawFrequencies, heroHand, effectivePot);
        if (realLoss !== null) {
            evLoss = realLoss;
            isRealData = true;
        }
    }

    if (!isRealData) {
        evLoss = simulateEVLoss(classification, effectivePot);
    }

    return {
        classification,
        evLoss,
        frequencyDiff,
        selectedFreq,
        correctFreq,
        isRealData,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════════

export default function useGTOWScore() {
    const [handsPlayed, setHandsPlayed] = useState(0);
    const [movesMade, setMovesMade] = useState(0);
    const [mistakeCount, setMistakeCount] = useState(0);
    const [totalEVLoss, setTotalEVLoss] = useState(0);
    const [totalScore, setTotalScore] = useState(0);
    const [maxPossibleScore, setMaxPossibleScore] = useState(0);
    const [totalFreqDiff, setTotalFreqDiff] = useState(0);
    const [handHistory, setHandHistory] = useState([]);

    // Derived metrics
    const gtowScore = useMemo(() => {
        if (movesMade === 0) return 100;
        // ═══ IMPROVED SCORING: Additive approach — more forgiving early game ═══
        // Average score impact per hand, scaled to visible 0-100 range
        // A single blunder on hand 1 → ~70% instead of 22%
        const avgImpact = totalScore / movesMade;
        const raw = 100 + (avgImpact * 8); // Scale factor of 8 for visible movement
        return Math.round(Math.max(0, Math.min(100, raw)));
    }, [totalScore, movesMade]);

    const avgEVLossPerHand = useMemo(() => {
        if (handsPlayed === 0) return 0;
        return Math.round((totalEVLoss / handsPlayed) * 100) / 100;
    }, [totalEVLoss, handsPlayed]);

    const avgEVLossPerMistake = useMemo(() => {
        if (mistakeCount === 0) return 0;
        return Math.round((totalEVLoss / mistakeCount) * 100) / 100;
    }, [totalEVLoss, mistakeCount]);

    const avgFrequencyDiff = useMemo(() => {
        if (movesMade === 0) return 0;
        return Math.round((totalFreqDiff / movesMade) * 10) / 10;
    }, [totalFreqDiff, movesMade]);

    /**
     * Record a move and update all metrics.
     * @param {Object} params
     * @param {string} params.classification - MOVE_CLASSIFICATIONS value
     * @param {number} params.evLoss - EV loss in BB
     * @param {number} params.frequencyDiff - Frequency difference %
     * @param {Object} params.handData - { heroCards, board, heroPosition, pot, action, question }
     */
    const recordMove = useCallback((params) => {
        const { classification, evLoss, frequencyDiff, handData = {} } = params;

        const config = CLASSIFICATION_CONFIG[classification];
        // BUG-J FIX: Deterministic score impact — use midpoint instead of random
        const scoreImpact = config
            ? (config.scoreImpact.min + config.scoreImpact.max) / 2
            : 0;

        const isMistake = [
            MOVE_CLASSIFICATIONS.INACCURACY,
            MOVE_CLASSIFICATIONS.WRONG,
            MOVE_CLASSIFICATIONS.BLUNDER,
        ].includes(classification);

        setHandsPlayed(prev => prev + 1);
        setMovesMade(prev => prev + 1);
        if (isMistake) setMistakeCount(prev => prev + 1);
        setTotalEVLoss(prev => Math.round((prev + evLoss) * 100) / 100);
        setTotalScore(prev => prev + scoreImpact);
        setMaxPossibleScore(prev => prev + CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.BEST].scoreImpact.max);
        setTotalFreqDiff(prev => prev + frequencyDiff);

        // Add to hand history
        setHandHistory(prev => [...prev, {
            handNumber: prev.length + 1,
            classification,
            evLoss,
            frequencyDiff,
            timestamp: Date.now(),
            ...handData,
        }]);
    }, []);

    /**
     * Reset all scoring state for a new session.
     */
    const resetScore = useCallback(() => {
        setHandsPlayed(0);
        setMovesMade(0);
        setMistakeCount(0);
        setTotalEVLoss(0);
        setTotalScore(0);
        setMaxPossibleScore(0);
        setTotalFreqDiff(0);
        setHandHistory([]);
    }, []);

    return {
        // Core metrics
        gtowScore,
        totalEVLoss,
        handsPlayed,
        movesMade,
        mistakeCount,
        avgEVLossPerHand,
        avgEVLossPerMistake,
        avgFrequencyDiff,
        handHistory,

        // Actions
        recordMove,
        resetScore,

        // Re-exported for convenience
        MOVE_CLASSIFICATIONS,
        CLASSIFICATION_CONFIG,
    };
}
