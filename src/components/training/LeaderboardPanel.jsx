/**
 * LEADERBOARD PANEL — Competitive Training Rankings
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 18: Shows daily/weekly/monthly/all-time leaderboards for GTO training.
 * Fetches from /api/training/leaderboard and highlights the current user.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSessionToken } from '../../lib/authUtils';

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
                fontSize: 11, fontWeight: 800,
                fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
            }}>
                {rank}
            </div>

            {/* Avatar + Name */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: isCurrentUser ? '#00d4ff' : '#e2e8f0',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {entry.display_name || entry.username || `Player ${rank}`}
                    {isCurrentUser && <span style={{ fontSize: 9, color: '#00d4ff', marginLeft: 4, fontWeight: 600 }}>YOU</span>}
                </div>
                <div style={{ fontSize: 9, color: '#475569' }}>
                    {entry.sessions_completed || 0} session{(entry.sessions_completed || 0) !== 1 ? 's' : ''} • {entry.questions_answered || 0} hands
                </div>
            </div>

            {/* Score */}
            <div style={{ textAlign: 'right' }}>
                <div style={{
                    fontSize: 14, fontWeight: 800,
                    color: (entry.accuracy || 0) >= 80 ? '#22c55e' : (entry.accuracy || 0) >= 60 ? '#fbbf24' : '#ef4444',
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    {entry.accuracy || 0}%
                </div>
                <div style={{ fontSize: 8, color: '#475569', fontWeight: 600 }}>
                    ◆ {entry.total_diamonds || 0}
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

            const res = await fetch(`/api/training/leaderboard?${params}`);
            const data = await res.json();

            if (data.success) {
                setEntries(data.leaderboard || []);
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
                    Loading rankings...
                </motion.div>
            )}

            {!loading && error && (
                <div style={{ color: '#ef4444', fontSize: 11, textAlign: 'center', padding: 12 }}>
                    {error}
                </div>
            )}

            {!loading && !error && entries.length === 0 && (
                <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: 16 }}>
                    No entries yet for this period. Be the first!
                </div>
            )}

            {!loading && !error && entries.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {entries.map((entry, i) => (
                        <LeaderboardEntry
                            key={entry.user_id || i}
                            entry={entry}
                            rank={i + 1}
                            isCurrentUser={userId && entry.user_id === userId}
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
        color: '#64748b', fontSize: 10, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
    },
    periodBtnActive: {
        background: 'rgba(255,215,0,0.1)',
        borderColor: 'rgba(255,215,0,0.25)',
        color: '#ffd700',
    },
    loadingText: {
        color: '#64748b', fontSize: 11, textAlign: 'center', padding: 12,
    },
};
