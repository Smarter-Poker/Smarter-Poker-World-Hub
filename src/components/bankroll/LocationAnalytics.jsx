/**
 * LOCATION ANALYTICS COMPONENT
 * P/L breakdown by venue with bar chart visualization
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

export default function LocationAnalytics({ entries = [], isLoading }) {
    const [sortBy, setSortBy] = useState('profit'); // 'profit' | 'sessions'

    const locationStats = useMemo(() => {
        const stats = {};

        entries.forEach(entry => {
            const locationId = entry.location_id || 'unknown';
            const locationName = entry.location_name || entry.location?.name || 'Unknown Venue';

            if (!stats[locationId]) {
                stats[locationId] = {
                    id: locationId,
                    name: locationName,
                    sessions: 0,
                    totalIn: 0,
                    totalOut: 0,
                    netPL: 0,
                    winCount: 0,
                };
            }

            const grossIn = entry.gross_in || 0;
            const grossOut = entry.gross_out || 0;
            const net = grossOut - grossIn;

            stats[locationId].sessions++;
            stats[locationId].totalIn += grossIn;
            stats[locationId].totalOut += grossOut;
            stats[locationId].netPL += net;
            if (net > 0) stats[locationId].winCount++;
        });

        return Object.values(stats);
    }, [entries]);

    const sortedLocations = useMemo(() => {
        const sorted = [...locationStats];
        if (sortBy === 'profit') {
            sorted.sort((a, b) => b.netPL - a.netPL);
        } else {
            sorted.sort((a, b) => b.sessions - a.sessions);
        }
        return sorted.slice(0, 5); // Top 5
    }, [locationStats, sortBy]);

    const maxValue = useMemo(() => {
        if (sortedLocations.length === 0) return 1;
        return Math.max(...sortedLocations.map(l => Math.abs(l.netPL)));
    }, [sortedLocations]);

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>Loading Venue Stats...</div>
            </div>
        );
    }

    if (locationStats.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h4 style={styles.title}>Venue Analytics</h4>
                </div>
                <div style={styles.emptyState}>
                    <span style={{ opacity: 0.5 }}>No Venue Data Yet</span>
                    <span style={{ fontSize: 14, color: '#8a8d91' }}>
                        Add locations to your sessions to see analytics
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <h4 style={styles.title}>Venue Analytics</h4>
                </div>
                <div style={styles.sortToggle}>
                    <button
                        onClick={() => setSortBy('profit')}
                        style={{
                            ...styles.sortBtn,
                            ...(sortBy === 'profit' ? styles.sortBtnActive : {}),
                        }}
                    >
                        P/L
                    </button>
                    <button
                        onClick={() => setSortBy('sessions')}
                        style={{
                            ...styles.sortBtn,
                            ...(sortBy === 'sessions' ? styles.sortBtnActive : {}),
                        }}
                    >
                        Sessions
                    </button>
                </div>
            </div>

            <div style={styles.chartContainer}>
                {sortedLocations.map((location, index) => {
                    const barWidth = Math.abs(location.netPL / maxValue) * 100;
                    const isProfit = location.netPL >= 0;
                    const winRate = location.sessions > 0
                        ? Math.round((location.winCount / location.sessions) * 100)
                        : 0;

                    return (
                        <motion.div
                            key={location.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            style={styles.barRow}
                        >
                            <div style={styles.barLabel}>
                                <span style={styles.venueName}>{location.name}</span>
                                <span style={styles.sessionCount}>{location.sessions} sessions</span>
                            </div>

                            <div style={styles.barContainer}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${barWidth}%` }}
                                    transition={{ duration: 0.4, delay: index * 0.05 }}
                                    style={{
                                        ...styles.bar,
                                        background: isProfit
                                            ? 'linear-gradient(90deg, rgba(34,197,94,0.8), rgba(34,197,94,0.4))'
                                            : 'linear-gradient(90deg, rgba(239,68,68,0.8), rgba(239,68,68,0.4))',
                                    }}
                                />
                            </div>

                            <div style={styles.barValue}>
                                <span style={{ color: isProfit ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                    {isProfit ? '+' : ''}${location.netPL.toLocaleString()}
                                </span>
                                <span style={styles.winRate}>{winRate}% WR</span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {locationStats.length > 5 && (
                <div style={styles.moreIndicator}>
                    +{locationStats.length - 5} more venues
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,30,60,0.95), rgba(0,20,40,0.9))',
        borderRadius: 12,
        border: '2px solid rgba(0,212,255,0.2)',
        padding: 16,
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    icon: {
        fontSize: 16,
    },
    title: {
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        color: '#2374e1',
    },
    sortToggle: {
        display: 'flex',
        gap: 4,
    },
    sortBtn: {
        padding: '4px 8px',
        background: 'transparent',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: '#8a8d91',
        fontSize: 14,
        cursor: 'pointer',
    },
    sortBtnActive: {
        background: 'rgba(0,212,255,0.2)',
        borderColor: 'rgba(0,212,255,0.4)',
        color: '#2374e1',
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: '#8a8d91',
        fontSize: 14,
    },
    emptyState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: 20,
        color: '#888',
        fontSize: 14,
    },
    chartContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
    },
    barRow: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    barLabel: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    venueName: {
        fontSize: 14,
        color: '#fff',
        fontWeight: 500,
    },
    sessionCount: {
        fontSize: 14,
        color: '#8a8d91',
    },
    barContainer: {
        height: 20,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        borderRadius: 4,
        minWidth: 4,
    },
    barValue: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 14,
    },
    winRate: {
        fontSize: 14,
        color: '#888',
    },
    moreIndicator: {
        marginTop: 10,
        textAlign: 'center',
        fontSize: 14,
        color: '#8a8d91',
    },
};
