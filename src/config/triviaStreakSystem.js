/**
 * TRIVIA STREAK SYSTEM — Configuration and utilities
 * Manages streak multipliers, badges, tier rewards and streak protection.
 *
 * Icons are Lucide component NAMES, not emoji characters (repo rule: no bare
 * emoji in source — they break the SWC build when they reach JSX).
 */

// Streak tier thresholds and rewards
export const STREAK_TIERS = [
    {
        id: 'bronze',
        minDays: 1,
        maxDays: 6,
        multiplier: 1.0,
        badge: null,
        color: '#94a3b8',
        title: 'Getting Started'
    },
    {
        id: 'silver',
        minDays: 7,
        maxDays: 13,
        multiplier: 2.0,
        badge: 'Flame',
        color: '#60a5fa',
        title: 'Weekly Warrior',
        unlockReward: { type: 'weekly_chest', diamonds: 50 }
    },
    {
        id: 'gold',
        minDays: 14,
        maxDays: 29,
        multiplier: 2.5,
        badge: 'Dumbbell',
        color: '#fbbf24',
        title: 'Dedicated Mind',
        unlockReward: { type: 'badge', id: 'dedicated_mind' }
    },
    {
        id: 'platinum',
        minDays: 30,
        maxDays: 99,
        multiplier: 3.0,
        badge: 'Trophy',
        color: '#a78bfa',
        title: 'Iron Mind',
        unlockReward: { type: 'title', id: 'iron_mind', diamonds: 100 }
    },
    {
        id: 'diamond',
        minDays: 100,
        maxDays: Infinity,
        multiplier: 5.0,
        badge: 'Crown',
        color: '#00d4ff',
        title: 'Legendary Mind',
        unlockReward: { type: 'crown', id: 'legendary_crown', diamonds: 500 }
    }
];

// Special milestones that trigger celebrations
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 365];
const MILESTONE_SET = new Set(STREAK_MILESTONES);

// Index tiers by id once so tier lookups are O(1) rather than a reverse scan
// repeated three times per formatStreakDisplay() call.
const TIER_INDEX = new Map(STREAK_TIERS.map((t, i) => [t.id, i]));

/**
 * Get the current streak tier based on streak count
 * @param {number} streakDays
 * @returns {object} tier
 */
export function getStreakTier(streakDays) {
    if (!Number.isFinite(streakDays) || streakDays < 1) {
        return STREAK_TIERS[0];
    }

    for (let i = STREAK_TIERS.length - 1; i >= 0; i--) {
        if (streakDays >= STREAK_TIERS[i].minDays) {
            return STREAK_TIERS[i];
        }
    }

    return STREAK_TIERS[0];
}

/**
 * Get the next tier the user can unlock
 * @param {number|object} streakDaysOrTier - streak count, or an already
 *        resolved tier object (avoids recomputing it)
 */
export function getNextTier(streakDaysOrTier) {
    const currentTier = typeof streakDaysOrTier === 'object' && streakDaysOrTier
        ? streakDaysOrTier
        : getStreakTier(streakDaysOrTier);
    const currentIndex = TIER_INDEX.get(currentTier.id) ?? 0;

    if (currentIndex < STREAK_TIERS.length - 1) {
        return STREAK_TIERS[currentIndex + 1];
    }

    return null; // Already at max tier
}

/**
 * Calculate diamond reward with streak multiplier
 */
export function calculateRewardWithMultiplier(baseReward, streakDays) {
    const base = Number.isFinite(baseReward) && baseReward > 0 ? baseReward : 0;
    const tier = getStreakTier(streakDays);
    return Math.floor(base * tier.multiplier);
}

/**
 * Check if streak hits a milestone
 */
export function isStreakMilestone(streakDays) {
    return MILESTONE_SET.has(streakDays);
}

/**
 * Get days until next tier unlock
 * @param {number} streakDays
 * @param {object} [tier] - pre-resolved tier
 */
export function getDaysUntilNextTier(streakDays, tier) {
    const nextTier = getNextTier(tier || streakDays);
    if (!nextTier) return null;

    return Math.max(0, nextTier.minDays - (Number.isFinite(streakDays) ? streakDays : 0));
}

/**
 * Retention hook: what the player unlocks by coming back.
 * The data existed (getNextTier + getDaysUntilNextTier) but no surface used
 * it, so the strongest return-visit incentive in the system was invisible.
 *
 * @param {number} streakDays
 * @returns {{currentMultiplier:number,nextMultiplier:number|null,daysUntilNext:number|null,
 *           nextTitle:string|null,message:string|null}}
 */
