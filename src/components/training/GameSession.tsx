/**
 * GameSession.tsx
 * ================
 * The main UI component for God Mode training sessions.
 *
 * Features:
 * - 3-Engine Rendering (PIO/CHART/SCENARIO)
 * - Director Mode Intro Animation (Typewriter effect)
 * - Health Bar with damage shake
 * - Bet Slider with solver node snapping
 * - Active Villain with thinking delay
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// Import engine-specific components
import ChartGrid from './ChartGrid';
import MentalGym from './MentalGym';

// ============================================================================
// TYPES
// ============================================================================

type EngineType = 'PIO' | 'CHART' | 'SCENARIO';

type GamePhase =
    | 'LOADING'
    | 'DIRECTOR_INTRO'      // Typewriter animation
    | 'USER_TURN'           // Waiting for user action
    | 'VILLAIN_THINKING'    // Villain is deciding
    | 'SHOWING_RESULT'      // Showing correct/incorrect
    | 'HAND_COMPLETE'       // Ready for next hand
    | 'SESSION_COMPLETE';   // All hands done

interface HandData {
    heroCards: string;
    villainCards: string;
    board: string;
    potSize: number;
    heroStack: number;
    villainStack: number;
    heroPosition: string;
    villainPosition: string;
    actionHistory: ActionStep[];
    solverNode: SolverNode;
}

interface ActionStep {
    player: 'hero' | 'villain';
    action: string;
    amount?: number;
}

interface SolverNode {
    actions: {
        [key: string]: {
            frequency: number;
            ev: number;
        };
    };
}

interface GameSessionProps {
    userId: string;
    gameId: string;
    gameName: string;
    onSessionComplete?: (stats: SessionStats) => void;
    onExit?: () => void;
}

interface SessionStats {
    handsPlayed: number;
    correctAnswers: number;
    accuracy: number;
    passed: boolean;
    finalHealth: number;
    xpEarned: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOLVER_BET_NODES = [0, 25, 33, 50, 66, 75, 100, 150, 200]; // % of pot

const DIRECTOR_DELAY_MS = 800; // Time between typewriter lines
const VILLAIN_THINK_MS = 1500; // How long villain "thinks"
const RESULT_DISPLAY_MS = 2000; // How long to show result

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Find the nearest solver node for a bet size
 */
function snapToSolverNode(value: number): number {
    let closest = SOLVER_BET_NODES[0];
    let minDiff = Math.abs(value - closest);

    for (const node of SOLVER_BET_NODES) {
        const diff = Math.abs(value - node);
        if (diff < minDiff) {
            minDiff = diff;
            closest = node;
        }
    }

    return closest;
}

/**
 * Format card string for display (AhKs -> A♥ K♠)
 */
function formatCards(cards: string): string {
    if (!cards) return '';

    const suitSymbols: Record<string, string> = {
        s: '♠', h: '♥', d: '♦', c: '♣',
    };

    const suitColors: Record<string, string> = {
        s: '#1a1a2e', h: '#e63946', d: '#4361ee', c: '#2d6a4f',
    };

    // Parse cards (format: "AhKs" or "Ah Ks")
    const cardPattern = /([AKQJT98765432])([shdc])/g;
    let match;
    const formatted: string[] = [];

    while ((match = cardPattern.exec(cards)) !== null) {
        const [, rank, suit] = match;
        formatted.push(`${rank}${suitSymbols[suit]}`);
    }

    return formatted.join(' ');
}

/**
 * Play chip slide sound effect
 */
function playChipSound() {
    try {
        const audio = new Audio('/sounds/chip-slide.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => { }); // Ignore autoplay restrictions
    } catch (e) {
        // Audio not available
    }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Typewriter Text Animation for Director Mode
 */
const TypewriterText: React.FC<{
    text: string;
    onComplete?: () => void;
    delay?: number;
}> = ({ text, onComplete, delay = 50 }) => {
    const [displayText, setDisplayText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayText(prev => prev + text[currentIndex]);
                setCurrentIndex(prev => prev + 1);
            }, delay);
            return () => clearTimeout(timeout);
        } else if (onComplete) {
            onComplete();
        }
    }, [currentIndex, text, delay, onComplete]);

    return (
        <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="typewriter-text"
        >
            {displayText}
            <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
            >
                |
            </motion.span>
        </motion.span>
    );
};

/**
 * Health Bar Component with damage animation
 */
