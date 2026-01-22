/**
 * 🎮 GOD MODE ARENA — Premium Training UI
 * ═══════════════════════════════════════════════════════════════════════════
 * VERTICAL portrait layout matching the golden reference design.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Vertical seat positions (portrait layout - hero at bottom)
const SEATS = [
    { id: 'v4', x: 35, y: 6, name: 'Villain 4' },
    { id: 'v5', x: 65, y: 6, name: 'Villain 5' },
    { id: 'v3', x: 12, y: 18, name: 'Villain 3' },
    { id: 'v6', x: 88, y: 18, name: 'Villain 6' },
    { id: 'v2', x: 6, y: 38, name: 'Villain 2' },
    { id: 'v7', x: 94, y: 38, name: 'Villain 7' },
    { id: 'v1', x: 15, y: 58, name: 'Villain 1' },
    { id: 'v8', x: 85, y: 58, name: 'Villain 8' },
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

const DEFAULT_STACKS = [32, 28, 55, 41, 38, 62, 29, 51];

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS = { s: '#1a1a2e', h: '#e63946', d: '#3b82f6', c: '#22c55e' };

// Parse card string like "Ah" -> { rank: "A", suit: "h", symbol: "♥", color: "#e63946" }
function parseCard(card) {
    if (!card || card === '??' || card.length < 2) return null;
    const rank = card.slice(0, -1);
    const suit = card.slice(-1).toLowerCase();
    return { rank, suit, symbol: SUIT_SYMBOLS[suit], color: SUIT_COLORS[suit] };
}

// Split hero hand "AhKs" into ["Ah", "Ks"]
function splitHand(hand) {
    if (!hand || hand.length < 4) return ['??', '??'];
    return [hand.slice(0, 2), hand.slice(2, 4)];
}

// Split board "Jh7s2d" into ["Jh", "7s", "2d"]
function splitBoard(board) {
    if (!board) return [];
    const cards = [];
    for (let i = 0; i < board.length; i += 2) {
        if (i + 1 < board.length) {
            cards.push(board.slice(i, i + 2));
        }
    }
    return cards;
}

// Format action name for display
function formatAction(action) {
    if (!action) return 'Unknown';
    // Handle sizing actions like "b33", "b50", "b66", "b100"
    if (action.startsWith('b') && /^\d+$/.test(action.slice(1))) {
        return `Bet ${action.slice(1)}%`;
    }
    if (action === 'c') return 'Check';
    if (action === 'f') return 'Fold';
    if (action === 'x') return 'Check';
    if (action.toLowerCase() === 'call') return 'Call';
    if (action.toLowerCase() === 'fold') return 'Fold';
    if (action.toLowerCase() === 'check') return 'Check';
    if (action.toLowerCase() === 'raise') return 'Raise';
    if (action.toLowerCase() === 'allin') return 'All-In';
    return action.charAt(0).toUpperCase() + action.slice(1);
}

// Card component
function Card({ card, size = 'medium' }) {
    const parsed = parseCard(card);
    const dims = size === 'small' ? { w: 32, h: 44, fs: 12 } : { w: 44, h: 60, fs: 16 };

    if (!parsed) {
        return (
            <div style={{
                width: dims.w,
                height: dims.h,
                background: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
                borderRadius: 4,
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <span style={{ color: '#64748b', fontSize: dims.fs }}>?</span>
            </div>
        );
    }

    return (
        <div style={{
            width: dims.w,
            height: dims.h,
            background: 'linear-gradient(145deg, #ffffff, #f0f0f0)',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #d1d5db',
        }}>
            <span style={{ fontSize: dims.fs, fontWeight: 'bold', color: parsed.color, lineHeight: 1 }}>
                {parsed.rank}
            </span>
            <span style={{ fontSize: dims.fs + 2, color: parsed.color, lineHeight: 1 }}>
                {parsed.symbol}
            </span>
        </div>
    );
}

// Player seat with avatar
function PlayerSeat({ seat, stack }) {
    return (
        <div style={{
            position: 'absolute',
            left: `${seat.x}%`,
            top: `${seat.y}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 50,
        }}>
            <div style={{ width: 50, height: 55 }}>
                <img
                    src={AVATARS[seat.id]}
                    alt={seat.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            </div>
            <div style={{
                background: 'linear-gradient(180deg, #374151, #1f2937)',
                border: '1px solid #4b5563',
                borderRadius: 4,
                padding: '2px 8px',
                marginTop: -4,
                textAlign: 'center',
            }}>
                <span style={{ display: 'block', fontSize: 9, color: '#9ca3af', lineHeight: 1.2 }}>
                    {seat.name}
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 'bold', color: '#22d3ee', lineHeight: 1.1 }}>
                    {stack} BB
                </span>
            </div>
        </div>
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
    // State
    const [loading, setLoading] = useState(true);
    const [hand, setHand] = useState(null);
    const [handNumber, setHandNumber] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [xp, setXp] = useState(1250);
    const [diamonds, setDiamonds] = useState(500);

    // Timer
    const [timer, setTimer] = useState(15);
    const timerRef = useRef(null);

    // Result
    const [showResult, setShowResult] = useState(false);
    const [lastResult, setLastResult] = useState(null);
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
                setSessionComplete(true);
            }
        } catch (err) {
            console.error('Failed to fetch hand:', err);
        }

        setLoading(false);
    }, [userId, gameId, level]);

    // Submit action
    const submitAction = useCallback(async (actionKey) => {
        if (showResult || !hand) return;

        clearInterval(timerRef.current);

        try {
            const res = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    action: actionKey,
                    handData: hand, // Pass full hand data including solver_node
                }),
            });

            const result = await res.json();

            setLastResult(result);
            setShowResult(true);

            if (result.isCorrect) {
                setCorrectCount(prev => prev + 1);
                setXp(prev => prev + 50);
            }

            // Auto-advance
            setTimeout(() => {
                if (handNumber >= 20) {
                    setSessionComplete(true);
                    onComplete?.({
                        handsPlayed: handNumber,
                        correctAnswers: correctCount + (result.isCorrect ? 1 : 0),
                        accuracy: ((correctCount + (result.isCorrect ? 1 : 0)) / handNumber) * 100,
                        passed: ((correctCount + (result.isCorrect ? 1 : 0)) / handNumber) >= 0.85,
                    });
                } else {
                    fetchHand();
                }
            }, 2500);

        } catch (err) {
            console.error('Failed to submit action:', err);
        }
    }, [hand, showResult, userId, gameId, handNumber, correctCount, onComplete, fetchHand]);

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
                    submitAction('timeout');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [loading, showResult, sessionComplete]);

    // Parse hand data
    const heroCards = hand ? splitHand(hand.hero_hand) : ['??', '??'];
    const boardCards = hand ? splitBoard(hand.board) : [];
    const potSize = hand?.pot_size || 0;
    const heroStack = hand?.hero_stack || 100;
    const heroPosition = hand?.hero_position || 'BTN';
    const villainPosition = hand?.villain_position || 'BB';
    const street = hand?.street || 'Flop';

    // Get available actions from solver_node
    const solverActions = hand?.solver_node?.actions || {};
    const actionKeys = Object.keys(solverActions);

    // Build question text
    const questionText = hand
        ? `You Are ${heroPosition} (Last To Act). ${villainPosition} ${potSize > 6 ? 'Bets' : 'Checks'}. What Is Your Best Move?`
        : 'Loading...';

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
                <div style={{
                    background: 'linear-gradient(135deg, #1a2744, #0f1a2e)',
                    padding: '40px 50px',
                    borderRadius: 20,
                    textAlign: 'center',
                    border: passed ? '3px solid #22c55e' : '3px solid #f97316',
                }}>
                    <div style={{ fontSize: 64 }}>{passed ? '🏆' : '📚'}</div>
                    <h1 style={{ fontSize: 28, color: passed ? '#22c55e' : '#f97316', margin: '16px 0' }}>
                        {passed ? 'LEVEL COMPLETE!' : 'KEEP PRACTICING'}
                    </h1>
                    <div style={{ fontSize: 56, fontWeight: 'bold', color: passed ? '#22c55e' : '#f97316' }}>
                        {accuracy}%
                    </div>
                    <p style={{ color: '#9ca3af', margin: '16px 0 24px' }}>
                        {correctCount}/{handNumber} correct • Need 85% to pass
                    </p>
                    <button
                        onClick={onExit}
                        style={{
                            padding: '12px 32px',
                            fontSize: 16,
                            fontWeight: 'bold',
                            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                            border: 'none',
                            borderRadius: 10,
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        Continue
                    </button>
                </div>
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
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.6)',
                borderBottom: '1px solid #1e293b',
            }}>
                <button onClick={onExit} style={{
                    background: '#0891b2',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    ← Back to Training
                </button>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 1, textTransform: 'uppercase' }}>
                    {gameName || 'Training'}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 'bold' }}>
                    <span style={{ color: '#fbbf24' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#22d3ee' }}>💎 {diamonds}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div style={{ padding: '10px 12px' }}>
                <div style={{
                    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                    border: '2px solid rgba(34, 211, 238, 0.5)',
                    borderRadius: 10,
                    padding: '10px 16px',
                    textAlign: 'center',
                }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: '600', color: '#e0f2fe', lineHeight: 1.4 }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* TABLE AREA - VERTICAL LAYOUT */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {/* Poker Table - Vertical Oval */}
                <div style={{
                    position: 'absolute',
                    top: '5%',
                    left: '15%',
                    right: '15%',
                    bottom: '20%',
                }}>
                    {/* Outer dark rail */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0d0d0d 100%)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
                    }}>
                        {/* Gold outer ring */}
                        <div style={{
                            position: 'absolute',
                            inset: 8,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #FFE066, #FFD700, #FFA500, #CC8800)',
                        }}>
                            {/* Dark inner section */}
                            <div style={{
                                position: 'absolute',
                                inset: 4,
                                borderRadius: '50%',
                                background: 'linear-gradient(180deg, #262626, #1a1a1a, #0f0f0f)',
                            }}>
                                {/* Gold inner ring */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 6,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #FFD700, #FFA500, #996600)',
                                }}>
                                    {/* Dark felt */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 3,
                                        borderRadius: '50%',
                                        background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0f0f0f 40%, #050505 100%)',
                                    }}>
                                        {/* POT */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '8%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: 'rgba(0,0,0,0.8)',
                                            borderRadius: 8,
                                            padding: '3px 10px',
                                        }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1px solid #fca5a5' }} />
                                            <span style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>POT {potSize}</span>
                                        </div>

                                        {/* Game title */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '45%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#333' }}>
                                                {gameName}
                                            </div>
                                            <div style={{ fontSize: 8, color: '#8b6914' }}>Smarter.Poker</div>
                                        </div>

                                        {/* Board cards */}
                                        {boardCards.length > 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '22%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                display: 'flex',
                                                gap: 3,
                                            }}>
                                                {boardCards.map((card, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ y: -15, opacity: 0 }}
                                                        animate={{ y: 0, opacity: 1 }}
                                                        transition={{ delay: i * 0.08 }}
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

                {/* Villain seats */}
                {SEATS.map((seat, i) => (
                    <PlayerSeat key={seat.id} seat={seat} stack={DEFAULT_STACKS[i]} />
                ))}

                {/* Hero area */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '8%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 100,
                }}>
                    {/* Hero avatar */}
                    <div style={{ width: 60, height: 66, marginBottom: -8 }}>
                        <img
                            src={AVATARS.hero}
                            alt="Hero"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    </div>
                    {/* Hero badge */}
                    <div style={{
                        background: 'linear-gradient(180deg, #FFD700, #FFA500, #CC8800)',
                        border: '2px solid #996600',
                        borderRadius: 6,
                        padding: '3px 14px 5px',
                        textAlign: 'center',
                        minWidth: 60,
                    }}>
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 'bold', color: '#000' }}>Hero</span>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 'bold', color: '#000' }}>{heroStack} BB</span>
                    </div>
                </div>

                {/* Hero cards */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '26%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 4,
                    zIndex: 150,
                }}>
                    {heroCards.map((card, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: 20, opacity: 0, rotate: i === 0 ? -8 : 8 }}
                            animate={{ y: 0, opacity: 1, rotate: i === 0 ? -5 : 5 }}
                            transition={{ delay: 0.2 + i * 0.1 }}
                        >
                            <Card card={card} />
                        </motion.div>
                    ))}
                </div>

                {/* Dealer button */}
                <div style={{
                    position: 'absolute',
                    left: '58%',
                    bottom: '32%',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '2px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 'bold',
                    zIndex: 200,
                }}>
                    D
                </div>

                {/* Timer */}
                <div style={{
                    position: 'absolute',
                    left: 12,
                    bottom: 12,
                    width: 44,
                    height: 44,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 16px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* Question counter */}
                <div style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    background: 'rgba(30,30,40,0.95)',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    padding: '5px 10px',
                    color: '#e5e7eb',
                    fontSize: 11,
                }}>
                    Question {handNumber} of 20
                </div>

                {/* Result overlay */}
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
                                    ? 'rgba(34, 197, 94, 0.92)'
                                    : 'rgba(239, 68, 68, 0.92)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 300,
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                style={{ fontSize: 64 }}
                            >
                                {lastResult.isCorrect ? '✅' : '❌'}
                            </motion.div>
                            <h2 style={{ fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 12 }}>
                                {lastResult.isCorrect ? 'CORRECT!' : 'INCORRECT'}
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, maxWidth: 300, textAlign: 'center', marginTop: 8 }}>
                                {lastResult.feedback || (lastResult.isCorrect ? 'Great play!' : `${formatAction(lastResult.gtoAction)} was optimal`)}
                            </p>
                            {lastResult.isCorrect && (
                                <p style={{ color: '#fcd34d', fontSize: 16, fontWeight: 'bold', marginTop: 8 }}>+50 XP</p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ACTION BUTTONS */}
            {!showResult && !loading && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 6,
                    padding: '10px 12px 20px',
                    background: 'rgba(0,0,0,0.4)',
                }}>
                    {actionKeys.length > 0 ? (
                        actionKeys.slice(0, 4).map((actionKey) => (
                            <button
                                key={actionKey}
                                onClick={() => submitAction(actionKey)}
                                style={{
                                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '12px',
                                    color: 'white',
                                    fontSize: 13,
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                }}
                            >
                                {formatAction(actionKey)}
                            </button>
                        ))
                    ) : (
                        // Fallback buttons if no solver actions
                        ['Fold', 'Call', 'Raise', 'All-In'].map((label) => (
                            <button
                                key={label}
                                onClick={() => submitAction(label.toLowerCase())}
                                style={{
                                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '12px',
                                    color: 'white',
                                    fontSize: 13,
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                }}
                            >
                                {label}
                            </button>
                        ))
                    )}
                </div>
            )}

            {/* Loading overlay */}
            {loading && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 400,
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
