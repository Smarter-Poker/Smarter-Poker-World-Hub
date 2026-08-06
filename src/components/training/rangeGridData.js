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
export function allGridHands() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) hands.push(gridHandNotation(r, c));
    }
    return hands;
}

/**
 * Solver matrices are inconsistent about scale: the deterministic engine
 * stores 0.0-1.0 fractions, some preloaded/solved spots arrive already in
 * 0-100. Guessing per-cell would make a legitimately tiny 0.8% frequency
 * indistinguishable from an 80% one, so the decision is made ONCE for the
 * whole matrix: if nothing anywhere exceeds 1, it is fractional.
 */
function detectScale(rawFrequencies) {
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

    const scale = detectScale(rawFrequencies);
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
