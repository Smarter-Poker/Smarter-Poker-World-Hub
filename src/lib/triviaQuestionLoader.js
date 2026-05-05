/**
 * TRIVIA QUESTION LOADER — Shared utility for 60-day non-repeat logic
 * Extracts the duplicated "recently seen question IDs" fetch and
 * "filter + shuffle" pattern used across all trivia game modes.
 *
 * Usage:
 *   import { getRecentlySeenIds, filterAndShuffle } from '../../src/lib/triviaQuestionLoader';
 *   const excludeIds = await getRecentlySeenIds(supabase, userId);
 *   const questions = filterAndShuffle(allData, excludeIds, minFallback);
 */

/**
 * Fetch the IDs of questions the user has seen in the last 60 days.
 * @param {object} supabase - Supabase client instance
 * @param {string|null} userId - Authenticated user ID (null = no filtering)
 * @param {number} [limit=200] - Max history rows to fetch
 * @param {string} [mode] - Optional game mode to filter by (e.g. 'pvp', 'time-attack')
 * @returns {Promise<string[]>} Array of question IDs to exclude
 */
export async function getRecentlySeenIds(supabase, userId, limit = 200, mode = null) {
    if (!userId) return [];

    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        let query = supabase
            .from('trivia_user_question_history')
            .select('question_id')
            .eq('user_id', userId)
            .gte('seen_at', sixtyDaysAgo.toISOString());

        // If a specific mode is provided, only exclude questions seen in that mode
        if (mode) {
            query = query.eq('mode', mode);
        }

        const { data: history } = await query.limit(limit);

        return history ? history.map(h => h.question_id) : [];
    } catch (e) {
        console.warn('[triviaQuestionLoader] Failed to load seen history:', e);
        return [];
    }
}

/**
 * Filter out recently seen questions and shuffle the result.
 * Falls back to unfiltered pool if too few remain after filtering.
 * @param {object[]} questions - Full question array from Supabase
 * @param {string[]} excludeIds - IDs to exclude (from getRecentlySeenIds)
 * @param {number} [minFallback=10] - If fewer than this remain after filtering, use full pool
 * @param {object} [opts] - Optional behaviour
 * @param {number} [opts.minQualityScore] - Drop questions whose quality_score is below this. Falls back to full pool if too few remain.
 * @param {boolean} [opts.preferHighQuality] - If true, weight the shuffle so quality_score 9-10 questions cluster near the front (used for daily/easy modes).
 * @returns {object[]} Shuffled array of questions
 */
export function filterAndShuffle(questions, excludeIds, minFallback = 10, opts = {}) {
    if (!questions || questions.length === 0) return [];

    let available = excludeIds.length > 0
        ? questions.filter(q => !excludeIds.includes(q.id))
        : [...questions]; // Clone to prevent mutating the caller's original array

    // Quality-score floor: drop low-quality rows when caller provides minQualityScore.
    // Phase 49 — questions are now tagged with quality_score 0-10 (deterministic engine
    // assigns 6/8/10 based on clarity-of-best-action; Grok-generated rows default to 7).
    if (opts.minQualityScore && Number.isFinite(opts.minQualityScore)) {
        const qualityFiltered = available.filter(
            q => typeof q.quality_score !== 'number' || q.quality_score >= opts.minQualityScore,
        );
        if (qualityFiltered.length >= minFallback) available = qualityFiltered;
    }

    // Fallback to full pool if too few unseen questions remain
    if (available.length < minFallback) available = [...questions];

    // Fisher-Yates shuffle (unbiased, unlike sort(() => Math.random() - 0.5))
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }

    // Quality preference: do a stable partial sort that keeps the shuffle randomness
    // among same-quality buckets but pushes 9-10 quality rows to the front. Used for
    // daily/easy modes where users expect clear-cut questions.
    if (opts.preferHighQuality) {
        available.sort((a, b) => (b.quality_score ?? 5) - (a.quality_score ?? 5));
    }

    return available;
}
