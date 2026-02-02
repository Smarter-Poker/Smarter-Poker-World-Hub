/**
 * 🎯 SPINS ICM CALCULATOR UI — Game-Specific Training Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized UI for spins-003 (Button Limp) and spins-007 (50/50 Survival)
 * 
 * Features:
 * - ICM pressure meter
 * - Stack depth visualizer
 * - Prize pool distribution
 * - Survival indicator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import MillionaireQuestion from '../MillionaireQuestion';

export default function SpinsICMCalculatorUI({ question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level }) {
    if (!question) return null;

    const metadata = question.metadata || {};
    const {
        stackSize = 15,
        icmPressure = 'High',
        prizePool = '$100',
        playersLeft = 2,
        survivalMode = true
    } = metadata;

    // ICM pressure colors
    const pressureColors = {
        'Low': '#22c55e',
        'Medium': '#f59e0b',
        'High': '#ef4444',
        'Critical': '#dc2626'
    };

    const pressureColor = pressureColors[icmPressure] || '#f59e0b';

    return (
        <div style={styles.wrapper}>
            {/* ICM Dashboard */}
            <div style={styles.icmSection}>
                <div style={styles.icmHeader}>
                    <div style={styles.icmChip}>
                        <span style={styles.icmLabel}>Stack</span>
                        <span style={styles.icmValue}>{stackSize}bb</span>
                    </div>
                    <div style={styles.icmChip}>
                        <span style={styles.icmLabel}>Players Left</span>
                        <span style={styles.icmValue}>{playersLeft}</span>
                    </div>
                    <div style={styles.icmChip}>
                        <span style={styles.icmLabel}>Prize Pool</span>
                        <span style={styles.icmValue}>{prizePool}</span>
                    </div>
                </div>

                {/* ICM Pressure Meter */}
                <div style={styles.pressureSection}>
                    <div style={styles.pressureLabel}>
                        ICM Pressure: <span style={{ color: pressureColor }}>{icmPressure}</span>
                    </div>
                    <div style={styles.pressureMeter}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{
                                width: icmPressure === 'Critical' ? '100%' :
                                    icmPressure === 'High' ? '75%' :
                                        icmPressure === 'Medium' ? '50%' : '25%'
                            }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            style={{ ...styles.pressureFill, background: pressureColor }}
                        />
                    </div>
                </div>

                {survivalMode && (
                    <div style={styles.survivalBadge}>
                        🛡️ SURVIVAL MODE — Minimize Risk
                    </div>
                )}
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

    icmSection: {
        marginBottom: 24,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))',
        borderRadius: 16,
        border: '1px solid rgba(59, 130, 246, 0.3)',
    },

    icmHeader: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 16,
    },

    icmChip: {
        padding: '10px 14px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },

    icmLabel: {
        fontSize: 9,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
    },

    icmValue: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },

    pressureSection: {
        marginBottom: 12,
    },

    pressureLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#e2e8f0',
        marginBottom: 8,
    },

    pressureMeter: {
        width: '100%',
        height: 10,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 5,
        overflow: 'hidden',
    },

    pressureFill: {
        height: '100%',
        borderRadius: 5,
    },

    survivalBadge: {
        padding: '8px 16px',
        background: 'rgba(34, 197, 94, 0.2)',
        border: '1px solid #22c55e',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        color: '#22c55e',
        textAlign: 'center',
    },
};
