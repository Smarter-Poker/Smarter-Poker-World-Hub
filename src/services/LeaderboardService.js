/**
 * LeaderboardService - Memory Matrix Leaderboards
 * Handles leaderboard queries and updates
 */

import { supabase } from '../lib/supabase';

class LeaderboardService {
    constructor() {
        // Use singleton client directly - no external initialization needed
        this.supabase = supabase;
    }

    /**
     * Initialize with optional Supabase client override
     * @deprecated Use singleton client directly
     */
    async initialize(supabaseClient) {
        if (supabaseClient) {
            this.supabase = supabaseClient;
        }
    }


    /**
     * Get leaderboard for a specific game mode and level
     */
    async getLeaderboard(gameMode, level = null, limit = 100) {
        try {
            let query = this.supabase
                .from('memory_leaderboards')
                .select(`
                    *,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                `)
                .eq('game_mode', gameMode)
                .order('score', { ascending: false })
                .limit(limit);

            if (level !== null) {
                query = query.eq('level', level);
            } else {
                query = query.is('level', null);
            }

            const { data, error } = await query;

            if (error) throw error;

            return {
                success: true,
                leaderboard: data || []
            };
        } catch (error) {
            console.error('[LeaderboardService] Error getting leaderboard:', error);
            return {
                success: false,
                error: error.message,
                leaderboard: []
            };
        }
    }

    /**
     * Get user's rank for a specific game mode and level
     */
    async getUserRank(userId, gameMode, level = null) {
        try {
            let query = this.supabase
                .from('memory_leaderboards')
                .select('score')
                .eq('game_mode', gameMode);

            if (level !== null) {
                query = query.eq('level', level);
            } else {
                query = query.is('level', null);
            }

            const { data, error } = await query.order('score', { ascending: false });

            if (error) throw error;

            const userEntry = data.find(entry => entry.user_id === userId);
            if (!userEntry) {
                return {
                    success: true,
                    rank: null,
                    score: 0
                };
            }

            const rank = data.findIndex(entry => entry.user_id === userId) + 1;

            return {
                success: true,
                rank,
                score: userEntry.score
            };
        } catch (error) {
            console.error('[LeaderboardService] Error getting user rank:', error);
            return {
                success: false,
                error: error.message,
                rank: null
            };
        }
    }

    /**
     * Update leaderboard entry
     */
    async updateLeaderboard(userId, gameMode, level, score, accuracy, timeTaken, sessionId) {
        try {
            const { data, error } = await this.supabase.rpc('update_leaderboard', {
                p_user_id: userId,
                p_game_mode: gameMode,
                p_level: level,
                p_score: score,
                p_accuracy: accuracy,
                p_time_taken: timeTaken,
                p_session_id: sessionId
            });

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('[LeaderboardService] Error updating leaderboard:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get top players (global)
     */
    async getTopPlayers(gameMode, limit = 10) {
        return this.getLeaderboard(gameMode, null, limit);
    }

    /**
     * Get user's best scores across all levels
     */
    async getUserBestScores(userId, gameMode) {
        try {
            const { data, error } = await this.supabase
                .from('memory_leaderboards')
                .select('*')
                .eq('user_id', userId)
                .eq('game_mode', gameMode)
                .order('level', { ascending: true });

            if (error) throw error;

            return {
                success: true,
                scores: data || []
            };
        } catch (error) {
            console.error('[LeaderboardService] Error getting user best scores:', error);
            return {
                success: false,
                error: error.message,
                scores: []
            };
        }
    }
}

// Export singleton instance
const leaderboardService = new LeaderboardService();
export default leaderboardService;
