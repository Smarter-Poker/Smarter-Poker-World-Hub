/**
 * Preflop Charts - Player Stats & Analytics Dashboard
 * Comprehensive analytics with progress tracking and daily challenges
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

// Stat Card Component
const StatCard = ({ label, value, icon, color = '#00D4FF', subtext }) => (
    <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '24px',
        textAlign: 'center'
    }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '4px' }}>{label}</div>
        <div style={{ color, fontSize: '28px', fontWeight: 700 }}>{value}</div>
        {subtext && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>{subtext}</div>}
    </div>
);

// Progress Bar Component
const ProgressBar = ({ label, value, max, color = '#00D4FF' }) => {
    const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>{label}</span>
                <span style={{ color, fontSize: '14px', fontWeight: 600 }}>{value.toFixed(1)}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                    background: color,
                    height: '100%',
                    width: `${percent}%`,
                    transition: 'width 0.5s ease',
                    borderRadius: '8px'
                }} />
            </div>
        </div>
    );
};

export default function MemoryGamesStats() {
    const bus = useTrainingBus('preflop-charts-stats');
    const router = useRouter();
    const { user } = useAvatar();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [dailyChallenge, setDailyChallenge] = useState(null);
    const [levelAccuracy, setLevelAccuracy] = useState([]);
    const [modeBreakdown, setModeBreakdown] = useState([]);
    const [recentSessions, setRecentSessions] = useState([]);

    // Fetch stats on mount
    useEffect(() => {
        if (user?.id) {
            fetchStats();
            fetchDailyChallenge();
        } else {
            setLoading(false);
            setStats(getPlaceholderStats());
            setLevelAccuracy(getPlaceholderLevelAccuracy());
        }
    }, [user]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`mem-stats:${user?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'memory_game_sessions', filter: `user_id=eq.${user?.id}` }, () => {
        fetchStats();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [user?.id]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // Fetch user's game sessions
            const { data: sessions, error } = await supabase
                .from('memory_game_sessions')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'completed')
                .limit(50) // game sessions

            if (error) {
                console.warn('[Stats] Error fetching sessions:', error);
                setStats(getPlaceholderStats());
                setLevelAccuracy(getPlaceholderLevelAccuracy());
                return;
            }

            if (sessions && sessions.length > 0) {
                const gamesPlayed = sessions.length;
                const totalScore = sessions.reduce((sum, s) => sum + (s.score || 0), 0);
                const avgAccuracy = sessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / gamesPlayed;
                const avgTime = sessions.reduce((sum, s) => sum + (s.time_taken || 0), 0) / gamesPlayed;
                const perfectGames = sessions.filter(s => s.accuracy >= 100).length;
                const diamondsEarned = sessions.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
                const bestScore = Math.max(...sessions.map(s => s.score || 0));
                const highestLevel = Math.max(...sessions.map(s => s.level || 1));

                // Calculate accuracy by level
                const byLevel = {};
                sessions.forEach(s => {
                    const level = s.level || 1;
                    if (!byLevel[level]) byLevel[level] = { total: 0, count: 0 };
                    byLevel[level].total += s.accuracy || 0;
                    byLevel[level].count++;
                });

                const levelData = [];
                for (let i = 1; i <= 10; i++) {
                    levelData.push({
                        level: i,
                        accuracy: byLevel[i] ? byLevel[i].total / byLevel[i].count : 0,
                        gamesPlayed: byLevel[i]?.count || 0
                    });
                }

                // Game mode breakdown
                const byMode = {};
                sessions.forEach(s => {
                    const mode = s.game_mode || 'range';
                    if (!byMode[mode]) byMode[mode] = { total: 0, count: 0, totalScore: 0 };
                    byMode[mode].total += s.accuracy || 0;
                    byMode[mode].count++;
                    byMode[mode].totalScore += s.score || 0;
                });
                const MODE_LABELS = {
                    range: { label: 'Range Memory', icon: '🎯', color: '#00D4FF' },
                    speed_drill: { label: 'Speed Drill', icon: '⚡', color: '#FFD700' },
                    pressure_cooker: { label: 'Pressure Cooker', icon: '💣', color: '#EF4444' },
                    pattern_recognition: { label: 'Pattern Recognition', icon: '🧩', color: '#3B82F6' },
                    mixed_strategy: { label: 'Mixed Strategy', icon: '🎰', color: '#A855F7' },
                    spot_trainer: { label: 'Spot Trainer', icon: '🎯', color: '#10B981' },
                    tournament: { label: 'Tournament', icon: '⚔️', color: '#9333EA' },
                };
                const modeData = Object.entries(byMode || {}).map(([mode, data]) => ({
                    mode,
                    ...MODE_LABELS[mode] || { label: mode, icon: '🎮', color: '#fff' },
                    gamesPlayed: data.count,
                    avgAccuracy: data.count > 0 ? data.total / data.count : 0,
                    totalScore: data.totalScore,
                })).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
                setModeBreakdown(modeData);

                // Recent sessions (last 10)
                const sorted = [...sessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setRecentSessions(sorted.slice(0, 10));

                setStats({
                    gamesPlayed,
                    totalScore,
                    bestScore,
                    avgAccuracy,
                    avgTime,
                    perfectGames,
                    diamondsEarned,
                    highestLevel,
                    currentStreak: 0, // Would need streak table
                    longestStreak: 0
                });
                setLevelAccuracy(levelData);
            } else {
                setStats(getPlaceholderStats());
                setLevelAccuracy(getPlaceholderLevelAccuracy());
            }
        } catch (err) {
            console.warn('[Stats] Fetch error:', err);
            setStats(getPlaceholderStats());
            setLevelAccuracy(getPlaceholderLevelAccuracy());
        } finally {
            setLoading(false);
        }
    };

    const fetchDailyChallenge = async () => {
        try {
            const { data, error } = await supabase.rpc('get_daily_challenge');
            if (!error && data?.success) {
                setDailyChallenge({
                    ...data.challenge,
                    completed: data.completed
                });
            }
        } catch (err) {
            console.warn('[Stats] Daily challenge fetch error:', err);
        }
    };

    // Placeholder data
    const getPlaceholderStats = () => ({
        gamesPlayed: 0,
        totalScore: 0,
        bestScore: 0,
        avgAccuracy: 0,
        avgTime: 0,
        perfectGames: 0,
        diamondsEarned: 0,
        highestLevel: 1,
        currentStreak: 0,
        longestStreak: 0
    });

    const getPlaceholderLevelAccuracy = () => {
        return Array.from({ length: 10 }, (_, i) => ({
            level: i + 1,
            accuracy: 0,
            gamesPlayed: 0
        }));
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Find weak spots (lowest accuracy levels)
    const weakSpots = levelAccuracy
        .filter(l => l.gamesPlayed > 0)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 3);

    return (
        <>
            <SEOHead
                title="Preflop Charts Stats"
                description="View Your Preflop Range Training Performance, Scores, And Improvement Trends."
                canonical="/hub/preflop-charts/stats"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>


                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '24px' }}>
                            📊 My Preflop Charts Stats
                        </h1>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.5)' }}>
                                Loading your stats...
                            </div>
                        ) : (
                            <>
                                {/* Daily Challenge Banner */}
                                {dailyChallenge && (
                                    <div style={{
                                        background: dailyChallenge.completed
                                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(34, 197, 94, 0.2))'
                                            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(251, 191, 36, 0.2))',
                                        border: `1px solid ${dailyChallenge.completed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                                        borderRadius: '16px',
                                        padding: '20px 24px',
                                        marginBottom: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '18px', marginBottom: '4px' }}>
                                                📅 Daily Challenge
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
                                                Level {dailyChallenge.level} • {dailyChallenge.target_accuracy}% Target
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            {dailyChallenge.completed ? (
                                                <div style={{ color: '#10b981', fontWeight: 700 }}>✓ Completed!</div>
                                            ) : (
                                                <div>
                                                    <div style={{ color: '#fbbf24', fontWeight: 700 }}>+{dailyChallenge.diamond_reward} 💎</div>
                                                    <button
                                                        onClick={() => router.push('/hub/preflop-charts')}
                                                        style={{
                                                            background: '#f59e0b',
                                                            border: 'none',
                                                            color: '#000',
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            cursor: 'pointer',
                                                            fontWeight: 600,
                                                            fontSize: '12px',
                                                            marginTop: '6px'
                                                        }}
                                                    >
                                                        Play Now
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Main Stats Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                    <StatCard label="Games Played" value={stats.gamesPlayed} icon="🎮" color="#00D4FF" />
                                    <StatCard label="Best Score" value={stats.bestScore} icon="🏆" color="#fbbf24" />
                                    <StatCard label="Avg Accuracy" value={`${stats.avgAccuracy.toFixed(1)}%`} icon="🎯" color="#10b981" />
                                    <StatCard label="Avg Time" value={formatTime(stats.avgTime)} icon="⏱️" color="#8b5cf6" />
                                    <StatCard label="Perfect Games" value={stats.perfectGames} icon="💯" color="#ec4899" />
                                    <StatCard label="Diamonds Earned" value={stats.diamondsEarned.toLocaleString()} icon="💎" color="#00D4FF" />
                                </div>

                                {/* Level-by-Level Accuracy */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    marginBottom: '24px'
                                }}>
                                    <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>
                                        📈 Accuracy by Level
                                    </h2>
                                    {levelAccuracy.map(level => (
                                        <ProgressBar
                                            key={level.level}
                                            label={`Level ${level.level}`}
                                            value={level.accuracy}
                                            max={100}
                                            color={level.accuracy >= 90 ? '#10b981' : level.accuracy >= 70 ? '#fbbf24' : level.gamesPlayed > 0 ? '#ef4444' : 'rgba(255,255,255,0.2)'}
                                        />
                                    ))}
                                </div>

                                {/* Performance Trend Chart */}
                                {recentSessions.length >= 3 && (() => {
                                    const sorted = [...recentSessions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                                    const maxScore = Math.max(...sorted.map(s => s.score || 0), 1);
                                    const avgLine = sorted.reduce((sum, s) => sum + (s.accuracy || 0), 0) / sorted.length;
                                    return (
                                        <div style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '16px',
                                            padding: '24px',
                                            marginBottom: '24px',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                                                    Performance Trend
                                                </h2>
                                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                                    Avg: <span style={{ color: avgLine >= 80 ? '#22C55E' : avgLine >= 60 ? '#F59E0B' : '#EF4444', fontWeight: 700 }}>
                                                        {avgLine.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Score Bars */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'flex-end',
                                                gap: 6,
                                                height: 100,
                                                padding: '0 4px',
                                                marginBottom: 8,
                                                position: 'relative',
                                            }}>
                                                {/* Average line */}
                                                <div style={{
                                                    position: 'absolute',
                                                    left: 0, right: 0,
                                                    bottom: `${avgLine}%`,
                                                    height: 1,
                                                    borderTop: '1px dashed rgba(255,255,255,0.15)',
                                                    zIndex: 1,
                                                }} />
                                                {sorted.map((s, i) => {
                                                    const acc = s.accuracy || 0;
                                                    const color = acc >= 85 ? '#22C55E' : acc >= 70 ? '#3B82F6' : acc >= 50 ? '#F59E0B' : '#EF4444';
                                                    const isLast = i === sorted.length - 1;
                                                    return (
                                                        <div key={i} style={{
                                                            flex: 1,
                                                            height: `${Math.max(acc, 5)}%`,
                                                            background: isLast
                                                                ? `linear-gradient(to top, ${color}, ${color}88)`
                                                                : `${color}55`,
                                                            borderRadius: '4px 4px 0 0',
                                                            transition: 'height 0.5s ease',
                                                            position: 'relative',
                                                            minWidth: 0,
                                                        }}>
                                                            {isLast && (
                                                                <div style={{
                                                                    position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                                                                    fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap',
                                                                }}>
                                                                    {acc.toFixed(0)}%
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Date labels */}
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {sorted.map((s, i) => (
                                                    <div key={i} style={{
                                                        flex: 1, textAlign: 'center',
                                                        fontSize: 9, color: 'rgba(255,255,255,0.25)',
                                                    }}>
                                                        {s.created_at ? new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : ''}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Accuracy Trend Arrow */}
                                            {sorted.length >= 4 && (() => {
                                                const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
                                                const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
                                                const firstAvg = firstHalf.reduce((s, x) => s + (x.accuracy || 0), 0) / firstHalf.length;
                                                const secondAvg = secondHalf.reduce((s, x) => s + (x.accuracy || 0), 0) / secondHalf.length;
                                                const diff = secondAvg - firstAvg;
                                                const trending = diff > 3 ? 'up' : diff < -3 ? 'down' : 'flat';
                                                const trendConfig = {
                                                    up: { label: 'Improving', color: '#22C55E', arrow: '\u2191' },
                                                    down: { label: 'Declining', color: '#EF4444', arrow: '\u2193' },
                                                    flat: { label: 'Steady', color: '#F59E0B', arrow: '\u2192' },
                                                };
                                                const tc = trendConfig[trending];
                                                return (
                                                    <div style={{
                                                        marginTop: 12, padding: '8px 14px',
                                                        background: `${tc.color}11`, border: `1px solid ${tc.color}33`,
                                                        borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    }}>
                                                        <span style={{ fontSize: 16, color: tc.color }}>{tc.arrow}</span>
                                                        <span style={{ fontSize: 12, color: tc.color, fontWeight: 700 }}>{tc.label}</span>
                                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                                            ({diff > 0 ? '+' : ''}{diff.toFixed(1)}% recent vs earlier)
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}

                                {/* Game Mode Breakdown */}
                                {modeBreakdown.length > 0 && (
                                    <div style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '24px',
                                        marginBottom: '24px'
                                    }}>
                                        <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>
                                            🎮 Performance by Game Mode
                                        </h2>
                                        <div style={{ display: 'grid', gap: '12px' }}>
                                            {modeBreakdown.map(mode => (
                                                <div key={mode.mode} style={{
                                                    display: 'flex', alignItems: 'center', gap: '16px',
                                                    padding: '14px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px',
                                                    borderLeft: `3px solid ${mode.color}`
                                                }}>
                                                    <div style={{ fontSize: '28px', minWidth: '36px', textAlign: 'center' }}>{mode.icon}</div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>{mode.label}</div>
                                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                                            {mode.gamesPlayed} games played
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ color: mode.color, fontWeight: 700, fontSize: '16px' }}>
                                                            {mode.avgAccuracy.toFixed(1)}%
                                                        </div>
                                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>avg accuracy</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Recent Sessions */}
                                {recentSessions.length > 0 && (
                                    <div style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '24px',
                                        marginBottom: '24px'
                                    }}>
                                        <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>
                                            📋 Recent Sessions
                                        </h2>
                                        <div style={{ display: 'grid', gap: '8px' }}>
                                            {recentSessions.map((session, idx) => {
                                                const acc = session.accuracy || 0;
                                                const accColor = acc >= 90 ? '#10b981' : acc >= 70 ? '#fbbf24' : '#ef4444';
                                                return (
                                                    <div key={idx} style={{
                                                        display: 'flex', alignItems: 'center', gap: '12px',
                                                        padding: '10px 14px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px'
                                                    }}>
                                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', minWidth: '80px' }}>
                                                            {session.created_at ? new Date(session.created_at).toLocaleDateString() : '—'}
                                                        </div>
                                                        <div style={{ flex: 1, color: '#fff', fontSize: '14px', fontWeight: 500 }}>
                                                            {session.game_mode || 'range'}
                                                        </div>
                                                        <div style={{ color: '#FFD700', fontWeight: 600, fontSize: '14px', minWidth: '60px', textAlign: 'right' }}>
                                                            {(session.score || 0).toLocaleString()}
                                                        </div>
                                                        <div style={{ color: accColor, fontWeight: 600, fontSize: '14px', minWidth: '50px', textAlign: 'right' }}>
                                                            {acc.toFixed(0)}%
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Weak Spots */}
                                {weakSpots.length > 0 && (
                                    <div style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '16px',
                                        padding: '24px'
                                    }}>
                                        <h2 style={{ color: '#ef4444', fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
                                            🎯 Areas to Improve
                                        </h2>
                                        <div style={{ display: 'grid', gap: '12px' }}>
                                            {weakSpots.map(spot => (
                                                <div key={spot.level} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px 16px',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    borderRadius: '8px'
                                                }}>
                                                    <span style={{ color: '#fff' }}>Level {spot.level}</span>
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{spot.accuracy.toFixed(1)}% accuracy</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                                            💡 Focus on these levels to improve your overall performance!
                                        </div>
                                    </div>
                                )}

                                {/* Not logged in notice */}
                                {!user && (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '40px',
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '16px',
                                        marginTop: '24px'
                                    }}>
                                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                                        <div style={{ color: '#fff', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                                            Sign in to track your progress
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
                                            Your stats will be saved and synced across devices
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition>
        </>
    );
}
