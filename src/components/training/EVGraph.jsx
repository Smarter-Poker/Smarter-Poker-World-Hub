/**
 * EV GRAPH — Street-by-Street EV Delta Visualization
 * ═══════════════════════════════════════════════════════════════════════════
 * Pure CSS bar chart showing EV delta per street (Preflop → Flop → Turn → River).
 * Green = EV gain, Red = EV loss. No external charting library needed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_LABELS = { preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER' };
const STREET_EMOJIS = { preflop: '🃏', flop: '🟢', turn: '🔵', river: '🔴' };

export default function EVGraph({ handHistory = [], title = 'EV by Street' }) {
    // Aggregate EV deltas per street from hand history
    const streetData = useMemo(() => {
        const agg = {
            preflop: { decisions: 0, totalEV: 0 },
            flop: { decisions: 0, totalEV: 0 },
            turn: { decisions: 0, totalEV: 0 },
            river: { decisions: 0, totalEV: 0 },
        };

        (handHistory || []).forEach(hand => {
            // Each hand may have per-street actions stored as arrays
            const street = (hand.street || hand.currentStreet || '').toLowerCase();
            const evLoss = parseFloat(hand.evLoss || hand.result?.evLoss || 0);

            if (agg[street] !== undefined) {
                agg[street].decisions += 1;
                agg[street].totalEV += evLoss;
            }

            // If hand has detailed per-street breakdown
            if (hand.actions && Array.isArray(hand.actions)) {
                hand.actions.forEach(action => {
                    const s = (action.street || '').toLowerCase();
                    const ev = parseFloat(action.evLoss || 0);
                    if (agg[s] !== undefined) {
                        agg[s].decisions += 1;
                        agg[s].totalEV += ev;
                    }
                });
            }
        });

        return STREETS.map(street => ({
            street,
            label: STREET_LABELS[street],
            emoji: STREET_EMOJIS[street],
            decisions: agg[street].decisions,
            avgEV: agg[street].decisions > 0
                ? (agg[street].totalEV / agg[street].decisions)
                : 0,
            totalEV: agg[street].totalEV,
        }));
    }, [handHistory]);

    const maxEV = useMemo(() => {
        return Math.max(...streetData.map(s => Math.abs(s.avgEV)), 0.5);
    }, [streetData]);

    const hasData = streetData.some(s => s.decisions > 0);

    if (!hasData) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>{title}</div>
                <div style={styles.emptyState}>
                    No per-street EV data available yet.
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>{title}</div>

            <div style={styles.chartArea}>
                {/* Zero line */}
                <div style={styles.zeroLine} />

                <div style={styles.barsContainer}>
                    {streetData.map((data, idx) => {
                        const isPositive = data.avgEV >= 0;
                        const barHeight = Math.max((Math.abs(data.avgEV) / maxEV) * 60, 4);
                        const color = isPositive ? '#22c55e' : '#ef4444';
                        const hasDecisions = data.decisions > 0;

                        return (
                            <div key={data.street} style={styles.barColumn}>
                                {/* Value label */}
                                <div style={{ ...styles.valueLabel, color: hasDecisions ? color : '#475569' }}>
                                    {hasDecisions ? `${data.avgEV >= 0 ? '+' : ''}${data.avgEV.toFixed(2)}` : '—'}
                                </div>

                                {/* Upper area (positive) */}
                                <div style={styles.barUpperArea}>
                                    {isPositive && hasDecisions && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: barHeight }}
                                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                                            style={{
                                                ...styles.bar,
                                                background: `linear-gradient(180deg, ${color}, ${color}66)`,
                                                alignSelf: 'flex-end',
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Lower area (negative) */}
                                <div style={styles.barLowerArea}>
                                    {!isPositive && hasDecisions && (
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: barHeight }}
                                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                                            style={{
                                                ...styles.bar,
                                                background: `linear-gradient(0deg, ${color}, ${color}66)`,
                                                alignSelf: 'flex-start',
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Street label */}
                                <div style={styles.streetLabel}>
                                    <span>{data.emoji}</span>
                                    <span style={styles.streetText}>{data.label}</span>
                                </div>
                                <div style={styles.decisionCount}>
                                    {data.decisions > 0 ? `${data.decisions} decisions` : '—'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        padding: 16,
        marginBottom: 12,
    },
    header: {
        fontSize: 12,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },
    emptyState: {
        textAlign: 'center',
        padding: '20px 0',
        color: '#475569',
        fontSize: 12,
        fontStyle: 'italic',
    },
    chartArea: {
        position: 'relative',
        paddingTop: 10,
    },
    zeroLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: 1,
        background: 'rgba(255,255,255,0.1)',
        zIndex: 0,
    },
    barsContainer: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1,
    },
    barColumn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        gap: 2,
    },
    valueLabel: {
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "'Orbitron', monospace",
        height: 16,
    },
    barUpperArea: {
        height: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        width: '100%',
    },
    barLowerArea: {
        height: 60,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        width: '100%',
    },
    bar: {
        width: 28,
        borderRadius: 4,
        minHeight: 4,
    },
    streetLabel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 6,
        fontSize: 14,
    },
    streetText: {
        fontSize: 8,
        fontWeight: 700,
        color: '#475569',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    decisionCount: {
        fontSize: 8,
        color: '#334155',
        marginTop: 2,
    },
};
