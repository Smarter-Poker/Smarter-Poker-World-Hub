/**
 * Get total diamonds earned today for a specific trivia mode.
 * Used to enforce daily diamond caps.
 *
 * Phase 72: was using `new Date().toISOString().split('T')[0]` (UTC date)
 * for the .gte threshold. For a CST user playing between midnight CST and
 * 6am CST (= 6am UTC and noon UTC), the UTC date matched. But between
 * 6pm CST and midnight CST (= midnight UTC and 6am UTC), today's UTC
 * date had ALREADY ROLLED OVER — so trivia_scores rows from earlier in
 * the same CST day were filtered OUT, the cap query returned 0, and the
 * user's daily-cap clamp let them re-earn the full daily allotment.
 * Effectively, the daily cap reset at 6pm CST (= midnight UTC) instead
 * of midnight CST. Six free hours of double-earning per day per user.
 *
 * Now anchors to America/Chicago (CST/CDT). The compare-string is the
 * date in CST; PostgREST coerces to start-of-CST-day midnight in the
 * server's timezone, then compares to created_at (UTC, but the day-bucket
 * still respects CST).
 *
 * @param {object} supabase — Supabase client instance
 * @param {string} userId
 * @param {string} mode — mode filter (e.g. 'endless')
 * @returns {Promise<number>} — total diamonds earned today (in CST day)
 */
export async function getDailyDiamondsEarned(supabase, userId, mode) {
    // Compute start-of-day in CST as a UTC ISO timestamp.
    const cstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const cstYear = cstNow.getFullYear();
    const cstMonth = cstNow.getMonth();
    const cstDate = cstNow.getDate();
    // Build a UTC midnight for that CST date — actually we need start of CST day
    // as UTC. Use Date.UTC to construct, then offset by the CST UTC-offset (≈6h).
    // Simpler approach: format the CST midnight as 'YYYY-MM-DDT00:00:00-06:00'
    // (or -05:00 for CDT). The toLocaleString trick above already collapses
    // to local CST time, so we reconstruct an ISO string with a fixed CST
    // offset and let Postgres parse it.
    // Determine if CST or CDT (DST observance). new Date doesn't expose this
    // directly, but Intl.DateTimeFormat does:
    const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        timeZoneName: 'short'
    }).formatToParts(new Date());
    const tzAbbr = tzParts.find(p => p.type === 'timeZoneName')?.value || 'CST';
    const offset = tzAbbr === 'CDT' ? '-05:00' : '-06:00';
    const monthStr = String(cstMonth + 1).padStart(2, '0');
    const dateStr = String(cstDate).padStart(2, '0');
    const todayStartCST = `${cstYear}-${monthStr}-${dateStr}T00:00:00${offset}`;

    const { data, error } = await supabase
        .from('trivia_scores')
        .select('diamonds_earned')
        .eq('user_id', userId)
        .eq('mode', mode)
        .gte('created_at', todayStartCST)
        .limit(500); // Phase 72: bumped from 100 — endless/mixed players can
                    //          legitimately exceed 100 score-rows in one day

    if (error) {
        console.warn('[diamondCap] cap query failed, treating as 0 earned:', error.message);
        return 0;
    }
    if (!data) return 0;
    return data.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
}

/**
 * Clamp diamond award to stay within the daily cap.
 *
 * @param {number} earnedToday — diamonds already earned today
 * @param {number} pendingAward — diamonds about to be awarded
 * @param {number} cap — daily cap
 * @returns {number} — clamped award (0 if already at cap)
 */
export function clampToCap(earnedToday, pendingAward, cap) {
    const remaining = Math.max(0, cap - earnedToday);
    return Math.min(pendingAward, remaining);
}
