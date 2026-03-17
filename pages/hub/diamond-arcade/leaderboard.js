/**
 * Diamond Arcade - Leaderboard
 * Real rankings from diamond_arena_events table
 * Futuristic Metal / Casino Dark theme
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { Trophy, ArrowLeft, Crown, Medal } from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArcadeLeaderboard() {
    const bus = useTrainingBus('diamond-arcade-leaderboard');
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
                    .from('diamond_arena_events')
                    .select('user_id, game_type, score, correct_count, total_questions, won, prize_awarded, created_at')
                    .eq('event_type', 'game_complete');

                // Apply date filter
                if (period === 'today') {
                    const today = new Date().toISOString().slice(0, 10);
                    query = query.gte('created_at', today);
                } else if (period === 'week') {
                    const d = new Date(); d.setDate(d.getDate() - 7);
                    query = query.gte('created_at', d.toISOString());
                } else if (period === 'month') {
                    const d = new Date(); d.setDate(d.getDate() - 30);
                    query = query.gte('created_at', d.toISOString());
                }

                const { data, error } = await query.limit(500);

                if (error || !data) {
                    setLeaderboard([]);
                    setIsLoading(false);
                    return;
                }

                // Aggregate by user
                const userMap = {};
                data.forEach(e => {
                    if (!userMap[e.user_id]) {
                        userMap[e.user_id] = { userId: e.user_id, totalScore: 0, games: 0, wins: 0, totalCorrect: 0, totalQuestions: 0, diamondsWon: 0 };
                    }
                    const u = userMap[e.user_id];
                    u.totalScore += e.score || 0;
                    u.games += 1;
                    if (e.won) u.wins += 1;
                    u.totalCorrect += e.correct_count || 0;
                    u.totalQuestions += e.total_questions || 0;
                    u.diamondsWon += e.prize_awarded || 0;
                });

                const sorted = Object.values(userMap)
                    .sort((a, b) => b.totalScore - a.totalScore)
                    .slice(0, 25)
                    .map((u, i) => ({
                        ...u,
                        rank: i + 1,
                        winRate: u.games > 0 ? Math.round((u.wins / u.games) * 100) : 0,
                        accuracy: u.totalQuestions > 0 ? Math.round((u.totalCorrect / u.totalQuestions) * 100) : 0,
                        displayName: `Player ${u.userId?.slice(0, 6) || 'Anon'}`,
                    }));

                // Try to get display names from profiles
                if (sorted.length > 0) {
                    const userIds = sorted.map(s => s.userId);
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, display_name, username')
                        .in('id', userIds);
                    if (profiles) {
                        const profileMap = {};
                        profiles.forEach(p => { profileMap[p.id] = p.display_name || p.username || null; });
                        sorted.forEach(s => {
                            if (profileMap[s.userId]) s.displayName = profileMap[s.userId];
                        });
                    }
                }

                setLeaderboard(sorted);
            } catch (err) {
                console.error('Leaderboard error:', err);
            }
            setIsLoading(false);
        }

        loadLeaderboard();

        // Realtime subscription
        const ch = supabase
            .channel('arcade-lb')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diamond_arena_events' }, () => { loadLeaderboard(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [period]);

    function getRankColor(rank) {
        if (rank === 1) return '#FFD700';
        if (rank === 2) return '#C0C0C0';
        if (rank === 3) return '#CD7F32';
        return '#e4e6eb';
    }

    function getRankLabel(rank) {
        if (rank === 1) return '1st';
        if (rank === 2) return '2nd';
        if (rank === 3) return '3rd';
        return `#${rank}`;
    }

    return (
        <>
            <SEOHead
                title="Arcade Leaderboard — Top Scorers | Smarter.Poker"
                description="See Who Leads The Diamond Arcade With The Highest Scores And Most Wins."
                canonical="/hub/diamond-arcade/leaderboard"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/diamond-arcade')}
                            style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', color: '#00D4FF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <ArrowLeft size={16} /> Back to Arcade
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '16px' }}>
                            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e4e6eb', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Trophy size={28} color="#FFD700" /> Arcade Leaderboard
                            </h1>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['today', 'week', 'month', 'all'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        style={{
                                            padding: '8px 16px',
                                            background: period === p ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                                            border: period === p ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            color: period === p ? '#00D4FF' : '#9ca3af',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: period === p ? 'bold' : 'normal',
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {p === 'all' ? 'All Time' : p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>Loading leaderboard...</div>
                        ) : leaderboard.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <p style={{ color: '#65676b', fontSize: '18px' }}>No scores yet for this period. Be the first!</p>
                            </div>
                        ) : (
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '14px 16px', textAlign: 'left', color: '#65676b', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rank</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'left', color: '#65676b', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'right', color: '#65676b', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'right', color: '#65676b', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'right', color: '#65676b', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Games</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map(player => (
                                            <tr
                                                key={player.userId}
                                                style={{
                                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                                    background: player.userId === currentUserId ? 'rgba(0, 212, 255, 0.08)' : 'transparent',
                                                }}
                                            >
                                                <td style={{ padding: '14px 16px', color: getRankColor(player.rank), fontWeight: 'bold', fontSize: '14px' }}>
                                                    {player.rank <= 3 && <span style={{ marginRight: '4px' }}>{player.rank === 1 ? <Crown size={16} color="#FFD700" /> : <Medal size={16} color={getRankColor(player.rank)} />}</span>}
                                                    {getRankLabel(player.rank)}
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#e4e6eb', fontWeight: '500' }}>
                                                    {player.displayName}
                                                    {player.userId === currentUserId && <span style={{ marginLeft: '8px', color: '#00D4FF', fontSize: '11px' }}>(You)</span>}
                                                </td>
                                                <td style={{ padding: '14px 16px', color: '#fbbf24', textAlign: 'right', fontWeight: 'bold' }}>{player.totalScore.toLocaleString()}</td>
                                                <td style={{ padding: '14px 16px', color: '#22c55e', textAlign: 'right', fontWeight: '600' }}>{player.winRate}%</td>
                                                <td style={{ padding: '14px 16px', color: '#9ca3af', textAlign: 'right' }}>{player.games}</td>
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
