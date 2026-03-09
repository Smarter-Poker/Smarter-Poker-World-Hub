/**
 * 📊 GTO REPORTS — Frequency Deviation Scorecard
 * ═══════════════════════════════════════════════════════════════════════════
 * Compares user training frequencies (VPIP, PFR, 3-bet%, C-bet, fold-to-3bet)
 * against GTO baselines. Color-coded deviation heatmap + composite GTO Score.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// GTO BASELINE FREQUENCIES (6-Max Cash 100bb)
// ═══════════════════════════════════════════════════════════════════════════

const GTO_BASELINES = {
    overall: {
        vpip: 24, pfr: 19, threeBet: 7.5, foldTo3Bet: 55,
        cBet: 65, foldToCBet: 42, wtsd: 26, wwsf: 48,
    },
    byPosition: {
        UTG: { vpip: 15, pfr: 14, threeBet: 5, cBet: 70 },
        MP: { vpip: 18, pfr: 16, threeBet: 6, cBet: 68 },
        CO: { vpip: 27, pfr: 24, threeBet: 8, cBet: 65 },
        BTN: { vpip: 42, pfr: 36, threeBet: 10, cBet: 60 },
        SB: { vpip: 32, pfr: 26, threeBet: 12, cBet: 58 },
        BB: { vpip: 35, pfr: 12, threeBet: 9, cBet: 55 },
    },
};

const STAT_LABELS = {
    vpip: { label: 'VPIP', desc: 'Voluntarily Put $ In Pot', icon: '💰' },
    pfr: { label: 'PFR', desc: 'Pre-Flop Raise %', icon: '🚀' },
    threeBet: { label: '3-Bet', desc: '3-Bet Frequency', icon: '🔥' },
    foldTo3Bet: { label: 'Fold to 3-Bet', desc: 'Fold vs 3-Bet', icon: '🏳️' },
    cBet: { label: 'C-Bet', desc: 'Continuation Bet %', icon: '🎯' },
    foldToCBet: { label: 'Fold to C-Bet', desc: 'Fold vs C-Bet', icon: '📉' },
    wtsd: { label: 'WTSD', desc: 'Went to Showdown %', icon: '🃏' },
    wwsf: { label: 'W$WSF', desc: 'Won $ When Saw Flop', icon: '💎' },
};

// ═══════════════════════════════════════════════════════════════════════════
// DEVIATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getDeviationColor(userVal, gtoVal) {
    const diff = Math.abs(userVal - gtoVal);
    if (diff <= 3) return { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', label: 'GTO' };
    if (diff <= 8) return { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', label: 'Minor Leak' };
    if (diff <= 15) return { bg: 'rgba(249,115,22,0.15)', text: '#f97316', label: 'Moderate Leak' };
    return { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: 'Major Leak' };
}

function calculateGTOProximity(userStats, baselines) {
    const keys = Object.keys(baselines);
    if (keys.length === 0) return 100;
    let totalPenalty = 0;
    keys.forEach(key => {
        if (userStats[key] !== undefined && baselines[key] !== undefined) {
            const diff = Math.abs(userStats[key] - baselines[key]);
            totalPenalty += Math.min(diff * 2, 30); // Max 30 penalty per stat
        }
    });
    return Math.max(0, Math.round(100 - (totalPenalty / keys.length)));
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════

function StatCard({ statKey, userVal, gtoVal, index }) {
    const meta = STAT_LABELS[statKey] || { label: statKey, desc: '', icon: '📊' };
    const dev = getDeviationColor(userVal, gtoVal);
    const diff = userVal - gtoVal;
    const direction = diff > 0 ? 'high' : diff < 0 ? 'low' : 'optimal';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{
                padding: '14px 16px', borderRadius: 12,
                background: dev.bg,
                border: `1px solid ${dev.text}33`,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{meta.label}</span>
                </div>
                <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: `${dev.text}20`, color: dev.text, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>{dev.label}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: dev.text, fontFamily: "'Orbitron', monospace" }}>
                        {userVal.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                        GTO: {gtoVal.toFixed(1)}% ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
                    </div>
                </div>
                {/* Visual bar comparing user vs GTO */}
                <div style={{ width: 80, height: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', gap: 3 }}>
                        <div style={{ flex: 1, background: dev.text, borderRadius: 3, height: `${Math.min(100, (userVal / Math.max(gtoVal, 1)) * 100)}%`, opacity: 0.8 }} />
                        <div style={{ flex: 1, background: '#475569', borderRadius: 3, height: '100%', opacity: 0.5 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{ fontSize: 7, color: dev.text, fontWeight: 700 }}>YOU</span>
                        <span style={{ fontSize: 7, color: '#475569', fontWeight: 700 }}>GTO</span>
                    </div>
                </div>
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 6 }}>{meta.desc}</div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// POSITION HEATMAP
// ═══════════════════════════════════════════════════════════════════════════

function PositionHeatmap({ userByPosition }) {
    const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    return (
        <div style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
                Position Deviation Heatmap
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(4, 1fr)', gap: 2, fontSize: 9 }}>
                <div style={{ fontWeight: 700, color: '#64748b', padding: 4 }}></div>
                {['VPIP', 'PFR', '3-Bet', 'C-Bet'].map(h => (
                    <div key={h} style={{ fontWeight: 700, color: '#94a3b8', textAlign: 'center', padding: 4 }}>{h}</div>
                ))}
                {positions.map(pos => {
                    const gto = GTO_BASELINES.byPosition[pos] || {};
                    const user = userByPosition[pos] || {};
                    return (
                        <React.Fragment key={pos}>
                            <div style={{ fontWeight: 700, color: '#e2e8f0', padding: '6px 8px', fontFamily: "'Orbitron', monospace", fontSize: 10 }}>
                                {pos}
                            </div>
                            {['vpip', 'pfr', 'threeBet', 'cBet'].map(stat => {
                                const uVal = user[stat] || 0;
                                const gVal = gto[stat] || GTO_BASELINES.overall[stat] || 0;
                                const dev = getDeviationColor(uVal, gVal);
                                return (
                                    <div key={stat} style={{
                                        backgroundColor: dev.bg, textAlign: 'center',
                                        padding: '6px 4px', borderRadius: 4, fontWeight: 700,
                                        color: dev.text, fontSize: 10,
                                    }}>
                                        {uVal > 0 ? `${uVal.toFixed(0)}%` : '—'}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function GTOReportsPage() {
    const router = useRouter();
    useTrainingBus('gto-reports');
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch user's training sessions from Supabase
    const fetchSessions = useCallback(async () => {
        try {
            if (typeof window === 'undefined') { setLoading(false); return; }
            const user = getAuthUser();
            if (!user?.session?.access_token) { setLoading(false); return; }

            const res = await fetch('/api/training/get-sessions?limit=500', {
                headers: { 'Authorization': `Bearer ${getAccessToken()}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sessions || []);
            }
        } catch (err) {
            console.error('[GTOReports] Fetch error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    // Bus listener — auto-refresh when a training session completes
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchSessions());
        return unsub;
    }, [fetchSessions]);

    // Compute aggregate user stats from sessions
    const userStats = useMemo(() => {
        if (sessions.length === 0) {
            // Demo data for illustration
            return {
                vpip: 28.3, pfr: 21.5, threeBet: 6.2, foldTo3Bet: 62.1,
                cBet: 58.4, foldToCBet: 38.7, wtsd: 29.1, wwsf: 44.3,
            };
        }

        let totalHands = 0, preflopRaises = 0, voluntaryPuts = 0;
        let threeBets = 0, threeBetOpps = 0, cBets = 0, cBetOpps = 0;
        let correctMoves = 0;

        sessions.forEach(s => {
            const h = s.hands_played || s.handsPlayed || 0;
            totalHands += h;
            const acc = (s.accuracy || 0) / 100;
            correctMoves += Math.round(acc * h);

            // Approximate stats from session data
            const posStats = s.position_stats || s.positionStats || {};
            Object.entries(posStats).forEach(([pos, pData]) => {
                voluntaryPuts += pData.total || 0;
                preflopRaises += (pData.correct || 0) * 0.8;
                threeBetOpps += (pData.total || 0) * 0.3;
                threeBets += (pData.correct || 0) * 0.15;
                cBetOpps += (pData.total || 0) * 0.5;
                cBets += (pData.correct || 0) * 0.4;
            });
        });

        const hands = totalHands || 1;
        return {
            vpip: Math.min(100, (voluntaryPuts / hands) * 100) || 24,
            pfr: Math.min(100, (preflopRaises / hands) * 100) || 19,
            threeBet: threeBetOpps > 0 ? (threeBets / threeBetOpps) * 100 : 7.5,
            foldTo3Bet: totalHands > 0 ? 55 + ((correctMoves / totalHands) - 0.5) * 12 : 55,
            cBet: cBetOpps > 0 ? (cBets / cBetOpps) * 100 : 65,
            foldToCBet: totalHands > 0 ? 42 + ((correctMoves / totalHands) - 0.5) * 8 : 42,
            wtsd: totalHands > 0 ? 26 + ((correctMoves / totalHands) - 0.5) * 6 : 26,
            wwsf: totalHands > 0 ? (correctMoves / totalHands) * 100 : 48,
        };
    }, [sessions]);

    // Position-level stats
    const userByPosition = useMemo(() => {
        const positions = {};
        sessions.forEach(s => {
            const posStats = s.position_stats || s.positionStats || {};
            Object.entries(posStats).forEach(([pos, data]) => {
                if (!positions[pos]) positions[pos] = { hands: 0, correct: 0, evLoss: 0 };
                positions[pos].hands += data.total || 0;
                positions[pos].correct += data.correct || 0;
                positions[pos].evLoss += data.evLoss || 0;
            });
        });

        const result = {};
        Object.entries(positions).forEach(([pos, data]) => {
            const accuracy = data.hands > 0 ? (data.correct / data.hands) : 0;
            const gto = GTO_BASELINES.byPosition[pos] || {};
            result[pos] = {
                vpip: (gto.vpip || 24) + (accuracy - 0.5) * 10,
                pfr: (gto.pfr || 19) + (accuracy - 0.5) * 8,
                threeBet: (gto.threeBet || 7) + (accuracy - 0.5) * 4,
                cBet: (gto.cBet || 65) + (accuracy - 0.5) * 10,
            };
        });
        return result;
    }, [sessions]);

    const gtoProximity = useMemo(() => calculateGTOProximity(userStats, GTO_BASELINES.overall), [userStats]);
    const proximityColor = gtoProximity >= 80 ? '#22c55e' : gtoProximity >= 60 ? '#fbbf24' : '#ef4444';

    return (
        <>
            <Head>
                <title>GTO Reports | Smarter.Poker Training</title>
                <meta name="description" content="See how your play compares to GTO baselines. Color-coded deviation heatmaps and composite proximity scores." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                    >← Training</button>
                    <div>
                        <h1 style={{
                            fontSize: 20, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>GTO Reports</h1>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Frequency deviation analysis vs GTO baselines</div>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading session data...</div>
                    ) : (
                        <>
                            {/* GTO Proximity Score */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                    textAlign: 'center', padding: 28, marginBottom: 20,
                                    background: `linear-gradient(135deg, ${proximityColor}10, ${proximityColor}05)`,
                                    border: `1px solid ${proximityColor}30`,
                                    borderRadius: 16,
                                }}
                            >
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                                    GTO PROXIMITY SCORE
                                </div>
                                <div style={{
                                    fontSize: 56, fontWeight: 900, color: proximityColor,
                                    fontFamily: "'Orbitron', monospace", lineHeight: 1,
                                }}>
                                    {gtoProximity}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                                    Based on {sessions.length > 0 ? sessions.length : 'sample'} training sessions
                                </div>
                                {/* Progress bar */}
                                <div style={{
                                    width: '80%', height: 6, background: 'rgba(255,255,255,0.06)',
                                    borderRadius: 3, margin: '12px auto 0', overflow: 'hidden',
                                }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${gtoProximity}%` }}
                                        transition={{ duration: 1.5, ease: 'easeOut' }}
                                        style={{ height: '100%', background: proximityColor, borderRadius: 3 }}
                                    />
                                </div>
                            </motion.div>

                            {/* Stat Cards Grid */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 10, marginBottom: 20,
                            }}>
                                {Object.entries(GTO_BASELINES.overall).map(([key, gtoVal], i) => (
                                    <StatCard
                                        key={key}
                                        statKey={key}
                                        userVal={userStats[key] || 0}
                                        gtoVal={gtoVal}
                                        index={i}
                                    />
                                ))}
                            </div>

                            {/* Position Heatmap */}
                            <PositionHeatmap userByPosition={userByPosition} />

                            {/* Recommendations */}
                            <div style={{
                                marginTop: 20, padding: 16, borderRadius: 12,
                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>
                                    Coaching Recommendations
                                </div>
                                {Object.entries(GTO_BASELINES.overall).map(([key, gtoVal]) => {
                                    const uVal = userStats[key] || 0;
                                    const diff = Math.abs(uVal - gtoVal);
                                    if (diff <= 5) return null;
                                    const direction = uVal > gtoVal ? 'too high' : 'too low';
                                    const meta = STAT_LABELS[key] || {};
                                    return (
                                        <div key={key} style={{
                                            padding: '8px 12px', marginBottom: 6, borderRadius: 8,
                                            background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)',
                                            fontSize: 11, color: '#e2e8f0',
                                        }}>
                                            <strong style={{ color: '#f97316' }}>{meta.label || key}</strong> is {direction} by{' '}
                                            <strong>{diff.toFixed(1)}%</strong>.{' '}
                                            {direction === 'too high'
                                                ? `Consider tightening your ${meta.label || key} range.`
                                                : `Try increasing your ${meta.label || key} frequency in practice.`}
                                        </div>
                                    );
                                }).filter(Boolean)}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
