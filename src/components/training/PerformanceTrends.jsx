/**
 * PERFORMANCE TRENDS — Cross-Session SVG Line Charts
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 16: Fetches analytics API data and renders:
 *   - GTOW Score trend (line chart with gradient fill)
 *   - EV Loss per hand trend
 *   - Milestones summary with rolling average comparison
 *   - Classification distribution trend (stacked area)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getSessionToken } from '../../lib/authUtils';

// ●●● Phase GTO-CLONE: LeakDetector + HandAnalyzer engines ●●●
import { detectLeaks, analyzeFrequencies, generateDrillRecommendations } from '../../engines/LeakDetector';

// ●● SVG Line Chart ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function LineChart({
    data = [],
    valueKey = 'value',
    color = '#3b82f6',
    height = 80,
    width = '100%',
    showDots = true,
    showFill = true,
    showLabels = true,
    formatValue = v => v,
    emptyMessage = 'No data yet',
}) {
    const [hovered, setHovered] = useState(null);
    const svgWidth = 280;

    if (!data || data.length < 2) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 11, fontStyle: 'italic' }}>
                {emptyMessage}
            </div>
        );
    }

    const values = data.map(d => typeof d === 'number' ? d : d[valueKey] || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const padding = { top: 8, bottom: 20, left: 4, right: 4 };
    const chartWidth = svgWidth - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = values.map((v, i) => ({
        x: padding.left + (i / (values.length - 1)) * chartWidth,
        y: padding.top + chartHeight - ((v - min) / range) * chartHeight,
        value: v,
        index: i,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const fillPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

    return (
        <svg
            viewBox={`0 0 ${svgWidth} ${height}`}
            style={{ width, height, display: 'block' }}
            onMouseLeave={() => setHovered(null)}
        >
            <defs>
                <linearGradient id={`fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map(pct => {
                const y = padding.top + chartHeight * (1 - pct);
                return (
                    <line key={pct} x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y}
                        stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                );
            })}

            {/* Fill area */}
            {showFill && (
                <path d={fillPath} fill={`url(#fill-${color.replace('#', '')})`} />
            )}

            {/* Line */}
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots */}
            {showDots && points.map((p, i) => (
                <circle
                    key={i}
                    cx={p.x} cy={p.y} r={hovered === i ? 4 : 2.5}
                    fill={color}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="1"
                    style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                    onMouseEnter={() => setHovered(i)}
                />
            ))}

            {/* Hover tooltip */}
            {hovered !== null && points[hovered] && (
                <>
                    <line
                        x1={points[hovered].x} y1={padding.top}
                        x2={points[hovered].x} y2={padding.top + chartHeight}
                        stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" strokeDasharray="3,3"
                    />
                    <rect
                        x={Math.min(points[hovered].x - 28, svgWidth - 60)}
                        y={points[hovered].y - 22}
                        width="56" height="18" rx="4"
                        fill="rgba(0,0,0,0.85)"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="0.5"
                    />
                    <text
                        x={Math.min(points[hovered].x, svgWidth - 32)}
                        y={points[hovered].y - 10}
                        textAnchor="middle"
                        fill="#fff" fontSize="9" fontWeight="bold"
                    >
                        {formatValue(points[hovered].value)}
                    </text>
                </>
            )}

            {/* X-axis labels (first, mid, last) */}
            {showLabels && data.length >= 3 && [0, Math.floor(data.length / 2), data.length - 1].map(i => {
                const d = data[i];
                const dateStr = d?.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                return (
                    <text key={i} x={points[i].x} y={height - 2} textAnchor="middle" fill="#475569" fontSize="8">
                        {dateStr}
                    </text>
                );
            })}
        </svg>
    );
}

