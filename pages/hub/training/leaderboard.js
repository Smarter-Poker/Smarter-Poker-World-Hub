/**
 * Training Leaderboard Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Global and friend leaderboards for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function TrainingLeaderboard() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('all-time'); // 'daily', 'weekly', 'all-time'
    const [view, setView] = useState('global'); // 'global', 'friends'
    const [leaderboard, setLeaderboard] = useState([]);
    const [userRank, setUserRank] = useState(null);

    useEffect(() => {
        loadLeaderboard();
    }, [timeframe, view]);

    const loadLeaderboard = async () => {
        try {
            setLoading(true);
            const authUser = await getAuthUser();
            setUser(authUser);

            // Calculate date filter
            let dateFilter = null;
            if (timeframe === 'daily') {
                dateFilter = new Date();
                dateFilter.setHours(0, 0, 0, 0);
            } else if (timeframe === 'weekly') {
                dateFilter = new Date();
                dateFilter.setDate(dateFilter.getDate() - 7);
            }

            // Build query
            let query = supabase
                .from('training_sessions')
                .select('user_id, questions_answered, correct_answers, created_at, profiles(username, avatar_url)');

            if (dateFilter) {
                query = query.gte('created_at', dateFilter.toISOString());
            }

            const { data: sessions, error } = await query;

            if (error) throw error;

            // Aggregate by user
            const userStats = {};
            sessions?.forEach(session => {
                const userId = session.user_id;
                if (!userStats[userId]) {
                    userStats[userId] = {
                        userId,
                        username: session.profiles?.username || 'Anonymous',
                        avatarUrl: session.profiles?.avatar_url,
                        totalQuestions: 0,
                        correctAnswers: 0,
                        accuracy: 0,
                        score: 0
                    };
                }
                userStats[userId].totalQuestions += session.questions_answered || 0;
                userStats[userId].correctAnswers += session.correct_answers || 0;
            });

            // Calculate accuracy and score
            Object.values(userStats).forEach(stats => {
                stats.accuracy = stats.totalQuestions > 0
                    ? Math.round((stats.correctAnswers / stats.totalQuestions) * 100)
                    : 0;
                // Score = correct answers * accuracy bonus
                stats.score = stats.correctAnswers * (1 + stats.accuracy / 100);
            });

            // Sort by score
            const sorted = Object.values(userStats)
                .sort((a, b) => b.score - a.score)
                .slice(0, 100); // Top 100

            setLeaderboard(sorted);

            // Find user rank
            if (authUser) {
                const rank = sorted.findIndex(s => s.userId === authUser.id);
                setUserRank(rank >= 0 ? rank + 1 : null);
            }

            setLoading(false);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            setLoading(false);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Training Leaderboard — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>🏆 Training Leaderboard</h1>

                    {/* Filters */}
                    <div style={styles.filters}>
                        <div style={styles.filterGroup}>
                            <button
                                style={timeframe === 'daily' ? styles.filterButtonActive : styles.filterButton}
                                onClick={() => setTimeframe('daily')}
                            >
                                Daily
                            </button>
                            <button
                                style={timeframe === 'weekly' ? styles.filterButtonActive : styles.filterButton}
                                onClick={() => setTimeframe('weekly')}
                            >
                                Weekly
                            </button>
                            <button
                                style={timeframe === 'all-time' ? styles.filterButtonActive : styles.filterButton}
                                onClick={() => setTimeframe('all-time')}
                            >
                                All Time
                            </button>
                        </div>

                        {/* TODO: Add friends filter when friendships are implemented */}
                    </div>

                    {/* User Rank */}
                    {user && userRank && (
                        <div style={styles.userRankCard}>
                            <span style={styles.userRankLabel}>Your Rank:</span>
                            <span style={styles.userRankValue}>#{userRank}</span>
                        </div>
                    )}

                    {/* Leaderboard */}
                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>🏆</div>
                            <p style={styles.loadingText}>Loading leaderboard...</p>
                        </div>
                    ) : (
                        <div style={styles.leaderboardList}>
                            {leaderboard.map((entry, index) => (
                                <LeaderboardEntry
                                    key={entry.userId}
                                    rank={index + 1}
                                    {...entry}
                                    isCurrentUser={user?.id === entry.userId}
                                />
                            ))}

                            {leaderboard.length === 0 && (
                                <div style={styles.emptyState}>
                                    <p>No data yet for this timeframe</p>
                                    <Link href="/hub/training">
                                        <a style={styles.button}>Start Training</a>
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function LeaderboardEntry({ rank, username, avatarUrl, totalQuestions, correctAnswers, accuracy, score, isCurrentUser }) {
    const getRankColor = () => {
        if (rank === 1) return '#FFD700'; // Gold
        if (rank === 2) return '#C0C0C0'; // Silver
        if (rank === 3) return '#CD7F32'; // Bronze
        return '#00E0FF';
    };

    const getRankIcon = () => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return null;
    };

    return (
        <motion.div
            style={{
                ...styles.leaderboardEntry,
                ...(isCurrentUser ? styles.currentUserEntry : {})
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rank * 0.02 }}
        >
            <div style={styles.rankSection}>
                {getRankIcon() ? (
                    <span style={styles.rankIcon}>{getRankIcon()}</span>
                ) : (
                    <span style={{ ...styles.rank, color: getRankColor() }}>#{rank}</span>
                )}
            </div>

            <div style={styles.userSection}>
                {avatarUrl && (
                    <img src={avatarUrl} alt={username} style={styles.avatar} />
                )}
                <div>
                    <div style={styles.username}>
                        {username}
                        {isCurrentUser && <span style={styles.youBadge}>YOU</span>}
                    </div>
                    <div style={styles.userStats}>
                        {totalQuestions} questions • {accuracy}% accuracy
                    </div>
                </div>
            </div>

            <div style={styles.scoreSection}>
                <div style={styles.score}>{Math.round(score)}</div>
                <div style={styles.scoreLabel}>points</div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

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
    title: {
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '32px',
        textAlign: 'center'
    },
    filters: {
        marginBottom: '24px'
    },
    filterGroup: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'center'
    },
    filterButton: {
        padding: '8px 24px',
        background: 'transparent',
        color: '#9ca3af',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    filterButtonActive: {
        padding: '8px 24px',
        background: '#00E0FF',
        color: '#FFFFFF',
        border: '1px solid #00E0FF',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    userRankCard: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        background: 'linear-gradient(135deg, rgba(0, 224, 255, 0.1), rgba(0, 153, 255, 0.1))',
        border: '1px solid rgba(0, 224, 255, 0.3)',
        borderRadius: '12px',
        marginBottom: '24px'
    },
    userRankLabel: {
        fontSize: '16px',
        color: '#9ca3af'
    },
    userRankValue: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#00E0FF'
    },
    leaderboardList: {
        display: 'grid',
        gap: '12px'
    },
    leaderboardEntry: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        transition: 'all 0.2s'
    },
    currentUserEntry: {
        background: 'rgba(0, 224, 255, 0.05)',
        border: '1px solid rgba(0, 224, 255, 0.3)'
    },
    rankSection: {
        minWidth: '50px',
        textAlign: 'center'
    },
    rank: {
        fontSize: '20px',
        fontWeight: 700
    },
    rankIcon: {
        fontSize: '28px'
    },
    userSection: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    avatar: {
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        objectFit: 'cover'
    },
    username: {
        fontSize: '16px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    youBadge: {
        padding: '2px 8px',
        background: '#00E0FF',
        color: '#000',
        fontSize: '10px',
        fontWeight: 700,
        borderRadius: '4px'
    },
    userStats: {
        fontSize: '14px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    scoreSection: {
        textAlign: 'right'
    },
    score: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#00E0FF'
    },
    scoreLabel: {
        fontSize: '12px',
        color: '#9ca3af'
    },
    loadingContainer: {
        textAlign: 'center',
        padding: '80px 24px'
    },
    spinner: {
        fontSize: '48px',
        animation: 'pulse 1.5s ease-in-out infinite'
    },
    loadingText: {
        marginTop: '16px',
        color: '#9ca3af'
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 24px',
        color: '#9ca3af'
    },
    button: {
        display: 'inline-block',
        marginTop: '24px',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#FFFFFF',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600
    }
};
