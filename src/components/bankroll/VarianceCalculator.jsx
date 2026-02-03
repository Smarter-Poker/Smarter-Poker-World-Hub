/**
 * VARIANCE CALCULATOR
 * Statistical analysis with standard deviation and confidence intervals
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function VarianceCalculator({ userId }) {
    const [stats, setStats] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (userId) loadStats();
    }, [userId]);

    async function loadStats() {
        setIsLoading(true);
        try {
            // Fetch all sessions
            const { data: entries } = await supabase
                .from('bankroll_ledger')
                .select('gross_in, gross_out, start_time, end_time')
                .eq('user_id', userId)
                .order('entry_date', { ascending: false })
                .limit(200);

            if (!entries || entries.length < 2) {
                setStats(null);
                setIsLoading(false);
                return;
            }

            // Calculate results array
            const results = entries.map(e => (e.gross_out || 0) - (e.gross_in || 0));

            // Mean
            const mean = results.reduce((a, b) => a + b, 0) / results.length;

            // Standard Deviation
            const squaredDiffs = results.map(r => Math.pow(r - mean, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b, 0) / results.length;
            const stdDev = Math.sqrt(variance);

            // Confidence interval (95%)
            const z = 1.96; // 95% CI
            const marginOfError = z * (stdDev / Math.sqrt(results.length));

            // Hourly rate estimate (assumes 3 hour sessions on average)
            const avgSessionHours = 3;
            const hourlyRate = mean / avgSessionHours;
            const hourlyStdDev = stdDev / avgSessionHours;

            // Biggest win/loss
            const biggestWin = Math.max(...results);
            const biggestLoss = Math.min(...results);

            // Downswing calculation
            let maxDrawdown = 0;
            let peak = 0;
            let runningTotal = 0;
            results.reverse().forEach(r => {
                runningTotal += r;
                if (runningTotal > peak) peak = runningTotal;
                const drawdown = peak - runningTotal;
                if (drawdown > maxDrawdown) maxDrawdown = drawdown;
            });

            setStats({
                sampleSize: results.length,
                mean,
                stdDev,
                hourlyRate,
                hourlyStdDev,
                confidenceInterval: {
                    lower: mean - marginOfError,
                    upper: mean + marginOfError
                },
                biggestWin,
                biggestLoss,
                maxDrawdown
            });
        } catch (err) {
            console.error('[VarianceCalculator] Error:', err);
        }
        setIsLoading(false);
    }

    if (isLoading) {
        return <div style={styles.loading}>Calculating variance...</div>;
    }

    if (!stats) {
        return (
            <div style={styles.empty}>
                <span style={{ fontSize: 24, marginBottom: 8 }}></span>
                <p style={{ margin: 0, fontSize: 12 }}>Need 2+ sessions for variance analysis</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>Variance Analysis</h3>

            <div style={styles.grid}>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Avg Session</div>
                    <div style={{
                        ...styles.statValue,
                        color: stats.mean >= 0 ? '#22c55e' : '#ef4444'
                    }}>
                        ${stats.mean.toFixed(0)}
                    </div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Std Dev</div>
                    <div style={styles.statValue}>${stats.stdDev.toFixed(0)}</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Hourly Rate</div>
                    <div style={{
                        ...styles.statValue,
                        color: stats.hourlyRate >= 0 ? '#22c55e' : '#ef4444'
                    }}>
                        ${stats.hourlyRate.toFixed(0)}/hr
                    </div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>95% CI</div>
                    <div style={styles.statValueSmall}>
                        ${stats.confidenceInterval.lower.toFixed(0)} to ${stats.confidenceInterval.upper.toFixed(0)}
                    </div>
                </div>
            </div>

            <div style={styles.extremes}>
                <div style={styles.extremeItem}>
                    <span style={styles.extremeLabel}>Best Session</span>
                    <span style={{ ...styles.extremeValue, color: '#22c55e' }}>
                        +${stats.biggestWin.toLocaleString()}
                    </span>
                </div>
                <div style={styles.extremeItem}>
                    <span style={styles.extremeLabel}>Worst Session</span>
                    <span style={{ ...styles.extremeValue, color: '#ef4444' }}>
                        {stats.biggestLoss >= 0 ? '+' : ''}${stats.biggestLoss.toLocaleString()}
                    </span>
                </div>
                <div style={styles.extremeItem}>
                    <span style={styles.extremeLabel}>Max Drawdown</span>
                    <span style={{ ...styles.extremeValue, color: '#eab308' }}>
                        ${stats.maxDrawdown.toLocaleString()}
                    </span>
                </div>
            </div>

            <div style={styles.sampleNote}>
                Based on {stats.sampleSize} sessions
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
    empty: {
        padding: 20,
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        margin: '0 0 14px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
        marginBottom: 14,
    },
    statBox: {
        padding: 10,
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 8,
        textAlign: 'center',
    },
    statLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    statValue: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
    },
    statValueSmall: {
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
    },
    extremes: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 8,
    },
    extremeItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    extremeLabel: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    extremeValue: {
        fontSize: 12,
        fontWeight: 600,
    },
    sampleNote: {
        marginTop: 10,
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
    },
};
