/**
 * 🎮 GOD MODE ARENA — Polished Training UI
 * ═══════════════════════════════════════════════════════════════════════════
 * Integrates the beautiful TrainingGameTable with the God Mode API
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Seat positions around the table
const SEATS = [
    { id: 'hero', x: 50, y: 88, isHero: true, name: 'Hero' },
    { id: 'v1', x: 18, y: 72, name: 'Villain 1' },
    { id: 'v2', x: 6, y: 45, name: 'Villain 2' },
    { id: 'v3', x: 18, y: 18, name: 'Villain 3' },
    { id: 'v4', x: 38, y: 5, name: 'Villain 4' },
    { id: 'v5', x: 62, y: 5, name: 'Villain 5' },
    { id: 'v6', x: 82, y: 18, name: 'Villain 6' },
    { id: 'v7', x: 94, y: 45, name: 'Villain 7' },
    { id: 'v8', x: 82, y: 72, name: 'Villain 8' },
];

const AVATARS = {
    hero: '/avatars/table/free_fox.png',
    v1: '/avatars/table/free_viking.png',
    v2: '/avatars/table/free_wizard.png',
    v3: '/avatars/table/free_ninja.png',
    v4: '/avatars/table/vip_wolf.png',
    v5: '/avatars/table/vip_spartan.png',
    v6: '/avatars/table/vip_pharaoh.png',
    v7: '/avatars/table/free_cowboy.png',
    v8: '/avatars/table/free_pirate.png',
};

const DEFAULT_STACKS = [45, 32, 28, 55, 41, 38, 62, 29, 51];

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS = { s: '#1a1a2e', h: '#ff4757', d: '#3498db', c: '#2ecc71' };

// Format card for display (e.g., "Ah" -> "A♥")
function formatCard(card) {
    if (!card || card === '??') return null;
    const rank = card.slice(0, -1);
    const suit = card.slice(-1).toLowerCase();
    return { rank, suit, symbol: SUIT_SYMBOLS[suit], color: SUIT_COLORS[suit] };
}

// Card component
function Card({ card, size = 'medium' }) {
    const parsed = formatCard(card);
    if (!parsed) {
        return (
            <div style={{
                width: size === 'small' ? 40 : 52,
                height: size === 'small' ? 56 : 72,
                background: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
                borderRadius: 6,
                border: '2px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <span style={{ color: '#64748b', fontSize: 20 }}>?</span>
            </div>
        );
    }

    return (
        <div style={{
            width: size === 'small' ? 40 : 52,
            height: size === 'small' ? 56 : 72,
            background: 'linear-gradient(135deg, #fff, #f8fafc)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #e2e8f0',
        }}>
            <span style={{
                fontSize: size === 'small' ? 16 : 20,
                fontWeight: 'bold',
                color: parsed.color,
                lineHeight: 1,
            }}>
                {parsed.rank}
            </span>
            <span style={{
                fontSize: size === 'small' ? 18 : 24,
                color: parsed.color,
                lineHeight: 1,
            }}>
                {parsed.symbol}
            </span>
        </div>
    );
}

// Player seat component
function PlayerSeat({ seat, stack, isActive }) {
    const size = seat.isHero ? 80 : 70;

    return (
        <motion.div
            style={{
                position: 'absolute',
                left: `${seat.x}%`,
                top: `${seat.y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: seat.isHero ? 100 : 50,
            }}
            animate={isActive ? {
                filter: ['drop-shadow(0 0 20px rgba(255,215,0,0.8))', 'drop-shadow(0 0 40px rgba(255,215,0,1))', 'drop-shadow(0 0 20px rgba(255,215,0,0.8))'],
            } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
        >
            <div style={{ width: size, height: size * 1.1, position: 'relative' }}>
                <img
                    src={AVATARS[seat.id]}
                    alt={seat.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/avatars/table/free_fox.png'; }}
                />
            </div>
            <div style={{
                background: seat.isHero
                    ? 'linear-gradient(180deg, #FFD700, #FFA500, #CC8800)'
                    : 'linear-gradient(180deg, #374151, #1f2937)',
                border: seat.isHero ? '2px solid #996600' : '1px solid #4b5563',
                borderRadius: 6,
                padding: '3px 12px 5px',
                marginTop: -6,
                textAlign: 'center',
                minWidth: 60,
            }}>
                <span style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: seat.isHero ? '#000' : '#9ca3af',
                    lineHeight: 1.2,
                }}>
                    {seat.name}
                </span>
                <span style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 'bold',
                    color: seat.isHero ? '#000' : '#22d3ee',
                    lineHeight: 1.1,
                }}>
                    {stack} BB
                </span>
            </div>
        </motion.div>
    );
}

export default function GodModeArena({
    userId,
    gameId,
    gameName,
    level,
    sessionId,
    onComplete,
    onExit,
}) {
    // Game state
    const [loading, setLoading] = useState(true);
    const [hand, setHand] = useState(null);
    const [handNumber, setHandNumber] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [health, setHealth] = useState(100);
    const [xp, setXp] = useState(0);

    // Timer
    const [timer, setTimer] = useState(15);
    const timerRef = useRef(null);

    // Result state
    const [showResult, setShowResult] = useState(false);
    const [lastResult, setLastResult] = useState(null);

    // Session complete
    const [sessionComplete, setSessionComplete] = useState(false);

    // Fetch next hand
    const fetchHand = useCallback(async () => {
        setLoading(true);
        setShowResult(false);
        setTimer(15);

        try {
            const res = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, gameId, currentLevel: level }),
            });

            const data = await res.json();

            if (data.hand) {
                setHand(data.hand);
                setHandNumber(prev => prev + 1);
            } else {
                // No more hands
                setSessionComplete(true);
            }
        } catch (err) {
            console.error('Failed to fetch hand:', err);
        }

        setLoading(false);
    }, [userId, gameId, level]);

    // Submit action
    const submitAction = useCallback(async (action) => {
        if (showResult || !hand) return;

        // Stop timer
        clearInterval(timerRef.current);

        try {
            const res = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    action,
                    handData: hand,
                }),
            });

            const result = await res.json();

            setLastResult(result);
            setShowResult(true);

            if (result.isCorrect) {
                setCorrectCount(prev => prev + 1);
                setXp(prev => prev + 50);
            } else {
                setHealth(prev => Math.max(0, prev - (result.hpDamage || 10)));
            }

            // Auto-advance after delay
            setTimeout(() => {
                if (handNumber >= 20 || health <= 0) {
                    setSessionComplete(true);
                    onComplete?.({
                        handsPlayed: handNumber,
                        correctAnswers: correctCount + (result.isCorrect ? 1 : 0),
                        accuracy: ((correctCount + (result.isCorrect ? 1 : 0)) / handNumber) * 100,
                        passed: ((correctCount + (result.isCorrect ? 1 : 0)) / handNumber) >= 0.85,
                        finalHealth: health - (result.isCorrect ? 0 : (result.hpDamage || 10)),
                        xpEarned: xp + (result.isCorrect ? 50 : 0),
                    });
                } else {
                    fetchHand();
                }
            }, 2000);

        } catch (err) {
            console.error('Failed to submit action:', err);
        }
    }, [hand, showResult, userId, gameId, handNumber, health, correctCount, xp, onComplete, fetchHand]);

    // Initial fetch
    useEffect(() => {
        fetchHand();
    }, []);

    // Timer countdown
    useEffect(() => {
        if (loading || showResult || sessionComplete) return;

        timerRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    submitAction('TIMEOUT');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [loading, showResult, sessionComplete, submitAction]);

    // Parse hero cards
    const heroCards = hand?.hero_hand ? [
        hand.hero_hand.slice(0, 2),
        hand.hero_hand.slice(2, 4)
    ] : ['??', '??'];

    // Parse board cards
    const boardCards = [];
    if (hand?.board) {
        for (let i = 0; i < hand.board.length; i += 2) {
            boardCards.push(hand.board.slice(i, i + 2));
        }
    }

    // Build question text
    const questionText = hand ?
        `You are ${hand.hero_position || 'SB'} with ${heroCards.join('')}. ${hand.street || 'Flop'}: ${hand.board || 'No board'}. Pot is ${hand.pot_size || 6} BB. What's your action?` :
        'Loading hand...';

    // Get available actions from solver node
    const actions = hand?.solver_node?.actions || {};
    const actionButtons = Object.keys(actions).length > 0
        ? Object.keys(actions).map(a => ({ id: a, label: a.toUpperCase() }))
        : [
            { id: 'fold', label: 'Fold' },
            { id: 'call', label: 'Call' },
            { id: 'raise', label: 'Raise' },
        ];

    // Session complete screen
    if (sessionComplete) {
        const accuracy = handNumber > 0 ? Math.round((correctCount / handNumber) * 100) : 0;
        const passed = accuracy >= 85;

        return (
            <div style={{
                width: '100%',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Inter', sans-serif",
            }}>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{
                        background: 'linear-gradient(135deg, #1a2744, #0f1a2e)',
                        padding: '40px 60px',
                        borderRadius: 24,
                        textAlign: 'center',
                        border: passed ? '3px solid #22c55e' : '3px solid #f97316',
                        boxShadow: passed ? '0 0 60px rgba(34, 197, 94, 0.3)' : '0 0 60px rgba(249, 115, 22, 0.2)',
                    }}
                >
                    <div style={{ fontSize: 72, marginBottom: 16 }}>{passed ? '🏆' : '📚'}</div>
                    <h1 style={{
                        fontSize: 32,
                        fontWeight: 'bold',
                        color: passed ? '#22c55e' : '#f97316',
                        marginBottom: 20,
                    }}>
                        {passed ? 'LEVEL COMPLETE!' : 'KEEP PRACTICING'}
                    </h1>
                    <div style={{ fontSize: 64, fontWeight: 'bold', color: passed ? '#22c55e' : '#f97316' }}>
                        {accuracy}%
                    </div>
                    <p style={{ color: '#9ca3af', marginBottom: 24 }}>
                        {correctCount}/{handNumber} correct • Need 85% to pass
                    </p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button
                            onClick={onExit}
                            style={{
                                padding: '14px 32px',
                                fontSize: 16,
                                fontWeight: 'bold',
                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                border: 'none',
                                borderRadius: 12,
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            Continue
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: '#080810',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden',
        }}>
            {/* HEADER */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 16px',
                background: 'rgba(0,0,0,0.5)',
            }}>
                <button onClick={onExit} style={{
                    background: '#0891b2',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    ← Back to Training
                </button>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#22d3ee', letterSpacing: 1 }}>
                    {gameName?.toUpperCase() || 'TRAINING'}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 'bold' }}>
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}>❤️ {health}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div style={{ padding: '8px 16px' }}>
                <div style={{
                    background: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.6)',
                    borderRadius: 12,
                    padding: '12px 20px',
                    textAlign: 'center',
                }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: '600', color: '#e0f2fe', lineHeight: 1.4 }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* TABLE AREA */}
            <div style={{ flex: 1, position: 'relative', padding: '0 8px' }}>
                {/* Poker Table */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '85%',
                    maxWidth: 500,
                    aspectRatio: '1.6/1',
                }}>
                    {/* Table Layers */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 9999,
                        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0d0d0d 100%)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                    }}>
                        <div style={{
                            position: 'absolute',
                            inset: 8,
                            borderRadius: 9999,
                            background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 30%, #FFA500 60%, #CC8800 100%)',
                        }}>
                            <div style={{
                                position: 'absolute',
                                inset: 4,
                                borderRadius: 9999,
                                background: 'linear-gradient(180deg, #222 0%, #111 100%)',
                            }}>
                                <div style={{
                                    position: 'absolute',
                                    inset: 6,
                                    borderRadius: 9999,
                                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #996600 100%)',
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        inset: 3,
                                        borderRadius: 9999,
                                        background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0f0f0f 50%, #050505 100%)',
                                    }}>
                                        {/* Pot */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '15%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            background: 'rgba(0,0,0,0.8)',
                                            borderRadius: 12,
                                            padding: '4px 12px',
                                        }}>
                                            <span style={{ color: '#FFD700', fontSize: 12, fontWeight: 'bold' }}>
                                                POT {hand?.pot_size || 0}
                                            </span>
                                        </div>

                                        {/* Game Title */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '45%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 14, fontStyle: 'italic', color: '#333' }}>
                                                {gameName}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#8b6914' }}>Smarter.Poker</div>
                                        </div>

                                        {/* Community Cards */}
                                        {boardCards.length > 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '28%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                display: 'flex',
                                                gap: 4,
                                            }}>
                                                {boardCards.map((card, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ y: -20, opacity: 0 }}
                                                        animate={{ y: 0, opacity: 1 }}
                                                        transition={{ delay: i * 0.1 }}
                                                    >
                                                        <Card card={card} size="small" />
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Player Seats */}
                {SEATS.map((seat, i) => (
                    <PlayerSeat
                        key={seat.id}
                        seat={seat}
                        stack={seat.isHero ? (hand?.hero_stack || 100) : DEFAULT_STACKS[i]}
                        isActive={seat.isHero && !showResult && !loading}
                    />
                ))}

                {/* Hero Cards */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '16%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 4,
                    zIndex: 150,
                }}>
                    {heroCards.map((card, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: 30, opacity: 0, rotate: i === 0 ? -8 : 8 }}
                            animate={{ y: 0, opacity: 1, rotate: i === 0 ? -5 : 5 }}
                            transition={{ delay: 0.3 + i * 0.1 }}
                        >
                            <Card card={card} />
                        </motion.div>
                    ))}
                </div>

                {/* Timer */}
                <div style={{
                    position: 'absolute',
                    left: 16,
                    bottom: 16,
                    width: 50,
                    height: 50,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 20px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* Question Counter */}
                <div style={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    background: 'rgba(30,30,40,0.9)',
                    border: '1px solid #444',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: '#f0f0f0',
                    fontSize: 12,
                }}>
                    Question {handNumber} of 20
                </div>

                {/* Result Overlay */}
                <AnimatePresence>
                    {showResult && lastResult && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                background: lastResult.isCorrect
                                    ? 'rgba(34, 197, 94, 0.9)'
                                    : 'rgba(239, 68, 68, 0.9)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 200,
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                style={{ fontSize: 72 }}
                            >
                                {lastResult.isCorrect ? '✅' : '❌'}
                            </motion.div>
                            <h2 style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', marginTop: 16 }}>
                                {lastResult.isCorrect ? 'CORRECT!' : 'INCORRECT'}
                            </h2>
                            {lastResult.isCorrect && (
                                <p style={{ color: '#fcd34d', fontSize: 18 }}>+50 XP</p>
                            )}
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
                                {lastResult.feedback || 'Moving to next hand...'}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ACTION BUTTONS */}
            {!showResult && !loading && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                    padding: '12px 16px 24px',
                }}>
                    {actionButtons.map((btn) => (
                        <button
                            key={btn.id}
                            onClick={() => submitAction(btn.id)}
                            style={{
                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                border: 'none',
                                borderRadius: 8,
                                padding: '14px',
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                            }}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 300,
                }}>
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        style={{ fontSize: 48 }}
                    >
                        🎰
                    </motion.div>
                </div>
            )}
        </div>
    );
}
