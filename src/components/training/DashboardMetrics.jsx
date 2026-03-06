import React from 'react';
import { motion } from 'framer-motion';

// F15: CLASSIFICATION DONUT CHART
export function ClassificationDonut({ handHistory = [], gtowScore = 0 }) {
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
    const segments = Object.entries(counts).map(([key, count]) => {
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
                strokeDashoffset={100 - offset + 25} // rotate start to top
            />
        );
    });

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 80, height: 80 }}>
                <svg viewBox="0 0 42 42" style={{ width: '100%', height: '100%' }}>
                    <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                    {segments}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>{gtowScore}</span>
                    <span style={{ fontSize: 8, color: '#94a3b8' }}>SCORE</span>
                </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Accuracy Breakdown</div>
                {Object.entries(counts).filter(([_, c]) => c > 0).map(([key, count]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e2e8f0' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[key] }} />
                            {key.toUpperCase()}
                        </span>
                        <span>{Math.round((count / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// F14: ACCURACY BY POSITION CHART
export function AccuracyByPositionChart({ handHistory = [] }) {
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

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Positional Accuracy</div>
            <div style={{ display: 'flex', gap: 8, height: 80, alignItems: 'flex-end', justifyContent: 'space-between' }}>
                {data.map(d => {
                    const acc = Math.round((d.correct / d.total) * 100) || 0;
                    const h = Math.max(10, (acc / 100) * 60);
                    return (
                        <div key={d.pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                            <span style={{ fontSize: 9, color: acc >= 80 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444' }}>{acc}%</span>
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: h }}
                                transition={{ duration: 0.8 }}
                                style={{ width: '100%', maxWidth: 24, background: acc >= 80 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444', borderRadius: '4px 4px 0 0' }}
                            />
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 'bold' }}>{d.pos}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// F4: EV LOSS GRAPH
export function EVLossGraph({ handHistory = [] }) {
    if (!handHistory || handHistory.length === 0) return null;

    const maxLoss = Math.max(0.1, ...handHistory.map(h => h.evLoss || 0));

    return (
        <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>EV Loss Timeline</div>
            <div style={{ display: 'flex', gap: 2, height: 60, alignItems: 'flex-start' }}>
                {handHistory.map((h, i) => {
                    const loss = h.evLoss || 0;
                    const hPx = Math.max(2, (loss / maxLoss) * 60);
                    return (
                        <motion.div
                            key={i}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: 0.5, delay: i * 0.02 }}
                            style={{
                                flex: 1,
                                height: hPx,
                                background: loss > 0 ? '#ef4444' : '#22c55e',
                                opacity: loss > 0 ? 1 : 0.3,
                                borderRadius: '0 0 2px 2px',
                                transformOrigin: 'top'
                            }}
                            title={`Hand ${h.handNumber}: -${loss.toFixed(2)} EV`}
                        />
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
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Complete 1 session with &gt;85% score</div>
            </div>
            {gtowScore >= 85 ? (
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
