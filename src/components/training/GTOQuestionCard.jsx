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
import TrainingQuestionReport from './TrainingQuestionReport';

const SD_DISPLAY_FONT = "var(--sd-type, var(--font-rajdhani, 'Arial Narrow'), sans-serif)";
const SD_BODY_FONT = "var(--font-inter, Inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '540px',
        background: 'linear-gradient(155deg, rgba(16, 36, 56, 0.92) 0%, rgba(8, 20, 34, 0.95) 55%, rgba(4, 13, 24, 0.97) 100%)',
        overflow: 'hidden',
        border: '1px solid rgba(134, 218, 255, 0.34)',
        boxShadow: 'inset 0 1px rgba(255,255,255,.14), 0 14px 36px rgba(0,0,0,.48)',
        fontFamily: SD_BODY_FONT,
        fontVariantNumeric: 'tabular-nums',
    },

    // Scenario/Question area (top 60%)
    questionArea: {
        flex: '1 1 55%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 'clamp(16px, 3.5vw, 28px) clamp(14px, 3vw, 24px)',
    },

    levelBadge: {
        background: 'rgba(10, 24, 41, 0.85)',
        border: '1px solid rgba(134, 218, 255, 0.45)',
        color: '#86daff',
        padding: '5px 14px',
        fontSize: '12px',
        fontWeight: '700',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        marginBottom: '14px',
        fontFamily: SD_BODY_FONT,
    },

    questionBox: {
        background: 'linear-gradient(180deg, rgba(14, 31, 48, 0.94) 0%, rgba(5, 14, 24, 0.97) 100%)',
        border: '1px solid rgba(134, 218, 255, 0.36)',
        padding: 'clamp(16px, 3vw, 24px) clamp(16px, 3.5vw, 28px)',
        maxWidth: '680px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
    },

    scenarioText: {
        color: '#bdd0e2',
        fontSize: '14px',
        fontWeight: '600',
        marginBottom: '10px',
        lineHeight: '1.5',
    },

    questionText: {
        color: '#f2f7ff',
        fontSize: 'clamp(18px, 2.5vw, 22px)',
        fontWeight: '700',
        lineHeight: '1.35',
        fontFamily: SD_DISPLAY_FONT,
        letterSpacing: '0.01em',
    },

    // Answer buttons (bottom 40%)
    answersArea: {
        flex: '0 0 auto',
        padding: 'clamp(14px, 3vw, 22px)',
        background: 'linear-gradient(180deg, rgba(10, 24, 41, 0.88) 0%, rgba(4, 13, 24, 0.96) 100%)',
        borderTop: '1px solid rgba(134, 218, 255, 0.24)',
    },

    answersGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '10px',
        maxWidth: '680px',
        margin: '0 auto',
    },

    answerButton: {
        background: 'linear-gradient(180deg, #263f58 0%, #112338 39%, #071420 77%, #12283c 100%)',
        border: '1px solid rgba(134, 218, 255, 0.36)',
        padding: '14px 16px',
        minHeight: '48px',
        color: '#f2f7ff',
        fontSize: '14px',
        fontWeight: '600',
        fontFamily: SD_BODY_FONT,
        cursor: 'pointer',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: 'inset 0 1px rgba(255,255,255,0.16), 0 4px 10px rgba(0,0,0,0.38)',
    },

    answerButtonHover: {
        background: 'linear-gradient(180deg, #1981ec 0%, #0c55c0 26%, #07377e 76%, #125bba 100%)',
        border: '1px solid rgba(186,230,253,0.75)',
    },

    answerButtonCorrect: {
        background: 'linear-gradient(180deg, #14df75 0%, #00ad4e 56%, #006d30 100%)',
        border: '1px solid #86efac',
    },

    answerButtonWrong: {
        background: 'linear-gradient(180deg, #ff4b52 0%, #f00819 56%, #a5000b 100%)',
        border: '1px solid #fca5a5',
    },

    answerButtonSelected: {
        background: 'linear-gradient(180deg, #1981ec 0%, #0c55c0 26%, #07377e 76%, #125bba 100%)',
        border: '1px solid rgba(134, 218, 255, 0.65)',
    },

    answerLetter: {
        width: '28px',
        height: '28px',
        background: 'rgba(4, 13, 24, 0.65)',
        border: '1px solid rgba(134, 218, 255, 0.34)',
        color: '#86daff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '800',
        fontSize: '13px',
        fontFamily: SD_DISPLAY_FONT,
        flexShrink: 0,
    },

    // Progress bar
    progressBar: {
        height: '5px',
        background: '#050c14',
        width: '100%',
    },

    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #1599c5, #63edff)',
        boxShadow: '0 0 10px #44dfff',
        transition: 'width 0.3s ease',
    },

    // Feedback overlay
    feedbackOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: 'clamp(16px, 3vw, 26px) clamp(14px, 4vw, 28px)',
        background: 'radial-gradient(circle at 50% 8%, rgba(41,116,148,.32), transparent 36%), linear-gradient(145deg, rgba(19,32,44,.985), rgba(2,6,12,.99) 56%, rgba(0,2,5,.995))',
        zIndex: 10,
    },

    feedbackIcon: {
        width: 56,
        height: 56,
        display: 'grid',
        placeItems: 'center',
        fontSize: '34px',
        lineHeight: 1,
        marginBottom: '8px',
        flexShrink: 0,
    },

    feedbackText: {
        color: '#fff',
        fontSize: 'clamp(24px, 5vw, 36px)',
        fontWeight: '700',
        letterSpacing: 2,
        lineHeight: 1,
        marginBottom: '10px',
        textTransform: 'uppercase',
        fontFamily: SD_DISPLAY_FONT,
    },

    explanationText: {
        color: '#94a3b8',
        fontSize: '15px',
        textAlign: 'center',
        maxWidth: '620px',
        lineHeight: '1.45',
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
    gameId,
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
    const [pendingId, setPendingId] = useState(null);
    const selectedId = showFeedback ? (question?.selectedAnswer ?? pendingId) : pendingId;
    const reduceMotion = useReducedMotion();
    const { viewMode } = useTrainingSettings();

    // Reset selection/hover when a new question arrives or a Practice Again
    // replay clears showFeedback so stale highlights don't carry over
    useEffect(() => {
        if (!showFeedback) {
            setPendingId(null);
            setHoveredId(null);
        }
    }, [showFeedback, question?._gradingContext?.submissionId, question?.id, questionNumber, question?._retryCount]);

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

    const playCardSound = (type) => {
        try {
            if (typeof window === 'undefined') return;
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            const now = ctx.currentTime;
            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(2480, now);
                osc.frequency.setValueAtTime(3120, now + 0.03);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'correct') {
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.setValueAtTime(880, now + 0.09);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.start(now);
                osc.stop(now + 0.24);
            } else if (type === 'wrong') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(330, now);
                osc.frequency.setValueAtTime(220, now + 0.14);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                osc.start(now);
                osc.stop(now + 0.28);
            }
            setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 400);
        } catch { /* non-blocking */ }
    };

    useEffect(() => {
        if (!showFeedback || !feedbackResult) return;
        playCardSound(feedbackResult === 'correct' ? 'correct' : 'wrong');
    }, [showFeedback, feedbackResult]);

    const handleSelect = (optionId) => {
        if (showFeedback) return; // Disable during feedback
        playCardSound('click');
        setPendingId(optionId);
        onAnswer?.(optionId);
    };

    // Keyboard shortcuts for non-table multiple-choice cards (1-4 / A-D to answer,
    // R for Practice Again, Enter/ArrowRight for Next Question).
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
        const onKeyDown = (e) => {
            if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
            const key = e.key;
            if (!showFeedback) {
                const num = parseInt(key, 10);
                if (num >= 1 && num <= shuffledOptions.length) {
                    const opt = shuffledOptions[num - 1];
                    if (opt) {
                        e.preventDefault();
                        handleSelect(opt.id);
                    }
                    return;
                }
                const upper = String(key || '').toUpperCase();
                const letterIdx = LETTERS.indexOf(upper);
                if (letterIdx >= 0 && letterIdx < shuffledOptions.length) {
                    const opt = shuffledOptions[letterIdx];
                    if (opt) {
                        e.preventDefault();
                        handleSelect(opt.id);
                    }
                }
            } else if (showFeedback && typeof onNextHand === 'function') {
                if (key === 'Enter' || key === 'ArrowRight') {
                    e.preventDefault();
                    onNextHand();
                } else if (key === 'r' || key === 'R') {
                    e.preventDefault();
                    setPendingId(null);
                    setHoveredId(null);
                    onNextHand({ retry: true, retryQuestion: question });
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showFeedback, shuffledOptions, onNextHand, question]);

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
        <div
            data-training-question-card="true"
            data-training-option-count={shuffledOptions.length}
            style={{ ...styles.container, position: 'relative' }}
        >
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
                            type="button"
                            data-training-answer-option="true"
                            aria-pressed={selectedId === option.id}
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
                            data-training-feedback="verdict"
                            data-correct-action={question.correctAnswer}
                            data-selected-action={selectedId}
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
                                    <div style={{ color: '#91a9b7', fontSize: 12, fontWeight: 850, letterSpacing: 1.4, textTransform: 'uppercase' }}>Your Answer</div>
                                    <div style={{ color: resultColor, fontSize: 15, fontWeight: 850, marginTop: 4 }}>{selectedText}</div>
                                </div>
                                <div style={{ padding: 12, background: 'rgba(0,0,0,.42)', border: '1px solid rgba(83,242,160,.55)' }}>
                                    <div style={{ color: '#91a9b7', fontSize: 12, fontWeight: 850, letterSpacing: 1.4, textTransform: 'uppercase' }}>Correct Answer</div>
                                    <div style={{ color: '#53f2a0', fontSize: 15, fontWeight: 850, marginTop: 4 }}>{correctText}</div>
                                </div>
                            </div>
                            <div
                                data-training-feedback="explanation"
                                style={{
                                    ...styles.explanationText,
                                    padding: '13px 16px',
                                    background: 'rgba(0,0,0,.3)',
                                    border: '1px solid rgba(132,202,230,.32)',
                                    color: '#d8e6ed',
                                }}
                            >
                                {question.explanation || explanation || `The answer for this drill is ${correctText}.`}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14 }}>
                                {onNextHand && (
                                    <button style={{
                                        ...styles.nextButton,
                                        minHeight: 48,
                                        marginTop: 0,
                                        background: 'linear-gradient(180deg, #4c7387 0%, #173849 12%, #071722 56%, #02080d 100%)',
                                        boxShadow: 'inset 0 2px rgba(255,255,255,.35), inset 0 -6px rgba(0,0,0,.42), 0 9px 22px rgba(0,0,0,.5), 0 0 18px rgba(34,211,238,.18)',
                                    }} className="sd-button sd-primary" data-training-next-decision onClick={onNextHand}>
                                        {questionNumber >= totalQuestions ? 'See Results' : 'Next Question'}
                                    </button>
                                )}
                                {onNextHand && (
                                    <button
                                        type="button"
                                        data-replay-current-hand="true"
                                        className="sd-button"
                                        onClick={() => onNextHand({ retry: true, retryQuestion: question })}
                                        style={{
                                            minHeight: 48,
                                            marginTop: 0,
                                            padding: '0 18px',
                                            color: '#86daff',
                                        }}
                                    >
                                        Practice Again
                                    </button>
                                )}
                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                                    <TrainingQuestionReport gameId={gameId} question={question} />
                                </div>
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
        </div>
    );
}
