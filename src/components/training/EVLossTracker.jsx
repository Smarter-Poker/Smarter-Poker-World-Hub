/**
 * EV LOSS TRACKER — Comprehensive EV Analysis Dashboard
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style EV tracking with:
 *   - Cumulative EV loss line chart (SVG)
 *   - Position heatmap (EV loss by position)
 *   - Spot-type breakdown (c-bet, check-raise, facing bet, etc.)
 *   - Street-by-street EV waterfall
 *   - Mistake severity histogram
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CUMULATIVE EV LINE CHART (SVG)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function CumulativeEVChart({ handHistory, width = 500, height = 160 }) {
    const data = useMemo(() => {
        if (!handHistory || handHistory.length < 2) return [];
        let cum = 0;
        return handHistory.map((h, i) => {
            cum += (h.evLoss || 0);
            return { hand: i + 1, cumEV: -cum, evLoss: h.evLoss || 0 };
        });
    }, [handHistory]);

    if (data.length < 2) return null;

    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;

    const maxY = Math.max(...data.map(d => Math.abs(d.cumEV)), 0.5);
    const minY = Math.min(...data.map(d => d.cumEV), 0);
    const rangeY = Math.max(maxY, Math.abs(minY)) * 1.15;

    const scaleX = (i) => pad.left + (i / (data.length - 1)) * w;
    const scaleY = (v) => pad.top + h / 2 - (v / rangeY) * (h / 2);

    // Build SVG path
    const pathD = data.map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(d.cumEV).toFixed(1)}`
    ).join(' ');

    // Area fill
    const areaD = pathD + ` L ${scaleX(data.length - 1).toFixed(1)} ${scaleY(0).toFixed(1)} L ${scaleX(0).toFixed(1)} ${scaleY(0).toFixed(1)} Z`;

    const finalEV = data[data.length - 1].cumEV;
    const isPositive = finalEV >= 0;
    const lineColor = isPositive ? '#22c55e' : '#ef4444';
    const fillColor = isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';

    // Y-axis ticks
    const yTicks = [];
    const step = rangeY / 3;
    for (let v = -rangeY; v <= rangeY; v += step) {
        yTicks.push(Math.round(v * 10) / 10);
    }

    return (
        <div style={{ position: 'relative' }}>
            <svg width={width} height={height} style={{ display: 'block' }}>
                {/* Grid lines */}
                {yTicks.map(v => (
                    <line
                        key={v}
                        x1={pad.left} y1={scaleY(v)}
                        x2={width - pad.right} y2={scaleY(v)}
                        stroke="rgba(255,255,255,0.04)" strokeWidth={1}
                    />
                ))}
                {/* Zero line */}
                <line
                    x1={pad.left} y1={scaleY(0)}
                    x2={width - pad.right} y2={scaleY(0)}
                    stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,3"
                />

                {/* Area fill */}
                <motion.path
                    d={areaD}
                    fill={fillColor}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                />

                {/* Line */}
                <motion.path
                    d={pathD}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />

                {/* Endpoint dot */}
                <circle
                    cx={scaleX(data.length - 1)}
                    cy={scaleY(finalEV)}
                    r={4}
                    fill={lineColor}
                    stroke="#0f172a"
                    strokeWidth={2}
                />

                {/* Y axis labels */}
                {yTicks.filter(v => Math.abs(v) > 0.01).map(v => (
                    <text
                        key={v}
                        x={pad.left - 6}
                        y={scaleY(v) + 3}
                        fill="#64748b"
                        fontSize={8}
                        fontWeight={600}
                        textAnchor="end"
                        fontFamily="'Orbitron', monospace"
                    >
                        {v > 0 ? '+' : ''}{v.toFixed(1)}
                    </text>
                ))}

                {/* X axis labels */}
                <text x={pad.left} y={height - 6} fill="#64748b" fontSize={8} textAnchor="start">1</text>
                <text x={width - pad.right} y={height - 6} fill="#64748b" fontSize={8} textAnchor="end">{data.length}</text>
                <text x={pad.left + w / 2} y={height - 6} fill="#475569" fontSize={8} textAnchor="middle">Hand #</text>

                {/* Final value label */}
                <text
                    x={scaleX(data.length - 1) + 8}
                    y={scaleY(finalEV) + 3}
                    fill={lineColor}
                    fontSize={10}
                    fontWeight={800}
                    fontFamily="'Orbitron', monospace"
                >
                    {finalEV >= 0 ? '+' : ''}{finalEV.toFixed(2)} BB
                </text>
            </svg>
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// POSITION HEATMAP
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function PositionHeatmap({ handHistory }) {
    const posData = useMemo(() => {
        const positions = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
        const stats = {};
        positions.forEach(p => { stats[p] = { evLoss: 0, hands: 0, mistakes: 0 }; });

        handHistory?.forEach(h => {
            const pos = h.heroPosition || h.handData?.heroPosition;
            if (pos && stats[pos]) {
                stats[pos].hands++;
                stats[pos].evLoss += (h.evLoss || 0);
                if (h.evLoss > 0) stats[pos].mistakes++;
            }
        });

        return positions.map(p => ({
            position: p,
            ...stats[p],
            evPerHand: stats[p].hands > 0 ? stats[p].evLoss / stats[p].hands : 0,
        }));
    }, [handHistory]);

    const maxLoss = Math.max(...posData.map(p => p.evLoss), 0.1);

    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {posData.map(p => {
                const intensity = maxLoss > 0 ? Math.min(1, p.evLoss / maxLoss) : 0;
                const color = p.evLoss > 0
                    ? `rgba(239, 68, 68, ${Math.max(0.1, intensity * 0.7)})`
                    : 'rgba(34, 197, 94, 0.15)';
                return (
                    <div key={p.position} style={{
                        flex: 1, textAlign: 'center',
                        padding: '8px 4px', borderRadius: 6,
                        background: color,
                        border: '1px solid rgba(255,255,255,0.06)',
                        minWidth: 42,
                    }}>
                        <div style={{
                            fontSize: 11, fontWeight: 800, color: '#e2e8f0',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            {p.position}
                        </div>
                        <div style={{
                            fontSize: 10, fontWeight: 700, marginTop: 2,
                            color: p.evLoss > 0 ? '#fca5a5' : '#86efac',
                        }}>
                            {p.evLoss > 0 ? `-${p.evLoss.toFixed(1)}` : '0.0'}
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 1 }}>
                            {p.hands} hands
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SPOT-TYPE BREAKDOWN
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function SpotTypeBreakdown({ handHistory }) {
    const spotData = useMemo(() => {
        const types = {
            'C-Bet': { evLoss: 0, hands: 0, color: '#3b82f6' },
            'Check-Raise': { evLoss: 0, hands: 0, color: '#a855f7' },
            'Facing Bet': { evLoss: 0, hands: 0, color: '#f97316' },
            'Barrel': { evLoss: 0, hands: 0, color: '#06b6d4' },
            'Other': { evLoss: 0, hands: 0, color: '#64748b' },
        };

        handHistory?.forEach(h => {
            const spot = h.spotType || h.handData?.spotType || 'Other';
            let key = 'Other';
            if (spot.includes('cbet') || spot.includes('c-bet') || spot.includes('Cbet')) key = 'C-Bet';
            else if (spot.includes('check') && spot.includes('raise')) key = 'Check-Raise';
            else if (spot.includes('facing') || spot.includes('defend')) key = 'Facing Bet';
            else if (spot.includes('barrel') || spot.includes('turn') || spot.includes('river')) key = 'Barrel';

            types[key].hands++;
            types[key].evLoss += (h.evLoss || 0);
        });

        return Object.entries(types || {})
            .filter(([_, v]) => v.hands > 0)
            .sort(([_, a], [__, b]) => b.evLoss - a.evLoss);
    }, [handHistory]);

    if (spotData.length === 0) return null;

    const maxEV = Math.max(...spotData.map(([_, v]) => v.evLoss), 0.1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {spotData.map(([name, data]) => {
                const barWidth = maxEV > 0 ? Math.max(5, (data.evLoss / maxEV) * 100) : 5;
                return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 80, fontSize: 10, fontWeight: 700,
                            color: data.color, textAlign: 'right',
                        }}>
                            {name}
                        </div>
                        <div style={{
                            flex: 1, height: 18, background: 'rgba(255,255,255,0.04)',
                            borderRadius: 4, overflow: 'hidden', position: 'relative',
                        }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.5 }}
                                style={{
                                    height: '100%', borderRadius: 4,
                                    background: data.evLoss > 0
                                        ? `linear-gradient(90deg, ${data.color}60, ${data.color}30)`
                                        : 'rgba(34,197,94,0.2)',
                                }}
                            />
                            <span style={{
                                position: 'absolute', right: 6, top: 2,
                                fontSize: 10, fontWeight: 600, color: '#e2e8f0',
                            }}>
                                {data.evLoss > 0 ? `-${data.evLoss.toFixed(1)}` : '0.0'} BB
                            </span>
                        </div>
                        <div style={{ width: 40, fontSize: 9, color: '#64748b', textAlign: 'right' }}>
                            {data.hands}h
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MISTAKE SEVERITY HISTOGRAM
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function MistakeSeverityChart({ handHistory }) {
    const buckets = useMemo(() => {
        const bins = [
            { label: '0 BB', min: 0, max: 0.001, count: 0, color: '#22c55e' },
            { label: '<0.5', min: 0.001, max: 0.5, count: 0, color: '#4ade80' },
            { label: '0.5-1', min: 0.5, max: 1, count: 0, color: '#fbbf24' },
            { label: '1-2', min: 1, max: 2, count: 0, color: '#f97316' },
            { label: '2-5', min: 2, max: 5, count: 0, color: '#ef4444' },
            { label: '5+', min: 5, max: Infinity, count: 0, color: '#dc2626' },
        ];

        handHistory?.forEach(h => {
            const loss = h.evLoss || 0;
            const bin = bins.find(b => loss >= b.min && loss < b.max);
            if (bin) bin.count++;
        });

        return bins;
    }, [handHistory]);

    const maxCount = Math.max(...buckets.map(b => b.count), 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, padding: '0 4px' }}>
            {buckets.map((b, i) => {
                const h = maxCount > 0 ? Math.max(4, (b.count / maxCount) * 70) : 4;
                return (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: h }}
                            transition={{ delay: i * 0.05, duration: 0.3 }}
                            style={{
                                background: b.color, borderRadius: '3px 3px 0 0',
                                margin: '0 auto', width: '80%',
                                position: 'relative',
                            }}
                        >
                            {b.count > 0 && (
                                <span style={{
                                    position: 'absolute', top: -14, left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: 9, fontWeight: 700, color: '#e2e8f0',
                                }}>
                                    {b.count}
                                </span>
                            )}
                        </motion.div>
                        <div style={{ fontSize: 7, color: '#64748b', marginTop: 3 }}>
                            {b.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function EVLossTracker({ handHistory, compact = false }) {
    const [activeSection, setActiveSection] = useState('cumulative');

    const summary = useMemo(() => {
        if (!handHistory || handHistory.length === 0) return null;
        let totalLoss = 0;
        let worstHand = null;
        let worstLoss = 0;
        let mistakes = 0;

        handHistory.forEach(h => {
            const loss = h.evLoss || 0;
            totalLoss += loss;
            if (loss > worstLoss) {
                worstLoss = loss;
                worstHand = h;
            }
            if (loss > 0) mistakes++;
        });

        return {
            totalLoss,
            avgLoss: totalLoss / handHistory.length,
            worstLoss,
            worstHand,
            mistakes,
            accuracy: ((handHistory.length - mistakes) / handHistory.length * 100),
            hands: handHistory.length,
        };
    }, [handHistory]);

    if (!summary || summary.hands < 2) {
        return (
            <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 11 }}>
                Play at least 2 hands to see EV tracking data.
            </div>
        );
    }

    const sections = [
        { id: 'cumulative', label: 'Cumulative' },
        { id: 'position', label: 'By Position' },
        { id: 'spots', label: 'By Spot' },
        { id: 'severity', label: 'Severity' },
    ];

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,15,30,0.95), rgba(20,20,40,0.95))',
            borderRadius: 14, padding: compact ? 12 : 16,
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            {/* Header Stats */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 12, padding: '0 4px',
            }}>
                <div>
                    <div style={{
                        fontSize: 10, color: '#64748b', fontWeight: 600,
                        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
                    }}>
                        Total EV Lost
                    </div>
                    <div style={{
                        fontSize: 20, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                        color: summary.totalLoss > 0 ? '#ef4444' : '#22c55e',
                    }}>
                        {summary.totalLoss > 0 ? '-' : ''}{summary.totalLoss.toFixed(2)} BB
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 16, textAlign: 'center' }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24', fontFamily: "'Orbitron', monospace" }}>
                            {summary.avgLoss.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b' }}>BB/hand</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#00d4ff', fontFamily: "'Orbitron', monospace" }}>
                            {summary.accuracy.toFixed(0)}%
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b' }}>Accuracy</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', fontFamily: "'Orbitron', monospace" }}>
                            {summary.worstLoss.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b' }}>Worst</div>
                    </div>
                </div>
            </div>

            {/* Section Tabs */}
            <div style={{
                display: 'flex', gap: 0, marginBottom: 12, borderRadius: 6, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        style={{
                            flex: 1, padding: '6px 0',
                            background: activeSection === s.id ? 'rgba(0,212,255,0.12)' : 'rgba(0,0,0,0.2)',
                            color: activeSection === s.id ? '#00d4ff' : '#64748b',
                            border: 'none', cursor: 'pointer',
                            fontSize: 10, fontWeight: 700,
                            borderBottom: activeSection === s.id ? '2px solid #00d4ff' : '2px solid transparent',
                            transition: 'all 0.15s',
                        }}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ minHeight: compact ? 100 : 160 }}>
                {activeSection === 'cumulative' && (
                    <CumulativeEVChart
                        handHistory={handHistory}
                        width={compact ? 340 : 480}
                        height={compact ? 120 : 160}
                    />
                )}

                {activeSection === 'position' && (
                    <PositionHeatmap handHistory={handHistory} />
                )}

                {activeSection === 'spots' && (
                    <SpotTypeBreakdown handHistory={handHistory} />
                )}

                {activeSection === 'severity' && (
                    <div>
                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>
                            EV Loss Distribution (BB)
                        </div>
                        <MistakeSeverityChart handHistory={handHistory} />
                    </div>
                )}
            </div>
        </div>
    );
}
