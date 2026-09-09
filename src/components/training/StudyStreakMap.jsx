/**
 * Study Streak Map — GitHub-style Contribution Graph
 * ===================================================
 * Visualizes daily training sessions over the past year.
 * Includes a self-fetching wrapper (StudyStreakMapAuto) for use
 * in contexts where session data isn't pre-loaded.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { authedFetch } from '../../lib/authUtils';

// Generates a map of dates to intensities based on session count
function buildDateMap(sessionHistory) {
    const map = new Map();
    // Default: look back 180 days (approx 6 months to fit mobile better)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const session of sessionHistory) {
        if (!session.created_at) continue;
        const d = new Date(session.created_at);
        d.setHours(0, 0, 0, 0);
        const time = d.getTime();
        map.set(time, (map.get(time) || 0) + 1);
    }
    return map;
}

export default function StudyStreakMap({ sessionHistory = [] }) {
    const { days, maxVal, currentStreak, bestStreak } = useMemo(() => {
        const dMap = buildDateMap(sessionHistory);
        let maxSessionCount = 0;

        // Calculate raw streaks
        let currentS = 0;
        let bestS = 0;
        let tempStreak = 0;
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        // Build the grid (last 168 days = 24 weeks * 7 days for a clean grid)
        const gridDays = [];
        for (let i = 167; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const time = d.getTime();
            const count = dMap.get(time) || 0;
            if (count > maxSessionCount) maxSessionCount = count;
            gridDays.push({ date: d, count });
        }

        // Streak calc (working backwards from today)
        for (let i = gridDays.length - 1; i >= 0; i--) {
            if (gridDays[i].count > 0) {
                tempStreak++;
                if (i === gridDays.length - 1 || currentS > 0) currentS = tempStreak;
                if (tempStreak > bestS) bestS = tempStreak;
            } else {
                if (i === gridDays.length - 1) {
                    // Today is 0, check yesterday. If yesterday is 0, current streak is 0.
                    if (gridDays.length > 1 && gridDays[gridDays.length - 2].count === 0) {
                        currentS = 0;
                    } else if (gridDays.length > 1 && gridDays[gridDays.length - 2].count > 0) {
                        currentS = tempStreak; // Streak is alive if played yesterday
                    }
                }
                tempStreak = 0;
            }
        }

        return { days: gridDays, maxVal: Math.max(maxSessionCount, 4), currentStreak: currentS, bestStreak: bestS };
    }, [sessionHistory]);

    // Color buckets based on session count
    const getColor = (count) => {
        if (count === 0) return 'rgba(255, 255, 255, 0.05)'; // empty
        if (count === 1) return '#0e4429'; // level 1
        if (count <= 3) return '#006d32'; // level 2
        if (count <= 6) return '#26a641'; // level 3
        return '#39d353'; // level 4 (max)
    };

    // Reshape into 7 rows (Sun-Sat)
    const weeks = [];
    let currentWeek = [];
    days.forEach((day, i) => {
        currentWeek.push(day);
        if (currentWeek.length === 7 || i === days.length - 1) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h3 style={styles.title}>Study Routine</h3>
                    <p style={styles.subtitle}>{sessionHistory.length} Sessions Recorded</p>
                </div>
                <div style={styles.statsRow}>
                    <div style={styles.statBox}>
                        <div style={styles.statVal}>{currentStreak}</div>
                        <div style={styles.statLabel}>Day Streak</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={{ ...styles.statVal, color: '#39d353' }}>{bestStreak}</div>
                        <div style={styles.statLabel}>Best Streak</div>
                    </div>
                </div>
            </div>

            <div style={styles.gridContainer}>
                {weeks.map((week, wIdx) => (
                    <div key={wIdx} style={styles.weekColumn}>
                        {week.map((day, dIdx) => (
                            <div
                                key={dIdx}
                                style={{
                                    ...styles.daySquare,
                                    backgroundColor: getColor(day.count),
                                }}
                                title={`${day.count} sessions on ${day.date.toLocaleDateString()}`}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <div style={styles.legend}>
                <span style={styles.legendText}>Less</span>
                <div style={{ ...styles.daySquare, backgroundColor: getColor(0), width: 10, height: 10 }} />
                <div style={{ ...styles.daySquare, backgroundColor: getColor(1), width: 10, height: 10 }} />
                <div style={{ ...styles.daySquare, backgroundColor: getColor(3), width: 10, height: 10 }} />
                <div style={{ ...styles.daySquare, backgroundColor: getColor(6), width: 10, height: 10 }} />
                <div style={{ ...styles.daySquare, backgroundColor: getColor(10), width: 10, height: 10 }} />
                <span style={styles.legendText}>More</span>
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 4px 0',
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        margin: 0,
    },
    statsRow: {
        display: 'flex',
        gap: 12,
    },
    statBox: {
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: '8px 12px',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
    },
    statVal: {
        fontSize: 18,
        fontWeight: 800,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
    },
    gridContainer: {
        display: 'flex',
        gap: 4,
        // MOBILE PHASE 5: the streak map wraps. It was a hidden-scrollbar
        // strip, so the earliest weeks were off the left edge unannounced.
        flexWrap: 'wrap',
        paddingBottom: 8,
    },
    weekColumn: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    daySquare: {
        width: 12,
        height: 12,
        borderRadius: 3,
        flexShrink: 0,
    },
    legend: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 8,
        opacity: 0.8,
    },
    legendText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        margin: '0 4px',
    },
    stateText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        lineHeight: 1.5,
    },
    errorText: {
        color: '#fbbf24',
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 4,
    },
    retryButton: {
        minHeight: 44,
        marginTop: 12,
        padding: '0 18px',
        border: '1px solid rgba(34, 211, 238, 0.55)',
        borderRadius: 8,
        background: 'rgba(34, 211, 238, 0.1)',
        color: '#e2e8f0',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
    },
};

/**
 * ●●● PHASE 21: Self-fetching wrapper ●●●
 * Fetches all sessions for a user and renders the streak map.
 * Use this in contexts where session data isn't available as a prop.
 */
