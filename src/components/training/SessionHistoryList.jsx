/**
 * 📜 SESSION HISTORY LIST — Past Training Sessions
 * Fetches and displays recent sessions with GTOW score, hand count, and EV loss
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getSessionToken } from '../../lib/authUtils';

export default function SessionHistoryList({ gameId, userId, limit = 10 }) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchSessions = useCallback(async () => {
        if (!userId || !gameId) { setLoading(false); return; }
        try {
            const token = getSessionToken();
            const params = new URLSearchParams({ gameId, limit: limit.toString() });
            const res = await fetch(`/api/training/get-sessions?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                setSessions(data.sessions);
            }
        } catch (err) {
            console.warn('[SessionHistory] Fetch error:', err.message);
        }
        setLoading(false);
    }, [gameId, userId, limit]);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.title}>Session History</div>
                <div style={styles.loading}>Loading sessions...</div>
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.title}>Session History</div>
                <div style={styles.empty}>No sessions recorded yet. Complete a game to see your history.</div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.title}>Session History</div>
                <div style={styles.count}>{sessions.length} sessions</div>
            </div>

            <div style={styles.list}>
                {sessions.map((session, i) => {
                    const score = session.gtow_score || session.accuracy_percentage || 0;
                    const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#fbbf24' : '#ef4444';
                    const date = new Date(session.created_at || session.completed_at);
                    const timeAgo = getTimeAgo(date);

                    return (
                        <motion.div
                            key={session.id || i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            style={styles.sessionRow}
                        >
                            {/* Score circle */}
                            <div style={{ ...styles.scoreCircle, borderColor: scoreColor }}>
                                <span style={{ color: scoreColor, fontWeight: 'bold', fontSize: 13 }}>
                                    {score}
                                </span>
                            </div>

                            {/* Session info */}
                            <div style={styles.sessionInfo}>
                                <div style={styles.sessionDate}>{timeAgo}</div>
                                <div style={styles.sessionMeta}>
                                    {session.hands_played || session.questions_answered || 0} hands
                                    {session.total_ev_loss ? ` · -${session.total_ev_loss.toFixed(1)} EV` : ''}
                                    {session.mistake_count ? ` · ${session.mistake_count} mistakes` : ''}
                                </div>
                            </div>

                            {/* Level / streak */}
                            <div style={styles.sessionRight}>
                                {session.level_passed !== undefined && (
                                    <span style={{
                                        ...styles.passBadge,
                                        background: session.level_passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: session.level_passed ? '#22c55e' : '#ef4444',
                                        borderColor: session.level_passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                                    }}>
                                        {session.level_passed ? '✓' : '✕'}
                                    </span>
                                )}
                                {session.best_streak > 0 && (
                                    <span style={styles.streakBadge}>{session.best_streak}</span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

function getTimeAgo(date) {
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = {
    container: {
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.04)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
    },
    count: { fontSize: 10, color: '#475569' },
    loading: { color: '#64748b', fontSize: 12, textAlign: 'center', padding: 16 },
    empty: { color: '#475569', fontSize: 11, textAlign: 'center', padding: 16, fontStyle: 'italic' },
    list: { display: 'flex', flexDirection: 'column', gap: 4 },
    sessionRow: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.03)',
    },
    scoreCircle: {
        width: 38, height: 38, borderRadius: '50%',
        border: '2px solid', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.2)',
    },
    sessionInfo: { flex: 1 },
    sessionDate: { fontSize: 12, color: '#e2e8f0', fontWeight: 600 },
    sessionMeta: { fontSize: 10, color: '#64748b', marginTop: 1 },
    sessionRight: { display: 'flex', gap: 4, alignItems: 'center' },
    passBadge: {
        width: 22, height: 22, borderRadius: 6,
        border: '1px solid', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 'bold',
    },
    streakBadge: { fontSize: 10, color: '#f97316' },
};
