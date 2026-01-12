/* ═══════════════════════════════════════════════════════════════════════════
   ⚡ SPEED DRILL — Lightning-Fast Hand Decision Game
   Flash a hand → Pick the action → Score streaks
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEngine, EffectsEngine } from './GameEngine';
import { getRandomScenario, getLevelConfig, RANKS } from './ScenarioDatabase';

// Game constants
const INITIAL_TIME = 3000; // 3 seconds per hand
const MIN_TIME = 1000; // Minimum 1 second at high streaks
const TIME_DECREASE_PER_CORRECT = 100; // Lose 100ms per correct answer
const MAX_LIVES = 3;
const POINTS_PER_CORRECT = 100;
const STREAK_BONUS_MULTIPLIER = 10;

// Generate random hand from scenario
function getRandomHandFromScenario(scenario) {
    const hands = Object.entries(scenario.solution);
    if (hands.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * hands.length);
    const [hand, correctAction] = hands[randomIndex];

    return { hand, correctAction, scenario };
}

// Hand display component
function HandCard({ hand, isRevealed, correctAction, userAnswer }) {
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');
    const isOffsuit = hand.endsWith('o');

    const cardStyle = {
        width: 180,
        height: 120,
        background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
        border: '3px solid',
        borderColor: isRevealed
            ? (userAnswer === correctAction ? '#00ff88' : '#ff4444')
            : '#00D4FF',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        transition: 'all 0.2s ease',
    };

    const handStyle = {
        fontSize: 42,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
    };

    const typeStyle = {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 8,
    };

    return (
        <div style={cardStyle}>
            <div style={handStyle}>{hand}</div>
            <div style={typeStyle}>
                {isPair ? 'Pair' : isSuited ? 'Suited' : 'Offsuit'}
            </div>
        </div>
    );
}

// Timer bar component
function TimerBar({ remaining, total }) {
    const percentage = (remaining / total) * 100;
    const color = percentage > 50 ? '#00ff88' : percentage > 25 ? '#ffaa00' : '#ff4444';

    return (
        <div style={{
            width: '100%',
            height: 8,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 20,
        }}>
            <div style={{
                width: `${percentage}%`,
                height: '100%',
                background: color,
                transition: 'width 0.05s linear',
                borderRadius: 4,
            }} />
        </div>
    );
}

// Lives display
function LivesDisplay({ lives, maxLives }) {
    return (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {Array.from({ length: maxLives }).map((_, i) => (
                <div key={i} style={{
                    fontSize: 24,
                    opacity: i < lives ? 1 : 0.3,
                    transition: 'opacity 0.3s ease',
                }}>
                    ❤️
                </div>
            ))}
        </div>
    );
}

// Main Speed Drill Component
export default function SpeedDrill({ level = 1, onExit, onComplete }) {
    const [gameState, setGameState] = useState('ready'); // ready | playing | revealed | gameover
    const [currentHand, setCurrentHand] = useState(null);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [timeRemaining, setTimeRemaining] = useState(INITIAL_TIME);
    const [currentTimeLimit, setCurrentTimeLimit] = useState(INITIAL_TIME);
    const [userAnswer, setUserAnswer] = useState(null);
    const [handsPlayed, setHandsPlayed] = useState(0);

    const timerRef = useRef(null);
    const containerRef = useRef(null);

    // Initialize game
    const startGame = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return;

        const hand = getRandomHandFromScenario(scenario);
        if (!hand) return;

        setCurrentHand(hand);
        setGameState('playing');
        setTimeRemaining(INITIAL_TIME);
        setCurrentTimeLimit(INITIAL_TIME);
        setScore(0);
        setStreak(0);
        setMaxStreak(0);
        setLives(MAX_LIVES);
        setUserAnswer(null);
        setHandsPlayed(0);

        SoundEngine.play('levelUp');
    }, [level]);

    // Next hand
    const nextHand = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return;

        const hand = getRandomHandFromScenario(scenario);
        if (!hand) return;

        // Decrease time based on streak
        const newTimeLimit = Math.max(MIN_TIME, INITIAL_TIME - (streak * TIME_DECREASE_PER_CORRECT));

        setCurrentHand(hand);
        setGameState('playing');
        setTimeRemaining(newTimeLimit);
        setCurrentTimeLimit(newTimeLimit);
        setUserAnswer(null);
    }, [level, streak]);

    // Handle answer
    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;

        clearInterval(timerRef.current);
        setUserAnswer(action);
        setHandsPlayed(prev => prev + 1);

        const isCorrect = action === currentHand.correctAction;

        if (isCorrect) {
            const streakBonus = streak * STREAK_BONUS_MULTIPLIER;
            const pointsEarned = POINTS_PER_CORRECT + streakBonus;

            setScore(prev => prev + pointsEarned);
            setStreak(prev => prev + 1);
            setMaxStreak(prev => Math.max(prev, streak + 1));

            SoundEngine.play('correct');
            EffectsEngine.particles(window.innerWidth / 2, window.innerHeight / 2, 15, '#00ff88');
        } else {
            setStreak(0);
            setLives(prev => prev - 1);

            SoundEngine.play('wrong');
            if (containerRef.current) {
                EffectsEngine.shake(containerRef.current, 8);
            }
        }

        setGameState('revealed');

        // Auto-advance or game over
        setTimeout(() => {
            if (lives - (isCorrect ? 0 : 1) <= 0) {
                setGameState('gameover');
                SoundEngine.play('gameOver');
                if (onComplete) {
                    onComplete({ score, maxStreak: Math.max(maxStreak, streak + (isCorrect ? 1 : 0)), handsPlayed: handsPlayed + 1 });
                }
            } else {
                nextHand();
            }
        }, 1000);
    }, [gameState, currentHand, streak, lives, score, maxStreak, handsPlayed, nextHand, onComplete]);

    // Timer countdown
    useEffect(() => {
        if (gameState === 'playing') {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 50) {
                        // Time's up!
                        clearInterval(timerRef.current);
                        handleAnswer('timeout');
                        return 0;
                    }
                    return prev - 50;
                });
            }, 50);
        }

        return () => clearInterval(timerRef.current);
    }, [gameState, handleAnswer]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (gameState !== 'playing') {
                if (e.key === ' ' || e.key === 'Enter') {
                    if (gameState === 'ready') startGame();
                    else if (gameState === 'gameover') onExit?.();
                }
                return;
            }

            const keyMap = {
                '1': 'fold',
                '2': 'call',
                '3': 'raise',
            };

            if (keyMap[e.key]) {
                handleAnswer(keyMap[e.key]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState, handleAnswer, startGame, onExit]);

    // Render
    return (
        <div ref={containerRef} style={styles.container}>
            {/* Background */}
            <div style={styles.bgGrid} />

            {/* Header */}
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>
                    ← Exit
                </button>
                <div style={styles.scoreDisplay}>
                    <span style={styles.scoreLabel}>SCORE</span>
                    <span style={styles.scoreValue}>{score.toLocaleString()}</span>
                </div>
                <div style={styles.streakDisplay}>
                    {streak > 0 && (
                        <span style={styles.streakBadge}>🔥 {streak}x</span>
                    )}
                </div>
            </div>

            {/* Main game area */}
            <div style={styles.gameArea}>
                {gameState === 'ready' && (
                    <div style={styles.readyScreen}>
                        <div style={styles.readyIcon}>⚡</div>
                        <h1 style={styles.readyTitle}>SPEED DRILL</h1>
                        <p style={styles.readyDesc}>
                            Answer as fast as you can!<br />
                            Streak builds = Less time to answer<br />
                            3 lives. Don't run out!
                        </p>
                        <button onClick={startGame} style={styles.startButton}>
                            START [SPACE]
                        </button>
                    </div>
                )}

                {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                    <>
                        <LivesDisplay lives={lives} maxLives={MAX_LIVES} />
                        <TimerBar remaining={timeRemaining} total={currentTimeLimit} />

                        <div style={styles.scenarioInfo}>
                            {currentHand.scenario.title}
                        </div>

                        <HandCard
                            hand={currentHand.hand}
                            isRevealed={gameState === 'revealed'}
                            correctAction={currentHand.correctAction}
                            userAnswer={userAnswer}
                        />

                        {gameState === 'revealed' && (
                            <div style={{
                                marginTop: 16,
                                fontSize: 18,
                                fontWeight: 700,
                                color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444',
                            }}>
                                {userAnswer === currentHand.correctAction
                                    ? `✓ Correct! +${POINTS_PER_CORRECT + (streak - 1) * STREAK_BONUS_MULTIPLIER}`
                                    : `✗ Wrong! Should ${currentHand.correctAction.toUpperCase()}`}
                            </div>
                        )}

                        <div style={styles.actionButtons}>
                            <button
                                onClick={() => handleAnswer('fold')}
                                disabled={gameState !== 'playing'}
                                style={{
                                    ...styles.actionBtn,
                                    ...styles.foldBtn,
                                    opacity: gameState === 'playing' ? 1 : 0.5,
                                }}
                            >
                                <span style={styles.keyHint}>1</span>
                                FOLD
                            </button>
                            <button
                                onClick={() => handleAnswer('call')}
                                disabled={gameState !== 'playing'}
                                style={{
                                    ...styles.actionBtn,
                                    ...styles.callBtn,
                                    opacity: gameState === 'playing' ? 1 : 0.5,
                                }}
                            >
                                <span style={styles.keyHint}>2</span>
                                CALL
                            </button>
                            <button
                                onClick={() => handleAnswer('raise')}
                                disabled={gameState !== 'playing'}
                                style={{
                                    ...styles.actionBtn,
                                    ...styles.raiseBtn,
                                    opacity: gameState === 'playing' ? 1 : 0.5,
                                }}
                            >
                                <span style={styles.keyHint}>3</span>
                                RAISE
                            </button>
                        </div>
                    </>
                )}

                {gameState === 'gameover' && (
                    <div style={styles.gameOverScreen}>
                        <div style={styles.gameOverIcon}>💀</div>
                        <h1 style={styles.gameOverTitle}>GAME OVER</h1>
                        <div style={styles.finalStats}>
                            <div style={styles.statRow}>
                                <span>Final Score</span>
                                <span style={styles.finalScore}>{score.toLocaleString()}</span>
                            </div>
                            <div style={styles.statRow}>
                                <span>Best Streak</span>
                                <span>🔥 {maxStreak}</span>
                            </div>
                            <div style={styles.statRow}>
                                <span>Hands Played</span>
                                <span>{handsPlayed}</span>
                            </div>
                        </div>
                        <button onClick={onExit} style={styles.exitButton}>
                            BACK TO MENU [SPACE]
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Styles
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a12',
        fontFamily: 'Inter, -apple-system, sans-serif',
        padding: 20,
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(255, 200, 0, 0.01) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 200, 0, 0.01) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    backButton: {
        padding: '10px 20px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
    },
    scoreDisplay: {
        textAlign: 'center',
    },
    scoreLabel: {
        display: 'block',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: 2,
    },
    scoreValue: {
        fontSize: 32,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        color: '#FFD700',
    },
    streakDisplay: {
        minWidth: 80,
        textAlign: 'right',
    },
    streakBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        borderRadius: 20,
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
    },
    gameArea: {
        maxWidth: 500,
        margin: '0 auto',
        textAlign: 'center',
    },
    readyScreen: {
        marginTop: 60,
    },
    readyIcon: {
        fontSize: 80,
        marginBottom: 20,
    },
    readyTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 900,
        color: '#FFD700',
        marginBottom: 16,
    },
    readyDesc: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
        marginBottom: 30,
    },
    startButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        color: '#000',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
    },
    scenarioInfo: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 20,
    },
    actionButtons: {
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        marginTop: 30,
    },
    actionBtn: {
        padding: '16px 32px',
        fontSize: 16,
        fontWeight: 700,
        border: '2px solid',
        borderRadius: 12,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s ease',
    },
    foldBtn: {
        background: 'rgba(100, 100, 100, 0.3)',
        borderColor: '#666',
        color: '#fff',
    },
    callBtn: {
        background: 'rgba(16, 185, 129, 0.3)',
        borderColor: '#10B981',
        color: '#10B981',
    },
    raiseBtn: {
        background: 'rgba(239, 68, 68, 0.3)',
        borderColor: '#EF4444',
        color: '#EF4444',
    },
    keyHint: {
        position: 'absolute',
        top: -10,
        right: -10,
        width: 24,
        height: 24,
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: 6,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        color: '#fff',
    },
    gameOverScreen: {
        marginTop: 40,
    },
    gameOverIcon: {
        fontSize: 80,
        marginBottom: 20,
    },
    gameOverTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 900,
        color: '#ff4444',
        marginBottom: 30,
    },
    finalStats: {
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 30,
    },
    statRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: 18,
        color: '#fff',
    },
    finalScore: {
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        color: '#FFD700',
    },
    exitButton: {
        padding: '14px 40px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 30,
        color: '#fff',
        cursor: 'pointer',
    },
};
