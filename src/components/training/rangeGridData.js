/**
 * RANGE GRID DATA — single owner for the solver-matrix -> RangeGrid transform
 *
 * GTOW parity #35.
 *
 * The solver emits `rawFrequencies` ACTION-FIRST:
 *
 *     { [actionId]: { [handNotation]: freq } }
 *
 * `RangeGrid` (src/components/training/RangeGrid.jsx) reads its `gridData`
 * prop HAND-FIRST — see the `gridData[hand]` lookups in `rangeStats`, in the
 * 13x13 `grid` memo, and in `selectedFreqs`:
 *
 *     { [handNotation]: { [actionId]: percent0to100 } }
 *
 * Three call sites each rolled their own transform and two of them got the
 * shape wrong, so their grids rendered 169 blank cells:
 *
 *   - UniversalDynamicTable.jsx  Range mode panel  -> `{ [actionId]: freq }`
 *     (flat, not even nested — every cell blank)
 *   - HandReplayViewer.jsx       RangeGridSection  -> `{ [actionId]: { hand } }`
 *     (still action-first; its own comment asserted the two shapes were "the
 *     same", which is what let the bug survive review)
 *   - UniversalDynamicTable.jsx  feedback panel    -> correct
 *
 * Rather than patch each site, the transform lives here once and the call
 * sites import it. Do not re-implement it inline.
 */

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Canonical 13x13 grid notation for a (row, col) coordinate.
 * Diagonal = pairs, above = suited, below = offsuit. Matches
 * RangeGrid's own `getHandNotation` exactly.
 */
export function gridHandNotation(row, col) {
    if (row === col) return RANKS[row] + RANKS[col];
    if (row < col) return RANKS[row] + RANKS[col] + 's';
    return RANKS[col] + RANKS[row] + 'o';
}

/**
 * Every hand notation on the grid, in row-major order.
 */

/**
 * Solver matrices are inconsistent about scale: the deterministic engine
 * stores 0.0-1.0 fractions, some preloaded/solved spots arrive already in
 * 0-100. Guessing per-cell would make a legitimately tiny 0.8% frequency
 * indistinguishable from an 80% one, so the decision is made ONCE for the
 * whole matrix: if nothing anywhere exceeds 1, it is fractional.
 */
export function rangeFrequencyPercentMultiplier(rawFrequencies) {
    let max = 0;
    for (const handFreqs of Object.values(rawFrequencies || {})) {
        if (!handFreqs || typeof handFreqs !== 'object') continue;
        for (const freq of Object.values(handFreqs)) {
            if (typeof freq === 'number' && Number.isFinite(freq) && freq > max) max = freq;
        }
    }
    return max > 1 ? 1 : 100;
}

/**
 * Transpose a solver matrix into RangeGrid's `gridData` prop.
 *
 * @param {Object} rawFrequencies  { [actionId]: { [handNotation]: freq } }
 * @returns {Object|null}          { [handNotation]: { [actionId]: pct } | null }
 *                                 Hands with no action above the noise floor
 *                                 map to null, which is what RangeGrid uses to
 *                                 paint an empty cell. Returns null when there
 *                                 is nothing to draw so callers can branch on
 *                                 it and render a message instead of an empty
 *                                 grid.
 */
export function buildRangeGridData(rawFrequencies) {
    if (!rawFrequencies || typeof rawFrequencies !== 'object') return null;
    const actions = Object.keys(rawFrequencies).filter(
        (a) => rawFrequencies[a] && typeof rawFrequencies[a] === 'object'
    );
    if (actions.length === 0) return null;

    const scale = rangeFrequencyPercentMultiplier(rawFrequencies);
    // 0.05% — below this a cell is solver noise, not a real mixed strategy.
    const NOISE_FLOOR = 0.05;

    const gridData = {};
    let anyPopulated = false;

    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            const hand = gridHandNotation(r, c);
            const handFreqs = {};
            let hasAny = false;

            for (const action of actions) {
                const raw = rawFrequencies[action][hand];
                if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
                const pct = Math.round(raw * scale * 10) / 10;
                if (pct < NOISE_FLOOR) continue;
                handFreqs[action] = pct;
                hasAny = true;
            }

            gridData[hand] = hasAny ? handFreqs : null;
            if (hasAny) anyPopulated = true;
        }
    }

    return anyPopulated ? gridData : null;
}

/**
 * The action ids present in a solver matrix, for RangeGrid's `actions` legend.
 */
export function rangeGridActions(rawFrequencies) {
    if (!rawFrequencies || typeof rawFrequencies !== 'object') return [];
    return Object.keys(rawFrequencies).filter(
        (a) => rawFrequencies[a] && typeof rawFrequencies[a] === 'object'
    );
}

