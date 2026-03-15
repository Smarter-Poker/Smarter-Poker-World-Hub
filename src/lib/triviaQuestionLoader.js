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
 * @returns {Promise<string[]>} Array of question IDs to exclude
 */
export async function getRecentlySeenIds(supabase, userId, limit = 200) {
    if (!userId) return [];

    try {
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const { data: history } = await supabase
            .from('trivia_user_question_history')
            .select('question_id')
            .eq('user_id', userId)
            .gte('seen_at', sixtyDaysAgo.toISOString())
            .limit(limit);

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
 * @returns {object[]} Shuffled array of questions
 */
export function filterAndShuffle(questions, excludeIds, minFallback = 10) {
    if (!questions || questions.length === 0) return [];

    let available = excludeIds.length > 0
        ? questions.filter(q => !excludeIds.includes(q.id))
        : questions;

    // Fallback to full pool if too few unseen questions remain
    if (available.length < minFallback) available = questions;

    // Fisher-Yates shuffle (unbiased, unlike sort(() => Math.random() - 0.5))
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }

    return available;
}
