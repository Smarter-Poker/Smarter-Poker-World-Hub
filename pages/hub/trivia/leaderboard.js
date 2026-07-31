/**
 * Trivia - Leaderboard
 * Fetches real rankings from Supabase trivia_scores table
 * Uses SmarterPoker Dark color schema
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
// Single source of truth for the CST day boundary (Phase 73). This page used to
// re-implement getTodayCST/getDateDaysAgo locally, via the
// `new Date(now.toLocaleString(...))` round-trip that the shared lib explicitly
// documents as undefined behaviour — so the leaderboard's day window could drift
// away from the play_date the game pages actually write.
import { getTodayCST, getCSTDateParts } from '../../../src/lib/trivia/getTodayCST';

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

// Fetch a much wider window than we display, then de-duplicate to one row per
// player. The previous code fetched only the top 50 ROWS and sliced 20 — a
// single grinder's 50 high-scoring endless rows could fill the entire window and
// push every other player off the visible board.
const FETCH_WINDOW = 500;
const DISPLAY_LIMIT = 20;

export default function TriviaLeaderboard() {
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
                    setLoadError('We could not load the leaderboard right now. Please try again.');
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
                if (!cancelled) setLoadError('We could not load the leaderboard right now. Please try again.');
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

    function getRankColor(rank) {
        if (rank === 1) return '#FFD700';
        if (rank === 2) return '#C0C0C0';
        if (rank === 3) return '#CD7F32';
        return '#e4e6eb';
    }

    return (
        <TriviaErrorBoundary pageName="Leaderboard">
        <>
            <SEOHead
                title="Trivia Leaderboard — Top Players"
                description="See Who Dominates The Poker Trivia Leaderboard. Global Rankings Across All Game Modes."
                canonical="/hub/trivia/leaderboard"
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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '16px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', margin: 0 }}>
                                Trivia Leaderboard
                            </h1>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['today', 'week', 'month', 'all'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        aria-pressed={period === p}
                                        style={{
                                            padding: '8px 16px',
                                            background: period === p ? '#2374e1' : '#3a3b3c',
                                            border: period === p ? 'none' : '1px solid #4e4f50',
                                            color: '#e4e6eb',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: period === p ? 'bold' : 'normal',
                                            textTransform: 'capitalize'
                                        }}
                                    >
                                        {p === 'all' ? 'All Time' : p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Mode filter — endless (streak * 100, unbounded) otherwise
                            structurally dominates every 10-question mode on raw score. */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                            {MODE_FILTERS.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setModeFilter(m.id)}
                                    aria-pressed={modeFilter === m.id}
                                    style={{
                                        padding: '6px 14px',
                                        background: modeFilter === m.id ? 'rgba(35, 116, 225, 0.25)' : 'transparent',
                                        border: `1px solid ${modeFilter === m.id ? '#2374e1' : '#4e4f50'}`,
                                        color: modeFilter === m.id ? '#e4e6eb' : '#65676b',
                                        borderRadius: '20px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: modeFilter === m.id ? 'bold' : 'normal'
                                    }}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading leaderboard...
                            </div>
                        ) : loadError ? (
                            <div role="alert" style={{
                                padding: '40px',
                                textAlign: 'center',
                                background: 'rgba(240, 40, 73, 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(240, 40, 73, 0.35)'
                            }}>
                                <p style={{ color: '#f02849', fontSize: '16px', marginBottom: '16px' }}>{loadError}</p>
                                <button
                                    onClick={() => setPeriod(period)}
                                    style={{ background: '#2374e1', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    Retry
                                </button>
                            </div>
                        ) : leaderboard.length === 0 ? (
                            <div style={{
                                padding: '60px',
                                textAlign: 'center',
                                background: '#242526',
                                borderRadius: '12px',
                                border: '1px solid #4e4f50'
                            }}>
                                <p style={{ color: '#65676b', fontSize: '18px' }}>
                                    No scores yet for {modeFilter === 'all' ? 'this period' : `${MODE_FILTERS.find(m => m.id === modeFilter)?.label || modeFilter} in this period`}. Be the first!
                                </p>
                            </div>
                        ) : (
                            <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#3a3b3c' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#65676b', fontWeight: '600' }}>Rank</th>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#65676b', fontWeight: '600' }}>Player</th>
                                            {modeFilter === 'all' && (
                                                <th style={{ padding: '16px', textAlign: 'left', color: '#65676b', fontWeight: '600' }}>Mode</th>
                                            )}
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#65676b', fontWeight: '600' }}>Score</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#65676b', fontWeight: '600' }}>Accuracy</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map(player => (
                                            <tr
                                                key={player.user_id || player.rank}
                                                style={{
                                                    borderTop: '1px solid #4e4f50',
                                                    background: player.user_id === currentUserId ? 'rgba(35, 116, 225, 0.1)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '16px', color: getRankColor(player.rank), fontWeight: 'bold' }}>
                                                    {getRankLabel(player.rank)}
                                                </td>
                                                <td style={{ padding: '16px', color: '#e4e6eb' }}>
                                                    {player.displayName}
                                                    {player.user_id === currentUserId && (
                                                        <span style={{ marginLeft: '8px', color: '#2374e1', fontSize: '12px' }}>(You)</span>
                                                    )}
                                                </td>
                                                {modeFilter === 'all' && (
                                                    <td style={{ padding: '16px', color: '#65676b', fontSize: '13px', textTransform: 'capitalize' }}>
                                                        {player.mode || '-'}
                                                    </td>
                                                )}
                                                <td style={{ padding: '16px', color: '#2374e1', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {(player.score || 0).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '16px', color: '#31a24c', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {player.accuracy}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
