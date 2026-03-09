/**
 * QUICK WARMUP — 5-Minute Speed Session
 * ═══════════════════════════════════════════════════════════════════════════
 * Instant 5-minute timed session — no setup, no choices. Mixes questions
 * from weakest areas + random variety. Designed for pre-session warmups.
 *
 * Route: /hub/training/quick-warmup
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
// WARMUP CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const WARMUP_DURATION = 300; // 5 minutes in seconds
const WARMUP_GAMES = [
    { id: 'cash-preflop', name: 'Preflop Opens' },
    { id: 'cash-bb-defense', name: 'BB Defense' },
    { id: 'cash-cbet', name: 'C-Betting' },
    { id: 'cash-turn-play', name: 'Turn Play' },
    { id: 'cash-river-bluffs', name: 'River Decisions' },
    { id: 'cash-threeBet-spots', name: '3-Bet Pots' },
];

function selectWarmupGame(sessions) {
    if (!sessions || sessions.length === 0) {
        return WARMUP_GAMES[Math.floor(Math.random() * WARMUP_GAMES.length)];
    }

    // Prefer the user's weakest game
    const gameStats = {};
    sessions.forEach(s => {
        const gid = s.game_id || '';
        if (!gameStats[gid]) gameStats[gid] = { hands: 0, correct: 0 };
        gameStats[gid].hands += (s.hands_played || s.total_questions || 0);
        gameStats[gid].correct += (s.correct_count || s.correct_answers || 0);
    });

    let weakest = WARMUP_GAMES[0];
    let lowestAcc = 100;
    WARMUP_GAMES.forEach(g => {
        const st = gameStats[g.id];
        if (st && st.hands > 0) {
            const acc = (st.correct / st.hands) * 100;
            if (acc < lowestAcc) {
                lowestAcc = acc;
                weakest = g;
            }
        }
    });

    return weakest;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function QuickWarmupPage() {
    const router = useRouter();
    useTrainingBus('quick-warmup');
    const [phase, setPhase] = useState('ready'); // ready | playing | results
    const [timeLeft, setTimeLeft] = useState(WARMUP_DURATION);
    const [selectedGame, setSelectedGame] = useState(null);
    const [results, setResults] = useState(null);
    const [sessions, setSessions] = useState([]);
    const timerRef = useRef(null);

    // Fetch user data for weakness detection
    const fetchSessions = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) return;
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=50`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                setSessions(data.sessions);
            }
        } catch (e) {
            console.error('[QuickWarmup] Error:', e);
        }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    // Bus listener
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchSessions());
        return unsub;
    }, [fetchSessions]);

    // Timer countdown
    useEffect(() => {
        if (phase === 'playing') {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timerRef.current);
        }
    }, [phase]);

    // Time's up
    useEffect(() => {
        if (timeLeft === 0 && phase === 'playing') {
            setPhase('results');
        }
    }, [timeLeft, phase]);

    const startWarmup = () => {
        const game = selectWarmupGame(sessions);
        setSelectedGame(game);
        setTimeLeft(WARMUP_DURATION);
        setResults(null);
        setPhase('playing');
    };

    const handleArenaComplete = (arenaResults) => {
        clearInterval(timerRef.current);
        setResults({
            accuracy: arenaResults?.accuracy || 0,
            questionsAnswered: arenaResults?.questionsAnswered || 0,
            timeUsed: WARMUP_DURATION - timeLeft,
            game: selectedGame,
        });
        setPhase('results');
    };

    const handleArenaExit = () => {
        clearInterval(timerRef.current);
        if (timeLeft < WARMUP_DURATION - 10) {
            // User played at least 10 seconds
            setResults({
                accuracy: 0,
                questionsAnswered: 0,
                timeUsed: WARMUP_DURATION - timeLeft,
                game: selectedGame,
            });
            setPhase('results');
        } else {
            setPhase('ready');
        }
    };

    // Active arena with timer overlay
    if (phase === 'playing' && selectedGame) {
        return (
            <div style={{ position: 'relative' }}>
                {/* Timer overlay */}
                <div style={{
                    position: 'fixed', top: 12, right: 12, zIndex: 100,
                    padding: '8px 14px', borderRadius: 10,
                    background: timeLeft <= 30 ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.8)',
                    border: `1px solid ${timeLeft <= 30 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    backdropFilter: 'blur(8px)',
                }}>
                    <div style={{
                        fontSize: 18, fontWeight: 900,
                        color: timeLeft <= 30 ? '#fff' : '#00d4ff',
                        fontFamily: "'Inter', monospace",
                    }}>
                        {formatTime(timeLeft)}
                    </div>
                </div>
                <GodModeArena
                    userId={getAuthUser()?.id || `anon-${Date.now()}`}
                    gameId={selectedGame.id}
                    gameName={`Warmup: ${selectedGame.name}`}
                    level={1}
                    sessionId={`warmup-${Date.now()}`}
                    onComplete={handleArenaComplete}
                    onExit={handleArenaExit}
                />
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Quick Warmup | Smarter.Poker GTO Training</title>
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
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Quick Warmup</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>5-minute speed session</div>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

                    {/* READY STATE */}
                    {phase === 'ready' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{ textAlign: 'center', padding: '40px 20px' }}
                        >
                            <motion.div
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ fontSize: 60, marginBottom: 20 }}
                            >
                                ⚡
                            </motion.div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0', marginBottom: 8 }}>
                                Quick Warmup
                            </div>
                            <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 6 }}>
                                5 minutes. No setup. No choices.
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 30 }}>
                                We&apos;ll auto-pick your weakest area and drill it.
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={startWarmup}
                                style={{
                                    padding: '16px 48px', borderRadius: 14,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #00d4ff, #3b82f6)',
                                    color: '#fff', fontSize: 18, fontWeight: 900,
                                    cursor: 'pointer',
                                    boxShadow: '0 6px 30px rgba(0,212,255,0.3)',
                                    letterSpacing: 0.5,
                                }}
                            >
                                START
                            </motion.button>

                            <div style={{
                                marginTop: 30, padding: '12px', borderRadius: 10,
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                    HOW IT WORKS
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.7 }}>
                                    1. Timer starts at 5:00<br />
                                    2. Answer GTO questions as fast as you can<br />
                                    3. Game auto-selects your weakest area<br />
                                    4. See your speed + accuracy results
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* RESULTS STATE */}
                    {phase === 'results' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ textAlign: 'center', padding: '20px 0' }}
                        >
                            <div style={{ fontSize: 40, marginBottom: 12 }}>
                                {results?.accuracy >= 80 ? '🔥' : results?.accuracy >= 60 ? '👍' : '💪'}
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', marginBottom: 4 }}>
                                Warmup Complete
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 24 }}>
                                {results?.game?.name || 'GTO Training'}
                            </div>

                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24,
                            }}>
                                <div style={{
                                    padding: '16px 10px', borderRadius: 12,
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <div style={{
                                        fontSize: 28, fontWeight: 900,
                                        color: (results?.accuracy || 0) >= 75 ? '#4ade80' : '#fbbf24',
                                    }}>
                                        {results?.accuracy || 0}%
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>ACCURACY</div>
                                </div>
                                <div style={{
                                    padding: '16px 10px', borderRadius: 12,
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#00d4ff' }}>
                                        {results?.questionsAnswered || 0}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>QUESTIONS</div>
                                </div>
                                <div style={{
                                    padding: '16px 10px', borderRadius: 12,
                                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#a855f7' }}>
                                        {formatTime(results?.timeUsed || 0)}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>TIME</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={startWarmup}
                                    style={{
                                        flex: 1, padding: '14px', borderRadius: 12,
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #00d4ff, #3b82f6)',
                                        color: '#fff', fontSize: 14, fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(0,212,255,0.25)',
                                    }}
                                >
                                    Play Again
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => router.push('/hub/training')}
                                    style={{
                                        padding: '14px 20px', borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: '#94a3b8', fontSize: 14, fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Done
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </>
    );
}
