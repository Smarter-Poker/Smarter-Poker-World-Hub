/**
 * 🎯 Training Hand Scenario Player — Main Orchestrator
 * ═══════════════════════════════════════════════════════════════════
 * The core training experience component. Presents poker hands like a
 * real poker client with step-by-step animation to the decision point.
 * 
 * Layout: Question (top) → Scene (middle) → Answers (bottom)
 * 
 * NOT A REPLAY. This is Training / Hand Simulation.
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Scene components
import PokerTableScene from './scene/PokerTableScene';

// UI components
import QuestionBar from './ui/QuestionBar';
import AnswerGrid from './ui/AnswerGrid';

// Hooks and services
import useTrainingTimeline from '@/src/hooks/useTrainingTimeline';
import { fetchScenario } from '@/src/services/supabaseTrainingClient';

export default function TrainingHandScenarioPlayer({
    scenarioId = null,
    scenario: providedScenario = null,
    gameTitle = null,
    streak = 0,
    questionNumber = 1,
    totalQuestions = 25,
    onAnswer = null,
    onComplete = null,
    debugMode = false,
}) {
    // State
    const [scenario, setScenario] = useState(providedScenario);
    const [loading, setLoading] = useState(!providedScenario);
    const [error, setError] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState(null);

    // Load scenario from Supabase if ID provided
    useEffect(() => {
        if (providedScenario) {
            setScenario(providedScenario);
            setLoading(false);
            return;
        }

        if (!scenarioId) {
            setError('No scenario ID or scenario data provided');
            setLoading(false);
            return;
        }

        setLoading(true);
        fetchScenario(scenarioId)
            .then(result => {
                if (result.success) {
                    setScenario(result.scenario);
                    setError(null);
                } else {
                    setError(result.error);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [scenarioId, providedScenario]);

    // Timeline management
    const {
        currentState,
        currentStepIndex,
        stepCount,
        isPlaying,
        isAtDecision,
        play,
        pause,
        stepForward,
        stepBackward,
        reset,
        debug,
    } = useTrainingTimeline(scenario, {
        autoPlay: true,
        onDecisionPoint: () => {
            // Hand has played to decision - ready for user input
            console.log('[Scenario] Reached decision point');
        },
    });

    // Handle answer selection
    const handleAnswerSelect = useCallback((answer) => {
        if (showFeedback || !answer) return;

        setSelectedAnswer(answer);
        setShowFeedback(true);
        setFeedbackResult(answer.isCorrect ? 'correct' : 'incorrect');

        // Notify parent
        onAnswer?.(answer.value, answer.isCorrect);
    }, [showFeedback, onAnswer]);

    // Handle continue after feedback
    const handleContinue = useCallback(() => {
        setSelectedAnswer(null);
        setShowFeedback(false);
        setFeedbackResult(null);
        onComplete?.();
    }, [onComplete]);

    // Loading state
    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.spinner} />
                    <div style={styles.loadingText}>Loading scenario...</div>
                </div>
            </div>
        );
    }

    // Error state (FAIL-CLOSED)
    if (error || !scenario) {
        return (
            <div style={styles.container}>
                <div style={styles.errorPanel}>
                    <div style={styles.errorIcon}>⚠️</div>
                    <div style={styles.errorTitle}>Scenario Error</div>
                    <div style={styles.errorMessage}>{error || 'Invalid scenario data'}</div>
                    {debugMode && (
                        <div style={styles.debugInfo}>
                            <div>scenarioId: {scenarioId || 'null'}</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Extract data from scenario
    const { question, answers, table } = scenario;

    return (
        <div style={styles.container}>
            {/* ZONE 1: Question Bar (Top) */}
            <QuestionBar
                title={gameTitle}
                questionText={question?.text}
                subtext={question?.subtext}
                streak={streak}
                questionNumber={questionNumber}
                totalQuestions={totalQuestions}
            />

            {/* ZONE 2: Hand Scenario Scene (Middle) */}
            <div style={styles.sceneContainer}>
                <PokerTableScene
                    seatCount={table?.seatCount || 6}
                    seats={table?.seats || []}
                    currentState={currentState || {}}
                    heroCards={table?.heroCards}
                    debugMode={debugMode}
                />

                {/* Playback controls (collapsed in production) */}
                {debugMode && (
                    <div style={styles.controlsRow}>
                        <button style={styles.controlBtn} onClick={reset}>⏮</button>
                        <button style={styles.controlBtn} onClick={stepBackward}>⏪</button>
                        <button style={styles.controlBtn} onClick={isPlaying ? pause : play}>
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                        <button style={styles.controlBtn} onClick={stepForward}>⏩</button>
                        <span style={styles.stepCounter}>
                            Step {currentStepIndex + 1}/{stepCount}
                        </span>
                    </div>
                )}
            </div>

            {/* ZONE 3: Answer Grid (Bottom) */}
            <AnswerGrid
                answers={answers || []}
                onSelect={handleAnswerSelect}
                selectedId={selectedAnswer?.id}
                showFeedback={showFeedback}
                disabled={showFeedback || !isAtDecision}
            />

            {/* Feedback Overlay */}
            <AnimatePresence>
                {showFeedback && (
                    <motion.div
                        style={styles.feedbackOverlay}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div style={{
                            ...styles.feedbackCard,
                            borderColor: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                        }}>
                            <div style={styles.feedbackIcon}>
                                {feedbackResult === 'correct' ? '✓' : '✗'}
                            </div>
                            <div style={{
                                ...styles.feedbackTitle,
                                color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                            }}>
                                {feedbackResult === 'correct' ? 'Correct!' : 'Incorrect'}
                            </div>

                            {/* Explanation (if available) */}
                            {scenario.coaching?.explanation && (
                                <div style={styles.explanationText}>
                                    {scenario.coaching.explanation}
                                </div>
                            )}

                            <button
                                style={styles.continueBtn}
                                onClick={handleContinue}
                            >
                                Continue
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Debug Overlay */}
            {debugMode && (
                <div style={styles.debugOverlay}>
                    <div>scenarioId: {scenario.id}</div>
                    <div>gameId: {scenario.gameId}</div>
                    <div>stepCount: {stepCount}</div>
                    <div>stepIndex: {currentStepIndex}</div>
                    <div>street: {currentState?.street}</div>
                    <div>potAfterBB: {currentState?.potBB}</div>
                    <div>isAtDecision: {isAtDecision ? 'YES' : 'no'}</div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0d0d14 0%, #1a1a24 100%)',
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: 'relative',
        overflow: 'hidden',
    },

    sceneContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        minHeight: 0,
    },

    controlsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 8,
    },

    controlBtn: {
        width: 36,
        height: 36,
        background: '#2a2a3d',
        border: '1px solid #444',
        borderRadius: 6,
        color: '#00d4ff',
        fontSize: 16,
        cursor: 'pointer',
    },

    stepCounter: {
        color: '#888',
        fontSize: 12,
        fontFamily: 'monospace',
        marginLeft: 8,
    },

    loadingContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },

    spinner: {
        width: 40,
        height: 40,
        border: '3px solid #2a2a3d',
        borderTopColor: '#00d4ff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },

    loadingText: {
        color: '#888',
        fontSize: 14,
    },

    errorPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        textAlign: 'center',
    },

    errorIcon: {
        fontSize: 48,
        marginBottom: 16,
    },

    errorTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ef4444',
        marginBottom: 8,
    },

    errorMessage: {
        fontSize: 14,
        color: '#888',
        maxWidth: 300,
    },

    debugInfo: {
        marginTop: 16,
        padding: 12,
        background: 'rgba(0,0,0,0.5)',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        color: '#0f0',
    },

    feedbackOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },

    feedbackCard: {
        background: 'linear-gradient(180deg, #2a2a3d, #1a1a28)',
        borderRadius: 16,
        padding: 32,
        textAlign: 'center',
        border: '2px solid',
        maxWidth: 320,
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
    },

    feedbackIcon: {
        fontSize: 48,
        marginBottom: 16,
    },

    feedbackTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        marginBottom: 16,
    },

    explanationText: {
        fontSize: 14,
        color: '#ccc',
        lineHeight: 1.5,
        marginBottom: 20,
    },

    continueBtn: {
        padding: '12px 32px',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        background: 'linear-gradient(180deg, #00d4ff, #0099cc)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
        textTransform: 'uppercase',
    },

    debugOverlay: {
        position: 'absolute',
        bottom: 80,
        left: 8,
        background: 'rgba(0,0,0,0.9)',
        color: '#0f0',
        fontSize: 10,
        fontFamily: 'monospace',
        padding: 8,
        borderRadius: 4,
        zIndex: 200,
        lineHeight: 1.6,
    },
};

// Add keyframes for spinner
if (typeof document !== 'undefined') {
    const styleSheet = document.styleSheets[0];
    try {
        styleSheet.insertRule(`
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `, styleSheet.cssRules.length);
    } catch (e) {
        // Ignore if already exists
    }
}
