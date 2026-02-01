/**
 * 🎮 GOD MODE ARENA — Millionaire-Style Training UI
 * ═══════════════════════════════════════════════════════════════════════════
 * Static "Who Wants to Be a Millionaire" quiz-show interface
 * - 25 questions per level
 * - 10 levels total (10% mastery per level)
 * - 2% pass threshold increase per level (85% → 100%)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GameUIRouter from './GameUIRouter';
import useMillionaireGame from '../../hooks/useMillionaireGame';
import TRAINING_CONFIG from '../../config/trainingConfig';
import { getGameById } from '../../data/TRAINING_LIBRARY';

// Games with custom full-screen UIs that DON'T need wrapper header/footer
const FULL_SCREEN_UI_GAMES = [
    'mtt-007', 'mtt-018',  // MTT games
    'cash-002', 'cash-018', // Cash games
    'spins-003', 'spins-007', // Spins games
    'psy-003', 'psy-012', // Psychology games
    'adv-001', 'adv-017', // Advanced games
];

/**
 * Determine engine type based on game data
 * - PSYCHOLOGY category → SCENARIO engine
 * - Games with 'gto' or 'math' tags → PIO engine
 * - Others → CHART engine
 */
function getEngineType(gameId) {
    const game = getGameById(gameId);
    if (!game) return 'PIO'; // Default fallback

    // Psychology games use SCENARIO engine
    if (game.category === 'PSYCHOLOGY') {
        return 'SCENARIO';
    }

    // Games with GTO or math tags use PIO solver
    if (game.tags?.includes('gto') || game.tags?.includes('math')) {
        return 'PIO';
    }

    // Default to CHART for range-based games
    return 'CHART';
}

