/**
 * 🎯 MTT DEEP STACK UI — Game-Specific Training Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized UI for mtt-007: Deep Stack MTT training
 * 
 * Features:
 * - Stack depth visualizer (100-150bb)
 * - Position indicator
 * - Pot size display
 * - Board texture analyzer
 * - Range advantage indicator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function MTTDeepStackUI({ question, onAnswer, showFeedback, feedbackResult }) {
    if (!question) return null;

    // Parse question data - handle both formats
    const {
        scenario,
        question: questionText,
        options = [],
        correctAnswer,
        explanation,
        metadata = {}
    } = question;

    // Use scenario if available, otherwise use question field
    const scenarioText = scenario || questionText || "No scenario available";

    // Extract metadata with safe defaults
    const {
        stackSize = 120,
        position = 'BTN',
        potSize = 15,
        boardTexture = 'Dry',
        effectiveStack = stackSize || 120
    } = metadata;

    // Calculate stack depth category
    const getStackCategory = (bb) => {
        if (bb < 50) return { label: 'SHORT', color: '#ef4444' };
        if (bb < 100) return { label: 'MEDIUM', color: '#f59e0b' };
        return { label: 'DEEP', color: '#22c55e' };
    };

    const stackCategory = getStackCategory(effectiveStack);

    return (
        <div style={styles.container}>
            {/* Stack Visualizer */}
            <div style={styles.stackSection}>
                <div style={styles.stackLabel}>Effective Stack</div>
                <div style={styles.stackDisplay}>
                    <span style={{ ...styles.stackValue, color: stackCategory.color }}>
                        {effectiveStack}bb
                    </span>
                    <span style={{ ...styles.stackCategory, background: stackCategory.color }}>
                        {stackCategory.label}
                    </span>
                </div>

                {/* Stack Depth Bar */}
                <div style={styles.stackBar}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((effectiveStack / 150) * 100, 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ ...styles.stackFill, background: stackCategory.color }}
                    />
                </div>
            </div>

            {/* Game Info Row */}
            <div style={styles.infoRow}>
                <div style={styles.infoChip}>
                    <span style={styles.infoLabel}>Position</span>
                    <span style={styles.infoValue}>{position}</span>
                </div>
                <div style={styles.infoChip}>
                    <span style={styles.infoLabel}>Pot</span>
                    <span style={styles.infoValue}>{potSize}bb</span>
                </div>
                <div style={styles.infoChip}>
                    <span style={styles.infoLabel}>Board</span>
                    <span style={styles.infoValue}>{boardTexture}</span>
                </div>
            </div>

            {/* Scenario Text */}
            <div style={styles.scenarioBox}>
                <div style={styles.scenarioLabel}>Scenario</div>
                <p style={styles.scenarioText}>{scenarioText}</p>
            </div>

            {/* Answer Options */}
            <div style={styles.optionsContainer}>
                {Array.isArray(options) && options.map((option, index) => {
                    // Handle both string array and object array formats
                    const optionText = typeof option === 'string' ? option : (option.text || option.label || 'Unknown');
                    const optionId = typeof option === 'object' && option.id ? option.id : String.fromCharCode(65 + index);
                    const optionLetter = String.fromCharCode(65 + index); // A, B, C, D
                    const isCorrect = optionLetter === correctAnswer || optionId === correctAnswer;
                    const isSelected = showFeedback; // Simplified for now

                    let optionStyle = styles.option;
                    if (showFeedback) {
                        if (isCorrect) {
                            optionStyle = { ...styles.option, ...styles.optionCorrect };
                        } else if (feedbackResult === 'wrong') {
                            optionStyle = { ...styles.option, ...styles.optionWrong };
                        }
                    }

                    return (
                        <motion.button
                            key={index}
                            onClick={() => !showFeedback && onAnswer(optionLetter)}
                            disabled={showFeedback}
                            style={optionStyle}
                            whileHover={!showFeedback ? { scale: 1.02 } : {}}
                            whileTap={!showFeedback ? { scale: 0.98 } : {}}
                        >
                            <span style={styles.optionLetter}>{optionLetter}</span>
                            <span style={styles.optionText}>{optionText}</span>
                        </motion.button>
                    );
                })}
            </div>

            {/* Explanation (shown after answer) */}
            {showFeedback && explanation && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.explanationBox}
                >
                    <div style={styles.explanationLabel}>
                        {feedbackResult === 'correct' ? '✅ Correct!' : '❌ Incorrect'}
                    </div>
                    <p style={styles.explanationText}>{explanation}</p>
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        maxWidth: 700,
        margin: '0 auto',
        padding: 20,
        fontFamily: "'Inter', sans-serif",
    },

    // Stack Visualizer
    stackSection: {
        marginBottom: 24,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.6))',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },

    stackLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },

    stackDisplay: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },

    stackValue: {
        fontSize: 32,
        fontWeight: 900,
        fontFamily: "'Orbitron', sans-serif",
    },

    stackCategory: {
        padding: '4px 12px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.5,
    },

    stackBar: {
        width: '100%',
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },

    stackFill: {
        height: '100%',
        borderRadius: 4,
    },

    // Info Row
    infoRow: {
        display: 'flex',
        gap: 12,
        marginBottom: 24,
    },

    infoChip: {
        flex: 1,
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },

    infoLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
    },

    infoValue: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
    },

    // Scenario
    scenarioBox: {
        padding: 20,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.3)',
        marginBottom: 24,
    },

    scenarioLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: '#60a5fa',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },

    scenarioText: {
        fontSize: 15,
        lineHeight: 1.6,
        color: '#e2e8f0',
        margin: 0,
    },

    // Options
    optionsContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 24,
    },

    option: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.6))',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s',
        textAlign: 'left',
    },

    optionCorrect: {
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1))',
        border: '2px solid #22c55e',
    },

    optionWrong: {
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1))',
        border: '2px solid #ef4444',
    },

    optionLetter: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
    },

    optionText: {
        fontSize: 14,
        fontWeight: 500,
        color: '#e2e8f0',
        flex: 1,
    },

    // Explanation
    explanationBox: {
        padding: 20,
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(147, 51, 234, 0.05))',
        borderRadius: 12,
        border: '1px solid rgba(168, 85, 247, 0.3)',
    },

    explanationLabel: {
        fontSize: 13,
        fontWeight: 700,
        color: '#a78bfa',
        marginBottom: 8,
    },

    explanationText: {
        fontSize: 14,
        lineHeight: 1.6,
        color: '#e2e8f0',
        margin: 0,
    },
};
