/**
 * CROSS-SESSION ANALYTICS DASHBOARD — Persistent Improvement Tracking
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style analytics that tracks improvement over time:
 *   - Session-over-session GTO Score trending (7-day, 30-day, all-time)
 *   - Position-specific win rate heatmap with trend arrows
 *   - Leak detection timeline (when leaks appear/resolve)
 *   - Spot-type accuracy evolution (c-bet, check-raise, facing bet, barrel)
 *   - Milestone badges (first 80+ score, 10-session streak, etc.)
 *   - Study volume chart (sessions/week, hands/week)
 *
 * Data flows from training_sessions / training_answers via
 * GET /api/training/analytics (useTrainingAnalytics) -> this dashboard.
 * sessionHistory carries real per-session rows (signed GTOW scores,
 * score_scale already normalized server-side); the optional `analytics`
 * prop carries the answers-derived position/spot aggregates. A user with
 * zero sessions sees an honest empty state -- never sample data.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { detectLeaks } from '../../engines/LeakDetector';

// ●● Time Range Selector ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const TIME_RANGES = [
    { id: '7d', label: '7 Days', days: 7 },
    { id: '30d', label: '30 Days', days: 30 },
    { id: '90d', label: '90 Days', days: 90 },
    { id: 'all', label: 'All Time', days: 99999 },
];

// ●● SVG Mini Line Chart ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const MiniTrendChart = memo(({ data, color = '#22c55e', height = 60, valueKey = 'value' }) => {
    const svgW = 300, svgH = height;
    const pad = { t: 6, b: 14, l: 4, r: 4 };
    const cW = svgW - pad.l - pad.r;
    const cH = svgH - pad.t - pad.b;

    if (!data || data.length < 2) {
        return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 10 }}>Not enough data</div>;
    }

    const values = data.map(d => typeof d === 'number' ? d : d[valueKey] || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const points = values.map((v, i) => ({
        x: pad.l + (i / (values.length - 1)) * cW,
        y: pad.t + cH - ((v - min) / range) * cH,
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const fillPath = `${linePath} L ${points[points.length - 1].x} ${pad.t + cH} L ${points[0].x} ${pad.t + cH} Z`;

    // Trend direction
    const recent = values.slice(-5);
    const earlier = values.slice(-10, -5);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;
    const trending = recentAvg > earlierAvg ? 'up' : recentAvg < earlierAvg ? 'down' : 'flat';

    return (
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: svgH, display: 'block' }}>
            <defs>
                <linearGradient id={`trend-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#trend-${color.replace('#', '')})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
            {/* End dot */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                r="3" fill={color} stroke="#0f172a" strokeWidth="1.5" />
            {/* Trend arrow */}
            <text x={svgW - 8} y={12} fontSize="10" fill={trending === 'up' ? '#22c55e' : trending === 'down' ? '#ef4444' : '#94a3b8'}
                textAnchor="end" fontWeight="bold">
                {trending === 'up' ? '↑' : trending === 'down' ? '↓' : '→'}
            </text>
        </svg>
    );
});

