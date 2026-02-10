/**
 * Trivia - Leaderboard
 * Fetches real rankings from Supabase trivia_scores table
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaLeaderboard() {
    const router = useRouter();
    const [period, setPeriod] = useState('all');
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

    return (
        <>
            <Head>
                <title>Leaderboard | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

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

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '16px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
                                Trivia Leaderboard
                            </h1>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['today', 'week', 'month', 'all'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        style={{
                                            padding: '8px 16px',
                                            background: period === p ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
                                            border: period === p ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff',
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
                            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '40px' }}>
                                Loading leaderboard...
                            </div>
                        ) : leaderboard.length === 0 ? (
                            <div style={{
                                padding: '60px',
                                textAlign: 'center',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px' }}>
                                    No scores yet for this period. Be the first!
                                </p>
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Score</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Accuracy</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map(player => (
                                            <tr
                                                key={player.user_id || player.rank}
                                                style={{
                                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                                    background: player.user_id === currentUserId ? 'rgba(139, 92, 246, 0.1)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                                                    {player.rank === 1 && '🥇'}
                                                    {player.rank === 2 && '🥈'}
                                                    {player.rank === 3 && '🥉'}
                                                    {player.rank > 3 && `#${player.rank}`}
                                                </td>
                                                <td style={{ padding: '16px', color: '#fff' }}>
                                                    {player.displayName}
                                                    {player.user_id === currentUserId && (
                                                        <span style={{ marginLeft: '8px', color: '#8b5cf6', fontSize: '12px' }}>(You)</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '16px', color: '#8b5cf6', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {player.score.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '16px', color: '#10b981', textAlign: 'right', fontWeight: 'bold' }}>
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
