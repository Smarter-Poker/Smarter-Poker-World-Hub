/**
 * getTodayCST — Returns today's date in America/Chicago (CST/CDT) as a
 * YYYY-MM-DD string. The trivia codebase uses CST as the canonical day
 * anchor for daily caps, leaderboard windows, and score-row play_date.
 *
 * Phase 73: extracted from 5 inlined copies (submit.js, daily.js,
 * leaderboard.js, hub/trivia/index.js, [mode].js). Was redundantly
 * defined per-file with the same body. Now there's one source of truth.
 *
 * @returns {string} 'YYYY-MM-DD' in America/Chicago
 */
export function getTodayCST() {
    const now = new Date();
    // toLocaleString with timeZone rebuilds the Date as if it were in CST.
    // This is the same pattern the existing inlined copies use — keep it
    // consistent so behavior doesn't drift.
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns the CST-day-start as a UTC ISO timestamp (with -06:00 or -05:00
 * offset for CST/CDT respectively). Use this for `.gte('created_at', x)`
 * style queries where you want "rows from today's CST day onwards".
 *
 * Phase 72/73: matches the diamondCap.js fix that anchors daily-cap
 * windows to CST instead of UTC, closing the 6-hour double-earning
 * window that occurred between 6pm CST and midnight CST every day.
 *
 * @returns {string} ISO 8601 with explicit CST/CDT offset
 */
export function getTodayStartCST() {
    const cstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = cstNow.getFullYear();
    const month = String(cstNow.getMonth() + 1).padStart(2, '0');
    const date = String(cstNow.getDate()).padStart(2, '0');
    // Auto-detect CST vs CDT via Intl.
    const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        timeZoneName: 'short'
    }).formatToParts(new Date());
    const tzAbbr = tzParts.find(p => p.type === 'timeZoneName')?.value || 'CST';
    const offset = tzAbbr === 'CDT' ? '-05:00' : '-06:00';
    return `${year}-${month}-${date}T00:00:00${offset}`;
}
