/**
 * Memory Games - Player Stats & Analytics Dashboard
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
    const bus = useTrainingBus('memory-games-stats');
    const router = useRouter();
    const { user } = useAvatar();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [dailyChallenge, setDailyChallenge] = useState(null);
    const [levelAccuracy, setLevelAccuracy] = useState([]);

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
                console.error('[Stats] Error fetching sessions:', error);
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
            console.error('[Stats] Fetch error:', err);
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
            console.error('[Stats] Daily challenge fetch error:', err);
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
                title="Memory Games Stats"
                description="View Your Memory Game Performance, Scores, And Improvement Trends."
                canonical="/hub/memory-games/stats"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>


                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '24px' }}>
                            📊 My Memory Stats
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
                                                        onClick={() => router.push('/hub/memory-games')}
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
            </PageTransition>
        </>
    );
}
