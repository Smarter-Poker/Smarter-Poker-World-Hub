/**
 * MISTAKE PATTERN PANEL — Clustered Mistake Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 16: Shows the user's most common and costly mistake patterns,
 * clustered by spot type, position, and street.
 *
 * "You consistently over-fold facing c-bets on the flop from the BB"
 * "Your biggest EV leak is 3-bet defense spots from the CO"
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SPOT_TYPE_LABELS = {
    facing_cbet: 'Facing C-bet',
    open_raise: 'Open Raise',
    '3bet_defense': '3-Bet Defense',
    blind_defense: 'Blind Defense',
    bb_defense: 'BB Defense',
    sb_play: 'SB Play',
    btn_play: 'BTN Play',
    check_raise: 'Check-Raise',
    squeeze: 'Squeeze',
    donk_bet: 'Donk Bet',
    general: 'General',
};

const STREET_LABELS = {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
};

const SEVERITY_COLORS = {
    high:   { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#ef4444', label: 'HIGH' },
    medium: { bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  text: '#fbbf24', label: 'MEDIUM' },
    low:    { bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.15)',text: '#94a3b8', label: 'LOW' },
};

function getSeverityLevel(pattern) {
    if (pattern.count >= 5 && pattern.avgEvLoss >= 0.5) return 'high';
    if (pattern.count >= 3 || pattern.avgEvLoss >= 0.3) return 'medium';
    return 'low';
}

function generateInsight(pattern) {
    const spot = SPOT_TYPE_LABELS[pattern.spotType] || pattern.spotType;
    const street = STREET_LABELS[pattern.street] || pattern.street;
    const pos = pattern.position;

    // Figure out dominant error type
    const cls = pattern.classifications || {};
    const dominant = Object.entries(cls || {}).sort((a, b) => b[1] - a[1])[0];
    const errorType = dominant ? dominant[0] : 'mistake';

    const templates = {
        blunder: `Critical errors in ${spot} spots from ${pos} on the ${street}`,
        wrong: `Consistently wrong on ${spot} decisions from ${pos} (${street})`,
        inaccuracy: `Minor inaccuracies in ${spot} spots from ${pos} on ${street}`,
        mistake: `Recurring mistakes in ${spot} from ${pos} (${street})`,
    };

    return templates[errorType] || templates.mistake;
}

export default function MistakePatternPanel({ mistakePatterns }) {
    const [showAll, setShowAll] = useState(false);

    if (!mistakePatterns || mistakePatterns.length === 0) return null;

    const visiblePatterns = showAll ? mistakePatterns : mistakePatterns.slice(0, 5);
    const totalMistakes = mistakePatterns.reduce((s, p) => s + p.count, 0);
    const totalEvLoss = mistakePatterns.reduce((s, p) => s + p.totalEvLoss, 0);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.title}>Mistake Patterns</div>
                <div style={styles.headerStats}>
                    <span style={styles.headerStat}>{totalMistakes} mistakes</span>
                    <span style={{ ...styles.headerStat, color: '#ef4444' }}>-{totalEvLoss.toFixed(1)} EV</span>
                </div>
            </div>

            {/* Top insight callout */}
            {mistakePatterns.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.topInsight}
                >
                    <div style={styles.insightIcon}>▲</div>
                    <div style={styles.insightText}>
                        {generateInsight(mistakePatterns[0])}
                        <span style={styles.insightMeta}>
                            {' '}— {mistakePatterns[0].count} occurrences, -{mistakePatterns[0].avgEvLoss.toFixed(2)} avg EV
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Pattern list */}
            <div style={styles.patternList}>
                <AnimatePresence>
                    {visiblePatterns.map((pattern, i) => {
                        const severity = getSeverityLevel(pattern);
                        const severityConfig = SEVERITY_COLORS[severity];
                        const spot = SPOT_TYPE_LABELS[pattern.spotType] || pattern.spotType;
                        const street = STREET_LABELS[pattern.street] || pattern.street;

                        // Classification breakdown bar
                        const cls = pattern.classifications || {};
                        const clsTotal = Object.values(cls || {}).reduce((s, v) => s + v, 0) || 1;

                        return (
                            <motion.div
                                key={`${pattern.spotType}-${pattern.position}-${pattern.street}`}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ delay: i * 0.05 }}
                                style={{
                                    ...styles.patternRow,
                                    background: severityConfig.bg,
                                    borderColor: severityConfig.border,
                                }}
                            >
                                {/* Rank */}
                                <div style={{ ...styles.rank, color: severityConfig.text }}>
                                    #{i + 1}
                                </div>

                                {/* Pattern info */}
                                <div style={styles.patternInfo}>
                                    <div style={styles.patternName}>
                                        <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 11 }}>{spot}</span>
                                        <span style={styles.patternMeta}>{pattern.position} · {street}</span>
                                    </div>

                                    {/* Mini classification bar */}
                                    <div style={styles.miniClsBar}>
                                        {Object.entries(cls || {})
                                            .filter(([_, v]) => v > 0)
                                            .sort((a, b) => {
                                                const order = ['blunder', 'wrong', 'inaccuracy'];
                                                return order.indexOf(a[0]) - order.indexOf(b[0]);
                                            })
                                            .map(([key, count]) => (
                                                <div
                                                    key={key}
                                                    style={{
                                                        width: `${(count / clsTotal) * 100}%`,
                                                        height: '100%',
                                                        background: key === 'blunder' ? '#ef4444' : key === 'wrong' ? '#f97316' : '#fbbf24',
                                                    }}
                                                    title={`${key}: ${count}`}
                                                />
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* Stats */}
                                <div style={styles.patternStats}>
                                    <span style={{ fontSize: 13, fontWeight: 'bold', color: severityConfig.text }}>
                                        {pattern.count}×
                                    </span>
                                    <span style={styles.evLossValue}>
                                        -{pattern.avgEvLoss.toFixed(2)}
                                    </span>
                                </div>

                                {/* Severity badge */}
                                <div style={{
                                    ...styles.severityBadge,
                                    background: severityConfig.bg,
                                    color: severityConfig.text,
                                    borderColor: severityConfig.border,
                                }}>
                                    {severityConfig.label}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Show more button */}
            {mistakePatterns.length > 5 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    style={styles.showMoreBtn}
                >
                    {showAll ? 'Show Less' : `Show All ${mistakePatterns.length} Patterns`}
                </button>
            )}

            {/* Spot type summary */}
            {mistakePatterns.length >= 3 && (
                <div style={styles.spotSummary}>
                    {(() => {
                        const spotCounts = {};
                        mistakePatterns.forEach(p => {
                            const s = p.spotType || 'general';
                            if (!spotCounts[s]) spotCounts[s] = { count: 0, evLoss: 0 };
                            spotCounts[s].count += p.count;
                            spotCounts[s].evLoss += p.totalEvLoss;
                        });
                        return Object.entries(spotCounts || {})
                            .sort((a, b) => b[1].evLoss - a[1].evLoss)
                            .slice(0, 4)
                            .map(([spot, data]) => (
                                <div key={spot} style={styles.spotTag}>
                                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>
                                        {SPOT_TYPE_LABELS[spot] || spot}
                                    </span>
                                    <span style={{ color: '#ef4444', fontSize: 9 }}>
                                        {data.count}× / -{data.evLoss.toFixed(1)} EV
                                    </span>
                                </div>
                            ));
                    })()}
                </div>
            )}
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
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    title: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
    },
    headerStats: { display: 'flex', gap: 10 },
    headerStat: { fontSize: 10, color: '#64748b', fontWeight: 600 },
    topInsight: {
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '10px 12px', marginBottom: 10,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.15)',
        borderRadius: 10,
    },
    insightIcon: { fontSize: 16, lineHeight: 1 },
    insightText: { fontSize: 11, color: '#e2e8f0', lineHeight: 1.4 },
    insightMeta: { color: '#64748b', fontSize: 10 },
    patternList: { display: 'flex', flexDirection: 'column', gap: 4 },
    patternRow: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        border: '1px solid',
    },
    rank: { width: 22, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
    patternInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 },
    patternName: { display: 'flex', alignItems: 'center', gap: 8 },
    patternMeta: { fontSize: 9, color: '#64748b' },
    miniClsBar: {
        height: 4, borderRadius: 2, overflow: 'hidden',
        display: 'flex', background: 'rgba(255,255,255,0.05)',
    },
    patternStats: {
        width: 44, textAlign: 'right',
        display: 'flex', flexDirection: 'column', gap: 1,
    },
    evLossValue: {
        fontSize: 9, color: '#ef4444', fontFamily: "'Orbitron', monospace",
    },
    severityBadge: {
        fontSize: 8, fontWeight: 700,
        padding: '2px 6px', borderRadius: 4,
        border: '1px solid', letterSpacing: 0.5,
    },
    showMoreBtn: {
        width: '100%', marginTop: 8,
        padding: '6px', borderRadius: 6,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: '#64748b', fontSize: 10, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
    },
    spotSummary: {
        marginTop: 10,
        display: 'flex', gap: 6, flexWrap: 'wrap',
    },
    spotTag: {
        display: 'flex', flexDirection: 'column', gap: 1,
        padding: '5px 10px', borderRadius: 6,
        background: 'rgba(0,0,0,0.15)',
        border: '1px solid rgba(255,255,255,0.04)',
        fontSize: 10,
    },
};
