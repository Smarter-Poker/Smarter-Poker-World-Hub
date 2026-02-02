/**
 * 🎯 CASH C-BET ACADEMY UI — Game-Specific Training Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized UI for cash-002: C-Bet Academy
 * 
 * Features:
 * - Board texture analyzer
 * - Bet sizing calculator
 * - Range advantage meter
 * - Frequency display
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import MillionaireQuestion from '../MillionaireQuestion';

export default function CashCBetAcademyUI({ question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level }) {
    if (!question) return null;

    const metadata = question.metadata || {};
    const {
        boardTexture = 'Dry',
        rangeAdvantage = 'High',
        optimalSizing = '66%',
        frequency = '75%'
    } = metadata;

    // Board texture colors
    const textureColors = {
        'Dry': '#22c55e',
        'Wet': '#f59e0b',
        'Dynamic': '#ef4444'
    };

    // Range advantage colors
    const advantageColors = {
        'High': '#22c55e',
        'Medium': '#f59e0b',
        'Low': '#ef4444'
    };

    return (
        <div style={styles.wrapper}>
            {/* Board Analysis Header */}
            <div style={styles.analysisRow}>
                <div style={styles.analysisChip}>
                    <span style={styles.chipLabel}>Board</span>
                    <span style={{ ...styles.chipValue, color: textureColors[boardTexture] || '#fff' }}>
                        {boardTexture}
                    </span>
                </div>
                <div style={styles.analysisChip}>
                    <span style={styles.chipLabel}>Range Advantage</span>
                    <span style={{ ...styles.chipValue, color: advantageColors[rangeAdvantage] || '#fff' }}>
                        {rangeAdvantage}
                    </span>
                </div>
                <div style={styles.analysisChip}>
                    <span style={styles.chipLabel}>Optimal Size</span>
                    <span style={styles.chipValue}>{optimalSizing}</span>
                </div>
                <div style={styles.analysisChip}>
                    <span style={styles.chipLabel}>Frequency</span>
                    <span style={styles.chipValue}>{frequency}</span>
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

    analysisRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12,
        marginBottom: 24,
        padding: '0 20px',
    },

    analysisChip: {
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },

    chipLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
    },

    chipValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
};
