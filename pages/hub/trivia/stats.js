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
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

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

    // Human-readable category labels. Visual accents belong to the shared
    // progress-family chassis rather than being painted independently here.
    const CATEGORY_META = {
        poker_history: { label: 'Poker History' },
        famous_hands: { label: 'Famous Hands' },
        player_profiles: { label: 'Player Profiles' },
        tournament_facts: { label: 'Tournament Facts' },
        rule_knowledge: { label: 'Rules' },
        gto_theory: { label: 'GTO Theory' },
        mtt_situations: { label: 'MTT Scenarios' },
        cash_game_situations: { label: 'Cash Game' },
        icm_chip_ev: { label: 'ICM & Chip EV' },
        gto_scenarios: { label: 'GTO Scenarios' },
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
                setLoadError('We Could Not Load Your Stats Right Now. Please Try Again.');
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

    const StatCard = ({ label, value, tone = 'default' }) => (
        <div className="trivia-progress-stat-card" data-tone={tone}>
            <div className="trivia-progress-stat-label">{label}</div>
            <div className="trivia-progress-stat-value">{value}</div>
        </div>
    );

    const CategoryBar = ({ category, totalAnswered, correctCount, masteryLevel }) => {
        const meta = CATEGORY_META[category] || {
            label: toTitleCase(String(category || 'Unknown').replaceAll('_', ' ')),
        };
        const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
        const barWidth = Math.max(accuracy, 2); // Minimum 2% width for visibility
        return (
            <div className="trivia-progress-category" data-category={category}>
                <div className="trivia-progress-category-header">
                    <span className="trivia-progress-category-name">{meta.label}</span>
                    <div className="trivia-progress-category-values">
                        <span className="trivia-progress-category-count">
                            {formatTriviaDisplayNumber(correctCount)}/{formatTriviaDisplayNumber(totalAnswered)}
                        </span>
                        <span className="trivia-progress-category-accuracy">{accuracy}%</span>
                    </div>
                </div>
                <div
                    className="trivia-progress-meter"
                    role="progressbar"
                    aria-label={`${meta.label} Accuracy`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={accuracy}
                >
                    <div
                        className="trivia-progress-meter-fill"
                        style={{ '--trivia-progress-meter-value': `${barWidth}%` }}
                    />
                </div>
                {masteryLevel > 1 && (
                    <div className="trivia-progress-category-level">
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
                title="Trivia Stats - Your Performance"
                description="View Your Poker Trivia Performance Stats, Accuracy Rates, And Category Breakdowns."
                canonical="/hub/trivia/stats"
                noindex={true}
            />

            <PageTransition>
                <div
                    className="trivia-progress-page trivia-progress-page--stats"
                    data-trivia-family="progress"
                    data-trivia-surface="stats"
                >
                    <UniversalHeader pageDepth={2} />

                    <main className="trivia-progress-shell">
                        <TriviaConsole
                            className="trivia-progress-console"
                            eyebrow="Player Progress"
                            title="My Trivia Stats"
                            titleAs="h1"
                            titleId="trivia-stats-title"
                            subtitle="Performance Overview"
                            aria-labelledby="trivia-stats-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                            primaryAction={!isLoading && stats.gamesPlayed === 0 ? {
                                label: 'Start Playing',
                                onClick: () => router.push('/hub/trivia'),
                            } : undefined}
                        >
                        {isLoading ? (
                            <div className="trivia-progress-state trivia-progress-state--loading" role="status">
                                Loading Stats...
                            </div>
                        ) : loadError ? (
                            <div className="trivia-progress-state trivia-progress-state--error" role="alert">
                                {loadError}
                            </div>
                        ) : (
                            <>
                                <section className="trivia-progress-stat-grid" aria-label="Trivia Stats Summary">
                                    <StatCard label="Games Played" value={formatTriviaDisplayNumber(stats.gamesPlayed)} />
                                    <StatCard label="Total Questions" value={formatTriviaDisplayNumber(stats.totalQuestions)} />
                                    <StatCard label="Accuracy" value={accuracyUnknown ? '-' : `${stats.accuracy}%`} tone="success" />
                                    <StatCard label="Current Streak" value={formatTriviaDisplayNumber(stats.currentStreak)} tone="accent" />
                                    <StatCard label="Best Streak" value={formatTriviaDisplayNumber(stats.bestStreak)} tone="accent" />
                                    <StatCard label="Diamonds Earned" value={formatTriviaDisplayNumber(stats.diamondsEarned)} tone="accent" />
                                </section>

                                {/* Per-Mode Breakdown */}
                                {modeBreakdown.length > 0 && (
                                    <section className="trivia-progress-panel trivia-progress-panel--modes">
                                        <h2 className="trivia-progress-panel-title">
                                            By Mode
                                        </h2>
                                        <div className="trivia-progress-table-wrap">
                                        <table className="trivia-progress-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Mode</th>
                                                    <th scope="col">Games</th>
                                                    <th scope="col">Best Score</th>
                                                    <th scope="col">Accuracy</th>
                                                    <th scope="col">Diamonds</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modeBreakdown.map(m => (
                                                    <tr key={m.mode}>
                                                        <th scope="row" data-label="Mode">
                                                            {MODE_LABELS[m.mode] || toTitleCase(String(m.mode || 'Unknown').replaceAll('_', ' '))}
                                                        </th>
                                                        <td data-label="Games">{formatTriviaDisplayNumber(m.games)}</td>
                                                        <td data-label="Best Score">{formatTriviaDisplayNumber(m.best)}</td>
                                                        <td data-label="Accuracy" data-tone="success">
                                                            {m.questions > 0 ? `${m.accuracy}%` : '-'}
                                                        </td>
                                                        <td data-label="Diamonds" data-tone="accent">{formatTriviaDisplayNumber(m.diamonds)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </section>
                                )}

                                {/* 30-Day Activity — derived from play_date, already stored */}
                                {recentTrend.some(d => d.games > 0) && (
                                    <section className="trivia-progress-panel trivia-progress-panel--activity">
                                        <h2 className="trivia-progress-panel-title">
                                            Last 30 Days
                                        </h2>
                                        <div className="trivia-progress-panel-summary">
                                            {formatTriviaDisplayNumber(recentTrend.reduce((sum, d) => sum + d.games, 0))} Games ·{' '}
                                            {formatTriviaDisplayNumber(recentTrend.filter(d => d.games > 0).length)} Active Days
                                        </div>
                                        <div
                                            className="trivia-progress-activity"
                                            role="list"
                                            aria-label="Games Played During The Last 30 Days"
                                        >
                                            {recentTrend.map(d => {
                                                const max = Math.max(1, ...recentTrend.map(x => x.games));
                                                const pct = d.games > 0 ? Math.max(8, Math.round((d.games / max) * 100)) : 3;
                                                return (
                                                    <div
                                                        key={d.date}
                                                        className="trivia-progress-activity-bar"
                                                        data-active={d.games > 0 ? 'true' : 'false'}
                                                        role="listitem"
                                                        aria-label={`${d.date}: ${formatTriviaDisplayNumber(d.games)} ${d.games === 1 ? 'Game' : 'Games'}`}
                                                        style={{ '--trivia-progress-bar-height': `${pct}%` }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Category Mastery Breakdown */}
                                {categoryMastery.length > 0 && (
                                    <section className="trivia-progress-panel trivia-progress-panel--categories">
                                        <h2 className="trivia-progress-panel-title">
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
                                    </section>
                                )}
                            </>
                        )}

                        {!isLoading && stats.gamesPlayed === 0 && (
                            <section className="trivia-progress-empty">
                                <p className="trivia-progress-empty-copy">
                                    No Trivia Games Played Yet!
                                </p>
                            </section>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
        </TriviaErrorBoundary>
    );
}
