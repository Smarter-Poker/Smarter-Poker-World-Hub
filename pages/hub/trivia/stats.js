/**
 * Trivia - Player Stats
 * Fetches real user data from Supabase
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaStats() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalQuestions: 0,
        correctAnswers: 0,
        accuracy: 0,
        currentStreak: 0,
        bestStreak: 0,
        diamondsEarned: 0,
        gamesPlayed: 0
    });

    useEffect(() => {
        async function loadStats() {
            try {
                const user = getAuthUser();

                if (!user) {
                    setIsLoading(false);
                    return;
                }

                // Get streak data
                const { data: streakData } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                // Get all user scores for aggregation
                const { data: scores } = await supabase
                    .from('trivia_scores')
                    .select('correct_count, total_questions, diamonds_earned')
                    .eq('user_id', user.id);

                if (scores && scores.length > 0) {
                    const totalQuestions = scores.reduce((sum, s) => sum + (s.total_questions || 0), 0);
                    const correctAnswers = scores.reduce((sum, s) => sum + (s.correct_count || 0), 0);
                    const diamondsEarned = scores.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
                    const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

                    setStats({
                        totalQuestions,
                        correctAnswers,
                        accuracy,
                        currentStreak: streakData?.current_streak || 0,
                        bestStreak: streakData?.best_streak || 0,
                        diamondsEarned,
                        gamesPlayed: scores.length
                    });
                } else if (streakData) {
                    setStats(prev => ({
                        ...prev,
                        currentStreak: streakData.current_streak || 0,
                        bestStreak: streakData.best_streak || 0,
                        totalQuestions: streakData.total_correct || 0,
                        correctAnswers: streakData.total_correct || 0,
                        gamesPlayed: streakData.total_games_played || 0
                    }));
                }
            } catch (error) {
                console.error('Error loading stats:', error);
            }
            setIsLoading(false);
        }

        loadStats();
    }, []);

    return (
        <>
            <Head>
                <title>My Stats | Trivia</title>
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

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            My Trivia Stats
                        </h1>

                        {isLoading ? (
                            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '40px' }}>
                                Loading stats...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Games Played</div>
                                    <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.gamesPlayed.toLocaleString()}</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Questions</div>
                                    <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.totalQuestions.toLocaleString()}</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Accuracy</div>
                                    <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.accuracy}%</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Current Streak</div>
                                    <div style={{ color: '#f59e0b', fontSize: '32px', fontWeight: 'bold' }}>{stats.currentStreak}</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Best Streak</div>
                                    <div style={{ color: '#8b5cf6', fontSize: '32px', fontWeight: 'bold' }}>{stats.bestStreak}</div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Diamonds Earned</div>
                                    <div style={{ color: '#00D4FF', fontSize: '32px', fontWeight: 'bold' }}>{stats.diamondsEarned.toLocaleString()}</div>
                                </div>
                            </div>
                        )}

                        {!isLoading && stats.gamesPlayed === 0 && (
                            <div style={{
                                marginTop: '40px',
                                padding: '40px',
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                borderRadius: '12px',
                                textAlign: 'center'
                            }}>
                                <p style={{ color: '#fff', fontSize: '18px', marginBottom: '16px' }}>
                                    No trivia games played yet!
                                </p>
                                <button
                                    onClick={() => router.push('/hub/trivia')}
                                    style={{
                                        background: '#8b5cf6',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '12px 24px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Start Playing
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
