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
    // Bumped by Retry so a failed load can be run again in place.
    const [reloadKey, setReloadKey] = useState(0);
    const retryLoad = () => {
        setLoadError(null);
        setIsLoading(true);
        setReloadKey(key => key + 1);
    };

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
                // No history at all is an error the player must see, not an
                // empty record; a later page failing keeps what was read.
                if (page === 0) throw error;
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
                const { data: streakData, error: streakError } = await supabase
                    .from('trivia_streaks')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();
                // Streaks are one figure among many; a failed read prints them
                // as zero rather than failing the whole page.
                if (streakError) console.warn('[Stats] Streak read failed:', streakError.message);

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
                const { data: mastery, error: masteryError } = await supabase
                    .from('trivia_category_mastery')
                    .select('category, total_answered, correct_count, mastery_level')
                    .eq('user_id', user.id)
                    .order('total_answered', { ascending: false });
                if (masteryError) console.warn('[Stats] Category mastery read failed:', masteryError.message);

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
    }, [avatarUser?.id, avatarLoading, reloadKey]);

    const StatRow = ({ label, value, ink = '' }) => (
        <li className="tc-row">
            <span className="tc-row__label">{label}</span>
            <span className={`tc-row__value${ink ? ` ${ink}` : ''}`}>{value}</span>
        </li>
    );

    const CategoryRow = ({ category, totalAnswered, correctCount, masteryLevel }) => {
        const meta = CATEGORY_META[category] || {
            label: toTitleCase(String(category || 'Unknown').replaceAll('_', ' ')),
        };
        const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
        return (
            <li
                className="tc-row trivia-progress-category"
                data-category={category}
                aria-label={`${meta.label}: ${correctCount} Of ${totalAnswered} Correct, ${accuracy}% Accuracy${masteryLevel > 1 ? `, Mastery Level ${masteryLevel}` : ''}`}
            >
                <span className="tc-row__label">{meta.label}</span>
                <span className="tc-row__value">
                    <span className="tc-ink--green">{accuracy}%</span>
                    <small>
                        {formatTriviaDisplayNumber(correctCount)} / {formatTriviaDisplayNumber(totalAnswered)}
                        {masteryLevel > 1 ? ` / Level ${masteryLevel}` : ''}
                    </small>
                </span>
            </li>
        );
    };

    const signedOut = !isLoading && !userId;
    const noGames = !isLoading && !loadError && stats.gamesPlayed === 0;
    const trendTotal = recentTrend.reduce((sum, d) => sum + d.games, 0);
    const trendMax = Math.max(1, ...recentTrend.map(d => d.games));

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
                            pill={isLoading
                                ? 'Loading'
                                : loadError
                                    ? 'Error'
                                    : signedOut
                                    ? 'Guest'
                                    : `${formatTriviaDisplayNumber(stats.gamesPlayed)} ${stats.gamesPlayed === 1 ? 'Game' : 'Games'}`}
                            pillInk={loadError ? 'red' : !isLoading && !signedOut && stats.gamesPlayed > 0 ? 'green' : 'blue'}
                            aria-labelledby="trivia-stats-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                            // A failed load has two real actions (Retry, Back To
                            // Trivia), so both print on the painted plates.
                            primaryAction={!isLoading && loadError ? {
                                label: 'Retry',
                                onClick: retryLoad,
                            } : !isLoading && !loadError && stats.gamesPlayed === 0 ? {
                                label: 'Start Playing',
                                onClick: () => router.push('/hub/trivia'),
                            } : undefined}
                        >
                        {isLoading ? (
                            <p className="trivia-progress-state trivia-progress-state--loading" role="status">
                                Loading Stats
                            </p>
                        ) : loadError ? (
                            <section className="trivia-progress-state trivia-progress-state--error" role="alert">
                                <p>{loadError}</p>
                            </section>
                        ) : signedOut ? (
                            <section className="trivia-progress-empty">
                                <p className="trivia-progress-empty-copy">
                                    Sign In To See Your Trivia Stats. Every Game You Finish Is Counted Here.
                                </p>
                            </section>
                        ) : noGames ? (
                            <section className="trivia-progress-empty">
                                <p className="trivia-progress-empty-copy">
                                    No Trivia Games Played Yet!
                                </p>
                            </section>
                        ) : (
                            <div className="trivia-progress-content">
                                <ul className="tc-rows trivia-progress-rows trivia-progress-rows--split" aria-label="Trivia Stats Summary">
                                    <StatRow label="Games Played" value={formatTriviaDisplayNumber(stats.gamesPlayed)} />
                                    <StatRow label="Total Questions" value={formatTriviaDisplayNumber(stats.totalQuestions)} />
                                    <StatRow label="Accuracy" value={accuracyUnknown ? '-' : `${stats.accuracy}%`} ink="tc-ink--green" />
                                    <StatRow label="Current Streak" value={formatTriviaDisplayNumber(stats.currentStreak)} ink="tc-ink--blue" />
                                    <StatRow label="Best Streak" value={formatTriviaDisplayNumber(stats.bestStreak)} ink="tc-ink--blue" />
                                    <StatRow label="Diamonds Earned" value={formatTriviaDisplayNumber(stats.diamondsEarned)} ink="tc-ink--gold" />
                                </ul>

                                {/* Per-Mode Breakdown */}
                                {modeBreakdown.length > 0 && (
                                    <section className="trivia-progress-section" aria-labelledby="trivia-stats-modes">
                                        <h2 id="trivia-stats-modes" className="trivia-progress-heading">
                                            By Mode
                                        </h2>
                                        <div className="trivia-progress-table-wrap">
                                        <table className="trivia-progress-table trivia-progress-table--modes">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Mode</th>
                                                    <th scope="col" className="trivia-progress-table__num">Games</th>
                                                    <th scope="col" className="trivia-progress-table__num">Best Score</th>
                                                    <th scope="col" className="trivia-progress-table__num">Accuracy</th>
                                                    <th scope="col" className="trivia-progress-table__num">Diamonds</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modeBreakdown.map(m => (
                                                    <tr key={m.mode}>
                                                        <th scope="row" className="trivia-progress-table__mode" data-label="Mode">
                                                            {MODE_LABELS[m.mode] || toTitleCase(String(m.mode || 'Unknown').replaceAll('_', ' ').replaceAll('-', ' '))}
                                                        </th>
                                                        <td className="trivia-progress-table__num trivia-progress-table__games" data-label="Games">{formatTriviaDisplayNumber(m.games)}</td>
                                                        <td className="trivia-progress-table__num trivia-progress-table__best" data-label="Best Score">{formatTriviaDisplayNumber(m.best)}</td>
                                                        <td className="trivia-progress-table__num trivia-progress-table__acc" data-label="Accuracy" data-tone="success">
                                                            {m.questions > 0 ? `${m.accuracy}%` : '-'}
                                                        </td>
                                                        <td className="trivia-progress-table__num trivia-progress-table__dia" data-label="Diamonds" data-tone="accent">{formatTriviaDisplayNumber(m.diamonds)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </section>
                                )}

                                {/* 30-Day Activity, derived from play_date. The values
                                    are printed; the bars are a minimal mark for a
                                    genuine daily series, never chrome. */}
                                {recentTrend.some(d => d.games > 0) && (
                                    <section className="trivia-progress-section" aria-labelledby="trivia-stats-activity">
                                        <h2 id="trivia-stats-activity" className="trivia-progress-heading">
                                            Last 30 Days
                                        </h2>
                                        <ul className="tc-rows trivia-progress-rows trivia-progress-rows--split">
                                            <StatRow label="Games" value={formatTriviaDisplayNumber(trendTotal)} />
                                            <StatRow label="Active Days" value={formatTriviaDisplayNumber(recentTrend.filter(d => d.games > 0).length)} />
                                        </ul>
                                        <div
                                            className="trivia-progress-activity"
                                            role="list"
                                            aria-label="Games Played During The Last 30 Days"
                                        >
                                            {recentTrend.map(d => {
                                                const pct = d.games > 0 ? Math.max(8, Math.round((d.games / trendMax) * 100)) : 3;
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
                                        <div className="trivia-progress-activity-axis" aria-hidden="true">
                                            <span>30 Days Ago</span>
                                            <span>Today</span>
                                        </div>
                                    </section>
                                )}

                                {/* Category Mastery Breakdown */}
                                {categoryMastery.length > 0 && (
                                    <section className="trivia-progress-section" aria-labelledby="trivia-stats-categories">
                                        <h2 id="trivia-stats-categories" className="trivia-progress-heading">
                                            Category Breakdown
                                        </h2>
                                        <ul className="tc-rows trivia-progress-rows">
                                            {categoryMastery.map((cat) => (
                                                <CategoryRow
                                                    key={cat.category}
                                                    category={cat.category}
                                                    totalAnswered={cat.total_answered || 0}
                                                    correctCount={cat.correct_count || 0}
                                                    masteryLevel={cat.mastery_level || 1}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </div>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
        </TriviaErrorBoundary>
    );
}
