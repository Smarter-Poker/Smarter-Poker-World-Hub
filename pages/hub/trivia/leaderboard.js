/**
 * Trivia - Leaderboard
 * Fetches real rankings from Supabase trivia_scores table
 * Uses SmarterPoker Dark color schema
 */

import { useState, useEffect } from 'react';
import useHasMounted from '../../../src/hooks/useHasMounted';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
// Single source of truth for the CST day boundary (Phase 73). This page used to
// re-implement getTodayCST/getDateDaysAgo locally, via the
// `new Date(now.toLocaleString(...))` round-trip that the shared lib explicitly
// documents as undefined behaviour — so the leaderboard's day window could drift
// away from the play_date the game pages actually write.
import { getTodayCST, getCSTDateParts } from '../../../src/lib/trivia/getTodayCST';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';

// Ranking raw `score` across all modes is not like-for-like: endless scores
// streak*100 with no ceiling and structurally dominates the 10-question modes.
// A mode filter lets players compare within a mode.
const MODE_FILTERS = [
    { id: 'all', label: 'All Modes' },
    { id: 'endless', label: 'Endless' },
    { id: 'survival', label: 'Survival' },
    { id: 'time-attack', label: 'Time Attack' },
    { id: 'pvp', label: 'PvP' }
];

const PERIOD_FILTERS = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'all', label: 'All Time' }
];

// Fetch a much wider window than we display, then de-duplicate to one row per
// player. The previous code fetched only the top 50 ROWS and sliced 20 — a
// single grinder's 50 high-scoring endless rows could fill the entire window and
// push every other player off the visible board.
const FETCH_WINDOW = 500;
const DISPLAY_LIMIT = 20;

