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
import { usePersistedState } from '../../../src/hooks/usePersistedState';

export default function TriviaLeaderboard() {
    const router = useRouter();
    const [period, setPeriod] = usePersistedState('sp-filters-trivia-leaderboard', 'all');
    const [leaderboard, setLeaderboard] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState(null);

    useEffect(() => {
        const user = getAuthUser();
        if (user) setCurrentUserId(user.id);
    }, []);

    useEffect(() => {
        async function loadLeaderboard() {
            setIsLoading(true);
            try {
                let query = supabase
                    .from('trivia_scores')
                    .select(`
                        user_id,
                        username,
                        score,
                        correct_count,
                        total_questions,
                        play_date
                    `)
                    .order('score', { ascending: false })
                    .limit(50);

                // Apply date filter
                if (period === 'today') {
                    const today = getTodayCST();
                    query = query.eq('play_date', today);
                } else if (period === 'week') {
                    const weekAgo = getDateDaysAgo(7);
                    query = query.gte('play_date', weekAgo);
                } else if (period === 'month') {
                    const monthAgo = getDateDaysAgo(30);
                    query = query.gte('play_date', monthAgo);
                }

                const { data, error } = await query;

                if (error) {
                    console.error('Error loading leaderboard:', error);
                    setLeaderboard([]);
                    return;
                }

                // Aggregate by user to get best scores
                const userScores = {};
                (data || []).forEach(entry => {
                    const key = entry.user_id || entry.username;
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
                    .slice(0, 20)
                    .map((entry, index) => ({
                        ...entry,
                        rank: index + 1,
                        displayName: entry.username || `Player ${entry.user_id?.slice(0, 6) || 'Anonymous'}`
                    }));

                setLeaderboard(ranked);
            } catch (error) {
                console.error('Error:', error);
            }
            setIsLoading(false);
        }

        loadLeaderboard();
    }, [period]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!currentUserId) return;
        const _ch = supabase
            .channel(`trivia-lb`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores' }, () => { loadLeaderboard(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [currentUserId]);

    function getTodayCST() {
        const now = new Date();
        const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        return `${cst.getFullYear()}-${String(cst.getMonth() + 1).padStart(2, '0')}-${String(cst.getDate()).padStart(2, '0')}`;
    }

    function getDateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
        <>
            <SEOHead
                title="Trivia Leaderboard — Top Players"
                description="See Who Dominates The Poker Trivia Leaderboard. Global Rankings Across All Game Modes."
                canonical="/hub/trivia/leaderboard"
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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '16px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', margin: 0 }}>
                                Trivia Leaderboard
                            </h1>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['today', 'week', 'month', 'all'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
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

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading leaderboard...
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
                                    No scores yet for this period. Be the first!
                                </p>
                            </div>
                        ) : (
                            <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#3a3b3c' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#65676b', fontWeight: '600' }}>Rank</th>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#65676b', fontWeight: '600' }}>Player</th>
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
                                                <td style={{ padding: '16px', color: '#2374e1', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {player.score.toLocaleString()}
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
            </PageTransition>
        </>
    );
}
