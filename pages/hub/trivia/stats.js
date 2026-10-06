import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART } from '../../../src/config/triviaIntroArt.mjs';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import useOnlineStatus from '../../../src/hooks/useOnlineStatus';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import {
    TRIVIA_PERIOD_FILTERS,
    TRIVIA_STATS_MODE_FILTERS,
    filterTriviaScores,
    summarizeModes,
    summarizeTriviaScores,
    triviaModeLabel,
} from '../../../src/lib/trivia/progressAccount.mjs';

const SCORE_PAGE_SIZE = 1000;
const SCORE_PAGE_LIMIT = 20;

const CATEGORY_META = {
    poker_history: 'Poker History',
    famous_hands: 'Famous Hands',
    player_profiles: 'Player Profiles',
    tournament_facts: 'Tournament Facts',
    rule_knowledge: 'Rules',
    gto_theory: 'GTO Theory',
    mtt_situations: 'MTT Scenarios',
    cash_game_situations: 'Cash Game',
    icm_chip_ev: 'ICM And Chip EV',
    gto_scenarios: 'GTO Scenarios',
};

async function fetchVerifiedScores(userId) {
    const rows = [];
    let partial = false;
    for (let page = 0; page < SCORE_PAGE_LIMIT; page += 1) {
        const from = page * SCORE_PAGE_SIZE;
        const { data, error } = await supabase
            .from('trivia_scores')
            .select('id, correct_count, total_questions, diamonds_earned, mode, score, play_date, server_verified')
            .eq('user_id', userId)
            .eq('server_verified', true)
            .order('play_date', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + SCORE_PAGE_SIZE - 1);
        if (error) {
            if (page === 0) throw error;
            partial = true;
            break;
        }
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < SCORE_PAGE_SIZE) break;
        if (page === SCORE_PAGE_LIMIT - 1) partial = true;
    }
    return { rows, partial };
}

function currentStreakForToday(streak, today) {
    const value = Math.max(0, Number(streak?.current_streak) || 0);
    const last = String(streak?.last_play_date || '');
    if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return value;
    const todayDate = new Date(`${today}T12:00:00.000Z`);
    const lastDate = new Date(`${last}T12:00:00.000Z`);
    const days = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000);
    return days > 1 ? 0 : value;
}

function buildTrend(scores, today, days = 30) {
    const counts = new Map();
    for (const score of scores) {
        if (!score?.play_date) continue;
        counts.set(score.play_date, (counts.get(score.play_date) || 0) + 1);
    }
    const base = new Date(`${today}T12:00:00.000Z`);
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(base);
        date.setUTCDate(date.getUTCDate() - (days - 1 - index));
        const key = date.toISOString().slice(0, 10);
        return { date: key, games: counts.get(key) || 0 };
    });
}

function StatRow({ label, value, ink = '' }) {
    return (
        <li className="tc-row">
            <span className="tc-row__label">{label}</span>
            <span className={`tc-row__value${ink ? ` ${ink}` : ''}`}>{value}</span>
        </li>
    );
}

function CategoryRow({ row }) {
    const total = Math.max(0, Number(row?.total_answered) || 0);
    const correct = Math.max(0, Number(row?.correct_count) || 0);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;
    const label = CATEGORY_META[row?.category]
        || toTitleCase(String(row?.category || 'Unknown').replaceAll('_', ' '));
    return (
        <li
            className="tc-row trivia-progress-category"
            data-category={row?.category}
            aria-label={`${label}: ${correct} Of ${total} Correct${accuracy === null ? '' : `, ${accuracy}% Accuracy`}`}
        >
            <span className="tc-row__label">{label}</span>
            <span className="tc-row__value">
                <span className="tc-ink--green">{accuracy === null ? 'Not Available' : `${accuracy}%`}</span>
                <small>{formatTriviaDisplayNumber(correct)} / {formatTriviaDisplayNumber(total)}</small>
            </span>
        </li>
    );
}

