/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * DIFFICULTY ENGINE — Training Difficulty Modes
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Three difficulty modes matching GTO Wizard's approach:
 *
 *   SIMPLE:    3 options — Bet/Raise, Check/Call, Fold
 *              Best for beginners. Focus on "do I play or fold?"
 *
 *   GROUPED:   5 options — Action type only (no exact sizing)
 *              Bet, Raise, Check, Call, Fold
 *
 *   STANDARD:  Full solver sizings — Check, Bet 33%, Bet 67%, Bet 150%, etc.
 *              Exact match to solver output. For advanced players.
 *
 * Also handles:
 *   - Hand filtering (premium only, close decisions, remove trivial folds)
 *   - Timer settings per difficulty
 *   - Scoring adjustments per difficulty
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● Difficulty Modes ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const DIFFICULTY = {
    SIMPLE: 'simple',
    GROUPED: 'grouped',
    STANDARD: 'standard',
};

export const DIFFICULTY_CONFIG = {
    [DIFFICULTY.SIMPLE]: {
        label: 'Simple',
        description: 'Bet/Check/Fold — Focus on action direction',
        timer: 30,
        scoreMultiplier: 0.8,  // Easier mode, slightly lower reward
        maxOptions: 3,
        showFrequencies: false,
        showSizing: false,
        showEV: false,
    },
    [DIFFICULTY.GROUPED]: {
        label: 'Grouped',
        description: 'Action type only — Bet, Raise, Check, Call, Fold',
        timer: 20,
        scoreMultiplier: 1.0,
        maxOptions: 5,
        showFrequencies: true,
        showSizing: false,
        showEV: false,
    },
    [DIFFICULTY.STANDARD]: {
        label: 'Standard',
        description: 'Exact solver sizings — Match the GTO solution precisely',
        timer: 15,
        scoreMultiplier: 1.5,  // Harder mode, higher reward
        maxOptions: 8,
        showFrequencies: true,
        showSizing: true,
        showEV: true,
    },
};

// ●● Simplify Actions ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Simplify a full action set to match the selected difficulty.
 *
 * @param {Array<{ action: string, label: string, amount?: number }>} fullActions
 * @param {string} difficulty - 'simple', 'grouped', or 'standard'
 * @param {number} potSize - Current pot (for percentage labels)
 * @returns {Array<{ action: string, label: string, amount?: number, isSimplified: boolean }>}
 */
export function simplifyActions(fullActions, difficulty, potSize) {
    if (difficulty === DIFFICULTY.STANDARD) {
        // Return all actions as-is
        return fullActions.map(a => ({ ...a, isSimplified: false }));
    }

    if (difficulty === DIFFICULTY.SIMPLE) {
        return _simplifyToSimple(fullActions);
    }

    if (difficulty === DIFFICULTY.GROUPED) {
        return _simplifyToGrouped(fullActions);
    }

    return fullActions;
}

/**
 * SIMPLE mode: Collapse to 3 options max.
 *   - "Bet/Raise" (any aggressive action → single button)
 *   - "Check/Call" (any passive continuing action → single button)
 *   - "Fold"
 */
function _simplifyToSimple(fullActions) {
    const simplified = [];
    const hasCheck = fullActions.some(a => a.action === 'check');
    const hasCall = fullActions.some(a => a.action === 'call');
    const hasBet = fullActions.some(a => a.action === 'bet' || a.action === 'raise' || a.action === 'allin');
    const hasFold = fullActions.some(a => a.action === 'fold');

    // Aggressive action
    if (hasBet) {
        const bestBet = fullActions.find(a => a.action === 'bet' || a.action === 'raise') || fullActions.find(a => a.action === 'allin');
        simplified.push({
            action: bestBet.action,
            label: hasCall ? 'Raise' : 'Bet',
            amount: bestBet.amount,
            mappedFrom: fullActions.filter(a => ['bet', 'raise', 'allin'].includes(a.action)),
            isSimplified: true,
        });
    }

    // Passive action
    if (hasCheck) {
        simplified.push({ action: 'check', label: 'Check', isSimplified: true });
    } else if (hasCall) {
        const callAction = fullActions.find(a => a.action === 'call');
        simplified.push({
            action: 'call',
            label: `Call ${callAction.amount?.toFixed(1) || ''}BB`,
            amount: callAction.amount,
            isSimplified: true,
        });
    }

    // Fold
    if (hasFold) {
        simplified.push({ action: 'fold', label: 'Fold', isSimplified: true });
    }

    return simplified;
}

/**
 * GROUPED mode: Collapse sizing variants into action types.
 *   - "Bet" (any bet sizing → single button)
 *   - "Raise" (any raise sizing → single button)
 *   - "Check"
 *   - "Call"
 *   - "Fold"
 */
