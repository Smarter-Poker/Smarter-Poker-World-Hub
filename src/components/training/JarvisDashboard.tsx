/**
 * 🧠 JARVIS DASHBOARD COMPONENT
 * Shows personalized training insights, leak patterns, and progress
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function JarvisDashboard({ userId, compact = false }) {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) fetchInsights();
    }, [userId]);

    const fetchInsights = async () => {
        try {
            const token = (JSON.parse(localStorage.getItem('sb-' + (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0] + '-auth-token') || '{}'))?.access_token || '';
            const res = await fetch(`/api/jarvis/user-insights`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setInsights(data.insights);
            }
        } catch (error) {
            console.error('Failed to fetch insights:', error);
        }
        setLoading(false);
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>
                    🧠 Jarvis Analyzing...
                </div>
            </div>
        );
    }

    if (!insights) {
        return (
            <div style={styles.container}>
                <div style={styles.empty}>
                    Complete training sessions to unlock Jarvis insights!
                </div>
            </div>
        );
    }

    const { overview, weeklyProgress, topLeaks, gamePerformance, personalizedInsights, jarvisAdvice } = insights;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>🧠 Jarvis Insights</h3>
                <span style={styles.subtitle}>Your Personal Training Analysis</span>
            </div>

            {/* Overview Stats */}
            <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                    <div style={styles.statValue}>{overview.totalSessions}</div>
                    <div style={styles.statLabel}>Sessions</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statValue}>{overview.overallAccuracy}%</div>
                    <div style={styles.statLabel}>Accuracy</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statValue}>{overview.currentStreak}🔥</div>
                    <div style={styles.statLabel}>Streak</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statValue}>{overview.achievementsUnlocked}</div>
                    <div style={styles.statLabel}>Achievements</div>
                </div>
            </div>

            {/* Jarvis Advice */}
            <motion.div
                style={styles.adviceBox}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div style={styles.adviceIcon}>🎯</div>
                <div style={styles.adviceContent}>
                    <div style={styles.adviceLabel}>Jarvis Recommendation</div>
                    <div style={styles.adviceText}>{jarvisAdvice}</div>
                </div>
            </motion.div>

            {/* Personalized Insights */}
            {personalizedInsights?.length > 0 && (
                <div style={styles.insightsSection}>
                    {personalizedInsights.slice(0, compact ? 2 : 4).map((insight, idx) => (
                        <motion.div
                            key={idx}
                            style={styles.insightCard}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                        >
                            <span style={styles.insightIcon}>{insight.icon}</span>
                            <div>
                                <div style={styles.insightTitle}>{insight.title}</div>
                                <div style={styles.insightMsg}>{insight.message}</div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Top Leaks */}
            {!compact && topLeaks?.length > 0 && (
                <div style={styles.leaksSection}>
                    <div style={styles.sectionTitle}>🔍 Focus Areas</div>
                    {topLeaks.slice(0, 3).map((leak, idx) => (
                        <div key={idx} style={styles.leakRow}>
                            <span style={styles.leakName}>{leak.leak}</span>
                            <span style={styles.leakCount}>{leak.count} times</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Game Performance */}
            {!compact && gamePerformance?.length > 0 && (
                <div style={styles.gamesSection}>
                    <div style={styles.sectionTitle}>📊 Game Performance</div>
                    {gamePerformance.slice(0, 5).map((game, idx) => (
                        <div key={idx} style={styles.gameRow}>
                            <div style={styles.gameName}>{game.gameName}</div>
                            <div style={styles.gameStats}>
                                <span style={{ color: parseFloat(game.accuracy) >= 80 ? '#22c55e' : '#f59e0b' }}>
                                    {game.accuracy}%
                                </span>
                                <span style={{ color: '#888' }}>Level {game.highestLevel}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Weekly Progress */}
            {!compact && weeklyProgress && (
                <div style={styles.weeklySection}>
                    <div style={styles.sectionTitle}>📅 This Week</div>
                    <div style={styles.weeklyGrid}>
                        <div style={styles.weeklyItem}>
                            <span style={styles.weeklyValue}>{weeklyProgress.sessions}</span>
                            <span style={styles.weeklyLabel}>Sessions</span>
                        </div>
                        <div style={styles.weeklyItem}>
                            <span style={styles.weeklyValue}>{weeklyProgress.correct}</span>
                            <span style={styles.weeklyLabel}>Correct</span>
                        </div>
                        <div style={styles.weeklyItem}>
                            <span style={styles.weeklyValue}>{Math.round(weeklyProgress.timeSpent / 60)}m</span>
                            <span style={styles.weeklyLabel}>Time</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,20,40,0.9), rgba(0,40,60,0.8))',
        borderRadius: 16,
        border: '1px solid rgba(0,212,255,0.3)',
        padding: 20
    },
    header: {
        marginBottom: 20
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#00d4ff'
    },
    subtitle: {
        fontSize: 12,
        color: '#888'
    },
    loading: {
        textAlign: 'center' as const,
        padding: 40,
        color: '#00d4ff'
    },
    empty: {
        textAlign: 'center' as const,
        padding: 40,
        color: '#666'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
        marginBottom: 20
    },
    statBox: {
        background: 'rgba(0,212,255,0.1)',
        borderRadius: 10,
        padding: 12,
        textAlign: 'center' as const
    },
    statValue: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff'
    },
    statLabel: {
        fontSize: 10,
        color: '#888'
    },
    adviceBox: {
        display: 'flex',
        gap: 12,
        padding: 16,
        background: 'rgba(0,212,255,0.15)',
        borderRadius: 12,
        border: '1px solid rgba(0,212,255,0.3)',
        marginBottom: 16
    },
    adviceIcon: {
        fontSize: 24
    },
    adviceContent: {
        flex: 1
    },
    adviceLabel: {
        fontSize: 10,
        color: '#00d4ff',
        textTransform: 'uppercase',
        marginBottom: 4
    },
    adviceText: {
        fontSize: 14,
        color: '#fff',
        lineHeight: 1.4
    },
    insightsSection: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
        marginBottom: 16
    },
    insightCard: {
        display: 'flex',
        gap: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 10
    },
    insightIcon: {
        fontSize: 20
    },
    insightTitle: {
        fontSize: 12,
        fontWeight: 600,
        color: '#fff'
    },
    insightMsg: {
        fontSize: 11,
        color: '#888',
        marginTop: 2
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 600,
        color: '#888',
        marginBottom: 10
    },
    leaksSection: {
        marginBottom: 16
    },
    leakRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
    },
    leakName: {
        color: '#f59e0b',
        fontSize: 13
    },
    leakCount: {
        color: '#888',
        fontSize: 12
    },
    gamesSection: {
        marginBottom: 16
    },
    gameRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
    },
    gameName: {
        color: '#fff',
        fontSize: 13
    },
    gameStats: {
        display: 'flex',
        gap: 12,
        fontSize: 12
    },
    weeklySection: {},
    weeklyGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10
    },
    weeklyItem: {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: 10,
        textAlign: 'center' as const
    },
    weeklyValue: {
        display: 'block',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff'
    },
    weeklyLabel: {
        fontSize: 10,
        color: '#888'
    }
};

export default JarvisDashboard;
