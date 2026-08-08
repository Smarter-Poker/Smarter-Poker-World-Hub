/**
 * SESSION ANALYTICS — pure derivations over the session hand history.
 * ---------------------------------------------------------------------------
 * ONE ACCUMULATOR, MANY READERS. The trainer records one entry per graded
 * decision into useGTOWScore's handHistory. Everything the in-hand session
 * rail and the post-session review screen print about the session —
 * classification distribution, per-position and per-street accuracy, the
 * most costly spots, EV totals — is derived from that single array by the
 * functions in this file. Neither screen keeps its own parallel counters,
 * so the two can never disagree.
 *
 * DELIBERATELY PLAIN. No React, no JSX, no imports: every function here is a
 * self-contained declaration so scripts/session-analytics-check.js can lift
 * the shipping code verbatim (the avatar-library-check pattern) and assert
 * the review screen's numbers against a synthetic session. If you add a
 * function, keep it dependency-free or the harness will tell you about it.
 *
 * Entry shape (written by useGTOWScore.recordMove):
 *   { classification: 'best'|'correct'|'inaccuracy'|'wrong'|'blunder',
 *     evLoss: number (BB), heroPosition: string, street: string,
 *     action: string, correctAction: string, handNumber: number, ... }
 */

// The five classification tiers, in rail order. Mirrors MOVE_CLASSIFICATIONS
// in useGTOWScore.js — kept literal here so the module stays liftable.
export const CLASSIFICATION_KEYS = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];

export const MISTAKE_CLASSIFICATIONS = ['inaccuracy', 'wrong', 'blunder'];

/**
 * Classification distribution for the session.
 * Returns { best, correct, inaccuracy, wrong, blunder } counts.
 */
export function deriveClassificationCounts(handHistory) {
    const counts = { best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 };
    (handHistory || []).forEach((h) => {
        if (h && h.classification !== undefined && counts[h.classification] !== undefined) {
            counts[h.classification] += 1;
        }
    });
    return counts;
}

/**
 * Per-position accuracy with hand counts.
 * Returns { POS: { total, correct, accuracy } } keyed by normalized position
 * (uppercase, letters only — same normalization recordMove has always used).
 * "Correct" means the move graded best or correct.
 */
export function derivePositionAccuracy(handHistory) {
    const stats = {};
    (handHistory || []).forEach((h) => {
        if (!h || !h.heroPosition) return;
        const pos = String(h.heroPosition).toUpperCase().replace(/[^A-Z]/g, '');
        if (!pos) return;
        if (!stats[pos]) stats[pos] = { total: 0, correct: 0 };
        stats[pos].total += 1;
        if (h.classification === 'best' || h.classification === 'correct') stats[pos].correct += 1;
    });
    const result = {};
    Object.entries(stats).forEach(([pos, data]) => {
        result[pos] = {
            ...data,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        };
    });
    return result;
}

/**
 * Per-street accuracy with hand counts.
 * Returns { street: { total, correct, accuracy } } keyed by lowercase street.
 */
export function deriveStreetAccuracy(handHistory) {
    const stats = {};
    (handHistory || []).forEach((h) => {
        if (!h || !h.street) return;
        const st = String(h.street).toLowerCase();
        if (!stats[st]) stats[st] = { total: 0, correct: 0 };
        stats[st].total += 1;
        if (h.classification === 'best' || h.classification === 'correct') stats[st].correct += 1;
    });
    const result = {};
    Object.entries(stats).forEach(([st, data]) => {
        result[st] = {
            ...data,
            accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        };
    });
    return result;
}

/**
 * EV aggregates. totalEVLoss uses the same per-step cent rounding the old
 * incremental accumulator used (round after every addition), so numbers are
 * bit-identical to what past sessions displayed and persisted.
 * Returns { totalEVLoss, movesMade, mistakeCount, avgEVLossPerMove,
 *           avgEVLossPerMistake }.
 */
export function deriveEVSummary(handHistory) {
    const history = handHistory || [];
    let totalEVLoss = 0;
    let mistakeCount = 0;
    history.forEach((h) => {
        const loss = h && Number.isFinite(h.evLoss) ? h.evLoss : 0;
        totalEVLoss = Math.round((totalEVLoss + loss) * 100) / 100;
        if (h && MISTAKE_CLASSIFICATIONS.indexOf(h.classification) !== -1) mistakeCount += 1;
    });
    const movesMade = history.length;
    return {
        totalEVLoss,
        movesMade,
        mistakeCount,
        avgEVLossPerMove: movesMade > 0 ? Math.round((totalEVLoss / movesMade) * 100) / 100 : 0,
        avgEVLossPerMistake: mistakeCount > 0 ? Math.round((totalEVLoss / mistakeCount) * 100) / 100 : 0,
    };
}

/**
 * The most costly spots of the session: every graded mistake that surrendered
 * EV, sorted by how much it surrendered, largest first. Ties keep session
 * order (earlier hand first) so the ordering is deterministic.
 * Each entry: { handNumber, heroPosition, street, action, correctAction,
 *               evLoss, classification }.
 */
export function deriveTopLeaks(handHistory, limit) {
    const max = Number.isFinite(limit) ? limit : 5;
    const leaks = (handHistory || [])
        .map((h, i) => ({
            handNumber: h && h.handNumber ? h.handNumber : i + 1,
            heroPosition: (h && h.heroPosition) || null,
            street: (h && h.street) || null,
            action: (h && h.action) || '',
            correctAction: (h && h.correctAction) || '',
            evLoss: h && Number.isFinite(h.evLoss) ? Math.round(h.evLoss * 100) / 100 : 0,
            classification: (h && h.classification) || null,
            order: i,
        }))
        .filter((h) => h.evLoss > 0 && MISTAKE_CLASSIFICATIONS.indexOf(h.classification) !== -1);
    leaks.sort((a, b) => (b.evLoss - a.evLoss) || (a.order - b.order));
    return leaks.slice(0, max).map(({ order, ...rest }) => rest);
}
