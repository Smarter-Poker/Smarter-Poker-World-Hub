/**
 * VARIANCE CALCULATOR
 * Statistical analysis — driven by entries prop for real-time filter reactivity
 */

import { useMemo } from 'react';

export default function VarianceCalculator({ entries = [] }) {
    const stats = useMemo(() => {
        if (!entries || entries.length < 2) return null;

        const results = entries.map(e => (e.gross_out || 0) - (e.gross_in || 0));
        const mean = results.reduce((a, b) => a + b, 0) / results.length;
        const squaredDiffs = results.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / results.length;
        const stdDev = Math.sqrt(variance);

        // 95% confidence interval
        const z = 1.96;
        const marginOfError = z * (stdDev / Math.sqrt(results.length));

        // Hourly rate (assumes ~3hr avg)
        const hourlyRate = mean / 3;

        // Extremes
        const biggestWin = Math.max(...results);
        const biggestLoss = Math.min(...results);

        // Max drawdown
        let maxDrawdown = 0, peak = 0, runningTotal = 0;
        [...results].reverse().forEach(r => {
            runningTotal += r;
            if (runningTotal > peak) peak = runningTotal;
            const drawdown = peak - runningTotal;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });

        return {
            sampleSize: results.length,
            mean,
            stdDev,
            hourlyRate,
            confidenceInterval: { lower: mean - marginOfError, upper: mean + marginOfError },
            biggestWin,
            biggestLoss,
            maxDrawdown,
        };
    }, [entries]);

    if (!stats) {
        return (
            <div style={styles.empty}>
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
                    <div style={{ ...styles.statValue, color: stats.mean >= 0 ? '#22c55e' : '#ef4444' }}>
                        ${stats.mean.toFixed(0)}
                    </div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Std Dev</div>
                    <div style={styles.statValue}>${stats.stdDev.toFixed(0)}</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Hourly Rate</div>
                    <div style={{ ...styles.statValue, color: stats.hourlyRate >= 0 ? '#22c55e' : '#ef4444' }}>
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
                    <span style={{ ...styles.extremeValue, color: '#22c55e' }}>+${stats.biggestWin.toLocaleString()}</span>
                </div>
                <div style={styles.extremeItem}>
                    <span style={styles.extremeLabel}>Worst Session</span>
                    <span style={{ ...styles.extremeValue, color: '#ef4444' }}>{stats.biggestLoss >= 0 ? '+' : ''}${stats.biggestLoss.toLocaleString()}</span>
                </div>
                <div style={styles.extremeItem}>
                    <span style={styles.extremeLabel}>Max Drawdown</span>
                    <span style={{ ...styles.extremeValue, color: '#eab308' }}>${stats.maxDrawdown.toLocaleString()}</span>
                </div>
            </div>
            <div style={styles.sampleNote}>Based on {stats.sampleSize} sessions</div>
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