function _simplifyToGrouped(fullActions) {
    const simplified = [];
    const seen = new Set();

    for (const action of fullActions) {
        let key = action.action;

        // Collapse all bet sizings into "bet"
        if (key === 'allin') key = fullActions.some(a => a.action === 'raise') ? 'raise' : 'bet';

        if (seen.has(key)) continue;
        seen.add(key);

        if (key === 'bet') {
            const bets = fullActions.filter(a => a.action === 'bet');
            const medianBet = bets.length > 0 ? bets[Math.floor(bets.length / 2)] : action;
            simplified.push({
                action: 'bet',
                label: 'Bet',
                amount: medianBet.amount,
                mappedFrom: bets,
                isSimplified: true,
            });
        } else if (key === 'raise') {
            const raises = fullActions.filter(a => a.action === 'raise');
            const medianRaise = raises.length > 0 ? raises[Math.floor(raises.length / 2)] : action;
            simplified.push({
                action: 'raise',
                label: 'Raise',
                amount: medianRaise.amount,
                mappedFrom: raises,
                isSimplified: true,
            });
        } else {
            simplified.push({ ...action, isSimplified: true });
        }
    }

    return simplified;
}

// ●● Hand Filtering ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Filter scenarios based on difficulty and user preferences.
 *
 * @param {Array} scenarios - Full scenario list
 * @param {Object} filters
 * @param {boolean} [filters.premiumOnly] - Only deal premium hands
 * @param {boolean} [filters.closeDecisions] - Only spots where action is mixed
 * @param {boolean} [filters.removeTrivialFolds] - Skip hands that are clear folds
 * @param {string} [filters.difficulty] - Difficulty mode (adjusts filtering)
 * @returns {Array} Filtered scenarios
 */
export function filterScenarios(scenarios, filters = {}) {
    let filtered = [...scenarios];

    if (filters.premiumOnly) {
        filtered = filtered.filter(s => {
            const hand = s.heroHand || '';
            return isPremiumHand(hand);
        });
    }

    if (filters.closeDecisions) {
        filtered = filtered.filter(s => {
            if (!s.strategy) return true;
            const freq = s.strategy.frequency || 0;
            return freq >= 0.25 && freq <= 0.75; // Mixed spots only
        });
    }

    if (filters.removeTrivialFolds) {
        filtered = filtered.filter(s => {
            if (!s.correctAction) return true;
            // Keep folds that are close decisions
            if (s.correctAction === 'fold') {
                const freq = s.strategy?.frequency || 0;
                return freq >= 0.20; // Only keep non-obvious folds
            }
            return true;
        });
    }

    return filtered;
}

/**
 * Check if a hand is premium (top ~15% range).
 */
function isPremiumHand(hand) {
    const premiums = new Set([
        'AA', 'KK', 'QQ', 'JJ', 'TT', '99',
        'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'ATs',
        'KQs', 'KJs', 'KQo', 'QJs', 'JTs',
    ]);
    return premiums.has(hand);
}

// ●● Scoring Adjustments ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Calculate the score for a player's action considering difficulty.
 *
 * @param {number} baseScore - Raw score (0-100)
 * @param {string} difficulty - Difficulty mode
 * @param {Object} [context] - Additional context
 * @param {number} [context.timeUsed] - Seconds used for decision
 * @param {number} [context.timeLimit] - Time limit for difficulty
 * @returns {{ score: number, diamonds: number, classification: string }}
 */
export function calculateDifficultyScore(baseScore, difficulty, context = {}) {
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[DIFFICULTY.GROUPED];
    let score = baseScore * config.scoreMultiplier;

    // Time bonus/penalty
    if (context.timeUsed !== undefined && config.timer) {
        const timeRatio = context.timeUsed / config.timer;
        if (timeRatio < 0.5) score *= 1.1;       // Fast and correct = bonus
        else if (timeRatio > 0.9) score *= 0.95;  // Slow = slight penalty
    }

    score = Math.round(Math.max(0, Math.min(100, score)));

    // Classification thresholds
    let classification;
    if (score >= 90) classification = 'correct';
    else if (score >= 60) classification = 'inaccuracy';
    else if (score >= 30) classification = 'mistake';
    else classification = 'blunder';

    // Diamond calculation: base 10 for correct, scaled by difficulty
    const diamondBase = classification === 'correct' ? 10
        : classification === 'inaccuracy' ? 3
        : 0;
    const diamonds = Math.round(diamondBase * config.scoreMultiplier);

    return { score, diamonds, classification };
}

// ●● Default Export ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default {
    DIFFICULTY,
    DIFFICULTY_CONFIG,
    simplifyActions,
    filterScenarios,
    calculateDifficultyScore,
};
