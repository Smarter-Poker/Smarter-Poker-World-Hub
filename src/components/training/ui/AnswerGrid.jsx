/**
 * 🎯 Answer Grid — Facebook Dark Theme
 * ═══════════════════════════════════════════════════════════════════
 * 2×2 grid of answer choices with Facebook Dark styling.
 * States: idle, hover, selected, correct, incorrect, dimmed
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import { FACEBOOK_DARK } from '../../../hooks/useTrainingTheme';

function AnswerGrid({
    answers = [],
    onSelect = null,
    selectedId = null,
    revealedCorrectId = null,
    disabled = false,
    showFeedback = false,
}) {
    // Ensure we have exactly 4 answers (pad if needed)
    const paddedAnswers = [
        answers[0] || { id: 0, label: '-', value: '' },
        answers[1] || { id: 1, label: '-', value: '' },
        answers[2] || { id: 2, label: '-', value: '' },
        answers[3] || { id: 3, label: '-', value: '' },
    ];

    const getButtonState = (answer) => {
        if (!showFeedback) {
            return selectedId === answer.id ? 'selected' : 'idle';
        }

        // After feedback reveal
        if (answer.isCorrect) return 'correct';
        if (selectedId === answer.id && !answer.isCorrect) return 'incorrect';
        return 'dimmed';
    };

    const getButtonStyle = (state) => {
        const base = styles.button;
        switch (state) {
            case 'selected':
                return { ...base, ...styles.selected };
            case 'correct':
                return { ...base, ...styles.correct };
            case 'incorrect':
                return { ...base, ...styles.incorrect };
            case 'dimmed':
                return { ...base, ...styles.dimmed };
            default:
                return { ...base, ...styles.idle };
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.grid}>
                {paddedAnswers.map((answer, index) => {
                    const state = getButtonState(answer);
                    const buttonStyle = getButtonStyle(state);

                    return (
                        <motion.button
                            key={answer.id ?? index}
                            style={buttonStyle}
                            onClick={() => !disabled && onSelect?.(answer)}
                            disabled={disabled || !answer.label || answer.label === '-'}
                            whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
                            whileTap={!disabled ? { scale: 0.98 } : {}}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{
                                opacity: state === 'dimmed' ? 0.5 : 1,
                                y: 0,
                            }}
                            transition={{ duration: 0.2, delay: index * 0.05 }}
                        >
                            <span style={styles.label}>{answer.label}</span>

                            {/* Frequency hint (if available and unlocked) */}
                            {answer.frequency && showFeedback && (
                                <span style={styles.frequency}>
                                    {(answer.frequency * 100).toFixed(0)}%
                                </span>
                            )}

                            {/* Correct/Incorrect indicator */}
                            {showFeedback && state === 'correct' && (
                                <span style={{ ...styles.indicator, color: FACEBOOK_DARK.success }}>✓</span>
                            )}
                            {showFeedback && state === 'incorrect' && (
                                <span style={{ ...styles.indicator, color: FACEBOOK_DARK.danger }}>✗</span>
                            )}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}

const styles = {
    container: {
        width: '100%',
        padding: '12px 16px 20px',
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.base} 0%, ${FACEBOOK_DARK.darkest} 100%)`,
    },

    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
    },

    button: {
        padding: '16px 14px',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Inter', -apple-system, sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: 55,
    },

    // Button states - Facebook Dark
    idle: {
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.mid} 0%, ${FACEBOOK_DARK.base} 100%)`,
        border: `2px solid ${FACEBOOK_DARK.highlight}`,
        color: FACEBOOK_DARK.primary,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
    },

    selected: {
        background: `linear-gradient(180deg, ${FACEBOOK_DARK.primaryDim} 0%, ${FACEBOOK_DARK.base} 100%)`,
        border: `2px solid ${FACEBOOK_DARK.primary}`,
        color: FACEBOOK_DARK.primary,
        boxShadow: `0 0 20px ${FACEBOOK_DARK.primaryGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    },

    correct: {
        background: `linear-gradient(180deg, rgba(49, 162, 76, 0.2) 0%, ${FACEBOOK_DARK.base} 100%)`,
        border: `2px solid ${FACEBOOK_DARK.success}`,
        color: FACEBOOK_DARK.success,
        boxShadow: `0 0 20px ${FACEBOOK_DARK.successGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    },

    incorrect: {
        background: `linear-gradient(180deg, rgba(240, 40, 73, 0.2) 0%, ${FACEBOOK_DARK.base} 100%)`,
        border: `2px solid ${FACEBOOK_DARK.danger}`,
        color: FACEBOOK_DARK.danger,
        boxShadow: `0 0 20px ${FACEBOOK_DARK.dangerGlow}, 0 2px 8px rgba(0,0,0,0.3)`,
    },

    dimmed: {
        background: FACEBOOK_DARK.base,
        border: `2px solid ${FACEBOOK_DARK.mid}`,
        color: FACEBOOK_DARK.textMuted,
        boxShadow: 'none',
        cursor: 'default',
    },

    label: {
        fontSize: 13,
    },

    frequency: {
        fontSize: 10,
        opacity: 0.8,
    },

    indicator: {
        position: 'absolute',
        top: 6,
        right: 8,
        fontSize: 16,
        fontWeight: 'bold',
    },
};

export default React.memo(AnswerGrid);
