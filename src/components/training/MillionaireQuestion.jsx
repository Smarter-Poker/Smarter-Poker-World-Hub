/**
 * MillionaireQuestion Component
 * ═══════════════════════════════════════════════════════════════════════════
 * "Who Wants to Be a Millionaire" style question display
 * - Scenario/question at top
 * - 4 answer buttons at bottom
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';

const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '500px',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 100%)',
        borderRadius: '16px',
        overflow: 'hidden',
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
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: '700',
        marginBottom: '16px',
    },

    questionBox: {
        background: 'linear-gradient(135deg, #1e3a5f, #0f2847)',
        border: '2px solid #3b82f6',
        borderRadius: '12px',
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
        borderRadius: '8px',
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
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)',
        zIndex: 10,
    },

    feedbackIcon: {
        fontSize: '64px',
        marginBottom: '16px',
    },

    feedbackText: {
        color: '#fff',
        fontSize: '24px',
        fontWeight: '700',
        marginBottom: '8px',
    },

    explanationText: {
        color: '#94a3b8',
        fontSize: '16px',
        textAlign: 'center',
        maxWidth: '400px',
        lineHeight: '1.5',
    },
};

const LETTERS = ['A', 'B', 'C', 'D'];

export default function MillionaireQuestion({
    question,
    level = 1,
    questionNumber = 1,
    totalQuestions = 25,
    onAnswer,
    showFeedback = false,
    feedbackResult = null, // 'correct' | 'wrong'
    explanation = '',
}) {
    const [hoveredId, setHoveredId] = useState(null);
    const [selectedId, setSelectedId] = useState(null);

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

    if (!question) {
        return (
            <div style={styles.container}>
                <div style={styles.questionArea}>
                    <div style={styles.questionText}>Loading question...</div>
                </div>
            </div>
        );
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
                            {/* Header */}
                            <div style={{ marginBottom: '12px', fontWeight: '600', color: '#cbd5e1', fontSize: '13px' }}>
                                {question.scenario.heroPosition && `${question.scenario.heroPosition} • `}
                                {question.scenario.heroStack && `${question.scenario.heroStack}bb • `}
                                {question.scenario.gameType || 'Cash Game'}
                            </div>

                            {/* Poker Details */}
                            <div style={{ fontSize: '13px', lineHeight: '1.8' }}>
                                {question.scenario.heroHand && (
                                    <div>Hero: <span style={{ color: '#fbbf24' }}>{question.scenario.heroHand}</span></div>
                                )}
                                {question.scenario.board && (
                                    <div>Board: <span style={{ color: '#22c55e' }}>{question.scenario.board}</span></div>
                                )}
                                {question.scenario.pot && (
                                    <div>Pot: {question.scenario.pot}bb</div>
                                )}
                                {question.scenario.villainPosition && question.scenario.villainStack && (
                                    <div>Villain ({question.scenario.villainPosition}): {question.scenario.villainStack}bb</div>
                                )}
                                {question.scenario.action && (
                                    <div style={{ marginTop: '8px', color: '#f59e0b', fontWeight: '600' }}>
                                        → {question.scenario.action}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    <div style={styles.questionText}>{question.question}</div>
                </div>
            </div>

            {/* Answer Buttons */}
            <div style={styles.answersArea}>
                <div style={styles.answersGrid}>
                    {(question.options || []).map((option, index) => (
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

            {/* Feedback Overlay */}
            {showFeedback && (
                <div style={styles.feedbackOverlay}>
                    <div style={styles.feedbackIcon}>
                        {feedbackResult === 'correct' ? '✓' : '✗'}
                    </div>
                    <div style={{
                        ...styles.feedbackText,
                        color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444'
                    }}>
                        {feedbackResult === 'correct' ? 'Correct!' : 'Incorrect'}
                    </div>
                    {explanation && (
                        <div style={styles.explanationText}>{explanation}</div>
                    )}
                </div>
            )}
        </div>
    );
}