export default function TriviaLeaderboard() {
    // A spinner is a promise to someone who is waiting, and nothing waits
    // on the server (AEO phase 3, 2026-09-19).
    const hasMounted = useHasMounted();
    useTrainingBus('trivia-leaderboard');
    const router = useRouter();
    const [period, setPeriod] = usePersistedState('sp-filters-trivia-leaderboard', 'all');
    const [modeFilter, setModeFilter] = usePersistedState('sp-filters-trivia-leaderboard-mode', 'all');
    const [leaderboard, setLeaderboard] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);

    // Auth-reactive: react to auth state changes, not just mount.
    // Was empty-deps ([]) → if getAuthUser() returned null on first render,
    // the user's row was never highlighted in the leaderboard even after login.
    useEffect(() => {
        const update = () => {
            const user = getAuthUser();
            if (user) setCurrentUserId(user.id);
        };
        update();
        // Re-check whenever auth might have changed (other tabs / supabase auth-state-change broadcast)
        const onStorage = (e) => { if (e.key === 'smarter-poker-auth' || (e.key?.startsWith('sb-') && e.key?.endsWith('-auth-token'))) update(); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadLeaderboard() {
            setIsLoading(true);
            setLoadError(null);
            try {
                let query = supabase
                    .from('trivia_scores')
                    .select(`
                        user_id,
                        username,
                        mode,
                        score,
                        correct_count,
                        total_questions,
                        play_date
                    `)
                    .eq('server_verified', true)
                    .order('score', { ascending: false })
                    .limit(FETCH_WINDOW);

                // Apply mode filter so scores are compared like-for-like
                if (modeFilter !== 'all') {
                    query = query.eq('mode', modeFilter);
                }

                // Apply date filter
                if (period === 'today') {
                    query = query.eq('play_date', getTodayCST());
                } else if (period === 'week') {
                    query = query.gte('play_date', getDateDaysAgoCST(7));
                } else if (period === 'month') {
                    query = query.gte('play_date', getDateDaysAgoCST(30));
                }

                const { data, error } = await query;
                if (cancelled) return;

                if (error) {
                    console.warn('Error loading leaderboard:', error);
                    setLeaderboard([]);
                    setLoadError('We Could Not Load The Leaderboard Right Now. Please Try Again.');
                    return;
                }

                // Aggregate by user to get each player's single best score
                const userScores = {};
                (data || []).forEach(entry => {
                    const key = entry.user_id || entry.username;
                    if (!key) return;
                    if (!userScores[key] || entry.score > userScores[key].score) {
                        userScores[key] = {
                            ...entry,
                            accuracy: entry.total_questions > 0
                                ? Math.round((entry.correct_count / entry.total_questions) * 100)
                                : 0
                        };
                    }
                });

                // Convert to sorted array
                const ranked = Object.values(userScores)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, DISPLAY_LIMIT)
                    .map((entry, index) => ({
                        ...entry,
                        rank: index + 1,
                        displayName: entry.username || `Player ${entry.user_id?.slice(0, 6) || 'Anonymous'}`
                    }));

                setLeaderboard(ranked);
            } catch (error) {
                console.warn('Error:', error);
                if (!cancelled) setLoadError('We Could Not Load The Leaderboard Right Now. Please Try Again.');
            }
            if (!cancelled) setIsLoading(false);
        }

        loadLeaderboard();

        // Realtime subscription — live updates (same scope as loadLeaderboard).
        // Registered regardless of auth: the board is public, and gating it on
        // currentUserId meant signed-out visitors never saw live updates.
        const _ch = supabase
            .channel(`trivia-lb-${modeFilter}-${period}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores' }, () => { loadLeaderboard(); })
            .subscribe();
        return () => { cancelled = true; supabase.removeChannel(_ch); };
    }, [period, modeFilter]);

    /** 'YYYY-MM-DD' for N days before today, anchored to the CST day. */
    function getDateDaysAgoCST(days) {
        const base = new Date();
        base.setUTCDate(base.getUTCDate() - days);
        const { year, month, day } = getCSTDateParts(base);
        return `${year}-${month}-${day}`;
    }

    function getRankLabel(rank) {
        if (rank === 1) return '1st';
        if (rank === 2) return '2nd';
        if (rank === 3) return '3rd';
        return `#${rank}`;
    }

    function getRankTier(rank) {
        if (rank === 1) return 'first';
        if (rank === 2) return 'second';
        if (rank === 3) return 'third';
        return 'ranked';
    }

    function getModeLabel(mode) {
        const knownMode = MODE_FILTERS.find(filter => filter.id === mode);
        if (knownMode) return knownMode.label;
        return String(mode || 'Not Available')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    return (
        <TriviaErrorBoundary pageName="Leaderboard">
        <>
            <SEOHead
                title="Trivia Leaderboard - Top Players"
                description="The Poker Trivia Leaderboard On Smarter.Poker: Daily, Weekly And All Time Rankings Across Every Mode, Updated As Runs Finish. Free To Appear On, And Nothing On It Is A Payout."
                canonical="/hub/trivia/leaderboard"
            />

            <PageTransition>
                <div
                    className="trivia-progress-page trivia-progress-page--leaderboard"
                    data-trivia-family="progress"
                    data-trivia-surface="leaderboard"
                >
                    <UniversalHeader pageDepth={2} />

                    <main className="trivia-progress-shell" aria-labelledby="trivia-leaderboard-title">
                        <TriviaConsole
                            as="section"
                            eyebrow="Player Progress"
                            title="Trivia Leaderboard"
                            titleAs="h1"
                            titleId="trivia-leaderboard-title"
                            pill={PERIOD_FILTERS.find(option => option.id === period)?.label || 'All Time'}
                            className="trivia-progress-console"
                            aria-labelledby="trivia-leaderboard-title"
                            secondaryAction={{
                                label: 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                        >
                        <div className="trivia-progress-header">
                            <fieldset className="trivia-progress-filter trivia-progress-filter--period">
                                <legend>Ranking Period</legend>
                                <div className="trivia-progress-filter__options">
                                {PERIOD_FILTERS.map(option => (
                                    <button
                                        type="button"
                                        className="trivia-progress-filter__option"
                                        key={option.id}
                                        onClick={() => setPeriod(option.id)}
                                        aria-pressed={period === option.id}
                                        style={{ minWidth: 44, minHeight: 44 }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                                </div>
                            </fieldset>
                        </div>

                        {/* Mode filter — endless (streak * 100, unbounded) otherwise
                            structurally dominates every 10-question mode on raw score. */}
                        <fieldset className="trivia-progress-filter trivia-progress-filter--mode">
                            <legend>Game Mode</legend>
                            <div className="trivia-progress-filter__options">
                            {MODE_FILTERS.map(m => (
                                <button
                                    type="button"
                                    className="trivia-progress-filter__option"
                                    key={m.id}
                                    onClick={() => setModeFilter(m.id)}
                                    aria-pressed={modeFilter === m.id}
                                    style={{ minWidth: 44, minHeight: 44 }}
                                >
                                    {m.label}
                                </button>
                            ))}
                            </div>
                        </fieldset>

                        {hasMounted && isLoading ? (
                            <p className="trivia-progress-state" role="status">
                                Loading Leaderboard...
                            </p>
                        ) : loadError ? (
                            <section className="trivia-progress-state trivia-progress-state--error" role="alert">
                                <p>{loadError}</p>
                                <button
                                    type="button"
                                    className="trivia-progress-action trivia-progress-action--primary"
                                    onClick={() => setPeriod(period)}
                                    style={{ minWidth: 44, minHeight: 44 }}
                                >
                                    Retry
                                </button>
                            </section>
                        ) : leaderboard.length === 0 ? (
                            <section className="trivia-progress-state trivia-progress-state--empty">
                                <p>
                                    No Scores Yet For {modeFilter === 'all' ? 'This Period' : `${getModeLabel(modeFilter)} In This Period`}. Be The First!
                                </p>
                            </section>
                        ) : (
                            <div className="trivia-progress-table-wrap">
                                <table className="trivia-progress-table">
                                    <caption>Top Trivia Players</caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Rank</th>
                                            <th scope="col">Player</th>
                                            {modeFilter === 'all' && (
                                                <th scope="col">Mode</th>
                                            )}
                                            <th scope="col">Score</th>
                                            <th scope="col">Accuracy</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map(player => (
                                            <tr
                                                key={player.user_id || player.rank}
                                                data-player="leaderboard-entry"
                                                data-rank-tier={getRankTier(player.rank)}
                                                data-current-player={player.user_id === currentUserId ? 'true' : 'false'}
                                            >
                                                <td className="trivia-progress-table__rank" data-label="Rank">
                                                    {getRankLabel(player.rank)}
                                                </td>
                                                <th className="trivia-progress-table__player" scope="row" data-label="Player">
                                                    {player.displayName}
                                                    {player.user_id === currentUserId && (
                                                        <span className="trivia-progress-table__you">(You)</span>
                                                    )}
                                                </th>
                                                {modeFilter === 'all' && (
                                                    <td className="trivia-progress-table__mode" data-label="Mode">
                                                        {getModeLabel(player.mode)}
                                                    </td>
                                                )}
                                                <td className="trivia-progress-table__score" data-label="Score">
                                                    {formatTriviaDisplayNumber(player.score || 0)}
                                                </td>
                                                <td className="trivia-progress-table__accuracy" data-label="Accuracy">
                                                    {player.accuracy}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        </TriviaConsole>
                    </main>
                </div>
    </PageTransition>
        </>
          {/* Server rendered: measured on production this page returned
              only chrome to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="trivia-leaderboard" />
        </TriviaErrorBoundary>
    );
}
