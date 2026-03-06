/**
 * 📊 POSITION STATS PANEL — Per-Position Performance Breakdown
 * Shows accuracy, EV loss, and classification by position (BTN, CO, BB, etc.)
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';

const POSITION_COLORS = {
    BTN: '#22c55e',
    CO: '#3b82f6',
    HJ: '#8b5cf6',
    MP: '#f59e0b',
    UTG: '#ef4444',
    SB: '#f97316',
    BB: '#06b6d4',
    EP: '#ec4899',
};

const POSITION_ORDER = ['BTN', 'CO', 'HJ', 'MP', 'UTG', 'SB', 'BB'];

export default function PositionStatsPanel({ handHistory }) {
    // Aggregate stats by position
    const positionStats = useMemo(() => {
        if (!handHistory || handHistory.length === 0) return {};

        const stats = {};
        handHistory.forEach((entry) => {
            const hd = entry.handData || entry;
            const pos = (hd.heroPosition || 'UNK').toUpperCase();

            if (!stats[pos]) {
                stats[pos] = {
                    total: 0,
                    perfect: 0,
                    mistakes: 0,
                    totalEVLoss: 0,
                    classifications: {},
                };
                Object.values(MOVE_CLASSIFICATIONS).forEach(c => (stats[pos].classifications[c] = 0));
            }

            stats[pos].total += 1;
            stats[pos].totalEVLoss += (entry.evLoss || 0);

            if (entry.classification) {
                stats[pos].classifications[entry.classification] = (stats[pos].classifications[entry.classification] || 0) + 1;
            }

            const isBest = entry.classification === MOVE_CLASSIFICATIONS.BEST ||
                entry.classification === MOVE_CLASSIFICATIONS.GOOD;
            if (isBest) stats[pos].perfect += 1;

            const isMistake = [
                MOVE_CLASSIFICATIONS.INACCURACY,
                MOVE_CLASSIFICATIONS.WRONG,
                MOVE_CLASSIFICATIONS.BLUNDER,
            ].includes(entry.classification);
            if (isMistake) stats[pos].mistakes += 1;
        });

        return stats;
    }, [handHistory]);

    // Sort positions in standard order
    const sortedPositions = useMemo(() => {
        return Object.keys(positionStats)
            .sort((a, b) => {
                const ai = POSITION_ORDER.indexOf(a);
                const bi = POSITION_ORDER.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            });
    }, [positionStats]);

    if (sortedPositions.length <= 1) return null; // No value showing single position

    return (
        <div style={styles.container}>
            <div style={styles.title}>Position Breakdown</div>

            {/* Position bars */}
            <div style={styles.barChart}>
                {sortedPositions.map((pos, i) => {
                    const stat = positionStats[pos];
                    const accuracy = stat.total > 0 ? Math.round((stat.perfect / stat.total) * 100) : 0;
                    const avgEV = stat.total > 0 ? (stat.totalEVLoss / stat.total).toFixed(2) : '0.00';
                    const posColor = POSITION_COLORS[pos] || '#94a3b8';

                    return (
                        <motion.div
                            key={pos}
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            style={styles.posRow}
                        >
                            {/* Position label */}
                            <div style={{ ...styles.posLabel, color: posColor }}>{pos}</div>

                            {/* Accuracy bar */}
                            <div style={styles.barContainer}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${accuracy}%` }}
                                    transition={{ duration: 0.6, delay: i * 0.08 }}
                                    style={{
                                        ...styles.barFill,
                                        background: `linear-gradient(90deg, ${posColor}40, ${posColor}80)`,
                                    }}
                                />
                            </div>

                            {/* Stats */}
                            <div style={styles.posStats}>
                                <span style={{ color: accuracy >= 70 ? '#22c55e' : accuracy >= 40 ? '#fbbf24' : '#ef4444', fontWeight: 'bold' }}>
                                    {accuracy}%
                                </span>
                            </div>
                            <div style={styles.posEV}>
                                <span style={{ color: stat.totalEVLoss > 0 ? '#ef4444' : '#22c55e' }}>
                                    -{avgEV}
                                </span>
                            </div>
                            <div style={styles.posCount}>
                                {stat.total}h
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Classification micro-grid */}
            <div style={styles.microGrid}>
                <div style={styles.microHeader}>
                    <div style={styles.microLabel}>Position</div>
                    {Object.entries(CLASSIFICATION_CONFIG).map(([key, cfg]) => (
                        <div key={key} style={{ ...styles.microLabel, color: cfg.color }}>{cfg.icon}</div>
                    ))}
                </div>
                {sortedPositions.map(pos => {
                    const stat = positionStats[pos];
                    return (
                        <div key={pos} style={styles.microRow}>
                            <div style={{ ...styles.microLabel, color: POSITION_COLORS[pos] || '#94a3b8', fontWeight: 'bold' }}>
                                {pos}
                            </div>
                            {Object.keys(CLASSIFICATION_CONFIG).map(key => (
                                <div key={key} style={{
                                    ...styles.microCell,
                                    opacity: stat.classifications[key] > 0 ? 1 : 0.2,
                                }}>
                                    {stat.classifications[key] || 0}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Best and Worst positions */}
            <div style={styles.extremes}>
                {sortedPositions.length >= 2 && (() => {
                    const sorted = [...sortedPositions].sort((a, b) => {
                        const aAcc = positionStats[a].total > 0 ? positionStats[a].perfect / positionStats[a].total : 0;
                        const bAcc = positionStats[b].total > 0 ? positionStats[b].perfect / positionStats[b].total : 0;
                        return bAcc - aAcc;
                    });
                    const best = sorted[0];
                    const worst = sorted[sorted.length - 1];
                    const bestAcc = positionStats[best].total > 0 ? Math.round((positionStats[best].perfect / positionStats[best].total) * 100) : 0;
                    const worstAcc = positionStats[worst].total > 0 ? Math.round((positionStats[worst].perfect / positionStats[worst].total) * 100) : 0;
                    return (
                        <>
                            <div style={styles.extremeItem}>
                                <span style={styles.extremeLabel}>🏆 Strongest</span>
                                <span style={{ color: POSITION_COLORS[best] || '#22c55e', fontWeight: 'bold' }}>
                                    {best} ({bestAcc}%)
                                </span>
                            </div>
                            <div style={styles.extremeItem}>
                                <span style={styles.extremeLabel}>⚠️ Work On</span>
                                <span style={{ color: POSITION_COLORS[worst] || '#ef4444', fontWeight: 'bold' }}>
                                    {worst} ({worstAcc}%)
                                </span>
                            </div>
                        </>
                    );
                })()}
            </div>
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
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
    },
    barChart: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
    posRow: {
        display: 'flex', alignItems: 'center', gap: 8,
    },
    posLabel: {
        width: 30, fontSize: 12, fontWeight: 'bold', textAlign: 'right',
    },
    barContainer: {
        flex: 1, height: 8, background: 'rgba(255,255,255,0.05)',
        borderRadius: 4, overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 4 },
    posStats: { width: 36, fontSize: 12, textAlign: 'right' },
    posEV: { width: 42, fontSize: 10, textAlign: 'right', fontFamily: "'Orbitron', monospace", color: '#64748b' },
    posCount: { width: 22, fontSize: 10, color: '#475569', textAlign: 'right' },
    microGrid: {
        marginBottom: 12, borderRadius: 8,
        background: 'rgba(0,0,0,0.15)', padding: '6px 8px',
    },
    microHeader: {
        display: 'flex', gap: 4, marginBottom: 4,
        borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 4,
    },
    microRow: { display: 'flex', gap: 4, padding: '2px 0' },
    microLabel: {
        width: 30, fontSize: 10, color: '#64748b', fontWeight: 600, textAlign: 'center',
    },
    microCell: {
        flex: 1, fontSize: 10, color: '#94a3b8', fontWeight: 600, textAlign: 'center',
    },
    extremes: { display: 'flex', gap: 12, justifyContent: 'center' },
    extremeItem: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '6px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
    },
    extremeLabel: { fontSize: 9, color: '#64748b', fontWeight: 600 },
};
