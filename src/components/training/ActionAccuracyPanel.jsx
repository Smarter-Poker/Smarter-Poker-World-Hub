/**
 * ACTION ACCURACY PANEL — Performance by Action Type (Fold/Call/Raise/Bet/Check)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 16: Radial gauge display of accuracy per action type,
 * highlighting which actions you over/under-use vs GTO.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ACTION_CONFIG = {
    FOLD:    { label: 'Fold',    color: '#94a3b8', icon: '×',  desc: 'Folding accuracy' },
    CALL:    { label: 'Call',    color: '#22c55e', icon: '=',  desc: 'Calling accuracy' },
    RAISE:   { label: 'Raise',   color: '#f97316', icon: '↑',  desc: 'Raising accuracy' },
    BET:     { label: 'Bet',     color: '#3b82f6', icon: '►',  desc: 'Betting accuracy' },
    CHECK:   { label: 'Check',   color: '#8b5cf6', icon: '✓',  desc: 'Checking accuracy' },
    'ALL-IN':{ label: 'All-In',  color: '#ef4444', icon: '★',  desc: 'All-in accuracy' },
};

// Radial gauge component
function RadialGauge({ accuracy, color, size = 48, strokeWidth = 4 }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (accuracy / 100) * circumference;

    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            {/* Background circle */}
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={strokeWidth}
            />
            {/* Progress arc */}
            <motion.circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.8 }}
            />
        </svg>
    );
}

export default function ActionAccuracyPanel({ actionAccuracy }) {
    const [hoveredAction, setHoveredAction] = useState(null);

    if (!actionAccuracy || Object.keys(actionAccuracy || {}).length === 0) return null;

    // Build sorted actions (exclude unknown with < 3 hands)
    const actions = Object.entries(actionAccuracy || {})
        .map(([key, data]) => ({
            key: key.toUpperCase(),
            ...data,
            config: ACTION_CONFIG[key.toUpperCase()] || { label: key, color: '#64748b', icon: '?', desc: '' },
        }))
        .filter(a => a.total >= 3 && a.key !== 'UNKNOWN')
        .sort((a, b) => b.total - a.total);

    if (actions.length === 0) return null;

    const totalHands = actions.reduce((s, a) => s + a.total, 0);

    return (
        <div style={styles.container}>
            <div style={styles.title}>Action Accuracy</div>

            {/* Gauge grid */}
            <div style={styles.gaugeGrid}>
                {actions.map((action, i) => {
                    const isHovered = hoveredAction === action.key;
                    const usagePct = totalHands > 0 ? Math.round((action.total / totalHands) * 100) : 0;

                    return (
                        <motion.div
                            key={action.key}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.08 }}
                            style={{
                                ...styles.gaugeItem,
                                ...(isHovered ? styles.gaugeItemHover : {}),
                            }}
                            onMouseEnter={() => setHoveredAction(action.key)}
                            onMouseLeave={() => setHoveredAction(null)}
                        >
                            {/* Gauge */}
                            <div style={{ position: 'relative' }}>
                                <RadialGauge
                                    accuracy={action.accuracy}
                                    color={action.config.color}
                                    size={52}
                                    strokeWidth={4}
                                />
                                <div style={styles.gaugeCenter}>
                                    <span style={{
                                        fontSize: 13, fontWeight: 'bold',
                                        color: action.accuracy >= 75 ? '#22c55e' : action.accuracy >= 50 ? '#fbbf24' : '#ef4444',
                                    }}>
                                        {action.accuracy}
                                    </span>
                                </div>
                            </div>

                            {/* Label */}
                            <div style={styles.gaugeLabel}>
                                <span style={{ color: action.config.color, fontWeight: 'bold', fontSize: 11 }}>
                                    {action.config.icon} {action.config.label}
                                </span>
                                <span style={styles.gaugeMeta}>
                                    {action.total}h · {usagePct}%
                                </span>
                            </div>

                            {/* EV indicator */}
                            {action.avgEvLoss > 0 && (
                                <div style={{
                                    ...styles.evBadge,
                                    background: action.avgEvLoss > 0.5 ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.1)',
                                    color: action.avgEvLoss > 0.5 ? '#ef4444' : '#fbbf24',
                                    borderColor: action.avgEvLoss > 0.5 ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.2)',
                                }}>
                                    -{action.avgEvLoss.toFixed(2)} EV
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* Usage distribution bar */}
            <div style={styles.usageSection}>
                <div style={styles.usageLabel}>Action Distribution</div>
                <div style={styles.usageBar}>
                    {actions.map(action => {
                        const pct = totalHands > 0 ? (action.total / totalHands) * 100 : 0;
                        if (pct < 2) return null;
                        return (
                            <div
                                key={action.key}
                                style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: action.config.color,
                                    opacity: hoveredAction === null || hoveredAction === action.key ? 0.8 : 0.25,
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={() => setHoveredAction(action.key)}
                                onMouseLeave={() => setHoveredAction(null)}
                                title={`${action.config.label}: ${Math.round(pct)}%`}
                            />
                        );
                    })}
                </div>
                <div style={styles.usageLegend}>
                    {actions.map(a => (
                        <span key={a.key} style={{ fontSize: 8, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: 5, height: 5, borderRadius: 1, background: a.config.color }} />
                            {a.config.label} {Math.round((a.total / totalHands) * 100)}%
                        </span>
                    ))}
                </div>
            </div>

            {/* Weakest action insight */}
            {actions.length >= 2 && (() => {
                const weakest = [...actions].sort((a, b) => a.accuracy - b.accuracy)[0];
                return (
                    <div style={styles.insight}>
                        Weakest action: <span style={{ color: weakest.config.color, fontWeight: 'bold' }}>{weakest.config.label}</span> at {weakest.accuracy}% — focus on {weakest.config.label.toLowerCase()} decisions
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
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
    },
    gaugeGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginBottom: 12,
    },
    gaugeItem: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 6px', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.03)',
        transition: 'all 0.15s', cursor: 'default',
        gap: 4,
    },
    gaugeItemHover: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
    },
    gaugeCenter: {
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    gaugeLabel: {
        textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1,
    },
    gaugeMeta: { fontSize: 9, color: '#475569' },
    evBadge: {
        fontSize: 8, fontWeight: 600,
        padding: '2px 6px', borderRadius: 4,
        border: '1px solid',
        fontFamily: "'Orbitron', monospace",
    },
    usageSection: { marginBottom: 8 },
    usageLabel: {
        fontSize: 9, color: '#475569', fontWeight: 600, marginBottom: 4,
        textTransform: 'uppercase', letterSpacing: 0.5,
    },
    usageBar: {
        height: 8, borderRadius: 4, overflow: 'hidden',
        display: 'flex', background: 'rgba(255,255,255,0.03)',
    },
    usageLegend: {
        display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap',
    },
    insight: {
        marginTop: 8, padding: '6px 10px',
        background: 'rgba(0,0,0,0.15)', borderRadius: 8,
        fontSize: 10, color: '#64748b', textAlign: 'center',
    },
};
