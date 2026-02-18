/**
 * WEEKLY SUMMARY COMPONENT
 * Pop-up showing 7-day P/L stats on first weekly visit
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'bankroll_weekly_summary_last_shown';

export default function WeeklySummary({
    userId,
    entries = [],
    stats,
    isOpen: forceOpen,
    onClose
}) {
    const [isVisible, setIsVisible] = useState(false);

    // Compute weekly data reactively from entries (no stale closures)
    const weeklyData = useMemo(() => {
        const now = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekEntries = entries.filter(e => {
            // Parse entry_date as local time (avoid UTC midnight → previous day in CST)
            const dateStr = e.entry_date || '';
            const entryDate = new Date(dateStr + 'T12:00:00');
            return entryDate >= weekAgo && EntryDate <= now;
        });

        let totalIn = 0;
        let totalOut = 0;
        let winCount = 0;
        let biggestWin = 0;
        let biggestLoss = 0;
        const categoryBreakdown = {};

        weekEntries.forEach(entry => {
            const grossIn = entry.gross_in || 0;
            const grossOut = entry.gross_out || 0;
            const net = grossOut - grossIn;

            totalIn += grossIn;
            totalOut += grossOut;

            if (net > 0) {
                winCount++;
                if (net > biggestWin) biggestWin = net;
            } else if (net < biggestLoss) {
                biggestLoss = net;
            }

            const cat = entry.category || 'other';
            if (!categoryBreakdown[cat]) {
                categoryBreakdown[cat] = { count: 0, netPL: 0 };
            }
            categoryBreakdown[cat].count++;
            categoryBreakdown[cat].netPL += net;
        });

        const netPL = totalOut - totalIn;
        const sessionCount = weekEntries.length;
        const winRate = sessionCount > 0 ? Math.round((winCount / sessionCount) * 100) : 0;

        return {
            netPL,
            sessionCount,
            winRate,
            biggestWin,
            biggestLoss: Math.abs(biggestLoss),
            categoryBreakdown,
            dateRange: {
                start: weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                end: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            }
        };
    }, [entries]);

    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
        return new Date(d.setDate(diff));
    }

    useEffect(() => {
        // Check if we should auto-show
        if (forceOpen !== undefined) {
            setIsVisible(forceOpen);
            return;
        }

        if (!userId) return;

        const lastShown = localStorage.getItem(STORAGE_KEY);
        const now = new Date();
        const weekStart = getWeekStart(now);

        if (!lastShown || new Date(lastShown) < weekStart) {
            // Haven't shown this week yet
            setIsVisible(true);
            localStorage.setItem(STORAGE_KEY, now.toISOString());
        }
    }, [userId, forceOpen]);

    function handleClose() {
        setIsVisible(false);
        onClose?.();
    }

    if (!weeklyData) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={styles.overlay}
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        style={styles.modal}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={styles.header}>
                            <span style={styles.emoji}></span>
                            <h2 style={styles.title}>Weekly Recap</h2>
                            <span style={styles.dateRange}>
                                {weeklyData.dateRange.start} - {weeklyData.dateRange.end}
                            </span>
                        </div>

                        {/* Main P/L */}
                        <div style={styles.mainStat}>
                            <span style={styles.mainLabel}>Net Profit/Loss</span>
                            <span style={{
                                ...styles.mainValue,
                                color: weeklyData.netPL >= 0 ? '#22c55e' : '#ef4444',
                            }}>
                                {weeklyData.netPL >= 0 ? '+' : ''}${weeklyData.netPL.toLocaleString()}
                            </span>
                        </div>

                        {/* Stats Grid */}
                        <div style={styles.statsGrid}>
                            <div style={styles.statBox}>
                                <span style={styles.statValue}>{weeklyData.sessionCount}</span>
                                <span style={styles.statLabel}>Sessions</span>
                            </div>
                            <div style={styles.statBox}>
                                <span style={styles.statValue}>{weeklyData.winRate}%</span>
                                <span style={styles.statLabel}>Win Rate</span>
                            </div>
                            <div style={styles.statBox}>
                                <span style={{ ...styles.statValue, color: '#22c55e' }}>
                                    +${weeklyData.biggestWin.toLocaleString()}
                                </span>
                                <span style={styles.statLabel}>Best Session</span>
                            </div>
                            <div style={styles.statBox}>
                                <span style={{ ...styles.statValue, color: '#ef4444' }}>
                                    -${weeklyData.biggestLoss.toLocaleString()}
                                </span>
                                <span style={styles.statLabel}>Worst Session</span>
                            </div>
                        </div>

                        {/* Category Breakdown */}
                        {Object.keys(weeklyData.categoryBreakdown).length > 0 && (
                            <div style={styles.categorySection}>
                                <span style={styles.sectionTitle}>By Category</span>
                                <div style={styles.categoryList}>
                                    {Object.entries(weeklyData.categoryBreakdown)
                                        .sort((a, b) => b[1].netPL - a[1].netPL)
                                        .map(([cat, data]) => (
                                            <div key={cat} style={styles.categoryRow}>
                                                <span style={styles.categoryName}>
                                                    {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                </span>
                                                <span style={{
                                                    color: data.netPL >= 0 ? '#22c55e' : '#ef4444',
                                                    fontWeight: 600,
                                                }}>
                                                    {data.netPL >= 0 ? '+' : ''}${data.netPL.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Empty Week State */}
                        {weeklyData.sessionCount === 0 && (
                            <div style={styles.emptyWeek}>
                                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>No Data</span>
                                <span>No Sessions Logged This Week</span>
                                <span style={{ fontSize: 14, color: '#8a8d91' }}>
                                    Keep tracking to see your weekly trends!
                                </span>
                            </div>
                        )}

                        {/* Close Button */}
                        <button onClick={handleClose} style={styles.closeBtn}>
                            Got it
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
    },
    modal: {
        background: 'linear-gradient(135deg, #0a1929, #0d2137)',
        borderRadius: 20,
        border: '2px solid rgba(0, 212, 255, 0.3)',
        padding: 24,
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    },
    header: {
        textAlign: 'center',
        marginBottom: 20,
    },
    emoji: {
        fontSize: 40,
        display: 'block',
        marginBottom: 8,
    },
    title: {
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },
    dateRange: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
        display: 'block',
    },
    mainStat: {
        textAlign: 'center',
        padding: '20px 0',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        marginBottom: 20,
    },
    mainLabel: {
        display: 'block',
        fontSize: 14,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    mainValue: {
        fontSize: 42,
        fontWeight: 800,
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 20,
    },
    statBox: {
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 14,
        textAlign: 'center',
    },
    statValue: {
        display: 'block',
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        color: '#8a8d91',
        textTransform: 'uppercase',
    },
    categorySection: {
        marginBottom: 20,
    },
    sectionTitle: {
        display: 'block',
        fontSize: 14,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    categoryList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    categoryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 6,
        fontSize: 14,
    },
    categoryName: {
        color: '#e4e6eb',
    },
    emptyWeek: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 30,
        color: '#888',
        fontSize: 14,
    },
    closeBtn: {
        width: '100%',
        padding: 14,
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
