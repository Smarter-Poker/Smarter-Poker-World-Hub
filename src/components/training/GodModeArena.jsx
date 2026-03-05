/**
 * 🎮 GOD MODE ARENA — GTO Wizard-Style Training UI
 * ═══════════════════════════════════════════════════════════════════════════
 * Full-immersion training with:
 * - GTO Wizard-style action buttons + 5-tier feedback
 * - GTOW Score tracking + EV Loss metrics
 * - Post-session review with hand history
 * - 25 questions per level, 10 levels total
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GameUIRouter from './GameUIRouter';
import useMillionaireGame from '../../hooks/useMillionaireGame';
import { CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../hooks/useGTOWScore';
import TRAINING_CONFIG from '../../config/trainingConfig';
import { getGameById } from '../../data/TRAINING_LIBRARY';

// ALL GAMES use full-screen immersive UI with GameUIRouter
const FULL_SCREEN_UI_GAMES = [
    // Cash Games (25)
    'cash-001', 'cash-002', 'cash-003', 'cash-004', 'cash-005',
    'cash-006', 'cash-007', 'cash-008', 'cash-009', 'cash-010',
    'cash-011', 'cash-012', 'cash-013', 'cash-014', 'cash-015',
    'cash-016', 'cash-017', 'cash-018', 'cash-019', 'cash-020',
    'cash-021', 'cash-022', 'cash-023', 'cash-024', 'cash-025',
    // MTT Games (25)
    'mtt-001', 'mtt-002', 'mtt-003', 'mtt-004', 'mtt-005',
    'mtt-006', 'mtt-007', 'mtt-008', 'mtt-009', 'mtt-010',
    'mtt-011', 'mtt-012', 'mtt-013', 'mtt-014', 'mtt-015',
    'mtt-016', 'mtt-017', 'mtt-018', 'mtt-019', 'mtt-020',
    'mtt-021', 'mtt-022', 'mtt-023', 'mtt-024', 'mtt-025',
    // Spins Games (10)
    'spins-001', 'spins-002', 'spins-003', 'spins-004', 'spins-005',
    'spins-006', 'spins-007', 'spins-008', 'spins-009', 'spins-010',
    // Psychology Games (20)
    'psy-001', 'psy-002', 'psy-003', 'psy-004', 'psy-005',
    'psy-006', 'psy-007', 'psy-008', 'psy-009', 'psy-010',
    'psy-011', 'psy-012', 'psy-013', 'psy-014', 'psy-015',
    'psy-016', 'psy-017', 'psy-018', 'psy-019', 'psy-020',
    // Advanced Games (20)
    'adv-001', 'adv-002', 'adv-003', 'adv-004', 'adv-005',
    'adv-006', 'adv-007', 'adv-008', 'adv-009', 'adv-010',
    'adv-011', 'adv-012', 'adv-013', 'adv-014', 'adv-015',
    'adv-016', 'adv-017', 'adv-018', 'adv-019', 'adv-020',
];

function getEngineType(gameId) {
    const game = getGameById(gameId);
    if (!game) return 'PIO';
    if (game.category === 'PSYCHOLOGY') return 'SCENARIO';
    if (game.tags?.includes('gto') || game.tags?.includes('math')) return 'PIO';
    return 'CHART';
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY ENTRY — Single row in the post-session review
// ═══════════════════════════════════════════════════════════════════════════

function HandHistoryRow({ entry, index }) {
    const config = CLASSIFICATION_CONFIG[entry.classification] || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderLeft: `3px solid ${config.borderColor}`,
                borderRadius: 4,
            }}
        >
            {/* Hand # */}
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: '600', minWidth: 24 }}>
                #{entry.handNumber}
            </div>

            {/* Classification badge */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 12,
                background: config.bgColor,
                border: `1px solid ${config.borderColor}`,
                color: config.color,
                fontSize: 11,
                fontWeight: 'bold',
                minWidth: 80,
                justifyContent: 'center',
            }}>
                <span>{config.icon}</span>
                <span>{config.label}</span>
            </div>

            {/* Question summary */}
            <div style={{
                flex: 1,
                color: '#cbd5e1',
                fontSize: 12,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {entry.question || `Hand ${entry.handNumber}`}
            </div>

            {/* EV Loss */}
            <div style={{
                color: entry.evLoss > 0 ? '#ef4444' : '#22c55e',
                fontSize: 12,
                fontWeight: 'bold',
                fontFamily: "'Orbitron', monospace",
                minWidth: 60,
                textAlign: 'right',
            }}>
                {entry.evLoss > 0 ? `-${entry.evLoss.toFixed(2)}` : '0.00'} BB
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function GodModeArena({
    userId,
    gameId,
    gameName,
    level = 1,
    sessionId,
    onComplete,
    onExit,
}) {
    const engineType = getEngineType(gameId);

    const {
        currentQuestion,
        questionNumber,
        totalQuestions,
        level: currentLevel,
        loading,
        error,
        correctCount,
        streak,
        bestStreak,
        totalXP,
        requiredCorrect,
        passThreshold,
        showFeedback,
        feedbackResult,
        explanation,
        gameComplete,
        levelPassed,
        // GTOW scoring
        moveClassification,
        evLoss,
        gtoFrequencies,
        gtowScore,
        totalEVLoss,
        sessionMistakes,
        handHistory,
        avgEVLossPerHand,
        avgEVLossPerMistake,
        avgFrequencyDiff,
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

    // ═══════════════════════════════════════════════════════════════════════
    // POST-SESSION REVIEW SCREEN — GTO Wizard-style completion
    // ═══════════════════════════════════════════════════════════════════════

    if (gameComplete) {
        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const scoreColor = gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444';

        // Count classification distribution
        const classificationCounts = {};
        Object.values(MOVE_CLASSIFICATIONS).forEach(c => classificationCounts[c] = 0);
        handHistory.forEach(h => {
            if (h.classification) classificationCounts[h.classification]++;
        });

        return (
            <div style={styles.reviewContainer}>
                {/* REVIEW HEADER */}
                <div style={styles.reviewHeader}>
                    <button onClick={onExit} style={styles.reviewBackBtn}>← Back</button>
                    <div style={styles.reviewTitle}>Session Review</div>
                    <div style={{ width: 60 }} /> {/* Spacer */}
                </div>

                <div style={styles.reviewScrollArea}>
                    {/* GTOW SCORE — Hero display */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={styles.scoreHero}
                    >
                        <div style={{ ...styles.scoreHeroValue, color: scoreColor }}>
                            {gtowScore}%
                        </div>
                        <div style={styles.scoreHeroLabel}>GTOW SCORE</div>
                    </motion.div>

                    {/* SUMMARY STATS ROW */}
                    <div style={styles.summaryRow}>
                        <div style={styles.summaryItem}>
                            <div style={styles.summaryValue}>{totalQuestions}</div>
                            <div style={styles.summaryLabel}>Hands</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={{ ...styles.summaryValue, color: '#ef4444' }}>
                                -{totalEVLoss.toFixed(1)}
                            </div>
                            <div style={styles.summaryLabel}>EV Loss (BB)</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={{ ...styles.summaryValue, color: '#fbbf24' }}>
                                {sessionMistakes}
                            </div>
                            <div style={styles.summaryLabel}>Mistakes</div>
                        </div>
                        <div style={styles.summaryItem}>
                            <div style={styles.summaryValue}>{avgEVLossPerHand.toFixed(2)}</div>
                            <div style={styles.summaryLabel}>EV/Hand</div>
                        </div>
                    </div>

                    {/* CLASSIFICATION BREAKDOWN */}
                    <div style={styles.classBreakdown}>
                        <div style={styles.sectionTitle}>Move Breakdown</div>
                        <div style={styles.classGrid}>
                            {Object.entries(CLASSIFICATION_CONFIG).map(([key, config]) => (
                                <div key={key} style={styles.classItem}>
                                    <div style={{
                                        ...styles.classCount,
                                        color: config.color,
                                    }}>
                                        {classificationCounts[key] || 0}
                                    </div>
                                    <div style={{
                                        ...styles.classBadge,
                                        background: config.bgColor,
                                        borderColor: config.borderColor,
                                        color: config.color,
                                    }}>
                                        {config.icon} {config.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* HAND HISTORY — Scrollable list */}
                    <div style={styles.historySection}>
                        <div style={styles.sectionTitle}>Hand History</div>
                        <div style={styles.historyList}>
                            {handHistory.length > 0 ? (
                                handHistory.map((entry, i) => (
                                    <HandHistoryRow key={i} entry={entry} index={i} />
                                ))
                            ) : (
                                <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                                    No hands recorded
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div style={styles.reviewActions}>
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
                        <button onClick={() => {
                            onComplete?.({
                                gameId,
                                accuracy,
                                questionsAnswered: totalQuestions,
                                questionsCorrect: correctCount,
                                bestStreak,
                                levelPassed,
                                level: currentLevel,
                                gtowScore,
                                totalEVLoss,
                                sessionMistakes,
                            });
                            onExit?.();
                        }} style={styles.exitButton}>
                            Back to Training
                        </button>
                    </div>

                    {/* MASTERY PROGRESS */}
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
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // IN-GAME UI — Full screen with GTO Wizard-style GameUIRouter
    // ═══════════════════════════════════════════════════════════════════════

    const hasFullScreenUI = FULL_SCREEN_UI_GAMES.includes(gameId);

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
                        gameName={gameName}
                        streak={streak}
                        question={currentQuestion}
                        level={currentLevel}
                        questionNumber={questionNumber}
                        totalQuestions={totalQuestions}
                        onAnswer={submitAnswer}
                        showFeedback={showFeedback}
                        feedbackResult={feedbackResult}
                        explanation={explanation}
                        // GTOW scoring props
                        moveClassification={moveClassification}
                        evLoss={evLoss}
                        gtoFrequencies={gtoFrequencies}
                        gtowScore={gtowScore}
                        totalSessionEVLoss={totalEVLoss}
                        sessionMistakes={sessionMistakes}
                    />
                ) : null}
            </div>
        );
    }

    // Default layout with header/footer for games without custom UIs
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <button onClick={onExit} style={styles.backButton}>← Exit</button>
                <div style={styles.gameTitle}>{gameName || 'Training'}</div>
                <div style={styles.stats}>
                    <span style={{ color: scoreColor, fontWeight: 'bold' }}>
                        {gtowScore}% Score
                    </span>
                </div>
            </div>

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
                        gameName={gameName}
                        streak={streak}
                        question={currentQuestion}
                        level={currentLevel}
                        questionNumber={questionNumber}
                        totalQuestions={totalQuestions}
                        onAnswer={submitAnswer}
                        showFeedback={showFeedback}
                        feedbackResult={feedbackResult}
                        explanation={explanation}
                        moveClassification={moveClassification}
                        evLoss={evLoss}
                        gtoFrequencies={gtoFrequencies}
                        gtowScore={gtowScore}
                        totalSessionEVLoss={totalEVLoss}
                        sessionMistakes={sessionMistakes}
                    />
                ) : null}
            </div>

            <div style={styles.footer}>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>EV Loss:</span>
                    <span style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: 6 }}>
                        -{totalEVLoss.toFixed(1)} BB
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Mistakes:</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold', marginLeft: 6 }}>
                        {sessionMistakes}
                    </span>
                </div>
                <div style={styles.footerStat}>
                    <span style={{ color: '#94a3b8' }}>Streak:</span>
                    <span style={{ color: '#f97316', fontWeight: 'bold', marginLeft: 6 }}>
                        {streak} 🔥
                    </span>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const scoreColor = '#22c55e'; // Default, overridden dynamically in render

const styles = {
    fullScreenContainer: {
        width: '100%',
        height: '100vh',
        background: 'transparent',
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
    },

    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00d4ff',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    stats: {
        display: 'flex',
        fontSize: 14,
    },

    questionContainer: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: 0,
    },

    errorState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },

    footer: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid #1e293b',
    },

    footerStat: { fontSize: 13 },

    // ── POST-SESSION REVIEW STYLES
    reviewContainer: {
        width: '100%',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
        color: '#e2e8f0',
    },

    reviewHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0,0,0,0.5)',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
    },

    reviewBackBtn: {
        background: 'none',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        padding: '6px 14px',
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '600',
        cursor: 'pointer',
    },

    reviewTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#e2e8f0',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    reviewScrollArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
    },

    // Score hero
    scoreHero: {
        textAlign: 'center',
        padding: '24px 0 16px',
    },

    scoreHeroValue: {
        fontSize: 64,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1,
    },

    scoreHeroLabel: {
        fontSize: 12,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginTop: 4,
        fontWeight: '600',
    },

    // Summary row
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '16px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 16,
    },

    summaryItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },

    summaryValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
    },

    summaryLabel: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // Classification breakdown
    classBreakdown: {
        marginBottom: 20,
    },

    sectionTitle: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 10,
    },

    classGrid: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
    },

    classItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },

    classCount: {
        fontSize: 18,
        fontWeight: 'bold',
        minWidth: 20,
        textAlign: 'right',
    },

    classBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '3px 8px',
        borderRadius: 10,
        border: '1px solid',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // Hand history
    historySection: {
        marginBottom: 20,
    },

    historyList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 10,
        overflow: 'hidden',
        maxHeight: 300,
        overflowY: 'auto',
    },

    // Action buttons
    reviewActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: 20,
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
    },

    // Mastery
    masteryContainer: { marginTop: 8, marginBottom: 32 },
    masteryLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
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
