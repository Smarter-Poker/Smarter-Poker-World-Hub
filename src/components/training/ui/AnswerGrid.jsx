/**
 * 🎯 Answer Grid — 2×2 Choice Buttons
 * ═══════════════════════════════════════════════════════════════════
 * Exactly 4 answer choices in a 2×2 grid with metallic styling.
 * States: idle, hover, selected, correct, incorrect
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function AnswerGrid({
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

    return (
        <div style={styles.container}>
            <div style={styles.grid}>
                {paddedAnswers.map((answer, index) => {
                    const state = getButtonState(answer);
                    const buttonStyle = {
                        ...styles.button,
                        ...styles[state],
                    };

                    return (
                        <motion.button
                            key={answer.id ?? index}
                            style={buttonStyle}
                            onClick={() => !disabled && onSelect?.(answer)}
                            disabled={disabled || !answer.label}
                            whileHover={!disabled ? { scale: 1.02 } : {}}
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
                                <span style={styles.indicator}>✓</span>
                            )}
                            {showFeedback && state === 'incorrect' && (
                                <span style={styles.indicator}>✗</span>
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
        background: 'linear-gradient(180deg, #1a1a24 0%, #0d0d14 100%)',
    },

    grid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
    },

    button: {
        padding: '18px 16px',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textTransform: 'uppercase',
        letterSpacing: 1,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: 60,
    },

    // Button states
    idle: {
        background: 'linear-gradient(180deg, #5a5a70 0%, #3d3d52 30%, #2a2a3d 60%, #1a1a28 100%)',
        border: '2px solid rgba(0, 212, 255, 0.4)',
        color: '#00d4ff',
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.2), 0 4px 15px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.1)',
        textShadow: '0 0 10px rgba(0, 212, 255, 0.7)',
    },

    selected: {
        background: 'linear-gradient(180deg, #3a5a70 0%, #2a4a5d 50%, #1a3a4a 100%)',
        border: '2px solid #00d4ff',
        color: '#00d4ff',
        boxShadow: '0 0 25px rgba(0, 212, 255, 0.5), 0 4px 15px rgba(0,0,0,0.4)',
        textShadow: '0 0 15px rgba(0, 212, 255, 1)',
    },

    correct: {
        background: 'linear-gradient(180deg, #1a5a3a 0%, #0d4028 50%, #0a3020 100%)',
        border: '2px solid #22c55e',
        color: '#22c55e',
        boxShadow: '0 0 25px rgba(34, 197, 94, 0.5), 0 4px 15px rgba(0,0,0,0.4)',
        textShadow: '0 0 12px rgba(34, 197, 94, 0.8)',
    },

    incorrect: {
        background: 'linear-gradient(180deg, #5a2a2a 0%, #4a1a1a 50%, #301515 100%)',
        border: '2px solid #ef4444',
        color: '#ef4444',
        boxShadow: '0 0 25px rgba(239, 68, 68, 0.5), 0 4px 15px rgba(0,0,0,0.4)',
        textShadow: '0 0 12px rgba(239, 68, 68, 0.8)',
    },

    dimmed: {
        background: 'linear-gradient(180deg, #3a3a4a 0%, #2a2a3a 50%, #1a1a24 100%)',
        border: '2px solid #444',
        color: '#666',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        textShadow: 'none',
        cursor: 'default',
    },

    label: {
        fontSize: 14,
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
