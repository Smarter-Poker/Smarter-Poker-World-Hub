/**
 * 🎮 GOD MODE TRAINING ENGINE — 7-Engine Architecture
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ENGINE 1: Scenario Orchestrator (parse GTO data)
 * ENGINE 2: Visual Engine (ellipse seating, 3D cards)
 * ENGINE 3: GTO Brain (EV loss grading)
 * ENGINE 4: Game Loop (state machine)
 * ENGINE 5: Question Engine (load from god-mode-service)
 * ENGINE 6: Progression Engine (score, streak, level unlock)
 * ENGINE 7: Audio Engine (sound feedback)
 * 
 * HARD RULES:
 * - Hero ALWAYS at bottom center (Index 0)
 * - 100% inline styles (Law AUD-005)
 * - NO blocking DB queries on render
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Game Loop States
const GameState = {
    LOADING: 'LOADING',
    DEALING: 'DEALING',
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    EVALUATING: 'EVALUATING',
    FEEDBACK_OVERLAY: 'FEEDBACK_OVERLAY',
    NEXT_HAND: 'NEXT_HAND',
    LEVEL_COMPLETE: 'LEVEL_COMPLETE'
};

// Verdict Types
const Verdict = {
    PERFECT: 'PERFECT',
    ACCEPTABLE: 'ACCEPTABLE',
    BLUNDER: 'BLUNDER'
};

// Card suits and rendering
const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#1e293b' };

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE 2: VISUAL ENGINE — Seat Position Calculator
// ═══════════════════════════════════════════════════════════════════════════

const getSeatStyle = (index, totalPlayers) => {
    // Hero (index 0) ALWAYS at bottom center = 90 degrees
    const angleStep = (2 * Math.PI) / totalPlayers;
    const offset = Math.PI / 2; // Start Hero at bottom
    const angle = offset + (index * angleStep);

    // Ellipse radii (percentage of table)
    const rx = 40; // Horizontal radius
    const ry = 34; // Vertical radius

    return {
        left: `${50 + rx * Math.cos(angle)}%`,
        top: `${50 + ry * Math.sin(angle)}%`,
        transform: 'translate(-50%, -50%)'
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE 7: AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const useAudioEngine = () => {
    const audioContext = useRef(null);

    const initAudio = useCallback(() => {
        if (!audioContext.current && typeof window !== 'undefined') {
            audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
        }
    }, []);

    const playTone = useCallback((freq, duration, type = 'sine') => {
        if (!audioContext.current) return;
        const osc = audioContext.current.createOscillator();
        const gain = audioContext.current.createGain();
        osc.connect(gain);
        gain.connect(audioContext.current.destination);
        osc.frequency.value = freq;
        osc.type = type;
        gain.gain.setValueAtTime(0.1, audioContext.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + duration);
        osc.start();
        osc.stop(audioContext.current.currentTime + duration);
    }, []);

    const playCardFlip = useCallback(() => playTone(800, 0.08, 'triangle'), [playTone]);
    const playChips = useCallback(() => playTone(1200, 0.05, 'square'), [playTone]);
    const playSuccess = useCallback(() => {
        playTone(523, 0.1); // C5
        setTimeout(() => playTone(659, 0.1), 100); // E5
        setTimeout(() => playTone(784, 0.15), 200); // G5
    }, [playTone]);
    const playError = useCallback(() => playTone(200, 0.3, 'sawtooth'), [playTone]);

    return { initAudio, playCardFlip, playChips, playSuccess, playError };
};

// ═══════════════════════════════════════════════════════════════════════════
// 3D CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const Card3D = ({ card, isFlipped = false, delay = 0, size = 'normal' }) => {
    const [flipped, setFlipped] = useState(!isFlipped);

    useEffect(() => {
        if (isFlipped) {
            const timer = setTimeout(() => setFlipped(true), delay);
            return () => clearTimeout(timer);
        }
    }, [isFlipped, delay]);

    const isFaceUp = card && card !== '??' && flipped;
    const rank = isFaceUp ? card[0].toUpperCase() : '';
    const suit = isFaceUp ? card[1].toLowerCase() : '';
    const suitSymbol = SUIT_SYMBOLS[suit] || '';
    const suitColor = SUIT_COLORS[suit] || '#000';

    const cardWidth = size === 'small' ? 40 : size === 'large' ? 70 : 56;
    const cardHeight = cardWidth * 1.4;

    return (
        <div style={{
            width: cardWidth,
            height: cardHeight,
            perspective: 1000,
            display: 'inline-block',
            margin: '0 3px'
        }}>
            <div style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transition: 'transform 0.4s ease-out',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            }}>
                {/* Card Back */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    background: 'linear-gradient(135deg, #1e3a5f, #0f172a)',
                    borderRadius: 8,
                    border: '2px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                }}>
                    <div style={{
                        width: '80%',
                        height: '80%',
                        background: 'repeating-linear-gradient(45deg, #1e3a5f, #1e3a5f 4px, #0f172a 4px, #0f172a 8px)',
                        borderRadius: 4
                    }} />
                </div>

                {/* Card Front */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: '#fff',
                    borderRadius: 8,
                    border: '2px solid #e5e7eb',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                    <div style={{
                        fontSize: cardWidth * 0.4,
                        fontWeight: 'bold',
                        color: suitColor,
                        lineHeight: 1
                    }}>
                        {rank}
                    </div>
                    <div style={{
                        fontSize: cardWidth * 0.35,
                        color: suitColor,
                        lineHeight: 1
                    }}>
                        {suitSymbol}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const PlayerSeat = ({ player, isHero, isActive, position, dealerSeat, showCards, cardDelay, heroPosition }) => {
    const hasDealer = dealerSeat === position;

    return (
        <div style={{
            position: 'absolute',
            ...getSeatStyle(position, player.totalPlayers),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            zIndex: isHero ? 100 : 10
        }}>
            {/* Dealer Button */}
            {hasDealer && (
                <div style={{
                    position: 'absolute',
                    top: -30,
                    right: -20,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                    border: '2px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#000',
                    boxShadow: '0 2px 8px rgba(251, 191, 36, 0.5)'
                }}>
                    D
                </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', gap: 4 }}>
                {player.cards.map((card, i) => (
                    <Card3D
                        key={i}
                        card={card}
                        isFlipped={showCards}
                        delay={cardDelay + (i * 150)}
                        size={isHero ? 'large' : 'small'}
                    />
                ))}
            </div>

            {/* Player Info */}
            <div style={{
                background: isHero
                    ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                    : 'rgba(30, 41, 59, 0.9)',
                padding: '8px 16px',
                borderRadius: 12,
                border: isActive ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.2)',
                textAlign: 'center',
                boxShadow: isActive
                    ? '0 0 20px rgba(74, 222, 128, 0.4), 0 0 40px rgba(74, 222, 128, 0.2)'
                    : isHero
                        ? '0 0 15px rgba(37, 99, 235, 0.5)'
                        : 'none'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                }}>
                    <span style={{
                        fontSize: 13,
                        fontWeight: 'bold',
                        color: '#fff'
                    }}>
                        {isHero ? 'YOU' : `V${position}`}
                    </span>
                    {isHero && heroPosition && (
                        <span style={{
                            fontSize: 10,
                            fontWeight: 'bold',
                            color: '#fbbf24',
                            background: 'rgba(251, 191, 36, 0.2)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            letterSpacing: 0.5
                        }}>
                            {heroPosition}
                        </span>
                    )}
                </div>
                <div style={{
                    fontSize: 12,
                    color: isHero ? '#93c5fd' : '#94a3b8',
                    marginTop: 2
                }}>
                    {player.stack}bb
                </div>
            </div>

            {/* Chip Stack Visual */}
            <div style={{
                position: 'absolute',
                bottom: isHero ? -45 : 'auto',
                top: isHero ? 'auto' : -45,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2
            }}>
                {/* Chip stack (visual only) */}
                <div style={{
                    display: 'flex',
                    gap: -6,
                    marginLeft: -6
                }}>
                    {[...Array(Math.min(5, Math.ceil(player.stack / 20)))].map((_, i) => (
                        <div key={i} style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                            border: '2px solid #fff',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            marginLeft: i > 0 ? -8 : 0
                        }} />
                    ))}
                </div>
            </div>

            {/* Action Badge */}
            {player.lastAction && (
                <div style={{
                    position: 'absolute',
                    bottom: -30,
                    background: player.lastAction === 'FOLD'
                        ? 'rgba(239, 68, 68, 0.8)'
                        : 'rgba(34, 197, 94, 0.8)',
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: '#fff'
                }}>
                    {player.lastAction}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// BOARD CARDS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const BoardCards = ({ cards, showCards, delayStart = 0 }) => {
    if (!cards || cards.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            padding: 12,
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 12
        }}>
            {cards.map((card, i) => (
                <Card3D
                    key={i}
                    card={card}
                    isFlipped={showCards}
                    delay={delayStart + (i * 200)}
                    size="normal"
                />
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTONS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const ActionButtons = ({ actions, onAction, disabled }) => {
    const buttonStyles = {
        Fold: { bg: '#dc2626', hoverBg: '#b91c1c' },
        Check: { bg: '#059669', hoverBg: '#047857' },
        Call: { bg: '#2563eb', hoverBg: '#1d4ed8' },
        Bet: { bg: '#7c3aed', hoverBg: '#6d28d9' },
        Raise: { bg: '#f59e0b', hoverBg: '#d97706' },
        AllIn: { bg: '#be123c', hoverBg: '#9f1239' }
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(actions.length, 3)}, 1fr)`,
            gap: 12,
            maxWidth: 500,
            margin: '0 auto',
            padding: '0 16px'
        }}>
            {actions.map((action) => {
                const style = buttonStyles[action] || buttonStyles.Call;
                return (
                    <button
                        key={action}
                        onClick={() => !disabled && onAction(action)}
                        disabled={disabled}
                        style={{
                            padding: '18px 24px',
                            fontSize: 16,
                            fontWeight: 'bold',
                            background: style.bg,
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.5 : 1,
                            transition: 'transform 0.1s, background 0.2s',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}
                    >
                        {action.toUpperCase()}
                    </button>
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const FeedbackOverlay = ({ verdict, explanation, evLoss, onContinue }) => {
    const colors = {
        [Verdict.PERFECT]: { bg: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)', icon: '✓', text: 'PERFECT!' },
        [Verdict.ACCEPTABLE]: { bg: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', icon: '~', text: 'ACCEPTABLE' },
        [Verdict.BLUNDER]: { bg: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', icon: '✗', text: 'BLUNDER' }
    };

    const style = colors[verdict] || colors[Verdict.BLUNDER];

    return (
        <div
            onClick={onContinue}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                cursor: 'pointer'
            }}
        >
            <div style={{
                background: 'linear-gradient(135deg, #1a2744, #0a1628)',
                padding: 40,
                borderRadius: 24,
                textAlign: 'center',
                maxWidth: 450,
                border: `3px solid ${style.bg}`,
                boxShadow: `0 0 60px ${style.glow}`
            }}>
                {/* Icon */}
                <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: style.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    fontSize: 40,
                    fontWeight: 'bold',
                    color: '#fff'
                }}>
                    {style.icon}
                </div>

                {/* Verdict */}
                <h2 style={{
                    fontSize: 28,
                    fontWeight: 'bold',
                    color: style.bg,
                    marginBottom: 16
                }}>
                    {style.text}
                </h2>

                {/* EV Loss */}
                {evLoss !== undefined && evLoss > 0 && (
                    <div style={{
                        fontSize: 14,
                        color: '#94a3b8',
                        marginBottom: 12
                    }}>
                        EV Loss: -{(evLoss * 100).toFixed(1)}%
                    </div>
                )}

                {/* Explanation */}
                <p style={{
                    fontSize: 16,
                    color: '#e2e8f0',
                    lineHeight: 1.6,
                    marginBottom: 24
                }}>
                    {explanation}
                </p>

                {/* Continue */}
                <div style={{
                    fontSize: 14,
                    color: '#64748b',
                    fontStyle: 'italic'
                }}>
                    Tap anywhere to continue...
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: GOD MODE TRAINING TABLE
// ═══════════════════════════════════════════════════════════════════════════

export default function GodModeTrainingTable({
    questions = [],
    levelName = 'Training',
    onLevelComplete
}) {
    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 4: GAME LOOP STATE MACHINE
    // ─────────────────────────────────────────────────────────────────────────
    const [gameState, setGameState] = useState(GameState.LOADING);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [showCards, setShowCards] = useState(false);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 6: PROGRESSION ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 3: GTO BRAIN — FEEDBACK STATE
    // ─────────────────────────────────────────────────────────────────────────
    const [feedback, setFeedback] = useState(null);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 7: AUDIO ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    const { initAudio, playCardFlip, playChips, playSuccess, playError } = useAudioEngine();

    // Current question data
    const currentQuestion = questions[currentQuestionIndex] || null;
    const totalQuestions = questions.length || 20;
    const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 1: SCENARIO ORCHESTRATOR — Parse scenario data
    // ─────────────────────────────────────────────────────────────────────────

    // Get hero cards from question (supports both formats)
    const getHeroCards = (q) => {
        if (q?.hero_cards) return q.hero_cards;
        if (q?.heroCards) {
            // Convert array like ['Ah', 'Ks'] to standard format
            return q.heroCards;
        }
        return ['As', 'Kh']; // Fallback
    };

    const scenario = currentQuestion ? {
        boardCards: currentQuestion.board_cards || [],
        street: currentQuestion.street || 'Preflop',
        stackDepth: currentQuestion.stack_depth || currentQuestion.stackDepth || 100,
        topology: currentQuestion.topology || 'HU',
        pot: currentQuestion.macro_metrics?.pot_size || 4.5,
        heroCards: getHeroCards(currentQuestion),
        villainCards: ['??', '??'],
        villainAction: currentQuestion.villain_action || currentQuestion.villainAction || '',
        heroPosition: currentQuestion.position || 'BTN'
    } : null;

    // Player count based on topology
    const getPlayerCount = (topology) => {
        const counts = { 'HU': 2, '3-Max': 3, '6-Max': 6, '9-Max': 9 };
        return counts[topology] || 2;
    };

    const playerCount = scenario ? getPlayerCount(scenario.topology) : 2;

    // Build players array
    const players = Array.from({ length: playerCount }, (_, i) => ({
        cards: i === 0 ? (scenario?.heroCards || ['??', '??']) : scenario?.villainCards || ['??', '??'],
        stack: scenario?.stackDepth || 100,
        totalPlayers: playerCount,
        lastAction: null
    }));

    // ─────────────────────────────────────────────────────────────────────────
    // GAME LOOP EFFECTS
    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        // Initialize on mount
        if (questions.length > 0) {
            initAudio();
            startDeal();
        }
    }, [questions]);

    useEffect(() => {
        // Start dealing when question changes
        if (currentQuestion && gameState === GameState.NEXT_HAND) {
            startDeal();
        }
    }, [currentQuestionIndex]);

    const startDeal = useCallback(() => {
        setGameState(GameState.DEALING);
        setShowCards(false);
        setFeedback(null);

        // Animate deal
        setTimeout(() => {
            setShowCards(true);
            playCardFlip();
        }, 300);

        // Enable actions after deal
        setTimeout(() => {
            setGameState(GameState.ACTION_REQUIRED);
        }, 1200);
    }, [playCardFlip]);

    // ─────────────────────────────────────────────────────────────────────────
    // ENGINE 3: GTO BRAIN — Handle action + grading
    // ─────────────────────────────────────────────────────────────────────────
    const handleAction = useCallback((action) => {
        if (gameState !== GameState.ACTION_REQUIRED) return;

        setGameState(GameState.EVALUATING);

        // Normalize action to lowercase for comparison
        const userAction = action.toLowerCase();

        // Get correct action from question (supports old format and new format)
        const correctAction = (
            currentQuestion?.correct_action ||
            currentQuestion?.correctAction ||
            ''
        ).toLowerCase();

        let verdict = Verdict.BLUNDER;
        let evLoss = 0;
        let explanation = currentQuestion?.explanation || 'Action not found in GTO solution.';

        // Simple case-insensitive match against correctAction
        if (userAction === correctAction) {
            verdict = Verdict.PERFECT;
            explanation = currentQuestion?.explanation || 'Perfect play! This is the correct action.';
            evLoss = 0;
        } else {
            // Wrong answer
            verdict = Verdict.BLUNDER;
            explanation = `The correct action was ${correctAction.toUpperCase()}. ${currentQuestion?.explanation || ''}`;
        }

        // Play chips sound on bet/raise actions
        if (userAction === 'raise' || userAction === 'bet' || userAction === 'call') {
            playChips();
        }

        // Audio feedback for result
        if (verdict === Verdict.PERFECT || verdict === Verdict.ACCEPTABLE) {
            playSuccess();
            setScore(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                setMaxStreak(max => Math.max(max, newStreak));
                return newStreak;
            });
        } else {
            playError();
            setStreak(0);
        }

        // Show feedback
        setFeedback({ verdict, explanation, evLoss });
        setGameState(GameState.FEEDBACK_OVERLAY);

    }, [gameState, currentQuestion, playChips, playSuccess, playError]);

    // Handle continue after feedback
    const handleContinue = useCallback(() => {
        if (isLastQuestion) {
            setGameState(GameState.LEVEL_COMPLETE);
            if (onLevelComplete) {
                onLevelComplete({
                    score,
                    total: totalQuestions,
                    streak: maxStreak
                });
            }
        } else {
            setCurrentQuestionIndex(prev => prev + 1);
            setGameState(GameState.NEXT_HAND);
        }
        setFeedback(null);
    }, [isLastQuestion, score, totalQuestions, maxStreak, onLevelComplete]);

    // Available actions based on street/scenario
    const availableActions = ['Fold', 'Call', 'Raise'];

    // ─────────────────────────────────────────────────────────────────────────
    // LOADING STATE
    // ─────────────────────────────────────────────────────────────────────────
    if (gameState === GameState.LOADING || !currentQuestion) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(to bottom, #0a0a15, #1a1a2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00d4ff'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>Loading Quiz...</div>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL COMPLETE STATE
    // ─────────────────────────────────────────────────────────────────────────
    if (gameState === GameState.LEVEL_COMPLETE) {
        const accuracy = Math.round((score / totalQuestions) * 100);
        const passed = accuracy >= 85;

        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(to bottom, #0a0a15, #1a1a2e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #1a2744, #0a1628)',
                    padding: 48,
                    borderRadius: 24,
                    border: passed ? '3px solid #4ade80' : '3px solid #f97316',
                    textAlign: 'center',
                    maxWidth: 500
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>
                        {passed ? '🏆' : '📚'}
                    </div>
                    <h1 style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#f97316',
                        marginBottom: 24
                    }}>
                        {passed ? 'LEVEL COMPLETE!' : 'KEEP PRACTICING'}
                    </h1>
                    <div style={{
                        fontSize: 48,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#f97316',
                        marginBottom: 8
                    }}>
                        {accuracy}%
                    </div>
                    <div style={{ color: '#94a3b8', marginBottom: 24 }}>
                        {score}/{totalQuestions} correct • Best streak: {maxStreak}
                    </div>
                    <button
                        onClick={() => window.location.href = '/hub/training'}
                        style={{
                            padding: '16px 32px',
                            fontSize: 16,
                            fontWeight: 'bold',
                            background: passed ? '#22c55e' : '#f97316',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        {passed ? '🚀 NEXT LEVEL' : '🔄 TRY AGAIN'}
                    </button>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN RENDER — ENGINE 2: VISUAL ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(to bottom, #0a0a15 0%, #1a1a2e 50%, #0a0a15 100%)',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'Inter, -apple-system, sans-serif'
        }}>
            {/* FEEDBACK OVERLAY */}
            {feedback && gameState === GameState.FEEDBACK_OVERLAY && (
                <FeedbackOverlay
                    verdict={feedback.verdict}
                    explanation={feedback.explanation}
                    evLoss={feedback.evLoss}
                    onContinue={handleContinue}
                />
            )}

            {/* TOP BAR — HUD */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: '12px 20px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 50
            }}>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                    {levelName}
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
                    <span style={{ color: '#94a3b8' }}>
                        Q: {currentQuestionIndex + 1}/{totalQuestions}
                    </span>
                    <span style={{ color: '#4ade80' }}>
                        ✓ {score}
                    </span>
                    {streak > 1 && (
                        <span style={{ color: '#f59e0b' }}>
                            🔥 {streak}x
                        </span>
                    )}
                </div>
            </div>

            {/* POKER TABLE — Center */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: 700,
                aspectRatio: '16/10'
            }}>
                {/* Table Surface */}
                <div style={{
                    position: 'absolute',
                    inset: '10%',
                    background: 'linear-gradient(135deg, #15803d, #166534)',
                    borderRadius: '50%',
                    border: '12px solid rgba(251, 191, 36, 0.6)',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,0,0,0.6)'
                }}>
                    {/* Villain Action Banner */}
                    {scenario?.villainAction && (
                        <div style={{
                            position: 'absolute',
                            top: '15%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(239, 68, 68, 0.9)',
                            padding: '8px 16px',
                            borderRadius: 20,
                            fontSize: 13,
                            fontWeight: 'bold',
                            color: '#fff',
                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                            whiteSpace: 'nowrap'
                        }}>
                            ⚠️ VILLAIN {scenario.villainAction}
                        </div>
                    )}

                    {/* Pot Display */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                    }}>
                        {/* Street Indicator */}
                        <div style={{
                            fontSize: 11,
                            fontWeight: 'bold',
                            color: '#00d4ff',
                            letterSpacing: 1,
                            marginBottom: 6,
                            textTransform: 'uppercase'
                        }}>
                            {scenario?.street || 'PREFLOP'}
                        </div>
                        <div style={{
                            fontSize: 14,
                            color: 'rgba(255,255,255,0.6)',
                            marginBottom: 4
                        }}>
                            POT
                        </div>
                        <div style={{
                            fontSize: 28,
                            fontWeight: 'bold',
                            color: '#fbbf24'
                        }}>
                            {scenario?.pot || 6}bb
                        </div>
                    </div>

                    {/* Board Cards */}
                    {scenario?.boardCards?.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '30%',
                            left: '50%',
                            transform: 'translateX(-50%)'
                        }}>
                            <BoardCards
                                cards={scenario.boardCards}
                                showCards={showCards}
                                delayStart={600}
                            />
                        </div>
                    )}
                </div>

                {/* Player Seats */}
                {players.map((player, i) => (
                    <PlayerSeat
                        key={i}
                        player={player}
                        isHero={i === 0}
                        isActive={i === 0 && gameState === GameState.ACTION_REQUIRED}
                        position={i}
                        dealerSeat={playerCount - 1} // Button on last villain
                        showCards={showCards}
                        cardDelay={i * 200}
                        heroPosition={i === 0 ? scenario?.heroPosition : null}
                    />
                ))}
            </div>

            {/* BOTTOM BAR — Actions */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '24px 16px 40px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                zIndex: 50
            }}>
                <ActionButtons
                    actions={availableActions}
                    onAction={handleAction}
                    disabled={gameState !== GameState.ACTION_REQUIRED}
                />
            </div>
        </div>
    );
}
