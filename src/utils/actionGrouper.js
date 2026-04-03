/**
 * ACTION GROUPER — GTO Wizard Difficulty Mode System
 * ═══════════════════════════════════════════════════════════════════════════
 * Transforms solver actions into three difficulty modes:
 *
 * SIMPLE MODE (3 buttons max):
 *   - All bets/raises → "Bet/Raise"
 *   - Check stays "Check"
 *   - Call stays "Call"
 *   - Fold stays "Fold"
 *   Best for: Beginners learning basic decision-making
 *
 * GROUPED MODE (4-5 buttons):
 *   - Check/Fold/Call stay individual
 *   - Bets grouped: Small (≤40%), Medium (41-80%), Large (81-150%), Overbet (>150%)
 *   Best for: Intermediate players learning sizing categories
 *
 * STANDARD MODE (up to 9 buttons):
 *   - All solver actions shown with exact sizings
 *   - "Bet 33%", "Bet 67%", "Bet 125%", etc.
 *   Best for: Advanced players practicing exact GTO execution
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DIFFICULTY_MODES = {
    SIMPLE: 'simple',
    GROUPED: 'grouped',
    STANDARD: 'standard',
};

// Sizing category thresholds (as percentage of pot)
const SIZING_GROUPS = {
    SMALL: { label: 'Small Bet', min: 0, max: 40, color: '#3b82f6' },
    MEDIUM: { label: 'Medium Bet', min: 41, max: 80, color: '#f59e0b' },
    LARGE: { label: 'Large Bet', min: 81, max: 150, color: '#ef4444' },
    OVERBET: { label: 'Overbet', min: 151, max: Infinity, color: '#dc2626' },
};

/**
 * Parse the pot-percentage from an action code.
 * e.g., 'b33' → 33, 'b100' → 100, 'b200' → 200, 'r75' → 75
 * Returns null for non-sizing actions (fold, check, call, allin)
 */
function parseSizingPercent(actionId) {
    const match = (actionId || '').match(/^[br](\d+)$/);
    if (match) return parseInt(match[1], 10);
    return null;
}

/**
 * Determine which sizing group a bet/raise belongs to.
 */
function getSizingGroup(pct) {
    if (pct <= SIZING_GROUPS.SMALL.max) return 'SMALL';
    if (pct <= SIZING_GROUPS.MEDIUM.max) return 'MEDIUM';
    if (pct <= SIZING_GROUPS.LARGE.max) return 'LARGE';
    return 'OVERBET';
}

/**
 * Detect if an action is a bet/raise (has a sizing component).
 */
function isBetOrRaise(actionId) {
    const id = (actionId || '').toLowerCase();
    return id.startsWith('b') || id.startsWith('r') || id === 'allin';
}

/**
 * Detect action category for simple mode grouping.
 */
function getSimpleCategory(actionId) {
    const id = (actionId || '').toLowerCase();
    if (id === 'f') return 'fold';
    if (id === 'c' || id === 'x') return 'check'; // Check or call depending on context
    if (id === 'call') return 'call';
    if (isBetOrRaise(id)) return 'bet_raise';
    return 'other';
}

/**
 * Group solver actions by difficulty mode.
 *
 * @param {Array} options - Array of { id, text, frequency } from solver
 * @param {Object} gtoFrequencies - Map of action ID → frequency % (0-100)
 * @param {string} mode - 'simple', 'grouped', or 'standard'
 * @returns {{ groupedOptions: Array, frequencyMap: Object, actionMapping: Object }}
 *
 * actionMapping maps grouped option IDs back to their constituent solver action IDs.
 * This is needed for scoring: when user picks "Medium Bet" in grouped mode,
 * we need to know which real solver actions it covers.
 */
