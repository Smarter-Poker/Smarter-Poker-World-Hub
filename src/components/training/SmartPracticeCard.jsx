/**
 * 🎯 SMART PRACTICE CARD — Training Lobby Widget
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows the user's #1 weakness area and provides a one-click
 * "Train Now" button to launch a targeted session.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { analyzeWeakSpots, getSmartPracticeConfig } from '../../engines/SmartPracticeEngine';

export default function SmartPracticeCard({ handHistory, onStartPractice }) {
    const profile = useMemo(() => analyzeWeakSpots(handHistory), [handHistory]);
    const config = useMemo(() => getSmartPracticeConfig(profile), [profile]);

    if (!profile.hasData || !profile.topWeakness) return null;

    const w = profile.topWeakness;
    const color = w.accuracy < 40 ? '#ef4444' : w.accuracy < 60 ? '#fbbf24' : '#22c55e';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={styles.card}
        >
            <div style={styles.header}>
                <span style={styles.icon}>🎯</span>
                <span style={styles.title}>Smart Practice</span>
            </div>

            <div style={styles.body}>
                <div style={styles.weaknessLabel}>Your weakest area:</div>
                <div style={styles.weaknessName}>{w.label}</div>

                <div style={styles.statsRow}>
                    <div style={styles.stat}>
                        <span style={{ ...styles.statValue, color }}>{w.accuracy}%</span>
                        <span style={styles.statLabel}>Accuracy</span>
                    </div>
                    <div style={styles.stat}>
                        <span style={{ ...styles.statValue, color: '#ef4444' }}>
                            -{w.evLoss.toFixed(1)}
                        </span>
                        <span style={styles.statLabel}>EV Loss</span>
                    </div>
                    <div style={styles.stat}>
                        <span style={styles.statValue}>{w.total}</span>
                        <span style={styles.statLabel}>Hands</span>
                    </div>
                </div>
            </div>

            <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onStartPractice?.(config)}
                style={styles.button}
            >
                Train Now →
            </motion.button>
        </motion.div>
    );
}

const styles = {
    card: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08), rgba(139, 92, 246, 0.06))',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    icon: {
        fontSize: 20,
    },
    title: {
        fontSize: 14,
        fontWeight: 700,
        color: '#00d4ff',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    body: {
        marginBottom: 16,
    },
    weaknessLabel: {
        fontSize: 11,
        color: '#64748b',
        marginBottom: 4,
    },
    weaknessName: {
        fontSize: 18,
        fontWeight: 700,
        color: '#f1f5f9',
        marginBottom: 12,
    },
    statsRow: {
        display: 'flex',
        gap: 16,
    },
    stat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: 800,
        color: '#e2e8f0',
        fontFamily: "'Orbitron', monospace",
    },
    statLabel: {
        fontSize: 9,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    button: {
        width: '100%',
        padding: '12px 0',
        borderRadius: 10,
        border: '1px solid rgba(0, 212, 255, 0.4)',
        background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.15), rgba(0, 212, 255, 0.05))',
        color: '#00d4ff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
};
