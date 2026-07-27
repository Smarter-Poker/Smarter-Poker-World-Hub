/**
 * Question Bar — SmarterPoker Dark Theme
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Fixed header displaying the training question.
 * Uses SmarterPoker Dark color palette.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React from 'react';
import { motion } from 'framer-motion';
import { SMARTERPOKER_DARK } from '../../../hooks/useTrainingTheme';

export default function QuestionBar({
    title = null,
    questionText = 'What is the GTO play in this spot?',
    subtext = 'Choose the best action',
    streak = 0,
    questionNumber = null,
    totalQuestions = null,
}) {
    return (
        <motion.div
            style={styles.container}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
        >
            {/* Title Row (optional) */}
            {title && (
                <div style={styles.titleRow}>
                    <h2 style={styles.title}>{title}</h2>
                </div>
            )}

            {/* Question Text */}
            <div style={styles.questionText}>
                {questionText}
            </div>

            {/* Subtext */}
            {subtext && (
                <div style={styles.subtext}>
                    {subtext}
                </div>
            )}

            {/* Streak Badge (if active) */}
            {streak >= 2 && (
                <div style={styles.streakBadge}>
                    ★ {streak}
                </div>
            )}

            {/* Question Counter */}
            {questionNumber && totalQuestions && (
                <div style={styles.questionCounter}>
                    Q{questionNumber}/{totalQuestions}
                </div>
            )}
        </motion.div>
    );
}

const styles = {
    container: {
        width: '100%',
        padding: '16px 20px',
        background: `linear-gradient(180deg, ${SMARTERPOKER_DARK.mid} 0%, ${SMARTERPOKER_DARK.base} 100%)`,
        borderBottom: `3px solid ${SMARTERPOKER_DARK.primary}`,
        boxShadow: `0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px ${SMARTERPOKER_DARK.primaryDim}`,
        position: 'relative',
    },

    titleRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 10,
    },

    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 'bold',
        color: SMARTERPOKER_DARK.primary,
        fontFamily: "'Inter', -apple-system, sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 2,
    },

    questionText: {
        color: SMARTERPOKER_DARK.textPrimary,
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: "'Inter', -apple-system, sans-serif",
        lineHeight: 1.4,
        textAlign: 'center',
    },

    subtext: {
        marginTop: 6,
        color: SMARTERPOKER_DARK.primary,
        fontSize: 12,
        fontWeight: '600',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'center',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },

    streakBadge: {
        position: 'absolute',
        top: 12,
        right: 16,
        background: `${SMARTERPOKER_DARK.goldGlow}`,
        padding: '5px 12px',
        borderRadius: 16,
        border: `1px solid ${SMARTERPOKER_DARK.gold}`,
        color: SMARTERPOKER_DARK.gold,
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: "'Inter', sans-serif",
    },

    questionCounter: {
        position: 'absolute',
        bottom: 8,
        right: 16,
        color: SMARTERPOKER_DARK.primary,
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: "'Inter', sans-serif",
        background: SMARTERPOKER_DARK.darkest,
        padding: '4px 10px',
        borderRadius: 6,
        border: `1px solid ${SMARTERPOKER_DARK.primaryDim}`,
    },
};
