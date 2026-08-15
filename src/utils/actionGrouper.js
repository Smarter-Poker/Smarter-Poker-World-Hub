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

// Sizing category thresholds (as percentage of pot).
//
// LARGE used to run to 150 and OVERBET to start at 151, which put b101..b150 —
// bets of MORE than the pot, the textbook definition of an overbet — in the
// "Large Bet" bucket. An overbet is a distinct strategic object and GTOW gives
// it its own button; a player drilling sizing categories has to be able to
// pick it. The boundary is the pot.
export const SIZING_GROUPS = {
    SMALL: { label: 'Small Bet', min: 0, max: 40, color: '#3b82f6' },
    MEDIUM: { label: 'Medium Bet', min: 41, max: 80, color: '#f59e0b' },
    LARGE: { label: 'Large Bet', min: 81, max: 100, color: '#ef4444' },
    OVERBET: { label: 'Overbet', min: 101, max: Infinity, color: '#dc2626' },
};

/**
 * Parse the pot-percentage of a bet/raise.
 *
 * Accepts every shape the pipeline actually produces, because the strict
 * `/^[br](\d+)$/` this used to be silently returned null for `bet_66`,
 * `b33.5` and `raise-75` — and a null means "not a sizing", so those actions
 * skipped the bucketer entirely and rendered as exact sizings in a mode whose
 * whole purpose is to hide them.
 *
 * Returns null for non-sizing actions (fold, check, call, allin).
 */
export function parseSizingPercent(actionId, text = '', amount = null, potSize = null) {
    const id = String(actionId || '');
    // Canonical solver ids: b33, r75, b33.5, bet_66, raise-75
    const m = id.match(/^(?:b|r|bet|raise)[_-]?(\d+(?:\.\d+)?)$/i);
    if (m) return parseFloat(m[1]);
    // Display text: "Bet 33%", "Raise to 75% pot"
    const t = String(text || '').match(/(\d+(?:\.\d+)?)\s*%/);
    if (t) return parseFloat(t[1]);
    // Last resort: a chip amount against the pot it is being bet into.
    const amt = Number(amount);
    const pot = Number(potSize);
    if (isFinite(amt) && amt > 0 && isFinite(pot) && pot > 0) return (amt / pot) * 100;
    return null;
}

/**
 * Determine which sizing group a bet/raise belongs to.
 */
export function getSizingGroup(pct) {
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
    return /^(b|r)\d/.test(id)
        || id === 'b' || id === 'r'
        || id === 'bet' || id === 'raise'
        || id.startsWith('bet') || id.startsWith('raise')
        || id === 'allin' || id === 'all-in' || id === 'push' || id === 'shove' || id === 'jam';
}

/**
 * Detect action category for simple mode grouping.
 *
 * ●●● Two vocabularies reach this function and it only ever knew one. ●●●
 * Raw solver ids are single letters (`f` `x` `c`) plus sized bets (`b33`).
 * But useGTOTrainer.applyDifficultyToQuestion runs FIRST and rewrites them to
 * spelled-out tokens (`fold` `check` `call` `bet` `raise`), and the table then
 * grouped that output a second time. Under the old matcher `'fold'` and
 * `'check'` matched nothing, fell to `'other'`, and `'other'` is absent from
 * `categoryOrder` below — so those buttons were DROPPED and their frequency
 * mass vanished. Two consequences, both live in production:
 *
 *   - a spot whose solver-best is Check or Fold became UNWINNABLE, because the
 *     correct answer had no button. Measured: `f40/c45/r75` rendered only
 *     `Call` and `Bet / Raise` with the answer key on `fold`.
 *   - the frequencies printed under the buttons summed to 40-70%, not 100.
 *
 * Note `c` is CALL and `x` is CHECK. Mapping `c` to 'check' put a button
 * labelled "Check" on the felt facing a bet — an action that is not legal in
 * that spot.
 */
export function getSimpleCategory(actionId) {
    const id = String(actionId || '').toLowerCase().trim();
    if (id === 'f' || id === 'fold' || id.startsWith('fold')) return 'fold';
    if (id === 'x' || id === 'check' || id.startsWith('check')) return 'check';
    if (id === 'c' || id === 'call' || id.startsWith('call')) return 'call';
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
export function groupActions(options, gtoFrequencies = {}, mode = DIFFICULTY_MODES.STANDARD, potSize = null) {
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
            // Classify on the id, but let the display text break a tie the id
            // cannot -- a question pipeline that hands us `{id:'opt_2',
            // text:'Check'}` has told us what the action is.
            const category = getSimpleCategory(id) === 'other'
                ? getSimpleCategory(opt && opt.text)
                : getSimpleCategory(id);
            const freq = gtoFrequencies[id] || 0;

            if (!groups[category]) {
                groups[category] = {
                    ids: [],
                    totalFreq: 0,
                    highestFreqId: id,
                    highestFreq: freq,
                    firstText: (opt && opt.text) || String(id),
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
        //
        // `other` is listed LAST rather than omitted. Omitting it is how an
        // unrecognised action id used to disappear from the felt taking its
        // frequency with it -- a silent drop that makes the printed
        // frequencies stop summing to 100 and can delete the correct answer.
        // An action this function cannot classify still has to be playable;
        // showing it under its own label is strictly better than pretending
        // the solver never returned it.
        const categoryOrder = ['fold', 'check', 'call', 'bet_raise', 'other'];
        const categoryLabels = {
            fold: 'Fold',
            check: 'Check',
            call: 'Call',
            bet_raise: 'Bet / Raise',
            other: 'Other',
        };

        categoryOrder.forEach(cat => {
            if (!groups[cat]) return;
            const group = groups[cat];
            const groupId = `simple_${cat}`;
            groupedOptions.push({
                id: groupId,
                // An unclassifiable action keeps its own label -- calling it
                // "Other" would be true but useless on the felt.
                text: cat === 'other' ? group.firstText : categoryLabels[cat],
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
            const pct = parseSizingPercent(id, opt && opt.text, opt && opt.amount, potSize);

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
export function resolveGroupedAction(selectedGroupId, actionMapping, gtoFrequencies = {}, preferId = null) {
    const mappedActions = actionMapping[selectedGroupId];
    if (!mappedActions || mappedActions.length === 0) return selectedGroupId;
    if (mappedActions.length === 1) return mappedActions[0];

    // If the solver's own answer sits inside the bucket the player picked,
    // that is the action they played. Resolving to a different member and then
    // grading against the key marks a correct choice wrong: with b50 at 30%
    // and b75 at 25% in one Medium bucket and b75 as the key, picking
    // "Medium Bet" submitted b50 and lost the hand. The player chose a
    // CATEGORY -- the category contains the right answer, so it is right.
    if (preferId && mappedActions.includes(preferId)) return preferId;

    // Otherwise the representative action is the one the solver plays most.
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