export function groupActions(options, gtoFrequencies = {}, mode = DIFFICULTY_MODES.STANDARD) {
    if (!options || options.length === 0) {
        return { groupedOptions: [], frequencyMap: {}, actionMapping: {} };
    }

    // STANDARD MODE: Pass through unchanged
    if (mode === DIFFICULTY_MODES.STANDARD) {
        const frequencyMap = {};
        const actionMapping = {};
        options.forEach(opt => {
            const id = opt.id || opt;
            frequencyMap[id] = gtoFrequencies[id] || 0;
            actionMapping[id] = [id]; // Maps to itself
        });
        return { groupedOptions: [...options], frequencyMap, actionMapping };
    }

    // SIMPLE MODE: Collapse all bets/raises into one action
    if (mode === DIFFICULTY_MODES.SIMPLE) {
        const groups = {};
        const actionMapping = {};
        const frequencyMap = {};

        options.forEach(opt => {
            const id = opt.id || opt;
            const category = getSimpleCategory(id);
            const freq = gtoFrequencies[id] || 0;

            if (!groups[category]) {
                groups[category] = {
                    ids: [],
                    totalFreq: 0,
                    highestFreqId: id,
                    highestFreq: freq,
                };
            }

            groups[category].ids.push(id);
            groups[category].totalFreq += freq;
            if (freq > groups[category].highestFreq) {
                groups[category].highestFreq = freq;
                groups[category].highestFreqId = id;
            }
        });

        const groupedOptions = [];

        // Order: Fold, Check/Call, Bet/Raise (matches GTO Wizard simple mode layout)
        const categoryOrder = ['fold', 'check', 'call', 'bet_raise'];
        const categoryLabels = {
            fold: 'Fold',
            check: 'Check',
            call: 'Call',
            bet_raise: 'Bet / Raise',
        };

        categoryOrder.forEach(cat => {
            if (!groups[cat]) return;
            const group = groups[cat];
            const groupId = `simple_${cat}`;
            groupedOptions.push({
                id: groupId,
                text: categoryLabels[cat],
                frequency: group.totalFreq,
                _resolvedId: group.highestFreqId, // Best action within group for scoring
            });
            frequencyMap[groupId] = group.totalFreq;
            actionMapping[groupId] = group.ids;
        });

        return { groupedOptions, frequencyMap, actionMapping };
    }

    // GROUPED MODE: Group bets by sizing category, keep fold/check/call individual
    if (mode === DIFFICULTY_MODES.GROUPED) {
        const sizingGroups = {};
        const individualActions = [];
        const actionMapping = {};
        const frequencyMap = {};

        options.forEach(opt => {
            const id = opt.id || opt;
            const freq = gtoFrequencies[id] || 0;
            const pct = parseSizingPercent(id);

            if (pct !== null) {
                // This is a sized bet/raise — group it
                const groupKey = getSizingGroup(pct);
                if (!sizingGroups[groupKey]) {
                    sizingGroups[groupKey] = {
                        ids: [],
                        totalFreq: 0,
                        highestFreqId: id,
                        highestFreq: freq,
                    };
                }
                sizingGroups[groupKey].ids.push(id);
                sizingGroups[groupKey].totalFreq += freq;
                if (freq > sizingGroups[groupKey].highestFreq) {
                    sizingGroups[groupKey].highestFreq = freq;
                    sizingGroups[groupKey].highestFreqId = id;
                }
            } else if (id === 'allin') {
                // All-in stays individual
                individualActions.push(opt);
                frequencyMap[id] = freq;
                actionMapping[id] = [id];
            } else {
                // Fold, Check, Call — individual
                individualActions.push(opt);
                frequencyMap[id] = freq;
                actionMapping[id] = [id];
            }
        });

        const groupedOptions = [...individualActions];

        // Add sizing groups in order: Small, Medium, Large, Overbet
        const groupOrder = ['SMALL', 'MEDIUM', 'LARGE', 'OVERBET'];
        groupOrder.forEach(key => {
            if (!sizingGroups[key]) return;
            const group = sizingGroups[key];
            const groupId = `grouped_${key.toLowerCase()}`;
            groupedOptions.push({
                id: groupId,
                text: SIZING_GROUPS[key].label,
                frequency: group.totalFreq,
                _resolvedId: group.highestFreqId,
            });
            frequencyMap[groupId] = group.totalFreq;
            actionMapping[groupId] = group.ids;
        });

        return { groupedOptions, frequencyMap, actionMapping };
    }

    // Fallback: standard mode
    return groupActions(options, gtoFrequencies, DIFFICULTY_MODES.STANDARD);
}

/**
 * Resolve a grouped action selection back to the best solver action for scoring.
 *
 * When user picks "Medium Bet" in grouped mode, this returns the highest-frequency
 * solver action within that group (e.g., 'b66' if it's 45% vs 'b50' at 15%).
 *
 * @param {string} selectedGroupId - The grouped option ID the user clicked
 * @param {Object} actionMapping - From groupActions()
 * @param {Object} gtoFrequencies - Original solver frequencies
 * @returns {string} The best matching solver action ID for scoring
 */
export function resolveGroupedAction(selectedGroupId, actionMapping, gtoFrequencies = {}) {
    const mappedActions = actionMapping[selectedGroupId];
    if (!mappedActions || mappedActions.length === 0) return selectedGroupId;
    if (mappedActions.length === 1) return mappedActions[0];

    // Return the highest-frequency action in the group
    let bestAction = mappedActions[0];
    let bestFreq = gtoFrequencies[mappedActions[0]] || 0;
    for (let i = 1; i < mappedActions.length; i++) {
        const freq = gtoFrequencies[mappedActions[i]] || 0;
        if (freq > bestFreq) {
            bestFreq = freq;
            bestAction = mappedActions[i];
        }
    }
    return bestAction;
}

/**
 * Calculate the combined frequency for a grouped action (for scoring).
 * If user picks "Medium Bet" which covers b50 (15%) and b66 (25%),
 * the total frequency is 40% — they played a "correct" range.
 */
export function getGroupedFrequency(selectedGroupId, actionMapping, gtoFrequencies = {}) {
    const mappedActions = actionMapping[selectedGroupId];
    if (!mappedActions || mappedActions.length === 0) return gtoFrequencies[selectedGroupId] || 0;

    return mappedActions.reduce((sum, actionId) => sum + (gtoFrequencies[actionId] || 0), 0);
}
