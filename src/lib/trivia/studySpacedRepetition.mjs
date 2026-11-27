/**
 * Deterministic Leitner Spaced-Repetition & Zero-Reward Miss Drill Helpers
 *
 * Pure isomorphic module (Node + browser). Operates strictly over already-settled
 * missed questions returned by GET /api/trivia/study-misses and persists client-side
 * Leitner box progress in account-scoped localStorage. Never calls any reward,
 * wager, or session-grading API.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const LEITNER_MIN_BOX = 1;
export const LEITNER_MAX_BOX = 4;

export const LEITNER_INTERVAL_DAYS = Object.freeze({
    1: 0,
    2: 1,
    3: 3,
    4: 7,
});

export const STUDY_SRS_STORAGE_PREFIX = 'smarter_trivia_study_srs_v1:';

export function getStudySrsStorageKey(userId) {
    const cleanId = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanId) return null;
    return `${STUDY_SRS_STORAGE_PREFIX}${cleanId}`;
}

export function normalizeSrsEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const rawBox = Number(raw.box);
    const box = Number.isInteger(rawBox)
        ? Math.min(Math.max(rawBox, LEITNER_MIN_BOX), LEITNER_MAX_BOX)
        : LEITNER_MIN_BOX;
    const nextDueAt = Number.isFinite(Number(raw.nextDueAt)) ? Number(raw.nextDueAt) : 0;
    const lastReviewedAt = Number.isFinite(Number(raw.lastReviewedAt)) ? Number(raw.lastReviewedAt) : 0;
    const correctStreak = Number.isInteger(Number(raw.correctStreak)) && Number(raw.correctStreak) >= 0
        ? Number(raw.correctStreak)
        : 0;
    return {
        box,
        nextDueAt,
        lastReviewedAt,
        correctStreak,
    };
}

export function sanitizeStudySrsState(rawState) {
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return {};
    const clean = {};
    for (const [questionId, entry] of Object.entries(rawState)) {
        if (typeof questionId !== 'string' || !questionId.trim()) continue;
        const normalized = normalizeSrsEntry(entry);
        if (normalized) {
            clean[questionId] = normalized;
        }
    }
    return clean;
}

export function loadStudySrsState(userId, storage = null) {
    const key = getStudySrsStorageKey(userId);
    if (!key) return {};
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store || typeof store.getItem !== 'function') return {};
    try {
        const raw = store.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return sanitizeStudySrsState(parsed);
    } catch (_err) {
        return {};
    }
}

export function saveStudySrsState(userId, state, storage = null) {
    const key = getStudySrsStorageKey(userId);
    if (!key) return false;
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store || typeof store.setItem !== 'function') return false;
    try {
        const clean = sanitizeStudySrsState(state);
        store.setItem(key, JSON.stringify(clean));
        return true;
    } catch (_err) {
        return false;
    }
}

/**
 * Pure Leitner state transition for a single reviewed question.
 * - gotIt === true: increments box up to 4 and schedules nextDueAt by box interval (1d, 3d, 7d).
 * - gotIt === false: resets to box 1 with nextDueAt = nowMs (due immediately).
 */
export function recordStudyReview(state, questionId, gotIt, nowMs = Date.now()) {
    const safeState = sanitizeStudySrsState(state);
    const qid = typeof questionId === 'string' ? questionId.trim() : '';
    if (!qid) return safeState;

    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const prev = safeState[qid] || {
        box: LEITNER_MIN_BOX,
        nextDueAt: 0,
        lastReviewedAt: 0,
        correctStreak: 0,
    };

    const nextBox = gotIt === true
        ? Math.min(LEITNER_MAX_BOX, prev.box + 1)
        : LEITNER_MIN_BOX;
    const intervalDays = LEITNER_INTERVAL_DAYS[nextBox] ?? 0;
    const nextDueAt = gotIt === true
        ? now + intervalDays * MS_PER_DAY
        : now;

    return {
        ...safeState,
        [qid]: {
            box: nextBox,
            nextDueAt,
            lastReviewedAt: now,
            correctStreak: gotIt === true ? prev.correctStreak + 1 : 0,
        },
    };
}

export function isItemDueForReview(item, srsState, nowMs = Date.now()) {
    if (!item || !item.questionId) return false;
    const safeState = srsState && typeof srsState === 'object' ? srsState : {};
    const entry = normalizeSrsEntry(safeState[item.questionId]);
    if (!entry) return true;
    if (entry.box <= LEITNER_MIN_BOX) return true;
    return entry.nextDueAt <= nowMs;
}

export function isItemMastered(item, srsState, nowMs = Date.now()) {
    if (!item || !item.questionId) return false;
    const safeState = srsState && typeof srsState === 'object' ? srsState : {};
    const entry = normalizeSrsEntry(safeState[item.questionId]);
    if (!entry) return false;
    return entry.box >= LEITNER_MAX_BOX && entry.nextDueAt > nowMs;
}

