/**
 * Pure Streak Freeze & Milestone progression helpers.
 * No DOM, browser globals, or network dependencies so unit tests can import directly.
 */

export const STREAK_MILESTONES = Object.freeze([7, 14, 30, 100]);
export const STREAK_MILESTONE_REWARDS = Object.freeze({
    7: 25,
    14: 50,
    30: 150,
    100: 500,
});
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
 * Compute unlocked & unclaimed milestone day tiers given an effective streak
 * (max of currentStreak and bestStreak) and existing claimed milestone rows.
 */
export function computeClaimableMilestones(effectiveStreak, claimedMilestones = []) {
    const streak = Number.isFinite(Number(effectiveStreak))
        ? Math.max(0, Math.floor(Number(effectiveStreak)))
        : 0;
    const claimedSet = new Set(
        (Array.isArray(claimedMilestones) ? claimedMilestones : [])
            .map((item) => Number(typeof item === 'object' && item !== null ? item.milestoneDays ?? item.milestone_days : item))
            .filter((day) => STREAK_MILESTONES.includes(day)),
    );
    return STREAK_MILESTONES.filter((day) => streak >= day && !claimedSet.has(day));
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
 * Generate a client idempotency key for POST /api/trivia/streak-freeze (action: claim_milestone).
 */
export function createStreakMilestoneRequestKey(milestoneDays, cryptoLike = globalThis?.crypto) {
    const day = STREAK_MILESTONES.includes(Number(milestoneDays)) ? Number(milestoneDays) : 7;
    if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
        const uuid = String(cryptoLike.randomUUID()).trim();
        const candidate = `ms_${day}_${uuid}`;
        if (STREAK_FREEZE_REQUEST_KEY_RE.test(candidate)) {
            return candidate;
        }
    }
    const ts = Date.now().toString(36);
    const randA = Math.random().toString(36).slice(2, 10);
    return `ms_${day}_${ts}_${randA}`;
}

/**
 * Normalize claimed milestone entries from API responses.
 */
function normalizeClaimedMilestones(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    const out = [];
    for (const item of rawList) {
        const day = Number(typeof item === 'object' && item !== null ? item.milestoneDays ?? item.milestone_days : item);
        if (!STREAK_MILESTONES.includes(day) || seen.has(day)) continue;
        seen.add(day);
        out.push({
            milestoneDays: day,
            rewardDiamonds: Number.isFinite(Number(item?.rewardDiamonds ?? item?.reward_diamonds))
                ? Math.max(0, Math.floor(Number(item?.rewardDiamonds ?? item?.reward_diamonds)))
                : STREAK_MILESTONE_REWARDS[day],
            journalId: typeof (item?.journalId ?? item?.journal_id) === 'string' && String(item?.journalId ?? item?.journal_id).trim()
                ? String(item?.journalId ?? item?.journal_id).trim()
                : null,
            referenceId: typeof (item?.referenceId ?? item?.reference_id) === 'string' && String(item?.referenceId ?? item?.reference_id).trim()
                ? String(item?.referenceId ?? item?.reference_id).trim()
                : null,
            claimedAt: typeof (item?.claimedAt ?? item?.claimed_at) === 'string' && String(item?.claimedAt ?? item?.claimed_at).trim()
                ? String(item?.claimedAt ?? item?.claimed_at).trim()
                : null,
        });
    }
    return out.sort((a, b) => a.milestoneDays - b.milestoneDays);
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
    const claimedMilestones = normalizeClaimedMilestones(raw.claimedMilestones);
    const effectiveStreak = Math.max(currentStreak ?? 0, bestStreak ?? 0);
    const claimableMilestones = Array.isArray(raw.claimableMilestones)
        ? raw.claimableMilestones
            .map((d) => Number(d))
            .filter((d) => STREAK_MILESTONES.includes(d))
            .sort((a, b) => a - b)
        : computeClaimableMilestones(effectiveStreak, claimedMilestones);

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
        claimedMilestones,
        claimableMilestones,
        lastFreezeConsumedDate: typeof raw.lastFreezeConsumedDate === 'string' && raw.lastFreezeConsumedDate.trim()
            ? raw.lastFreezeConsumedDate.trim()
            : null,
    };
}
