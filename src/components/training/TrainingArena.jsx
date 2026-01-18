/**
 * 🎮 TRAINING ARENA — Video Game Poker Table
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE LAW (VIDEO GAME FEEL):
 * - Hero ALWAYS anchored at BOTTOM-CENTER
 * - Positions/seats rotate AROUND THE HERO between hands
 * - Cards DEALT with animation (no instant appear)
 * - Chips MOVE for bets/calls/raises
 * - Seat highlights travel with action
 * - NO static quiz screens, NO flat forms, NO "choose A/B/C" website feel
 * 
 * Integrates with TrainingRunEngine for 20-question sessions (85% pass).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { trainingRunEngine, RUN_RULES, RunState } from '../../engine/TrainingRunEngine';
import { eventBus, EventType, busEmit } from '../../engine/EventBus';

// Seat positions around the table (hero at bottom center)
const SEAT_POSITIONS = [
    { id: 'hero', angle: 180, label: 'HERO', isHero: true },
    { id: 'seat1', angle: 225, label: 'SB' },
    { id: 'seat2', angle: 270, label: 'BB' },
    { id: 'seat3', angle: 315, label: 'UTG' },
    { id: 'seat4', angle: 0, label: 'HJ' },
    { id: 'seat5', angle: 45, label: 'CO' },
    { id: 'seat6', angle: 90, label: 'BTN' },
    { id: 'seat7', angle: 135, label: 'MP' },
];

// Card suit symbols and colors
const SUIT_CONFIG = {
    s: { symbol: '♠', color: '#1a1a2e' },
    h: { symbol: '♥', color: '#ff4757' },
    d: { symbol: '♦', color: '#3498db' },
    c: { symbol: '♣', color: '#2ecc71' },
};

export default function TrainingArena({
    gameId,
    gameName,
    questions,
    currentLevel = 1,
    onExit,
    onRunComplete,
}) {
    // Run engine state
    const [runState, setRunState] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Visual state
    const [dealingCards, setDealingCards] = useState(false);
    const [activeActionSeat, setActiveActionSeat] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [resultData, setResultData] = useState(null);
    const [chipAnimation, setChipAnimation] = useState(null);

    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(RUN_RULES.TIME_PER_QUESTION);
    const [timerActive, setTimerActive] = useState(false);
    const timerRef = useRef(null);

    // Subscribe to run engine updates
    useEffect(() => {
        const unsub = trainingRunEngine.subscribe(setRunState);
        return unsub;
    }, []);

    // Start the run when component mounts
    useEffect(() => {
        const startRun = async () => {
            if (!questions || questions.length !== 20) {
                setError(`Need exactly 20 questions for a run (got ${questions?.length || 0})`);
                setIsLoading(false);
                return;
            }

            try {
                const result = await trainingRunEngine.startRun(
                    gameId,
                    questions,
                    currentLevel,
                    'standard'
                );

                if (!result.success) {
                    if (result.offline) {
                        setError('OFFLINE: Progress will not be recorded. Connect to continue.');
                    } else {
                        setError('Failed to start training run');
                    }
                }
            } catch (err) {
                setError(err.message);
            }

            setIsLoading(false);
        };

        startRun();

        return () => {
            trainingRunEngine.abortRun();
        };
    }, [gameId, questions, currentLevel]);

    // Handle question display (card dealing animation)
    useEffect(() => {
        if (runState?.state === RunState.QUESTION_SHOWN) {
            // Deal cards animation
            setDealingCards(true);
            setTimeout(() => setDealingCards(false), 800);

            // Start timer
            setTimeRemaining(RUN_RULES.TIME_PER_QUESTION);
            setTimerActive(true);
            setShowResult(false);
            setResultData(null);
        }
    }, [runState?.state, runState?.questionNumber]);

    // Timer countdown
    useEffect(() => {
        if (!timerActive || timeRemaining <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                const next = prev - 0.1;

                // Warning at 30%
                if (next <= RUN_RULES.TIME_PER_QUESTION * 0.3 &&
                    next > RUN_RULES.TIME_PER_QUESTION * 0.3 - 0.1) {
                    busEmit.timerWarning();
                    busEmit.screenShake('light');
                }

                // Expired
                if (next <= 0) {
                    handleTimeout();
                    return 0;
                }

                return next;
            });
        }, 100);

        return () => clearInterval(timerRef.current);
    }, [timerActive]);

    // Handle answer selection
    const handleAnswer = async (optionId) => {
        if (showResult || runState?.state !== RunState.QUESTION_SHOWN) return;

        setTimerActive(false);
        clearInterval(timerRef.current);

        // Trigger chip animation
        setChipAnimation('bet');
        setTimeout(() => setChipAnimation(null), 500);

        // Submit answer
        const result = await trainingRunEngine.submitAnswer(optionId);

        if (result) {
            setResultData(result);
            setShowResult(true);

            // Emit screen effects
            if (result.isCorrect) {
                busEmit.decisionCorrect(10, result.streak);
                busEmit.screenFlash('#22C55E', 200);
            } else {
                busEmit.decisionIncorrect(true);
                busEmit.screenFlash('#EF4444', 300);
                busEmit.screenShake('medium');
            }
        }
    };

    // Handle timeout
    const handleTimeout = async () => {
        busEmit.timerExpired();
        busEmit.screenShake('heavy');

        // Submit empty answer (wrong)
        const result = await trainingRunEngine.submitAnswer('TIMEOUT');
        setResultData({ ...result, isCorrect: false, timeout: true });
        setShowResult(true);
    };

    // Proceed to next question
    const handleNext = async () => {
        await trainingRunEngine.nextQuestion();

        // Check if run complete
        if (runState?.state === RunState.RUN_COMPLETE) {
            onRunComplete?.(runState);
        }
    };

    // Get current question data
    const question = runState?.currentQuestion;

    // Timer color based on remaining time
    const getTimerColor = () => {
        const percent = (timeRemaining / RUN_RULES.TIME_PER_QUESTION) * 100;
        if (percent > 60) return '#22C55E';
        if (percent > 30) return '#EAB308';
        return '#EF4444';
    };

    if (isLoading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner} />
                <p style={styles.loadingText}>Preparing training session...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.errorContainer}>
                <div style={styles.errorIcon}>⚠️</div>
                <h2 style={styles.errorTitle}>Cannot Start Training</h2>
                <p style={styles.errorText}>{error}</p>
                <button onClick={onExit} style={styles.exitButton}>
                    Return to Library
                </button>
            </div>
        );
    }

    // Run complete screen
    if (runState?.state === RunState.RUN_COMPLETE) {
        const passed = runState.willPass;
        return (
            <div style={styles.completeContainer}>
                <div style={{
                    ...styles.completeIcon,
                    color: passed ? '#22C55E' : '#EF4444',
                }}>
                    {passed ? '🏆' : '🔄'}
                </div>
                <h1 style={{
                    ...styles.completeTitle,
                    color: passed ? '#22C55E' : '#fff',
                }}>
                    {passed ? 'LEVEL PASSED!' : 'TRY AGAIN'}
                </h1>
                <div style={styles.scoreDisplay}>
                    <span style={styles.scoreLabel}>SCORE</span>
                    <span style={{
                        ...styles.scoreValue,
                        color: passed ? '#22C55E' : '#FF6B35',
                    }}>
                        {runState.score}%
                    </span>
                </div>
                <p style={styles.completeSubtext}>
                    {runState.correctCount}/20 correct • 85% required to pass
                </p>
                <div style={styles.completeActions}>
                    {!passed && (
                        <button
                            onClick={() => trainingRunEngine.restartRun()}
                            style={styles.retryButton}
                        >
                            RETRY LEVEL
                        </button>
                    )}
                    <button onClick={onExit} style={styles.exitButton}>
                        {passed ? 'CONTINUE' : 'BACK TO LIBRARY'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>
                    ← Exit
                </button>
                <div style={styles.gameInfo}>
                    <span style={styles.gameName}>{gameName}</span>
                    <span style={styles.levelBadge}>Level {currentLevel}</span>
                </div>
                <div style={styles.progressInfo}>
                    <span style={styles.questionCounter}>
                        {runState?.questionNumber || 1} / 20
                    </span>
                    <span style={styles.correctCounter}>
                        ✓ {runState?.correctCount || 0}
                    </span>
                </div>
            </div>

            {/* Table Area */}
            <div style={styles.tableArea}>
                {/* Felt table */}
                <div style={styles.tableOuter}>
                    <div style={styles.tableInner}>
                        {/* Board cards */}
                        <div style={styles.boardArea}>
                            {question?.board?.map((card, i) => (
                                <div
                                    key={i}
                                    style={{
                                        ...styles.boardCard,
                                        animationDelay: `${i * 0.1}s`,
                                        animation: dealingCards ? 'dealCard 0.3s ease-out forwards' : 'none',
                                    }}
                                >
                                    <PlayingCard card={card} />
                                </div>
                            )) || <div style={styles.preFlopText}>PRE-FLOP</div>}
                        </div>

                        {/* Pot display */}
                        {question?.potSize && (
                            <div style={styles.potDisplay}>
                                <span style={styles.potLabel}>POT</span>
                                <span style={styles.potValue}>{question.potSize} BB</span>
                            </div>
                        )}

                        {/* Seats around table */}
                        {SEAT_POSITIONS.map(seat => {
                            // Wrap Hero seat with INTENSE living glow + countdown timer border
                            if (seat.isHero) {
                                const timePercent = timerActive ? (timeRemaining / RUN_RULES.TIME_PER_QUESTION) * 100 : 100;

                                return (
                                    <motion.div
                                        key={seat.id}
                                        style={{
                                            position: 'absolute',
                                            transform: `rotate(${seat.angle}deg) translateY(-140px) rotate(-${seat.angle}deg)`,
                                        }}
                                        animate={{
                                            filter: timerActive ? [
                                                'drop-shadow(0 0 30px rgba(255,215,0,1)) drop-shadow(0 0 60px rgba(255,215,0,0.9)) drop-shadow(0 0 90px rgba(255,215,0,0.7))',
                                                'drop-shadow(0 0 50px rgba(255,215,0,1)) drop-shadow(0 0 100px rgba(255,215,0,1)) drop-shadow(0 0 150px rgba(255,215,0,0.9)) drop-shadow(0 0 200px rgba(255,215,0,0.6))',
                                                'drop-shadow(0 0 30px rgba(255,215,0,1)) drop-shadow(0 0 60px rgba(255,215,0,0.9)) drop-shadow(0 0 90px rgba(255,215,0,0.7))',
                                            ] : 'none',
                                        }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: Infinity,
                                            ease: "easeInOut",
                                        }}
                                    >
                                        <div style={{ position: 'relative' }}>
                                            {/* Countdown Timer Border (SVG) */}
                                            {timerActive && (
                                                <svg
                                                    style={{
                                                        position: 'absolute',
                                                        top: -8,
                                                        left: -8,
                                                        width: 76,
                                                        height: 76,
                                                        pointerEvents: 'none',
                                                        transform: 'rotate(-90deg)',
                                                    }}
                                                >
                                                    <circle
                                                        cx="38"
                                                        cy="38"
                                                        r="34"
                                                        fill="none"
                                                        stroke="rgba(0, 255, 0, 0.8)"
                                                        strokeWidth="6"
                                                        strokeDasharray={`${2 * Math.PI * 34}`}
                                                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - timePercent / 100)}`}
                                                        strokeLinecap="round"
                                                        style={{
                                                            filter: 'drop-shadow(0 0 8px rgba(0, 255, 0, 0.8))',
                                                            transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s ease',
                                                            stroke: timePercent > 30 ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)',
                                                        }}
                                                    />
                                                </svg>
                                            )}

                                            {/* Hero Seat */}
                                            <div
                                                style={{
                                                    ...styles.seat,
                                                    border: '3px solid #FFD700',
                                                    background: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.1))',
                                                }}
                                            >
                                                <span style={styles.seatLabel}>{seat.label}</span>
                                                {question?.heroCards && (
                                                    <div style={styles.holeCards}>
                                                        {question.heroCards.map((card, i) => (
                                                            <div key={i} style={{
                                                                ...styles.holeCard,
                                                                animation: dealingCards ? `dealHole 0.4s ease-out ${0.3 + i * 0.15}s forwards` : 'none',
                                                            }}>
                                                                <PlayingCard card={card} size="small" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            }

                            // Regular villain seats
                            return (
                                <div
                                    key={seat.id}
                                    style={{
                                        ...styles.seat,
                                        transform: `rotate(${seat.angle}deg) translateY(-140px) rotate(-${seat.angle}deg)`,
                                        border: '2px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(0,0,0,0.5)',
                                    }}
                                >
                                    <span style={styles.seatLabel}>{seat.label}</span>
                                </div>
                            );
                        })}

                        {/* Chip animation */}
                        {chipAnimation && (
                            <div style={styles.chipAnimation}>
                                <span style={styles.chip}>🪙</span>
                                <span style={styles.chip}>🪙</span>
                                <span style={styles.chip}>🪙</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Timer */}
                <div style={{
                    ...styles.timer,
                    borderColor: getTimerColor(),
                    boxShadow: `0 0 20px ${getTimerColor()}66`,
                }}>
                    <div style={{ ...styles.timerValue, color: getTimerColor() }}>
                        {Math.ceil(timeRemaining)}
                    </div>
                    <div style={styles.timerLabel}>SEC</div>
                </div>
            </div>

            {/* Situation panel */}
            <div style={styles.situationPanel}>
                <h3 style={styles.situationTitle}>{question?.title || 'Situation'}</h3>
                <p style={styles.situationText}>{question?.situation}</p>
            </div>

            {/* Action HUD (bottom) */}
            <div style={styles.actionHUD}>
                {!showResult ? (
                    // Action buttons
                    <div style={styles.actionButtons}>
                        {question?.options?.map(option => (
                            <button
                                key={option.id}
                                onClick={() => handleAnswer(option.id)}
                                style={styles.actionButton}
                            >
                                {option.text}
                            </button>
                        ))}
                    </div>
                ) : (
                    // Result display
                    <div style={styles.resultPanel}>
                        <div style={{
                            ...styles.resultHeader,
                            background: resultData?.isCorrect
                                ? 'linear-gradient(135deg, #22C55E, #10B981)'
                                : 'linear-gradient(135deg, #EF4444, #DC2626)',
                        }}>
                            <span style={styles.resultIcon}>
                                {resultData?.isCorrect ? '✓' : '✗'}
                            </span>
                            <span style={styles.resultText}>
                                {resultData?.isCorrect ? 'CORRECT!' : 'INCORRECT'}
                            </span>
                            {resultData?.speedLabel && resultData.speedLabel !== 'STANDARD' && (
                                <span style={styles.speedBonus}>
                                    ⚡ {resultData.speedLabel} +{((resultData.speedMultiplier - 1) * 100).toFixed(0)}%
                                </span>
                            )}
                        </div>
                        <p style={styles.explanation}>{question?.explanation}</p>
                        <button onClick={handleNext} style={styles.nextButton}>
                            {runState?.questionNumber >= 20 ? 'VIEW RESULTS' : 'NEXT →'}
                        </button>
                    </div>
                )}
            </div>

            {/* Animation keyframes */}
            <style>{`
                @keyframes dealCard {
                    from { opacity: 0; transform: translateY(-30px) scale(0.8); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes dealHole {
                    from { opacity: 0; transform: translateX(-20px) rotate(-10deg); }
                    to { opacity: 1; transform: translateX(0) rotate(0deg); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `}</style>
        </div>
    );
}

// Playing card component
function PlayingCard({ card, size = 'medium' }) {
    if (!card) return null;

    const suit = card[card.length - 1];
    const rank = card.slice(0, -1);
    const config = SUIT_CONFIG[suit] || SUIT_CONFIG.s;

    const sizes = {
        small: { width: 36, height: 50, fontSize: 12 },
        medium: { width: 52, height: 72, fontSize: 16 },
        large: { width: 68, height: 94, fontSize: 20 },
    };
    const s = sizes[size];

    return (
        <div style={{
            width: s.width,
            height: s.height,
            background: 'linear-gradient(135deg, #fff, #f5f5f5)',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontWeight: 'bold',
            fontSize: s.fontSize,
            color: config.color,
        }}>
            <span>{rank}</span>
            <span style={{ fontSize: s.fontSize * 1.2 }}>{config.symbol}</span>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a1628 0%, #1a2744 100%)',
        color: '#fff',
        fontFamily: 'Inter, sans-serif',
    },

    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a1628',
    },

    loadingSpinner: {
        width: 48,
        height: 48,
        border: '4px solid rgba(255,255,255,0.1)',
        borderTopColor: '#00D4FF',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },

    loadingText: {
        marginTop: 16,
        color: 'rgba(255,255,255,0.6)',
    },

    errorContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a1628',
        padding: 40,
        textAlign: 'center',
    },

    errorIcon: {
        fontSize: 64,
        marginBottom: 16,
    },

    errorTitle: {
        fontSize: 24,
        marginBottom: 8,
    },

    errorText: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 24,
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
    },

    backButton: {
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
        fontSize: 14,
    },

    gameInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    gameName: {
        fontSize: 16,
        fontWeight: 600,
    },

    levelBadge: {
        padding: '4px 12px',
        background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
    },

    progressInfo: {
        display: 'flex',
        gap: 16,
    },

    questionCounter: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 700,
    },

    correctCounter: {
        color: '#22C55E',
        fontWeight: 600,
    },

    tableArea: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: 20,
    },

    tableOuter: {
        width: 500,
        height: 340,
        background: 'linear-gradient(135deg, #1a472a, #2d5a3d)',
        borderRadius: '50%',
        padding: 8,
        boxShadow: '0 0 60px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.3)',
    },

    tableInner: {
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #1e5631, #2d7a47)',
        borderRadius: '50%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '4px solid #3d2a1a',
    },

    boardArea: {
        display: 'flex',
        gap: 8,
        position: 'absolute',
    },

    boardCard: {},

    preFlopText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 2,
    },

    potDisplay: {
        position: 'absolute',
        bottom: 80,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: '6px 16px',
        borderRadius: 20,
    },

    potLabel: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
    },

    potValue: {
        fontSize: 16,
        fontWeight: 700,
        color: '#FFD700',
        fontFamily: 'Orbitron, sans-serif',
    },

    seat: {
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: '50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },

    seatLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
    },

    holeCards: {
        display: 'flex',
        gap: 2,
        position: 'absolute',
        bottom: -25,
    },

    holeCard: {},

    chipAnimation: {
        display: 'flex',
        gap: 4,
        animation: 'slideUp 0.5s ease-out',
    },

    chip: {
        fontSize: 24,
    },

    timer: {
        position: 'absolute',
        right: 40,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: '#0a1628',
        border: '4px solid',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },

    timerValue: {
        fontSize: 28,
        fontWeight: 800,
        fontFamily: 'Orbitron, monospace',
    },

    timerLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
    },

    situationPanel: {
        padding: '16px 40px',
        background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
    },

    situationTitle: {
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 8,
        color: '#FFD700',
    },

    situationText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 1.5,
    },

    actionHUD: {
        padding: '20px 40px 40px',
        background: 'rgba(0,0,0,0.4)',
    },

    actionButtons: {
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        flexWrap: 'wrap',
    },

    actionButton: {
        padding: '16px 32px',
        fontSize: 16,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        minWidth: 180,
    },

    resultPanel: {
        textAlign: 'center',
    },

    resultHeader: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        borderRadius: 12,
        marginBottom: 16,
    },

    resultIcon: {
        fontSize: 24,
        fontWeight: 800,
    },

    resultText: {
        fontSize: 18,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },

    speedBonus: {
        padding: '4px 12px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
    },

    explanation: {
        maxWidth: 600,
        margin: '0 auto 20px',
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 1.5,
    },

    nextButton: {
        padding: '14px 48px',
        fontSize: 16,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #FF6B35, #FF4500)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
    },

    completeContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a1628',
        textAlign: 'center',
    },

    completeIcon: {
        fontSize: 80,
        marginBottom: 16,
    },

    completeTitle: {
        fontSize: 36,
        fontWeight: 800,
        fontFamily: 'Orbitron, sans-serif',
        marginBottom: 24,
    },

    scoreDisplay: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 16,
    },

    scoreLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 2,
    },

    scoreValue: {
        fontSize: 72,
        fontWeight: 800,
        fontFamily: 'Orbitron, sans-serif',
    },

    completeSubtext: {
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 32,
    },

    completeActions: {
        display: 'flex',
        gap: 16,
    },

    retryButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #FF6B35, #FF4500)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
    },

    exitButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
    },
};
