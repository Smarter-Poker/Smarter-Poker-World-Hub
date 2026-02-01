/**
 * DailyChallengeService - Memory Matrix Daily Challenges
 * Handles daily challenge queries and completions
 */

import { createClient } from '@supabase/supabase-js';

class DailyChallengeService {
    constructor() {
        this.supabase = null;
    }

    /**
     * Initialize with Supabase client
     */
    async initialize(supabaseClient) {
        this.supabase = supabaseClient;
    }

    /**
     * Get today's daily challenge
     */
    async getTodaysChallenge() {
        try {
            const { data, error } = await this.supabase.rpc('get_daily_challenge');

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[DailyChallengeService] Error getting daily challenge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Complete daily challenge
     */
    async completeChallenge(userId, challengeId, score, accuracy, timeTaken) {
        try {
            const { data, error } = await this.supabase.rpc('complete_daily_challenge', {
                p_user_id: userId,
                p_challenge_id: challengeId,
                p_score: score,
                p_accuracy: accuracy,
                p_time_taken: timeTaken
            });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[DailyChallengeService] Error completing challenge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get user's challenge completion history
     */
    async getUserCompletions(userId, limit = 30) {
        try {
            const { data, error } = await this.supabase
                .from('memory_challenge_completions')
                .select(`
                    *,
                    challenge:challenge_id (
                        challenge_date,
                        game_mode,
                        level,
                        target_accuracy,
                        target_time
                    )
                `)
                .eq('user_id', userId)
                .order('completed_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return {
                success: true,
                completions: data || []
            };
        } catch (error) {
            console.error('[DailyChallengeService] Error getting user completions:', error);
            return {
                success: false,
                error: error.message,
                completions: []
            };
        }
    }

    /**
     * Get user's current streak
     */
    async getUserStreak(userId) {
        try {
            const { data, error } = await this.supabase
                .from('user_daily_streaks')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) throw error;

            return {
                success: true,
                streak: data || {
                    current_streak: 0,
                    longest_streak: 0,
                    total_days_played: 0
                }
            };
        } catch (error) {
            console.error('[DailyChallengeService] Error getting user streak:', error);
            return {
                success: false,
                error: error.message,
                streak: {
                    current_streak: 0,
                    longest_streak: 0,
                    total_days_played: 0
                }
            };
        }
    }

    /**
     * Create a new daily challenge (admin only)
     */
    async createDailyChallenge(challengeDate, gameMode, level, scenarioId, targetAccuracy, targetTime, diamondReward, bonusReward) {
        try {
            const { data, error } = await this.supabase
                .from('memory_daily_challenges')
                .insert({
                    challenge_date: challengeDate,
                    game_mode: gameMode,
                    level: level,
                    scenario_id: scenarioId,
                    target_accuracy: targetAccuracy,
                    target_time: targetTime,
                    diamond_reward: diamondReward,
                    bonus_reward: bonusReward
                })
                .select()
                .single();

            if (error) throw error;

            return {
                success: true,
                challenge: data
            };
        } catch (error) {
            console.error('[DailyChallengeService] Error creating daily challenge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
const dailyChallengeService = new DailyChallengeService();
export default dailyChallengeService;
