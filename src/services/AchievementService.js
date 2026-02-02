/**
 * AchievementService - Memory Matrix Achievements
 * Handles achievement unlocking and tracking
 */

import { supabase } from '../lib/supabase';

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
    async checkAndUnlock(userId, gameData) {
        if (!userId) return [];

        const unlocked = [];
        const {
            gamesPlayed = 0,
            accuracy = 0,
            timeTaken = 0,
            level = 1,
            gameMode = 'range',
            totalDiamonds = 0,
            aiScenariosCompleted = 0,
            currentStreak = 0,
            modesPlayed = []
        } = gameData;

        try {
            // First game
            if (gamesPlayed === 1) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.FIRST_GAME);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.FIRST_GAME);
            }

            // Perfect memory (100% accuracy)
            if (accuracy === 100) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.PERFECT_MEMORY);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.PERFECT_MEMORY);
            }

            // Speed demon (complete in under 60 seconds)
            if (timeTaken < 60 && accuracy >= 85) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.SPEED_DEMON);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.SPEED_DEMON);
            }

            // Marathon mind (10 games in one session)
            if (gamesPlayed >= 10) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.MARATHON_MIND);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.MARATHON_MIND);
            }

            // Level milestones
            if (level >= 5) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.LEVEL_5);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.LEVEL_5);
            }
            if (level >= 10) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.LEVEL_10);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.LEVEL_10);
            }

            // Streak achievements
            if (currentStreak >= 3) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.STREAK_3);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.STREAK_3);
            }
            if (currentStreak >= 7) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.STREAK_7);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.STREAK_7);
            }
            if (currentStreak >= 30) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.STREAK_30);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.STREAK_30);
            }

            // Diamond milestones
            if (totalDiamonds >= 100) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.DIAMOND_100);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.DIAMOND_100);
            }
            if (totalDiamonds >= 1000) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.DIAMOND_1000);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.DIAMOND_1000);
            }

            // AI scenario achievements
            if (aiScenariosCompleted >= 5) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.AI_5);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.AI_5);
            }
            if (aiScenariosCompleted >= 25) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.AI_25);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.AI_25);
            }

            // Mode-specific
            if (gameMode === 'pressure' && accuracy >= 90) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.PRESSURE_PRO);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.PRESSURE_PRO);
            }

            // All modes played
            const allModes = ['range', 'speed', 'pressure', 'pattern', 'mixed', 'spot', 'tournament'];
            if (allModes.every(m => modesPlayed.includes(m))) {
                const result = await this.unlockAchievement(userId, ACHIEVEMENT_IDS.ALL_MODES);
                if (result?.success) unlocked.push(ACHIEVEMENT_IDS.ALL_MODES);
            }

            return unlocked;
        } catch (error) {
            console.error('[AchievementService] Error checking achievements:', error);
            return [];
        }
    }

    /**
     * Unlock a single achievement via RPC
     */
    async unlockAchievement(userId, achievementId) {
        try {
            // Skip if already unlocked in this session
            const cacheKey = `${userId}-${achievementId}`;
            if (this.unlockedCache.has(cacheKey)) {
                return { success: false, already_unlocked: true };
            }

            const { data, error } = await supabase.rpc('unlock_achievement', {
                p_user_id: userId,
                p_achievement_id: achievementId
            });

            if (error) {
                // Table doesn't exist yet - silently fail
                if (error.code === '42P01') {
                    console.log('[AchievementService] Achievements table not created yet');
                    return { success: false };
                }
                throw error;
            }

            if (data?.success) {
                this.unlockedCache.add(cacheKey);
                console.log(`[AchievementService] Unlocked: ${achievementId}`);
            }

            return data;
        } catch (error) {
            console.error('[AchievementService] Error unlocking:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user's unlocked achievements
     */
    async getUserAchievements(userId) {
        try {
            const { data, error } = await supabase.rpc('get_user_achievements', {
                p_user_id: userId
            });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[AchievementService] Error fetching:', error);
            return [];
        }
    }
}

// Export singleton
const achievementService = new AchievementService();
export default achievementService;
export { ACHIEVEMENT_IDS };
