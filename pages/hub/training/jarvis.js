/**
 * Jarvis Dashboard Page
 * ═══════════════════════════════════════════════════════════════════════════
 * AI-powered training insights and personalized recommendations
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { supabase } from '../../../src/lib/supabase';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function JarvisDashboard() {
    useTrainingBus('jarvis-dashboard');
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState(null);

    useEffect(() => {
        const _c = new AbortController();

        loadInsights();
        return () => _c.abort();
    }, []);

    const loadInsights = async (signal) => {
        try {
            setLoading(true);
            const authUser = getAuthUser();
            setUser(authUser);

            if (authUser) {
                const _jSess = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
                const token = _jSess?.access_token || '';
                const response = await fetch(`/api/jarvis/user-insights`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();

                if (data.success) {
                    setInsights(data.insights);
                }
            }
            setLoading(false);
        } catch (error) {
            console.error('Error loading insights:', error);
            setLoading(false);
        }
    };

    return (
        <PageTransition>
            <SEOHead
                title="Jarvis AI Coach — GTO Analysis"
                description="Get Personalized GTO Coaching From Jarvis, Your AI Poker Intelligence. Solver-grade Analysis For Every Hand."
                canonical="/hub/training/jarvis"
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <div style={styles.header}>
                        <div style={styles.jarvisIcon}>🧠</div>
                        <h1 style={styles.title}>JARVIS Dashboard</h1>
                        <p style={styles.subtitle}>Your AI Training Coach</p>
                    </div>

                    {loading ? (
                        <div style={styles.loading}>
                            <Image src="/images/jarvis-avatar.png" alt="Jarvis" width={1024} height={682} style={{ width: 48, height: 48, borderRadius: '50%' }} />
                            <p>Analyzing Your Training Data...</p>
                        </div>
                    ) : !user ? (
                        <div style={styles.emptyState}>
                            <p>Sign In To See Your Personalized Insights</p>
                            <Link href="/auth/login" style={styles.signInBtn}>Sign In</Link>
                        </div>
                    ) : (
                        <div style={styles.dashboard}>
                            {/* Overview Stats */}
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>📊 Overview</h2>
                                <div style={styles.statsGrid}>
                                    <StatCard
                                        label="Total Sessions"
                                        value={insights?.overview?.totalSessions || 0}
                                        icon="🎮"
                                    />
                                    <StatCard
                                        label="Accuracy"
                                        value={`${insights?.overview?.overallAccuracy || 0}%`}
                                        icon="🎯"
                                    />
                                    <StatCard
                                        label="Current Streak"
                                        value={insights?.overview?.currentStreak || 0}
                                        icon="🔥"
                                    />
                                    <StatCard
                                        label="Achievements"
                                        value={insights?.overview?.achievementsUnlocked || 0}
                                        icon="🏅"
                                    />
                                </div>
                            </div>

                            {/* Jarvis Advice */}
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>💡 Jarvis Says</h2>
                                <div style={styles.adviceBox}>
                                    <p style={styles.advice}>
                                        {insights?.jarvisAdvice || "Keep training to unlock personalized insights!"}
                                    </p>
                                </div>
                            </div>

                            {/* Top Leaks */}
                            {insights?.topLeaks?.length > 0 && (
                                <div style={styles.section}>
                                    <h2 style={styles.sectionTitle}>🔍 Top Leaks To Fix</h2>
                                    <div style={styles.leaksList}>
                                        {insights.topLeaks.map((leak, i) => (
                                            <div key={i} style={styles.leakCard}>
                                                <span style={styles.leakName}>{leak.name}</span>
                                                <span style={styles.leakCount}>{leak.count} occurrences</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Game Performance */}
                            {insights?.gamePerformance?.length > 0 && (
                                <div style={styles.section}>
                                    <h2 style={styles.sectionTitle}>🎮 Game Performance</h2>
                                    <div style={styles.gamesGrid}>
                                        {insights.gamePerformance.slice(0, 6).map((game, i) => (
                                            <div key={i} style={styles.gameCard}>
                                                <div style={styles.gameName}>{game.name}</div>
                                                <div style={styles.gameAccuracy}>{game.accuracy}%</div>
                                                <div style={styles.gameLabel}>Accuracy</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bankroll Summary */}
                            {insights?.bankroll && (
                                <div style={styles.section}>
                                    <h2 style={styles.sectionTitle}>💰 Bankroll Overview</h2>
                                    <div style={styles.statsGrid}>
                                        <StatCard
                                            label="Monthly P/L"
                                            value={`${insights.bankroll.monthlyPL >= 0 ? '+' : ''}$${Math.abs(insights.bankroll.monthlyPL).toLocaleString()}`}
                                            icon="📈"
                                        />
                                        <StatCard
                                            label="Hourly Rate"
                                            value={`$${insights.bankroll.hourlyRate}/hr`}
                                            icon="⏱️"
                                        />
                                        <StatCard
                                            label="Win Rate"
                                            value={`${insights.bankroll.winRate}%`}
                                            icon="🎯"
                                        />
                                        <StatCard
                                            label="Trend"
                                            value={insights.bankroll.recentTrend}
                                            icon={insights.bankroll.recentTrend === 'upswing' ? '🟢' : insights.bankroll.recentTrend === 'downswing' ? '🔴' : '🟡'}
                                        />
                                    </div>
                                    {(insights.bankroll.topVenue || insights.bankroll.worstVenue) && (
                                        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                            {insights.bankroll.topVenue && (
                                                <div style={{ ...styles.adviceBox, flex: 1, borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)' }}>
                                                    <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 4 }}>🏆 Best Venue</div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{insights.bankroll.topVenue.name}</div>
                                                    <div style={{ fontSize: 12, color: '#22c55e' }}>+${Math.abs(Math.round(insights.bankroll.topVenue.net)).toLocaleString()}</div>
                                                </div>
                                            )}
                                            {insights.bankroll.worstVenue && insights.bankroll.worstVenue.net < 0 && (
                                                <div style={{ ...styles.adviceBox, flex: 1, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)' }}>
                                                    <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4 }}>⚠️ Worst Venue</div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{insights.bankroll.worstVenue.name}</div>
                                                    <div style={{ fontSize: 12, color: '#ef4444' }}>-${Math.abs(Math.round(insights.bankroll.worstVenue.net)).toLocaleString()}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Weekly Progress */}
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>📈 This Week</h2>
                                <div style={styles.weeklyStats}>
                                    <div style={styles.weeklyStat}>
                                        <span style={styles.weeklyValue}>{insights?.weeklyProgress?.sessions || 0}</span>
                                        <span style={styles.weeklyLabel}>Sessions</span>
                                    </div>
                                    <div style={styles.weeklyStat}>
                                        <span style={styles.weeklyValue}>{insights?.weeklyProgress?.correct || 0}</span>
                                        <span style={styles.weeklyLabel}>Correct</span>
                                    </div>
                                    <div style={styles.weeklyStat}>
                                        <span style={styles.weeklyValue}>{insights?.weeklyProgress?.timeSpent || 0}m</span>
                                        <span style={styles.weeklyLabel}>Time Spent</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}



                </div>
            </div>
        </PageTransition>
    );
}

function StatCard({ label, value, icon }) {
    return (
        <div style={styles.statCard}>
            <div style={styles.statIcon}>{icon}</div>
            <div style={styles.statValue}>{value}</div>
            <div style={styles.statLabel}>{label}</div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    header: {
        textAlign: 'center',
        marginBottom: '32px'
    },
    jarvisIcon: {
        fontSize: '48px',
        marginBottom: '12px'
    },
    title: {
        fontSize: '28px',
        fontWeight: 700
    },
    subtitle: {
        color: '#9ca3af',
        marginTop: '8px'
    },
    loading: {
        textAlign: 'center',
        padding: '60px',
        color: '#9ca3af'
    },
    loadingIcon: {
        fontSize: '48px',
        marginBottom: '16px',
        animation: 'pulse 2s infinite'
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px',
        color: '#9ca3af'
    },
    signInBtn: {
        display: 'inline-block',
        marginTop: '16px',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#000',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600
    },
    dashboard: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px'
    },
    section: {},
    sectionTitle: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '16px',
        color: '#FFFFFF'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px'
    },
    statCard: {
        padding: '20px',
        background: '#1a1a1a',
        borderRadius: '12px',
        textAlign: 'center'
    },
    statIcon: {
        fontSize: '24px',
        marginBottom: '8px'
    },
    statValue: {
        fontSize: '28px',
        fontWeight: 700,
        color: '#00E0FF'
    },
    statLabel: {
        fontSize: '12px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    adviceBox: {
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(0, 224, 255, 0.1), rgba(139, 92, 246, 0.1))',
        border: '1px solid rgba(0, 224, 255, 0.3)',
        borderRadius: '12px'
    },
    advice: {
        fontSize: '16px',
        lineHeight: 1.6,
        fontStyle: 'italic'
    },
    leaksList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    leakCard: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#1a1a1a',
        borderRadius: '8px',
        borderLeft: '3px solid #ef4444'
    },
    leakName: {
        fontWeight: 500
    },
    leakCount: {
        color: '#9ca3af',
        fontSize: '14px'
    },
    gamesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px'
    },
    gameCard: {
        padding: '16px',
        background: '#1a1a1a',
        borderRadius: '12px',
        textAlign: 'center'
    },
    gameName: {
        fontSize: '12px',
        color: '#9ca3af',
        marginBottom: '8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    gameAccuracy: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#22c55e'
    },
    gameLabel: {
        fontSize: '10px',
        color: '#666'
    },
    weeklyStats: {
        display: 'flex',
        gap: '16px',
        justifyContent: 'center'
    },
    weeklyStat: {
        flex: 1,
        padding: '16px',
        background: '#1a1a1a',
        borderRadius: '12px',
        textAlign: 'center'
    },
    weeklyValue: {
        display: 'block',
        fontSize: '24px',
        fontWeight: 700,
        color: '#fbbf24'
    },
    weeklyLabel: {
        fontSize: '12px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    backLink: {
        display: 'block',
        textAlign: 'center',
        marginTop: '32px',
        color: '#00E0FF',
        textDecoration: 'none'
    }
};
