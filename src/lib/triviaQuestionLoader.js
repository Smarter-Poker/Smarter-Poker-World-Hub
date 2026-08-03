/**
 * TRIVIA QUESTION LOADER — the 60-day non-repeat engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Product promise: a player NEVER sees the same question twice inside 60 days,
 * across EVERY mode (daily, mixed, endless, survival, time-attack, pvp,
 * tournaments). This module is the single place that promise is enforced.
 *
 * What was broken before (and is fixed here):
 *   1. getRecentlySeenIds() fetched at most 200 history rows with NO .order(),
 *      so PostgREST returned an arbitrary subset. An active player accumulates
 *      1,200+ rows in the window, so ~83% of seen questions were not excluded.
 *      -> Now ordered by seen_at DESC and PAGED through the whole window.
 *   2. Exclusion was scoped per-mode (.eq('mode', mode)) even though
 *      trivia_user_question_history is UNIQUE(user_id, question_id) with a
 *      single mode column that every upsert OVERWRITES. Seeing a question in
 *      time-attack silently erased the daily record of it.
 *      -> Exclusion is now GLOBAL per user. The mode argument is accepted for
 *         backwards compatibility but deliberately ignored.
 *   3. filterAndShuffle's small-pool fallback did `available = [...pool]`,
 *      re-admitting questions the player answered YESTERDAY at random.
 *      -> Degradation is now ordered: unseen first, then the OLDEST-seen
 *         questions, never a hard failure and never yesterday's questions
 *         while an older one exists.
 *
 * Usage (legacy, still supported):
 *   const excludeIds = await getRecentlySeenIds(supabase, userId);
 *   const questions  = filterAndShuffle(allData, excludeIds, minFallback, opts);
 *
 * Usage (preferred, one call):
 *   const { questions, depth } = await loadQuestionsForUser(supabase, {
 *     userId, category, difficulty, count: 20, mode: 'daily',
 *   });
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** The product's no-repeat window, in days. */
export const NO_REPEAT_WINDOW_DAYS = 60;

/** Gameplay quality floor — reported-bad (qs=2/3) and unclear (qs=4) are buried. */
export const DEFAULT_QUALITY_FLOOR = 6;

/** Rows pulled per history request. PostgREST caps responses ~1000 by default. */
const HISTORY_PAGE_SIZE = 1000;

/**
 * Hard ceiling on history rows walked. trivia_user_question_history is
 * UNIQUE(user_id, question_id), so this equals "distinct questions ever seen".
 * A survival grinder burns ~200/run; 12,000 covers 60 days of the heaviest
 * realistic consumption. Beyond this we report `truncated` instead of lying.
 */
const HISTORY_MAX_ROWS = 12000;

/** Max ids we are willing to push into a PostgREST `not.in.(...)` filter. */
const MAX_DB_EXCLUDE_IDS = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start of the no-repeat window as an ISO timestamp.
 * @param {number} [days=60]
 * @returns {string} ISO 8601
 */
export function getNoRepeatWindowStart(days = NO_REPEAT_WINDOW_DAYS) {
    const d = new Date();
    d.setDate(d.getDate() - (Number.isFinite(days) && days > 0 ? days : NO_REPEAT_WINDOW_DAYS));
    return d.toISOString();
}

/** Fisher-Yates in place (unbiased, unlike sort(() => Math.random() - 0.5)). */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Normalize anything array-ish / Set-ish into a Set of ids. */
function toIdSet(value) {
    if (!value) return new Set();
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value);
    return new Set();
}

