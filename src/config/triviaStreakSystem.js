/**
 * TRIVIA STREAK SYSTEM — Configuration and utilities
 * Manages streak multipliers, badges, and streak protection
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
        badge: '🔥',
        color: '#60a5fa',
        title: 'Weekly Warrior',
        unlockReward: { type: 'weekly_chest', diamonds: 50 }
    },
    {
        id: 'gold',
        minDays: 14,
        maxDays: 29,
        multiplier: 2.5,
        badge: '💪',
        color: '#fbbf24',
        title: 'Dedicated Mind',
        unlockReward: { type: 'badge', id: 'dedicated_mind' }
    },
    {
        id: 'platinum',
        minDays: 30,
        maxDays: 99,
        multiplier: 3.0,
        badge: '🏆',
        color: '#a78bfa',
        title: 'Iron Mind',
        unlockReward: { type: 'title', id: 'iron_mind', diamonds: 100 }
    },
    {
        id: 'diamond',
        minDays: 100,
        maxDays: Infinity,
        multiplier: 5.0,
        badge: '👑',
        color: '#00d4ff',
        title: 'Legendary Mind',
        unlockReward: { type: 'crown', id: 'legendary_crown', diamonds: 500 }
    }
];

// Special milestones that trigger celebrations
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 365];

/**
 * Get the current streak tier based on streak count
 */
export function getStreakTier(streakDays) {
    if (!streakDays || streakDays < 1) {
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
 */
export function getNextTier(streakDays) {
    const currentTier = getStreakTier(streakDays);
    const currentIndex = STREAK_TIERS.findIndex(t => t.id === currentTier.id);

    if (currentIndex < STREAK_TIERS.length - 1) {
        return STREAK_TIERS[currentIndex + 1];
    }

    return null; // Already at max tier
}

/**
 * Calculate diamond reward with streak multiplier
 */
export function calculateRewardWithMultiplier(baseReward, streakDays) {
    const tier = getStreakTier(streakDays);
    return Math.floor(baseReward * tier.multiplier);
}

/**
 * Check if streak hits a milestone
 */
export function isStreakMilestone(streakDays) {
    return STREAK_MILESTONES.includes(streakDays);
}

/**
 * Get days until next tier unlock
 */
export function getDaysUntilNextTier(streakDays) {
    const nextTier = getNextTier(streakDays);
    if (!nextTier) return null;

    return nextTier.minDays - streakDays;
}

/**
 * Streak shield item configuration
 */
export const STREAK_SHIELD = {
    id: 'streak_shield',
    name: 'Streak Shield',
    description: 'Protects your streak if you miss one day',
    cost: 50, // diamonds
    icon: '🛡️',
    maxOwned: 3
};

/**
 * Format streak for display
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
        daysUntilNext: getDaysUntilNextTier(streakDays)
    };
}
