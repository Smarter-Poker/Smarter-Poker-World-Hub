/**
 * HISTORICAL COMPARISON
 * Compare this period vs last period
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function HistoricalComparison({ userId }) {
    const [comparison, setComparison] = useState(null);
    const [period, setPeriod] = useState('month'); // 'month' or 'year'
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userId) loadComparison();
    }, [userId, period]);

    async function loadComparison() {
        setIsLoading(true);
        try {
            const now = new Date();
            let currentStart, currentEnd, previousStart, previousEnd;

            if (period === 'month') {
                // This month
                currentStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                currentEnd = now.toISOString().split('T')[0];
                // Last month
                previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
                previousEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
            } else {
                // This year
                currentStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
                currentEnd = now.toISOString().split('T')[0];
                // Last year
                previousStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
                previousEnd = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
            }

            // Fetch current period
            const { data: current } = await supabase
                .from('bankroll_ledger')
                .select('gross_in, gross_out')
                .eq('user_id', userId)
                .gte('entry_date', currentStart)
                .lte('entry_date', currentEnd);

            // Fetch previous period
            const { data: previous } = await supabase
                .from('bankroll_ledger')
                .select('gross_in, gross_out')
                .eq('user_id', userId)
                .gte('entry_date', previousStart)
                .lte('entry_date', previousEnd);

            // Calculate stats
            const currentStats = calculateStats(current || []);
            const previousStats = calculateStats(previous || []);

            setComparison({
                current: currentStats,
                previous: previousStats,
                delta: {
                    netResult: currentStats.netResult - previousStats.netResult,
                    sessions: currentStats.sessions - previousStats.sessions,
                    winRate: currentStats.winRate - previousStats.winRate,
                }
            });
        } catch (err) {
            console.error('[HistoricalComparison] Error:', err);
        }
        setIsLoading(false);
    }

    function calculateStats(entries) {
        let totalIn = 0, totalOut = 0, wins = 0;
        entries.forEach(e => {
            totalIn += e.gross_in || 0;
            totalOut += e.gross_out || 0;
            if ((e.gross_out - e.gross_in) > 0) wins++;
        });
        return {
            sessions: entries.length,
            netResult: totalOut - totalIn,
            winRate: entries.length > 0 ? (wins / entries.length) * 100 : 0
        };
    }

    function formatDelta(value, isPercent = false) {
        const sign = value >= 0 ? '+' : '';
        if (isPercent) return `${sign}${value.toFixed(1)}%`;
        return `${sign}$${Math.abs(value).toLocaleString()}`;
    }

    if (isLoading || !comparison) {
        return <div style={styles.loading}>Loading comparison...</div>;
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>📊 Historical Comparison</h3>
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

            <div style={styles.periodLabel}>
                vs {period === 'month' ? 'Last Month' : 'Last Year'}
            </div>
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
        marginBottom: 16,
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
        background: 'rgba(255, 255, 255, 0.05)',
        padding: 3,
        borderRadius: 6,
    },
    periodBtn: {
        padding: '4px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(0, 212, 255, 0.2)',
        color: '#00D4FF',
    },
    comparisonGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    comparisonRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
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
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(255, 255, 255, 0.05)',
    },
    periodLabel: {
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
    },
};
