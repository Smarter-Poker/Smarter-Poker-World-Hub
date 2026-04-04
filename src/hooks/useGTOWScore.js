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
        color: '#22c55e',       // Green
        bgColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: '#22c55e',
        icon: 'star',
        scoreImpact: { min: 3, max: 5 },
    },
    [MOVE_CLASSIFICATIONS.CORRECT]: {
        label: 'Excellent',
        color: '#84cc16',       // Yellow-Green
        bgColor: 'rgba(132, 204, 22, 0.12)',
        borderColor: '#84cc16',
        icon: 'check',
        scoreImpact: { min: 1, max: 2 },
    },
    [MOVE_CLASSIFICATIONS.INACCURACY]: {
        label: 'Inaccuracy',
        color: '#facc15',       // Yellow
        bgColor: 'rgba(250, 204, 21, 0.12)',
        borderColor: '#facc15',
        icon: 'alert',
        scoreImpact: { min: -1, max: -2 },
    },
    [MOVE_CLASSIFICATIONS.WRONG]: {
        label: 'Mistake',
        color: '#f97316',       // Orange
        bgColor: 'rgba(249, 115, 22, 0.12)',
        borderColor: '#f97316',
        icon: 'x',
        scoreImpact: { min: -3, max: -5 },
    },
    [MOVE_CLASSIFICATIONS.BLUNDER]: {
        label: 'Blunder',
        color: '#ef4444',       // Red
        bgColor: 'rgba(239, 68, 68, 0.15)',
        borderColor: '#ef4444',
        icon: 'warning',
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

    // BUG-L FIX: Use deterministic midpoint values instead of Math.random()
    // This ensures consistent EV loss display for the same classification
    switch (classification) {
        case MOVE_CLASSIFICATIONS.BEST:
            return 0;
        case MOVE_CLASSIFICATIONS.CORRECT:
            return 0; // Correct moves lose 0 EV (they're part of GTO)
        case MOVE_CLASSIFICATIONS.INACCURACY:
            return Math.round(0.15 * potFactor * 100) / 100;  // midpoint of 0.05-0.25
        case MOVE_CLASSIFICATIONS.WRONG:
            return Math.round(0.65 * potFactor * 100) / 100;  // midpoint of 0.3-1.0
        case MOVE_CLASSIFICATIONS.BLUNDER:
            return Math.round(2.0 * potFactor * 100) / 100;   // midpoint of 1.0-3.0
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

    // If player chose the optimal action, EV loss = 0
    if (selectedAction === optimalAction) return 0;

    // ═══ Use per-action EV if available (computed by engine) ═══
    if (evData.actionEVs) {
        const selectedEV = evData.actionEVs[selectedAction] ?? evData.actionEVs[selectedAction?.toLowerCase()];
        const optimalEV = evData.actionEVs[optimalAction] ?? evData.actionEVs[optimalAction?.toLowerCase()];
        if (typeof selectedEV === 'number' && typeof optimalEV === 'number') {
            const loss = Math.max(0, optimalEV - selectedEV);
            return Math.round(loss * 100) / 100;
        }
    }

    // ═══ Fallback: frequency-based EV estimation ═══
    // Look up hero's frequency for the selected action (0.0-1.0 scale)
    let selectedFreqNorm = 0;
    if (rawFrequencies && heroHand) {
        const actionHandFreqs = rawFrequencies[selectedAction];
        if (actionHandFreqs && typeof actionHandFreqs === 'object') {
            selectedFreqNorm = actionHandFreqs[heroHand] ?? 0;
        } else if (typeof actionHandFreqs === 'number') {
            selectedFreqNorm = actionHandFreqs;
        }
    }

    const potFactor = Math.max(1, pot / 10);

    // Non-linear scaling: near-zero frequency actions lose much more EV
    // At equilibrium, mixed actions have equal EV. 0% frequency actions are strictly worse.
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
    // Use ?? (nullish coalescing) — || would treat freq=0 as falsy and skip it
    const selectedFreq = gtoFrequencies[selectedAnswer] ?? gtoFrequencies[selectedNorm] ?? 0;
    // Get frequency of the correct (highest-frequency) action
    const correctFreq = gtoFrequencies[correctAnswer] ?? gtoFrequencies[correctNorm] ?? 100;

    // Frequency difference from the most frequent action
    const frequencyDiff = Math.abs(correctFreq - selectedFreq);

    // ═══ MIXED STRATEGY CLASSIFICATION (Real Solver Logic) ═══
    // GTO Wizard treats any action with significant frequency as valid.
    // Classification is PURELY frequency-based — EV is only for display.
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
    } else {
        // 0% frequency — WRONG or BLUNDER
        // Distinguish by checking how many valid actions exist and the correctFreq:
        // - If the solver is "pure" (one action >= 90%) and player chose something else → BLUNDER
        // - If multiple actions have decent frequency (mixed strategy) → WRONG (less egregious)
        const nonZeroActions = Object.values(gtoFrequencies).filter(f => f > 0).length;
        const isPureStrategy = correctFreq >= 80;
        if (isPureStrategy || nonZeroActions <= 1) {
            // Solver overwhelmingly prefers one action — choosing 0% is a BLUNDER
            classification = MOVE_CLASSIFICATIONS.BLUNDER;
        } else {
            // Multiple valid actions exist — choosing 0% is wrong but less severe
            classification = MOVE_CLASSIFICATIONS.WRONG;
        }
    }

    // Calculate EV loss — prefer real PIO data, fall back to simulation
    // GTO Wizard uses FREQUENCY as the primary classification signal,
    // with EV loss as a secondary display metric. We keep classification
    // frequency-based and only use EV for the loss number shown in UI.
    const effectivePot = pot || 10 * (1 + level * 0.5);
    let evLoss;
    let isRealData = false;

    if (evData && rawFrequencies && heroHand) {
        const realLoss = calculateRealEVLoss(evData, selectedAnswer, correctAnswer, rawFrequencies, heroHand, effectivePot);
        if (realLoss !== null) {
            evLoss = realLoss;
            isRealData = true;
            // NOTE: We intentionally do NOT override the frequency-based classification
            // with EV thresholds. GTO Wizard's primary signal is the solver frequency
            // of the chosen action, not the raw EV difference. An action with 30% solver
            // frequency is "Best Move" even if EV loss is technically nonzero.
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

    // ═══ Phase 36: Classification breakdown + streak tracking ═══
    const [classificationCounts, setClassificationCounts] = useState({
        best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0,
    });
    const [currentStreak, setCurrentStreak] = useState(0);  // positive = correct streak, negative = mistake streak
    const [bestStreak, setBestStreak] = useState(0);
    const [lastClassification, setLastClassification] = useState(null);

    // ═══ Phase 38: Position-based + street-based accuracy tracking ═══
    const [positionStats, setPositionStats] = useState({});  // { 'BTN': { total: 0, correct: 0 }, ... }
    const [streetStats, setStreetStats] = useState({});      // { 'flop': { total: 0, correct: 0 }, ... }

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

        // ═══ Phase 36: Track classification breakdown ═══
        setClassificationCounts(prev => ({
            ...prev,
            [classification]: (prev[classification] || 0) + 1,
        }));

        // ═══ Phase 36: Track streaks ═══
        const isCorrectMove = classification === MOVE_CLASSIFICATIONS.BEST || classification === MOVE_CLASSIFICATIONS.CORRECT;
        setCurrentStreak(prev => {
            if (isCorrectMove) {
                const newStreak = prev >= 0 ? prev + 1 : 1;
                setBestStreak(best => Math.max(best, newStreak));
                return newStreak;
            }
            return prev > 0 ? -1 : prev - 1; // Reset to -1 on first mistake
        });
        setLastClassification(classification);

        // ═══ Phase 38: Track position-based accuracy ═══
        const position = handData?.heroPosition;
        if (position) {
            const normalizedPos = position.toUpperCase().replace(/[^A-Z]/g, '');
            setPositionStats(prev => {
                const existing = prev[normalizedPos] || { total: 0, correct: 0 };
                return {
                    ...prev,
                    [normalizedPos]: {
                        total: existing.total + 1,
                        correct: existing.correct + (isCorrectMove ? 1 : 0),
                    },
                };
            });
        }

        // ═══ Phase 38: Track street-based accuracy ═══
        const street = handData?.street;
        if (street) {
            const normalizedStreet = street.toLowerCase();
            setStreetStats(prev => {
                const existing = prev[normalizedStreet] || { total: 0, correct: 0 };
                return {
                    ...prev,
                    [normalizedStreet]: {
                        total: existing.total + 1,
                        correct: existing.correct + (isCorrectMove ? 1 : 0),
                    },
                };
            });
        }

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
        setClassificationCounts({ best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 });
        setCurrentStreak(0);
        setBestStreak(0);
        setLastClassification(null);
        setPositionStats({});
        setStreetStats({});
    }, []);

    // ═══ Phase 36: Derived accuracy metric ═══
    const accuracy = useMemo(() => {
        if (movesMade === 0) return 100;
        const correct = (classificationCounts.best || 0) + (classificationCounts.correct || 0);
        return Math.round((correct / movesMade) * 100);
    }, [movesMade, classificationCounts]);

    // ═══ Phase 38: Derived position/street accuracy maps ═══
    const positionAccuracy = useMemo(() => {
        const result = {};
        for (const [pos, stats] of Object.entries(positionStats)) {
            result[pos] = {
                ...stats,
                accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
            };
        }
        return result;
    }, [positionStats]);

    const streetAccuracy = useMemo(() => {
        const result = {};
        for (const [st, stats] of Object.entries(streetStats)) {
            result[st] = {
                ...stats,
                accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
            };
        }
        return result;
    }, [streetStats]);

    // ═══ Phase 38: Weakest position (lowest accuracy with enough samples) ═══
    const weakestPosition = useMemo(() => {
        let worst = null;
        let worstAcc = 101;
        for (const [pos, data] of Object.entries(positionAccuracy)) {
            if (data.total >= 2 && data.accuracy < worstAcc) {
                worstAcc = data.accuracy;
                worst = pos;
            }
        }
        return worst;
    }, [positionAccuracy]);

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

        // Phase 36: Enhanced metrics
        classificationCounts,
        currentStreak,
        bestStreak,
        lastClassification,
        accuracy,

        // Phase 38: Position & street accuracy
        positionAccuracy,
        streetAccuracy,
        weakestPosition,

        // Actions
        recordMove,
        resetScore,

        // Re-exported for convenience
        MOVE_CLASSIFICATIONS,
        CLASSIFICATION_CONFIG,
    };
}
