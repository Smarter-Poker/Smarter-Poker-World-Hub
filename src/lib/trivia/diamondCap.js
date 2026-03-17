/**
 * Get total diamonds earned today for a specific trivia mode.
 * Used to enforce daily diamond caps.
 *
 * @param {object} supabase — Supabase client instance
 * @param {string} userId
 * @param {string} mode — mode filter (e.g. 'endless')
 * @returns {Promise<number>} — total diamonds earned today
 */
export async function getDailyDiamondsEarned(supabase, userId, mode) {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
        .from('trivia_scores')
        .select('diamonds_earned')
        .eq('user_id', userId)
        .eq('mode', mode)
        .gte('created_at', today)
        .limit(100);

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
