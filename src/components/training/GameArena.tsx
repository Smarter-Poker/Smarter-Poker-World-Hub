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

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_HEALTH = 100;
const HANDS_PER_SESSION = 20;
const PASSING_GRADES = [85, 87, 89, 91, 93, 95, 97, 98, 99, 100]; // Per level

// ============================================================================
// TYPES
// ============================================================================

interface GameArenaProps {
    userId: string;
    gameId: string;
    gameName: string;
    level: number;
    sessionId: string;
    engineType?: 'PIO' | 'CHART' | 'SCENARIO';
    onExit: () => void;
    onLevelComplete?: (stats: SessionStats) => void;
    onLevelFailed?: () => void;
}

interface SessionStats {
    handsPlayed: number;
    correctAnswers: number;
    accuracy: number;
    passed: boolean;
    finalHealth: number;
    xpEarned: number;
    timeElapsed: number;
}

interface HandData {
    handId: string;
    engineType: 'PIO' | 'CHART' | 'SCENARIO';
    // PIO fields
    heroHand?: string;
    board?: string;
    pot?: number;
    stackToCommit?: number;
    availableActions?: string[];
    // CHART fields
    chartType?: string;
    heroPosition?: string;
    stackBB?: number;
    highlightHand?: string;
    // SCENARIO fields
    scenarioId?: string;
    scriptName?: string;
    scenarioText?: string;
    choices?: any[];
}

// ============================================================================
// COMPONENT
// ============================================================================

