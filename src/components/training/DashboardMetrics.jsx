import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatSignedScore } from '../../engines/GTOScoreEngine';

// Tooltip component for interactive data points
function Tooltip({ children, content, visible }) {
    if (!visible || !content) return children;
    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            {children}
            <div style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 8,
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.95)',
                color: '#fff',
                fontSize: 10,
                borderRadius: 6,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 1000,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
            }}>
                {content}
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '4px solid rgba(0,0,0,0.95)'
                }} />
            </div>
        </div>
    );
}

// Trend indicator arrow component
function TrendArrow({ current, previous, showPercentage = true }) {
    if (previous === undefined || previous === null || previous === 0) return null;

    const change = current - previous;
    const percentChange = ((change / previous) * 100).toFixed(1);
    const isPositive = change > 0;
    const isNeutral = Math.abs(change) < 0.01;

    if (isNeutral) return null;

    return (
        <span style={{
            fontSize: 9,
            fontWeight: 'bold',
            color: isPositive ? '#22c55e' : '#ef4444',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            marginLeft: 6
        }}>
            <span style={{ fontSize: 11 }}>{isPositive ? '↑' : '↓'}</span>
            {showPercentage && <span>{Math.abs(parseFloat(percentChange))}%</span>}
        </span>
    );
}

// Sparkline mini-chart component
function Sparkline({ data = [], color = '#3b82f6', height = 16, width = 40 }) {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data, 0.1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 8 }}>
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
            />
        </svg>
    );
}

// F15: CLASSIFICATION DONUT CHART
export function ClassificationDonut({ handHistory = [], gtowScore = 0, previousScore = null, historicalScores = [] }) {
    const [hoveredSegment, setHoveredSegment] = useState(null);

    if (!handHistory || handHistory.length === 0) return null;

    const counts = { best: 0, correct: 0, inaccuracy: 0, wrong: 0, blunder: 0 };
    handHistory.forEach(h => {
        if (h.classification && counts[h.classification] !== undefined) {
            counts[h.classification]++;
        }
    });

    const total = handHistory.length;
    const colors = {
        best: '#3b82f6',
        correct: '#22c55e',
        inaccuracy: '#fbbf24',
        wrong: '#f97316',
        blunder: '#ef4444'
    };

    let currentOffset = 0;
    const segments = Object.entries(counts || {}).map(([key, count]) => {
        if (count === 0) return null;
        const percentage = (count / total) * 100;
        const dashArray = `${percentage} ${100 - percentage}`;
        const offset = currentOffset;
        currentOffset += percentage;

        return (
            <circle
                key={key}
                cx="21" cy="21" r="15.91549430918954" fill="transparent"
                stroke={colors[key]}
                strokeWidth="6"
                strokeDasharray={dashArray}
                strokeDashoffset={100 - offset + 25}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                opacity={hoveredSegment === null || hoveredSegment === key ? 1 : 0.4}
                onMouseEnter={() => setHoveredSegment(key)}
                onMouseLeave={() => setHoveredSegment(null)}
            />
        );
    });

    const avgScore = historicalScores.length > 0
        ? (historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length).toFixed(0)
        : null;

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 80, height: 80 }}>
                <svg viewBox="0 0 42 42" style={{ width: '100%', height: '100%' }}>
                    <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                    {segments}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>{formatSignedScore(gtowScore)}</span>
                        <TrendArrow current={gtowScore} previous={previousScore} showPercentage={false} />
                    </div>
                    <span style={{ fontSize: 8, color: '#94a3b8' }}>SCORE</span>
                    {avgScore && (
                        <span style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>
                            avg: {avgScore}
                        </span>
                    )}
                </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Accuracy Breakdown</span>
                    {historicalScores.length > 0 && <Sparkline data={historicalScores} color="#3b82f6" />}
                </div>
                {Object.entries(counts || {}).filter(([_, c]) => c > 0).map(([key, count]) => (
                    <div
                        key={key}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            color: '#e2e8f0',
                            padding: '2px 0',
                            transition: 'all 0.2s',
                            opacity: hoveredSegment === null || hoveredSegment === key ? 1 : 0.5
                        }}
                        onMouseEnter={() => setHoveredSegment(key)}
                        onMouseLeave={() => setHoveredSegment(null)}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[key] }} />
                            {key.toUpperCase()}
                        </span>
                        <span>{Math.round((count / total) * 100)}% ({count})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// F14: ACCURACY BY POSITION CHART
