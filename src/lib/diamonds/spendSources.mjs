/**
 * The closed vocabulary of POST /api/diamonds/spend.
 *
 * The route writes the source as `diamond_transactions.transaction_type`, so
 * anything not listed here is refused rather than written.
 *
 * Retired sources are refused by name. A Trivia entry fee is charged by the
 * database inside the session start (reference `trivia_entry_<session>`), in
 * the same transaction that opens the session. A `trivia_entry` charge through
 * this route would take diamonds without opening a session, so the route
 * refuses it. No caller in the app sends it.
 */
export const ALLOWED_SPEND_SOURCES = Object.freeze([
    'game_cost',
    'memory_game',
    'trivia_lifeline',
    'training_entry',
    'video_unlock',
]);

export const RETIRED_SPEND_SOURCES = Object.freeze({
    trivia_entry: 'trivia_entry_charged_at_session_start',
});

/**
 * @param {unknown} raw the request body's `source`
 * @returns {{ ok: true, source: string } | { ok: false, status: number, error: string, code?: string }}
 */
export function checkSpendSource(raw) {
    const source = typeof raw === 'string' ? raw.trim() : '';
    if (Object.prototype.hasOwnProperty.call(RETIRED_SPEND_SOURCES, source)) {
        return { ok: false, status: 400, error: 'Spend source retired', code: RETIRED_SPEND_SOURCES[source] };
    }
    if (!ALLOWED_SPEND_SOURCES.includes(source)) {
        return { ok: false, status: 400, error: 'Unrecognised spend source' };
    }
    return { ok: true, source };
}
