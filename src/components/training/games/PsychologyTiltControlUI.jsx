/**
 * 🎯 PSYCHOLOGY TILT CONTROL UI — Game-Specific Training Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized UI for psy-003: Tilt Control
 * 
 * Features:
 * - Scenario-based (no poker table)
 * - Emotional state indicator
 * - Tilt level meter
 * - Recovery action suggestions
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import MillionaireQuestion from '../MillionaireQuestion';

export default function PsychologyTiltControlUI({ question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level }) {
    if (!question) return null;

    const metadata = question.metadata || {};
    const {
        tiltLevel = 'Medium',
        emotionalState = 'Frustrated',
        triggerType = 'Bad Beat'
    } = metadata;

    // Tilt level colors and values
    const tiltLevels = {
        'Low': { color: '#22c55e', value: 25 },
        'Medium': { color: '#f59e0b', value: 50 },
        'High': { color: '#ef4444', value: 75 },
        'Extreme': { color: '#dc2626', value: 100 }
    };

    const currentTilt = tiltLevels[tiltLevel] || tiltLevels['Medium'];

    return (
        <div style={styles.wrapper}>
            {/* Tilt Meter */}
            <div style={styles.tiltSection}>
                <div style={styles.tiltHeader}>
                    <span style={styles.tiltLabel}>Tilt Level</span>
                    <span style={{ ...styles.tiltValue, color: currentTilt.color }}>
                        {tiltLevel}
                    </span>
                </div>

                <div style={styles.tiltMeter}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${currentTilt.value}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ ...styles.tiltFill, background: currentTilt.color }}
                    />
                </div>

                <div style={styles.emotionalRow}>
                    <div style={styles.emotionalChip}>
                        <span style={styles.emotionalLabel}>Emotional State</span>
                        <span style={styles.emotionalValue}>{emotionalState}</span>
                    </div>
                    <div style={styles.emotionalChip}>
                        <span style={styles.emotionalLabel}>Trigger</span>
                        <span style={styles.emotionalValue}>{triggerType}</span>
                    </div>
                </div>
            </div>

            {/* Standard Millionaire Question UI */}
            <MillionaireQuestion
                question={question}
                level={level}
                questionNumber={questionNumber}
                totalQuestions={totalQuestions}
                onAnswer={onAnswer}
                showFeedback={showFeedback}
                feedbackResult={feedbackResult}
                explanation={explanation}
            />
        </div>
    );
}

const styles = {
    wrapper: {
        width: '100%',
    },

    tiltSection: {
        marginBottom: 24,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05))',
        borderRadius: 16,
        border: '1px solid rgba(239, 68, 68, 0.3)',
    },

    tiltHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },

    tiltLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    tiltValue: {
        fontSize: 18,
        fontWeight: 900,
        fontFamily: "'Orbitron', sans-serif",
    },

    tiltMeter: {
        width: '100%',
        height: 12,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 16,
    },

    tiltFill: {
        height: '100%',
        borderRadius: 6,
        transition: 'width 0.8s ease-out',
    },

    emotionalRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },

    emotionalChip: {
        padding: '10px 14px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },

    emotionalLabel: {
        fontSize: 9,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
    },

    emotionalValue: {
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
    },
};
