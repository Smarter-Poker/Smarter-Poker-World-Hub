/**
 * HAND-CLASS STRATEGY (GTOW parity #36)
 * ---------------------------------------------------------------------------
 * GTO Wizard's Strategy tab shows three things: the overall approach, the
 * range's action frequencies, and **strategy broken down by hand class**. Ours
 * showed one: a flat per-action split for hero's single hand ("Bet 14% /
 * Check 86%"). That answers "what do I do with THIS hand" — which the felt
 * already answers — and never "what is my range doing", which is the question
 * the Strategy tab exists for.
 *
 * The data to answer it has been present the whole time. `rawFrequencies` is
 * the solver's full 169-class x action matrix and is already fetched, already
 * transposed by rangeGridData.js, and already rendered as a grid on the Range
 * tab. Grouping those 169 rows by what each class IS on this board turns the
 * same numbers into the breakdown GTOW shows.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT CLAIM
 *
 * A 169-class grid records RANK structure and a suited/offsuit flag. It does
 * not record which suits. So:
 *
 *   - Made-hand classification (pairs, two pair, sets, overpairs) is EXACT.
 *     It depends only on ranks, which the notation carries in full.
 *   - Straight draws are EXACT for the same reason.
 *   - Flush draws are NOT determinable. A suited class on a two-tone board
 *     holds a flush draw in exactly one of its four suit combinations and no
 *     flush draw in the other three. Reporting "AKs has a flush draw" would be
 *     wrong three times out of four.
 *
 * So flush draws get no bucket. A suited class is classified on its ranks like
 * any other hand, and the caller is told, via `suitedNote`, that flush-draw
 * detail is below the resolution of the data rather than being absent by
 * oversight. Inventing the missing suit information would produce a panel that
 * looks more complete and is less true, and every consumer downstream would
 * inherit the error with no way to detect it.
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = RANKS.reduce((m, r, i) => { m[r] = i + 2; return m; }, {});

/** Combinations per 169-class entry, before board blockers. */
function combosOf(hand) {
    if (typeof hand !== 'string' || hand.length < 2) return 0;
    if (hand[0] === hand[1]) return 6;          // pocket pair
    return hand.endsWith('s') ? 4 : 12;         // suited / offsuit
}

function ranksOf(hand) {
    if (typeof hand !== 'string' || hand.length < 2) return null;
    const a = RANK_VALUE[hand[0]];
    const b = RANK_VALUE[hand[1]];
    if (!a || !b) return null;
    return { hi: Math.max(a, b), lo: Math.min(a, b), pair: hand[0] === hand[1], suited: hand.endsWith('s') };
}

/**
 * Board -> sorted-descending rank values.
 *
 * Accepts BOTH an array of card strings and a single space/comma-separated
 * string, because the question pipeline produces both: `scenario.board` on a
 * served postflop question is the string `"7s 4h Tc"`, while the felt's own
 * `boardCards` memo is an array. Requiring the array shape is what made this
 * module return null on every real spot -- `boardRanks` gave `[]`, every class
 * was therefore classified with the PREFLOP buckets, and the row order asked
 * for the postflop ones. No overlap, no rows, no panel. Nothing threw and
 * nothing logged; the section simply was not there.
 */
function boardRanks(board) {
    let cards;
    if (Array.isArray(board)) cards = board;
    else if (typeof board === 'string') cards = board.trim().split(/[\s,]+/).filter(Boolean);
    else return [];
    return cards
        .map((c) => RANK_VALUE[String(c || '').trim()[0]?.toUpperCase()])
        .filter((v) => typeof v === 'number')
        .sort((x, y) => y - x);
}

/**
 * Does {hi, lo} plus the board make an open-ended draw or a gutshot?
 * Rank-only, so this is exact. Checks every five-rank window: four of the five
 * present is a draw; which kind depends on whether the missing rank is at an
 * end of the run (open-ended) or inside it (gutshot).
 */
function straightDrawOf(hi, lo, brs) {
    const present = new Set([hi, lo, ...brs]);
    // Count the DISTINCT ranks that would complete a straight. Two or more is
    // open-ended, exactly one is a gutshot.
    //
    // Asking instead whether the missing rank sits at an end of the window --
    // which is the textbook shorthand and what this did first -- is wrong at
    // the top of the deck. QJ on an A-K board leaves A-K-Q-J-T needing only a
    // ten; the missing rank is at the end of its window, but there is no
    // window above it, so exactly one rank completes and it is a gutshot with
    // four outs. Counting the completing ranks is the definition the
    // shorthand is an approximation OF, so it cannot disagree with itself.
    const completing = new Set();
    for (let low = 2; low <= 10; low++) {
        const window = [low, low + 1, low + 2, low + 3, low + 4];
        if (window.filter((r) => present.has(r)).length !== 4) continue;
        // The hand has to be part of it, or it is the board's draw, not ours.
        if (!window.includes(hi) && !window.includes(lo)) continue;
        completing.add(window.find((r) => !present.has(r)));
    }
    // The wheel: the ace plays low, so A-2-3-4-5 is a fifth window.
    const wheel = [14, 2, 3, 4, 5];
    if (wheel.filter((r) => present.has(r)).length === 4
        && (wheel.includes(hi) || wheel.includes(lo))) {
        completing.add(wheel.find((r) => !present.has(r)));
    }
    if (completing.size === 0) return null;
    return completing.size >= 2 ? 'oesd' : 'gutshot';
}

