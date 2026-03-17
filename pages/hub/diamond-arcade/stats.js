/**
 * Diamond Arcade - Player Stats
 * Real stats from diamond_arena_events table
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { BarChart3, ArrowLeft, Gamepad2, Target, Trophy, Gem, Zap, TrendingUp } from 'lucide-react';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArcadeStats() {
    const bus = useTrainingBus('diamond-arcade-stats');
    const router = useRouter();
    const [stats, setStats] = useState(null);
    const [gameBreakdown, setGameBreakdown] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            setIsLoading(true);
            const user = getAuthUser();
            if (!user) { setIsLoading(false); return; }

            try {
                // Query completed games for scores/wins
                const { data, error } = await supabase
                    .from('diamond_arena_events')
                    .select('game_type, score, correct_count, total_questions, won, prize_awarded, time_spent_ms, created_at')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_complete');

                if (error || !data) { setIsLoading(false); return; }

                // Query game_start events separately for entry fees (entry_fee is only on start events)
                const { data: startData } = await supabase
                    .from('diamond_arena_events')
                    .select('entry_fee')
                    .eq('user_id', user.id)
                    .eq('event_type', 'game_start');

                // Aggregate overall stats
                const gamesPlayed = data.length;
                const totalScore = data.reduce((s, e) => s + (e.score || 0), 0);
                const wins = data.filter(e => e.won).length;
                const totalCorrect = data.reduce((s, e) => s + (e.correct_count || 0), 0);
                const totalQuestions = data.reduce((s, e) => s + (e.total_questions || 0), 0);
                const diamondsWon = data.reduce((s, e) => s + (e.prize_awarded || 0), 0);
                const diamondsSpent = (startData || []).reduce((s, e) => s + (e.entry_fee || 0), 0);
                const bestScore = data.length > 0 ? Math.max(...data.map(e => e.score || 0)) : 0;

                setStats({
                    gamesPlayed,
                    totalScore,
                    bestScore,
                    wins,
                    winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
                    accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
                    diamondsWon,
                    diamondsSpent,
                    netProfit: diamondsWon - diamondsSpent,
                });

                // Per-game breakdown
                const gameMap = {};
                data.forEach(e => {
                    const gt = e.game_type || 'unknown';
                    if (!gameMap[gt]) gameMap[gt] = { gameType: gt, games: 0, wins: 0, totalScore: 0, diamondsWon: 0 };
                    gameMap[gt].games += 1;
                    if (e.won) gameMap[gt].wins += 1;
                    gameMap[gt].totalScore += e.score || 0;
                    gameMap[gt].diamondsWon += e.prize_awarded || 0;
                });
                setGameBreakdown(Object.values(gameMap).sort((a, b) => b.games - a.games));
            } catch (err) {
                console.error('Stats error:', err);
            }
            setIsLoading(false);
        }

        loadStats();

        // Realtime updates
        const user = getAuthUser();
        if (!user) return;
        const ch = supabase
            .channel(`arcade-stats:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'diamond_arena_events', filter: `user_id=eq.${user.id}` }, () => { loadStats(); })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const GAME_NAMES = {
        'hand-snap': 'Hand Snap', 'board-nuts': 'Board Nuts', 'chip-math': 'Chip Math',
        'showdown': 'Showdown', 'ev-or-fold': 'EV or Fold', 'double-or-nothing': 'Double or Nothing',
        'the-gauntlet': 'The Gauntlet', 'mystery-box': 'Mystery Box',
    };

    const statCardStyle = {
        background: 'linear-gradient(180deg, rgba(20, 20, 35, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%)',
        border: '1px solid rgba(100, 100, 120, 0.2)',
        borderRadius: '12px',
        padding: '24px',
    };

    return (
        <>
            <SEOHead
                title="Arcade Stats — Your Performance | Smarter.Poker"
                description="View Your Diamond Arcade Game Stats, Win Rates, And Earnings."
                canonical="/hub/diamond-arcade/stats"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button onClick={() => router.push('/hub/diamond-arcade')} style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', color: '#00D4FF', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowLeft size={16} /> Back to Arcade
                        </button>

                        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <BarChart3 size={28} color="#00D4FF" /> My Arcade Stats
                        </h1>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>Loading stats...</div>
                        ) : !stats || stats.gamesPlayed === 0 ? (
                            <div style={{ ...statCardStyle, textAlign: 'center', padding: '60px' }}>
                                <Gamepad2 size={48} color="#65676b" style={{ marginBottom: '16px' }} />
                                <p style={{ color: '#65676b', fontSize: '18px' }}>No games played yet. Hit the arcade to start!</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '30px' }}>
                                    {[
                                        { label: 'Games Played', value: stats.gamesPlayed, icon: Gamepad2, color: '#00D4FF' },
                                        { label: 'Total Score', value: stats.totalScore.toLocaleString(), icon: TrendingUp, color: '#fbbf24' },
                                        { label: 'Best Score', value: stats.bestScore, icon: Trophy, color: '#22c55e' },
                                        { label: 'Win Rate', value: `${stats.winRate}%`, icon: Target, color: stats.winRate >= 50 ? '#22c55e' : '#ef4444' },
                                        { label: 'Accuracy', value: `${stats.accuracy}%`, icon: Zap, color: '#a855f7' },
                                        { label: 'Net P/L', value: `${stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toLocaleString()}`, icon: Gem, color: stats.netProfit >= 0 ? '#22c55e' : '#ef4444' },
                                    ].map(({ label, value, icon: Icon, color }) => (
                                        <div key={label} style={statCardStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                <Icon size={18} color={color} />
                                                <span style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                                            </div>
                                            <div style={{ color, fontSize: '28px', fontWeight: 'bold' }}>{value}</div>
                                        </div>
                                    ))}
                                </div>

                                {gameBreakdown.length > 0 && (
                                    <>
                                        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '16px' }}>Per-Game Breakdown</h2>
                                        <div style={{ ...statCardStyle, overflow: 'hidden', padding: 0 }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Game</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Played</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Win Rate</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#65676b', fontSize: '12px', textTransform: 'uppercase' }}>Diamonds</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {gameBreakdown.map(g => (
                                                        <tr key={g.gameType} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <td style={{ padding: '12px 16px', color: '#e4e6eb', fontWeight: '500' }}>{GAME_NAMES[g.gameType] || g.gameType}</td>
                                                            <td style={{ padding: '12px 16px', color: '#9ca3af', textAlign: 'right' }}>{g.games}</td>
                                                            <td style={{ padding: '12px 16px', color: '#22c55e', textAlign: 'right', fontWeight: '600' }}>{g.games > 0 ? Math.round((g.wins / g.games) * 100) : 0}%</td>
                                                            <td style={{ padding: '12px 16px', color: '#fbbf24', textAlign: 'right', fontWeight: 'bold' }}>{g.diamondsWon.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
