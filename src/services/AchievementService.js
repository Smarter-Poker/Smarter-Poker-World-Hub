/**
 * AchievementService - Memory Matrix Achievements
 * Handles achievement unlocking and tracking
 */

import { authedFetch } from '../lib/authUtils';

// Achievement definitions (matching SQL)
const ACHIEVEMENT_IDS = {
    FIRST_GAME: 'first_game',
    PERFECT_MEMORY: 'perfect_memory',
    SPEED_DEMON: 'speed_demon',
    MARATHON_MIND: 'marathon_mind',
    LEVEL_5: 'level_5_master',
    LEVEL_10: 'level_10_master',
    STREAK_3: 'streak_3',
    STREAK_7: 'streak_7',
    STREAK_30: 'streak_30',
    DIAMOND_100: 'diamond_100',
    DIAMOND_1000: 'diamond_1000',
    AI_5: 'ai_5',
    AI_25: 'ai_25',
    ALL_MODES: 'all_modes',
    PRESSURE_PRO: 'pressure_pro',
    SPOT_MASTER: 'spot_master',
    TOURNAMENT_WINNER: 'tournament_winner'
};

class AchievementService {
    constructor() {
        this.unlockedCache = new Set();
    }

    /**
     * Check and unlock achievements based on game result
     */
    async checkAndUnlock(userId) {
        if (!userId) return [];

        // Unlock eligibility is settled from persisted, server-graded attempts.
        // This legacy service has no receipt to prove one, so it must not infer
        // or publish an unlock from browser-owned game data.
        return [];
    }

    /**
     * Unlock a single achievement via RPC
     */
    async unlockAchievement(userId, achievementId) {
        // Retained for compatibility with older callers. Eligibility cannot be
        // safely established from an achievement id alone, so route all new
        // checks through checkAndUnlock and its server-owned stats contract.
        return { success: false, unsupported: true, userId, achievementId };
    }

    /**
     * Get user's unlocked achievements
     */
    async getUserAchievements(userId) {
        if (!userId) return [];
        try {
            const response = await authedFetch('/api/training/achievements');
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success) {
                throw new Error(payload?.error || 'Unable to load achievements');
            }
            return payload.achievements || [];
        } catch (error) {
            console.warn('[AchievementService] Error fetching:', error);
            return [];
        }
    }
}

// Export singleton
const achievementService = new AchievementService();
export default achievementService;
export { ACHIEVEMENT_IDS };
