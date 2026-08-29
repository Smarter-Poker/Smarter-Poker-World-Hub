/**
 * MillionaireQuestion Component
 * ═══════════════════════════════════════════════════════════════════════════
 * "Who Wants to Be a Millionaire" style question display
 * - Scenario/question at top
 * - 4 answer buttons at bottom
 * - Supports Standard (beginner) and Pro (advanced) view modes
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTrainingSettings } from '../../contexts/TrainingSettingsContext';
import { formatScenario } from '../../utils/formatScenario';

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '500px',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 100%)',
        borderRadius: 0,
        overflow: 'hidden',
        border: '1px solid rgba(120,205,238,.48)',
        boxShadow: 'inset 0 1px rgba(255,255,255,.18), inset 0 -18px 38px rgba(0,0,0,.42), 0 18px 42px rgba(0,0,0,.48)',
    },

    // Scenario/Question area (top 60%)
    questionArea: {
        flex: '1 1 60%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '32px 24px',
    },

    levelBadge: {
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        color: '#000',
        padding: '6px 16px',
        borderRadius: 0,
        fontSize: '14px',
        fontWeight: '700',
        marginBottom: '16px',
    },

    questionBox: {
        background: 'linear-gradient(135deg, #1e3a5f, #0f2847)',
        border: '2px solid #3b82f6',
        borderRadius: 0,
        padding: '24px 32px',
        maxWidth: '600px',
        width: '100%',
        textAlign: 'center',
    },

    scenarioText: {
        color: '#94a3b8',
        fontSize: '14px',
        marginBottom: '12px',
        lineHeight: '1.5',
    },

    questionText: {
        color: '#fff',
        fontSize: '20px',
        fontWeight: '600',
        lineHeight: '1.4',
    },

    // Answer buttons (bottom 40%)
    answersArea: {
        flex: '0 0 auto',
        padding: '24px',
        background: 'rgba(0,0,0,0.3)',
    },

    answersGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        maxWidth: '600px',
        margin: '0 auto',
    },

    answerButton: {
        background: 'linear-gradient(135deg, #1e3a5f, #0f2847)',
        border: '2px solid #3b82f6',
        borderRadius: 0,
        padding: '16px 20px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },

    answerButtonHover: {
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        transform: 'scale(1.02)',
    },

    answerButtonCorrect: {
        background: 'linear-gradient(135deg, #16a34a, #15803d)',
        border: '2px solid #22c55e',
    },

    answerButtonWrong: {
        background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        border: '2px solid #ef4444',
    },

    answerButtonSelected: {
        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
        border: '2px solid #a855f7',
    },

    answerLetter: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '700',
        fontSize: '14px',
    },

    // Progress bar
    progressBar: {
        height: '4px',
        background: '#1e293b',
        width: '100%',
    },

    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
        transition: 'width 0.3s ease',
    },

    // Feedback overlay
    feedbackOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflowY: 'auto',
        padding: 'clamp(18px, 5vw, 44px) clamp(14px, 5vw, 36px)',
        background: 'radial-gradient(circle at 50% 8%, rgba(41,116,148,.32), transparent 36%), linear-gradient(145deg, rgba(19,32,44,.985), rgba(2,6,12,.99) 56%, rgba(0,2,5,.995))',
        zIndex: 10,
    },

    feedbackIcon: {
        width: 78,
        height: 78,
        display: 'grid',
        placeItems: 'center',
        fontSize: '52px',
        lineHeight: 1,
        marginBottom: '12px',
    },

    feedbackText: {
        color: '#fff',
        fontSize: 'clamp(30px, 7vw, 48px)',
        fontWeight: '700',
        letterSpacing: 3,
        lineHeight: 1,
        marginBottom: '14px',
        textTransform: 'uppercase',
        fontFamily: "var(--font-rajdhani), 'Rajdhani', 'Inter', sans-serif",
    },

    explanationText: {
        color: '#94a3b8',
        fontSize: '16px',
        textAlign: 'center',
        maxWidth: '620px',
        lineHeight: '1.5',
    },

    nextButton: {
        marginTop: '20px',
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #164e63, #0f2847)',
        border: '2px solid #22d3ee',
        borderRadius: 0,
        color: '#22d3ee',
        fontSize: '16px',
        fontWeight: '700',
        cursor: 'pointer',
        pointerEvents: 'auto',
    },
};

const LETTERS = ['A', 'B', 'C', 'D'];

export default function GTOQuestionCard({
    question,
    level = 1,
    questionNumber = 1,
    totalQuestions = 25,
    onAnswer,
    showFeedback = false,
    feedbackResult = null, // 'correct' | 'wrong'
    explanation = '',
    onNextHand = null,
}) {
    const [hoveredId, setHoveredId] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const reduceMotion = useReducedMotion();
    const { viewMode } = useTrainingSettings();

    // Reset selection/hover when a new question arrives so stale
    // highlights don't carry over between questions
    useEffect(() => {
        setSelectedId(null);
        setHoveredId(null);
    }, [question]);

    // BUG-D FIX: Fisher-Yates shuffle options per question to eliminate position bias
    const shuffledOptions = useMemo(() => {
        const opts = [...(question?.options || [])];
        if (opts.length <= 1) return opts;
        let seed = ((questionNumber || 1) * 2654435761) >>> 0;
        const rng = () => { seed = ((seed * 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts;
    }, [question?.options, questionNumber]);

    const handleSelect = (optionId) => {
        if (showFeedback) return; // Disable during feedback
        setSelectedId(optionId);
        onAnswer?.(optionId);
    };

    const getButtonStyle = (option, index) => {
        let style = { ...styles.answerButton };

        if (showFeedback) {
            if (option.id === question.correctAnswer) {
                style = { ...style, ...styles.answerButtonCorrect };
            } else if (option.id === selectedId) {
                style = { ...style, ...styles.answerButtonWrong };
            }
        } else {
            if (option.id === selectedId) {
                style = { ...style, ...styles.answerButtonSelected };
            } else if (option.id === hoveredId) {
                style = { ...style, ...styles.answerButtonHover };
            }
        }

        return style;
    };

    // Questions are pre-loaded, so this should never show
    // But keep as fallback for safety
    if (!question) {
        return null;
    }

    return (
        <div style={{ ...styles.container, position: 'relative' }}>
            {/* Progress Bar */}
            <div style={styles.progressBar}>
                <div
                    style={{
                        ...styles.progressFill,
                        width: `${(questionNumber / totalQuestions) * 100}%`
                    }}
                />
            </div>

            {/* Question Area */}
            <div style={styles.questionArea}>
                <div style={styles.levelBadge}>
                    Level {level} • Question {questionNumber}/{totalQuestions}
                </div>

                <div style={styles.questionBox}>
                    {question.scenario && (
                        <div style={styles.scenarioText}>
                            {formatScenario(question.scenario, viewMode)}
                        </div>
                    )}
                    <div style={styles.questionText}>{question.question}</div>
                </div>
            </div>

            {/* Answer Buttons */}
            <div style={styles.answersArea}>
                <div style={styles.answersGrid}>
                    {shuffledOptions.map((option, index) => (
                        <button
                            key={option.id}
                            style={getButtonStyle(option, index)}
                            onClick={() => handleSelect(option.id)}
                            onMouseEnter={() => setHoveredId(option.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            disabled={showFeedback}
                        >
                            <span style={styles.answerLetter}>{LETTERS[index]}</span>
                            <span>{option.text}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Feedback Overlay — persistent until the explicit Next click. */}
            <AnimatePresence>
                {showFeedback && (() => {
                    const isCorrect = feedbackResult === 'correct';
                    const resultColor = isCorrect ? '#53f2a0' : '#ff6670';
                    const selectedText = question.options?.find(option => option.id === selectedId)?.text || selectedId || 'No Answer';
                    const correctText = question.options?.find(option => option.id === question.correctAnswer)?.text || question.correctAnswer || 'Not Available';
                    return (
                        <motion.div
                            key="feedback"
                            role="status"
                            aria-live="assertive"
                            aria-atomic="true"
                            initial={reduceMotion ? false : { opacity: 0, scale: .96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reduceMotion ? undefined : { opacity: 0, scale: .98 }}
                            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 310, damping: 25 }}
                            style={styles.feedbackOverlay}
                        >
                            <motion.div
                                initial={reduceMotion ? false : { rotateY: -90, scale: .72 }}
                                animate={{ rotateY: 0, scale: 1 }}
                                transition={reduceMotion ? { duration: 0 } : { delay: .08, type: 'spring', stiffness: 260, damping: 19 }}
                                style={{
                                    ...styles.feedbackIcon,
                                    color: resultColor,
                                    border: `2px solid ${resultColor}`,
                                    background: 'linear-gradient(145deg, rgba(255,255,255,.18), rgba(0,0,0,.5))',
                                    boxShadow: `inset 0 1px rgba(255,255,255,.3), 0 0 30px ${isCorrect ? 'rgba(28,222,128,.35)' : 'rgba(255,55,75,.38)'}`,
                                }}
                            >
                                {isCorrect ? '✓' : '✕'}
                            </motion.div>
                            <div style={{ ...styles.feedbackText, color: resultColor, textShadow: '0 2px 0 #000, 0 0 22px currentColor' }}>
                                {isCorrect ? 'Correct' : 'Incorrect'}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                                gap: 10,
                                maxWidth: 620,
                                width: '100%',
                                marginBottom: 14,
                            }}>
                                <div style={{ padding: 12, background: 'rgba(0,0,0,.42)', border: `1px solid ${isCorrect ? 'rgba(83,242,160,.5)' : 'rgba(255,102,112,.55)'}` }}>
                                    <div style={{ color: '#91a9b7', fontSize: 9, fontWeight: 850, letterSpacing: 1.4, textTransform: 'uppercase' }}>Your Answer</div>
                                    <div style={{ color: resultColor, fontSize: 15, fontWeight: 850, marginTop: 4 }}>{selectedText}</div>
                                </div>
                                <div style={{ padding: 12, background: 'rgba(0,0,0,.42)', border: '1px solid rgba(83,242,160,.55)' }}>
                                    <div style={{ color: '#91a9b7', fontSize: 9, fontWeight: 850, letterSpacing: 1.4, textTransform: 'uppercase' }}>Correct Answer</div>
                                    <div style={{ color: '#53f2a0', fontSize: 15, fontWeight: 850, marginTop: 4 }}>{correctText}</div>
                                </div>
                            </div>
                            {explanation && (
                                <div style={{
                                    ...styles.explanationText,
                                    padding: '13px 16px',
                                    background: 'rgba(0,0,0,.3)',
                                    border: '1px solid rgba(132,202,230,.32)',
                                    color: '#d8e6ed',
                                }}>{explanation}</div>
                            )}
                            <div style={{ color: '#9db0bb', fontSize: 10, fontWeight: 700, marginTop: 13, textAlign: 'center' }}>
                                This Result Will Stay Open Until You Click Next.
                            </div>
                            {onNextHand && (
                                <button style={{
                                    ...styles.nextButton,
                                    minHeight: 52,
                                    background: 'linear-gradient(180deg, #4c7387 0%, #173849 12%, #071722 56%, #02080d 100%)',
                                    boxShadow: 'inset 0 2px rgba(255,255,255,.35), inset 0 -6px rgba(0,0,0,.42), 0 9px 22px rgba(0,0,0,.5), 0 0 18px rgba(34,211,238,.18)',
                                }} onClick={onNextHand}>
                                    Next Question →
                                </button>
                            )}
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
}
