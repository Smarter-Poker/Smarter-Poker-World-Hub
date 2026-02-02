/**
 * 🧠 JARVIS USER INSIGHTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes training data to provide personalized insights and leak patterns
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Get user's training profile
        const { data: profile } = await supabase
            .from('jarvis_user_training_profile')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Get recent sessions for analysis
        const { data: recentSessions } = await supabase
            .from('jarvis_training_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        // Get streak info
        const { data: streak } = await supabase
            .from('training_streaks')
            .select('*')
            .eq('user_id', userId)
            .single();

        // Get achievements count
        const { count: achievementCount } = await supabase
            .from('training_user_achievements')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        // Analyze patterns from sessions
        const sessions = recentSessions || [];
        const totalQuestions = sessions.reduce((sum, s) => sum + (s.questions_answered || 0), 0);
        const totalCorrect = sessions.reduce((sum, s) => sum + (s.questions_correct || 0), 0);
        const avgAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions * 100).toFixed(1) : 0;

        // Analyze leaks
        const allLeaks = sessions.flatMap(s => s.leaks_detected || []);
        const leakCounts = allLeaks.reduce((acc, leak) => {
            acc[leak] = (acc[leak] || 0) + 1;
            return acc;
        }, {});
        const topLeaks = Object.entries(leakCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([leak, count]) => ({ leak, count }));

        // Analyze game performance
        const gameStats = sessions.reduce((acc, s) => {
            if (!acc[s.game_id]) {
                acc[s.game_id] = {
                    gameName: s.game_name,
                    sessions: 0,
                    correct: 0,
                    total: 0,
                    highestLevel: 0
                };
            }
            acc[s.game_id].sessions++;
            acc[s.game_id].correct += s.questions_correct || 0;
            acc[s.game_id].total += s.questions_answered || 0;
            acc[s.game_id].highestLevel = Math.max(acc[s.game_id].highestLevel, s.level || 0);
            return acc;
        }, {});

        const gamePerformance = Object.entries(gameStats).map(([id, stats]) => ({
            gameId: id,
            gameName: stats.gameName,
            sessions: stats.sessions,
            accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(1) : 0,
            highestLevel: stats.highestLevel
        })).sort((a, b) => b.sessions - a.sessions);

        // Calculate weekly progress
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeekSessions = sessions.filter(s => new Date(s.created_at) > weekAgo);
        const weeklyProgress = {
            sessions: thisWeekSessions.length,
            questions: thisWeekSessions.reduce((sum, s) => sum + (s.questions_answered || 0), 0),
            correct: thisWeekSessions.reduce((sum, s) => sum + (s.questions_correct || 0), 0),
            timeSpent: thisWeekSessions.reduce((sum, s) => sum + (s.time_spent_seconds || 0), 0)
        };

        // Generate insights
        const insights = [];

        if (topLeaks.length > 0) {
            insights.push({
                type: 'leak',
                icon: '🔍',
                title: 'Top Leak Pattern',
                message: `Your most common mistake is "${topLeaks[0].leak}" - focus on this area to improve quickly.`
            });
        }

        if (streak?.current_streak >= 3) {
            insights.push({
                type: 'streak',
                icon: '🔥',
                title: 'Streak Power',
                message: `You're on a ${streak.current_streak}-day streak! Consistency is key to mastery.`
            });
        }

        const strongGames = gamePerformance.filter(g => parseFloat(g.accuracy) >= 90);
        if (strongGames.length > 0) {
            insights.push({
                type: 'strength',
                icon: '💪',
                title: 'Strong Area',
                message: `You're crushing ${strongGames[0].gameName} with ${strongGames[0].accuracy}% accuracy!`
            });
        }

        const weakGames = gamePerformance.filter(g => parseFloat(g.accuracy) < 70 && g.sessions >= 2);
        if (weakGames.length > 0) {
            insights.push({
                type: 'focus',
                icon: '📚',
                title: 'Focus Area',
                message: `${weakGames[0].gameName} needs work - consider reviewing the fundamentals.`
            });
        }

        return res.status(200).json({
            success: true,
            insights: {
                overview: {
                    totalSessions: profile?.total_sessions || sessions.length,
                    totalQuestions: profile?.total_questions || totalQuestions,
                    totalCorrect: profile?.total_correct || totalCorrect,
                    overallAccuracy: avgAccuracy,
                    currentStreak: streak?.current_streak || 0,
                    longestStreak: streak?.longest_streak || 0,
                    achievementsUnlocked: achievementCount || 0
                },
                weeklyProgress,
                topLeaks,
                gamePerformance,
                personalizedInsights: insights,
                jarvisAdvice: insights.length > 0
                    ? `Focus on your ${topLeaks[0]?.leak || 'fundamentals'} to see the biggest improvement.`
                    : 'Keep training to unlock personalized insights!'
            }
        });

    } catch (error) {
        console.error('[JarvisInsights] Error:', error.message);
        return res.status(500).json({ error: 'Failed to generate insights' });
    }
}