export function AccuracyByPositionChart({ handHistory = [], previousStats = null, historicalData = [] }) {
    const [hoveredPos, setHoveredPos] = useState(null);

    if (!handHistory || handHistory.length === 0) return null;

    const posStats = {};
    handHistory.forEach(h => {
        const pos = h.handData?.heroPosition || 'UNK';
        if (!posStats[pos]) posStats[pos] = { correct: 0, total: 0 };
        posStats[pos].total++;
        if (h.isCorrect) posStats[pos].correct++;
    });

    const positions = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
    const data = positions.map(p => ({
        pos: p,
        ...posStats[p] || { correct: 0, total: 0 }
    })).filter(d => d.total > 0);

    if (data.length === 0) return null;

    // Calculate average accuracy for comparison
    const avgAccuracy = data.length > 0
        ? Math.round(data.reduce((sum, d) => sum + (d.correct / d.total * 100), 0) / data.length)
        : 0;

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Positional Accuracy</span>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 'normal' }}>
                    Session avg: {avgAccuracy}%
                </span>
            </div>
            <div style={{ display: 'flex', gap: 8, height: 100, alignItems: 'flex-end', justifyContent: 'space-between' }}>
                {data.map(d => {
                    const acc = Math.round((d.correct / d.total) * 100) || 0;
                    const h = Math.max(10, (acc / 100) * 60);
                    const prevAcc = previousStats?.[d.pos] ? Math.round((previousStats[d.pos].correct / previousStats[d.pos].total) * 100) : null;
                    const posHistory = historicalData.filter(item => item.pos === d.pos).map(item => item.accuracy);

                    return (
                        <div
                            key={d.pos}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 4,
                                flex: 1,
                                cursor: 'pointer',
                                transition: 'transform 0.2s',
                                transform: hoveredPos === d.pos ? 'scale(1.05)' : 'scale(1)'
                            }}
                            onMouseEnter={() => setHoveredPos(d.pos)}
                            onMouseLeave={() => setHoveredPos(null)}
                        >
                            <Tooltip
                                content={`${d.pos}: ${acc}% (${d.correct}/${d.total} hands)`}
                                visible={hoveredPos === d.pos}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <span style={{ fontSize: 9, color: acc >= 80 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444' }}>
                                        {acc}%
                                    </span>
                                    <TrendArrow current={acc} previous={prevAcc} showPercentage={false} />
                                </div>
                            </Tooltip>
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: h }}
                                transition={{ duration: 0.8 }}
                                style={{
                                    width: '100%',
                                    maxWidth: 24,
                                    background: acc >= 80 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444',
                                    borderRadius: '4px 4px 0 0',
                                    opacity: hoveredPos === null || hoveredPos === d.pos ? 1 : 0.5
                                }}
                            />
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 'bold' }}>{d.pos}</span>
                            {posHistory.length > 0 && (
                                <Sparkline data={posHistory} color={acc >= 80 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444'} height={12} width={28} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// F4: EV LOSS GRAPH
export function EVLossGraph({ handHistory = [], avgEvLoss = null }) {
    const [hoveredHand, setHoveredHand] = useState(null);

    if (!handHistory || handHistory.length === 0) return null;

    const maxLoss = Math.max(0.1, ...handHistory.map(h => h.evLoss || 0));
    const totalLoss = handHistory.reduce((sum, h) => sum + (h.evLoss || 0), 0);
    const sessionAvgLoss = (totalLoss / handHistory.length).toFixed(2);

    // Historical EV loss trend for sparkline
    const evLossHistory = handHistory.map(h => h.evLoss || 0);

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>EV Loss Timeline</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 'normal' }}>
                        Session: -{sessionAvgLoss}
                        {avgEvLoss && (
                            <>
                                {' | '}Avg: -{avgEvLoss.toFixed(2)}
                                <TrendArrow current={parseFloat(sessionAvgLoss)} previous={avgEvLoss} showPercentage={false} />
                            </>
                        )}
                    </span>
                    <Sparkline data={evLossHistory} color="#ef4444" height={14} width={50} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: 2, height: 60, alignItems: 'flex-start' }}>
                {handHistory.map((h, i) => {
                    const loss = h.evLoss || 0;
                    const hPx = Math.max(2, (loss / maxLoss) * 60);
                    return (
                        <Tooltip
                            key={i}
                            content={`Hand ${h.handNumber || i + 1}: -${loss.toFixed(2)} EV`}
                            visible={hoveredHand === i}
                        >
                            <motion.div
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.5, delay: i * 0.02 }}
                                style={{
                                    flex: 1,
                                    height: hPx,
                                    background: loss > 0 ? '#ef4444' : '#22c55e',
                                    opacity: hoveredHand === null || hoveredHand === i ? (loss > 0 ? 1 : 0.3) : 0.2,
                                    borderRadius: '0 0 2px 2px',
                                    transformOrigin: 'top',
                                    cursor: 'pointer',
                                    transition: 'opacity 0.2s'
                                }}
                                onMouseEnter={() => setHoveredHand(i)}
                                onMouseLeave={() => setHoveredHand(null)}
                            />
                        </Tooltip>
                    );
                })}
            </div>
        </div>
    );
}

// F13: DAILY CHALLENGE BANNER
export function DailyChallengeBanner({ gtowScore }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                marginBottom: 16, padding: '12px 16px',
                background: 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(14,116,144,0.4))',
                borderRadius: 10, border: '1px solid rgba(8,145,178,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}
        >
            <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#00d4ff' }}>Daily Study Goal</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Complete 1 session with a +70% score</div>
            </div>
            {/* GTOW parity #25: the goal threshold was 85 on the legacy 0-100
                scale. gtowScore is now signed -100..+100, where 85 maps to 70. */}
            {gtowScore >= 70 ? (
                <div style={{ padding: '4px 10px', background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderRadius: 12, fontSize: 11, fontWeight: 'bold', border: '1px solid rgba(34,197,94,0.4)' }}>
                    ✓ COMPLETED
                </div>
            ) : (
                <div style={{ padding: '4px 10px', background: 'rgba(0,0,0,0.3)', color: '#94a3b8', borderRadius: 12, fontSize: 11, fontWeight: 'bold' }}>
                    IN PROGRESS
                </div>
            )}
        </motion.div>
    );
}