const GameArena: React.FC<GameArenaProps> = ({
    userId,
    gameId,
    gameName,
    level,
    sessionId,
    engineType = 'PIO',
    onExit,
    onLevelComplete,
    onLevelFailed,
}) => {
    // Game state
    const [health, setHealth] = useState(MAX_HEALTH);
    const [handNumber, setHandNumber] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [currentHand, setCurrentHand] = useState<HandData | null>(null);
    const [phase, setPhase] = useState<'LOADING' | 'USER_TURN' | 'FEEDBACK' | 'COMPLETE'>('LOADING');

    // HUD state
    const [totalXP, setTotalXP] = useState(0);
    const [recentXP, setRecentXP] = useState(0);
    const [showDamage, setShowDamage] = useState(0);
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);
    const [showFailed, setShowFailed] = useState(false);
    const [showComplete, setShowComplete] = useState(false);
    const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

    // Engine-specific state
    const [chartPhase, setChartPhase] = useState<'SELECT_HAND' | 'SELECT_ACTION' | 'SHOWING_RESULT'>('SELECT_HAND');
    const [chartFeedback, setChartFeedback] = useState<any>(null);
    const [scenarioPhase, setScenarioPhase] = useState<'READING' | 'DECIDING' | 'SHOWING_RESULT'>('DECIDING');
    const [scenarioFeedback, setScenarioFeedback] = useState<any>(null);

    // Refs
    const startTimeRef = useRef(Date.now());
    const healthBarControls = useAnimation();

    // ========================================================================
    // FETCH NEXT HAND
    // ========================================================================

    const fetchNextHand = useCallback(async () => {
        try {
            const response = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    level,
                    sessionId,
                    handNumber: handNumber + 1,
                }),
            });

            if (!response.ok) {
                // Generate a dummy hand for demo
                const demoHand = generateDemoHand(engineType, handNumber + 1);
                setCurrentHand(demoHand);
                setHandNumber(prev => prev + 1);
                setPhase('USER_TURN');
                return;
            }

            const data = await response.json();
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
        } catch (error) {
            console.error('Error fetching hand:', error);
            // Generate demo hand on error
            const demoHand = generateDemoHand(engineType, handNumber + 1);
            setCurrentHand(demoHand);
            setHandNumber(prev => prev + 1);
            setPhase('USER_TURN');
        }
    }, [userId, gameId, level, sessionId, handNumber, engineType]);

    // ========================================================================
    // SUBMIT ACTION
    // ========================================================================

    const submitAction = useCallback(async (action: string, extra?: any) => {
        if (!currentHand) return;

        try {
            const response = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    sessionId,
                    handId: currentHand.handId,
                    action,
                    extra,
                }),
            });

            let result;
            if (!response.ok) {
                // Demo mode - random result
                result = generateDemoResult(action);
            } else {
                result = await response.json();
            }

            // Update health
            if (result.damage > 0) {
                setHealth(prev => Math.max(0, prev - result.damage));
                setShowDamage(result.damage);
                healthBarControls.start({
                    x: [0, -5, 5, -5, 5, 0],
                    transition: { duration: 0.3 },
                });
                setTimeout(() => setShowDamage(0), 1000);
            }

            // Update correct count and XP
            if (result.isCorrect) {
                setCorrectCount(prev => prev + 1);
                const xp = 10 + Math.floor(level * 2);
                setTotalXP(prev => prev + xp);
                setRecentXP(xp);
                setTimeout(() => setRecentXP(0), 1000);
            }

            // Update engine-specific feedback
            if (currentHand.engineType === 'CHART') {
                setChartFeedback({
                    hand: extra?.hand || 'AKs',
                    isCorrect: result.isCorrect,
                    correctAction: result.correctAction || 'PUSH',
                });
                setChartPhase('SHOWING_RESULT');
            }

            if (currentHand.engineType === 'SCENARIO') {
                setScenarioFeedback({
                    choiceId: action,
                    isCorrect: result.isCorrect,
                    explanation: result.explanation || 'Consider your emotional state before making decisions.',
                    emotionalLesson: result.emotionalLesson,
                });
                setScenarioPhase('SHOWING_RESULT');
            }

            // Check if level failed
            if (health - (result.damage || 0) <= 0) {
                setShowFailed(true);
                return;
            }

            // Check if session complete
            if (handNumber >= HANDS_PER_SESSION) {
                const stats = calculateStats();
                stats.passed = stats.accuracy >= PASSING_GRADES[level - 1];
                setSessionStats(stats);
                setShowComplete(true);
                return;
            }

            // Small delay then next hand
            setPhase('FEEDBACK');
            setTimeout(() => {
                fetchNextHand();
            }, currentHand.engineType === 'CHART' || currentHand.engineType === 'SCENARIO' ? 1500 : 500);

        } catch (error) {
            console.error('Error submitting action:', error);
        }
    }, [currentHand, userId, gameId, sessionId, health, handNumber, level, fetchNextHand, healthBarControls]);

    // ========================================================================
    // HELPERS
    // ========================================================================

    const calculateStats = useCallback((): SessionStats => {
        const accuracy = handNumber > 0 ? (correctCount / handNumber) * 100 : 0;
        const timeElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);

        return {
            handsPlayed: handNumber,
            correctAnswers: correctCount,
            accuracy,
            passed: false,
            finalHealth: health,
            xpEarned: totalXP,
            timeElapsed,
        };
    }, [handNumber, correctCount, health, totalXP]);

    const handleRetry = useCallback(() => {
        setHealth(MAX_HEALTH);
        setHandNumber(0);
        setCorrectCount(0);
        setTotalXP(0);
        setShowFailed(false);
        setShowComplete(false);
        startTimeRef.current = Date.now();
        fetchNextHand();
    }, [fetchNextHand]);

    // Initialize
    useEffect(() => {
        fetchNextHand();
    }, []);

    // ========================================================================
    // RENDER
    // ========================================================================

    const healthPercent = (health / MAX_HEALTH) * 100;
    const healthColor = healthPercent > 60 ? '#00ff88' : healthPercent > 30 ? '#ffaa00' : '#ff4444';

    return (
        <div style={styles.container}>
            {/* HUD Top Bar */}
            <div style={styles.hudBar}>
                {/* Health Bar */}
                <motion.div style={styles.healthContainer} animate={healthBarControls}>
                    <div style={styles.healthLabel}>HP</div>
                    <div style={styles.healthBarBg}>
                        <motion.div
                            style={{
                                ...styles.healthBarFill,
                                background: healthColor,
                            }}
                            animate={{ width: `${healthPercent}%` }}
                            transition={{ type: 'spring', stiffness: 200 }}
                        />
                    </div>
                    <div style={styles.healthValue}>{health}</div>
                    <AnimatePresence>
                        {showDamage > 0 && (
                            <motion.div
                                initial={{ y: 0, opacity: 1 }}
                                animate={{ y: -20, opacity: 0 }}
                                exit={{ opacity: 0 }}
                                style={styles.damageFloat}
                            >
                                -{showDamage}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Hand Counter */}
                <div style={styles.handCounter}>
                    HAND <span style={styles.handNum}>{handNumber}</span>/{HANDS_PER_SESSION}
                </div>

                {/* Accuracy */}
                <div style={styles.accuracyBadge}>
                    {handNumber > 0 ? Math.round((correctCount / handNumber) * 100) : 0}%
                </div>

                {/* XP Display */}
                <div style={styles.xpContainer}>
                    <span style={styles.xpIcon}>⭐</span>
                    <span style={styles.xpValue}>{totalXP}</span>
                    <AnimatePresence>
                        {recentXP > 0 && (
                            <motion.span
                                initial={{ y: 0, opacity: 1 }}
                                animate={{ y: -20, opacity: 0 }}
                                exit={{ opacity: 0 }}
                                style={styles.xpFloat}
                            >
                                +{recentXP}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>

                {/* Quit Button */}
                <button
                    onClick={() => setShowQuitConfirm(true)}
                    style={styles.quitButton}
                >
                    ✕
                </button>
            </div>

            {/* Game Name Header */}
            <div style={styles.gameHeader}>
                <span style={styles.gameName}>{gameName}</span>
                <span style={styles.levelBadge}>Level {level}</span>
            </div>

            {/* Engine Content */}
            <div style={styles.engineContainer}>
                {/* PIO Engine - Use GameSession */}
                {engineType === 'PIO' && currentHand && (
                    <div style={styles.pioPlaceholder}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                        <h2>PIO Engine</h2>
                        <p>Hand: {currentHand.heroHand || 'AhKs'}</p>
                        <p>Board: {currentHand.board || 'Qh Jd 7c'}</p>
                        <div style={styles.actionButtonsRow}>
                            {(currentHand.availableActions || ['FOLD', 'CALL', 'RAISE']).map(action => (
                                <button
                                    key={action}
                                    style={styles.actionBtn}
                                    onClick={() => submitAction(action)}
                                >
                                    {action}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* CHART Engine */}
                {engineType === 'CHART' && currentHand && (
                    <ChartGrid
                        chartType={currentHand.chartType || 'push_fold'}
                        heroPosition={currentHand.heroPosition || 'BTN'}
                        stackBB={currentHand.stackBB || 15}
                        highlightHand={currentHand.highlightHand}
                        phase={chartPhase}
                        resultFeedback={chartFeedback}
                        onAction={(action, hand) => submitAction(action, { hand })}
                    />
                )}

                {/* SCENARIO Engine */}
                {engineType === 'SCENARIO' && currentHand && (
                    <MentalGym
                        scenarioId={currentHand.scenarioId || 'tilt-control'}
                        scriptName={currentHand.scriptName || 'tilt_test'}
                        scenarioText={currentHand.scenarioText}
                        choices={currentHand.choices}
                        phase={scenarioPhase}
                        resultFeedback={scenarioFeedback}
                        onChoice={(choice) => submitAction(choice)}
                    />
                )}

                {/* Loading State */}
                {phase === 'LOADING' && (
                    <div style={styles.loadingState}>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            style={styles.spinner}
                        >
                            ⟳
                        </motion.div>
                        <p>Loading hand...</p>
                    </div>
                )}
            </div>

            {/* Quit Confirmation Modal */}
            <AnimatePresence>
                {showQuitConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            style={styles.quitModal}
                        >
                            <h3 style={styles.modalTitle}>Quit Session?</h3>
                            <p style={styles.modalText}>Your progress will not be saved.</p>
                            <div style={styles.modalButtons}>
                                <button
                                    onClick={() => setShowQuitConfirm(false)}
                                    style={styles.cancelBtn}
                                >
                                    Continue Playing
                                </button>
                                <button
                                    onClick={onExit}
                                    style={styles.confirmQuitBtn}
                                >
                                    Quit
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Level Failed Modal */}
            <AnimatePresence>
                {showFailed && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            style={{ ...styles.failedModal }}
                        >
                            <div style={{ fontSize: 64, marginBottom: 16 }}>💔</div>
                            <h2 style={{ color: '#ff4444', margin: 0 }}>LEVEL FAILED</h2>
                            <p style={styles.modalText}>You ran out of HP!</p>
                            <p>Accuracy: {handNumber > 0 ? Math.round((correctCount / handNumber) * 100) : 0}%</p>
                            <div style={styles.modalButtons}>
                                <button onClick={handleRetry} style={styles.retryBtn}>
                                    🔄 Try Again
                                </button>
                                <button onClick={onExit} style={styles.exitBtn}>
                                    Exit
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Session Complete Modal */}
            <AnimatePresence>
                {showComplete && sessionStats && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.modalOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            style={{
                                ...styles.completeModal,
                                borderColor: sessionStats.passed ? '#00ff88' : '#ff4444',
                            }}
                        >
                            <div style={{ fontSize: 64, marginBottom: 16 }}>
                                {sessionStats.passed ? '🏆' : '📊'}
                            </div>
                            <h2 style={{
                                color: sessionStats.passed ? '#00ff88' : '#ffaa00',
                                margin: 0,
                            }}>
                                {sessionStats.passed ? 'LEVEL CLEARED!' : 'KEEP PRACTICING'}
                            </h2>
                            <div style={styles.statsGrid}>
                                <div style={styles.statItem}>
                                    <span style={styles.statValue}>{Math.round(sessionStats.accuracy)}%</span>
                                    <span style={styles.statLabel}>Accuracy</span>
                                </div>
                                <div style={styles.statItem}>
                                    <span style={styles.statValue}>{sessionStats.correctAnswers}/{sessionStats.handsPlayed}</span>
                                    <span style={styles.statLabel}>Correct</span>
                                </div>
                                <div style={styles.statItem}>
                                    <span style={styles.statValue}>+{sessionStats.xpEarned}</span>
                                    <span style={styles.statLabel}>XP Earned</span>
                                </div>
                            </div>
                            <p style={styles.passingNote}>
                                Passing Grade: {PASSING_GRADES[level - 1]}%
                            </p>
                            <div style={styles.modalButtons}>
                                {sessionStats.passed ? (
                                    <button onClick={onExit} style={styles.nextLevelBtn}>
                                        Next Level →
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={handleRetry} style={styles.retryBtn}>
                                            🔄 Try Again
                                        </button>
                                        <button onClick={onExit} style={styles.exitBtn}>
                                            Exit
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// DEMO HAND GENERATORS
// ============================================================================

function generateDemoHand(engineType: string, handNum: number): HandData {
    const hands = ['AhKs', 'QdJd', '9c8c', 'TsTs', 'AcQh', '7h6h', 'KdQs', '5s5c'];
    const boards = ['Qs Jh 7c', 'Ac Kd 3h 2s', 'Td 9d 4c', 'As Ks Ts', '8h 7h 6h'];

    if (engineType === 'CHART') {
        const positions = ['BTN', 'CO', 'SB', 'BB'];
        const highlightHands = ['AKs', 'QJs', 'TT', '98s', 'A5s', 'KJo'];
        return {
            handId: `demo-chart-${handNum}`,
            engineType: 'CHART',
            chartType: 'push_fold',
            heroPosition: positions[handNum % positions.length],
            stackBB: 10 + (handNum % 20),
            highlightHand: highlightHands[handNum % highlightHands.length],
        };
    }

    if (engineType === 'SCENARIO') {
        const scenarios = ['tilt-control', 'fear-test', 'greed-check'];
        return {
            handId: `demo-scenario-${handNum}`,
            engineType: 'SCENARIO',
            scenarioId: scenarios[handNum % scenarios.length],
            scriptName: 'tilt_test',
        };
    }

    // PIO
    return {
        handId: `demo-pio-${handNum}`,
        engineType: 'PIO',
        heroHand: hands[handNum % hands.length],
        board: boards[handNum % boards.length],
        pot: 100 + handNum * 20,
        stackToCommit: 50 + handNum * 10,
        availableActions: ['FOLD', 'CALL', 'RAISE'],
    };
}

function generateDemoResult(action: string): any {
    const isCorrect = Math.random() > 0.4; // 60% correct rate for demo
    return {
        isCorrect,
        damage: isCorrect ? 0 : Math.floor(Math.random() * 15) + 5,
        correctAction: isCorrect ? action : (action === 'FOLD' ? 'CALL' : 'FOLD'),
        explanation: isCorrect
            ? 'Well played! Your decision was optimal.'
            : 'Consider the pot odds and implied odds more carefully.',
    };
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
    },
    hudBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 20px',
        background: 'rgba(0, 0, 0, 0.6)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    healthContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
    },
    healthLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#ff4444',
    },
    healthBarBg: {
        width: 120,
        height: 16,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        overflow: 'hidden',
    },
    healthBarFill: {
        height: '100%',
        borderRadius: 8,
    },
    healthValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        minWidth: 30,
    },
    damageFloat: {
        position: 'absolute',
        right: -20,
        top: -5,
        color: '#ff4444',
        fontWeight: 700,
        fontSize: 14,
    },
    handCounter: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: 600,
    },
    handNum: {
        color: '#00d4ff',
        fontSize: 18,
        fontWeight: 800,
    },
    accuracyBadge: {
        padding: '4px 12px',
        background: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        color: '#00d4ff',
    },
    xpContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
        position: 'relative',
    },
    xpIcon: {
        fontSize: 16,
    },
    xpValue: {
        fontSize: 16,
        fontWeight: 700,
        color: '#ffd700',
    },
    xpFloat: {
        position: 'absolute',
        right: -30,
        top: -5,
        color: '#ffd700',
        fontWeight: 700,
        fontSize: 14,
    },
    quitButton: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(255, 68, 68, 0.2)',
        border: '1px solid rgba(255, 68, 68, 0.4)',
        color: '#ff4444',
        fontSize: 16,
        cursor: 'pointer',
    },
    gameHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '12px 20px',
    },
    gameName: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
    },
    levelBadge: {
        padding: '4px 12px',
        background: 'rgba(138, 43, 226, 0.3)',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: '#aa66ff',
    },
    engineContainer: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    pioPlaceholder: {
        textAlign: 'center',
        padding: 40,
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#fff',
    },
    actionButtonsRow: {
        display: 'flex',
        gap: 12,
        marginTop: 20,
        justifyContent: 'center',
    },
    actionBtn: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    loadingState: {
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    spinner: {
        fontSize: 40,
        color: '#00d4ff',
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    quitModal: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 16,
        padding: 32,
        textAlign: 'center',
        border: '2px solid rgba(255, 68, 68, 0.4)',
        maxWidth: 400,
    },
    modalTitle: {
        color: '#fff',
        margin: '0 0 12px',
    },
    modalText: {
        color: 'rgba(255, 255, 255, 0.7)',
        margin: '0 0 20px',
    },
    modalButtons: {
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
    },
    cancelBtn: {
        padding: '12px 24px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmQuitBtn: {
        padding: '12px 24px',
        background: '#ff4444',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    failedModal: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 20,
        padding: 40,
        textAlign: 'center',
        border: '2px solid #ff4444',
        maxWidth: 400,
        color: '#fff',
    },
    completeModal: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 20,
        padding: 40,
        textAlign: 'center',
        border: '2px solid',
        maxWidth: 400,
        color: '#fff',
    },
    statsGrid: {
        display: 'flex',
        gap: 24,
        justifyContent: 'center',
        margin: '24px 0',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 800,
        color: '#00d4ff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    passingNote: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 20,
    },
    retryBtn: {
        padding: '14px 28px',
        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    exitBtn: {
        padding: '14px 28px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    nextLevelBtn: {
        padding: '14px 28px',
        background: 'linear-gradient(135deg, #00ff88, #00cc6a)',
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
    },
};

export default GameArena;
