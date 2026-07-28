/**
 * POT MATH — what the felt says is in the middle.
 * ---------------------------------------------------------------------------
 * Split out of UniversalDynamicTable so it can be asserted directly by
 * scripts/preflop-pot-check.js without booting React. The chip stacks drawn in
 * front of each seat and the POT pill in the centre of the felt MUST be
 * computed from the same source, or the table contradicts itself: chips saying
 * a villain bet 2.5bb while the pill says the pot is 1.5bb.
 */

/**
 * Money seat `seat` has pushed in front of it, in big blinds.
 *
 * Order of truth: an explicit numeric amount on the recorded action, then the
 * first number in the action text ("RAISE 3BB" -> 3), then the posted blinds
 * preflop for a seat that has not acted. Folds and checks commit nothing.
 */
export function committedFor(seat, actionHistory, isPreflop) {
    const name = (seat && seat.name) || '';
    const entry = (actionHistory || []).find(
        (a) => a && String(a.position || '').toUpperCase() === name.toUpperCase()
    );
    if (entry) {
        const act = String(entry.action || '').toLowerCase();
        if (act.includes('fold') || act.includes('check')) return 0;
        const raw = entry.amount != null ? entry.amount : (entry.size != null ? entry.size : entry.bb);
        if (typeof raw === 'number' && isFinite(raw)) return raw;
        const m = String(entry.action || '').match(/(\d+(?:\.\d+)?)/);
        if (m) return parseFloat(m[1]);
        return 0;
    }
    if (isPreflop) {
        const n = name.toUpperCase();
        if (n === 'SB' || n === 'BTN/SB') return 0.5;
        if (n === 'BB') return 1;
    }
    return 0;
}

/**
 * Total committed across every seat, in big blinds.
 */
export function totalCommitted(seats, actionHistory, isPreflop) {
    return (seats || []).reduce(
        (sum, seat) => sum + committedFor(seat, actionHistory, isPreflop),
        0
    );
}

/**
 * The number the POT pill shows.
 *
 * An explicit scenario pot always wins -- postflop that is the number
 * PostflopScenarioGenerator.potGeometry() produced, and it already contains
 * every earlier street. Preflop scenarios carry no pot at all (the MTT/ICM
 * question banks have no `pot` field), and the old fallback answered that with
 * a flat 1.5bb: the blinds, and nothing else. So a spot whose own question text
 * read "the player to your right bets 2.5 big blinds" -- with that villain's
 * 2.5bb chip stack drawn on the felt right next to it -- showed a pot of 1.5bb.
 * Sum what is actually in front of the seats instead; fall back to the blinds
 * only when nobody has acted.
 */
export function computeDisplayPot({ scenarioPot, streetLabel, seats, actionHistory }) {
    const explicit = Number(scenarioPot) || 0;
    if (explicit > 0) return explicit;
    const isPreflop = streetLabel === 'PREFLOP';
    const committed = totalCommitted(seats, actionHistory, isPreflop);
    // One decimal: blinds are halves, bet sizings are quarters at worst, and a
    // float sum of 0.5 + 1 + 2.5 must not render as 3.9999999999999996.
    if (committed > 0) return Math.round(committed * 10) / 10;
    return isPreflop ? 1.5 : 0;
}
