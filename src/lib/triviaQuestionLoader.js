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
 * Phase 55 — randomized pool fetcher. Replaces inline queries that always
 * fetched the same .order('id desc').limit(200) window, which caused users
 * in long sessions to cycle through the same ~200 newest questions while
 * 8,400+ others were never reached.
 *
 * Strategy: count the matching pool, pick a random offset, fetch that page.
 * Each call hits a different slice of the pool.
 *
 * @param {object} supabase - client
 * @param {object} [opts]
 * @param {string|string[]} [opts.category] - eq or in filter
 * @param {string|string[]} [opts.difficulty] - eq or in filter
 * @param {number} [opts.pageSize=200] - rows to fetch
 * @returns {Promise<object[]>} array of trivia_questions rows
 */
export async function fetchRandomQuestionPool(supabase, opts = {}) {
    const { category, difficulty, pageSize = 200 } = opts;

    // Count first
    let countQ = supabase.from('trivia_questions').select('id', { count: 'exact', head: true });
    if (Array.isArray(category)) countQ = countQ.in('category', category);
    else if (category) countQ = countQ.eq('category', category);
    if (Array.isArray(difficulty)) countQ = countQ.in('difficulty', difficulty);
    else if (difficulty) countQ = countQ.eq('difficulty', difficulty);

    const { count: total, error: cErr } = await countQ;
    if (cErr) {
        console.warn('[triviaQuestionLoader] count query failed:', cErr.message);
        return [];
    }
    const totalCount = total || 0;
    if (totalCount === 0) return [];

    // Random offset
    const maxOffset = Math.max(0, totalCount - pageSize);
    const offset = Math.floor(Math.random() * (maxOffset + 1));

    // Fetch
    let dataQ = supabase.from('trivia_questions').select('*');
    if (Array.isArray(category)) dataQ = dataQ.in('category', category);
    else if (category) dataQ = dataQ.eq('category', category);
    if (Array.isArray(difficulty)) dataQ = dataQ.in('difficulty', difficulty);
    else if (difficulty) dataQ = dataQ.eq('difficulty', difficulty);
    dataQ = dataQ.range(offset, offset + pageSize - 1);

    const { data, error } = await dataQ;
    if (error) {
        console.warn('[triviaQuestionLoader] data fetch failed:', error.message);
        return [];
    }
    return data || [];
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

    // Phase 55 — apply quality floor BEFORE the seen-exclusion filter so
    // reported-bad / clarity-flagged questions (qs <= 5) never reach gameplay,
    // even via the small-pool fallback path. The previous fallback reset to
    // [...questions] which let qs=2 (auto-demoted via 3-strike report) and
    // qs=4 (unclear English) leak back in when the filtered set was thin.
    const qualityFloor = opts.minQualityScore && Number.isFinite(opts.minQualityScore) ? opts.minQualityScore : null;
    const qualityPool = qualityFloor != null
        ? questions.filter(q => typeof q.quality_score !== 'number' || q.quality_score >= qualityFloor)
        : questions;

    // Now apply the recently-seen exclusion within the quality-safe pool
    let available = excludeIds.length > 0
        ? qualityPool.filter(q => !excludeIds.includes(q.id))
        : [...qualityPool];

    // Tier-1 fallback: if too few unseen-AND-quality questions remain, drop the
    // seen-exclusion (allow recently-seen questions back in) but KEEP the
    // quality floor in place. This prevents the auto-demoted reported-bad
    // questions from ever appearing in gameplay.
    if (available.length < minFallback) available = [...qualityPool];

    // Tier-2 fallback (last resort): if even the full quality-safe pool is too
    // small, then and only then return the unfiltered set so the game can run.
    // This only happens when fewer than minFallback questions exist with
    // quality_score >= floor for the given category — a pool-health emergency
    // surfaced via /admin/trivia-pool, not a routine fallback.
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
