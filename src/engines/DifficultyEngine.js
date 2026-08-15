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
 *   GROUPED:   Sizing CATEGORIES — Small / Medium / Large / Overbet, with
 *              Check, Call and Fold left individual. (This block used to say
 *              "action type only, no exact sizing", and the code matched it:
 *              every bet collapsed to one "Bet" button, which is SIMPLE mode
 *              wearing a different name. GTOW's middle tier drills sizing
 *              categories -- that is the whole point of having one.)
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

// The sizing vocabulary lives in one place. actionGrouper.js owns the
// thresholds and the parser; this engine reuses them so the two remappers can
// never drift into disagreeing about what "Large" means.
import { parseSizingPercent, getSizingGroup, SIZING_GROUPS } from '../utils/actionGrouper';

// ●● Difficulty Modes ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const DIFFICULTY = {
    SIMPLE: 'simple',
    GROUPED: 'grouped',
    STANDARD: 'standard',
};

/**
 * GTOW parity #21 — the UI difficulty vocabulary is beginner/standard/expert,
 * the engine vocabulary is simple/grouped/standard. Nothing translated between
 * them, so:
 *   - 'expert' fell through to GROUPED, identical to 'beginner'
 *   - 'standard' matched the engine's STANDARD by pure name collision
 *   - DIFFICULTY.SIMPLE was unreachable from any UI control
 *
 * The ladder GTO Wizard actually presents is three DISTINCT button sets, so
 * the three UI tiers map onto the three engine tiers one-for-one:
 *   beginner -> SIMPLE   (bet-raise / check-call / fold)
 *   standard -> GROUPED  (small / medium / large / overbet)
 *   expert   -> STANDARD (exact solver sizings)
 *
 * Engine ids are accepted verbatim so a persisted engine-vocabulary value
 * still resolves, and anything unrecognised lands on GROUPED.
 */
const UI_DIFFICULTY_TO_ENGINE = {
    beginner: DIFFICULTY.SIMPLE,
    standard: DIFFICULTY.GROUPED,
    expert: DIFFICULTY.STANDARD,
    // engine vocabulary, passed straight through
    simple: DIFFICULTY.SIMPLE,
    grouped: DIFFICULTY.GROUPED,
    exact: DIFFICULTY.STANDARD,
};

export function toEngineDifficulty(uiDifficulty) {
    const key = String(uiDifficulty || '').toLowerCase();
    return UI_DIFFICULTY_TO_ENGINE[key] || DIFFICULTY.GROUPED;
}

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
        return _simplifyToGrouped(fullActions, potSize);
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
 * GROUPED mode: bucket bet/raise SIZINGS into GTO Wizard's four categories.
 *   - "Small Bet"  (<=40% pot)
 *   - "Medium Bet" (41-80%)
 *   - "Large Bet"  (81-100%)
 *   - "Overbet"    (>100%)
 *   - Check / Call / Fold / All-in stay individual
 *
 * ●●● What this used to do, and why it was wrong. ●●●
 * It collapsed every bet sizing into ONE button labelled "Bet" and every raise
 * into one labelled "Raise" — the same shape SIMPLE mode produces, so the
 * middle tier of the difficulty ladder taught nothing SIMPLE did not. GTOW's
 * grouped mode exists precisely to drill sizing CATEGORIES.
 *
 * The four-bucket logic did exist, in src/utils/actionGrouper.js, and the
 * table called it — but this function ran FIRST and had already rewritten
 * `b33`/`b75`/`b125` to the bare token `bet`, which carries no sizing at all.
 * `parseSizingPercent('bet')` returns null, so the bucketer skipped every
 * action and the four buttons could never appear. Measured end to end with a
 * `x / b33 / b75 / b125` node: rendered buttons were `Check | Bet`.
 *
 * Bucketing here rather than there is what makes the rest of the pipeline
 * correct for free: the caller aggregates frequencies and per-action EVs off
 * `mappedFrom`, and remaps the correct answer through it, so a bucket carries
 * the summed frequency of its members and the answer key lands on the bucket
 * that contains it.
 */
function _simplifyToGrouped(fullActions, potSize) {
    const simplified = [];
    const buckets = new Map();
    const passthrough = [];

    for (const action of fullActions) {
        const isAggressive = action.action === 'bet' || action.action === 'raise';
        const pct = isAggressive
            ? parseSizingPercent(action.id, action.text || action.label, action.amount, potSize)
            : null;

        if (pct === null) {
            // Fold / check / call / all-in, and any aggressive action whose
            // sizing genuinely cannot be determined. An unsized bet keeps its
            // own button rather than being merged into a bucket it may not
            // belong in.
            passthrough.push(action);
            continue;
        }

        const key = getSizingGroup(pct);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(action);
    }

    // Individual actions first, in the order the solver gave them.
    for (const a of passthrough) simplified.push({ ...a, isSimplified: true });

    // Then the sizing buckets, small to large.
    for (const key of ['SMALL', 'MEDIUM', 'LARGE', 'OVERBET']) {
        const members = buckets.get(key);
        if (!members || members.length === 0) continue;
        // A raise-only bucket says "Raise", so the label never invites an
        // illegal action: you cannot bet when facing a bet.
        const allRaises = members.every(m => m.action === 'raise');
        const label = SIZING_GROUPS[key].label.replace('Bet', allRaises ? 'Raise' : 'Bet');
        simplified.push({
            id: `grouped_${key.toLowerCase()}`,
            action: allRaises ? 'raise' : 'bet',
            label,
            amount: members[Math.floor(members.length / 2)].amount,
            mappedFrom: members,
            isSimplified: true,
        });
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
