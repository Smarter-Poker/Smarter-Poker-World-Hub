/**
 * POT MATH — what the felt says is in the middle.
 * ---------------------------------------------------------------------------
 * Split out of UniversalDynamicTable so it can be asserted directly by
 * scripts/preflop-pot-check.js without booting React. The chip stacks drawn in
 * front of each seat and the POT pill in the centre of the felt MUST be
 * computed from the same source, or the table contradicts itself: chips saying
 * a villain bet 2.5bb while the pill says the pot is 1.5bb.
 */

/** The blind a seat posts before anyone acts, in big blinds. */
function postedBlind(name) {
    const n = String(name || '').toUpperCase();
    if (n === 'SB' || n === 'BTN/SB') return 0.5;
    if (n === 'BB') return 1;
    return 0;
}

/** The money a single recorded action puts in front of a seat, in big blinds. */
function amountOf(entry) {
    const act = String((entry && entry.action) || '').toLowerCase();
    // A fold or a check adds nothing of its own. It does NOT retract what the
    // same seat already put in -- that is why this is a per-entry amount and
    // the caller takes a maximum rather than a last-entry-wins.
    if (act.includes('fold') || act.includes('check')) return 0;
    const raw = entry.amount != null ? entry.amount : (entry.size != null ? entry.size : entry.bb);
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    const m = String((entry && entry.action) || '').match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    return 0;
}

/**
 * Money seat `seat` has pushed in front of it, in big blinds.
 *
 * Order of truth: an explicit numeric amount on the recorded action, then the
 * first number in the action text ("RAISE 3BB" -> 3), then the posted blind.
 *
 * Amounts on an action are TOTALS-TO, the way a poker log writes them ("raise
 * to 8"), so a seat's contribution on the street is the LARGEST amount it has
 * been recorded at -- not the first one. Reading only the first entry (the old
 * `.find`) understated three real shapes and, because computeDisplayPot sums
 * this same function, pushed each error straight into the POT pill:
 *
 *   - open then call a 3-bet: [{UTG,'RAISE',2.5},{UTG,'CALL',8}] read as 2.5
 *   - check then bet on the same street: [{BB,'CHECK'},{BB,'BET',4}] read as 0
 *   - a blind that later acts: the blind was dropped entirely, because the
 *     posted-blind branch only ran for a seat with NO entry at all
 *
 * The posted blind is a FLOOR, not an addend: a small blind called to 3 has 3
 * in front of it, not 3.5, because the 0.5 it posted counts toward the 3. The
 * floor still applies to a blind that folds -- a posted blind is dead money
 * that stays in the middle, so leaving it out understated the pot.
 */
export function committedFor(seat, actionHistory, isPreflop) {
    const name = (seat && seat.name) || '';
    const upper = name.toUpperCase();
    let committed = 0;
    let sawEntry = false;
    for (const a of actionHistory || []) {
        if (!a || String(a.position || '').toUpperCase() !== upper) continue;
        sawEntry = true;
        const v = amountOf(a);
        if (v > committed) committed = v;
    }
    if (isPreflop) {
        const blind = postedBlind(upper);
        if (blind > committed) committed = blind;
    }
    return sawEntry || committed > 0 ? committed : 0;
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
