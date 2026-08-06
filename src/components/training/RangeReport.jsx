/**
 * RangeReport — Aggregated Range Analysis Panel
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Donut chart showing Made Hands / Draws / Air distribution.
 * Per-category action breakdown. Board texture analysis.
 * Total combos and weighted average EV.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const CATEGORY_COLORS = {
    made: { color: '#22c55e', label: 'Made Hands', gradient: 'linear-gradient(135deg, #16a34a, #22c55e)' },
    draw: { color: '#f59e0b', label: 'Draws', gradient: 'linear-gradient(135deg, #d97706, #f59e0b)' },
    air: { color: '#64748b', label: 'Air', gradient: 'linear-gradient(135deg, #475569, #64748b)' },
};

/**
 * Analyze board texture from board cards.
 */
function analyzeBoardTexture(board) {
    if (!board || board.length < 3) return { texture: 'Unknown', tags: [] };

    const ranks = board.map(c => {
        const r = c[0].toUpperCase();
        const vals = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
        return vals[r] || parseInt(r);
    }).sort((a, b) => b - a);

    const suits = board.map(c => c[1].toLowerCase());
    const tags = [];

    // Flush texture
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts || {}));
    if (maxSuit >= 3) tags.push('Monotone');
    else if (maxSuit >= 2) tags.push('Two-Tone');
    else tags.push('Rainbow');

    // Paired
    const rankCounts = {};
    ranks.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    if (Object.values(rankCounts || {}).some(c => c >= 2)) tags.push('Paired');

    // Connectivity (checking gaps)
    const unique = [...new Set(ranks)].sort((a, b) => b - a);
    let totalGaps = 0;
    for (let i = 0; i < unique.length - 1; i++) {
        totalGaps += unique[i] - unique[i + 1] - 1;
    }
    if (totalGaps <= 1) tags.push('Connected');
    else if (totalGaps <= 3) tags.push('Semi-Connect');
    else tags.push('Dry');

    // High card texture
    if (ranks[0] >= 13) tags.push('Broadway');
    else if (ranks[0] <= 8) tags.push('Low');

    const texture = tags.slice(0, 2).join(' ');
    return { texture, tags };
}

/**
 * SVG Donut chart for category distribution
 */
function DonutChart({ segments, size = 100 }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) return null;

    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <svg width={size} height={size} viewBox="0 0 100 100">
            {segments.filter(s => s.value > 0).map((seg, i) => {
                const pct = seg.value / total;
                const dashLen = pct * circumference;
                const dashOffset = -offset * circumference;
                offset += pct;
                return (
                    <circle
                        key={i}
                        cx="50" cy="50" r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="12"
                        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                    />
                );
            })}
            <text x="50" y="48" textAnchor="middle" fill="#e2e8f0" fontSize="14" fontWeight="800" style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                {total}
            </text>
            <text x="50" y="62" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">
                combos
            </text>
        </svg>
    );
}

/**
 * @param {Object} props
 * @param {Array} props.classificationGroups - From groupByClassification()
 * @param {Object} props.gridData - Raw grid data for combo counting
 * @param {string[]} props.board - Board cards
 * @param {Object} props.handEVs - Hand EV data
 */