// ●● Position Heatmap ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PositionHeatmap = memo(({ sessions, positionAccuracy }) => {
    const posData = useMemo(() => {
        const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
        // Prefer the answers-derived aggregate from /api/training/analytics:
        // it covers every recorded answer, not only sessions carrying moves.
        if (positionAccuracy && positions.some(p => (positionAccuracy[p]?.total || 0) > 0)) {
            return positions.map(p => {
                const b = positionAccuracy[p] || { correct: 0, total: 0, evLoss: 0 };
                return {
                    position: p,
                    accuracy: b.total > 0 ? b.correct / b.total : 0,
                    evLoss: b.evLoss || 0,
                    total: b.total || 0,
                };
            });
        }
        const data = {};
        positions.forEach(p => { data[p] = { correct: 0, total: 0, evLoss: 0 }; });

        sessions.forEach(s => {
            (s.moves || []).forEach(m => {
                const pos = m.heroPosition || 'BTN';
                if (!data[pos]) data[pos] = { correct: 0, total: 0, evLoss: 0 };
                data[pos].total++;
                if (m.classification === 'correct' || m.classification === 'best') data[pos].correct++;
                data[pos].evLoss += m.evLoss || 0;
            });
        });

        return positions.map(p => ({
            position: p,
            accuracy: data[p].total > 0 ? data[p].correct / data[p].total : 0,
            evLoss: data[p].evLoss,
            total: data[p].total,
        }));
    }, [sessions, positionAccuracy]);

    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {posData.map(p => {
                const acc = p.accuracy;
                const color = acc >= 0.75 ? '#22c55e' : acc >= 0.6 ? '#f59e0b' : acc >= 0.4 ? '#fb923c' : '#ef4444';
                return (
                    <div key={p.position} style={{
                        flex: 1, maxWidth: 65,
                        padding: '8px 4px', borderRadius: 6, textAlign: 'center',
                        background: `${color}10`,
                        border: `1px solid ${color}20`,
                    }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
                            {p.position}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {(acc * 100).toFixed(0)}%
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>
                            {p.total} hands
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

// ●● Spot Type Accuracy ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SpotTypeBreakdown = memo(({ sessions, spotAccuracy }) => {
    const spotData = useMemo(() => {
        const spots = {
            cbet: { label: 'C-Bet', correct: 0, total: 0, color: '#3b82f6' },
            checkraise: { label: 'Check-Raise', correct: 0, total: 0, color: '#a855f7' },
            facing_bet: { label: 'Facing Bet', correct: 0, total: 0, color: '#f59e0b' },
            turn_barrel: { label: 'Turn Barrel', correct: 0, total: 0, color: '#22d3ee' },
            river_vbet: { label: 'River Value', correct: 0, total: 0, color: '#ef4444' },
        };

        // Prefer the answers-derived aggregate (keys arrive uppercased).
        const apiEntries = spotAccuracy
            ? Object.entries(spotAccuracy).filter(([k, b]) => spots[k.toLowerCase()] && b && b.total > 0)
            : [];
        if (apiEntries.length > 0) {
            apiEntries.forEach(([key, b]) => {
                const k = key.toLowerCase();
                spots[k].total += b.total || 0;
                spots[k].correct += b.correct || 0;
            });
        } else {
            sessions.forEach(s => {
                (s.moves || []).forEach(m => {
                    const spot = m.spotType || 'cbet';
                    if (!spots[spot]) return;
                    spots[spot].total++;
                    if (m.classification === 'correct' || m.classification === 'best') spots[spot].correct++;
                });
            });
        }

        return Object.values(spots || {}).filter(s => s.total > 0);
    }, [sessions, spotAccuracy]);

    if (spotData.length === 0) return null;

    return (
        <div>
            {spotData.map(spot => {
                const acc = spot.total > 0 ? spot.correct / spot.total : 0;
                return (
                    <div key={spot.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: spot.color }}>{spot.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                                {(acc * 100).toFixed(0)}%
                            </span>
                        </div>
                        <div style={{
                            height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3,
                            overflow: 'hidden',
                        }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${acc * 100}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                style={{
                                    height: '100%', borderRadius: 3,
                                    background: `linear-gradient(90deg, ${spot.color}66, ${spot.color})`,
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

// ●● Leak Timeline ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const LeakTimeline = memo(({ sessions }) => {
    const leaks = useMemo(() => {
        // Analyze leaks from the last N sessions in windows
        const windowSize = 5;
        const results = [];

        for (let i = windowSize; i <= sessions.length; i++) {
            const window = sessions.slice(i - windowSize, i);
            const allMoves = window.flatMap(s => s.moves || []);

            try {
                const detected = detectLeaks(allMoves);
                if (detected && detected.length > 0) {
                    results.push({
                        sessionIndex: i,
                        date: sessions[i - 1]?.completedAt,
                        leaks: detected.slice(0, 3),
                    });
                }
            } catch {
                // LeakDetector might not have the data it needs
            }
        }

        return results;
    }, [sessions]);

    if (leaks.length === 0) {
        return (
            <div style={{ padding: 12, textAlign: 'center', color: '#22c55e', fontSize: 11 }}>
                No significant leaks detected. Keep it up!
            </div>
        );
    }

    return (
        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {leaks.slice(-5).reverse().map((entry, i) => (
                <div key={i} style={{
                    padding: '6px 8px', marginBottom: 4,
                    background: 'rgba(239,68,68,0.05)',
                    border: '1px solid rgba(239,68,68,0.1)',
                    borderRadius: 6,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: '#64748b' }}>
                            Session {entry.sessionIndex}
                        </span>
                        {entry.date && (
                            <span style={{ fontSize: 9, color: '#64748b' }}>
                                {new Date(entry.date).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                    {entry.leaks.map((leak, j) => (
                        <div key={j} style={{ fontSize: 10, color: '#f87171', fontWeight: 500 }}>
                            {leak.description || leak.type || 'Unspecified leak'}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
});

// ●● Milestone Badges ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const MilestoneBadges = memo(({ sessions }) => {
    const milestones = useMemo(() => {
        const earned = [];
        const totalSessions = sessions.length;
        const totalHands = sessions.reduce((s, sess) => s + (sess.handsPlayed || 0), 0);
        const bestScore = Math.max(...sessions.map(s => s.gtoScore || 0), 0);
        const avgScore = sessions.length > 0
            ? sessions.reduce((s, sess) => s + (sess.gtoScore || 0), 0) / sessions.length : 0;

        // Session count milestones
        if (totalSessions >= 1) earned.push({ icon: '◆', label: 'First Session', color: '#3b82f6' });
        if (totalSessions >= 10) earned.push({ icon: '▲', label: '10 Sessions', color: '#f59e0b' });
        if (totalSessions >= 25) earned.push({ icon: '◆', label: '25 Sessions', color: '#a855f7' });
        if (totalSessions >= 50) earned.push({ icon: '★', label: '50 Sessions', color: '#22d3ee' });

        // Score milestones
        if (bestScore >= 70) earned.push({ icon: '★', label: 'Score 70+', color: '#22c55e' });
        if (bestScore >= 80) earned.push({ icon: '★', label: 'Score 80+', color: '#f59e0b' });
        if (bestScore >= 90) earned.push({ icon: '▲', label: 'Score 90+', color: '#ef4444' });

        // Hand count milestones
        if (totalHands >= 100) earned.push({ icon: '◇', label: '100 Hands', color: '#818cf8' });
        if (totalHands >= 500) earned.push({ icon: '●', label: '500 Hands', color: '#22c55e' });
        if (totalHands >= 1000) earned.push({ icon: '★', label: '1K Hands', color: '#f59e0b' });

        // Average score milestones
        if (avgScore >= 65 && totalSessions >= 5) earned.push({ icon: '▲', label: 'Consistent B+', color: '#3b82f6' });
        if (avgScore >= 75 && totalSessions >= 10) earned.push({ icon: '★', label: 'Master Student', color: '#a855f7' });

        return earned;
    }, [sessions]);

    if (milestones.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {milestones.map((m, i) => (
                <motion.div
                    key={m.label}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '3px 8px', borderRadius: 12,
                        background: `${m.color}10`,
                        border: `1px solid ${m.color}22`,
                    }}
                >
                    <span style={{ fontSize: 10 }}>{m.icon}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: m.color }}>{m.label}</span>
                </motion.div>
            ))}
        </div>
    );
});

// ●● Study Volume Chart ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StudyVolumeChart = memo(({ sessions, timeRange }) => {
    const weeklyData = useMemo(() => {
        const now = Date.now();
        const weeks = [];
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const numWeeks = Math.min(12, Math.ceil(timeRange.days / 7));

        for (let w = numWeeks - 1; w >= 0; w--) {
            const weekStart = now - (w + 1) * msPerWeek;
            const weekEnd = now - w * msPerWeek;
            const weekSessions = sessions.filter(s => {
                const t = new Date(s.completedAt).getTime();
                return t >= weekStart && t < weekEnd;
            });

            weeks.push({
                label: `W${numWeeks - w}`,
                sessions: weekSessions.length,
                hands: weekSessions.reduce((s, sess) => s + (sess.handsPlayed || 0), 0),
            });
        }

        return weeks;
    }, [sessions, timeRange]);

    const maxSessions = Math.max(...weeklyData.map(w => w.sessions), 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
            {weeklyData.map((w, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: Math.max(3, (w.sessions / maxSessions) * 45) }}
                        transition={{ duration: 0.4, delay: i * 0.03 }}
                        style={{
                            width: '100%', borderRadius: '3px 3px 0 0',
                            background: w.sessions > 0
                                ? 'linear-gradient(180deg, #3b82f6, #1d4ed8)'
                                : 'rgba(100,116,139,0.1)',
                        }}
                    />
                    <div style={{ fontSize: 7, color: '#64748b', marginTop: 2 }}>{w.label}</div>
                </div>
            ))}
        </div>
    );
});

// ●● Recent Sessions List ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// date | game | signed GTOW score | accuracy | EV lost -- newest first.

const RecentSessionsList = memo(({ sessions }) => {
    const recent = [...sessions].slice(-8).reverse();
    if (recent.length === 0) return null;
    return (
        <div>
            {recent.map((s, i) => {
                const score = Math.round(s.gtoScore ?? 0);
                const scoreColor = score >= 50 ? '#22c55e' : score >= 0 ? '#f59e0b' : '#ef4444';
                const accRaw = s.accuracy;
                const acc = accRaw === null || accRaw === undefined
                    ? null
                    : Math.round(accRaw <= 1 ? accRaw * 100 : accRaw);
                return (
                    <div key={s.id || i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 2px',
                        borderBottom: i < recent.length - 1 ? '1px solid rgba(100,116,139,0.08)' : 'none',
                    }}>
                        <span style={{ fontSize: 9, color: '#64748b', width: 64, flexShrink: 0 }}>
                            {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : '—'}
                        </span>
                        <span style={{ flex: 1, fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.gameName || s.gameId || 'Training'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, fontFamily: "var(--font-orbitron), 'Orbitron', monospace", width: 38, textAlign: 'right' }}>
                            {score > 0 ? `+${score}` : score}
                        </span>
                        <span style={{ fontSize: 10, color: '#e2e8f0', width: 34, textAlign: 'right' }}>
                            {acc !== null ? `${acc}%` : '—'}
                        </span>
                        <span style={{ fontSize: 10, color: '#ef4444', width: 44, textAlign: 'right' }}>
                            {`-${(s.evLossTotal || 0).toFixed(1)}`}
                        </span>
                    </div>
                );
            })}
        </div>
    );
});

// ●● Dashboard Section Wrapper ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const DashSection = memo(({ title, icon, children, color = '#94a3b8' }) => (
    <div style={{
        background: 'rgba(0,0,0,0.15)',
        border: '1px solid rgba(100,116,139,0.1)',
        borderRadius: 8, padding: 12, marginBottom: 8,
    }}>
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginBottom: 10,
        }}>
            <span style={{ fontSize: 12 }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {title}
            </span>
        </div>
        {children}
    </div>
));

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function CrossSessionAnalytics({ sessionHistory = [], analytics = null, loading = false }) {
    const [timeRange, setTimeRange] = useState(TIME_RANGES[1]); // 30d default

    // Real sessions only -- no sample data, sorted ascending by completion.
    const sessions = useMemo(() =>
        [...sessionHistory].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt)),
        [sessionHistory]);

    // API-shaped history carries no per-hand moves; leak detection needs them.
    const hasMoveData = useMemo(() =>
        sessions.some(sess => (sess.moves || []).length > 0), [sessions]);

    // Filter by time range
    const filteredSessions = useMemo(() => {
        const cutoff = Date.now() - timeRange.days * 24 * 60 * 60 * 1000;
        return sessions.filter(s => new Date(s.completedAt).getTime() >= cutoff);
    }, [sessions, timeRange]);

    // Summary metrics
    const metrics = useMemo(() => {
        if (filteredSessions.length === 0) return null;
        const scores = filteredSessions.map(s => s.gtoScore || 0);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const bestScore = Math.max(...scores);
        const totalHands = filteredSessions.reduce((s, sess) => s + (sess.handsPlayed || 0), 0);
        const totalEV = filteredSessions.reduce((s, sess) => s + (sess.evLossTotal || 0), 0);
        const avgAccuracy = filteredSessions.reduce((s, sess) => s + (sess.accuracy || 0), 0) / filteredSessions.length;

        // Trend (last 5 vs previous 5)
        const recent5 = scores.slice(-5);
        const prev5 = scores.slice(-10, -5);
        const recentAvg = recent5.length > 0 ? recent5.reduce((a, b) => a + b, 0) / recent5.length : 0;
        const prevAvg = prev5.length > 0 ? prev5.reduce((a, b) => a + b, 0) / prev5.length : recentAvg;
        const trend = recentAvg - prevAvg;

        return { avgScore, bestScore, totalHands, totalEV, avgAccuracy, trend, sessionCount: filteredSessions.length };
    }, [filteredSessions]);

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    Analytics Dashboard
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                    {TIME_RANGES.map(tr => (
                        <button
                            key={tr.id}
                            onClick={() => setTimeRange(tr)}
                            style={{
                                padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 4, border: '1px solid',
                                cursor: 'pointer',
                                background: timeRange.id === tr.id ? 'rgba(0,212,255,0.1)' : 'transparent',
                                color: timeRange.id === tr.id ? '#00d4ff' : '#64748b',
                                borderColor: timeRange.id === tr.id ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                            }}
                        >
                            {tr.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary metrics bar */}
            {metrics && (
                <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(100,116,139,0.08)',
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Avg Score</div>
                        <div style={{
                            fontSize: 18, fontWeight: 700,
                            color: metrics.avgScore >= 70 ? '#22c55e' : metrics.avgScore >= 55 ? '#f59e0b' : '#ef4444',
                            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}>
                            {metrics.avgScore.toFixed(0)}
                        </div>
                        <div style={{
                            fontSize: 9, fontWeight: 600,
                            color: metrics.trend >= 0 ? '#22c55e' : '#ef4444',
                        }}>
                            {metrics.trend >= 0 ? '↑' : '↓'} {Math.abs(metrics.trend).toFixed(1)}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Best</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {metrics.bestScore}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Sessions</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {metrics.sessionCount}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Hands</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#818cf8', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            {metrics.totalHands}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>EV Lost</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                            -{metrics.totalEV.toFixed(0)}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state -- zero sessions shows the truth, never fake numbers */}
            {sessions.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                        {loading ? 'Loading session history\u2026' : 'No sessions yet'}
                    </div>
                    {!loading && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            Complete a training session and your score trend, position accuracy and session history will build here.
                        </div>
                    )}
                </div>
            )}

            {/* Dashboard body */}
            {sessions.length > 0 && (
            <div style={{ padding: 12 }}>
                {/* GTO Score Trend */}
                <DashSection title="GTO Score Trend" icon="▲" color="#22c55e">
                    <MiniTrendChart
                        data={filteredSessions.map(s => ({ value: s.gtoScore || 0 }))}
                        color="#22c55e"
                        height={70}
                    />
                </DashSection>

                {/* EV Loss Trend */}
                <DashSection title="EV Loss / Hand" icon="▼" color="#ef4444">
                    <MiniTrendChart
                        data={filteredSessions.map(s => ({ value: s.evLossAvg || 0 }))}
                        color="#ef4444"
                        height={50}
                    />
                </DashSection>

                {/* Position Heatmap */}
                <DashSection title="Position Accuracy" icon="◆" color="#3b82f6">
                    <PositionHeatmap sessions={filteredSessions} positionAccuracy={analytics?.positionAccuracy} />
                </DashSection>

                {/* Spot Type Breakdown */}
                <DashSection title="Spot Accuracy" icon="●" color="#a855f7">
                    <SpotTypeBreakdown sessions={filteredSessions} spotAccuracy={analytics?.spotAccuracy} />
                </DashSection>

                {/* Recent Sessions */}
                <DashSection title="Recent Sessions" icon="■" color="#22d3ee">
                    <RecentSessionsList sessions={filteredSessions} />
                </DashSection>

                {/* Study Volume */}
                <DashSection title="Study Volume" icon="□" color="#818cf8">
                    <StudyVolumeChart sessions={filteredSessions} timeRange={timeRange} />
                </DashSection>

                {/* Leak Timeline -- needs per-hand moves; hidden for
                    API-shaped history where "no leaks" would be a lie */}
                {hasMoveData && (
                    <DashSection title="Leak Detection" icon="○" color="#f59e0b">
                        <LeakTimeline sessions={filteredSessions} />
                    </DashSection>
                )}

                {/* Milestones */}
                <DashSection title="Milestones" icon="★" color="#f59e0b">
                    <MilestoneBadges sessions={filteredSessions} />
                </DashSection>
            </div>
            )}
        </div>
    );
}