function madeStraight(hi, lo, brs) {
    const present = new Set([hi, lo, ...brs]);
    for (let low = 2; low <= 10; low++) {
        const window = [low, low + 1, low + 2, low + 3, low + 4];
        if (window.every((r) => present.has(r)) && (window.includes(hi) || window.includes(lo))) return true;
    }
    // The wheel: A-2-3-4-5, ace playing low.
    const wheel = [14, 2, 3, 4, 5];
    if (wheel.every((r) => present.has(r)) && (wheel.includes(hi) || wheel.includes(lo))) return true;
    return false;
}

export const HAND_CLASS_ORDER = [
    'monster', 'two_pair_plus', 'overpair', 'top_pair', 'middle_pair',
    'weak_pair', 'oesd', 'gutshot', 'overcards', 'air',
];

export const HAND_CLASS_LABELS = {
    monster: 'Sets & better',
    two_pair_plus: 'Two pair',
    overpair: 'Overpairs',
    top_pair: 'Top pair',
    middle_pair: 'Middle pair',
    weak_pair: 'Weak pair',
    oesd: 'Open-enders',
    gutshot: 'Gutshots',
    overcards: 'Overcards',
    air: 'Air',
    // Preflop buckets
    premium: 'Premium',
    pairs: 'Pocket pairs',
    broadway_suited: 'Suited broadway',
    broadway_offsuit: 'Offsuit broadway',
    suited_connectors: 'Suited connectors',
    suited_other: 'Other suited',
    offsuit_other: 'Other offsuit',
};

/**
 * Classify one 169-class entry against a board. Returns a key from
 * HAND_CLASS_ORDER, or null when the notation cannot be parsed.
 */
export function classifyHandClass(hand, board) {
    const r = ranksOf(hand);
    if (!r) return null;
    const brs = boardRanks(board);

    // ── Preflop: no board, so classify by starting-hand structure ──────────
    if (brs.length === 0) {
        if (r.pair && r.hi >= 12) return 'premium';                 // QQ+
        if (r.hi === 14 && r.lo >= 13) return 'premium';            // AK
        if (r.pair) return 'pairs';
        const bothBroadway = r.hi >= 10 && r.lo >= 10;
        if (bothBroadway) return r.suited ? 'broadway_suited' : 'broadway_offsuit';
        if (r.suited && r.hi - r.lo <= 2) return 'suited_connectors';
        return r.suited ? 'suited_other' : 'offsuit_other';
    }

    // ── Postflop ───────────────────────────────────────────────────────────
    const boardSet = new Set(brs);
    const top = brs[0];
    // Which board ranks appear more than once. Matching one of THOSE is trips;
    // matching an unpaired board rank on a paired board is two pair (hero's
    // pair plus the board's). The first version of this treated any hole-card
    // hit on a paired board as trips, so on K-K-A every ace graded as a
    // monster -- measured on screen as "Sets & better 28.5% of range", which
    // is exactly the direction a hand-strength panel must never err in.
    const counts = new Map();
    for (const r of brs) counts.set(r, (counts.get(r) || 0) + 1);
    const pairedRanks = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([r]) => r));
    const boardPaired = pairedRanks.size > 0;

    if (r.pair) {
        if (boardSet.has(r.hi)) return 'monster';                    // set
        if (r.hi > top) return 'overpair';
        // A pocket pair under the top card is exactly as strong as the number
        // of board cards it beats, so it grades on the same ladder as a paired
        // hole card rather than getting a bucket of its own.
        const beaten = brs.filter((b) => b < r.hi).length;
        if (beaten === brs.length - 1) return 'middle_pair';
        return beaten > 0 ? 'middle_pair' : 'weak_pair';
    }

    const hiHits = boardSet.has(r.hi);
    const loHits = boardSet.has(r.lo);

    // Trips: the hole card matches a rank the board already holds twice.
    if (pairedRanks.has(r.hi) || pairedRanks.has(r.lo)) return 'monster';

    if (madeStraight(r.hi, r.lo, brs)) return 'monster';

    // Both hole cards paired with the board is two pair. So is one hole card
    // paired on an already-paired board -- hero's pair plus the board's.
    if (hiHits && loHits) return 'two_pair_plus';
    if (boardPaired && (hiHits || loHits)) return 'two_pair_plus';

    if (hiHits || loHits) {
        const hitRank = hiHits ? r.hi : r.lo;
        const idx = brs.indexOf(hitRank);
        if (idx === 0) return 'top_pair';
        if (idx === brs.length - 1) return 'weak_pair';
        return 'middle_pair';
    }

    const draw = straightDrawOf(r.hi, r.lo, brs);
    if (draw) return draw;

    if (r.hi > top && r.lo > top) return 'overcards';
    return 'air';
}

