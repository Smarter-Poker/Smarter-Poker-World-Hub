/**
 * 🎮 UNIVERSAL TRAINING TABLE - UNIFIED COMPONENT
 * 
 * Merges the best of both worlds:
 * - Self-contained rendering from shared component
 * - GameManifest integration for 100+ games
 * - Sound integration via SoundEngine
 * - VILLAIN_CARD_POSITION_LAW compliance
 * - Framer Motion animations
 * 
 * Simply pass a gameId and everything works.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getGameMode, type GameMode } from '../../lib/GameManifest';
import { SoundEngine } from '../../audio/SoundEngine';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface UniversalTrainingTableProps {
    gameId: string;
    onComplete?: (correct: boolean, xp: number, diamonds: number) => void;
    onError?: (error: Error) => void;
}

type GameState = 'LOADING' | 'DEALING' | 'PLAYING' | 'FEEDBACK' | 'SUMMARY';

interface HandResult {
    isCorrect: boolean;
    explanation: string;
    gtoAction: string;
    evDiff: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD COMPONENT (Self-Contained CSS)
// ═══════════════════════════════════════════════════════════════════════════

const Card = ({ rank, suit, hidden = false, delay = 0 }: {
    rank: string;
    suit: string;
    hidden?: boolean;
    delay?: number;
}) => {
    const suitSymbols: Record<string, string> = {
        's': '♠', 'h': '♥', 'd': '♦', 'c': '♣',
        '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣'
    };

    const actualSuit = suitSymbols[suit] || suit;
    const isRed = actualSuit === '♥' || actualSuit === '♦';

    if (hidden) {
        return (
            <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay, type: 'spring', stiffness: 300 }}
                style={{
                    width: 56,
                    height: 80,
                    background: 'linear-gradient(135deg, #1e3a5f, #0d2137)',
                    borderRadius: 8,
                    border: '2px solid #3b82f6',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <div style={{
                    width: 40,
                    height: 64,
                    border: '1px solid #3b82f6',
                    borderRadius: 4,
                    opacity: 0.5,
                    background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #3b82f6 2px, #3b82f6 4px)'
                }} />
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay, type: 'spring', stiffness: 300 }}
            style={{
                width: 56,
                height: 80,
                background: 'linear-gradient(135deg, #fff, #f0f0f0)',
                borderRadius: 8,
                border: '1px solid #ccc',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 4,
                color: isRed ? '#dc2626' : '#1e293b',
                fontFamily: 'monospace'
            }}
        >
            <div style={{ fontSize: 16, fontWeight: 700, alignSelf: 'flex-start' }}>{rank}</div>
            <div style={{ fontSize: 24 }}>{actualSuit}</div>
            <div style={{ fontSize: 16, fontWeight: 700, alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>{rank}</div>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR COMPONENT (CSS Fallback)
// ═══════════════════════════════════════════════════════════════════════════

const Avatar = ({ emoji = '😎', isHero = false, label = '', stack = 0 }: {
    emoji?: string;
    isHero?: boolean;
    label?: string;
    stack?: number;
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #475569, #1e293b)',
            border: `3px solid ${isHero ? '#facc15' : '#ef4444'}`,
            boxShadow: `0 0 20px ${isHero ? 'rgba(250,204,21,0.3)' : 'rgba(239,68,68,0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28
        }}>
            {emoji}
        </div>
        {label && (
            <div style={{
                background: isHero ? '#1e293b' : '#dc2626',
                color: isHero ? '#facc15' : '#fff',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                whiteSpace: 'nowrap'
            }}>
                {label}
            </div>
        )}
        {stack > 0 && (
            <div style={{
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 8,
                fontFamily: 'monospace'
            }}>
                {stack} BB
            </div>
        )}
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// GTO EXPLANATIONS
// ═══════════════════════════════════════════════════════════════════════════

const GTO_EXPLANATIONS = {
    fold: {
        correct: "GTO Optimal: Folding preserves your stack. The pot odds don't justify continuing against this range.",
        incorrect: "Suboptimal: GTO suggests continuing here. Your equity justifies calling or raising."
    },
    call: {
        correct: "GTO Optimal: Calling is correct. You have sufficient pot odds against villain's range.",
        incorrect: "Suboptimal: This spot requires a different action. Consider the SPR and range."
    },
    raise: {
        correct: "GTO Optimal: Raising for value is correct. Your hand has strong equity here.",
        incorrect: "Suboptimal: Raising is too aggressive. Your hand plays better as a call or fold."
    },
    'all-in': {
        correct: "GTO Optimal: All-in maximizes fold equity with your stack-to-pot ratio.",
        incorrect: "Suboptimal: All-in overcommits here. Consider a smaller sizing."
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function UniversalTrainingTable({
    gameId,
    onComplete,
    onError
}: UniversalTrainingTableProps) {
    // Game state
    const [gameState, setGameState] = useState<GameState>('LOADING');
    const [handIndex, setHandIndex] = useState(1);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [timeLeft, setTimeLeft] = useState(21);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // LAW 3: Dealer button position
    const [dealerSeat, setDealerSeat] = useState('v7');
    const DEALER_SEATS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'];

    // Hand data
    const [heroCards, setHeroCards] = useState<string[]>(['As', 'Kh']);
    const [villainAction, setVillainAction] = useState('Bets 2.5 BB');
    const [potSize, setPotSize] = useState(5.5);

    // Feedback
    const [lastResult, setLastResult] = useState<HandResult | null>(null);

    // Game mode from manifest
    const gameMode = useMemo((): GameMode | null => {
        try {
            return getGameMode(gameId);
        } catch {
            return null;
        }
    }, [gameId]);

    const totalHands = 20;
    const gameName = gameMode?.name || 'Training Session';

    // ═══════════════════════════════════════════════════════════════════════
    // TIMER
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (gameState === 'PLAYING') {
            timerRef.current = setInterval(() => {
                setTimeLeft(t => {
                    if (t <= 1) {
                        clearInterval(timerRef.current!);
                        handleAction('timeout');
                        return 0;
                    }
                    // LAW 9: Play tick sound for last 5 seconds
                    if (t <= 6) {
                        SoundEngine.play('timerTick');
                        // LAW 9: Play heartbeat every 2 seconds at critical
                        if (t <= 3 && t % 2 === 0) {
                            SoundEngine.play('timerWarning');
                        }
                    }
                    return t - 1;
                });
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [gameState]);

    // ═══════════════════════════════════════════════════════════════════════
    // DEAL NEW HAND
    // ═══════════════════════════════════════════════════════════════════════

    const dealNewHand = useCallback(() => {
        setGameState('DEALING');
        setTimeLeft(21);
        setLastResult(null);

        // Generate random cards
        const suits = ['s', 'h', 'd', 'c'];
        const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7'];
        const c1 = `${ranks[Math.floor(Math.random() * ranks.length)]}${suits[Math.floor(Math.random() * 4)]}`;
        const c2 = `${ranks[Math.floor(Math.random() * ranks.length)]}${suits[Math.floor(Math.random() * 4)]}`;

        setHeroCards([c1, c2]);
        setPotSize(Math.floor(Math.random() * 15) + 3);

        const actions = ['Bets 2.5 BB', 'Raises to 3 BB', 'Shoves All-In', 'Bets 66% Pot'];
        setVillainAction(actions[Math.floor(Math.random() * actions.length)]);

        // Play deal sounds and transition to playing
        setTimeout(() => {
            SoundEngine.play('dealCard');
            setTimeout(() => {
                SoundEngine.play('dealCard');
                setGameState('PLAYING');
            }, 150);
        }, 300);
    }, []);

    // Initial deal
    useEffect(() => {
        const timer = setTimeout(dealNewHand, 500);
        return () => clearTimeout(timer);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLE ACTION
    // ═══════════════════════════════════════════════════════════════════════

    const handleAction = useCallback((action: string) => {
        if (gameState !== 'PLAYING') return;

        // Stop timer
        if (timerRef.current) clearInterval(timerRef.current);

        // Mock GTO check (in real app, this calls ScenarioGenerator)
        const isCorrect = action !== 'timeout' && Math.random() > 0.35;
        const actionKey = action.toLowerCase() as keyof typeof GTO_EXPLANATIONS;
        const explanations = GTO_EXPLANATIONS[actionKey] || GTO_EXPLANATIONS.fold;

        setLastResult({
            isCorrect,
            explanation: isCorrect ? explanations.correct : explanations.incorrect,
            gtoAction: isCorrect ? action : (action === 'fold' ? 'Call' : 'Fold'),
            evDiff: isCorrect ? 0 : -Math.random() * 2
        });

        if (isCorrect) {
            setScore(s => s + 1);
            setStreak(s => s + 1);
            SoundEngine.play('correctAnswer');
        } else {
            setStreak(0);
            SoundEngine.play('wrongAnswer');
        }

        // LAW 4: Play chip stack sound for non-fold actions
        if (action !== 'fold' && action !== 'timeout') {
            SoundEngine.play('chipStack');
        }

        setGameState('FEEDBACK');
    }, [gameState]);

    // ═══════════════════════════════════════════════════════════════════════
    // NEXT HAND
    // ═══════════════════════════════════════════════════════════════════════

    const nextHand = useCallback(() => {
        // LAW 3: Rotate dealer button clockwise
        setDealerSeat(current => {
            const idx = DEALER_SEATS.indexOf(current);
            return DEALER_SEATS[(idx + 1) % DEALER_SEATS.length];
        });

        if (handIndex >= totalHands) {
            setGameState('SUMMARY');
            onComplete?.(score >= totalHands * 0.85, score * 50, score >= totalHands * 0.85 ? 10 : 0);
        } else {
            setHandIndex(h => h + 1);
            dealNewHand();
        }
    }, [handIndex, totalHands, score, dealNewHand, onComplete, DEALER_SEATS]);

    // ═══════════════════════════════════════════════════════════════════════
    // TIMER COLOR
    // ═══════════════════════════════════════════════════════════════════════

    const timerColor = timeLeft > 10 ? '#22c55e' : timeLeft > 5 ? '#f59e0b' : '#ef4444';

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a2e 100%)',
            overflow: 'hidden',
            position: 'relative',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#fff',
            userSelect: 'none'
        }}>
            {/* HEADER HUD */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 56,
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'monospace'
                    }}>
                        HAND {handIndex}/{totalHands}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#facc15' }}>🏆</span>
                        <span style={{ fontWeight: 700, color: '#facc15' }}>{score * 50} XP</span>
                    </div>
                </div>

                {/* STREAK */}
                {streak > 2 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#f97316',
                            fontWeight: 900,
                            fontStyle: 'italic'
                        }}
                    >
                        🔥 {streak} STREAK!
                    </motion.div>
                )}

                {/* TIMER */}
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: `3px solid ${timerColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 700,
                    color: timerColor,
                    boxShadow: `0 0 20px ${timerColor}44`
                }}>
                    {timeLeft}
                </div>
            </div>

            {/* GAME TITLE */}
            <div style={{
                position: 'absolute',
                top: 70,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: 14,
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: 2,
                textTransform: 'uppercase'
            }}>
                {gameName}
            </div>

            {/* TABLE AREA */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 700,
                height: 350,
                background: 'radial-gradient(ellipse at center, #166534 0%, #14532d 50%, #0f3d21 100%)',
                borderRadius: '50%/30%',
                border: '12px solid #1e293b',
                boxShadow: '0 0 60px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {/* POT */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#86efac', fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
                        TOTAL POT
                    </div>
                    <div style={{
                        background: 'rgba(0,0,0,0.4)',
                        padding: '6px 16px',
                        borderRadius: 20,
                        fontFamily: 'monospace',
                        fontSize: 18,
                        fontWeight: 700,
                        border: '1px solid rgba(134, 239, 172, 0.3)'
                    }}>
                        {potSize.toFixed(1)} BB
                    </div>
                </div>

                {/* VILLAIN (TOP) */}
                <div style={{ position: 'absolute', top: -80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Avatar emoji="😈" isHero={false} label={villainAction} stack={45} />
                    <div style={{ display: 'flex', gap: 4 }}>
                        <Card rank="?" suit="?" hidden delay={0.1} />
                        <Card rank="?" suit="?" hidden delay={0.2} />
                    </div>
                </div>

                {/* HERO (BOTTOM) */}
                <div style={{ position: 'absolute', bottom: -100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    {gameState !== 'LOADING' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Card rank={heroCards[0][0]} suit={heroCards[0][1]} delay={0.3} />
                            <Card rank={heroCards[1][0]} suit={heroCards[1][1]} delay={0.4} />
                        </div>
                    )}
                    <Avatar emoji="😎" isHero={true} label="HERO" stack={40} />
                </div>

                {/* LAW 3: DEALER BUTTON */}
                <motion.div
                    key={dealerSeat}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                    style={{
                        position: 'absolute',
                        bottom: dealerSeat === 'v1' ? '10%' : dealerSeat === 'v8' ? '15%' : '80%',
                        right: dealerSeat.includes('v') && parseInt(dealerSeat[1]) <= 4 ? undefined : '15%',
                        left: dealerSeat.includes('v') && parseInt(dealerSeat[1]) <= 4 ? '15%' : undefined,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'linear-gradient(145deg, #fff, #ddd)',
                        border: '3px solid #1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 900,
                        color: '#1a1a1a',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        zIndex: 50
                    }}
                >
                    D
                </motion.div>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 80,
                background: 'rgba(15, 23, 42, 0.95)',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: '0 20px'
            }}>
                {['Fold', 'Call', 'Raise', 'All-In'].map((action, i) => {
                    const colors = ['#64748b', '#3b82f6', '#f59e0b', '#dc2626'];
                    return (
                        <motion.button
                            key={action}
                            onClick={() => handleAction(action.toLowerCase().replace('-', ''))}
                            disabled={gameState !== 'PLAYING'}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                width: 120,
                                height: 48,
                                background: gameState === 'PLAYING'
                                    ? `linear-gradient(135deg, ${colors[i]}, ${colors[i]}cc)`
                                    : '#374151',
                                border: 'none',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: gameState === 'PLAYING' ? 'pointer' : 'not-allowed',
                                opacity: gameState === 'PLAYING' ? 1 : 0.5,
                                boxShadow: gameState === 'PLAYING' ? `0 4px 20px ${colors[i]}44` : 'none'
                            }}
                        >
                            {action}
                        </motion.button>
                    );
                })}
            </div>

            {/* FEEDBACK OVERLAY */}
            <AnimatePresence>
                {gameState === 'FEEDBACK' && lastResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.8)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 200
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            style={{
                                background: lastResult.isCorrect
                                    ? 'linear-gradient(135deg, #14532d, #0f3d21)'
                                    : 'linear-gradient(135deg, #7f1d1d, #450a0a)',
                                border: `2px solid ${lastResult.isCorrect ? '#22c55e' : '#ef4444'}`,
                                borderRadius: 20,
                                padding: 40,
                                maxWidth: 500,
                                textAlign: 'center',
                                boxShadow: `0 0 60px ${lastResult.isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                            }}
                        >
                            <div style={{ fontSize: 64, marginBottom: 16 }}>
                                {lastResult.isCorrect ? '✅' : '❌'}
                            </div>
                            <h2 style={{
                                fontSize: 32,
                                fontWeight: 900,
                                color: lastResult.isCorrect ? '#22c55e' : '#ef4444',
                                marginBottom: 16,
                                textTransform: 'uppercase',
                                letterSpacing: 2
                            }}>
                                {lastResult.isCorrect ? 'CORRECT!' : 'INCORRECT'}
                            </h2>
                            <p style={{
                                fontSize: 16,
                                color: 'rgba(255,255,255,0.8)',
                                lineHeight: 1.6,
                                marginBottom: 24
                            }}>
                                {lastResult.explanation}
                            </p>
                            <motion.button
                                onClick={nextHand}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    padding: '14px 40px',
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                    border: 'none',
                                    borderRadius: 12,
                                    color: '#fff',
                                    fontSize: 18,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(59,130,246,0.4)'
                                }}
                            >
                                NEXT →
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* SUMMARY SCREEN */}
            {gameState === 'SUMMARY' && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(10, 10, 26, 0.98)',
                    backdropFilter: 'blur(20px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 300
                }}>
                    <h1 style={{
                        fontSize: 48,
                        fontWeight: 900,
                        color: '#fff',
                        marginBottom: 24,
                        textTransform: 'uppercase',
                        letterSpacing: 4
                    }}>
                        SESSION COMPLETE
                    </h1>
                    <div style={{
                        fontSize: 120,
                        fontWeight: 900,
                        color: score >= totalHands * 0.85 ? '#22c55e' : score >= totalHands * 0.7 ? '#f59e0b' : '#ef4444',
                        textShadow: `0 0 60px ${score >= totalHands * 0.85 ? '#22c55e' : '#f59e0b'}`,
                        marginBottom: 24
                    }}>
                        {Math.round((score / totalHands) * 100)}%
                    </div>
                    <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', marginBottom: 40 }}>
                        {score}/{totalHands} correct • {score * 50} XP earned
                    </p>
                    <motion.button
                        onClick={() => window.location.reload()}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            padding: '16px 48px',
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 18,
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        PLAY AGAIN
                    </motion.button>
                </div>
            )}
        </div>
    );
}

export default UniversalTrainingTable;
