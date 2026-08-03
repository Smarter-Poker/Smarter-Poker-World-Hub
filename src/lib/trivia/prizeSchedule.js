/**
 * FIX(audit): Shared tournament prize schedule — src/lib/trivia/prizeSchedule.js
 *
 * Single source of truth for the CLIENT-side prize display. The percentages
 * and the pool-splitting rule below are copied VERBATIM from prizeSchedule()
 * and splitPrizePool() in pages/api/trivia/tournament-lifecycle.js — the
 * engine that actually pays winners. The tournaments page previously
 * advertised a hard-coded 40/20/12/8/5 split that never matched what the
 * engine paid out (e.g. a field of <=15 actually pays 45/25/16/14).
 *
 * If the payout schedule ever changes, it MUST change in both places (or,
 * better, tournament-lifecycle.js should be switched to import from this
 * module so they can never drift).
 */

/**
 * Prize distribution by field size. Percentages of the accumulated prize pool.
 * Any rounding remainder is handed to first place so the pool always balances
 * to exactly prize_pool (never over-pays, never leaks diamonds).
 */
export function prizeSchedule(entrantCount) {
    const n = Number(entrantCount) || 0;
    // Heads-up is winner-take-all, matching the 1v1 framing used everywhere else
    // in the product. Min-cashes only start once the field is big enough to make
    // "deep run, no win" a meaningful result.
    if (n <= 2) return [100];
    if (n <= 3) return [70, 30];
    if (n <= 7) return [55, 30, 15];
    if (n <= 15) return [45, 25, 16, 14];
    if (n <= 31) return [38, 22, 14, 10, 9, 7];
    return [32, 20, 13, 10, 8, 7, 5, 5];
}

/** Split the pool by the schedule, giving any rounding remainder to first. */
export function splitPrizePool(pool, entrantCount) {
    const total = Math.max(0, Math.floor(Number(pool) || 0));
    if (total === 0) return [];
    const schedule = prizeSchedule(entrantCount).slice(0, Math.max(1, entrantCount));
    const amounts = schedule.map(pct => Math.floor((total * pct) / 100));
    const paid = amounts.reduce((a, b) => a + b, 0);
    if (amounts.length > 0) amounts[0] += total - paid;
    return amounts.filter(a => a > 0);
}
