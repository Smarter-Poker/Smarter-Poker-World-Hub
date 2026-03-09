/**
 * 🎰 RAKE-AWARE SOLUTIONS — Custom Rake Strategy Viewer
 * ═══════════════════════════════════════════════════════════════════════════
 * Study how rake changes optimal strategy. Select a rake structure and
 * see how opening ranges, 3-bet frequencies, and postflop aggression shift.
 *
 * Route: /hub/training/rake-solutions
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAccessToken } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// RAKE STRUCTURE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

const RAKE_PRESETS = [
    { id: 'no-rake', label: 'No Rake', pct: 0, cap: 0, desc: 'Pure GTO (freeroll/private)', color: '#22c55e' },
    { id: 'micro-5-1', label: 'Micros 5%/$1', pct: 5, cap: 1, desc: '2NL-10NL online', color: '#3b82f6' },
    { id: 'low-5-3', label: 'Low 5%/$3', pct: 5, cap: 3, desc: '25NL-50NL online', color: '#8b5cf6' },
    { id: 'mid-5-5', label: 'Mid 5%/$5', pct: 5, cap: 5, desc: '100NL-200NL online', color: '#f59e0b' },
    { id: 'live-10-5', label: 'Live 10%/$5', pct: 10, cap: 5, desc: 'Live $1/$2 casino', color: '#ef4444' },
    { id: 'live-5-15', label: 'Live 5%/$15', pct: 5, cap: 15, desc: 'Live $2/$5 casino', color: '#ec4899' },
];

// Baseline GTO frequencies (no-rake) by position
const BASELINE_FREQS = {
    UTG: { rfi: 15, fold3bet: 55, threeBet: 3, cbet: 60 },
    HJ: { rfi: 18, fold3bet: 50, threeBet: 5, cbet: 62 },
    CO: { rfi: 27, fold3bet: 45, threeBet: 7, cbet: 65 },
    BTN: { rfi: 48, fold3bet: 40, threeBet: 10, cbet: 70 },
    SB: { rfi: 36, fold3bet: 42, threeBet: 12, cbet: 55 },
    BB: { rfi: 0, fold3bet: 38, threeBet: 14, cbet: 48 },
};

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STATS = [
    { key: 'rfi', label: 'RFI %', desc: 'Raise First In', icon: '🎯' },
    { key: 'fold3bet', label: 'Fold to 3-Bet', desc: 'Fold vs 3-Bet %', icon: '📉' },
    { key: 'threeBet', label: '3-Bet %', desc: '3-Bet Frequency', icon: '🚀' },
    { key: 'cbet', label: 'C-Bet %', desc: 'Continuation Bet', icon: '💰' },
];

// ═══════════════════════════════════════════════════════════════════════════
// RAKE ADJUSTMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function adjustForRake(baseline, rakePct, rakeCap) {
    // Higher rake → tighter play, less multiway, more fold to 3-bets
    const rakePressure = (rakePct / 5) * Math.min(rakeCap / 3, 2); // normalized 0-2 scale
    return {
        rfi: Math.max(5, Math.round(baseline.rfi - rakePressure * 3.5)),
        fold3bet: Math.min(75, Math.round(baseline.fold3bet + rakePressure * 4)),
        threeBet: Math.max(1, Math.round(baseline.threeBet - rakePressure * 1.5)),
        cbet: Math.max(35, Math.round(baseline.cbet - rakePressure * 2.5)),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function FreqBar({ value, maxVal = 80, color, label }) {
    const width = Math.min(100, (value / maxVal) * 100);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: '#94a3b8', textAlign: 'right' }}>{label}</div>
            <div style={{ flex: 1, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative' }}>
                <motion.div animate={{ width: `${width}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{ height: '100%', background: color, borderRadius: 4 }} />
            </div>
            <div style={{ width: 32, fontSize: 12, fontWeight: 800, color }}>{value}%</div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function RakeSolutionsPage() {
    const router = useRouter();
    useTrainingBus('rake-solutions');

    const [activeRake, setActiveRake] = useState(RAKE_PRESETS[0]);
    const [compareRake, setCompareRake] = useState(null);
    const [selectedPosition, setSelectedPosition] = useState('BTN');

    // Compute adjusted frequencies
    const adjustedFreqs = useMemo(() => {
        const result = {};
        POSITIONS.forEach(pos => {
            result[pos] = adjustForRake(BASELINE_FREQS[pos], activeRake.pct, activeRake.cap);
        });
        return result;
    }, [activeRake]);

    const compareFreqs = useMemo(() => {
        if (!compareRake) return null;
        const result = {};
        POSITIONS.forEach(pos => {
            result[pos] = adjustForRake(BASELINE_FREQS[pos], compareRake.pct, compareRake.cap);
        });
        return result;
    }, [compareRake]);

    const handleViewInsight = () => {
        try {
            const token = getAccessToken();
            if (token) {
                fetch('/api/training/save-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ gameId: 'rake-solutions', questionsAnswered: 1, questionsCorrect: 1, accuracy: 100 }),
                });
            }
            eventBus.emit(EventType.SESSION_END, { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 }, 'rake-solutions');
            eventBus.emit('training:session-complete', { game_id: 'rake-solutions', accuracy: 100, correct_answers: 1, total_questions: 1, hands_played: 1 });
        } catch (e) { }
    };

    return (
        <>
            <Head><title>Rake Solutions | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", paddingBottom: 60 }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Rake-Aware Solutions</div><div style={{ fontSize: 11, color: '#64748b' }}>How rake changes optimal strategy</div></div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
                    {/* Rake Selector */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Select Rake Structure</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
                        {RAKE_PRESETS.map(rk => (
                            <motion.button key={rk.id} whileTap={{ scale: 0.97 }}
                                onClick={() => { setActiveRake(rk); handleViewInsight(); }}
                                style={{
                                    padding: 16, borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                                    background: activeRake.id === rk.id ? `${rk.color}15` : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${activeRake.id === rk.id ? `${rk.color}55` : 'rgba(255,255,255,0.05)'}`,
                                    color: activeRake.id === rk.id ? rk.color : '#94a3b8',
                                }}>
                                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{rk.label}</div>
                                <div style={{ fontSize: 10, color: activeRake.id === rk.id ? `${rk.color}aa` : '#64748b' }}>{rk.desc}</div>
                                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, color: '#e2e8f0' }}>{rk.pct}% / ${rk.cap} cap</div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Compare toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Compare with:</span>
                        <select value={compareRake?.id || ''} onChange={e => setCompareRake(RAKE_PRESETS.find(r => r.id === e.target.value) || null)}
                            style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: 12 }}>
                            <option value="">None</option>
                            {RAKE_PRESETS.filter(r => r.id !== activeRake.id).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                    </div>

                    {/* Position Selector */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto' }}>
                        {POSITIONS.map(p => (
                            <button key={p} onClick={() => setSelectedPosition(p)} style={{
                                padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                background: selectedPosition === p ? activeRake.color : 'rgba(255,255,255,0.04)',
                                color: selectedPosition === p ? '#fff' : '#94a3b8',
                            }}>{p}</button>
                        ))}
                    </div>

                    {/* Frequency Comparisons */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{selectedPosition} — {activeRake.label}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>Optimal frequencies adjusted for rake pressure</div>

                        {STATS.map(stat => {
                            const val = adjustedFreqs[selectedPosition][stat.key];
                            const baseVal = BASELINE_FREQS[selectedPosition][stat.key];
                            const delta = val - baseVal;
                            return (
                                <div key={stat.key} style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>{stat.icon}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{stat.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>GTO: {baseVal}%</span>
                                            {delta !== 0 && (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#4ade80' : '#f87171' }}>
                                                    {delta > 0 ? '+' : ''}{delta}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <FreqBar value={val} color={activeRake.color} label="" />
                                    {compareRake && compareFreqs && (
                                        <FreqBar value={compareFreqs[selectedPosition][stat.key]} color={compareRake.color} label="vs" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Position Overview Grid */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                        All Positions — RFI Adjustment
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {POSITIONS.map(pos => {
                            const val = adjustedFreqs[pos].rfi;
                            const base = BASELINE_FREQS[pos].rfi;
                            const delta = val - base;
                            return (
                                <motion.div key={pos} whileHover={{ scale: 1.03 }} onClick={() => setSelectedPosition(pos)}
                                    style={{
                                        padding: 16, borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                                        background: selectedPosition === pos ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${selectedPosition === pos ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                                    }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{pos}</div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: activeRake.color, marginTop: 4 }}>{val}%</div>
                                    {delta !== 0 && (
                                        <div style={{ fontSize: 10, fontWeight: 700, color: delta > 0 ? '#4ade80' : '#f87171', marginTop: 2 }}>{delta > 0 ? '+' : ''}{delta}%</div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Insight Box */}
                    <div style={{ marginTop: 24, padding: 20, borderRadius: 16, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 8 }}>Strategy Insight</div>
                        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                            {activeRake.pct === 0
                                ? 'Without rake, pure GTO frequencies are optimal. You can play wider ranges and see more flops profitably.'
                                : `With ${activeRake.pct}% rake capped at $${activeRake.cap}, your effective winrate is reduced by approximately ${(activeRake.pct * 0.4).toFixed(1)} bb/100. Tighten opening ranges by ${Math.round(activeRake.pct * 0.7)}%, increase fold-to-3bet, and reduce speculative calls.`}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
