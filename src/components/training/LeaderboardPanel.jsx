/**
 * LEADERBOARD PANEL — Competitive Training Rankings
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 18: Shows daily/weekly/monthly/all-time leaderboards for GTO training.
 * Fetches from /api/training/leaderboard and highlights the current user.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authedFetch } from '../../lib/authUtils';

const PERIODS = [
    { key: 'daily', label: 'Today' },
    { key: 'weekly', label: 'Week' },
    { key: 'monthly', label: 'Month' },
    { key: 'alltime', label: 'All Time' },
];

const RANK_COLORS = {
    1: '#ffd700', // Gold
    2: '#c0c0c0', // Silver
    3: '#cd7f32', // Bronze
};

function LeaderboardEntry({ entry, rank, isCurrentUser }) {
    const rankColor = RANK_COLORS[rank] || '#64748b';
    const sessionsCompleted = Number.isFinite(Number(entry.sessionsCompleted))
        ? Math.max(0, Number(entry.sessionsCompleted))
        : 0;
    const questionsCorrect = Number.isFinite(Number(entry.questionsCorrect))
        ? Math.max(0, Number(entry.questionsCorrect))
        : 0;
    const accuracy = Number.isFinite(Number(entry.accuracy))
        ? Math.max(0, Math.min(100, Number(entry.accuracy)))
        : 0;
    const gtowScoreAvg = Number.isFinite(Number(entry.gtowScoreAvg))
        ? Number(entry.gtowScoreAvg)
        : 0;
    const bestStreak = Number.isFinite(Number(entry.bestStreak))
        ? Math.max(0, Number(entry.bestStreak))
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: rank * 0.04 }}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 8,
                background: isCurrentUser
                    ? 'rgba(0,212,255,0.08)'
                    : rank <= 3 ? `${rankColor}08` : 'transparent',
                border: isCurrentUser
                    ? '1px solid rgba(0,212,255,0.2)'
                    : '1px solid transparent',
                marginBottom: 2,
            }}
        >
            {/* Rank */}
            <div style={{
                width: 24, height: 24, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: rank <= 3 ? `${rankColor}20` : 'rgba(255,255,255,0.04)',
                color: rank <= 3 ? rankColor : '#64748b',
                fontSize: 12, fontWeight: 800,
                fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
            }}>
                {rank}
            </div>

            {/* Avatar + Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: isCurrentUser ? '#00d4ff' : '#e2e8f0',
                    whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {entry.username || `Player ${rank}`}
                    {isCurrentUser && <span style={{ fontSize: 12, color: '#00d4ff', marginLeft: 4, fontWeight: 600 }}>You</span>}
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                    {sessionsCompleted} Session{sessionsCompleted !== 1 ? 's' : ''} • {questionsCorrect} Correct • {bestStreak} Best Streak
                </div>
            </div>

            {/* Score */}
            <div style={{ textAlign: 'right' }}>
                <div style={{
                    fontSize: 14, fontWeight: 800,
                    color: accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#fbbf24' : '#ef4444',
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    {accuracy}%
                </div>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                    GTOW {gtowScoreAvg.toFixed(1)}
                </div>
            </div>
        </motion.div>
    );
}

export default function LeaderboardPanel({ userId, gameId }) {
    const [period, setPeriod] = useState('weekly');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ period, limit: '20' });
            if (gameId) params.set('gameId', gameId);

            const res = await authedFetch(`/api/training/leaderboard?${params}`);
            const data = await res.json();

            if (res.ok && data.success) {
                setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
            } else {
                setError(data.error || 'Failed to load');
            }
        } catch (err) {
            console.warn('[Leaderboard] Fetch error:', err.message);
            setError('Network error');
        }
        setLoading(false);
    }, [period, gameId]);

    useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.title}>
                    <span style={{ color: '#ffd700' }}>★</span> Leaderboard
                </div>
            </div>

            {/* Period tabs */}
            <div style={styles.periodRow}>
                {PERIODS.map(p => (
                    <button
                        key={p.key}
                        onClick={() => setPeriod(p.key)}
                        style={{
                            ...styles.periodBtn,
                            ...(period === p.key ? styles.periodBtnActive : {}),
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading && (
                <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={styles.loadingText}
                >
                    Loading Rankings...
                </motion.div>
            )}

            {!loading && error && (
                <div style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', padding: 12 }}>
                    {error}
                </div>
            )}

            {!loading && !error && entries.length === 0 && (
                <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 16 }}>
                    No Entries Yet For This Period. Be The First!
                </div>
            )}

            {!loading && !error && entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {entries.map((entry, i) => (
                        <LeaderboardEntry
                            key={entry.userId || `${entry.rank}:${i}`}
                            entry={entry}
                            rank={entry.rank}
                            isCurrentUser={Boolean(userId && entry.userId === userId)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 16, padding: '14px',
        background: 'linear-gradient(180deg, rgba(255,215,0,0.04) 0%, rgba(0,0,0,0.15) 100%)',
        borderRadius: 14,
        border: '1px solid rgba(255,215,0,0.1)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 6,
    },
    periodRow: {
        display: 'flex', gap: 4, marginBottom: 10,
    },
    periodBtn: {
        flex: 1, padding: '6px 0', borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'transparent',
        color: '#64748b', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
    },
    periodBtnActive: {
        background: 'rgba(255,215,0,0.1)',
        borderColor: 'rgba(255,215,0,0.25)',
        color: '#ffd700',
    },
    loadingText: {
        color: '#64748b', fontSize: 12, textAlign: 'center', padding: 12,
    },
};
