/**
 * HISTORICAL COMPARISON
 * Compare this period vs last period — driven by entries prop for real-time filter reactivity
 */

import { useState, useMemo } from 'react';

export default function HistoricalComparison({ entries = [] }) {
    const [period, setPeriod] = useState('month');

    const comparison = useMemo(() => {
        if (!entries || entries.length === 0) return null;

        const now = new Date();
        let currentStart, previousStart, previousEnd;

        if (period === 'month') {
            currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
            previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        } else {
            currentStart = new Date(now.getFullYear(), 0, 1);
            previousStart = new Date(now.getFullYear() - 1, 0, 1);
            previousEnd = new Date(now.getFullYear() - 1, 11, 31);
        }

        const currentEntries = entries.filter(e => {
            const d = new Date(e.entry_date + 'T12:00:00');
            return d >= currentStart && d <= now;
        });

        const previousEntries = entries.filter(e => {
            const d = new Date(e.entry_date + 'T12:00:00');
            return d >= previousStart && d <= previousEnd;
        });

        const calc = (arr) => {
            let totalIn = 0, totalOut = 0, wins = 0;
            arr.forEach(e => {
                totalIn += e.gross_in || 0;
                totalOut += e.gross_out || 0;
                if ((e.gross_out - e.gross_in) > 0) wins++;
            });
            return {
                sessions: arr.length,
                netResult: totalOut - totalIn,
                winRate: arr.length > 0 ? (wins / arr.length) * 100 : 0,
            };
        };

        const currentStats = calc(currentEntries);
        const previousStats = calc(previousEntries);

        return {
            current: currentStats,
            previous: previousStats,
            delta: {
                netResult: currentStats.netResult - previousStats.netResult,
                sessions: currentStats.sessions - previousStats.sessions,
                winRate: currentStats.winRate - previousStats.winRate,
            },
        };
    }, [entries, period]);

    const formatDelta = (value, isPercent = false) => {
        const sign = value >= 0 ? '+' : '';
        if (isPercent) return `${sign}${value.toFixed(1)}%`;
        return `${sign}$${Math.abs(value).toLocaleString()}`;
    };

    if (!comparison) {
        return <div style={styles.loading}>No data for comparison</div>;
    }

    const periodLabel = period === 'month' ? 'vs Last Month' : 'vs Last Year';

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>Historical Comparison</h3>
                <div style={styles.periodToggle}>
                    <button
                        onClick={() => setPeriod('month')}
                        style={{ ...styles.periodBtn, ...(period === 'month' ? styles.periodBtnActive : {}) }}
                    >
                        Month
                    </button>
                    <button
                        onClick={() => setPeriod('year')}
                        style={{ ...styles.periodBtn, ...(period === 'year' ? styles.periodBtnActive : {}) }}
                    >
                        Year
                    </button>
                </div>
            </div>

            <div style={styles.comparisonGrid}>
                <div style={styles.comparisonRow}>
                    <span style={styles.label}>Net Result</span>
                    <div style={styles.values}>
                        <span style={styles.current}>${comparison.current.netResult.toLocaleString()}</span>
                        <span style={{
                            ...styles.delta,
                            color: comparison.delta.netResult >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatDelta(comparison.delta.netResult)}
                        </span>
                    </div>
                </div>

                <div style={styles.comparisonRow}>
                    <span style={styles.label}>Sessions</span>
                    <div style={styles.values}>
                        <span style={styles.current}>{comparison.current.sessions}</span>
                        <span style={{
                            ...styles.delta,
                            color: comparison.delta.sessions >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {comparison.delta.sessions >= 0 ? '+' : ''}{comparison.delta.sessions}
                        </span>
                    </div>
                </div>

                <div style={styles.comparisonRow}>
                    <span style={styles.label}>Win Rate</span>
                    <div style={styles.values}>
                        <span style={styles.current}>{comparison.current.winRate.toFixed(1)}%</span>
                        <span style={{
                            ...styles.delta,
                            color: comparison.delta.winRate >= 0 ? '#22c55e' : '#ef4444'
                        }}>
                            {formatDelta(comparison.delta.winRate, true)}
                        </span>
                    </div>
                </div>
            </div>

            <div style={styles.periodLabel}>{periodLabel}</div>
        </div>
    );
}

const styles = {
    container: {
        padding: 16,
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 12,
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 13,
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        margin: 0,
    },
    periodToggle: {
        display: 'flex',
        gap: 4,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 6,
        padding: 2,
    },
    periodBtn: {
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 4,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(35, 116, 225, 0.3)',
        color: '#fff',
    },
    comparisonGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    comparisonRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
    },
    label: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    values: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    current: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    delta: {
        fontSize: 11,
        fontWeight: 500,
    },
    periodLabel: {
        textAlign: 'center',
        fontSize: 10,
        color: 'rgba(255,255,255,0.35)',
        marginTop: 10,
    },
};