export default function RangeReport({ classificationGroups = [], gridData = {}, board = [], handEVs = {} }) {
    // Category totals
    const categoryData = useMemo(() => {
        const cats = { made: 0, draw: 0, air: 0 };
        classificationGroups.forEach(g => {
            const cat = g.category || 'air';
            cats[cat] = (cats[cat] || 0) + g.handCount;
        });
        return cats;
    }, [classificationGroups]);

    // Total combos in range
    const totalCombos = useMemo(() => {
        return Object.values(gridData || {}).filter(v => v !== null && v !== undefined).length;
    }, [gridData]);

    // Weighted average EV
    const avgEV = useMemo(() => {
        const entries = Object.entries(handEVs || {});
        if (entries.length === 0) return null;
        let sum = 0, count = 0;
        entries.forEach(([hand, ev]) => {
            if (ev !== null && ev !== undefined && gridData[hand]) {
                sum += (typeof ev === 'number' ? ev : 0);
                count++;
            }
        });
        return count > 0 ? sum / count : null;
    }, [handEVs, gridData]);

    // Board texture
    const { texture, tags } = useMemo(() => analyzeBoardTexture(board), [board]);

    // Build category action breakdown
    const categoryBreakdown = useMemo(() => {
        const result = {};
        classificationGroups.forEach(g => {
            const cat = g.category || 'air';
            if (!result[cat]) result[cat] = { hands: 0, actions: {} };
            result[cat].hands += g.handCount;
            Object.entries(g.actionSummary || {}).forEach(([action, pct]) => {
                result[cat].actions[action] = (result[cat].actions[action] || 0) + pct * g.handCount;
            });
        });
        // Normalize
        Object.values(result || {}).forEach(cat => {
            if (cat.hands > 0) {
                Object.keys(cat.actions || {}).forEach(a => {
                    cat.actions[a] = Math.round((cat.actions[a] / cat.hands) * 10) / 10;
                });
            }
        });
        return result;
    }, [classificationGroups]);

    const donutSegments = [
        { value: categoryData.made, color: CATEGORY_COLORS.made.color },
        { value: categoryData.draw, color: CATEGORY_COLORS.draw.color },
        { value: categoryData.air, color: CATEGORY_COLORS.air.color },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 16,
            }}
        >
            {/* Header */}
            <div style={{
                fontSize: 12, fontWeight: 800, color: '#e2e8f0',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                marginBottom: 14, letterSpacing: 1,
                textTransform: 'uppercase',
            }}>
                Range Report
            </div>

            {/* Donut + Stats Row */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                <DonutChart segments={donutSegments} size={90} />
                <div style={{ flex: 1 }}>
                    {Object.entries(CATEGORY_COLORS || {}).map(([cat, info]) => (
                        <div key={cat} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 4,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: 2,
                                    background: info.gradient,
                                }} />
                                <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 600 }}>
                                    {info.label}
                                </span>
                            </div>
                            <span style={{
                                fontSize: 12, fontWeight: 800, color: info.color,
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}>
                                {categoryData[cat] || 0}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Board Texture */}
            <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap',
                marginBottom: 12, padding: '6px 8px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Board:
                </span>
                {tags.map(tag => (
                    <span key={tag} style={{
                        fontSize: 9, fontWeight: 700, color: '#00d4ff',
                        background: 'rgba(0,212,255,0.1)',
                        padding: '1px 6px', borderRadius: 10,
                    }}>
                        {tag}
                    </span>
                ))}
            </div>

            {/* Weighted EV */}
            {avgEV !== null && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 8px', marginBottom: 10,
                    background: 'rgba(255,255,255,0.02)', borderRadius: 6,
                }}>
                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>AVG RANGE EV</span>
                    <span style={{
                        fontSize: 13, fontWeight: 800, fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        color: avgEV >= 0 ? '#4ade80' : '#f87171',
                    }}>
                        {avgEV >= 0 ? '+' : ''}{avgEV.toFixed(2)} BB
                    </span>
                </div>
            )}

            {/* Category Action Breakdown */}
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
                Action by Category
            </div>
            {Object.entries(CATEGORY_COLORS || {}).map(([cat, info]) => {
                const bd = categoryBreakdown[cat];
                if (!bd || bd.hands === 0) return null;
                const topActions = Object.entries(bd.actions || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);
                return (
                    <div key={cat} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 4, padding: '3px 0',
                    }}>
                        <span style={{ width: 60, fontSize: 9, color: info.color, fontWeight: 700 }}>
                            {info.label}
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                            {topActions.map(([action, pct]) => (
                                <span key={action} style={{
                                    fontSize: 8, color: '#94a3b8', fontWeight: 600,
                                }}>
                                    {action.toUpperCase()}: {pct.toFixed(0)}%
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </motion.div>
    );
}