export function getLeitnerBoxLabel(entry, nowMs = Date.now()) {
    const normalized = normalizeSrsEntry(entry);
    if (!normalized) return 'Box 1 (Due Now)';
    if (normalized.box >= LEITNER_MAX_BOX && normalized.nextDueAt > nowMs) {
        return 'Box 4 (Mastered - 7d)';
    }
    if (normalized.box <= LEITNER_MIN_BOX || normalized.nextDueAt <= nowMs) {
        return `Box ${normalized.box} (Due Now)`;
    }
    const days = LEITNER_INTERVAL_DAYS[normalized.box] ?? 0;
    return `Box ${normalized.box} (${days}d Interval)`;
}

function compareDeckItems(a, b, safeState, nowMs, weakestCategory) {
    const aDue = isItemDueForReview(a, safeState, nowMs) ? 0 : 1;
    const bDue = isItemDueForReview(b, safeState, nowMs) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;

    const aWeak = weakestCategory && a.category === weakestCategory ? 0 : 1;
    const bWeak = weakestCategory && b.category === weakestCategory ? 0 : 1;
    if (aWeak !== bWeak) return aWeak - bWeak;

    const aBox = normalizeSrsEntry(safeState[a.questionId])?.box ?? LEITNER_MIN_BOX;
    const bBox = normalizeSrsEntry(safeState[b.questionId])?.box ?? LEITNER_MIN_BOX;
    if (aBox !== bBox) return aBox - bBox;

    const aMiss = Number(a.missCount) || 1;
    const bMiss = Number(b.missCount) || 1;
    if (aMiss !== bMiss) return bMiss - aMiss;

    const aId = String(a.questionId || '');
    const bId = String(b.questionId || '');
    return aId.localeCompare(bId);
}

/**
 * Partitions missed questions into Leitner study buckets:
 * - dueToday: box 1 or nextDueAt <= nowMs
 * - weakestCategory / weakestCategoryItems: category with highest total misses
 * - mastered: box 4 and not currently due
 * - counts: { dueToday, weakestCategory, all, mastered }
 */
export function partitionStudyDeck(items, srsState, nowMs = Date.now()) {
    const list = Array.isArray(items) ? items.filter((item) => item && typeof item.questionId === 'string') : [];
    const safeState = sanitizeStudySrsState(srsState);
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

    const categoryTotals = new Map();
    for (const item of list) {
        const cat = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null;
        if (!cat) continue;
        const prev = categoryTotals.get(cat) || { missSum: 0, itemCount: 0 };
        prev.missSum += Math.max(1, Number(item.missCount) || 1);
        prev.itemCount += 1;
        categoryTotals.set(cat, prev);
    }

    let weakestCategory = null;
    let bestStats = null;
    for (const [cat, stats] of categoryTotals.entries()) {
        if (
            !bestStats
            || stats.missSum > bestStats.missSum
            || (stats.missSum === bestStats.missSum && stats.itemCount > bestStats.itemCount)
            || (stats.missSum === bestStats.missSum && stats.itemCount === bestStats.itemCount && cat.localeCompare(weakestCategory) < 0)
        ) {
            weakestCategory = cat;
            bestStats = stats;
        }
    }

    const dueToday = list
        .filter((item) => isItemDueForReview(item, safeState, now))
        .sort((a, b) => compareDeckItems(a, b, safeState, now, weakestCategory));

    const weakestCategoryItems = weakestCategory
        ? list
            .filter((item) => item.category === weakestCategory)
            .sort((a, b) => compareDeckItems(a, b, safeState, now, weakestCategory))
        : [];

    const mastered = list
        .filter((item) => isItemMastered(item, safeState, now))
        .sort((a, b) => String(a.questionId).localeCompare(String(b.questionId)));

    return {
        dueToday,
        weakestCategory,
        weakestCategoryItems,
        mastered,
        counts: {
            dueToday: dueToday.length,
            weakestCategory: weakestCategoryItems.length,
            all: list.length,
            mastered: mastered.length,
        },
    };
}

export function isDrillableStudyItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.questionId !== 'string' || !item.questionId.trim()) return false;
    if (typeof item.question !== 'string' || !item.question.trim()) return false;
    if (!Array.isArray(item.options) || item.options.length < 2) return false;
    if (!item.options.every((opt) => typeof opt === 'string' && opt.trim().length > 0)) return false;
    if (!Number.isInteger(item.correctIndex)) return false;
    if (item.correctIndex < 0 || item.correctIndex >= item.options.length) return false;
    return true;
}

/**
 * Selects up to `limit` valid drill questions prioritized by due status, weakest category,
 * lowest Leitner box, and highest miss count. Pure and deterministic.
 */
export function buildMissDrillQuestions(items, srsState, limit = 10, nowMs = Date.now()) {
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 10;
    if (safeLimit === 0) return [];

    const validItems = (Array.isArray(items) ? items : []).filter(isDrillableStudyItem);
    if (validItems.length === 0) return [];

    const safeState = sanitizeStudySrsState(srsState);
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const { weakestCategory } = partitionStudyDeck(validItems, safeState, now);

    return validItems
        .slice()
        .sort((a, b) => compareDeckItems(a, b, safeState, now, weakestCategory))
        .slice(0, safeLimit);
}
