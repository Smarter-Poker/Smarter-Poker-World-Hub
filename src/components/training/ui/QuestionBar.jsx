/**
 * 🎯 Question Bar — Fixed Top Header
 * ═══════════════════════════════════════════════════════════════════
 * Displays the training question in a metallic sci-fi header strip.
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';

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
                    <span style={styles.brand}>Smarter Poker</span>
                </div>
            )}

            {/* Question Text */}
            <div style={styles.questionText}>
                {questionText}
            </div>

            {/* Subtext */}
            {subtext && (
                <div style={styles.subtext}>
                    ▶ {subtext}
                </div>
            )}

            {/* Streak Badge (if active) */}
            {streak >= 2 && (
                <div style={styles.streakBadge}>
                    🔥 {streak}
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
        background: 'linear-gradient(180deg, #3a3a4a 0%, #1a1a24 100%)',
        borderBottom: '3px solid #00d4ff',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 212, 255, 0.2)',
        position: 'relative',
    },

    titleRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 12,
    },

    title: {
        margin: 0,
        fontSize: 20,
        fontWeight: 'bold',
        color: '#00d4ff',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textTransform: 'uppercase',
        letterSpacing: 3,
        textShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4)',
    },

    brand: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        fontFamily: "'Inter', sans-serif",
        marginTop: 4,
    },

    questionText: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1.4,
        textAlign: 'center',
        textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
    },

    subtext: {
        marginTop: 8,
        color: '#00d4ff',
        fontSize: 13,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        textAlign: 'center',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },

    streakBadge: {
        position: 'absolute',
        top: 12,
        right: 16,
        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.3), rgba(251, 146, 60, 0.15))',
        padding: '6px 12px',
        borderRadius: 16,
        border: '1px solid rgba(251, 146, 60, 0.5)',
        color: '#fbbf24',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
    },

    questionCounter: {
        position: 'absolute',
        bottom: 8,
        right: 16,
        color: '#00d4ff',
        fontSize: 11,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', monospace",
        background: 'linear-gradient(180deg, #3a3a4a, #1a1a24)',
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(0, 212, 255, 0.3)',
    },
};
