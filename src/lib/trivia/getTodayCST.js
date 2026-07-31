/**
 * CST/CDT day helpers — the canonical day anchor for the whole trivia system.
 * ═══════════════════════════════════════════════════════════════════════════
 * Daily caps, leaderboard windows, reward claim_date and trivia_scores.play_date
 * all bucket by the America/Chicago day, not the UTC day.
 *
 * Timezone-safety rules honoured here:
 *  - NEVER derive a day from toISOString() (that is the UTC day; between 6pm
 *    and midnight CST it has already rolled over).
 *  - NEVER derive the day from `new Date(now.toLocaleString(...))`. That
 *    round-trips through a locale-formatted string and re-parses it in the
 *    RUNTIME's timezone; it happens to work on V8/en-US but is undefined
 *    behaviour and drifts on other ICU builds and at DST boundaries.
 *  - The CST/CDT offset is resolved FOR THE TARGET MIDNIGHT, not for "now".
 *    Deriving it from the current abbreviation shifts the cap window by an
 *    hour on both DST changeover days each year.
 *
 * All functions are dependency-free so API routes can import them too.
 */

const TZ = 'America/Chicago';

const _dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/**
 * Split a Date into America/Chicago calendar parts.
 * @param {Date} [date=new Date()]
 * @returns {{year: string, month: string, day: string}} zero-padded strings
 */
export function getCSTDateParts(date = new Date()) {
    const parts = _dateParts.formatToParts(date);
    const pick = type => parts.find(p => p.type === type)?.value || '';
    return {
        year: pick('year'),
        month: pick('month'),
        day: pick('day'),
    };
}

/**
 * Today's date in America/Chicago (CST/CDT) as 'YYYY-MM-DD'.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getTodayCST(date = new Date()) {
    const { year, month, day } = getCSTDateParts(date);
    return `${year}-${month}-${day}`;
}

/**
 * The UTC offset in effect in America/Chicago at MIDNIGHT of the given
 * calendar date — '-06:00' (CST) or '-05:00' (CDT).
 *
 * 06:00 UTC always falls inside the target Chicago day (00:00 or 01:00 local)
 * and is always on the correct side of both DST transitions:
 *   - spring forward: 02:00 CST -> 08:00 UTC, so 06:00Z is still CST
 *   - fall back:      02:00 CDT -> 07:00 UTC, so 06:00Z is still CDT
 *
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {string} '-05:00' | '-06:00'
 */
export function getCSTOffsetForDate(dateStr) {
    const probe = new Date(`${dateStr}T06:00:00Z`);
    if (Number.isNaN(probe.getTime())) return '-06:00';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        timeZoneName: 'short',
    }).formatToParts(probe);
    const abbr = parts.find(p => p.type === 'timeZoneName')?.value || 'CST';
    return abbr === 'CDT' ? '-05:00' : '-06:00';
}

/**
 * Start of a CST day as an offset-qualified ISO timestamp. Use for
 * `.gte('created_at', x)` style queries meaning "rows from this CST day on".
 *
 * @param {string} [dateStr] - 'YYYY-MM-DD'; defaults to today in CST
 * @returns {string} e.g. '2026-07-26T00:00:00-05:00'
 */
export function getTodayStartCST(dateStr) {
    const day = dateStr || getTodayCST();
    return `${day}T00:00:00${getCSTOffsetForDate(day)}`;
}

/**
 * Start of the CST day N days before the given date (inclusive window start).
 * @param {number} daysAgo
 * @param {string} [dateStr]
 * @returns {string} offset-qualified ISO timestamp
 */
export function getDayStartCSTDaysAgo(daysAgo, dateStr) {
    const base = new Date(`${dateStr || getTodayCST()}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() - (Number.isFinite(daysAgo) ? daysAgo : 0));
    const day = getTodayCST(base);
    return `${day}T00:00:00${getCSTOffsetForDate(day)}`;
}

export default getTodayCST;