/** Only forward well-formed UUIDs into a PostgREST filter string. */
function safeUuids(ids) {
    const out = [];
    for (const id of ids || []) {
        if (typeof id === 'string' && UUID_RE.test(id)) out.push(id);
        if (out.length >= MAX_DB_EXCLUDE_IDS) break;
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEEN HISTORY (the exclusion list)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Walk the user's ENTIRE 60-day question history, newest first.
 *
 * Cross-mode by design: the product promise is per-player, not per-mode, and
 * the table's UNIQUE(user_id, question_id) constraint makes per-mode scoping
 * structurally impossible anyway (upserts overwrite the mode column).
 *
 * @param {object} supabase
 * @param {string|null} userId
 * @param {object} [opts]
 * @param {number} [opts.windowDays=60]
 * @param {number} [opts.maxRows=12000]
 * @returns {Promise<{ids: string[], rank: Map<string, number>, truncated: boolean, ok: boolean}>}
 *          `ids` newest-first; `rank` maps id -> 0-based recency rank
 *          (0 = seen most recently). `ok:false` means the lookup failed and
 *          the caller should treat the no-repeat guarantee as unverified.
 */
export async function getSeenHistory(supabase, userId, opts = {}) {
    const empty = { ids: [], rank: new Map(), truncated: false, ok: true };
    if (!supabase || !userId) return empty;

    const windowDays = Number.isFinite(opts.windowDays) && opts.windowDays > 0
        ? opts.windowDays
        : NO_REPEAT_WINDOW_DAYS;
    const maxRows = Number.isFinite(opts.maxRows) && opts.maxRows > 0
        ? Math.min(opts.maxRows, HISTORY_MAX_ROWS)
        : HISTORY_MAX_ROWS;
    const since = getNoRepeatWindowStart(windowDays);

    const ids = [];
    const rank = new Map();
    let truncated = false;

    try {
        let from = 0;
        while (from < maxRows) {
            const to = Math.min(from + HISTORY_PAGE_SIZE, maxRows) - 1;

            const { data, error } = await supabase
                .from('trivia_user_question_history')
                .select('question_id')
                .eq('user_id', userId)
                .gte('seen_at', since)
                // Ordered so paging is stable AND so the returned list carries
                // recency information (index 0 = most recently seen). The
                // graceful-degradation path in filterAndShuffle depends on it.
                .order('seen_at', { ascending: false })
                .order('question_id', { ascending: false })
                .range(from, to);

            if (error) {
                // Previously this error was destructured away entirely, so an
                // RLS/network failure silently disabled the whole no-repeat
                // system with zero signal.
                console.warn('[triviaQuestionLoader] seen-history query failed:', error.message || error);
                return { ids, rank, truncated, ok: false };
            }

            const rows = data || [];
            // Terminal condition is an EMPTY page, and we advance by the rows
            // actually returned — a PostgREST instance with a max-rows cap
            // below HISTORY_PAGE_SIZE would otherwise look like "end of data"
            // and silently truncate the exclusion list.
            if (rows.length === 0) return { ids, rank, truncated: false, ok: true };

            for (const row of rows) {
                const id = row?.question_id;
                if (!id || rank.has(id)) continue;
                rank.set(id, ids.length);
                ids.push(id);
            }

            from += rows.length;
        }
        // We hit the ceiling without exhausting the window.
        truncated = true;
        console.warn(
            `[triviaQuestionLoader] seen-history truncated at ${maxRows} rows for user ${userId} — ` +
            'pool depth may be insufficient for the 60-day guarantee.'
        );
    } catch (e) {
        console.warn('[triviaQuestionLoader] Failed to load seen history:', e?.message || e);
        return { ids, rank, truncated, ok: false };
    }

    return { ids, rank, truncated, ok: true };
}

/**
 * IDs of every question the user has seen in the last 60 days, ACROSS ALL
 * MODES, ordered most-recently-seen first.
 *
 * @param {object} supabase
 * @param {string|null} userId
 * @param {number} [limit] - LEGACY. Historically a hard cap (200) that broke
 *        the guarantee. It is now treated as a FLOOR: the full window is
 *        always walked, up to the internal 12,000-row ceiling.
 * @param {string} [_deprecatedMode] - LEGACY, ignored. Exclusion is global by
 *        design; keeping the parameter avoids touching all 8 call sites.
 * @returns {Promise<string[]>} newest-first ids to exclude
 */
export async function getRecentlySeenIds(supabase, userId, limit = 0, _deprecatedMode = null) {
    if (!userId) return [];
    const maxRows = Math.max(Number.isFinite(limit) && limit > 0 ? limit : 0, HISTORY_MAX_ROWS);
    const { ids } = await getSeenHistory(supabase, userId, { maxRows });
    return ids;
}

/**
 * Same as getRecentlySeenIds but returns a Set for O(1) membership tests.
 * @returns {Promise<Set<string>>}
 */
export async function getRecentlySeenSet(supabase, userId, opts = {}) {
    const { ids } = await getSeenHistory(supabase, userId, opts);
    return new Set(ids);
}

/**
 * Record served questions in the user's history so the no-repeat window
 * actually accumulates. Safe to call fire-and-forget.
 *
 * @param {object} supabase
 * @param {string} userId
 * @param {Array<string|{id:string}>} questions - ids or question rows
 * @param {string} [mode] - stored for analytics only (never used to scope reads)
 * @param {object} [opts]
 * @param {boolean} [opts.wasCorrect]
 * @returns {Promise<number>} number of rows attempted
 */
export async function recordQuestionsSeen(supabase, userId, questions, mode = null, opts = {}) {
    if (!supabase || !userId || !Array.isArray(questions) || questions.length === 0) return 0;

    const seenAt = new Date().toISOString();
    const seen = new Set();
    const rows = [];
    for (const q of questions) {
        const id = typeof q === 'string' ? q : q?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        rows.push({
            user_id: userId,
            question_id: id,
            seen_at: seenAt,
            mode: mode || null,
            ...(typeof opts.wasCorrect === 'boolean' ? { was_correct: opts.wasCorrect } : {}),
        });
    }
    if (rows.length === 0) return 0;

    try {
        const { error } = await supabase
            .from('trivia_user_question_history')
            .upsert(rows, { onConflict: 'user_id,question_id' });
        if (error) {
            console.warn('[triviaQuestionLoader] failed to record seen history:', error.message || error);
            return 0;
        }
    } catch (e) {
        console.warn('[triviaQuestionLoader] failed to record seen history:', e?.message || e);
        return 0;
    }
    return rows.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// POOL FETCHING
// ═══════════════════════════════════════════════════════════════════════════

function applyPoolFilters(query, { category, difficulty, minQuality }) {
    let q = query;
    if (Array.isArray(category) && category.length > 0) q = q.in('category', category);
    else if (category && !Array.isArray(category)) q = q.eq('category', category);
    if (Array.isArray(difficulty) && difficulty.length > 0) q = q.in('difficulty', difficulty);
    else if (difficulty && !Array.isArray(difficulty)) q = q.eq('difficulty', difficulty);
    if (Number.isFinite(minQuality)) q = q.gte('quality_score', minQuality);
    return q;
}

/**
 * Columns served to gameplay. `*` used to ship correct_index AND explanation
 * for every question in the pool; the answer key is still needed by the
 * current client-side scoring flow, but selecting explicitly stops new
 * columns (embeddings, internal audit fields) leaking to the browser.
 */
const POOL_COLUMNS =
    'id, category, difficulty, question, options, correct_index, explanation, quality_score';

const POOL_COLUMNS_NO_ANSWER = 'id, category, difficulty, question, options, quality_score';

/**
 * Randomized pool fetcher. Counts the matching pool, picks a random offset,
 * fetches that page. Optionally pushes the quality floor and the seen-id
 * exclusion into the DB, and retries with fresh offsets when a page comes
 * back mostly-seen (the old single-page sample silently reintroduced repeats
 * for heavy players even when thousands of unseen questions existed).
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {string|string[]} [opts.category]
 * @param {string|string[]} [opts.difficulty]
 * @param {number} [opts.pageSize=200]
 * @param {number} [opts.minQuality] - push `quality_score >= n` into the query
 * @param {string[]|Set<string>} [opts.excludeIds] - seen ids; up to 300 are
 *        pushed into the query as `id not.in.(...)`
 * @param {number} [opts.attempts=1] - extra random pages to merge when the
 *        first page yields fewer than `opts.want` usable rows
 * @param {number} [opts.want=0] - target usable rows (drives retries)
 * @param {boolean} [opts.withoutAnswers=false] - omit correct_index/explanation
 * @returns {Promise<object[]>} trivia_questions rows
 */
export async function fetchRandomQuestionPool(supabase, opts = {}) {
    const {
        category,
        difficulty,
        pageSize = 200,
        minQuality,
        attempts = 1,
        want = 0,
        withoutAnswers = false,
    } = opts;

    const excludeSet = toIdSet(opts.excludeIds);
    const dbExclude = safeUuids(excludeSet.size > 0 ? Array.from(excludeSet) : []);
    const filters = { category, difficulty, minQuality };

    // Count first so the random offset lands inside the pool.
    // The exclusion filter MUST match the data query below — computing the
    // offset from the unfiltered count let the random offset land past the
    // end of the filtered set, returning empty pages to exactly the heavy
    // players who had the most excluded ids.
    let countQ = supabase.from('trivia_questions').select('id', { count: 'exact', head: true });
    countQ = applyPoolFilters(countQ, filters);
    if (dbExclude.length > 0) countQ = countQ.not('id', 'in', `(${dbExclude.join(',')})`);

    const { count: total, error: cErr } = await countQ;
    if (cErr) {
        console.warn('[triviaQuestionLoader] count query failed:', cErr.message);
        return [];
    }
    const totalCount = total || 0;
    if (totalCount === 0) return [];

    const columns = withoutAnswers ? POOL_COLUMNS_NO_ANSWER : POOL_COLUMNS;
    const maxOffset = Math.max(0, totalCount - pageSize);
    const target = want > 0 ? want : 0;
    const maxAttempts = Math.max(1, Math.min(attempts, 4));

    const merged = [];
    const seenRowIds = new Set();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const offset = Math.floor(Math.random() * (maxOffset + 1));

        let dataQ = supabase.from('trivia_questions').select(columns);
        dataQ = applyPoolFilters(dataQ, filters);
        if (dbExclude.length > 0) dataQ = dataQ.not('id', 'in', `(${dbExclude.join(',')})`);
        // Stable ORDER BY — without it Postgres page boundaries are undefined
        // and consecutive .range() calls can overlap or skip rows arbitrarily.
        dataQ = dataQ.order('id', { ascending: true }).range(offset, offset + pageSize - 1);

        const { data, error } = await dataQ;
        if (error) {
            console.warn('[triviaQuestionLoader] data fetch failed:', error.message);
            break;
        }
        for (const row of data || []) {
            if (!row?.id || seenRowIds.has(row.id)) continue;
            seenRowIds.add(row.id);
            merged.push(row);
        }

        if (target === 0) break;
        const usable = merged.filter(q => !excludeSet.has(q.id)).length;
        if (usable >= target) break;
        if (totalCount <= pageSize) break; // whole pool already fetched
    }

    return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER + SHUFFLE (graceful degradation lives here)
// ═══════════════════════════════════════════════════════════════════════════

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };

/**
 * Filter out recently-seen questions and shuffle the result.
 *
 * Degradation ladder (never a hard failure, never a needless repeat):
 *   1. unseen questions above the quality floor  — shuffled
 *   2. + seen questions above the quality floor  — OLDEST-SEEN FIRST, so a
 *        thin pool replays what the player saw 8 weeks ago, not yesterday
 *   3. + everything else (below the quality floor) — pool-health emergency
 *
 * @param {object[]} questions - rows from Supabase
 * @param {string[]|Set<string>} excludeIds - from getRecentlySeenIds. When an
 *        ARRAY is passed its order is meaningful: index 0 = most recently seen.
 * @param {number} [minFallback=10] - target count driving the degradation ladder
 * @param {object} [opts]
 * @param {number} [opts.minQualityScore] - gameplay quality floor
 * @param {boolean} [opts.preferHighQuality] - bubble quality 9-10 to the front
 * @param {string[]|Set<string>} [opts.sessionExcludeIds] - hard exclusion for
 *        ids already loaded in THIS session (endless/survival refills). These
 *        are NEVER re-admitted by the fallback ladder.
 * @param {boolean} [opts.difficultyCurve] - order easy -> medium -> hard after
 *        shuffling, so every mode can share one ramp implementation.
 * @returns {object[]} ordered array of questions
 */
export function filterAndShuffle(questions, excludeIds, minFallback = 10, opts = {}) {
    if (!Array.isArray(questions) || questions.length === 0) return [];

    // Recency rank: index in the ordered excludeIds array (0 = most recent).
    const rank = new Map();
    let excludeSet;
    if (Array.isArray(excludeIds)) {
        excludeIds.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
        excludeSet = new Set(excludeIds);
    } else {
        excludeSet = toIdSet(excludeIds);
    }

    const sessionSet = toIdSet(opts.sessionExcludeIds);

    // Hard exclusion first — questions already served in this sitting must
    // never come back, not even through the emergency fallback.
    const pool = sessionSet.size > 0
        ? questions.filter(q => q && !sessionSet.has(q.id))
        : questions.filter(Boolean);
    if (pool.length === 0) return [];

    const qualityFloor = Number.isFinite(opts.minQualityScore) ? opts.minQualityScore : null;
    const passesQuality = q => qualityFloor == null
        || typeof q.quality_score !== 'number'
        || q.quality_score >= qualityFloor;

    const unseen = [];
    const seen = [];
    const belowFloor = [];
    for (const q of pool) {
        if (!passesQuality(q)) { belowFloor.push(q); continue; }
        if (excludeSet.has(q.id)) seen.push(q);
        else unseen.push(q);
    }

    shuffleInPlace(unseen);

    // Presentation transforms are applied WITHIN each degradation tier, never
    // across tiers — otherwise a quality or difficulty sort would pull
    // recently-seen questions back ahead of unseen ones.
    const decorate = (list) => {
        let out = list;
        if (opts.preferHighQuality) {
            // Stable sort: keeps shuffle randomness inside each quality bucket
            // while pushing 9-10 rows toward the front.
            out = out.slice().sort((a, b) => (b.quality_score ?? 5) - (a.quality_score ?? 5));
        }
        if (opts.difficultyCurve) {
            out = out.slice().sort((a, b) =>
                (DIFFICULTY_ORDER[a?.difficulty] ?? 1) - (DIFFICULTY_ORDER[b?.difficulty] ?? 1)
            );
        }
        return out;
    };

    const wanted = Number.isFinite(minFallback) && minFallback > 0 ? minFallback : 0;
    let result = decorate(unseen);

    if (result.length < wanted && seen.length > 0) {
        // Oldest-seen first. Unranked (shouldn't happen) sorts as "very old".
        const oldestFirst = seen
            .slice()
            .sort((a, b) => (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER));
        console.warn(
            `[triviaQuestionLoader] only ${result.length} unseen questions available for a request of ${wanted}; ` +
            'replaying oldest-seen questions to fill the gap.'
        );
        result = result.concat(oldestFirst);
    }

    // Pool-health emergency ladder — but NEVER resurrect quarantined
    // questions: qs=2 is audit-flagged-wrong and qs=3 is report-demoted
    // (3 players said the answer is wrong). Serving those "in an emergency"
    // is exactly the moment players lose trust. Only unclear-English (4)
    // and low-quality (5) rows are eligible as last-resort filler.
    const emergencyPool = belowFloor.filter(q => (q.quality_score ?? 5) >= 4);
    if (result.length < wanted && emergencyPool.length > 0) {
        // Pool-health emergency — surfaced via /api/admin/trivia-pool-status.
        console.warn(
            `[triviaQuestionLoader] pool exhausted above quality floor (${result.length}/${wanted}); ` +
            'falling back to below-floor (but never quarantined) questions.'
        );
        result = result.concat(shuffleInPlace(emergencyPool));
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// POOL DEPTH REPORTING — make the shortfall visible instead of silent
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Report how deep the servable pool is versus what the 60-day guarantee costs.
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {string|null} [opts.userId] - when given, also counts what THIS user
 *        has already burned inside the window
 * @param {string|string[]} [opts.category]
 * @param {string|string[]} [opts.difficulty]
 * @param {number} [opts.minQuality=6]
 * @param {number} [opts.questionsPerDay=20] - this mode's consumption rate
 * @param {number} [opts.windowDays=60]
 * @returns {Promise<{total:number,usable:number,seenByUser:number,unseenForUser:number,
 *                    required:number,shortfall:number,daysOfCoverage:number,
 *                    meetsGuarantee:boolean,truncated:boolean}>}
 */
export async function getPoolDepthReport(supabase, opts = {}) {
    const {
        userId = null,
        category,
        difficulty,
        minQuality = DEFAULT_QUALITY_FLOOR,
        questionsPerDay = 20,
        windowDays = NO_REPEAT_WINDOW_DAYS,
    } = opts;

    const report = {
        total: 0,
        usable: 0,
        seenByUser: 0,
        unseenForUser: 0,
        required: Math.max(0, Math.round(questionsPerDay * windowDays)),
        shortfall: 0,
        daysOfCoverage: 0,
        meetsGuarantee: false,
        truncated: false,
    };
    if (!supabase) return report;

    try {
        let totalQ = supabase.from('trivia_questions').select('id', { count: 'exact', head: true });
        totalQ = applyPoolFilters(totalQ, { category, difficulty });

        let usableQ = supabase.from('trivia_questions').select('id', { count: 'exact', head: true });
        usableQ = applyPoolFilters(usableQ, { category, difficulty, minQuality });

        const [{ count: total }, { count: usable }] = await Promise.all([totalQ, usableQ]);
        report.total = total || 0;
        report.usable = usable || 0;
    } catch (e) {
        console.warn('[triviaQuestionLoader] pool depth query failed:', e?.message || e);
        return report;
    }

    if (userId) {
        const { ids, truncated } = await getSeenHistory(supabase, userId, { windowDays });
        report.seenByUser = ids.length;
        report.truncated = truncated;
    }

    report.unseenForUser = Math.max(0, report.usable - report.seenByUser);
    report.shortfall = Math.max(0, report.required - report.usable);
    report.daysOfCoverage = questionsPerDay > 0 ? Math.floor(report.usable / questionsPerDay) : 0;
    report.meetsGuarantee = report.usable >= report.required;
    return report;
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE-CALL ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load `count` questions for a user with the full no-repeat pipeline applied:
 * global 60-day exclusion, DB-side quality floor, DB-side exclusion of the
 * most recent ids, multi-page sampling, then ordered graceful degradation.
 *
 * Prefers the server-side `get_unseen_questions` RPC when the database
 * provides it (anti-join, no ID list downloaded); falls back transparently.
 *
 * @param {object} supabase
 * @param {object} opts
 * @param {string|null} opts.userId
 * @param {string|string[]} [opts.category]
 * @param {string|string[]} [opts.difficulty]
 * @param {number} [opts.count=20]
 * @param {number} [opts.minQuality=6]
 * @param {number} [opts.pageSize] - defaults to max(200, count * 5)
 * @param {boolean} [opts.preferHighQuality]
 * @param {boolean} [opts.difficultyCurve]
 * @param {string[]|Set<string>} [opts.sessionExcludeIds]
 * @returns {Promise<{questions: object[], excludeIds: string[], degraded: boolean, historyOk: boolean}>}
 */
export async function loadQuestionsForUser(supabase, opts = {}) {
    const {
        userId = null,
        category,
        difficulty,
        count = 20,
        minQuality = DEFAULT_QUALITY_FLOOR,
        preferHighQuality = false,
        difficultyCurve = false,
        sessionExcludeIds,
    } = opts;
    const pageSize = Number.isFinite(opts.pageSize) && opts.pageSize > 0
        ? opts.pageSize
        : Math.max(200, count * 5);

    // 1. Try the server-side anti-join if the database exposes it.
    if (userId && typeof supabase?.rpc === 'function') {
        try {
            const { data, error } = await supabase.rpc('get_unseen_questions', {
                p_user: userId,
                p_categories: Array.isArray(category) ? category : (category ? [category] : null),
                p_count: count,
            });
            if (!error && Array.isArray(data) && data.length >= count) {
                return { questions: data.slice(0, count), excludeIds: [], degraded: false, historyOk: true };
            }
        } catch (_e) {
            // RPC absent (PGRST202) or signature mismatch — fall through.
        }
    }

    // 2. Client-side pipeline.
    const { ids: excludeIds, ok: historyOk } = await getSeenHistory(supabase, userId, {});
    const pool = await fetchRandomQuestionPool(supabase, {
        category,
        difficulty,
        pageSize,
        minQuality,
        excludeIds,
        want: count,
        attempts: 3,
    });

    const ordered = filterAndShuffle(pool, excludeIds, count, {
        minQualityScore: minQuality,
        preferHighQuality,
        difficultyCurve,
        sessionExcludeIds,
    });

    const questions = ordered.slice(0, count);
    const excludeSet = new Set(excludeIds);
    const degraded = questions.some(q => excludeSet.has(q.id)) || questions.length < count;

    return { questions, excludeIds, degraded, historyOk };
}
