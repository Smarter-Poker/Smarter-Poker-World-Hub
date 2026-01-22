/**
 * GameArena.tsx
 * ==============
 * The HUD wrapper for God Mode training sessions.
 * Contains health bar, hand counter, and engine rendering.
 *
 * Features:
 * - Visual HP bar with damage animation (Green → Yellow → Red)
 * - Hand counter "Hand: X / 20"
 * - Quit button to exit session
 * - Conditional engine rendering (PIO/CHART/SCENARIO)
 * - Level Failed modal when HP reaches 0
 * - Session Complete modal with stats
 * - XP earned display with animations
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// Engine Components
import ChartGrid from './ChartGrid';
import MentalGym from './MentalGym';
import RoundSummary from './RoundSummary';

// ============================================================================
// TYPES
// ============================================================================

type EngineType = 'PIO' | 'CHART' | 'SCENARIO';

interface GameArenaProps {
    userId: string;
    gameId: string;
    gameName: string;
    level: number;
    sessionId?: string;
    onExit: () => void;
    onLevelComplete: (stats: SessionStats) => void;
    onLevelFailed: () => void;
}

interface BlunderData {
    handNumber: number;
    heroHand: string;
    board?: string;
    userAction: string;
    correctAction: string;
    evLoss: number;
    damage: number;
}

interface SessionStats {
    handsPlayed: number;
    correctAnswers: number;
    accuracy: number;
    passed: boolean;
    finalHealth: number;
    xpEarned: number;
    timeElapsed: number;
    blunders: BlunderData[];
    streakBest?: number;
    perfectHands?: number;
}

interface HandData {
    handId: string;
    engineType: EngineType;
    // PIO Engine
    heroCards?: string;
    villainCards?: string;
    board?: string;
    potSize?: number;
    heroStack?: number;
    villainStack?: number;
    heroPosition?: string;
    villainPosition?: string;
    actionHistory?: any[];
    solverNode?: any;
    // CHART Engine
    chartType?: string;
    stackBB?: number;
    highlightHand?: string;
    correctRange?: string[];
    // SCENARIO Engine
    scenarioId?: string;
    scriptName?: string;
    scenarioText?: string;
    situationContext?: string;
    choices?: any[];
    correctChoice?: string;
    timeLimit?: number;
    riggedOutcome?: string;
    emotionalTrigger?: string;
}

interface ActionResult {
    isCorrect: boolean;
    damage: number;
    feedback: string;
    evLoss?: number;
    correctAction?: string;
    explanation?: string;
    emotionalLesson?: string;
    xpEarned: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TOTAL_HANDS = 20;
const STARTING_HEALTH = 100;
const PASSING_GRADES = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100];

// ============================================================================
// HEALTH BAR COMPONENT
// ============================================================================

const HealthBar: React.FC<{
    current: number;
    max: number;
    showDamage: number;
    onDamageComplete: () => void;
}> = ({ current, max, showDamage, onDamageComplete }) => {
    const percentage = Math.max(0, (current / max) * 100);
    const controls = useAnimation();

    // Determine color based on health
    const getHealthColor = () => {
        if (percentage > 60) return { primary: '#4CAF50', secondary: '#8BC34A' };
        if (percentage > 30) return { primary: '#FF9800', secondary: '#FFC107' };
        return { primary: '#F44336', secondary: '#FF5722' };
    };

    const colors = getHealthColor();

    // Shake animation on damage
    useEffect(() => {
        if (showDamage > 0) {
            controls.start({
                x: [0, -10, 10, -10, 10, 0],
                transition: { duration: 0.4 },
            }).then(onDamageComplete);
        }
    }, [showDamage, controls, onDamageComplete]);

    return (
        <motion.div animate={controls} style={styles.healthContainer}>
            <div style={styles.healthLabel}>
                <span style={styles.healthIcon}>❤️</span>
                <span style={styles.healthText}>HP</span>
            </div>

            <div style={styles.healthTrack}>
                <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{
                        ...styles.healthFill,
                        background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
                    }}
                />

                {/* Health segments */}
                <div style={styles.healthSegments}>
                    {[...Array(10)].map((_, i) => (
                        <div key={i} style={styles.healthSegment} />
                    ))}
                </div>
            </div>

            <div style={styles.healthValue}>
                <span style={{ color: colors.primary, fontWeight: 800 }}>{current}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>/{max}</span>
            </div>

            {/* Floating damage indicator */}
            <AnimatePresence>
                {showDamage > 0 && (
                    <motion.div
                        initial={{ opacity: 1, y: 0, scale: 1 }}
                        animate={{ opacity: 0, y: -30, scale: 1.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        style={styles.damageIndicator}
                    >
                        -{showDamage}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ============================================================================
// HAND COUNTER COMPONENT
// ============================================================================

const HandCounter: React.FC<{
    current: number;
    total: number;
    correctCount: number;
}> = ({ current, total, correctCount }) => {
    const accuracy = current > 0 ? Math.round((correctCount / current) * 100) : 0;

    return (
        <div style={styles.handCounter}>
            <div style={styles.handCounterMain}>
                <span style={styles.handLabel}>HAND</span>
                <span style={styles.handValue}>{current}</span>
                <span style={styles.handDivider}>/</span>
                <span style={styles.handTotal}>{total}</span>
            </div>
            {current > 0 && (
                <div style={styles.accuracyBadge}>
                    <span style={{
                        color: accuracy >= 85 ? '#4CAF50' : accuracy >= 70 ? '#FF9800' : '#F44336',
                    }}>
                        {accuracy}%
                    </span>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// XP DISPLAY COMPONENT
// ============================================================================

const XPDisplay: React.FC<{
    totalXP: number;
    recentXP: number;
}> = ({ totalXP, recentXP }) => {
    return (
        <div style={styles.xpDisplay}>
            <span style={styles.xpIcon}>⭐</span>
            <span style={styles.xpValue}>{totalXP}</span>
            <span style={styles.xpLabel}>XP</span>

            <AnimatePresence>
                {recentXP > 0 && (
                    <motion.span
                        initial={{ opacity: 1, x: 0 }}
                        animate={{ opacity: 0, x: 20 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        style={styles.xpGain}
                    >
                        +{recentXP}
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// LEVEL FAILED MODAL
// ============================================================================

const LevelFailedModal: React.FC<{
    onRetry: () => void;
    onExit: () => void;
    stats: SessionStats;
}> = ({ onRetry, onExit, stats }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={styles.modalOverlay}
        >
            <motion.div
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                style={styles.failedModal}
            >
                <div style={styles.failedIcon}>💀</div>
                <h2 style={styles.failedTitle}>Level Failed</h2>
                <p style={styles.failedSubtitle}>Your health reached zero!</p>

                <div style={styles.failedStats}>
                    <div style={styles.statRow}>
                        <span>Hands Played</span>
                        <span>{stats.handsPlayed} / {TOTAL_HANDS}</span>
                    </div>
                    <div style={styles.statRow}>
                        <span>Accuracy</span>
                        <span>{stats.accuracy.toFixed(1)}%</span>
                    </div>
                    <div style={styles.statRow}>
                        <span>XP Earned</span>
                        <span>{stats.xpEarned}</span>
                    </div>
                </div>

                <div style={styles.modalButtons}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onRetry}
                        style={styles.retryButton}
                    >
                        🔄 Try Again
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onExit}
                        style={styles.exitButton}
                    >
                        Exit
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ============================================================================
// PIO ENGINE PLACEHOLDER (Full implementation in GameSession.tsx)
// ============================================================================

const PIOEngine: React.FC<{
    handData: HandData;
    onAction: (action: string, sizing?: number) => void;
    isLocked: boolean;
}> = ({ handData, onAction, isLocked }) => {
    // This is a simplified version - the full PIO engine is in GameSession.tsx
    // For production, you'd import the poker table components here

    return (
        <div style={styles.pioContainer}>
            <div style={styles.tableArea}>
                {/* Board Cards */}
                <div style={styles.boardSection}>
                    <div style={styles.boardLabel}>BOARD</div>
                    <div style={styles.boardCards}>
                        {handData.board ? (
                            handData.board.split(' ').map((card, i) => (
                                <div key={i} style={styles.card}>{card}</div>
                            ))
                        ) : (
                            <div style={styles.preflop}>Preflop</div>
                        )}
                    </div>
                </div>

                {/* Hero Hand */}
                <div style={styles.heroSection}>
                    <div style={styles.positionBadge}>{handData.heroPosition}</div>
                    <div style={styles.heroCards}>
                        {handData.heroCards?.split('').reduce((acc: string[], char, i, arr) => {
                            if (i % 2 === 0) acc.push(arr.slice(i, i + 2).join(''));
                            return acc;
                        }, []).map((card, i) => (
                            <div key={i} style={styles.heroCard}>{card}</div>
                        ))}
                    </div>
                    <div style={styles.stackInfo}>
                        Stack: {handData.heroStack} BB | Pot: {handData.potSize} BB
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div style={styles.actionBar}>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAction('FOLD')}
                    disabled={isLocked}
                    style={{ ...styles.actionButton, ...styles.foldButton }}
                >
                    FOLD
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAction('CHECK')}
                    disabled={isLocked}
                    style={{ ...styles.actionButton, ...styles.checkButton }}
                >
                    CHECK
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAction('CALL')}
                    disabled={isLocked}
                    style={{ ...styles.actionButton, ...styles.callButton }}
                >
                    CALL
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onAction('BET', 50)}
                    disabled={isLocked}
                    style={{ ...styles.actionButton, ...styles.betButton }}
                >
                    BET 50%
                </motion.button>
            </div>
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const GameArena: React.FC<GameArenaProps> = ({
    userId,
    gameId,
    gameName,
    level,
    sessionId,
    onExit,
    onLevelComplete,
    onLevelFailed,
}) => {
    // Session State
    const [health, setHealth] = useState(STARTING_HEALTH);
    const [handNumber, setHandNumber] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [totalXP, setTotalXP] = useState(0);
    const [recentXP, setRecentXP] = useState(0);
    const [showDamage, setShowDamage] = useState(0);

    // Blunder & Streak Tracking
    const [blunders, setBlunders] = useState<BlunderData[]>([]);
    const [currentStreak, setCurrentStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [perfectHands, setPerfectHands] = useState(0);

    // Game State
    const [engineType, setEngineType] = useState<EngineType>('PIO');
    const [currentHand, setCurrentHand] = useState<HandData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLocked, setIsLocked] = useState(false);

    // CHART Engine State
    const [chartPhase, setChartPhase] = useState<'SELECT_HAND' | 'SELECT_ACTION' | 'SHOWING_RESULT'>('SELECT_HAND');
    const [chartFeedback, setChartFeedback] = useState<any>(null);

    // SCENARIO Engine State
    const [scenarioPhase, setScenarioPhase] = useState<'READING' | 'DECIDING' | 'SHOWING_RESULT'>('DECIDING');
    const [scenarioFeedback, setScenarioFeedback] = useState<any>(null);

    // Modal State
    const [showFailed, setShowFailed] = useState(false);
    const [showComplete, setShowComplete] = useState(false);
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

    // Timer
    const startTimeRef = useRef(Date.now());

    // ========================================================================
    // FETCH NEXT HAND
    // ========================================================================

    const fetchNextHand = useCallback(async () => {
        setIsLoading(true);
        setIsLocked(true);

        try {
            const response = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    level,
                    sessionId,
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('Error fetching hand:', data.error);
                return;
            }

            // Set engine type and hand data
            setEngineType(data.engineType || 'PIO');
            setCurrentHand(data);
            setHandNumber(prev => prev + 1);

            // Reset engine-specific states
            if (data.engineType === 'CHART') {
                setChartPhase('SELECT_HAND');
                setChartFeedback(null);
            }
            if (data.engineType === 'SCENARIO') {
                setScenarioPhase('DECIDING');
                setScenarioFeedback(null);
            }

        } catch (error) {
            console.error('Failed to fetch hand:', error);
        } finally {
            setIsLoading(false);
            setIsLocked(false);
        }
    }, [userId, gameId, level, sessionId]);

    // ========================================================================
    // SUBMIT ACTION
    // ========================================================================

    const submitAction = useCallback(async (action: string, extra?: string | number) => {
        if (!currentHand || isLocked) return;

        setIsLocked(true);

        try {
            const response = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    action,
                    sizing: typeof extra === 'number' ? extra : undefined,
                    selectedHand: typeof extra === 'string' ? extra : undefined,
                    handData: currentHand,
                    engineType,
                    level,
                }),
            });

            const result: ActionResult = await response.json();

            // Update correct count and streak tracking
            if (result.isCorrect) {
                setCorrectCount(prev => prev + 1);
                setCurrentStreak(prev => {
                    const newStreak = prev + 1;
                    setBestStreak(best => Math.max(best, newStreak));
                    return newStreak;
                });
                // Track perfect hands (no damage taken)
                if (result.damage === 0) {
                    setPerfectHands(prev => prev + 1);
                }
            } else {
                // Reset streak on wrong answer
                setCurrentStreak(0);

                // Collect blunder data
                const blunderData: BlunderData = {
                    handNumber: handNumber + 1,
                    heroHand: currentHand?.heroCards || currentHand?.highlightHand || 'Unknown',
                    board: currentHand?.board,
                    userAction: action,
                    correctAction: result.correctAction || 'Unknown',
                    evLoss: result.evLoss || 0,
                    damage: result.damage || 0,
                };
                setBlunders(prev => [...prev, blunderData]);
            }

            // Apply damage
            if (result.damage > 0) {
                setHealth(prev => {
                    const newHealth = Math.max(0, prev - result.damage);
                    if (newHealth <= 0) {
                        // Trigger failed modal after animation
                        setTimeout(() => {
                            const stats = calculateStats();
                            setSessionStats(stats);
                            setShowFailed(true);
                            onLevelFailed();
                        }, 500);
                    }
                    return newHealth;
                });
                setShowDamage(result.damage);
            }

            // Award XP
            if (result.xpEarned > 0) {
                setTotalXP(prev => prev + result.xpEarned);
                setRecentXP(result.xpEarned);
                setTimeout(() => setRecentXP(0), 1000);
            }

            // Engine-specific feedback
            if (engineType === 'CHART') {
                setChartFeedback({
                    hand: extra as string,
                    isCorrect: result.isCorrect,
                    correctAction: result.correctAction || action,
                });
                setChartPhase('SHOWING_RESULT');
            }

            if (engineType === 'SCENARIO') {
                setScenarioFeedback({
                    choiceId: action,
                    isCorrect: result.isCorrect,
                    explanation: result.explanation || result.feedback,
                    emotionalLesson: result.emotionalLesson,
                });
                setScenarioPhase('SHOWING_RESULT');
            }

            // Check if session complete
            if (handNumber >= TOTAL_HANDS) {
                const stats = calculateStats();
                const passingGrade = PASSING_GRADES[level - 1] || 85;
                stats.passed = stats.accuracy >= passingGrade;
                setSessionStats(stats);
                setShowComplete(true);

                if (stats.passed) {
                    onLevelComplete(stats);
                }
            } else {
                // Fetch next hand after delay
                setTimeout(() => {
                    fetchNextHand();
                }, 2000);
            }

        } catch (error) {
            console.error('Failed to submit action:', error);
        } finally {
            setIsLocked(false);
        }
    }, [currentHand, isLocked, userId, gameId, engineType, level, handNumber, fetchNextHand, onLevelComplete, onLevelFailed]);

    // ========================================================================
    // CALCULATE STATS
    // ========================================================================

    const calculateStats = useCallback((): SessionStats => {
        const accuracy = handNumber > 0 ? (correctCount / handNumber) * 100 : 0;
        const timeElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);

        // Sort blunders by damage (worst first) for review
        const sortedBlunders = [...blunders].sort((a, b) => b.damage - a.damage);

        return {
            handsPlayed: handNumber,
            correctAnswers: correctCount,
            accuracy,
            passed: false, // Calculated separately
            finalHealth: health,
            xpEarned: totalXP,
            timeElapsed,
            blunders: sortedBlunders,
            streakBest: bestStreak,
            perfectHands,
        };
    }, [handNumber, correctCount, health, totalXP, blunders, bestStreak, perfectHands]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const handleRetry = useCallback(() => {
        setHealth(STARTING_HEALTH);
        setHandNumber(0);
        setCorrectCount(0);
        setTotalXP(0);
        setBlunders([]);
        setCurrentStreak(0);
        setBestStreak(0);
        setPerfectHands(0);
        setShowFailed(false);
        setShowComplete(false);
        startTimeRef.current = Date.now();
        fetchNextHand();
    }, [fetchNextHand]);

    const handleNextLevel = useCallback(() => {
        // Pass stats to parent and let it handle navigation to next level
        if (sessionStats) {
            onLevelComplete(sessionStats);
        }
    }, [sessionStats, onLevelComplete]);

    const handleReviewHand = useCallback((blunder: BlunderData) => {
        // For now, log the blunder - could open a detailed review modal
        console.log('Review blunder:', blunder);
        // Future: Open hand replay modal
    }, []);

    const handleQuit = useCallback(() => {
        if (window.confirm('Are you sure you want to quit? Progress will be lost.')) {
            onExit();
        }
    }, [onExit]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Initial fetch
    useEffect(() => {
        fetchNextHand();
    }, []);

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div style={styles.arena}>
            {/* TOP HUD BAR */}
            <header style={styles.hudBar}>
                {/* Left: Game Info */}
                <div style={styles.hudLeft}>
                    <h1 style={styles.gameTitle}>{gameName}</h1>
                    <span style={styles.levelBadge}>Level {level}</span>
                </div>

                {/* Center: Health Bar */}
                <div style={styles.hudCenter}>
                    <HealthBar
                        current={health}
                        max={STARTING_HEALTH}
                        showDamage={showDamage}
                        onDamageComplete={() => setShowDamage(0)}
                    />
                </div>

                {/* Right: Counters & Quit */}
                <div style={styles.hudRight}>
                    <HandCounter
                        current={handNumber}
                        total={TOTAL_HANDS}
                        correctCount={correctCount}
                    />
                    <XPDisplay totalXP={totalXP} recentXP={recentXP} />
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleQuit}
                        style={styles.quitButton}
                    >
                        ✕ Quit
                    </motion.button>
                </div>
            </header>

            {/* MAIN STAGE */}
            <main style={styles.stage}>
                {isLoading ? (
                    <div style={styles.loadingContainer}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={styles.spinner}
                        >
                            🎰
                        </motion.div>
                        <p>Loading hand {handNumber + 1}...</p>
                    </div>
                ) : currentHand && (
                    <>
                        {/* PIO Engine: Poker Table */}
                        {engineType === 'PIO' && (
                            <PIOEngine
                                handData={currentHand}
                                onAction={submitAction}
                                isLocked={isLocked}
                            />
                        )}

                        {/* CHART Engine: 13x13 Grid */}
                        {engineType === 'CHART' && (
                            <ChartGrid
                                chartType={currentHand.chartType || 'push_fold'}
                                heroPosition={currentHand.heroPosition || 'BTN'}
                                stackBB={currentHand.stackBB || 15}
                                villainPosition={currentHand.villainPosition}
                                correctRange={currentHand.correctRange}
                                highlightHand={currentHand.highlightHand}
                                phase={chartPhase}
                                resultFeedback={chartFeedback}
                                onAction={(action, hand) => submitAction(action, hand)}
                            />
                        )}

                        {/* SCENARIO Engine: Mental Gym */}
                        {engineType === 'SCENARIO' && (
                            <MentalGym
                                scenarioId={currentHand.scenarioId || 'scenario-001'}
                                scriptName={currentHand.scriptName || 'tilt_control'}
                                scenarioText={currentHand.scenarioText || 'What would you do in this situation?'}
                                situationContext={currentHand.situationContext}
                                choices={currentHand.choices || [
                                    { id: 'A', label: 'Option A', icon: '🅰️', emotionalType: 'rational' },
                                    { id: 'B', label: 'Option B', icon: '🅱️', emotionalType: 'impulsive' },
                                ]}
                                correctChoice={currentHand.correctChoice || 'A'}
                                timeLimit={currentHand.timeLimit || 15}
                                riggedOutcome={currentHand.riggedOutcome}
                                emotionalTrigger={currentHand.emotionalTrigger}
                                phase={scenarioPhase}
                                resultFeedback={scenarioFeedback}
                                onChoice={(choiceId) => submitAction(choiceId)}
                            />
                        )}
                    </>
                )}
            </main>

            {/* MODALS */}
            <AnimatePresence>
                {showFailed && sessionStats && (
                    <LevelFailedModal
                        stats={sessionStats}
                        onRetry={handleRetry}
                        onExit={onExit}
                    />
                )}

                {showComplete && sessionStats && (
                    <RoundSummary
                        isOpen={true}
                        passed={sessionStats.passed}
                        level={level}
                        passingGrade={PASSING_GRADES[level - 1] || 85}
                        stats={sessionStats}
                        gameName={gameName}
                        onNextLevel={handleNextLevel}
                        onRetry={handleRetry}
                        onExit={onExit}
                        onReviewHand={handleReviewHand}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
    arena: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0a0a15 0%, #0d1628 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },

    // HUD BAR
    hudBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },

    hudLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    gameTitle: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
    },

    levelBadge: {
        padding: '4px 12px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
    },

    hudCenter: {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        maxWidth: 400,
    },

    hudRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
    },

    quitButton: {
        padding: '8px 16px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },

    // HEALTH BAR
    healthContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        position: 'relative',
    },

    healthLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },

    healthIcon: {
        fontSize: 16,
    },

    healthText: {
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.7)',
    },

    healthTrack: {
        flex: 1,
        height: 20,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
    },

    healthFill: {
        height: '100%',
        borderRadius: 10,
        transition: 'background 0.3s ease',
    },

    healthSegments: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
    },

    healthSegment: {
        flex: 1,
        borderRight: '1px solid rgba(0, 0, 0, 0.2)',
    },

    healthValue: {
        fontSize: 14,
        fontWeight: 600,
        minWidth: 60,
        textAlign: 'right',
    },

    damageIndicator: {
        position: 'absolute',
        right: -20,
        top: -10,
        fontSize: 18,
        fontWeight: 800,
        color: '#F44336',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    },

    // HAND COUNTER
    handCounter: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    handCounterMain: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
    },

    handLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        marginRight: 4,
    },

    handValue: {
        fontSize: 20,
        fontWeight: 800,
        color: '#00D4FF',
    },

    handDivider: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.3)',
    },

    handTotal: {
        fontSize: 16,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    accuracyBadge: {
        fontSize: 11,
        fontWeight: 700,
    },

    // XP DISPLAY
    xpDisplay: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 8,
        position: 'relative',
    },

    xpIcon: {
        fontSize: 14,
    },

    xpValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#FFD700',
    },

    xpLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    xpGain: {
        position: 'absolute',
        right: -30,
        fontSize: 14,
        fontWeight: 700,
        color: '#4CAF50',
    },

    // STAGE
    stage: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflow: 'auto',
    },

    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
    },

    spinner: {
        fontSize: 48,
    },

    // PIO ENGINE
    pioContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        width: '100%',
        maxWidth: 600,
    },

    tableArea: {
        width: '100%',
        padding: 24,
        background: 'radial-gradient(ellipse at center, #1a3a2a 0%, #0d1f18 100%)',
        borderRadius: 200,
        border: '8px solid #8B4513',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
    },

    boardSection: {
        textAlign: 'center',
    },

    boardLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 8,
    },

    boardCards: {
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
    },

    card: {
        width: 50,
        height: 70,
        background: '#fff',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: '#000',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    },

    preflop: {
        padding: '16px 32px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    heroSection: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
    },

    positionBadge: {
        padding: '4px 12px',
        background: '#00D4FF',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        color: '#000',
    },

    heroCards: {
        display: 'flex',
        gap: 8,
    },

    heroCard: {
        width: 60,
        height: 84,
        background: '#fff',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 700,
        color: '#000',
        boxShadow: '0 6px 12px rgba(0,0,0,0.4)',
    },

    stackInfo: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    actionBar: {
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },

    actionButton: {
        padding: '12px 24px',
        border: 'none',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },

    foldButton: {
        background: 'linear-gradient(135deg, #9E9E9E, #757575)',
        color: '#fff',
    },

    checkButton: {
        background: 'linear-gradient(135deg, #2196F3, #1976D2)',
        color: '#fff',
    },

    callButton: {
        background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
        color: '#fff',
    },

    betButton: {
        background: 'linear-gradient(135deg, #FF9800, #F57C00)',
        color: '#fff',
    },

    // MODALS
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },

    failedModal: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 24,
        padding: 32,
        textAlign: 'center',
        border: '2px solid #F44336',
        maxWidth: 400,
        width: '90%',
    },

    failedIcon: {
        fontSize: 64,
        marginBottom: 16,
    },

    failedTitle: {
        margin: 0,
        fontSize: 28,
        fontWeight: 800,
        color: '#F44336',
    },

    failedSubtitle: {
        margin: '8px 0 24px',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    failedStats: {
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },

    statRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: 14,
    },

    modalButtons: {
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
    },

    retryButton: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
        border: 'none',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },

    exitButton: {
        padding: '12px 24px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },

    continueButton: {
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
        border: 'none',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },
};

export default GameArena;
