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
    const [modeBreakdown, setModeBreakdown] = useState([]);
    const [recentTrend, setRecentTrend] = useState([]);
    // True when we have no total-questions figure at all, so accuracy is not
    // merely 0% — it is unknown, and rendering "0%" would be a lie.
    const [accuracyUnknown, setAccuracyUnknown] = useState(false);
    const [loadError, setLoadError] = useState(null);

    const MODE_LABELS = {
        endless: 'Endless',
        survival: 'Survival',
        'time-attack': 'Time Attack',
        pvp: 'PvP',
        tournament: 'Tournament',
        mixed: 'Mixed',
        daily: 'Daily',
        arcade: 'Arcade'
    };

    /**
     * Page through the user's full trivia_scores history.
     * PostgREST caps an unbounded select at the server max-rows setting, so a
     * single .select() silently truncated heavy users' totals.
     */
    async function fetchAllScores(uid) {
        const PAGE = 1000;
        const MAX_PAGES = 20; // 20k rows is far beyond any realistic history
        const all = [];
        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE;
            const { data, error } = await supabase
                .from('trivia_scores')
                .select('correct_count, total_questions, diamonds_earned, mode, score, play_date')
                .eq('user_id', uid)
                .order('play_date', { ascending: false })
                .range(from, from + PAGE - 1);
            if (error) {
                console.warn('[Stats] Score page fetch failed:', error.message);
                break;
            }
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE) break;
        }
        return all;
    }

    /** Games-per-day counts for the last N days, oldest first. */
    function buildTrend(scores, days) {
        const counts = new Map();
        scores.forEach(sc => {
            if (!sc.play_date) return;
            counts.set(sc.play_date, (counts.get(sc.play_date) || 0) + 1);
        });
        const out = [];
        const base = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(base);
            d.setUTCDate(d.getUTCDate() - i);
            const key = d.toISOString().slice(0, 10);
            out.push({ date: key, games: counts.get(key) || 0 });
        }
        return out;
    }

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

                // Get ALL user scores for aggregation.
                // A bare .select() is silently capped by PostgREST's server
                // max-rows (typically 1000), which understated games played /
                // questions / diamonds for any heavy user. Page through with
                // explicit ranges instead.
                const scores = await fetchAllScores(user.id);

                if (scores.length > 0) {
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

                    // Per-mode breakdown — trivia_scores already carries `mode`,
                    // it was simply never surfaced.
                    const byMode = new Map();
                    scores.forEach(sc => {
                        const key = sc.mode || 'unknown';
                        const agg = byMode.get(key) || { mode: key, games: 0, correct: 0, questions: 0, best: 0, diamonds: 0 };
                        agg.games += 1;
                        agg.correct += sc.correct_count || 0;
                        agg.questions += sc.total_questions || 0;
                        agg.diamonds += sc.diamonds_earned || 0;
                        agg.best = Math.max(agg.best, sc.score || 0);
                        byMode.set(key, agg);
                    });
                    setModeBreakdown(
                        Array.from(byMode.values())
                            .map(m => ({ ...m, accuracy: m.questions > 0 ? Math.round((m.correct / m.questions) * 100) : 0 }))
                            .sort((a, b) => b.games - a.games)
                    );

                    // 30-day activity trend from play_date (data already present).
                    setRecentTrend(buildTrend(scores, 30));
                } else if (streakData) {
                    // No score rows yet. `total_correct` is a count of CORRECT
                    // answers — the old code assigned it to totalQuestions too,
                    // which claimed a 1:1 questions-to-correct ratio while still
                    // rendering 0% accuracy. Show only what we actually know.
                    const knownCorrect = streakData.total_correct || 0;
                    const knownQuestions = streakData.total_questions ?? null;
                    setStats(prev => ({
                        ...prev,
                        currentStreak: streakData.current_streak || 0,
                        bestStreak: streakData.best_streak || 0,
                        totalQuestions: knownQuestions ?? 0,
                        correctAnswers: knownCorrect,
                        accuracy: knownQuestions > 0 ? Math.round((knownCorrect / knownQuestions) * 100) : 0,
                        gamesPlayed: streakData.total_games_played || 0
                    }));
                    setAccuracyUnknown(knownQuestions == null || knownQuestions <= 0);
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
                setLoadError('We could not load your stats right now. Please try again.');
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
                        ) : loadError ? (
                            <div role="alert" style={{
                                padding: '40px',
                                textAlign: 'center',
                                background: 'rgba(240, 40, 73, 0.1)',
                                border: '1px solid rgba(240, 40, 73, 0.35)',
                                borderRadius: '12px',
                                color: '#f02849'
                            }}>
                                {loadError}
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                                    <StatCard label="Games Played" value={stats.gamesPlayed.toLocaleString()} />
                                    <StatCard label="Total Questions" value={stats.totalQuestions.toLocaleString()} />
                                    <StatCard label="Accuracy" value={accuracyUnknown ? '—' : `${stats.accuracy}%`} color="#31a24c" />
                                    <StatCard label="Current Streak" value={stats.currentStreak} color="#e69500" />
                                    <StatCard label="Best Streak" value={stats.bestStreak} color="#2374e1" />
                                    <StatCard label="Diamonds Earned" value={stats.diamondsEarned.toLocaleString()} color="#2374e1" />
                                </div>

                                {/* Per-Mode Breakdown */}
                                {modeBreakdown.length > 0 && (
                                    <div style={{
                                        marginTop: '30px',
                                        padding: '24px',
                                        background: '#242526',
                                        border: '1px solid #4e4f50',
                                        borderRadius: '12px',
                                        overflowX: 'auto'
                                    }}>
                                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#e4e6eb', marginBottom: '20px' }}>
                                            By Mode
                                        </h2>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '460px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left', color: '#65676b', fontWeight: 600, fontSize: '13px', padding: '8px 12px 8px 0' }}>Mode</th>
                                                    <th style={{ textAlign: 'right', color: '#65676b', fontWeight: 600, fontSize: '13px', padding: '8px 12px' }}>Games</th>
                                                    <th style={{ textAlign: 'right', color: '#65676b', fontWeight: 600, fontSize: '13px', padding: '8px 12px' }}>Best Score</th>
                                                    <th style={{ textAlign: 'right', color: '#65676b', fontWeight: 600, fontSize: '13px', padding: '8px 12px' }}>Accuracy</th>
                                                    <th style={{ textAlign: 'right', color: '#65676b', fontWeight: 600, fontSize: '13px', padding: '8px 0 8px 12px' }}>Diamonds</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modeBreakdown.map(m => (
                                                    <tr key={m.mode} style={{ borderTop: '1px solid #3a3b3c' }}>
                                                        <td style={{ color: '#e4e6eb', padding: '10px 12px 10px 0', textTransform: 'capitalize' }}>
                                                            {MODE_LABELS[m.mode] || m.mode}
                                                        </td>
                                                        <td style={{ color: '#b0b3b8', textAlign: 'right', padding: '10px 12px' }}>{m.games.toLocaleString()}</td>
                                                        <td style={{ color: '#b0b3b8', textAlign: 'right', padding: '10px 12px' }}>{m.best.toLocaleString()}</td>
                                                        <td style={{ color: '#31a24c', textAlign: 'right', padding: '10px 12px', fontWeight: 700 }}>
                                                            {m.questions > 0 ? `${m.accuracy}%` : '—'}
                                                        </td>
                                                        <td style={{ color: '#2374e1', textAlign: 'right', padding: '10px 0 10px 12px', fontWeight: 700 }}>{m.diamonds.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* 30-Day Activity — derived from play_date, already stored */}
                                {recentTrend.some(d => d.games > 0) && (
                                    <div style={{
                                        marginTop: '30px',
                                        padding: '24px',
                                        background: '#242526',
                                        border: '1px solid #4e4f50',
                                        borderRadius: '12px'
                                    }}>
                                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#e4e6eb', marginBottom: '4px' }}>
                                            Last 30 Days
                                        </h2>
                                        <div style={{ color: '#65676b', fontSize: '13px', marginBottom: '16px' }}>
                                            {recentTrend.reduce((sum, d) => sum + d.games, 0)} games ·{' '}
                                            {recentTrend.filter(d => d.games > 0).length} active days
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '72px' }}>
                                            {recentTrend.map(d => {
                                                const max = Math.max(1, ...recentTrend.map(x => x.games));
                                                const pct = d.games > 0 ? Math.max(8, Math.round((d.games / max) * 100)) : 3;
                                                return (
                                                    <div
                                                        key={d.date}
                                                        title={`${d.date}: ${d.games} game${d.games === 1 ? '' : 's'}`}
                                                        style={{
                                                            flex: 1,
                                                            height: `${pct}%`,
                                                            minWidth: '4px',
                                                            background: d.games > 0 ? '#2374e1' : '#3a3b3c',
                                                            borderRadius: '2px'
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

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