const HealthBar: React.FC<{
    health: number;
    maxHealth: number;
    showDamage: number;
}> = ({ health, maxHealth, showDamage }) => {
    const percentage = (health / maxHealth) * 100;

    // Color based on health level
    const getColor = () => {
        if (percentage > 60) return '#22c55e'; // Green
        if (percentage > 30) return '#f59e0b'; // Orange
        return '#ef4444'; // Red
    };

    return (
        <div className="health-bar-container">
            <div className="health-bar-label">
                <span>❤️ HP</span>
                <span>{health}/{maxHealth}</span>
            </div>
            <div className="health-bar-track">
                <motion.div
                    className="health-bar-fill"
                    initial={false}
                    animate={{
                        width: `${percentage}%`,
                        backgroundColor: getColor(),
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
                <AnimatePresence>
                    {showDamage > 0 && (
                        <motion.span
                            className="damage-indicator"
                            initial={{ opacity: 1, y: 0 }}
                            animate={{ opacity: 0, y: -20 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1 }}
                        >
                            -{showDamage}
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

/**
 * Bet Slider with Solver Node Snapping
 */
const BetSlider: React.FC<{
    value: number;
    onChange: (value: number) => void;
    onRelease: (snappedValue: number) => void;
    disabled: boolean;
    availableNodes: number[];
}> = ({ value, onChange, onRelease, disabled, availableNodes }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [displayValue, setDisplayValue] = useState(value);
    const [showSnap, setShowSnap] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = parseInt(e.target.value, 10);
        setDisplayValue(newValue);
        onChange(newValue);
    };

    const handleRelease = () => {
        setIsDragging(false);
        const snapped = snapToSolverNode(displayValue);

        if (snapped !== displayValue) {
            setShowSnap(true);
            setTimeout(() => setShowSnap(false), 500);
        }

        setDisplayValue(snapped);
        onRelease(snapped);
        playChipSound();
    };

    return (
        <div className="bet-slider-container">
            <div className="bet-slider-header">
                <span>Bet Size</span>
                <motion.span
                    className="bet-value"
                    animate={showSnap ? { scale: [1, 1.2, 1] } : {}}
                >
                    {displayValue}% pot
                    {showSnap && <span className="snap-icon">🧲</span>}
                </motion.span>
            </div>

            {/* Solver node markers */}
            <div className="slider-markers">
                {availableNodes.map(node => (
                    <div
                        key={node}
                        className="marker"
                        style={{ left: `${(node / 200) * 100}%` }}
                    >
                        <span className="marker-dot" />
                        <span className="marker-label">{node}%</span>
                    </div>
                ))}
            </div>

            <input
                type="range"
                min="0"
                max="200"
                value={displayValue}
                onChange={handleChange}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={handleRelease}
                onTouchEnd={handleRelease}
                disabled={disabled}
                className={`bet-slider ${isDragging ? 'dragging' : ''}`}
            />
        </div>
    );
};

/**
 * Action Buttons (Fold, Check/Call, Bet/Raise)
 */
const ActionButtons: React.FC<{
    onAction: (action: string, sizing?: number) => void;
    disabled: boolean;
    canCheck: boolean;
    betSizing: number;
}> = ({ onAction, disabled, canCheck, betSizing }) => {
    return (
        <div className="action-buttons">
            <motion.button
                className="action-btn fold"
                onClick={() => onAction('FOLD')}
                disabled={disabled}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                FOLD
            </motion.button>

            <motion.button
                className="action-btn check-call"
                onClick={() => onAction(canCheck ? 'CHECK' : 'CALL')}
                disabled={disabled}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                {canCheck ? 'CHECK' : 'CALL'}
            </motion.button>

            <motion.button
                className="action-btn bet-raise"
                onClick={() => onAction('BET', betSizing)}
                disabled={disabled}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                BET {betSizing}%
            </motion.button>
        </div>
    );
};

/**
 * Poker Table Display (CHIP Style)
 */
const PokerTable: React.FC<{
    hand: HandData;
    showVillainCards: boolean;
}> = ({ hand, showVillainCards }) => {
    return (
        <div className="poker-table">
            {/* Villain Area */}
            <div className="player-area villain">
                <div className="position-badge">{hand.villainPosition}</div>
                <div className="cards">
                    {showVillainCards ? formatCards(hand.villainCards) : '🂠 🂠'}
                </div>
                <div className="stack">{hand.villainStack} BB</div>
            </div>

            {/* Board */}
            <motion.div
                className="board"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
            >
                <div className="board-cards">
                    {formatCards(hand.board)}
                </div>
                <div className="pot-display">
                    Pot: {hand.potSize} BB
                </div>
            </motion.div>

            {/* Hero Area */}
            <div className="player-area hero">
                <div className="position-badge">{hand.heroPosition}</div>
                <motion.div
                    className="cards hero-cards"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    {formatCards(hand.heroCards)}
                </motion.div>
                <div className="stack">{hand.heroStack} BB</div>
            </div>
        </div>
    );
};

/**
 * Result Overlay (Correct/Incorrect feedback)
 */
const ResultOverlay: React.FC<{
    isCorrect: boolean;
    damage: number;
    feedback: string;
    evLoss: number;
}> = ({ isCorrect, damage, feedback, evLoss }) => {
    return (
        <motion.div
            className={`result-overlay ${isCorrect ? 'correct' : 'incorrect'}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
        >
            <motion.div
                className="result-icon"
                animate={isCorrect ? { rotate: [0, 10, -10, 0] } : { x: [0, -10, 10, -10, 10, 0] }}
                transition={{ duration: 0.5 }}
            >
                {isCorrect ? '✅' : '❌'}
            </motion.div>

            <h2 className="result-title">
                {isCorrect ? 'Correct!' : 'Mistake!'}
            </h2>

            <p className="result-feedback">{feedback}</p>

            {!isCorrect && (
                <div className="result-stats">
                    <span>EV Loss: {evLoss.toFixed(2)} BB</span>
                    <span>HP Damage: -{damage}</span>
                </div>
            )}

            {isCorrect && (
                <motion.div
                    className="xp-bonus"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <span className="sparkle">✨</span>
                    +10 XP
                    <span className="sparkle">✨</span>
                </motion.div>
            )}
        </motion.div>
    );
};

// ============================================================================
// ENGINE COMPONENTS (ChartGrid & MentalGym imported above)
// ============================================================================

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const GameSession: React.FC<GameSessionProps> = ({
    userId,
    gameId,
    gameName,
    onSessionComplete,
    onExit,
}) => {
    // ========================================================================
    // STATE
    // ========================================================================

    const [phase, setPhase] = useState<GamePhase>('LOADING');
    const [engineType, setEngineType] = useState<EngineType>('PIO');
    const [currentHand, setCurrentHand] = useState<HandData | null>(null);
    const [handNumber, setHandNumber] = useState(0);
    const [totalHands] = useState(20); // Hands per round
    const [currentLevel, setCurrentLevel] = useState(1);

    // Health & Progress
    const [health, setHealth] = useState(100);
    const [maxHealth] = useState(100);
    const [showDamage, setShowDamage] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);

    // Director Mode
    const [directorLines, setDirectorLines] = useState<string[]>([]);
    const [currentLineIndex, setCurrentLineIndex] = useState(0);

    // Input Controls
    const [betSizing, setBetSizing] = useState(50);
    const [isControlsLocked, setIsControlsLocked] = useState(true);

    // Result Display
    const [showResult, setShowResult] = useState(false);
    const [lastResult, setLastResult] = useState<{
        isCorrect: boolean;
        damage: number;
        feedback: string;
        evLoss: number;
    } | null>(null);

    // CHART Engine State
    const [chartFeedback, setChartFeedback] = useState<{
        hand: string;
        isCorrect: boolean;
        correctAction: string;
    } | null>(null);
    const [chartPhase, setChartPhase] = useState<'SELECT_HAND' | 'SELECT_ACTION' | 'SHOWING_RESULT'>('SELECT_HAND');

    // SCENARIO Engine State
    const [scenarioFeedback, setScenarioFeedback] = useState<{
        choiceId: string;
        isCorrect: boolean;
        explanation: string;
        emotionalLesson?: string;
    } | null>(null);
    const [scenarioPhase, setScenarioPhase] = useState<'READING' | 'DECIDING' | 'SHOWING_RESULT'>('DECIDING');

    // Animation controls
    const screenControls = useAnimation();

    // ========================================================================
    // API CALLS
    // ========================================================================

    const fetchNextHand = useCallback(async () => {
        setPhase('LOADING');

        try {
            const response = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    currentLevel,
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('Error fetching hand:', data.error);
                return;
            }

            setEngineType(data.engineType);

            if (data.engineType === 'PIO') {
                // Transform to frontend format
                const hand: HandData = {
                    heroCards: data.hand.hero_hand || '',
                    villainCards: data.hand.villain_hand || '??',
                    board: data.hand.board || '',
                    potSize: data.hand.pot || 6,
                    heroStack: data.hand.hero_stack || 100,
                    villainStack: data.hand.villain_stack || 100,
                    heroPosition: data.hand.hero_position || 'BTN',
                    villainPosition: data.hand.villain_position || 'BB',
                    actionHistory: data.hand.action_history || [],
                    solverNode: data.hand.solver_node || { actions: {} },
                };

                setCurrentHand(hand);
                setHandNumber(prev => prev + 1);

                // Build director lines from action history
                const lines = buildDirectorLines(hand);
                setDirectorLines(lines);
                setCurrentLineIndex(0);
                setPhase('DIRECTOR_INTRO');

            } else {
                // CHART or SCENARIO - direct to user turn
                setCurrentHand(data);
                setHandNumber(prev => prev + 1);
                setPhase('USER_TURN');

                // Reset engine-specific states
                if (data.engineType === 'CHART') {
                    setChartPhase('SELECT_HAND');
                    setChartFeedback(null);
                }
                if (data.engineType === 'SCENARIO') {
                    setScenarioPhase('DECIDING');
                    setScenarioFeedback(null);
                }
            }

        } catch (error) {
            console.error('Failed to fetch hand:', error);
        }
    }, [userId, gameId, currentLevel]);

    const submitAction = useCallback(async (action: string, sizingOrHand?: number | string) => {
        if (!currentHand) return;

        setIsControlsLocked(true);

        // Determine if second param is sizing (number) or hand (string for CHART)
        const sizing = typeof sizingOrHand === 'number' ? sizingOrHand : undefined;
        const selectedHand = typeof sizingOrHand === 'string' ? sizingOrHand : undefined;

        try {
            const response = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    action,
                    sizing,
                    selectedHand,  // For CHART engine
                    handData: currentHand,
                    engineType,
                }),
            });

            const result = await response.json();

            // Store result for display
            setLastResult({
                isCorrect: result.isCorrect,
                damage: result.hpDamage,
                feedback: result.feedback,
                evLoss: result.evLoss,
            });

            // Engine-specific feedback
            if (engineType === 'CHART' && selectedHand) {
                setChartFeedback({
                    hand: selectedHand,
                    isCorrect: result.isCorrect,
                    correctAction: result.correctAction || action,
                });
            }

            if (engineType === 'SCENARIO') {
                setScenarioFeedback({
                    choiceId: action,
                    isCorrect: result.isCorrect,
                    explanation: result.explanation || result.feedback,
                    emotionalLesson: result.emotionalLesson,
                });
            }

            // Apply damage
            if (result.hpDamage > 0) {
                setHealth(prev => Math.max(0, prev - result.hpDamage));
                setShowDamage(result.hpDamage);

                // Screen shake for damage
                await screenControls.start({
                    x: [0, -10, 10, -10, 10, 0],
                    transition: { duration: 0.4 },
                });

                setTimeout(() => setShowDamage(0), 1000);
            }

            if (result.isCorrect) {
                setCorrectCount(prev => prev + 1);
            }

            // Show result overlay
            setPhase('SHOWING_RESULT');
            setShowResult(true);

            // Check if hand continues (villain's turn)
            if (result.continuation) {
                setTimeout(async () => {
                    setShowResult(false);
                    setPhase('VILLAIN_THINKING');

                    // Simulate villain thinking
                    setTimeout(() => {
                        // Update board with new card if applicable
                        if (result.newCard) {
                            setCurrentHand(prev => prev ? {
                                ...prev,
                                board: prev.board + result.newCard,
                            } : null);
                        }

                        setPhase('USER_TURN');
                        setIsControlsLocked(false);
                    }, VILLAIN_THINK_MS);

                }, RESULT_DISPLAY_MS);
            } else {
                // Hand complete, move to next
                setTimeout(() => {
                    setShowResult(false);

                    // Check if session complete
                    if (handNumber >= totalHands || health <= 0) {
                        completeSession();
                    } else {
                        fetchNextHand();
                    }
                }, RESULT_DISPLAY_MS);
            }

        } catch (error) {
            console.error('Failed to submit action:', error);
            setIsControlsLocked(false);
        }
    }, [currentHand, userId, gameId, handNumber, totalHands, health, screenControls, fetchNextHand]);

    // ========================================================================
    // HELPERS
    // ========================================================================

    const buildDirectorLines = (hand: HandData): string[] => {
        const lines: string[] = [];

        // Add action history as director lines
        for (const action of hand.actionHistory) {
            const player = action.player === 'hero' ? 'Hero' : 'Villain';
            const pos = action.player === 'hero' ? hand.heroPosition : hand.villainPosition;

            let line = `${player} (${pos}) `;

            if (action.action === 'raises') {
                line += `Raises to ${action.amount} BB...`;
            } else if (action.action === 'calls') {
                line += 'Calls...';
            } else if (action.action === 'checks') {
                line += 'Checks...';
            } else if (action.action === 'bets') {
                line += `Bets ${action.amount} BB...`;
            } else {
                line += `${action.action}...`;
            }

            lines.push(line);
        }

        // Add flop reveal if board exists
        if (hand.board && hand.board.length >= 6) {
            lines.push(`Flop: ${formatCards(hand.board.slice(0, 6))} 🃏`);
        }

        return lines;
    };

    const completeSession = () => {
        setPhase('SESSION_COMPLETE');

        const accuracy = handNumber > 0 ? (correctCount / handNumber) * 100 : 0;
        const thresholds = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100];
        const passed = accuracy >= (thresholds[currentLevel - 1] || 85);

        const stats: SessionStats = {
            handsPlayed: handNumber,
            correctAnswers: correctCount,
            accuracy,
            passed,
            finalHealth: health,
            xpEarned: correctCount * 10 + (passed ? 100 : 0),
        };

        onSessionComplete?.(stats);
    };

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Initial load
    useEffect(() => {
        fetchNextHand();
    }, [fetchNextHand]);

    // Director mode progression
    useEffect(() => {
        if (phase === 'DIRECTOR_INTRO' && currentLineIndex < directorLines.length) {
            // Wait for typewriter to complete, then show next line
            const timer = setTimeout(() => {
                playChipSound();
                setCurrentLineIndex(prev => prev + 1);
            }, DIRECTOR_DELAY_MS + directorLines[currentLineIndex].length * 40);

            return () => clearTimeout(timer);
        } else if (phase === 'DIRECTOR_INTRO' && currentLineIndex >= directorLines.length) {
            // Director complete, unlock controls
            setTimeout(() => {
                setPhase('USER_TURN');
                setIsControlsLocked(false);
            }, 500);
        }
    }, [phase, currentLineIndex, directorLines]);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <motion.div
            className="game-session"
            animate={screenControls}
        >
            {/* Header */}
            <header className="game-header">
                <div className="game-info">
                    <h1>{gameName}</h1>
                    <span className="level-badge">Level {currentLevel}</span>
                </div>

                <div className="progress-info">
                    <span>Hand {handNumber}/{totalHands}</span>
                    <span>|</span>
                    <span>{correctCount} Correct</span>
                </div>

                <HealthBar
                    health={health}
                    maxHealth={maxHealth}
                    showDamage={showDamage}
                />

                <button className="exit-btn" onClick={onExit}>
                    ✕
                </button>
            </header>

            {/* Main Content */}
            <main className="game-content">
                {/* Loading State */}
                {phase === 'LOADING' && (
                    <div className="loading-state">
                        <motion.div
                            className="loading-spinner"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                            🎰
                        </motion.div>
                        <p>Dealing hand...</p>
                    </div>
                )}

                {/* Director Mode Intro */}
                <AnimatePresence>
                    {phase === 'DIRECTOR_INTRO' && (
                        <motion.div
                            className="director-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="director-content">
                                {directorLines.slice(0, currentLineIndex + 1).map((line, index) => (
                                    <motion.div
                                        key={index}
                                        className="director-line"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                    >
                                        {index === currentLineIndex ? (
                                            <TypewriterText text={line} />
                                        ) : (
                                            <span>{line}</span>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* PIO Engine: Poker Table */}
                {engineType === 'PIO' && currentHand && phase !== 'LOADING' && (
                    <>
                        <PokerTable
                            hand={currentHand}
                            showVillainCards={phase === 'SESSION_COMPLETE'}
                        />

                        {/* Villain Thinking State */}
                        <AnimatePresence>
                            {phase === 'VILLAIN_THINKING' && (
                                <motion.div
                                    className="villain-thinking"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <span className="thinking-dots">
                                        Villain is thinking
                                        <motion.span
                                            animate={{ opacity: [0, 1, 0] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        >
                                            ...
                                        </motion.span>
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}

                {/* CHART Engine: Chart Grid */}
                {engineType === 'CHART' && currentHand && (
                    <ChartGrid
                        chartType={(currentHand as any).chartType || 'push_fold'}
                        heroPosition={(currentHand as any).heroPosition || 'BTN'}
                        stackBB={(currentHand as any).stackBB || 15}
                        villainPosition={(currentHand as any).villainPosition}
                        correctRange={(currentHand as any).correctRange}
                        highlightHand={(currentHand as any).highlightHand}
                        phase={chartPhase}
                        resultFeedback={chartFeedback}
                        onAction={(action, hand) => {
                            // Handle chart action
                            setChartPhase('SHOWING_RESULT');
                            submitAction(action, hand);
                        }}
                    />
                )}

                {/* SCENARIO Engine: Mental Gym */}
                {engineType === 'SCENARIO' && currentHand && (
                    <MentalGym
                        scenarioId={(currentHand as any).scenarioId || 'tilt-control'}
                        scriptName={(currentHand as any).scriptName || 'bad_beats'}
                        scenarioText={(currentHand as any).scenarioText || 'You just lost 3 buy-ins. How do you respond?'}
                        situationContext={(currentHand as any).situationContext}
                        choices={(currentHand as any).choices || [
                            { id: 'TILT', label: 'Express Frustration', icon: '😤', emotionalType: 'impulsive' },
                            { id: 'BREATHE', label: 'Take a Deep Breath', icon: '🧘', emotionalType: 'rational' },
                            { id: 'LEAVE', label: 'Leave the Table', icon: '🚪', emotionalType: 'passive' },
                        ]}
                        correctChoice={(currentHand as any).correctChoice || 'BREATHE'}
                        timeLimit={(currentHand as any).timeLimit || 15}
                        riggedOutcome={(currentHand as any).riggedOutcome}
                        emotionalTrigger={(currentHand as any).emotionalTrigger}
                        phase={scenarioPhase}
                        resultFeedback={scenarioFeedback}
                        onChoice={(choiceId, timeRemaining) => {
                            // Handle scenario choice
                            setScenarioPhase('SHOWING_RESULT');
                            submitAction(choiceId);
                        }}
                    />
                )}

                {/* Result Overlay */}
                <AnimatePresence>
                    {showResult && lastResult && (
                        <ResultOverlay
                            isCorrect={lastResult.isCorrect}
                            damage={lastResult.damage}
                            feedback={lastResult.feedback}
                            evLoss={lastResult.evLoss}
                        />
                    )}
                </AnimatePresence>

                {/* Session Complete */}
                {phase === 'SESSION_COMPLETE' && (
                    <motion.div
                        className="session-complete"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <h2>Session Complete!</h2>
                        <div className="final-stats">
                            <p>Accuracy: {((correctCount / handNumber) * 100).toFixed(1)}%</p>
                            <p>Final HP: {health}/{maxHealth}</p>
                            <p>XP Earned: {correctCount * 10 + (health > 0 ? 100 : 0)}</p>
                        </div>
                        <button onClick={onExit}>Continue</button>
                    </motion.div>
                )}
            </main>

            {/* Controls (PIO Engine Only) */}
            {engineType === 'PIO' && phase === 'USER_TURN' && (
                <footer className="game-controls">
                    <BetSlider
                        value={betSizing}
                        onChange={setBetSizing}
                        onRelease={(snapped) => setBetSizing(snapped)}
                        disabled={isControlsLocked}
                        availableNodes={SOLVER_BET_NODES}
                    />

                    <ActionButtons
                        onAction={submitAction}
                        disabled={isControlsLocked}
                        canCheck={true} // TODO: Determine from hand state
                        betSizing={betSizing}
                    />
                </footer>
            )}

            {/* Styles */}
            <style jsx>{`
        .game-session {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
          color: white;
          font-family: 'Inter', sans-serif;
        }

        .game-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 2rem;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .game-info h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .level-badge {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          font-size: 0.875rem;
          font-weight: 600;
          margin-left: 0.75rem;
        }

        .progress-info {
          display: flex;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .health-bar-container {
          min-width: 200px;
        }

        .health-bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .health-bar-track {
          height: 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          overflow: hidden;
          position: relative;
        }

        .health-bar-fill {
          height: 100%;
          border-radius: 6px;
        }

        .damage-indicator {
          position: absolute;
          right: 0;
          top: -20px;
          color: #ef4444;
          font-weight: bold;
          font-size: 1.25rem;
        }

        .exit-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1.25rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .exit-btn:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .game-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .loading-spinner {
          font-size: 3rem;
        }

        .director-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        .director-content {
          max-width: 600px;
          padding: 2rem;
        }

        .director-line {
          font-size: 1.5rem;
          margin: 1rem 0;
          color: #f59e0b;
          font-family: 'Courier New', monospace;
        }

        .poker-table {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .player-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .position-badge {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .cards {
          font-size: 2rem;
          letter-spacing: 0.5rem;
        }

        .hero-cards {
          color: #22c55e;
        }

        .stack {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .board {
          padding: 2rem 3rem;
          background: linear-gradient(135deg, #166534, #14532d);
          border-radius: 12px;
          border: 4px solid #ca8a04;
          text-align: center;
        }

        .board-cards {
          font-size: 2.5rem;
          letter-spacing: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .pot-display {
          font-size: 1.25rem;
          color: #f59e0b;
        }

        .villain-thinking {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.8);
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.25rem;
        }

        .result-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 20;
        }

        .result-overlay.correct {
          background: rgba(34, 197, 94, 0.9);
        }

        .result-overlay.incorrect {
          background: rgba(239, 68, 68, 0.9);
        }

        .result-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .result-title {
          font-size: 2rem;
          margin: 0;
        }

        .result-feedback {
          font-size: 1.25rem;
          opacity: 0.9;
        }

        .result-stats {
          display: flex;
          gap: 2rem;
          margin-top: 1rem;
          font-size: 1rem;
        }

        .xp-bonus {
          font-size: 1.5rem;
          font-weight: bold;
          color: #fcd34d;
        }

        .sparkle {
          margin: 0 0.5rem;
        }

        .session-complete {
          text-align: center;
          padding: 2rem;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 16px;
          border: 2px solid #ca8a04;
        }

        .session-complete h2 {
          font-size: 2rem;
          margin-bottom: 1rem;
          color: #f59e0b;
        }

        .final-stats {
          margin: 1.5rem 0;
        }

        .final-stats p {
          margin: 0.5rem 0;
          font-size: 1.25rem;
        }

        .session-complete button {
          padding: 0.75rem 2rem;
          font-size: 1.25rem;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-weight: 600;
        }

        .game-controls {
          padding: 1.5rem 2rem;
          background: rgba(0, 0, 0, 0.5);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .bet-slider-container {
          margin-bottom: 1rem;
        }

        .bet-slider-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .bet-value {
          font-weight: 600;
          color: #f59e0b;
        }

        .snap-icon {
          margin-left: 0.5rem;
        }

        .slider-markers {
          position: relative;
          height: 20px;
          margin-bottom: -10px;
        }

        .marker {
          position: absolute;
          transform: translateX(-50%);
          text-align: center;
        }

        .marker-dot {
          display: block;
          width: 4px;
          height: 8px;
          background: rgba(255, 255, 255, 0.3);
          margin: 0 auto;
        }

        .marker-label {
          font-size: 0.625rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .bet-slider {
          width: 100%;
          height: 8px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          outline: none;
        }

        .bet-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px;
          height: 24px;
          background: #f59e0b;
          border-radius: 50%;
          cursor: pointer;
        }

        .bet-slider.dragging::-webkit-slider-thumb {
          transform: scale(1.2);
        }

        .action-buttons {
          display: flex;
          gap: 1rem;
        }

        .action-btn {
          flex: 1;
          padding: 1rem;
          font-size: 1.125rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .action-btn.fold {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          color: white;
        }

        .action-btn.check-call {
          background: linear-gradient(135deg, #059669, #047857);
          color: white;
        }

        .action-btn.bet-raise {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
        }

        /* Engine-specific styles (ChartGrid & MentalGym handle their own styling) */

        .chart-actions button,
        .scenario-choices button {
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: white;
          cursor: pointer;
        }

        .chart-actions button:hover,
        .scenario-choices button:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
        </motion.div>
    );
};

export default GameSession;
