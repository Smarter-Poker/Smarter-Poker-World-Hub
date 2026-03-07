/**
 * Trivia - Achievements
 * Fetches user's trivia achievements from Supabase
 * Uses trivia_scores and trivia_streaks to determine unlocks
 * SmarterPoker Dark color schema — no emojis
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { Target, BookOpen, Award, Trophy, Flame, Zap, Crown, CheckCircle, Gem, Gamepad2, Calendar, Star } from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// Achievement definitions with unlock conditions — using Lucide icons instead of emojis
const ACHIEVEMENTS = [
    { id: 'first_answer', name: 'First Steps', description: 'Answer Your First Trivia Question', Icon: Target, requirement: (stats) => stats.totalQuestions >= 1 },
    { id: 'ten_correct', name: 'Getting Started', description: 'Get 10 Correct Answers', Icon: BookOpen, requirement: (stats) => stats.correctAnswers >= 10 },
    { id: 'fifty_correct', name: 'Trivia Apprentice', description: 'Get 50 Correct Answers', Icon: Award, requirement: (stats) => stats.correctAnswers >= 50 },
    { id: 'hundred_correct', name: 'Trivia Expert', description: 'Get 100 Correct Answers', Icon: Trophy, requirement: (stats) => stats.correctAnswers >= 100 },
    { id: 'streak_5', name: 'Hot Streak', description: 'Achieve a 5-day Streak', Icon: Flame, requirement: (stats) => stats.bestStreak >= 5 },
    { id: 'streak_10', name: 'Streak Master', description: 'Achieve a 10-day Streak', Icon: Zap, requirement: (stats) => stats.bestStreak >= 10 },
    { id: 'streak_30', name: 'Dedicated Player', description: 'Achieve a 30-day Streak', Icon: Crown, requirement: (stats) => stats.bestStreak >= 30 },
    { id: 'perfect_game', name: 'Perfect Score', description: 'Get 100% in a Trivia Session', Icon: CheckCircle, requirement: (stats) => stats.hasPerfectGame },
    { id: 'diamond_winner', name: 'Diamond Winner', description: 'Earn 100 Diamonds From Trivia', Icon: Gem, requirement: (stats) => stats.diamondsEarned >= 100 },
    { id: 'arcade_master', name: 'Arcade Master', description: 'Play 10 Arcade Games', Icon: Gamepad2, requirement: (stats) => stats.arcadeGames >= 10 },
    { id: 'daily_player', name: 'Daily Devotee', description: 'Play Daily Trivia 7 Days in a Row', Icon: Calendar, requirement: (stats) => stats.dailyStreak >= 7 },
    { id: 'thousand_questions', name: 'Knowledge Seeker', description: 'Answer 1,000 Questions', Icon: Star, requirement: (stats) => stats.totalQuestions >= 1000 }
];

export default function TriviaAchievements() {
    const bus = useTrainingBus('trivia-achievements');
    const router = useRouter();
    const [userId, setUserId] = useState(null);
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
                setUserId(user.id);

                // Get user's trivia stats
                const { data: streakData } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

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
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-ach:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, () => { loadAchievements(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    return (
        <>
            <SEOHead
                title="Trivia Achievements — Unlock Rewards"
                description="Track Your Poker Trivia Achievements. Unlock Badges, Rewards, And Bragging Rights."
                canonical="/hub/trivia/achievements"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#18191a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(35, 116, 225, 0.1)',
                                border: '1px solid rgba(35, 116, 225, 0.3)',
                                color: '#2374e1',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            Back to Trivia
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', margin: 0 }}>
                                Achievements
                            </h1>
                            {!isLoading && (
                                <div style={{
                                    background: 'rgba(35, 116, 225, 0.2)',
                                    border: '1px solid rgba(35, 116, 225, 0.4)',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    color: '#2374e1',
                                    fontWeight: 'bold'
                                }}>
                                    {unlockedCount} / {ACHIEVEMENTS.length} Unlocked
                                </div>
                            )}
                        </div>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading achievements...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '16px' }}>
                                {achievements.map(achievement => {
                                    const IconComponent = achievement.Icon;
                                    return (
                                        <div
                                            key={achievement.id}
                                            style={{
                                                background: achievement.unlocked ? 'rgba(35, 116, 225, 0.1)' : '#242526',
                                                border: `1px solid ${achievement.unlocked ? 'rgba(35, 116, 225, 0.3)' : '#4e4f50'}`,
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
                                                width: '48px',
                                                height: '48px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: achievement.unlocked ? 'rgba(35, 116, 225, 0.15)' : '#3a3b3c',
                                                borderRadius: '12px'
                                            }}>
                                                <IconComponent
                                                    size={24}
                                                    color={achievement.unlocked ? '#2374e1' : '#65676b'}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>
                                                    {achievement.name}
                                                </div>
                                                <div style={{ color: '#65676b', fontSize: '14px' }}>
                                                    {achievement.description}
                                                </div>
                                            </div>
                                            {achievement.unlocked && (
                                                <div style={{
                                                    color: '#31a24c',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <CheckCircle size={20} />
                                                    Unlocked
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