/**
 * Aggregate a 169-class solver matrix into per-hand-class action mixes.
 *
 * @param {Object} gridData  { [hand]: { [actionId]: frequency } } — the same
 *                           object RangeGrid renders, from buildRangeGridData.
 * @param {Array}  actions   [{ id, label }] in display order.
 * @param {Array}  board     board card strings; empty/absent for preflop.
 * @returns {{rows: Array, totalCombos: number, suitedNote: string|null}|null}
 *
 * Each row is { key, label, combos, share, mix: { [actionId]: percent } },
 * combo-WEIGHTED: a pocket pair is 6 combos and an offsuit class is 12, so
 * averaging the raw percentages would let the rarest classes shout loudest.
 */
export function aggregateByHandClass(gridData, actions, board) {
    if (!gridData || typeof gridData !== 'object') return null;
    const actionIds = (actions || []).map((a) => (a && (a.id ?? a)) ?? null).filter(Boolean);
    if (actionIds.length === 0) return null;

    const buckets = new Map();
    let totalCombos = 0;
    let anySuited = false;

    for (const hand of Object.keys(gridData)) {
        const freqs = gridData[hand];
        if (!freqs || typeof freqs !== 'object') continue;

        // Normalise this class's mix to percentages. Upstream callers have
        // historically passed fractions (0-1), percentages (0-100) and
        // basis-points; summing the row and dividing is scale-agnostic, which
        // is the same defence rangeGridData applies per cell.
        let rowTotal = 0;
        for (const id of actionIds) rowTotal += Number(freqs[id]) || 0;
        if (rowTotal <= 0) continue;                  // class not in the range

        const key = classifyHandClass(hand, board);
        if (!key) continue;
        const combos = combosOf(hand);
        if (combos === 0) continue;
        if (hand.endsWith('s')) anySuited = true;

        if (!buckets.has(key)) buckets.set(key, { combos: 0, weighted: {} });
        const b = buckets.get(key);
        b.combos += combos;
        for (const id of actionIds) {
            const share = (Number(freqs[id]) || 0) / rowTotal;   // 0..1
            b.weighted[id] = (b.weighted[id] || 0) + share * combos;
        }
        totalCombos += combos;
    }

    if (totalCombos === 0) return null;

    // Order from the SAME source that produced the buckets, never from a
    // second guess about the board. The previous version chose the postflop
    // ordering whenever `board` was truthy and the preflop one otherwise --
    // so a board shape it could not parse produced preflop buckets and asked
    // for postflop keys, and the intersection was empty. Listing the known
    // order first and then appending anything unaccounted for makes an
    // ordering mismatch cost presentation, not the whole panel.
    const known = [
        ...HAND_CLASS_ORDER,
        'premium', 'pairs', 'broadway_suited', 'broadway_offsuit',
        'suited_connectors', 'suited_other', 'offsuit_other',
    ];
    const ORDER = [...known.filter((k) => buckets.has(k)), ...[...buckets.keys()].filter((k) => !known.includes(k))];

    const rows = [];
    for (const key of ORDER) {
        const b = buckets.get(key);
        if (!b || b.combos === 0) continue;
        const mix = {};
        for (const id of actionIds) {
            mix[id] = Math.round(((b.weighted[id] || 0) / b.combos) * 1000) / 10;
        }
        rows.push({
            key,
            label: HAND_CLASS_LABELS[key] || key,
            combos: Math.round(b.combos),
            share: Math.round((b.combos / totalCombos) * 1000) / 10,
            mix,
        });
    }
    if (rows.length === 0) return null;

    return {
        rows,
        totalCombos: Math.round(totalCombos),
        suitedNote: anySuited && boardRanks(board).length >= 3
            ? 'Flush draws are not separated: a 169-class grid records suited-or-not, not which suit, so a suited class holds the draw in one combo of four. Made hands and straight draws are exact.'
            : null,
    };
}

/**
 * Per-hand classification map for RangeGrid's `classificationData` prop, which
 * colours the 169 cells by what each class IS rather than by what it does.
 */
export function buildClassificationData(gridData, board) {
    if (!gridData || typeof gridData !== 'object') return null;
    const COLORS = {
        monster: '#22c55e', two_pair_plus: '#4ade80', overpair: '#84cc16',
        top_pair: '#eab308', middle_pair: '#f59e0b', weak_pair: '#f97316',
        oesd: '#38bdf8', gutshot: '#0ea5e9', overcards: '#a78bfa', air: '#64748b',
        premium: '#22c55e', pairs: '#84cc16', broadway_suited: '#eab308',
        broadway_offsuit: '#f59e0b', suited_connectors: '#38bdf8',
        suited_other: '#a78bfa', offsuit_other: '#64748b',
    };
    const out = {};
    for (const hand of Object.keys(gridData)) {
        const key = classifyHandClass(hand, board);
        if (!key) continue;
        out[hand] = { category: key, label: HAND_CLASS_LABELS[key] || key, color: COLORS[key] || '#64748b' };
    }
    return Object.keys(out).length ? out : null;
}