function policyActionColor(action) {
    const family = String(action?.family || '').toLowerCase();
    if (family === 'fold') return 'var(--sp-fg-faint)';
    if (family === 'check') return 'var(--sp-accent-blue)';
    if (family === 'call') return 'var(--sp-accent-green)';
    if (family === 'raise') return 'var(--sp-accent-purple)';
    if (family === 'all_in') return 'var(--sp-accent-red)';
    if (family !== 'bet') return 'var(--sp-fg-faint)';

    const fraction = Number(action?.size?.potFraction);
    if (!Number.isFinite(fraction) || fraction < 0) return 'var(--sp-accent-blue)';
    if (fraction <= 0.33) return 'var(--sp-accent-emerald)';
    if (fraction <= 0.55) return 'var(--sp-accent-cyan)';
    if (fraction <= 0.80) return 'var(--sp-accent-blue)';
    if (fraction <= 1) return 'var(--sp-accent-red)';
    return 'var(--sp-accent-amber)';
}

function exactPolicyAmountLabel(action) {
    if (action?.size?.exact !== true) return null;
    const bigBlinds = Number(action?.size?.bigBlinds);
    if (!Number.isFinite(bigBlinds) || bigBlinds <= 0) return null;
    return `${bigBlinds.toFixed(2)} BB`;
}

/**
 * Build the presentation contract for a canonical action-first range matrix.
 * Labels and exact amounts come only from solverPolicy.actions; a raw Pio
 * source token such as b1442 must never be interpreted as a percentage by the
 * browser. Returns null unless every displayed range key has one unique legal
 * policy owner.
 */
export function buildRangeActionPresentation(solverPolicy, rawFrequencies) {
    if (!solverPolicy || !Array.isArray(solverPolicy.actions)
        || !rawFrequencies || typeof rawFrequencies !== 'object'
        || Array.isArray(rawFrequencies)) return null;
    const byId = new Map();
    const knownFamilies = new Set(['fold', 'check', 'call', 'bet', 'raise', 'all_in']);
    for (const action of solverPolicy.actions) {
        const id = String(action?.id || '').trim().toLowerCase();
        const label = String(action?.label || '').trim();
        const family = String(action?.family || '').trim().toLowerCase();
        const sizedAction = ['bet', 'raise', 'all_in'].includes(family);
        if (!id || !label || !knownFamilies.has(family)
            || action?.legal === false || byId.has(id)
            || (sizedAction && (
                action?.size?.exact !== true
                || !Number.isFinite(Number(action?.size?.chips))
                || Number(action.size.chips) <= 0
                || !Number.isFinite(Number(action?.size?.bigBlinds))
                || Number(action.size.bigBlinds) <= 0
            ))) return null;
        const amountLabel = exactPolicyAmountLabel(action);
        byId.set(id, {
            id,
            label,
            amountLabel,
            displayLabel: amountLabel && !/\bBB\b/i.test(label)
                ? `${label} · ${amountLabel}`
                : label,
            short: family === 'check' ? 'X'
                : family === 'call' ? 'C'
                    : family === 'fold' ? 'F'
                        : family === 'all_in' ? 'AI'
                            : family === 'raise' ? 'R' : family === 'bet' ? 'B' : '?',
            family,
            size: action?.size ? { ...action.size } : null,
            color: policyActionColor(action),
        });
    }
    const rangeIds = Object.keys(rawFrequencies).map((id) => String(id).trim().toLowerCase());
    if (rangeIds.length === 0 || new Set(rangeIds).size !== rangeIds.length
        || rangeIds.some((id) => !byId.has(id))) return null;
    return Object.fromEntries(rangeIds.map((id) => [id, byId.get(id)]));
}

/**
 * Convert two hole cards ("Ah", "Kd") into grid notation ("AKo").
 * The higher rank always leads, so the result indexes into a grid built by
 * `gridHandNotation`. Returns null on anything unparseable.
 */
export function handNotationFromCards(cards) {
    if (!Array.isArray(cards) || cards.length < 2) return null;
    const c1 = String(cards[0] || '');
    const c2 = String(cards[1] || '');
    const r1 = c1[0]?.toUpperCase();
    const r2 = c2[0]?.toUpperCase();
    if (!r1 || !r2) return null;
    const i1 = RANKS.indexOf(r1);
    const i2 = RANKS.indexOf(r2);
    if (i1 < 0 || i2 < 0) return null;
    if (r1 === r2) return r1 + r2;
    const suited = c1[1] && c2[1] && c1[1].toLowerCase() === c2[1].toLowerCase();
    const ordered = i1 < i2 ? r1 + r2 : r2 + r1;
    return ordered + (suited ? 's' : 'o');
}