// ●● Stacked Area Chart for Classification Trend ●●●●●●●●●●●●●●●●●
function ClassificationTrendChart({ data = [], height = 70 }) {
    const svgWidth = 280;

    if (!data || data.length < 2) return null;

    const categories = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];
    const colors = {
        best: '#3b82f6',
        correct: '#22c55e',
        inaccuracy: '#fbbf24',
        wrong: '#f97316',
        blunder: '#ef4444',
    };

    const padding = { top: 4, bottom: 4, left: 4, right: 4 };
    const chartWidth = svgWidth - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Normalize each data point to percentages
    const normalized = data.map(d => {
        const total = categories.reduce((s, c) => s + (d[c] || 0), 0) || 1;
        const pcts = {};
        categories.forEach(c => { pcts[c] = (d[c] || 0) / total; });
        return pcts;
    });

    // Build stacked paths
    const paths = [];
    categories.forEach((cat, ci) => {
        const points = normalized.map((d, i) => {
            const x = padding.left + (i / (normalized.length - 1)) * chartWidth;
            const lowerY = categories.slice(0, ci).reduce((s, c) => s + d[c], 0);
            const upperY = lowerY + d[cat];
            return {
                x,
                y1: padding.top + chartHeight - lowerY * chartHeight,
                y2: padding.top + chartHeight - upperY * chartHeight,
            };
        });

        const topPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y2}`).join(' ');
        const bottomPath = [...points].reverse().map((p, i) => `${i === 0 ? 'L' : 'L'} ${p.x} ${p.y1}`).join(' ');

        paths.push(
            <path
                key={cat}
                d={`${topPath} ${bottomPath} Z`}
                fill={colors[cat]}
                opacity="0.6"
            />
        );
    });

    return (
        <svg viewBox={`0 0 ${svgWidth} ${height}`} style={{ width: '100%', height, display: 'block' }}>
            {paths}
        </svg>
    );
}

// ●● Milestone Badge ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function MilestoneBadge({ label, value, subValue, color = '#e2e8f0', icon }) {
    return (
        <div style={{
            padding: '8px 6px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
            textAlign: 'center', flex: 1,
        }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{icon}</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color, fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace" }}>
                {value}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginTop: 1 }}>{label}</div>
            {subValue && <div style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>{subValue}</div>}
        </div>
    );
}

// ●● Trend Arrow ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function TrendIndicator({ trending, delta }) {
    if (!trending || trending === 'flat') return null;
    const isUp = trending === 'up';
    return (
        <span style={{
            fontSize: 10, fontWeight: 'bold',
            color: isUp ? '#22c55e' : '#ef4444',
            display: 'inline-flex', alignItems: 'center', gap: 2,
        }}>
            {isUp ? '↑' : '↓'}
            {delta !== null && <span>{Math.abs(delta)}pts</span>}
        </span>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function PerformanceTrends({ gameId, userId, days = 30, compact = false }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedRange, setSelectedRange] = useState(days);

    const fetchAnalytics = useCallback(async () => {
        if (!userId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        try {
            const token = getSessionToken();
            const params = new URLSearchParams({ days: selectedRange.toString(), type: 'full' });
            if (gameId) params.set('gameId', gameId);

            const res = await fetch(`/api/training/analytics?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success) {
                setAnalytics(data);
            } else {
                setError(data.error || 'Failed to load analytics');
            }
        } catch (err) {
            console.warn('[PerformanceTrends] Fetch error:', err.message);
            setError('Network error');
        }
        setLoading(false);
    }, [gameId, userId, selectedRange]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.sectionTitle}>Performance Trends</div>
                <div style={styles.loading}>
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                        Analyzing your training data...
                    </motion.div>
                </div>
            </div>
        );
    }

    if (error || !analytics) {
        return (
            <div style={styles.container}>
                <div style={styles.sectionTitle}>Performance Trends</div>
                <div style={styles.empty}>{error || 'No analytics data available'}</div>
            </div>
        );
    }

    const { scoreTrend = [], classificationTrend = [], milestones = {} } = analytics;

    return (
        <div style={styles.container}>
            {/* Header with range selector */}
            <div style={styles.header}>
                <div style={styles.sectionTitle}>
                    Performance Trends
                    {milestones.trending && (
                        <TrendIndicator trending={milestones.trending} delta={milestones.trendDelta} />
                    )}
                </div>
                <div style={styles.rangeSelector}>
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setSelectedRange(d)}
                            style={{
                                ...styles.rangeBtn,
                                ...(selectedRange === d ? styles.rangeBtnActive : {}),
                            }}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Milestones row */}
            {milestones.totalSessions > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.milestonesGrid}
                >
                    <MilestoneBadge
                        icon="◎"
                        label="Score"
                        value={`${milestones.last5Avg}%`}
                        color={milestones.last5Avg >= 80 ? '#22c55e' : milestones.last5Avg >= 60 ? '#fbbf24' : '#ef4444'}
                        subValue={milestones.prev5Avg !== null ? `was ${milestones.prev5Avg}%` : null}
                    />
                    <MilestoneBadge
                        icon=""
                        label="EV/Hand"
                        value={milestones.avgEvPerHand.toFixed(2)}
                        color={milestones.avgEvPerHand < 0.5 ? '#22c55e' : '#fbbf24'}
                    />
                    <MilestoneBadge
                        icon=""
                        label="Streak"
                        value={milestones.currentStreak}
                        color="#f97316"
                        subValue={`Best: ${milestones.longestStreak}`}
                    />
                    <MilestoneBadge
                        icon=""
                        label="Hands"
                        value={milestones.totalHands >= 1000 ? `${(milestones.totalHands / 1000).toFixed(1)}k` : milestones.totalHands}
                        color="#3b82f6"
                    />
                </motion.div>
            )}

            {/* Score Trend Chart */}
            {scoreTrend.length >= 2 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    style={styles.chartSection}
                >
                    <div style={styles.chartLabel}>
                        GTOW Score
                        <span style={styles.chartSubLabel}>
                            Best: {milestones.bestScore}%
                        </span>
                    </div>
                    <LineChart
                        data={scoreTrend}
                        valueKey="gtowScore"
                        color="#3b82f6"
                        height={compact ? 60 : 80}
                        formatValue={v => `${v}%`}
                        emptyMessage="Complete more sessions to see trends"
                    />
                </motion.div>
            )}

            {/* EV Loss Trend Chart */}
            {scoreTrend.length >= 2 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    style={styles.chartSection}
                >
                    <div style={styles.chartLabel}>
                        EV Loss / Hand
                        <span style={styles.chartSubLabel}>lower is better</span>
                    </div>
                    <LineChart
                        data={scoreTrend}
                        valueKey="avgEvPerHand"
                        color="#ef4444"
                        height={compact ? 50 : 65}
                        formatValue={v => `-${v.toFixed(2)}`}
                        showFill={true}
                        emptyMessage="Need more data"
                    />
                </motion.div>
            )}

            {/* Classification Trend (stacked area) */}
            {!compact && classificationTrend.length >= 2 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    style={styles.chartSection}
                >
                    <div style={styles.chartLabel}>
                        Decision Quality
                        <div style={styles.legendRow}>
                            {[
                                { key: 'best', color: '#3b82f6', label: 'Best' },
                                { key: 'correct', color: '#22c55e', label: 'Correct' },
                                { key: 'inaccuracy', color: '#fbbf24', label: 'Inacc' },
                                { key: 'wrong', color: '#f97316', label: 'Wrong' },
                                { key: 'blunder', color: '#ef4444', label: 'Blunder' },
                            ].map(item => (
                                <span key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: '#64748b' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: 2, background: item.color }} />
                                    {item.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <ClassificationTrendChart data={classificationTrend} height={60} />
                </motion.div>
            )}

            {/* ●●● Phase GTO-CLONE: Leak Detection via LeakDetector Engine ●●● */}
            {!compact && analytics?.sessionHistory && (
                <LeakDetectionPanel sessionHistory={analytics.sessionHistory} />
            )}
        </div>
    );
}

