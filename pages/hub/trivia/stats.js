/**
 * Trivia - Player Stats
 * Fetches real user data from Supabase
 * Uses Facebook Dark color schema
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaStats() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
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
                setUserId(user.id);

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
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-stats:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, () => { })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    const StatCard = ({ label, value, color }) => (
        <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '24px' }}>
            <div style={{ color: '#65676b', fontSize: '14px', marginBottom: '8px' }}>{label}</div>
            <div style={{ color: color || '#e4e6eb', fontSize: '32px', fontWeight: 'bold' }}>{value}</div>
        </div>
    );

    return (
        <>
            <SEOHead
                title="Trivia Stats — Your Performance"
                description="View Your Poker Trivia Performance Stats, Accuracy Rates, And Category Breakdowns."
                canonical="/hub/trivia/stats"
                noindex={true}
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

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '30px' }}>
                            My Trivia Stats
                        </h1>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading stats...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                                <StatCard label="Games Played" value={stats.gamesPlayed.toLocaleString()} />
                                <StatCard label="Total Questions" value={stats.totalQuestions.toLocaleString()} />
                                <StatCard label="Accuracy" value={`${stats.accuracy}%`} color="#31a24c" />
                                <StatCard label="Current Streak" value={stats.currentStreak} color="#e69500" />
                                <StatCard label="Best Streak" value={stats.bestStreak} color="#2374e1" />
                                <StatCard label="Diamonds Earned" value={stats.diamondsEarned.toLocaleString()} color="#2374e1" />
                            </div>
                        )}

                        {!isLoading && stats.gamesPlayed === 0 && (
                            <div style={{
                                marginTop: '40px',
                                padding: '40px',
                                background: 'rgba(35, 116, 225, 0.1)',
                                border: '1px solid rgba(35, 116, 225, 0.3)',
                                borderRadius: '12px',
                                textAlign: 'center'
                            }}>
                                <p style={{ color: '#e4e6eb', fontSize: '18px', marginBottom: '16px' }}>
                                    No trivia games played yet!
                                </p>
                                <button
                                    onClick={() => router.push('/hub/trivia')}
                                    style={{
                                        background: '#2374e1',
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
