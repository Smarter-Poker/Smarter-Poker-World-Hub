/**
 * STREET ACCURACY PANEL — Performance by Street (Preflop/Flop/Turn/River)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 16: Shows horizontal bar chart of accuracy per street,
 * with classification breakdown and EV loss indicators.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STREET_CONFIG = {
    PREFLOP: { label: 'Preflop', color: '#8b5cf6', icon: '◇', order: 0 },
    FLOP:    { label: 'Flop',    color: '#3b82f6', icon: '▣',  order: 1 },
    TURN:    { label: 'Turn',    color: '#f59e0b', icon: '◆',  order: 2 },
    RIVER:   { label: 'River',   color: '#ef4444', icon: '◉',  order: 3 },
};

const CLASSIFICATION_COLORS = {
    best: '#3b82f6',
    correct: '#22c55e',
    inaccuracy: '#fbbf24',
    wrong: '#f97316',
    blunder: '#ef4444',
};

export default function StreetAccuracyPanel({ streetAccuracy }) {
    const [expanded, setExpanded] = useState(null);

    if (!streetAccuracy || Object.keys(streetAccuracy || {}).length === 0) return null;

    // Sort streets in logical order
    const streets = Object.entries(streetAccuracy || {})
        .map(([key, data]) => ({
            key: key.toUpperCase(),
            ...data,
            config: STREET_CONFIG[key.toUpperCase()] || { label: key, color: '#94a3b8', icon: '?', order: 99 },
        }))
        .filter(s => s.total > 0 && s.key !== 'UNKNOWN')
        .sort((a, b) => a.config.order - b.config.order);

    if (streets.length === 0) return null;

    const maxTotal = Math.max(...streets.map(s => s.total));

    return (
        <div style={styles.container}>
            <div style={styles.title}>Street Performance</div>

            <div style={styles.streetList}>
                {streets.map((street, i) => {
                    const isExpanded = expanded === street.key;
                    const cls = street.classifications || {};
                    const clsTotal = Object.values(cls || {}).reduce((s, v) => s + v, 0) || 1;

                    return (
                        <motion.div
                            key={street.key}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            style={styles.streetRow}
                            onClick={() => setExpanded(isExpanded ? null : street.key)}
                        >
                            {/* Street label */}
                            <div style={styles.streetLabel}>
                                <span style={{ color: street.config.color, fontSize: 14 }}>{street.config.icon}</span>
                                <span style={{ color: street.config.color, fontWeight: 'bold', fontSize: 12 }}>
                                    {street.config.label}
                                </span>
                            </div>

                            {/* Bar container */}
                            <div style={styles.barArea}>
                                {/* Accuracy bar */}
                                <div style={styles.barTrack}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${street.accuracy}%` }}
                                        transition={{ duration: 0.6, delay: i * 0.1 }}
                                        style={{
                                            ...styles.barFill,
                                            background: `linear-gradient(90deg, ${street.config.color}60, ${street.config.color})`,
                                        }}
                                    />
                                </div>

                                {/* Classification stacked bar (thin) */}
                                {isExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 6 }}
                                        style={styles.classBar}
                                    >
                                        {Object.entries(cls || {})
                                            .filter(([_, v]) => v > 0)
                                            .sort((a, b) => {
                                                const order = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];
                                                return order.indexOf(a[0]) - order.indexOf(b[0]);
                                            })
                                            .map(([key, count]) => (
                                                <div
                                                    key={key}
                                                    style={{
                                                        width: `${(count / clsTotal) * 100}%`,
                                                        height: '100%',
                                                        background: CLASSIFICATION_COLORS[key] || '#64748b',
                                                    }}
                                                />
                                            ))
                                        }
                                    </motion.div>
                                )}
                            </div>

                            {/* Stats */}
                            <div style={styles.statsCol}>
                                <span style={{
                                    ...styles.accuracyValue,
                                    color: street.accuracy >= 75 ? '#22c55e' : street.accuracy >= 50 ? '#fbbf24' : '#ef4444',
                                }}>
                                    {street.accuracy}%
                                </span>
                                <span style={styles.evValue}>
                                    -{street.avgEvLoss.toFixed(2)}
                                </span>
                            </div>

                            {/* Hand count */}
                            <div style={styles.countCol}>
                                <span style={styles.handCount}>{street.total}</span>
                                <span style={styles.handLabel}>hands</span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Summary insight */}
            {streets.length >= 2 && (() => {
                const sorted = [...streets].sort((a, b) => a.accuracy - b.accuracy);
                const weakest = sorted[0];
                const strongest = sorted[sorted.length - 1];
                return (
                    <div style={styles.insight}>
                        <span style={{ color: '#22c55e' }}>Strongest: {strongest.config.label} ({strongest.accuracy}%)</span>
                        {' · '}
                        <span style={{ color: '#ef4444' }}>Focus on: {weakest.config.label} ({weakest.accuracy}%)</span>
                    </div>
                );
            })()}
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 16,
        padding: '12px 14px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.04)',
    },
    title: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
    },
    streetList: { display: 'flex', flexDirection: 'column', gap: 6 },
    streetRow: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.03)',
        cursor: 'pointer', transition: 'background 0.15s',
    },
    streetLabel: {
        width: 72, display: 'flex', alignItems: 'center', gap: 6,
    },
    barArea: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 },
    barTrack: {
        height: 8, background: 'rgba(255,255,255,0.05)',
        borderRadius: 4, overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 4, minWidth: 2 },
    classBar: {
        display: 'flex', borderRadius: 3, overflow: 'hidden',
    },
    statsCol: {
        width: 50, textAlign: 'right',
        display: 'flex', flexDirection: 'column', gap: 1,
    },
    accuracyValue: { fontSize: 13, fontWeight: 'bold' },
    evValue: { fontSize: 9, color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" },
    countCol: {
        width: 32, textAlign: 'right',
        display: 'flex', flexDirection: 'column',
    },
    handCount: { fontSize: 11, color: '#94a3b8', fontWeight: 600 },
    handLabel: { fontSize: 7, color: '#475569' },
    insight: {
        marginTop: 10, padding: '6px 10px',
        background: 'rgba(0,0,0,0.15)', borderRadius: 8,
        fontSize: 10, color: '#64748b', textAlign: 'center',
    },
};
