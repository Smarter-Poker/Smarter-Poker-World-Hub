/**
 * TILT GUARD — Emotional Intelligence Coach
 * ═══════════════════════════════════════════════════════════════════════════
 * Monitors training accuracy trends for tilt signals. Detects rapid
 * accuracy drops and provides guided interventions.
 *
 * Route: /hub/training/tilt-guard
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// TILT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const TILT_THRESHOLD = -15; // 15% accuracy drop triggers alert
const MENTAL_TIPS = [
    { title: 'Box Breathing', desc: 'Inhale 4s → Hold 4s → Exhale 4s → Hold 4s. Repeat 4 cycles.', icon: '🧘', color: '#3b82f6' },
    { title: 'Process Over Results', desc: 'Focus on making GTO-correct decisions, not outcomes. Variance is temporary.', icon: '🎯', color: '#22c55e' },
    { title: 'Take a Walk', desc: 'Physical movement resets your nervous system. Even 5 minutes helps.', icon: '🚶', color: '#f97316' },
    { title: 'Reframe the Mistake', desc: 'Every mistake reveals a pattern to fix. More data = faster improvement.', icon: '💡', color: '#a855f7' },
    { title: 'Drink Water', desc: 'Dehydration impairs decision-making by up to 12%. Stay hydrated.', icon: '💧', color: '#06b6d4' },
    { title: 'Set a Stop-Loss', desc: 'Decide in advance: if accuracy drops below 60%, stop for 30 minutes.', icon: '🛑', color: '#ef4444' },
];

const WARMUP_GAMES = [
    { id: 'easy-preflop', name: 'Easy Preflop Warmup', desc: 'Low-stress opening decisions', icon: '🃏' },
    { id: 'easy-math', name: 'Pot Odds Refresher', desc: 'Simple math to rebuild confidence', icon: '🧮' },
    { id: 'easy-position', name: 'Position Review', desc: 'Fundamental seat awareness', icon: '🧭' },
];

function analyzeTiltRisk(sessions) {
    if (!sessions || sessions.length < 3) {
        return { risk: 'none', trend: [], message: 'Not enough data yet', recentAvg: null, previousAvg: null, delta: 0 };
    }

    // Calculate accuracy for recent sessions (last 3) vs previous 3
    const recent = sessions.slice(0, 3);
    const previous = sessions.slice(3, 6);

    const recentAvg = computeAvgAccuracy(recent);
    const previousAvg = previous.length > 0 ? computeAvgAccuracy(previous) : recentAvg;
    const delta = recentAvg - previousAvg;

    // Build trend data (last 10 sessions, reversed for chronological)
    const trend = sessions.slice(0, 10).map(s => {
        const hands = s.hands_played || s.total_questions || 1;
        const correct = s.correct_count || s.correct_answers || 0;
        return {
            accuracy: Math.round((correct / hands) * 100),
            timestamp: new Date(s.created_at).getTime(),
        };
    }).reverse();

    let risk = 'low';
    let message = 'You\'re training at a consistent level.';

    if (delta <= TILT_THRESHOLD) {
        risk = 'high';
        message = `Your accuracy dropped ${Math.abs(Math.round(delta))}% in the last 3 sessions. Take a break or switch to easy drills.`;
    } else if (delta <= -10) {
        risk = 'medium';
        message = `Slight accuracy dip detected (${Math.round(delta)}%). Watch for tilt signs.`;
    } else if (recentAvg >= 80) {
        risk: 'none';
        message = 'You\'re in the zone! Keep going.';
    }

    return { risk, trend, message, recentAvg, previousAvg, delta };
}

function computeAvgAccuracy(sessions) {
    let totalH = 0, totalC = 0;
    sessions.forEach(s => {
        totalH += (s.hands_played || s.total_questions || 0);
        totalC += (s.correct_count || s.correct_answers || 0);
    });
    return totalH > 0 ? Math.round((totalC / totalH) * 100) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BREATHING EXERCISE
// ═══════════════════════════════════════════════════════════════════════════

function BreathingExercise({ onClose }) {
    const [phase, setPhase] = useState('inhale');
    const [cycle, setCycle] = useState(1);
    const [timer, setTimer] = useState(4);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    setPhase(p => {
                        if (p === 'inhale') return 'hold1';
                        if (p === 'hold1') return 'exhale';
                        if (p === 'exhale') return 'hold2';
                        setCycle(c => c + 1);
                        return 'inhale';
                    });
                    return 4;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const phaseLabel = { inhale: 'Breathe In', hold1: 'Hold', exhale: 'Breathe Out', hold2: 'Hold' };
    const phaseColor = { inhale: '#3b82f6', hold1: '#a855f7', exhale: '#22c55e', hold2: '#f97316' };

    if (cycle > 4) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                    padding: '40px 20px', borderRadius: 16, textAlign: 'center',
                    background: 'rgba(34,197,94,0.04)',
                    border: '1px solid rgba(34,197,94,0.15)',
                }}
            >
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', marginBottom: 6 }}>Exercise Complete</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>4 cycles done. Feeling calmer?</div>
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onClose}
                    style={{
                        padding: '10px 24px', borderRadius: 8,
                        border: '1px solid rgba(0,212,255,0.2)',
                        background: 'rgba(0,212,255,0.06)',
                        color: '#00d4ff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Done
                </motion.button>
            </motion.div>
        );
    }

    return (
        <motion.div
            style={{
                padding: '40px 20px', borderRadius: 16, textAlign: 'center',
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${phaseColor[phase]}30`,
            }}
        >
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 8 }}>Cycle {cycle} of 4</div>
            <motion.div
                animate={{
                    scale: phase === 'inhale' ? [1, 1.3] : phase === 'exhale' ? [1.3, 1] : 1.3,
                }}
                transition={{ duration: 4, ease: 'easeInOut' }}
                style={{
                    width: 100, height: 100, borderRadius: '50%', margin: '0 auto 16px',
                    background: `radial-gradient(circle, ${phaseColor[phase]}20, transparent)`,
                    border: `2px solid ${phaseColor[phase]}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <span style={{ fontSize: 32, fontWeight: 900, color: phaseColor[phase] }}>{timer}</span>
            </motion.div>
            <div style={{ fontSize: 20, fontWeight: 800, color: phaseColor[phase] }}>
                {phaseLabel[phase]}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TiltGuardPage() {
    const router = useRouter();
    useTrainingBus('tilt-guard');
    const [loading, setLoading] = useState(true);
    const [tiltData, setTiltData] = useState(null);
    const [showBreathing, setShowBreathing] = useState(false);

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=20`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                setTiltData(analyzeTiltRisk(data.sessions));
            }
        } catch (e) {
            console.error('[TiltGuard] Error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const onSessionComplete = () => fetchData();
        window.addEventListener('training:session-complete', onSessionComplete);
        return () => window.removeEventListener('training:session-complete', onSessionComplete);
    }, [fetchData]);

    const riskColors = { high: '#ef4444', medium: '#fbbf24', low: '#22c55e', none: '#64748b' };
    const riskLabels = { high: 'HIGH TILT RISK', medium: 'MODERATE', low: 'STABLE', none: 'NEUTRAL' };

    return (
        <>
            <Head>
                <title>Tilt Guard | Smarter.Poker GTO Training</title>
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: 'none',
                            color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                            width: 36, height: 36, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        ←
                    </button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Tilt Guard</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Emotional intelligence coach</div>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Loading */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 32, height: 32, margin: '0 auto 12px',
                                    border: '2px solid rgba(255,255,255,0.05)',
                                    borderTopColor: '#a855f7', borderRadius: '50%',
                                }}
                            />
                            Analyzing your emotional patterns...
                        </div>
                    )}

                    {tiltData && !showBreathing && (
                        <>
                            {/* Risk Status */}
                            <motion.div
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    padding: '24px 20px', borderRadius: 16, marginBottom: 20,
                                    background: `linear-gradient(135deg, ${riskColors[tiltData.risk]}08, ${riskColors[tiltData.risk]}02)`,
                                    border: `1px solid ${riskColors[tiltData.risk]}20`,
                                    textAlign: 'center',
                                }}
                            >
                                <div style={{
                                    display: 'inline-block', padding: '4px 12px', borderRadius: 6,
                                    background: `${riskColors[tiltData.risk]}15`,
                                    border: `1px solid ${riskColors[tiltData.risk]}30`,
                                    fontSize: 10, fontWeight: 800, color: riskColors[tiltData.risk],
                                    letterSpacing: 1, marginBottom: 12,
                                }}>
                                    {riskLabels[tiltData.risk]}
                                </div>
                                <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
                                    {tiltData.message}
                                </div>
                                {tiltData.recentAvg !== null && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16,
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
                                                {tiltData.recentAvg}%
                                            </div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>RECENT (3)</div>
                                        </div>
                                        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                                        <div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: '#94a3b8' }}>
                                                {tiltData.previousAvg}%
                                            </div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>PREVIOUS (3)</div>
                                        </div>
                                        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                                        <div>
                                            <div style={{
                                                fontSize: 22, fontWeight: 800,
                                                color: tiltData.delta >= 0 ? '#4ade80' : '#f87171',
                                            }}>
                                                {tiltData.delta >= 0 ? '+' : ''}{Math.round(tiltData.delta)}%
                                            </div>
                                            <div style={{ fontSize: 9, color: '#64748b' }}>DELTA</div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>

                            {/* Trend Chart (simple bar chart) */}
                            {tiltData.trend.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                        ACCURACY TREND (Last {tiltData.trend.length} Sessions)
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                                        {tiltData.trend.map((t, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ height: 0 }}
                                                animate={{ height: `${t.accuracy}%` }}
                                                transition={{ delay: i * 0.05, duration: 0.4 }}
                                                style={{
                                                    flex: 1, borderRadius: 3,
                                                    background: t.accuracy >= 75 ? '#22c55e' : t.accuracy >= 60 ? '#fbbf24' : '#ef4444',
                                                    opacity: 0.7, minHeight: 4,
                                                    position: 'relative',
                                                }}
                                            >
                                                <div style={{
                                                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                                                    fontSize: 8, color: '#475569', fontWeight: 700, whiteSpace: 'nowrap',
                                                }}>
                                                    {t.accuracy}%
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Breathing Exercise CTA */}
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowBreathing(true)}
                                style={{
                                    width: '100%', padding: '14px', borderRadius: 12, marginBottom: 20,
                                    border: '1px solid rgba(59,130,246,0.2)',
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))',
                                    color: '#3b82f6', fontSize: 14, fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                🧘 Start Breathing Exercise
                            </motion.button>

                            {/* Mental Tips */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    MENTAL GAME TIPS
                                </div>
                                {MENTAL_TIPS.map((tip, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.06 }}
                                        style={{
                                            padding: '12px 14px', borderRadius: 10, marginBottom: 6,
                                            background: 'rgba(0,0,0,0.2)',
                                            border: `1px solid ${tip.color}12`,
                                            display: 'flex', alignItems: 'center', gap: 10,
                                        }}
                                    >
                                        <span style={{ fontSize: 18, flexShrink: 0 }}>{tip.icon}</span>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: tip.color }}>{tip.title}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{tip.desc}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Cool Down Drills */}
                            {tiltData.risk === 'high' && (
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                        COOL DOWN DRILLS
                                    </div>
                                    {WARMUP_GAMES.map(game => (
                                        <motion.button
                                            key={game.id}
                                            whileTap={{ scale: 0.97 }}
                                            onClick={() => router.push(`/hub/training/arena/spot-trainer?gameId=${game.id}`)}
                                            style={{
                                                width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 6,
                                                background: 'rgba(34,197,94,0.04)',
                                                border: '1px solid rgba(34,197,94,0.1)',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                cursor: 'pointer', textAlign: 'left',
                                            }}
                                        >
                                            <span style={{ fontSize: 18 }}>{game.icon}</span>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{game.name}</div>
                                                <div style={{ fontSize: 10, color: '#64748b' }}>{game.desc}</div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Breathing Exercise Overlay */}
                    {showBreathing && (
                        <BreathingExercise onClose={() => setShowBreathing(false)} />
                    )}
                </div>
            </div>
        </>
    );
}
