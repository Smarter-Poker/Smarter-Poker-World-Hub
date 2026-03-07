/**
 * PreflopChartStats — Range Statistics Sidebar
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows combo counts, RFI%, hand category breakdowns, and mixed-frequency
 * highlights for the currently displayed preflop range.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function PreflopChartStats({ stats, position, scenario, actions = [] }) {
    if (!stats) return null;

    const {
        totalCombos = 0,
        maxCombos = 1326,
        rfiPct = 0,
        pairCombos = 0,
        suitedCombos = 0,
        offsuitCombos = 0,
        pureHands = 0,
        mixedHands = 0,
    } = stats;

    const scenarioLabels = {
        rfi: 'RAISE FIRST IN',
        vs3bet: 'VS 3-BET',
        bb_defense: 'BB DEFENSE',
        push_fold: 'PUSH / FOLD',
    };

    const barData = [
        { label: 'Pairs', value: pairCombos, max: totalCombos || 1, color: '#a855f7' },
        { label: 'Suited', value: suitedCombos, max: totalCombos || 1, color: '#3b82f6' },
        { label: 'Offsuit', value: offsuitCombos, max: totalCombos || 1, color: '#64748b' },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
                width: 220,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 16,
                flexShrink: 0,
            }}
        >
            {/* Header */}
            <div style={{
                fontSize: 10, fontWeight: 800, color: '#00d4ff',
                letterSpacing: 1.5, textTransform: 'uppercase',
                marginBottom: 12, fontFamily: "'Orbitron', monospace",
            }}>
                {position} {scenarioLabels[scenario] || 'RANGE'}
            </div>

            {/* Total Combos */}
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <div style={{
                    fontSize: 36, fontWeight: 900, color: '#e2e8f0',
                    fontFamily: "'Orbitron', monospace", lineHeight: 1,
                }}>
                    {rfiPct}%
                </div>
                <div style={{
                    fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600,
                }}>
                    {totalCombos} / {maxCombos} combos
                </div>
                {/* Progress bar */}
                <div style={{
                    width: '100%', height: 6, background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3, marginTop: 8, overflow: 'hidden',
                }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${rfiPct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{
                            height: '100%', borderRadius: 3,
                            background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                        }}
                    />
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

            {/* Category Breakdown */}
            <div style={{
                fontSize: 9, fontWeight: 700, color: '#64748b',
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
            }}>
                HAND CATEGORIES
            </div>
            {barData.map(item => (
                <div key={item.label} style={{ marginBottom: 8 }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2,
                    }}>
                        <span>{item.label}</span>
                        <span style={{ color: item.color, fontFamily: "'Orbitron', monospace" }}>
                            {item.value}
                        </span>
                    </div>
                    <div style={{
                        width: '100%', height: 4, background: 'rgba(255,255,255,0.06)',
                        borderRadius: 2, overflow: 'hidden',
                    }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.value / item.max * 100) || 0}%` }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            style={{
                                height: '100%', borderRadius: 2,
                                background: item.color,
                            }}
                        />
                    </div>
                </div>
            ))}

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

            {/* Pure vs Mixed */}
            <div style={{
                fontSize: 9, fontWeight: 700, color: '#64748b',
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
            }}>
                FREQUENCY TYPE
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                    flex: 1, textAlign: 'center', padding: '8px 6px',
                    background: 'rgba(0,212,255,0.08)', borderRadius: 8,
                    border: '1px solid rgba(0,212,255,0.15)',
                }}>
                    <div style={{
                        fontSize: 18, fontWeight: 800, color: '#00d4ff',
                        fontFamily: "'Orbitron', monospace",
                    }}>
                        {pureHands}
                    </div>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                        PURE
                    </div>
                </div>
                <div style={{
                    flex: 1, textAlign: 'center', padding: '8px 6px',
                    background: 'rgba(251,191,36,0.08)', borderRadius: 8,
                    border: '1px solid rgba(251,191,36,0.15)',
                }}>
                    <div style={{
                        fontSize: 18, fontWeight: 800, color: '#fbbf24',
                        fontFamily: "'Orbitron', monospace",
                    }}>
                        {mixedHands}
                    </div>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                        MIXED
                    </div>
                </div>
            </div>

            {/* Action Legend */}
            {actions.length > 0 && (
                <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
                    <div style={{
                        fontSize: 9, fontWeight: 700, color: '#64748b',
                        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
                    }}>
                        ACTIONS
                    </div>
                    {actions.map((action, i) => {
                        const colors = ['#22c55e', '#ef4444', '#3b82f6', '#fbbf24', '#a855f7'];
                        const color = colors[i % colors.length];
                        return (
                            <div key={action} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 10, color: '#94a3b8', marginBottom: 4,
                            }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: 2,
                                    background: color, flexShrink: 0,
                                }} />
                                <span style={{ fontWeight: 600 }}>{action}</span>
                            </div>
                        );
                    })}
                </>
            )}
        </motion.div>
    );
}