// ●●● Phase GTO-CLONE: Leak Detection Panel using LeakDetector engine ●●●
function LeakDetectionPanel({ sessionHistory }) {
    const leaks = useMemo(() => {
        if (!sessionHistory || sessionHistory.length < 3) return null;
        try {
            return detectLeaks(sessionHistory);
        } catch (e) {
            return null;
        }
    }, [sessionHistory]);

    const drills = useMemo(() => {
        if (!leaks || leaks.length === 0) return [];
        try {
            return generateDrillRecommendations(leaks);
        } catch (e) {
            return [];
        }
    }, [leaks]);

    if (!leaks || leaks.length === 0) return null;

    const severityColors = { critical: '#ef4444', major: '#f97316', minor: '#fbbf24' };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            style={{
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.05)',
                borderRadius: 8,
                border: '1px solid rgba(239, 68, 68, 0.15)',
                marginTop: 8,
            }}
        >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                Leak Detection
                <span style={{ fontSize: 9, fontWeight: 400, color: '#94a3b8' }}>
                    {leaks.length} leak{leaks.length !== 1 ? 's' : ''} identified
                </span>
            </div>
            {leaks.slice(0, 3).map((leak, i) => (
                <div key={i} style={{
                    padding: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    marginBottom: i < 2 ? 6 : 0,
                    borderLeft: `3px solid ${severityColors[leak.severity] || '#fbbf24'}`,
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                        {leak.title || leak.type}
                    </div>
                    <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.4 }}>
                        {leak.description || leak.fix}
                    </div>
                </div>
            ))}
            {drills.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>
                    Recommended: {drills.slice(0, 2).map(d => d.name || d.description).join(', ')}
                </div>
            )}
        </motion.div>
    );
}

// ●●● Hook: useTrainingAnalytics ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// Reusable hook for components that need analytics data
export function useTrainingAnalytics(gameId, days = 30) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const token = getSessionToken();
                const params = new URLSearchParams({ days: days.toString(), type: 'full' });
                if (gameId) params.set('gameId', gameId);
                const res = await fetch(`/api/training/analytics?${params}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                });
                const data = await res.json();
                if (!cancelled && data.success) setAnalytics(data);
            } catch (e) {
                console.warn('[useTrainingAnalytics]', e.message);
            }
            if (!cancelled) setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [gameId, days]);

    return { analytics, loading };
}

const styles = {
    container: {
        marginBottom: 16,
        padding: '14px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.12) 100%)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 8,
    },
    rangeSelector: {
        display: 'flex', gap: 4,
    },
    rangeBtn: {
        padding: '3px 8px', borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: '#64748b', fontSize: 10, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
    },
    rangeBtnActive: {
        background: 'rgba(59,130,246,0.15)',
        border: '1px solid rgba(59,130,246,0.3)',
        color: '#3b82f6',
    },
    milestonesGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6, marginBottom: 14,
    },
    chartSection: {
        marginBottom: 12,
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
    },
    chartLabel: {
        fontSize: 10, fontWeight: 'bold', color: '#64748b',
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    chartSubLabel: {
        fontSize: 9, color: '#475569', fontWeight: 'normal', textTransform: 'none',
    },
    legendRow: {
        display: 'flex', gap: 8,
    },
    loading: {
        color: '#64748b', fontSize: 12, textAlign: 'center', padding: 24,
    },
    empty: {
        color: '#475569', fontSize: 11, textAlign: 'center', padding: 16, fontStyle: 'italic',
    },
};
