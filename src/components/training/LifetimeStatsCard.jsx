/**
 * LIFETIME STATS CARD — Aggregated Training Metrics
 * Shows cumulative stats across all training sessions:
 * - Total hands played, sessions completed
 * - Average GTOW score, best score
 * - Total EV loss, avg EV per hand
 * - Longest streak, current session streak
 */

import React from 'react';
import { motion } from 'framer-motion';

function StatBox({ label, value, subValue, color = '#e2e8f0', icon, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            style={styles.statBox}
        >
            <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
            <div style={{ ...styles.statValue, color }}>{value}</div>
            <div style={styles.statLabel}>{label}</div>
            {subValue && <div style={styles.statSub}>{subValue}</div>}
        </motion.div>
    );
}

export default function LifetimeStatsCard({
    totalHands = 0,
    totalSessions = 0,
    avgGTOWScore = 0,
    bestGTOWScore = 0,
    totalEVLoss = 0,
    avgEVPerHand = 0,
    longestStreak = 0,
    totalMistakes = 0,
    gamesCompleted = 0,
    handHistory = [],
}) {
    const scoreColor = avgGTOWScore >= 80 ? '#22c55e' : avgGTOWScore >= 60 ? '#fbbf24' : '#ef4444';
    const bestColor = bestGTOWScore >= 80 ? '#22c55e' : bestGTOWScore >= 60 ? '#fbbf24' : '#ef4444';

    // Calculate Pot-type breakdown
    const potStats = {
        srp: { count: 0, score: 0 },
        '3bp': { count: 0, score: 0 },
        '4bp': { count: 0, score: 0 },
    };

    if (handHistory && handHistory.length > 0) {
        handHistory.forEach(h => {
            const st = h.spotType || '';
            let type = 'srp';
            if (st.includes('3bet')) type = '3bp';
            else if (st.includes('4bet')) type = '4bp';

            potStats[type].count += 1;
            potStats[type].score += h.classification === 'best' ? 100 : h.classification === 'correct' ? 75 : 0;
        });
    }

    const srpAvg = potStats.srp.count ? Math.round(potStats.srp.score / potStats.srp.count) : 0;
    const tbpAvg = potStats['3bp'].count ? Math.round(potStats['3bp'].score / potStats['3bp'].count) : 0;
    const fbpAvg = potStats['4bp'].count ? Math.round(potStats['4bp'].score / potStats['4bp'].count) : 0;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.title}>Lifetime Stats</div>
                <div style={styles.sessionCount}>{totalSessions} sessions</div>
            </div>

            {/* Hero score */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={styles.heroScore}
            >
                <div style={{ ...styles.heroValue, color: scoreColor }}>{avgGTOWScore}%</div>
                <div style={styles.heroLabel}>Avg GTOW Score</div>
                <div style={styles.heroBest}>Best: <span style={{ color: bestColor }}>{bestGTOWScore}%</span></div>
            </motion.div>

            {/* Stats grid */}
            <div style={styles.grid}>
                <StatBox icon="◇" label="Hands" value={totalHands.toLocaleString()} delay={0.1} />
                <StatBox icon="◎" label="Games" value={gamesCompleted} delay={0.15} />
                <StatBox icon="" label="EV Loss" value={`-${totalEVLoss.toFixed(1)}`} color="#ef4444" delay={0.2} />
                <StatBox
                    icon="▣"
                    label="EV/Hand"
                    value={avgEVPerHand.toFixed(2)}
                    color={avgEVPerHand < 0.5 ? '#22c55e' : '#fbbf24'}
                    delay={0.25}
                />
                <StatBox icon="" label="Best Streak" value={longestStreak} color="#f97316" delay={0.3} />
                <StatBox icon="▲" label="Mistakes" value={totalMistakes} color="#fbbf24" delay={0.35} />
            </div>

            {/* Pot-Type Breakdown */}
            {handHistory && handHistory.length > 0 && (
                <div style={{ marginBottom: 12, marginTop: 12 }}>
                    <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>Pot-Type Accuracy</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: 9 }}>SRP ({potStats.srp.count})</div>
                            <div style={{ color: srpAvg >= 80 ? '#22c55e' : srpAvg >= 60 ? '#fbbf24' : '#ef4444', fontSize: 12, fontWeight: 700 }}>{srpAvg}%</div>
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: 9 }}>3BP ({potStats['3bp'].count})</div>
                            <div style={{ color: tbpAvg >= 80 ? '#22c55e' : tbpAvg >= 60 ? '#fbbf24' : '#ef4444', fontSize: 12, fontWeight: 700 }}>{tbpAvg}%</div>
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: 9 }}>4BP+ ({potStats['4bp'].count})</div>
                            <div style={{ color: fbpAvg >= 80 ? '#22c55e' : fbpAvg >= 60 ? '#fbbf24' : '#ef4444', fontSize: 12, fontWeight: 700 }}>{fbpAvg}%</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress narrative */}
            <div style={styles.narrative}>
                {totalHands === 0 && "Start training to build your stats!"}
                {totalHands > 0 && totalHands < 100 && `Getting started — ${100 - totalHands} more hands to unlock insights`}
                {totalHands >= 100 && totalHands < 500 && `Solid progress — keep pushing for ${500 - totalHands} more`}
                {totalHands >= 500 && totalHands < 1000 && "Advanced player — closing in on 1,000 hands"}
                {totalHands >= 1000 && `Elite: ${totalHands.toLocaleString()} hands analyzed`}
            </div>
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 16,
        padding: 16,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 100%)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
    },
    sessionCount: {
        fontSize: 11, color: '#64748b', fontWeight: 600,
    },
    heroScore: {
        textAlign: 'center', marginBottom: 14, padding: '10px 0',
        background: 'rgba(0,0,0,0.2)', borderRadius: 10,
    },
    heroValue: {
        fontSize: 36, fontWeight: 800, fontFamily: "'Orbitron', monospace",
        lineHeight: 1,
    },
    heroLabel: { fontSize: 11, color: '#64748b', marginTop: 4 },
    heroBest: { fontSize: 10, color: '#475569', marginTop: 2 },
    grid: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8, marginBottom: 12,
    },
    statBox: {
        padding: '10px 8px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        textAlign: 'center',
    },
    statValue: {
        fontSize: 16, fontWeight: 'bold', fontFamily: "'Orbitron', monospace",
    },
    statLabel: { fontSize: 9, color: '#64748b', fontWeight: 600, marginTop: 2 },
    statSub: { fontSize: 8, color: '#475569', marginTop: 1 },
    narrative: {
        fontSize: 11, color: '#64748b', textAlign: 'center',
        fontStyle: 'italic', padding: '4px 0',
    },
};