export function StudyStreakMapAuto({ userId, gameId }) {
    const [sessions, setSessions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAllSessions = useCallback(async () => {
        if (!userId) {
            setSessions(null);
            setError(null);
            setLoading(false);
            return;
        }
        setSessions(null);
        setError(null);
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '500' });
            if (gameId) params.set('gameId', gameId);
            const res = await authedFetch(`/api/training/get-sessions?${params}`);
            const data = await res.json();
            if (!res.ok || data?.success !== true || !Array.isArray(data.sessions)) {
                throw new Error(`session history unavailable (${res.status})`);
            }
            setSessions(data.sessions);
        } catch (err) {
            setSessions(null);
            setError('Study routine history is temporarily unavailable.');
            console.warn('[StudyStreakMap] Fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [userId, gameId]);

    useEffect(() => { fetchAllSessions(); }, [fetchAllSessions]);

    if (!userId) {
        return (
            <div style={{ ...styles.container, textAlign: 'center', padding: 20 }} role="status">
                <div style={styles.stateText}>Sign In To View Your Study Routine.</div>
            </div>
        );
    }

    if (loading || (!error && sessions === null)) {
        return (
            <div style={{ ...styles.container, textAlign: 'center', padding: 20 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Loading Study Routine...</div>
            </div>
        );
    }

    if (error || !Array.isArray(sessions)) {
        return (
            <div style={{ ...styles.container, textAlign: 'center', padding: 20 }} role="alert">
                <div style={styles.errorText}>Study Routine Is Temporarily Unavailable.</div>
                <div style={styles.stateText}>No Empty Routine Or Streak Was Assumed.</div>
                <button type="button" style={styles.retryButton} onClick={fetchAllSessions}>Retry</button>
            </div>
        );
    }

    return <StudyStreakMap sessionHistory={sessions} />;
}