export function getMultiplierPreview(streakDays) {
    const tier = getStreakTier(streakDays);
    const next = getNextTier(tier);
    if (!next) {
        return {
            currentMultiplier: tier.multiplier,
            nextMultiplier: null,
            daysUntilNext: null,
            nextTitle: null,
            message: null,
        };
    }
    const days = getDaysUntilNextTier(streakDays, tier);
    return {
        currentMultiplier: tier.multiplier,
        nextMultiplier: next.multiplier,
        daysUntilNext: days,
        nextTitle: next.title,
        message: days === 1
            ? `Play tomorrow for ${next.multiplier.toFixed(1)}x rewards`
            : `${days} more days for ${next.multiplier.toFixed(1)}x rewards`,
    };
}

/**
 * Streak shield item configuration.
 *
 * NOT YET CONSUMED: PrizeWheel hands out 'streak_shield' items, but no code
 * path spends one to preserve current_streak when a day is missed. Use
 * applyStreakShield() below from wherever the daily streak is recomputed, or
 * stop granting the item.
 */
export const STREAK_SHIELD = {
    id: 'streak_shield',
    name: 'Streak Shield',
    description: 'Protects Your Streak if You Miss One Day',
    cost: 50, // diamonds
    icon: 'Shield',
    maxOwned: 3,
    implemented: false,
};

/**
 * Pure decision helper for the streak-reset path.
 * Given the last play date, today, the current streak and how many unused
 * shields the user owns, decide the new streak and whether a shield is spent.
 *
 * @param {object} args
 * @param {string|null} args.lastPlayDate - 'YYYY-MM-DD'
 * @param {string} args.today - 'YYYY-MM-DD' (CST)
 * @param {number} args.currentStreak
 * @param {number} [args.shieldsOwned=0]
 * @returns {{newStreak:number, consumeShield:boolean, reason:string}}
 */
export function applyStreakShield({ lastPlayDate, today, currentStreak = 0, shieldsOwned = 0 }) {
    if (!lastPlayDate) return { newStreak: 1, consumeShield: false, reason: 'first_play' };
    if (lastPlayDate === today) return { newStreak: currentStreak, consumeShield: false, reason: 'already_played' };

    const last = new Date(`${lastPlayDate}T12:00:00Z`);
    const now = new Date(`${today}T12:00:00Z`);
    if (Number.isNaN(last.getTime()) || Number.isNaN(now.getTime())) {
        return { newStreak: 1, consumeShield: false, reason: 'unparseable_date' };
    }
    const gapDays = Math.round((now - last) / 86400000);

    if (gapDays <= 1) return { newStreak: currentStreak + 1, consumeShield: false, reason: 'continued' };
    if (gapDays === 2 && shieldsOwned > 0) {
        return { newStreak: currentStreak + 1, consumeShield: true, reason: 'shield_used' };
    }
    return { newStreak: 1, consumeShield: false, reason: 'streak_broken' };
}

/**
 * Tier rewards the user has newly crossed. Callers persist the granted tier
 * ids so a reward is only ever paid once.
 *
 * @param {number} streakDays
 * @param {string[]} [alreadyGranted=[]] - tier ids already paid
 * @returns {Array<{tierId:string, reward:object}>}
 */
export function getUnclaimedTierRewards(streakDays, alreadyGranted = []) {
    const granted = new Set(Array.isArray(alreadyGranted) ? alreadyGranted : []);
    const days = Number.isFinite(streakDays) ? streakDays : 0;
    return STREAK_TIERS
        .filter(t => t.unlockReward && days >= t.minDays && !granted.has(t.id))
        .map(t => ({ tierId: t.id, reward: t.unlockReward }));
}

/**
 * Format streak for display. Resolves the tier ONCE and threads it through
 * (it used to be recomputed three times per call).
 */
export function formatStreakDisplay(streakDays) {
    const tier = getStreakTier(streakDays);

    return {
        days: streakDays,
        tier: tier.id,
        badge: tier.badge,
        title: tier.title,
        multiplier: tier.multiplier,
        color: tier.color,
        isMilestone: isStreakMilestone(streakDays),
        daysUntilNext: getDaysUntilNextTier(streakDays, tier),
        nextTier: getNextTier(tier),
        preview: getMultiplierPreview(streakDays),
    };
}