export default function GodModeArena({
    userId,
    gameId,
    gameName,
    level = 1,
    sessionId,
    onComplete,
    onExit,
}) {
    // Determine engine type from game data
    const engineType = getEngineType(gameId);

    const {
        // Current state
        currentQuestion,
        questionNumber,
        totalQuestions,
        level: currentLevel,
        loading,
        error,

        // Score state
        correctCount,
        streak,
        bestStreak,
        totalXP,
        requiredCorrect,
        passThreshold,

        // Feedback state
        showFeedback,
        feedbackResult,
        explanation,

        // Completion state
        gameComplete,
        levelPassed,

        // Actions
        submitAnswer,
        nextQuestion,
        startNextLevel,
        retryLevel,
        resetGame,
    } = useMillionaireGame(gameId, 'PIO', level);

    // Auto-advance after feedback
    useEffect(() => {
        if (showFeedback) {
            const timer = setTimeout(() => {
                nextQuestion();
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [showFeedback, nextQuestion]);

    // Level Complete Screen
    if (gameComplete) {
        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

        return (
            <div style={styles.completionContainer}>
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{
                        ...styles.completionCard,
                        border: levelPassed ? '3px solid #22c55e' : '3px solid #f97316',
                    }}
                >
                    {/* Icon */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        style={{ fontSize: 80 }}
                    >
                        {levelPassed ? '🏆' : '📚'}
                    </motion.div>

                    {/* Title */}
                    <h1 style={{
                        ...styles.completionTitle,
                        color: levelPassed ? '#22c55e' : '#f97316',
                    }}>
                        {levelPassed ? `LEVEL ${currentLevel} COMPLETE!` : 'KEEP PRACTICING'}
                    </h1>

                    {/* Score */}
                    <div style={{
                        ...styles.completionScore,
                        color: levelPassed ? '#22c55e' : '#f97316',
                    }}>
                        {accuracy}%
                    </div>

                    {/* Stats */}
                    <div style={styles.completionStats}>
                        <p style={{ margin: '8px 0' }}>
                            {correctCount}/{totalQuestions} correct • Need {passThreshold}% to pass
                        </p>
                        <p style={{ margin: '8px 0' }}>
                            Best Streak: {bestStreak} • XP Earned: {totalXP}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div style={styles.completionButtons}>
                        {levelPassed && currentLevel < TRAINING_CONFIG.totalLevels && (
                            <button onClick={startNextLevel} style={styles.nextLevelButton}>
                                Next Level ({currentLevel + 1})
                            </button>
                        )}
                        {!levelPassed && (
                            <button onClick={retryLevel} style={styles.retryButton}>
                                Retry Level {currentLevel}
                            </button>
                        )}
                        <button onClick={onExit} style={styles.exitButton}>
                            Back to Training
                        </button>
                    </div>

                    {/* Mastery Progress */}
                    <div style={styles.masteryContainer}>
                        <div style={styles.masteryLabel}>
                            Overall Mastery: {currentLevel * 10}%
                        </div>
                        <div style={styles.masteryBar}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${currentLevel * 10}%` }}
                                transition={{ duration: 1, delay: 0.5 }}
                                style={styles.masteryFill}
                            />
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    // Check if this game has a full-screen custom UI
    const hasFullScreenUI = FULL_SCREEN_UI_GAMES.includes(gameId);

    // For games with custom full-screen UIs, render only the GameUIRouter
    if (hasFullScreenUI) {
        return (
            <div style={styles.fullScreenContainer}>
                {error ? (
                    <div style={styles.errorState}>
                        <p style={{ color: '#ef4444', fontSize: 18 }}>⚠️ {error}</p>
                        <button onClick={() => window.location.reload()} style={styles.retryButton}>
                            Retry
                        </button>
                    </div>
                ) : currentQuestion ? (
                    <GameUIRouter
                        gameId={gameId}
                        question={currentQuestion}
                        level={currentLevel}
                        questionNumber={questionNumber}
                        totalQuestions={totalQuestions}
                        onAnswer={submitAnswer}
                        showFeedback={showFeedback}
                        feedbackResult={feedbackResult}
                        explanation={explanation}
                        onExit={onExit}
                    />
                ) : null}
            </div>
        );
    }

    // Default layout with header/footer for games without custom UIs
    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>
                    ← Exit
                </button>
                <div style={styles.gameTitle}>{gameName || 'Training'}</div>
                <div style={styles.stats}>
                    <span style={{ color: '#fbbf24' }}>⚡ {totalXP} XP</span>
                    <span style={{ color: '#22c55e', marginLeft: 12 }}>
                        ✓ {correctCount}/{questionNumber - 1}
                    </span>
                </div>
            </div>

            {/* Main Question Area */}
            <div style={styles.questionContainer}>
                {error ? (
                    <div style={styles.errorState}>
                        <p style={{ color: '#ef4444', fontSize: 18 }}>⚠️ {error}</p>
                        <button onClick={() => window.location.reload()} style={styles.retryButton}>
                            Retry
                        </button>
                    </div>
                ) : currentQuestion ? (
                    <GameUIRouter
                        gameId={gameId}
                        question={currentQuestion}
                        level={currentLevel}
                        questionNumber={questionNumber}
                        totalQuestions={totalQuestions}
                        onAnswer={submitAnswer}
                        showFeedback={showFeedback}
                        feedbackResult={feedbackResult}
                        explanation={explanation}
                    />
                ) : null}
            </div>

            {/* Footer Stats */}
            <div style={styles.footer}>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Streak:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold', marginLeft: 6 }}>
                        {streak} 🔥
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Pass Threshold:</span>
                    <span style={{ color: '#22c55e', fontWeight: 'bold', marginLeft: 6 }}>
                        {passThreshold}%
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Required:</span>
                    <span style={{ color: '#3b82f6', fontWeight: 'bold', marginLeft: 6 }}>
                        {requiredCorrect}/{totalQuestions}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    // Full screen container for custom game UIs (no header/footer)
    fullScreenContainer: {
        width: '100%',
        height: '100vh',
        background: 'transparent', // Transparent to match page background
        overflow: 'hidden',
    },

    container: {
        width: '100%',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // Header
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid #1e293b',
    },

    backButton: {
        background: 'linear-gradient(135deg, #0891b2, #0e7490)',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'transform 0.2s',
    },

    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fbbf24',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    stats: {
        display: 'flex',
        fontSize: 14,
        fontWeight: 'bold',
    },

    // Main Question Container
    questionContainer: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: 0,
    },

    loadingState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },

    errorState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },

    // Footer
    footer: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #1e293b',
    },

    footerStat: {
        fontSize: 13,
    },

    // Completion Screen
    completionContainer: {
        width: '100%',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
    },

    completionCard: {
        background: 'linear-gradient(135deg, #1a2744, #0f1a2e)',
        padding: '50px 60px',
        borderRadius: 24,
        textAlign: 'center',
        maxWidth: 500,
    },

    completionTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        margin: '20px 0',
    },

    completionScore: {
        fontSize: 72,
        fontWeight: 'bold',
        margin: '16px 0',
    },

    completionStats: {
        color: '#94a3b8',
        fontSize: 16,
        margin: '20px 0',
    },

    completionButtons: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginTop: 32,
    },

    nextLevelButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        transition: 'transform 0.2s',
    },

    retryButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #f97316, #ea580c)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        transition: 'transform 0.2s',
    },

    exitButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        transition: 'transform 0.2s',
    },

    // Mastery Progress
    masteryContainer: {
        marginTop: 32,
    },

    masteryLabel: {
        color: '#94a3b8',
        fontSize: 14,
        marginBottom: 8,
    },

    masteryBar: {
        width: '100%',
        height: 8,
        background: '#1e293b',
        borderRadius: 4,
        overflow: 'hidden',
    },

    masteryFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
    },
};
