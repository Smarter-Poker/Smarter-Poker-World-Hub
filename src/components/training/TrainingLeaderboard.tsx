/**
 * 🏆 TRAINING LEADERBOARD COMPONENT
 * Shows daily/weekly/all-time rankings
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PERIODS = [
    { key: 'daily', label: 'Today' },
    { key: 'weekly', label: 'This Week' },
    { key: 'monthly', label: 'This Month' },
    { key: 'alltime', label: 'All Time' }
];

export function TrainingLeaderboard({ userId, compact = false }) {
    const [period, setPeriod] = useState('daily');
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLeaderboard();
    }, [period]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/training/leaderboard?period=${period}&limit=${compact ? 5 : 20}`);
            const data = await res.json();
            if (data.success) {
                setLeaderboard(data.leaderboard);
            }
        } catch (error) {
            console.error('Failed to fetch leaderboard:', error);
        }
        setLoading(false);
    };

    const getRankStyle = (rank) => {
        if (rank === 1) return { background: 'linear-gradient(135deg, #ffd700, #ffaa00)', color: '#000' };
        if (rank === 2) return { background: 'linear-gradient(135deg, #c0c0c0, #a0a0a0)', color: '#000' };
        if (rank === 3) return { background: 'linear-gradient(135deg, #cd7f32, #b06020)', color: '#fff' };
        return { background: 'rgba(255,255,255,0.1)', color: '#fff' };
    };

    const getRankEmoji = (rank) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>🏆 Leaderboard</h3>
                {!compact && (
                    <div style={styles.periodTabs}>
                        {PERIODS.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setPeriod(p.key)}
                                style={{
                                    ...styles.periodTab,
                                    ...(period === p.key ? styles.periodTabActive : {})
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div style={styles.list}>
                {loading ? (
                    <div style={styles.loading}>Loading...</div>
                ) : leaderboard.length === 0 ? (
                    <div style={styles.empty}>No Rankings Yet. Be The First!</div>
                ) : (
                    <AnimatePresence>
                        {leaderboard.map((entry, idx) => (
                            <motion.div
                                key={entry.userId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                style={{
                                    ...styles.entry,
                                    ...(entry.userId === userId ? styles.currentUser : {})
                                }}
                            >
                                <div style={{ ...styles.rank, ...getRankStyle(entry.rank) }}>
                                    {getRankEmoji(entry.rank)}
                                </div>
                                <div style={styles.avatar}>
                                    {entry.avatarUrl ? (
                                        <img src={entry.avatarUrl} alt="" style={styles.avatarImg} />
                                    ) : (
                                        <div style={styles.avatarPlaceholder}>
                                            {entry.username?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                    )}
                                </div>
                                <div style={styles.info}>
                                    <div style={styles.username}>{entry.username}</div>
                                    <div style={styles.stats}>
                                        {entry.accuracy}% • {entry.questionsCorrect} correct
                                    </div>
                                </div>
                                <div style={styles.xp}>+{entry.totalXp} XP</div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(20,20,40,0.9))',
        borderRadius: 16,
        border: '1px solid rgba(255,215,0,0.3)',
        overflow: 'hidden'
    },
    header: {
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#ffd700'
    },
    periodTabs: {
        display: 'flex',
        gap: 8,
        marginTop: 12
    },
    periodTab: {
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 8,
        color: '#888',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    periodTabActive: {
        background: 'rgba(255,215,0,0.2)',
        color: '#ffd700'
    },
    list: {
        padding: 12,
        maxHeight: 400,
        overflowY: 'auto' as const
    },
    loading: {
        textAlign: 'center' as const,
        padding: 20,
        color: '#666'
    },
    empty: {
        textAlign: 'center' as const,
        padding: 30,
        color: '#666'
    },
    entry: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        marginBottom: 8
    },
    currentUser: {
        background: 'rgba(0,212,255,0.15)',
        border: '1px solid rgba(0,212,255,0.3)'
    },
    rank: {
        width: 36,
        height: 36,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 14
    },
    avatar: {
        width: 40,
        height: 40
    },
    avatarImg: {
        width: 40,
        height: 40,
        borderRadius: '50%',
        objectFit: 'cover' as const
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 600
    },
    info: {
        flex: 1
    },
    username: {
        fontWeight: 600,
        color: '#fff',
        fontSize: 14
    },
    stats: {
        fontSize: 12,
        color: '#888'
    },
    xp: {
        color: '#ffd700',
        fontWeight: 600,
        fontSize: 14
    }
};

export default TrainingLeaderboard;
