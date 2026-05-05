/**
 * Trivia - Player Stats
 * Fetches real user data from Supabase
 * Uses SmarterPoker Dark color schema
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function TriviaStats() {
    useTrainingBus('trivia-stats');
    const router = useRouter();
    // Reactive user from AvatarContext so the realtime channel effect below
    // re-runs when auth resolves after first render. Previously used
    // getAuthUser() inside an empty-deps useEffect — if user wasn't loaded
    // on mount, the realtime sub never registered.
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
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
    const [categoryMastery, setCategoryMastery] = useState([]);

    // Human-readable category labels and colors
    const CATEGORY_META = {
        poker_history: { label: 'Poker History', color: '#f97316' },
        famous_hands: { label: 'Famous Hands', color: '#fbbf24' },
        player_profiles: { label: 'Player Profiles', color: '#a855f7' },
        tournament_facts: { label: 'Tournament Facts', color: '#ec4899' },
        rule_knowledge: { label: 'Rules', color: '#3b82f6' },
        gto_theory: { label: 'GTO Theory', color: '#22c55e' },
        mtt_situations: { label: 'MTT Scenarios', color: '#ef4444' },
        cash_game_situations: { label: 'Cash Game', color: '#14b8a6' },
        icm_chip_ev: { label: 'ICM & Chip EV', color: '#8b5cf6' },
        gto_scenarios: { label: 'GTO Scenarios', color: '#06b6d4' },
    };

    useEffect(() => {
        // Wait for auth resolution before issuing queries
        if (avatarLoading) return;
        async function loadStats() {
            try {
                const user = avatarUser || getAuthUser();

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
                    .maybeSingle();

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

                // Fetch category mastery data
                const { data: mastery } = await supabase
                    .from('trivia_category_mastery')
                    .select('category, total_answered, correct_count, mastery_level')
                    .eq('user_id', user.id)
                    .order('total_answered', { ascending: false });

                if (mastery && mastery.length > 0) {
                    setCategoryMastery(mastery);
                }
            } catch (error) {
                console.warn('Error loading stats:', error);
            }
            setIsLoading(false);
        }

        loadStats();

        // Realtime subscription — live updates (same scope as loadStats)
        const user = avatarUser || getAuthUser();
        if (!user) return;
        const _ch = supabase
            .channel(`trivia-stats:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${user.id}` }, () => { loadStats(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [avatarUser?.id, avatarLoading]);

    const StatCard = ({ label, value, color }) => (
        <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '24px' }}>
            <div style={{ color: '#65676b', fontSize: '14px', marginBottom: '8px' }}>{label}</div>
            <div style={{ color: color || '#e4e6eb', fontSize: '32px', fontWeight: 'bold' }}>{value}</div>
        </div>
    );

    const CategoryBar = ({ category, totalAnswered, correctCount, masteryLevel }) => {
        const meta = CATEGORY_META[category] || { label: category, color: '#65676b' };
        const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
        const barWidth = Math.max(accuracy, 2); // Minimum 2% width for visibility
        return (
            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ color: '#e4e6eb', fontSize: '14px', fontWeight: '500' }}>{meta.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#65676b', fontSize: '12px' }}>{correctCount}/{totalAnswered}</span>
                        <span style={{ color: meta.color, fontSize: '14px', fontWeight: '700', minWidth: '40px', textAlign: 'right' }}>{accuracy}%</span>
                    </div>
                </div>
                <div style={{ height: '8px', background: '#3a3b3c', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        background: `linear-gradient(90deg, ${meta.color}, ${meta.color}cc)`,
                        borderRadius: '4px',
                        transition: 'width 0.8s ease-out',
                        boxShadow: `0 0 8px ${meta.color}40`,
                    }} />
                </div>
                {masteryLevel > 1 && (
                    <div style={{ color: '#65676b', fontSize: '11px', marginTop: '3px' }}>
                        Mastery Level {masteryLevel}
                    </div>
                )}
            </div>
        );
    };

    return (
        <TriviaErrorBoundary pageName="Stats">
        <>
            <SEOHead
                title="Trivia Stats — Your Performance"
                description="View Your Poker Trivia Performance Stats, Accuracy Rates, And Category Breakdowns."
                canonical="/hub/trivia/stats"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#18191a' }}>
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
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                                    <StatCard label="Games Played" value={stats.gamesPlayed.toLocaleString()} />
                                    <StatCard label="Total Questions" value={stats.totalQuestions.toLocaleString()} />
                                    <StatCard label="Accuracy" value={`${stats.accuracy}%`} color="#31a24c" />
                                    <StatCard label="Current Streak" value={stats.currentStreak} color="#e69500" />
                                    <StatCard label="Best Streak" value={stats.bestStreak} color="#2374e1" />
                                    <StatCard label="Diamonds Earned" value={stats.diamondsEarned.toLocaleString()} color="#2374e1" />
                                </div>

                                {/* Category Mastery Breakdown */}
                                {categoryMastery.length > 0 && (
                                    <div style={{
                                        marginTop: '30px',
                                        padding: '24px',
                                        background: '#242526',
                                        border: '1px solid #4e4f50',
                                        borderRadius: '12px',
                                    }}>
                                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#e4e6eb', marginBottom: '20px' }}>
                                            Category Breakdown
                                        </h2>
                                        {categoryMastery.map((cat) => (
                                            <CategoryBar
                                                key={cat.category}
                                                category={cat.category}
                                                totalAnswered={cat.total_answered || 0}
                                                correctCount={cat.correct_count || 0}
                                                masteryLevel={cat.mastery_level || 1}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
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
                  <BottomNavBar />
    </PageTransition>
        </>
        </TriviaErrorBoundary>
    );
}
