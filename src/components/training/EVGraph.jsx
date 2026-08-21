/**
 * EV GRAPH — Street-by-Street EV Delta Visualization
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Pure CSS bar chart showing EV delta per street (Preflop → Flop → Turn → River).
 * Green = EV gain, Red = EV loss. No external charting library needed.
 * Enhanced with tooltips, trend indicators, comparative data, and sparklines.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const STREETS = ['preflop', 'flop', 'turn', 'river'];
const STREET_LABELS = { preflop: 'PREFLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER' };

// Tooltip component
function Tooltip({ children, content, visible }) {
    if (!visible || !content) return children;
    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {children}
            <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 8,
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.95)',
                color: '#fff',
                fontSize: 10,
                borderRadius: 6,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                lineHeight: 1.4
            }}>
                {content}
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '4px solid rgba(0,0,0,0.95)'
                }} />
            </div>
        </div>
    );
}

// Trend indicator arrow
function TrendArrow({ current, previous }) {
    if (previous === undefined || previous === null) return null;

    const change = current - previous;
    const isPositive = change > 0;
    const isNeutral = Math.abs(change) < 0.01;

    if (isNeutral) return null;

    return (
        <span style={{
            fontSize: 11,
            fontWeight: 'bold',
            color: isPositive ? '#22c55e' : '#ef4444',
            marginLeft: 4
        }}>
            {isPositive ? '↑' : '↓'}
        </span>
    );
}

// Sparkline mini-chart
function Sparkline({ data = [], color = '#3b82f6', height = 16, width = 40 }) {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data.map(Math.abs), 0.1);
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height / 2 - (value / max) * (height / 2);
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 6 }}>
            <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
            />
        </svg>
    );
}

export default function EVGraph({ handHistory = [], title = 'EV by Street', previousData = null, historicalData = [] }) {
    const [hoveredStreet, setHoveredStreet] = useState(null);

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
            decisions: agg[street].decisions,
            avgEV: agg[street].decisions > 0
                ? (agg[street].totalEV / agg[street].decisions)
                : 0,
            totalEV: agg[street].totalEV,
            previousAvgEV: previousData?.[street]?.avgEV,
        }));
    }, [handHistory, previousData]);

    const maxEV = useMemo(() => {
        return Math.max(...streetData.map(s => Math.abs(s.avgEV)), 0.5);
    }, [streetData]);

    const hasData = streetData.some(s => s.decisions > 0);

    // Calculate session average for comparison
    const sessionAvgEV = useMemo(() => {
        const validStreets = streetData.filter(s => s.decisions > 0);
        if (validStreets.length === 0) return 0;
        return validStreets.reduce((sum, s) => sum + s.avgEV, 0) / validStreets.length;
    }, [streetData]);

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
            <div style={{ ...styles.header, justifyContent: 'space-between' }}>
                <span>{title}</span>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 'normal', textTransform: 'none', letterSpacing: 0 }}>
                    Session avg: {sessionAvgEV >= 0 ? '+' : ''}{sessionAvgEV.toFixed(2)} EV
                </span>
            </div>

            <div style={styles.chartArea}>
                {/* Zero line */}
                <div style={styles.zeroLine} />

                <div style={styles.barsContainer}>
                    {streetData.map((data, idx) => {
                        const isPositive = data.avgEV >= 0;
                        const barHeight = Math.max((Math.abs(data.avgEV) / maxEV) * 60, 4);
                        const color = isPositive ? '#22c55e' : '#ef4444';
                        const hasDecisions = data.decisions > 0;

                        // Get historical data for this street
                        const streetHistory = historicalData
                            .filter(item => item.street === data.street)
                            .map(item => item.avgEV);

                        const tooltipContent = hasDecisions ? (
                            <div>
                                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{data.label}</div>
                                <div>Avg EV: {data.avgEV >= 0 ? '+' : ''}{data.avgEV.toFixed(2)}</div>
                                <div>Total EV: {data.totalEV >= 0 ? '+' : ''}{data.totalEV.toFixed(2)}</div>
                                <div>Decisions: {data.decisions}</div>
                                {data.previousAvgEV !== undefined && (
                                    <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        Previous: {data.previousAvgEV >= 0 ? '+' : ''}{data.previousAvgEV.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        ) : null;

                        return (
                            <div
                                key={data.street}
                                style={{
                                    ...styles.barColumn,
                                    opacity: hoveredStreet === null || hoveredStreet === data.street ? 1 : 0.4,
                                    transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={() => setHoveredStreet(data.street)}
                                onMouseLeave={() => setHoveredStreet(null)}
                            >
                                {/* Value label with trend */}
                                <Tooltip content={tooltipContent} visible={hoveredStreet === data.street}>
                                    <div style={{ ...styles.valueLabel, color: hasDecisions ? color : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {hasDecisions ? (
                                            <>
                                                <span>{data.avgEV >= 0 ? '+' : ''}{data.avgEV.toFixed(2)}</span>
                                                <TrendArrow current={data.avgEV} previous={data.previousAvgEV} />
                                            </>
                                        ) : '—'}
                                    </div>
                                </Tooltip>

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
                                                cursor: 'pointer',
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
                                                cursor: 'pointer',
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Street label */}
                                <div style={styles.streetLabel}>
                                    <span style={styles.streetText}>{data.label}</span>
                                </div>
                                <div style={styles.decisionCount}>
                                    {data.decisions > 0 ? `${data.decisions} decisions` : '—'}
                                </div>

                                {/* Sparkline for historical trend */}
                                {streetHistory.length > 1 && (
                                    <div style={{ marginTop: 4 }}>
                                        <Sparkline data={streetHistory} color={color} height={14} width={40} />
                                    </div>
                                )}
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
        fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
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