export default function TriviaStats() {
    useTrainingBus('trivia-stats');
    const router = useRouter();
    const online = useOnlineStatus();
    const { user: avatarUser, loading: avatarLoading } = useAvatar();
    const [modeFilter, setModeFilter] = usePersistedState('sp-filters-trivia-stats-mode', 'all');
    const [period, setPeriod] = usePersistedState('sp-filters-trivia-stats-period', 'all');
    const [userId, setUserId] = useState(null);
    const [scores, setScores] = useState([]);
    const [streak, setStreak] = useState(null);
    const [categoryMastery, setCategoryMastery] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [partialReasons, setPartialReasons] = useState([]);
    const [connectionState, setConnectionState] = useState('connecting');
    const [loadedAt, setLoadedAt] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    const loadStats = useCallback(async (user, cancelled) => {
        setLoadError('');
        const partial = [];
        try {
            const scoreResult = await fetchVerifiedScores(user.id);
            if (cancelled()) return;
            setScores(scoreResult.rows);
            if (scoreResult.partial) partial.push('Some Verified Score History Is Outside The Current Read Window.');

            const [{ data: streakData, error: streakError }, { data: masteryData, error: masteryError }] = await Promise.all([
                supabase
                    .from('trivia_streaks')
                    .select('current_streak, best_streak, last_play_date, updated_at')
                    .eq('user_id', user.id)
                    .maybeSingle(),
                supabase
                    .from('trivia_category_mastery')
                    .select('category, total_answered, correct_count, mastery_level, updated_at')
                    .eq('user_id', user.id)
                    .order('total_answered', { ascending: false }),
            ]);
            if (cancelled()) return;
            if (streakError) partial.push('Streak Data Could Not Be Refreshed.');
            else setStreak(streakData || null);
            if (masteryError) partial.push('Category Mastery Could Not Be Refreshed.');
            else setCategoryMastery(masteryData || []);
            setPartialReasons(partial);
            setLoadedAt(new Date());
        } catch (error) {
            console.warn('[TriviaStats] Load failed:', error?.message || error);
            if (!cancelled()) setLoadError('We Could Not Load Your Verified Stats Right Now. Please Try Again.');
        } finally {
            if (!cancelled()) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (avatarLoading) return undefined;
        let stopped = false;
        const cancelled = () => stopped;
        const user = avatarUser || getAuthUser();

        if (!user) {
            setUserId(null);
            setScores([]);
            setStreak(null);
            setCategoryMastery([]);
            setPartialReasons([]);
            setLoadError('');
            setIsLoading(false);
            setConnectionState('guest');
            return () => { stopped = true; };
        }

        setUserId(user.id);
        setScores([]);
        setStreak(null);
        setCategoryMastery([]);
        setPartialReasons([]);
        setLoadedAt(null);
        setConnectionState('connecting');
        setIsLoading(true);
        loadStats(user, cancelled);
        const channel = supabase
            .channel(`trivia-stats:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'trivia_scores',
                filter: `user_id=eq.${user.id}`,
            }, () => loadStats(user, cancelled))
            .subscribe((status) => {
                if (stopped) return;
                if (status === 'SUBSCRIBED') setConnectionState('live');
                else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnectionState('stale');
                else setConnectionState('connecting');
            });
        return () => {
            stopped = true;
            supabase.removeChannel(channel);
        };
    }, [avatarLoading, avatarUser?.id, loadStats, reloadKey]);

    const today = getTodayCST();
    const validMode = TRIVIA_STATS_MODE_FILTERS.some((option) => option.id === modeFilter) ? modeFilter : 'all';
    const validPeriod = TRIVIA_PERIOD_FILTERS.some((option) => option.id === period) ? period : 'all';
    const periodScores = useMemo(
        () => filterTriviaScores(scores, { mode: validMode, period: validPeriod, today }),
        [scores, today, validMode, validPeriod],
    );
    const trendScores = useMemo(
        () => filterTriviaScores(scores, { mode: validMode, period: 'month', today }),
        [scores, today, validMode],
    );
    const summary = useMemo(() => summarizeTriviaScores(periodScores), [periodScores]);
    const modeBreakdown = useMemo(
        () => summarizeModes(filterTriviaScores(scores, { mode: 'all', period: validPeriod, today })),
        [scores, today, validPeriod],
    );
    const recentTrend = useMemo(() => buildTrend(trendScores, today), [trendScores, today]);
    const currentStreak = currentStreakForToday(streak, today);
    const signedOut = !isLoading && !userId;
    const noGames = !isLoading && !loadError && userId && summary.gamesPlayed === 0;
    const activeDays = recentTrend.filter((item) => item.games > 0).length;
    const trendTotal = recentTrend.reduce((sum, item) => sum + item.games, 0);
    const trendMax = Math.max(1, ...recentTrend.map((item) => item.games));
    const stale = userId && (!online || connectionState === 'stale');

    const retry = () => {
        setIsLoading(true);
        setReloadKey((key) => key + 1);
    };

    return (
        <TriviaErrorBoundary pageName="Stats">
            <>
                <SEOHead
                    title="Trivia Stats - Your Performance"
                    description="View Your Verified Poker Trivia Performance, Accuracy, Activity, And Category Mastery."
                    canonical="/hub/trivia/stats"
                    noindex
                />
                <PageTransition>
                    <div className="trivia-progress-page trivia-progress-page--stats" data-trivia-family="progress" data-trivia-surface="stats">
                        <UniversalHeader pageDepth={2} />
                        <main className="trivia-progress-shell" aria-labelledby="trivia-stats-title">
                            <TriviaConsole
                                className="trivia-progress-console"
                                eyebrow="Player Progress"
                                title="My Trivia Stats"
                                titleAs="h1"
                                titleId="trivia-stats-title"
                                subtitle="Verified Performance Desk"
                                pill={isLoading ? 'Loading' : loadError ? 'Error' : signedOut ? 'Guest' : `${formatTriviaDisplayNumber(summary.gamesPlayed)} ${summary.gamesPlayed === 1 ? 'Game' : 'Games'}`}
                                pillInk={loadError ? 'red' : summary.gamesPlayed > 0 ? 'green' : 'blue'}
                                secondaryAction={{ label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }}
                                primaryAction={!isLoading && loadError
                                    ? { label: 'Retry', onClick: retry }
                                    : signedOut
                                        ? { label: 'Sign In', onClick: () => router.push('/auth/login?redirect=/hub/trivia/stats') }
                                        : noGames
                                            ? { label: 'Start Playing', onClick: () => router.push('/hub/trivia') }
                                            : undefined}
                            >
                                <ResponsiveModeArt art={TRIVIA_INTRO_ART.stats} priority />
                                {isLoading ? (
                                    <p className="trivia-progress-state trivia-progress-state--loading" role="status">Loading Verified Stats</p>
                                ) : loadError ? (
                                    <section className="trivia-progress-state trivia-progress-state--error" role="alert"><p>{loadError}</p></section>
                                ) : signedOut ? (
                                    <section className="trivia-progress-empty">
                                        <p className="trivia-progress-empty-copy">Sign In To See Personal History. Guest Visits Never Appear As Zero-Value Stats.</p>
                                    </section>
                                ) : (
                                    <div className="trivia-progress-content trivia-progress-content--stats">
                                        <div className="trivia-progress-filter-bank" aria-label="Stats Filters">
                                            <fieldset className="trivia-progress-filter">
                                                <legend className="tc-label">Time Range</legend>
                                                <div className="trivia-progress-filter__options">
                                                    {TRIVIA_PERIOD_FILTERS.map((option) => (
                                                        <button key={option.id} type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validPeriod === option.id} onClick={() => setPeriod(option.id)}>{option.label}</button>
                                                    ))}
                                                </div>
                                            </fieldset>
                                            <fieldset className="trivia-progress-filter">
                                                <legend className="tc-label">Game Mode</legend>
                                                <div className="trivia-progress-filter__options">
                                                    {TRIVIA_STATS_MODE_FILTERS.map((option) => (
                                                        <button key={option.id} type="button" className="tc-word trivia-progress-filter__option" aria-pressed={validMode === option.id} onClick={() => setModeFilter(option.id)}>{option.label}</button>
                                                    ))}
                                                </div>
                                            </fieldset>
                                        </div>

                                        {stale ? (
                                            <section className="trivia-progress-notice trivia-progress-notice--warning" role="status">
                                                <p>{online ? 'Live Updates Paused. The Last Verified Read Remains Visible.' : 'Offline. The Last Verified Read Remains Visible.'}</p>
                                            </section>
                                        ) : null}
                                        {partialReasons.length > 0 ? (
                                            <section className="trivia-progress-notice trivia-progress-notice--warning" role="status">
                                                <p>Partial Data</p>
                                                <ul>{partialReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                                            </section>
                                        ) : null}

                                        {noGames ? (
                                            <section className="trivia-progress-empty"><p className="trivia-progress-empty-copy">No Verified Games Match These Filters Yet.</p></section>
                                        ) : (
                                            <>
                                                <section className="trivia-progress-section trivia-progress-stats-desk" aria-labelledby="trivia-stats-summary">
                                                    <h2 id="trivia-stats-summary" className="trivia-progress-heading">Verified Summary</h2>
                                                    <ul className="tc-rows trivia-progress-rows trivia-progress-rows--split" aria-label="Verified Trivia Stats Summary">
                                                        <StatRow label="Games Played" value={formatTriviaDisplayNumber(summary.gamesPlayed)} />
                                                        <StatRow label="Questions Graded" value={formatTriviaDisplayNumber(summary.totalQuestions)} />
                                                        <StatRow label="Correct Answers" value={formatTriviaDisplayNumber(summary.correctAnswers)} />
                                                        <StatRow label="Accuracy" value={summary.accuracy === null ? 'Not Available' : `${summary.accuracy}%`} ink="tc-ink--green" />
                                                        <StatRow label="Current Daily Streak" value={formatTriviaDisplayNumber(currentStreak)} ink="tc-ink--blue" />
                                                        <StatRow label="Best Daily Streak" value={formatTriviaDisplayNumber(Math.max(0, Number(streak?.best_streak) || 0))} ink="tc-ink--blue" />
                                                        <StatRow label="Settled Run Diamonds" value={formatTriviaDisplayNumber(summary.diamondsEarned)} ink="tc-ink--gold" />
                                                    </ul>
                                                </section>

                                                {recentTrend.some((item) => item.games > 0) ? (
                                                    <section className="trivia-progress-section trivia-progress-stats-activity" aria-labelledby="trivia-stats-activity">
                                                        <h2 id="trivia-stats-activity" className="trivia-progress-heading">Last 30 Days</h2>
                                                        <p className="trivia-progress-summary">{formatTriviaDisplayNumber(trendTotal)} Verified {trendTotal === 1 ? 'Game' : 'Games'} Across {formatTriviaDisplayNumber(activeDays)} Active {activeDays === 1 ? 'Day' : 'Days'}</p>
                                                        <div className="trivia-progress-activity" role="list" aria-label="Verified Games During The Last 30 Days">
                                                            {recentTrend.map((item) => (
                                                                <div
                                                                    key={item.date}
                                                                    className="trivia-progress-activity-bar"
                                                                    data-active={item.games > 0 ? 'true' : 'false'}
                                                                    role="listitem"
                                                                    aria-label={`${item.date}: ${formatTriviaDisplayNumber(item.games)} ${item.games === 1 ? 'Game' : 'Games'}`}
                                                                    style={{ '--trivia-progress-bar-height': `${item.games > 0 ? Math.max(8, Math.round((item.games / trendMax) * 100)) : 3}%` }}
                                                                />
                                                            ))}
                                                        </div>
                                                        <div className="trivia-progress-activity-axis" aria-hidden="true"><span>30 Days Ago</span><span>Today</span></div>
                                                    </section>
                                                ) : null}

                                                {modeBreakdown.length > 0 ? (
                                                    <section className="trivia-progress-section trivia-progress-stats-modes" aria-labelledby="trivia-stats-modes">
                                                        <h2 id="trivia-stats-modes" className="trivia-progress-heading">Comparable Mode Desks</h2>
                                                        <div className="trivia-progress-table-wrap">
                                                            <table className="trivia-progress-table trivia-progress-table--modes">
                                                                <caption>Each Row Uses One Game Mode Only</caption>
                                                                <thead><tr><th scope="col">Mode</th><th scope="col" className="trivia-progress-table__num">Games</th><th scope="col" className="trivia-progress-table__num">Best Score</th><th scope="col" className="trivia-progress-table__num">Accuracy</th><th scope="col" className="trivia-progress-table__num">Diamonds</th></tr></thead>
                                                                <tbody>
                                                                    {modeBreakdown.map((entry) => (
                                                                        <tr key={entry.mode}>
                                                                            <th scope="row" className="trivia-progress-table__mode" data-label="Mode">{triviaModeLabel(entry.mode)}</th>
                                                                            <td className="trivia-progress-table__num trivia-progress-table__games" data-label="Games">{formatTriviaDisplayNumber(entry.games)}</td>
                                                                            <td className="trivia-progress-table__num trivia-progress-table__best" data-label="Best Score">{formatTriviaDisplayNumber(entry.best)}</td>
                                                                            <td className="trivia-progress-table__num trivia-progress-table__acc" data-label="Accuracy" data-tone="success">{entry.accuracy === null ? 'Not Available' : `${entry.accuracy}%`}</td>
                                                                            <td className="trivia-progress-table__num trivia-progress-table__dia" data-label="Diamonds" data-tone="accent">{formatTriviaDisplayNumber(entry.diamonds)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </section>
                                                ) : null}

                                                {categoryMastery.length > 0 ? (
                                                    <section className="trivia-progress-section trivia-progress-stats-mastery" aria-labelledby="trivia-stats-categories">
                                                        <h2 id="trivia-stats-categories" className="trivia-progress-heading">Lifetime Category Mastery</h2>
                                                        <ul className="tc-rows trivia-progress-rows">{categoryMastery.map((row) => <CategoryRow key={row.category} row={row} />)}</ul>
                                                    </section>
                                                ) : null}
                                            </>
                                        )}
                                        {loadedAt ? <p className="trivia-progress-read-time">Last Verified Read {loadedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p> : null}
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
