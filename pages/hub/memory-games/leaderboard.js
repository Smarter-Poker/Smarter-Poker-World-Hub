/**
 * Memory Games - Leaderboard
 * Wired to Supabase for real-time rankings
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const GAME_MODES = [
    { key: 'range', label: 'Range Memory', icon: '🎯' },
    { key: 'speed', label: 'Speed Drill', icon: '⚡' },
    { key: 'tournament', label: 'Tournament', icon: '🏆' },
];

export default function MemoryGamesLeaderboard() {
    const bus = useTrainingBus('memory-games-leaderboard');
    const router = useRouter();
    const { user } = useAvatar();
    const [selectedMode, setSelectedMode] = useState('range');
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userRank, setUserRank] = useState(null);

    // Fetch leaderboard data
    useEffect(() => {
        fetchLeaderboard();
    }, [selectedMode]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`mem-lb`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_leaderboards' }, () => {
        fetchLeaderboard();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [user?.id, selectedMode]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            // Fetch top 50 entries for selected game mode
            const { data, error } = await supabase
                .from('memory_leaderboards')
                .select(`
                .limit(100) // leaderboard
                    id,
                    user_id,
                    game_mode,
                    level,
                    score,
                    accuracy,
                    time_taken,
                    perfect_game,
                    created_at,
                    profiles:user_id (
                        username,
                        avatar_url
                    )
                `)
                .eq('game_mode', selectedMode)
                .order('score', { ascending: false })
                .limit(50);

            if (error) {
                console.error('[Leaderboard] Error fetching:', error);
                // Use fallback placeholder data if table doesn't exist yet
                setLeaderboard(getPlaceholderData());
            } else {
                setLeaderboard(data || []);

                // Find user's rank if logged in
                if (user?.id && data) {
                    const rank = data.findIndex(entry => entry.user_id === user.id);
                    setUserRank(rank >= 0 ? rank + 1 : null);
                }
            }
        } catch (err) {
            console.error('[Leaderboard] Fetch error:', err);
            setLeaderboard(getPlaceholderData());
        } finally {
            setLoading(false);
        }
    };

    // Placeholder data if table doesn't exist yet
    const getPlaceholderData = () => [
        { id: 1, profiles: { username: 'GTOWizard' }, score: 18947, accuracy: 98.5, time_taken: 83, perfect_game: true },
        { id: 2, profiles: { username: 'RangeKing' }, score: 17232, accuracy: 96.2, time_taken: 88, perfect_game: true },
        { id: 3, profiles: { username: 'SolverPro' }, score: 15654, accuracy: 94.8, time_taken: 95, perfect_game: false },
        { id: 4, profiles: { username: 'MemoryAce' }, score: 14200, accuracy: 93.1, time_taken: 102, perfect_game: false },
        { id: 5, profiles: { username: 'PokerBrain' }, score: 13500, accuracy: 91.5, time_taken: 110, perfect_game: false },
    ];

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    return (
        <>
            <SEOHead
                title="Memory Games Leaderboard"
                description="See Who Has The Sharpest Memory On The Smarter.Poker Memory Games Leaderboard."
                canonical="/hub/memory-games/leaderboard"
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>


                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '20px' }}>
                            🏆 Memory Games Leaderboard
                        </h1>

                        {/* Game Mode Tabs */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                            {GAME_MODES.map(mode => (
                                <button
                                    key={mode.key}
                                    onClick={() => setSelectedMode(mode.key)}
                                    style={{
                                        padding: '12px 20px',
                                        borderRadius: '12px',
                                        border: selectedMode === mode.key
                                            ? '2px solid #00D4FF'
                                            : '1px solid rgba(255,255,255,0.15)',
                                        background: selectedMode === mode.key
                                            ? 'rgba(0, 212, 255, 0.15)'
                                            : 'rgba(255,255,255,0.05)',
                                        color: selectedMode === mode.key ? '#00D4FF' : '#fff',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '14px',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {mode.icon} {mode.label}
                                </button>
                            ))}
                        </div>

                        {/* User Rank Banner */}
                        {userRank && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(139, 92, 246, 0.2))',
                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                borderRadius: '12px',
                                padding: '16px 20px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{ fontSize: '28px' }}>{getRankIcon(userRank)}</div>
                                <div>
                                    <div style={{ color: '#00D4FF', fontWeight: 700, fontSize: '18px' }}>
                                        Your Rank: #{userRank}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                                        Keep playing to climb the leaderboard!
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Leaderboard Table */}
                        <div style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            overflow: 'hidden'
                        }}>
                            {loading ? (
                                <div style={{ padding: '60px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                    Loading leaderboard...
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Rank</th>
                                            <th style={{ padding: '16px', textAlign: 'left', color: '#9ca3af', fontWeight: '600' }}>Player</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Score</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Accuracy</th>
                                            <th style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontWeight: '600' }}>Time</th>
                                            <th style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontWeight: '600' }}>Perfect</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map((entry, index) => {
                                            const rank = index + 1;
                                            const isCurrentUser = user?.id === entry.user_id;

                                            return (
                                                <tr
                                                    key={entry.id}
                                                    style={{
                                                        borderTop: '1px solid rgba(255,255,255,0.05)',
                                                        background: isCurrentUser ? 'rgba(0, 212, 255, 0.1)' : 'transparent'
                                                    }}
                                                >
                                                    <td style={{ padding: '16px', fontWeight: 'bold', fontSize: '18px' }}>
                                                        {getRankIcon(rank)}
                                                    </td>
                                                    <td style={{ padding: '16px', color: isCurrentUser ? '#00D4FF' : '#fff', fontWeight: isCurrentUser ? 700 : 400 }}>
                                                        {entry.profiles?.username || 'Anonymous'}
                                                        {isCurrentUser && <span style={{ marginLeft: '8px', fontSize: '12px' }}>(You)</span>}
                                                    </td>
                                                    <td style={{ padding: '16px', color: '#00D4FF', textAlign: 'right', fontWeight: 'bold' }}>
                                                        {(entry.score || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '16px', color: '#10b981', textAlign: 'right' }}>
                                                        {entry.accuracy?.toFixed(1) || '0.0'}%
                                                    </td>
                                                    <td style={{ padding: '16px', color: '#9ca3af', textAlign: 'right' }}>
                                                        {formatTime(entry.time_taken || 0)}
                                                    </td>
                                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                                        {entry.perfect_game ? '⭐' : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Empty State */}
                        {!loading && leaderboard.length === 0 && (
                            <div style={{
                                textAlign: 'center',
                                padding: '60px 20px',
                                color: 'rgba(255,255,255,0.5)'
                            }}>
                                No entries yet. Be the first to play and set a record!
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
