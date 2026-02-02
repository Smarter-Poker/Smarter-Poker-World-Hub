/**
 * GameSessionService - Memory Matrix Session Recording
 * Records game sessions to Supabase for analytics and stats
 */

import { supabase } from '../lib/supabase';

class GameSessionService {
    /**
     * Record a completed game session
     */
    async recordSession(userId, sessionData) {
        if (!userId) {
            console.log('[GameSessionService] No user ID, skipping session record');
            return { success: false };
        }

        try {
            const {
                gameMode = 'range',
                level = 1,
                scenarioId = null,
                score = 0,
                accuracy = 0,
                timeTaken = 0,
                diamondsSpent = 0,
                diamondsEarned = 0,
                completed = true
            } = sessionData;

            const { data, error } = await supabase
                .from('memory_game_sessions')
                .insert({
                    user_id: userId,
                    game_mode: gameMode,
                    level: level,
                    scenario_id: scenarioId,
                    score: score,
                    accuracy: accuracy,
                    time_taken: timeTaken,
                    diamonds_spent: diamondsSpent,
                    diamonds_earned: diamondsEarned,
                    completed: completed
                })
                .select()
                .single();

            if (error) {
                // Table doesn't exist - silently fail
                if (error.code === '42P01') {
                    console.log('[GameSessionService] memory_game_sessions table not created yet');
                    return { success: false };
                }
                throw error;
            }

            console.log('[GameSessionService] Session recorded:', data?.id);
            return { success: true, sessionId: data?.id };
        } catch (error) {
            console.error('[GameSessionService] Error recording session:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get user's game statistics
     */
    async getUserStats(userId) {
        if (!userId) return null;

        try {
            const { data, error } = await supabase
                .from('memory_game_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Calculate stats
            const sessions = data || [];
            const totalGames = sessions.length;
            const completedGames = sessions.filter(s => s.completed).length;
            const avgAccuracy = sessions.length > 0
                ? sessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / sessions.length
                : 0;
            const totalDiamonds = sessions.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
            const totalTime = sessions.reduce((sum, s) => sum + (s.time_taken || 0), 0);

            // Per-level stats
            const levelStats = {};
            for (let i = 1; i <= 10; i++) {
                const levelSessions = sessions.filter(s => s.level === i);
                levelStats[i] = {
                    games: levelSessions.length,
                    avgAccuracy: levelSessions.length > 0
                        ? levelSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / levelSessions.length
                        : 0
                };
            }

            // Mode stats
            const modeStats = {};
            const modes = ['range', 'speed', 'pressure', 'pattern', 'mixed', 'spot', 'tournament'];
            modes.forEach(mode => {
                const modeSessions = sessions.filter(s => s.game_mode === mode);
                modeStats[mode] = {
                    games: modeSessions.length,
                    avgAccuracy: modeSessions.length > 0
                        ? modeSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / modeSessions.length
                        : 0
                };
            });

            return {
                totalGames,
                completedGames,
                avgAccuracy: Math.round(avgAccuracy * 100) / 100,
                totalDiamonds,
                totalTime,
                levelStats,
                modeStats,
                modesPlayed: Object.keys(modeStats).filter(m => modeStats[m].games > 0),
                recentSessions: sessions.slice(0, 10)
            };
        } catch (error) {
            console.error('[GameSessionService] Error fetching stats:', error);
            return null;
        }
    }

    /**
     * Get session count for current day (for daily challenge)
     */
    async getTodaysSessionCount(userId) {
        if (!userId) return 0;

        try {
            const today = new Date().toISOString().split('T')[0];
            const { count, error } = await supabase
                .from('memory_game_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', `${today}T00:00:00Z`);

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('[GameSessionService] Error counting today\'s sessions:', error);
            return 0;
        }
    }
}

// Export singleton
const gameSessionService = new GameSessionService();
export default gameSessionService;
