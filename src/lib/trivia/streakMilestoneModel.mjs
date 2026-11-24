/**
 * Pure Streak Freeze & Milestone progression helpers.
 * No DOM, browser globals, or network dependencies so unit tests can import directly.
 */

export const STREAK_MILESTONES = Object.freeze([7, 14, 30, 100]);
export const STREAK_FREEZE_COST_DIAMONDS = 25;
export const STREAK_FREEZE_MAX_QUANTITY = 5;
export const STREAK_FREEZE_REQUEST_KEY_RE = /^[A-Za-z0-9:_-]{8,128}$/;

/**
 * Compute milestone progression for a player's current Daily Trivia streak.
 * Milestones are anchored at 7, 14, 30, and 100 days.
 */
export function computeStreakMilestoneProgress(currentStreak) {
    const streak = Number.isFinite(Number(currentStreak))
        ? Math.max(0, Math.floor(Number(currentStreak)))
        : 0;

    const reachedMilestones = STREAK_MILESTONES.filter((day) => streak >= day);
    const nextMilestone = STREAK_MILESTONES.find((day) => streak < day) ?? null;
    const previousMilestone = reachedMilestones.length > 0
        ? reachedMilestones[reachedMilestones.length - 1]
        : 0;

    if (nextMilestone === null) {
        return {
            currentStreak: streak,
            previousMilestone,
            nextMilestone: null,
            daysRemaining: 0,
            progressPct: 100,
            reachedMilestones,
            allMilestonesReached: true,
        };
    }

    const daysRemaining = Math.max(0, nextMilestone - streak);
    const progressPct = Math.min(100, Math.max(0, Math.round((streak / nextMilestone) * 100)));

    return {
        currentStreak: streak,
        previousMilestone,
        nextMilestone,
        daysRemaining,
        progressPct,
        reachedMilestones,
        allMilestonesReached: false,
    };
}

/**
 * Generate a client idempotency key for POST /api/trivia/streak-freeze.
 * Uses crypto.randomUUID() when available and falls back to a safe token matching
 * STREAK_FREEZE_REQUEST_KEY_RE.
 */
export function createStreakFreezeRequestKey(cryptoLike = globalThis?.crypto) {
    if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
        const uuid = String(cryptoLike.randomUUID()).trim();
        if (STREAK_FREEZE_REQUEST_KEY_RE.test(uuid)) {
            return `sf_${uuid}`;
        }
    }
    const ts = Date.now().toString(36);
    const randA = Math.random().toString(36).slice(2, 10);
    const randB = Math.random().toString(36).slice(2, 10);
    return `sf_${ts}_${randA}_${randB}`;
}

/**
 * Normalize an authoritative GET or POST payload from /api/trivia/streak-freeze.
 */
export function normalizeStreakFreezePayload(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const quantity = Number.isFinite(Number(raw.quantity))
        ? Math.max(0, Math.floor(Number(raw.quantity)))
        : 0;
    const maxQuantity = Number.isFinite(Number(raw.maxQuantity)) && Number(raw.maxQuantity) > 0
        ? Math.floor(Number(raw.maxQuantity))
        : STREAK_FREEZE_MAX_QUANTITY;
    const costDiamonds = Number.isFinite(Number(raw.costDiamonds)) && Number(raw.costDiamonds) > 0
        ? Math.floor(Number(raw.costDiamonds))
        : STREAK_FREEZE_COST_DIAMONDS;
    const balance = Number.isFinite(Number(raw.balance))
        ? Math.max(0, Math.floor(Number(raw.balance)))
        : null;
    const currentStreak = Number.isFinite(Number(raw.currentStreak))
        ? Math.max(0, Math.floor(Number(raw.currentStreak)))
        : null;
    const bestStreak = Number.isFinite(Number(raw.bestStreak))
        ? Math.max(0, Math.floor(Number(raw.bestStreak)))
        : null;

    return {
        itemType: typeof raw.itemType === 'string' && raw.itemType ? raw.itemType : 'streak_shield',
        quantity,
        maxQuantity,
        costDiamonds,
        balance,
        currentStreak,
        bestStreak,
        replayed: raw.replayed === true,
        diamondsCharged: Number.isFinite(Number(raw.diamondsCharged))
            ? Math.max(0, Math.floor(Number(raw.diamondsCharged)))
            : 0,
        referenceId: typeof raw.referenceId === 'string' && raw.referenceId.trim()
            ? raw.referenceId.trim()
            : null,
        journalId: typeof raw.journalId === 'string' && raw.journalId.trim()
            ? raw.journalId.trim()
            : null,
    };
}
