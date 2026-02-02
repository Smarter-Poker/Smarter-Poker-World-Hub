/**
 * Trivia - Achievements
 * Fetches user's trivia achievements from Supabase
 * Uses trivia_scores and trivia_streaks to determine unlocks
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

// Achievement definitions with unlock conditions
const ACHIEVEMENTS = [
    { id: 'first_answer', name: 'First Steps', description: 'Answer your first trivia question', icon: '🎯', requirement: (stats) => stats.totalQuestions >= 1 },
    { id: 'ten_correct', name: 'Getting Started', description: 'Get 10 correct answers', icon: '📚', requirement: (stats) => stats.correctAnswers >= 10 },
    { id: 'fifty_correct', name: 'Trivia Apprentice', description: 'Get 50 correct answers', icon: '🎓', requirement: (stats) => stats.correctAnswers >= 50 },
    { id: 'hundred_correct', name: 'Trivia Expert', description: 'Get 100 correct answers', icon: '🏆', requirement: (stats) => stats.correctAnswers >= 100 },
    { id: 'streak_5', name: 'Hot Streak', description: 'Achieve a 5-day streak', icon: '🔥', requirement: (stats) => stats.bestStreak >= 5 },
    { id: 'streak_10', name: 'Streak Master', description: 'Achieve a 10-day streak', icon: '⚡', requirement: (stats) => stats.bestStreak >= 10 },
    { id: 'streak_30', name: 'Dedicated Player', description: 'Achieve a 30-day streak', icon: '👑', requirement: (stats) => stats.bestStreak >= 30 },
    { id: 'perfect_game', name: 'Perfect Score', description: 'Get 100% in a trivia session', icon: '💯', requirement: (stats) => stats.hasPerfectGame },
    { id: 'diamond_winner', name: 'Diamond Winner', description: 'Earn 100 diamonds from trivia', icon: '💎', requirement: (stats) => stats.diamondsEarned >= 100 },
    { id: 'arcade_master', name: 'Arcade Master', description: 'Play 10 arcade games', icon: '🕹️', requirement: (stats) => stats.arcadeGames >= 10 },
    { id: 'daily_player', name: 'Daily Devotee', description: 'Play daily trivia 7 days in a row', icon: '📅', requirement: (stats) => stats.dailyStreak >= 7 },
    { id: 'thousand_questions', name: 'Knowledge Seeker', description: 'Answer 1,000 questions', icon: '🌟', requirement: (stats) => stats.totalQuestions >= 1000 }
];

export default function TriviaAchievements() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [achievements, setAchievements] = useState([]);
    const [unlockedCount, setUnlockedCount] = useState(0);

    useEffect(() => {
        async function loadAchievements() {
            try {
                const user = getAuthUser();

                if (!user) {
                    // Show all achievements as locked for guests
                    setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })));
                    setIsLoading(false);
                    return;
                }

                // Get user's trivia stats
                const { data: streakData } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                const { data: scores } = await supabase
                    .from('trivia_scores')
                    .select('correct_count, total_questions, diamonds_earned, mode')
                    .eq('user_id', user.id);

                // Calculate stats
                const totalQuestions = scores?.reduce((sum, s) => sum + (s.total_questions || 0), 0) || 0;
                const correctAnswers = scores?.reduce((sum, s) => sum + (s.correct_count || 0), 0) || 0;
                const diamondsEarned = scores?.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0) || 0;
                const arcadeGames = scores?.filter(s => s.mode === 'arcade').length || 0;
                const hasPerfectGame = scores?.some(s => s.correct_count === s.total_questions && s.total_questions > 0) || false;

                const stats = {
                    totalQuestions,
                    correctAnswers,
                    diamondsEarned,
                    arcadeGames,
                    hasPerfectGame,
                    bestStreak: streakData?.best_streak || 0,
                    dailyStreak: streakData?.current_streak || 0
                };

                // Check each achievement
                const processedAchievements = ACHIEVEMENTS.map(achievement => ({
                    ...achievement,
                    unlocked: achievement.requirement(stats)
                }));

                setAchievements(processedAchievements);
                setUnlockedCount(processedAchievements.filter(a => a.unlocked).length);
            } catch (error) {
                console.error('Error loading achievements:', error);
                setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })));
            }
            setIsLoading(false);
        }

        loadAchievements();
    }, []);

    return (
        <>
            <Head>
                <title>Achievements | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: '#8b5cf6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Trivia
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
                                Achievements
                            </h1>
                            {!isLoading && (
                                <div style={{
                                    background: 'rgba(139, 92, 246, 0.2)',
                                    border: '1px solid rgba(139, 92, 246, 0.4)',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    color: '#8b5cf6',
                                    fontWeight: 'bold'
                                }}>
                                    {unlockedCount} / {ACHIEVEMENTS.length} Unlocked
                                </div>
                            )}
                        </div>

                        {isLoading ? (
                            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '40px' }}>
                                Loading achievements...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {achievements.map(achievement => (
                                    <div
                                        key={achievement.id}
                                        style={{
                                            background: achievement.unlocked ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${achievement.unlocked ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                                            borderRadius: '12px',
                                            padding: '20px',
                                            display: 'flex',
                                            gap: '16px',
                                            alignItems: 'center',
                                            opacity: achievement.unlocked ? 1 : 0.5,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '48px',
                                            filter: achievement.unlocked ? 'none' : 'grayscale(100%)'
                                        }}>
                                            {achievement.icon}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>
                                                {achievement.name}
                                            </div>
                                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                                {achievement.description}
                                            </div>
                                        </div>
                                        {achievement.unlocked && (
                                            <div style={{
                                                color: '#10b981',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}>
                                                <span style={{ fontSize: '20px' }}>✓</span>
                                                Unlocked
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
