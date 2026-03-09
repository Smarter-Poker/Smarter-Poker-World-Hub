/**
 * WEAK SPOT AUTOPILOT — Zero-Decision Training Mode
 * ═══════════════════════════════════════════════════════════════════════════
 * One-click "train my weakest spots" — automatically queues drills
 * targeting your worst performance areas. Zero setup required.
 *
 * Route: /hub/training/autopilot
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const GodModeArena = dynamic(
    () => import('../../../src/components/training/GodModeArena'),
    { ssr: false, loading: () => <div style={{ minHeight: '100vh', background: '#0a0a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading Arena...</div> }
);

// ═══════════════════════════════════════════════════════════════════════════
// WEAK SPOT DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const SPOT_DEFINITIONS = [
    { id: 'bb-preflop', name: 'BB Defense (Preflop)', position: 'BB', street: 'preflop', color: '#3b82f6', icon: '🛡️', gameId: 'cash-bb-defense' },
    { id: 'btn-preflop', name: 'BTN Opens', position: 'BTN', street: 'preflop', color: '#22c55e', icon: '🎯', gameId: 'cash-btn-opens' },
    { id: 'cbet-flop', name: 'C-Betting (Flop)', position: 'any', street: 'flop', color: '#f97316', icon: '💥', gameId: 'cash-cbet' },
    { id: 'turn-barrels', name: 'Turn Barrels', position: 'any', street: 'turn', color: '#a855f7', icon: '🔄', gameId: 'cash-turn-play' },
    { id: 'river-bluffs', name: 'River Decisions', position: 'any', street: 'river', color: '#ef4444', icon: '🏁', gameId: 'cash-river-bluffs' },
    { id: '3bet-pots', name: '3-Bet Pots', position: 'any', street: 'any', color: '#ec4899', icon: '⚡', gameId: 'cash-threeBet-spots' },
    { id: 'sb-play', name: 'SB Strategy', position: 'SB', street: 'preflop', color: '#8b5cf6', icon: '♠️', gameId: 'cash-sb' },
    { id: 'mtt-push', name: 'MTT Push/Fold', position: 'any', street: 'preflop', color: '#fbbf24', icon: '🏆', gameId: 'mtt-push-fold' },
];

function analyzeWeakSpots(sessions) {
    if (!sessions || sessions.length < 3) {
        // Not enough data — return random rotation
        return SPOT_DEFINITIONS.slice(0, 3).map(s => ({ ...s, accuracy: null, evLoss: null, reason: 'Build your training history' }));
    }

    // Group by game pattern
    const spotStats = {};
    sessions.forEach(s => {
        const gameId = (s.game_id || '').toLowerCase();
        SPOT_DEFINITIONS.forEach(spot => {
            if (gameId.includes(spot.position.toLowerCase()) ||
                gameId.includes(spot.street) ||
                gameId.includes(spot.gameId?.split('-').pop() || '')) {

                if (!spotStats[spot.id]) {
                    spotStats[spot.id] = { hands: 0, correct: 0, evLoss: 0 };
                }
                spotStats[spot.id].hands += (s.hands_played || s.total_questions || 0);
                spotStats[spot.id].correct += (s.correct_count || s.correct_answers || 0);
                spotStats[spot.id].evLoss += (s.total_ev_loss || 0);
            }
        });
    });

    // Rank by weakness (low accuracy + high EV loss)
    const ranked = SPOT_DEFINITIONS.map(spot => {
        const stats = spotStats[spot.id];
        if (!stats || stats.hands === 0) {
            return { ...spot, accuracy: null, evLoss: 0, score: 50, reason: 'Not enough data — needs practice' };
        }
        const accuracy = Math.round((stats.correct / stats.hands) * 100);
        const evPerHand = stats.evLoss / stats.hands;
        // Lower accuracy + higher EV loss = higher weakness score
        const score = (100 - accuracy) + (evPerHand * 10);
        return {
            ...spot,
            accuracy,
            evLoss: stats.evLoss,
            hands: stats.hands,
            score,
            reason: accuracy < 60 ? `Only ${accuracy}% — significant leak`
                : accuracy < 75 ? `${accuracy}% — room for improvement`
                    : `${accuracy}% — maintain consistency`,
        };
    }).sort((a, b) => b.score - a.score);

    return ranked.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function AutopilotPage() {
    const router = useRouter();
    useTrainingBus('autopilot');
    const [loading, setLoading] = useState(true);
    const [weakSpots, setWeakSpots] = useState([]);
    const [activeSpot, setActiveSpot] = useState(null);
    const [currentSpotIdx, setCurrentSpotIdx] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [results, setResults] = useState([]);

    const fetchAndAnalyze = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=200`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                const spots = analyzeWeakSpots(data.sessions);
                setWeakSpots(spots);
            }
        } catch (e) {
            console.error('[Autopilot] Fetch error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAndAnalyze(); }, [fetchAndAnalyze]);

    // Bus listener — refresh weak spot analysis when a session completes
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchAndAnalyze());
        return unsub;
    }, [fetchAndAnalyze]);

    const startAutopilot = () => {
        if (weakSpots.length === 0) return;
        setCurrentSpotIdx(0);
        setActiveSpot(weakSpots[0]);
        setIsPlaying(true);
        setResults([]);
    };

    const handleArenaComplete = (arenaResults) => {
        const newResults = [...results, {
            spot: activeSpot,
            accuracy: arenaResults?.accuracy || 0,
            questionsAnswered: arenaResults?.questionsAnswered || 0,
        }];
        setResults(newResults);

        // Move to next spot or finish
        const nextIdx = currentSpotIdx + 1;
        if (nextIdx < weakSpots.length) {
            setCurrentSpotIdx(nextIdx);
            setActiveSpot(weakSpots[nextIdx]);
        } else {
            setIsPlaying(false);
            setActiveSpot(null);
        }
    };

    const handleArenaExit = () => {
        setIsPlaying(false);
        setActiveSpot(null);
    };

    // Active arena
    if (isPlaying && activeSpot) {
        return (
            <GodModeArena
                userId={getAuthUser()?.id || `anon-${Date.now()}`}
                gameId={activeSpot.gameId || 'cash-preflop'}
                gameName={`Autopilot: ${activeSpot.name}`}
                level={1}
                sessionId={`autopilot-${Date.now()}`}
                onComplete={handleArenaComplete}
                onExit={handleArenaExit}
            />
        );
    }

    return (
        <>
            <Head>
                <title>Autopilot | Smarter.Poker GTO Training</title>
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
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                            Weak Spot Autopilot
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            Zero-decision training mode
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Loading */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 40, height: 40, margin: '0 auto 16px',
                                    border: '3px solid rgba(255,255,255,0.05)',
                                    borderTopColor: '#a855f7', borderRadius: '50%',
                                }}
                            />
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Scanning your weaknesses...</div>
                            <div style={{ fontSize: 11 }}>Analyzing session history</div>
                        </div>
                    )}

                    {/* Results Summary (after completing autopilot) */}
                    {!loading && !isPlaying && results.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                padding: '24px 20px', borderRadius: 16, marginBottom: 24,
                                background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(34,197,94,0.02) 100%)',
                                border: '1px solid rgba(34,197,94,0.15)',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', marginBottom: 4 }}>
                                Autopilot Complete
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                                You trained {results.length} weak spots
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${results.length}, 1fr)`, gap: 8 }}>
                                {results.map((r, i) => (
                                    <div key={i} style={{ padding: '10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>
                                        <div style={{ fontSize: 14 }}>{r.spot.icon}</div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: r.accuracy >= 75 ? '#4ade80' : '#fbbf24', marginTop: 4 }}>
                                            {r.accuracy}%
                                        </div>
                                        <div style={{ fontSize: 9, color: '#64748b' }}>{r.spot.name}</div>
                                    </div>
                                ))}
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={startAutopilot}
                                style={{
                                    marginTop: 16, padding: '12px 24px', borderRadius: 10,
                                    border: '1px solid rgba(0,212,255,0.3)',
                                    background: 'linear-gradient(180deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                                    color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                Run Again
                            </motion.button>
                        </motion.div>
                    )}

                    {/* Weak Spots Detected */}
                    {!loading && weakSpots.length > 0 && results.length === 0 && (
                        <>
                            {/* Hero CTA */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                    padding: '32px 20px', borderRadius: 18, marginBottom: 24,
                                    background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                                    border: '1px solid rgba(168,85,247,0.15)',
                                    textAlign: 'center',
                                }}
                            >
                                <motion.div
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    style={{ fontSize: 40, marginBottom: 12 }}
                                >
                                    🧠
                                </motion.div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>
                                    3 Weak Spots Detected
                                </div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
                                    We analyzed your training history and found areas
                                    <br />that need the most attention. One click to start.
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={startAutopilot}
                                    style={{
                                        padding: '14px 40px', borderRadius: 12,
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                                        color: '#fff', fontSize: 15, fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    Start Autopilot
                                </motion.button>
                            </motion.div>

                            {/* Spot Breakdown */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
                                }}>
                                    YOUR WEAK SPOTS
                                </div>
                                {weakSpots.map((spot, i) => (
                                    <motion.div
                                        key={spot.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        style={{
                                            padding: '14px 16px', borderRadius: 12, marginBottom: 8,
                                            background: 'rgba(0,0,0,0.2)',
                                            border: `1px solid ${spot.color}18`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                background: `${spot.color}12`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 18,
                                            }}>
                                                {spot.icon}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: spot.color }}>
                                                    {i + 1}. {spot.name}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                                    {spot.reason}
                                                </div>
                                            </div>
                                        </div>
                                        {spot.accuracy !== null && (
                                            <div style={{
                                                fontSize: 18, fontWeight: 800,
                                                color: spot.accuracy < 60 ? '#ef4444'
                                                    : spot.accuracy < 75 ? '#fbbf24' : '#4ade80',
                                            }}>
                                                {spot.accuracy}%
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* No data state */}
                    {!loading && weakSpots.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                                Need More Data
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                                Complete a few training sessions first so we can identify your weak spots.
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => router.push('/hub/training')}
                                style={{
                                    marginTop: 20, padding: '12px 24px', borderRadius: 10,
                                    border: '1px solid rgba(0,212,255,0.2)',
                                    background: 'rgba(0,212,255,0.06)',
                                    color: '#00d4ff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Start Training
                            </motion.button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
