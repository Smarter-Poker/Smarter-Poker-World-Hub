/**
 * arcadeStakes - the arcade stake-pot rules, as one shared pure module.
 * =========================================================================
 * WHY THIS EXISTS
 *
 * The stake pot (build on correct, bust on wrong, cash out from question 6)
 * has only ever lived inside TriviaGame.jsx, which meant the POT WAS
 * CLIENT-COMPUTED and the completion handler credited whatever the browser
 * said (clamped to 50). Server-authoritative grading needs to recompute the
 * exact same pot from the server-recorded answer sequence
 * (trivia_sessions.answers, ordinal "n"), so the rules move here where both
 * sides can import them. TriviaGame keeps calling these for display; the
 * payout only ever trusts the server-side recomputation in
 * /api/trivia/session-submit.
 *
 * RULES (verbatim from TriviaGame.jsx at migration time):
 *   - STAKE_VALUES[i] diamonds are at stake on question i (capped at the
 *     last entry for i >= 10).
 *   - A correct answer adds STAKE_VALUES[min(i, 9)] * multiplier(streak),
 *     where streak is the run of consecutive correct answers BEFORE this
 *     one: >=7 -> 5x, >=5 -> 3x, >=3 -> 2x, else 1x.
 *   - A wrong answer busts the pot to 0 and resets the streak.
 *   - A skip (displayIndex < 0) is neutral: no pot change, no streak change.
 *   - Cash-out locks the pot; it requires at least CASH_OUT_MIN_ANSWERED
 *     questions answered (the UI gates on currentIndex >= 5, i.e. question 6).
 * =========================================================================
 */

export const STAKE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 55 total possible

/** Single-run ceiling on an arcade payout (mirrors [mode].js H1 clamp). */
export const ARCADE_MAX_RUN_PAYOUT = 50;

/** Minimum answered questions before a cash-out is honoured. */
export const CASH_OUT_MIN_ANSWERED = 6;

/** Streak multiplier, from the streak BEFORE the current answer. */
export function stakeMultiplier(streak) {
    if (streak >= 7) return 5;
    if (streak >= 5) return 3;
    if (streak >= 3) return 2;
    return 1;
}

/**
 * Recompute the stake pot from an ordered answer sequence.
 *
 * @param {Array<{questionIndex: number, result: 'correct'|'wrong'|'skip'}>} seq
 *        Answers in the order they were given. questionIndex is the
 *        question's position in the served roster (0-based).
 * @returns {{pot: number, streak: number, answered: number}}
 */
export function computeStakePot(seq) {
    let pot = 0;
    let streak = 0;
    let answered = 0;
    for (const step of Array.isArray(seq) ? seq : []) {
        if (!step || step.result === 'skip') continue;
        answered += 1;
        if (step.result === 'correct') {
            const idx = Number.isInteger(step.questionIndex)
                ? Math.max(0, step.questionIndex)
                : 0;
            const stakeValue = STAKE_VALUES[Math.min(idx, STAKE_VALUES.length - 1)]
                * stakeMultiplier(streak);
            pot += stakeValue;
            streak += 1;
        } else {
            pot = 0;
            streak = 0;
        }
    }
    return { pot, streak, answered };
}
