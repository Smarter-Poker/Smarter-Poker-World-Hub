/**
 * 🎯 ADVANCED SOLVER MIMICRY UI — Game-Specific Training Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized UI for adv-001 (Solver Mimicry) and adv-017 (Capped Ranges)
 * 
 * Features:
 * - Frequency display (mixed strategies)
 * - EV comparison chart
 * - Range strength indicator
 * - Solver recommendation display
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';
import MillionaireQuestion from '../MillionaireQuestion';

export default function AdvancedSolverMimicryUI({ question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level }) {
    if (!question) return null;

    const metadata = question.metadata || {};
    const {
        solverFrequency = '65%',
        evDifference = '+0.12bb',
        rangeStrength = 'Medium',
        mixedStrategy = true
    } = metadata;

    // Range strength colors
    const strengthColors = {
        'Strong': '#22c55e',
        'Medium': '#f59e0b',
        'Weak': '#ef4444',
        'Capped': '#a78bfa'
    };

    const strengthColor = strengthColors[rangeStrength] || '#f59e0b';

    return (
        <div style={styles.wrapper}>
            {/* Solver Analysis Dashboard */}
            <div style={styles.solverSection}>
                <div style={styles.solverHeader}>
                    <div style={styles.solverTitle}>
                        🧠 Solver Analysis
                    </div>
                    {mixedStrategy && (
                        <div style={styles.mixedBadge}>
                            MIXED STRATEGY
                        </div>
                    )}
                </div>

                <div style={styles.metricsGrid}>
                    <div style={styles.metricCard}>
                        <span style={styles.metricLabel}>Frequency</span>
                        <span style={styles.metricValue}>{solverFrequency}</span>
                        <div style={styles.frequencyBar}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: solverFrequency }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                style={styles.frequencyFill}
                            />
                        </div>
                    </div>

                    <div style={styles.metricCard}>
                        <span style={styles.metricLabel}>EV Difference</span>
                        <span style={{ ...styles.metricValue, color: evDifference.startsWith('+') ? '#22c55e' : '#ef4444' }}>
                            {evDifference}
                        </span>
                    </div>

                    <div style={styles.metricCard}>
                        <span style={styles.metricLabel}>Range Strength</span>
                        <span style={{ ...styles.metricValue, color: strengthColor }}>
                            {rangeStrength}
                        </span>
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

    solverSection: {
        marginBottom: 24,
        padding: 20,
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(147, 51, 234, 0.05))',
        borderRadius: 16,
        border: '1px solid rgba(168, 85, 247, 0.3)',
    },

    solverHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },

    solverTitle: {
        fontSize: 14,
        fontWeight: 700,
        color: '#a78bfa',
    },

    mixedBadge: {
        padding: '4px 12px',
        background: 'rgba(168, 85, 247, 0.2)',
        border: '1px solid #a78bfa',
        borderRadius: 12,
        fontSize: 9,
        fontWeight: 800,
        color: '#a78bfa',
        letterSpacing: 0.5,
    },

    metricsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
    },

    metricCard: {
        padding: '12px 14px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },

    metricLabel: {
        fontSize: 9,
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
    },

    metricValue: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
    },

    frequencyBar: {
        width: '100%',
        height: 6,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 4,
    },

    frequencyFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #a78bfa, #c084fc)',
        borderRadius: 3,
    },
};
