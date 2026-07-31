import { getTodayStartCST } from './getTodayCST';

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
    if (!supabase || !userId) return 0;

    // Phase 74: this used to re-implement getTodayStartCST() byte-for-byte,
    // including the bug where the CST/CDT offset was read from the CURRENT
    // abbreviation rather than the abbreviation in effect at the target
    // midnight — shifting the cap window by an hour on both DST changeover
    // days. One source of truth now.
    const todayStartCST = getTodayStartCST();

    let query = supabase
        .from('trivia_scores')
        .select('diamonds_earned')
        .eq('user_id', userId)
        .gte('created_at', todayStartCST);

    // Omitting the mode filter yields the ALL-MODES total (used for a
    // platform-wide daily cap). Passing a mode keeps the per-mode behaviour.
    if (typeof mode === 'string' && mode.length > 0) query = query.eq('mode', mode);

    const { data, error } = await query
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
