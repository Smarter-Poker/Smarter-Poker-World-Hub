/**
 * PSYCHOLOGY TILT CONTROL UI — Game-Specific Training Component
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Specialized UI for psy-003: Tilt Control
 * 
 * Features:
 * - Scenario-based (no poker table)
 * - Emotional state indicator
 * - Tilt level meter
 * - Recovery action suggestions
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React from 'react';
import { motion } from 'framer-motion';
import GTOQuestionCard from '../GTOQuestionCard';

export default function PsychologyTiltControlUI({ gameId, question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level, onNextHand }) {
    if (!question) return null;

    const hasMetadata = Boolean(question?.metadata);
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
    const scenarioPos = question?.scenario?.heroPosition || 'BTN';
    const scenarioStack = question?.scenario?.heroStack || 100;
    const scenarioPot = question?.scenario?.pot || 12.5;

    return (
        <div
            data-training-game-id={gameId}
            data-training-ui="psychology-scenario"
            style={styles.wrapper}
        >
            {/* Club Arena Live Table Context Rail */}
            <div style={styles.arenaStageHeader}>
                <div style={styles.arenaFeltStrip}>
                    <div style={styles.arenaSeatCluster}>
                        <div style={styles.dealerPuck}>D</div>
                        <div style={styles.heroPlate}>
                            <span style={styles.heroPlateRole}>HERO ({scenarioPos})</span>
                            <span style={styles.heroPlateStack}>{scenarioStack} BB</span>
                        </div>
                    </div>
                    <div style={styles.arenaCenterBadge}>
                        <span style={styles.arenaWaterMark}>CLUB ARENA • MENTAL GAME LAB</span>
                        <div style={styles.arenaPotPill}>
                            <span style={styles.arenaPotChip} />
                            <span style={styles.arenaPotLabel}>POT</span>
                            <span style={styles.arenaPotValue}>{scenarioPot} BB</span>
                        </div>
                    </div>
                    <div style={styles.arenaHandCounter}>
                        <span style={styles.arenaHandLabel}>DECISION</span>
                        <span style={styles.arenaHandValue}>{questionNumber || 1} / {totalQuestions || 25}</span>
                    </div>
                </div>

                {/* Tilt Meter — rendered when the question carries emotional telemetry */}
                {hasMetadata && (
                    <div style={styles.tiltSection}>
                        <div style={styles.tiltHeader}>
                            <span style={styles.tiltLabel}>Tilt Pressure Telemetry</span>
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
                )}
            </div>

            {/* Club Arena Scenario Decision Card */}
            <GTOQuestionCard
                gameId={gameId}
                question={question}
                level={level}
                questionNumber={questionNumber}
                totalQuestions={totalQuestions}
                onAnswer={onAnswer}
                showFeedback={showFeedback}
                feedbackResult={feedbackResult}
                explanation={explanation}
                onNextHand={onNextHand}
            />
        </div>
    );
}

const styles = {
    wrapper: {
        width: '100%',
        maxWidth: 1180,
        margin: '0 auto',
    },

    arenaStageHeader: {
        marginBottom: 14,
        padding: '12px 16px',
        background: 'radial-gradient(circle at 50% 15%, rgba(56,146,177,0.22), transparent 55%), linear-gradient(180deg, rgba(18,39,50,0.96) 0%, rgba(7,16,25,0.98) 100%)',
        border: '1px solid rgba(112,230,255,0.34)',
        borderRadius: 12,
        boxShadow: '0 14px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
    },

    arenaFeltStrip: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
    },

    arenaSeatCluster: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },

    dealerPuck: {
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #fffef5 0%, #f5d061 55%, #b47d17 100%)',
        border: '1.5px solid #4a3000',
        boxShadow: '0 2px 6px rgba(0,0,0,0.65)',
        color: '#1a1200',
        fontSize: 12,
        fontWeight: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    heroPlate: {
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 12px',
        borderRadius: 8,
        background: 'linear-gradient(180deg, rgba(24,36,48,0.96), rgba(8,14,22,0.98))',
        border: '1px solid rgba(255,199,84,0.65)',
        boxShadow: '0 0 12px rgba(255,178,44,0.25)',
    },

    heroPlateRole: {
        fontSize: 12,
        fontWeight: 800,
        color: '#f8fafc',
        letterSpacing: 0.6,
    },

    heroPlateStack: {
        fontSize: 12,
        fontWeight: 900,
        color: '#fbbf24',
        fontVariantNumeric: 'tabular-nums',
    },

    arenaCenterBadge: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    arenaWaterMark: {
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 1.8,
        color: 'rgba(142,216,235,0.78)',
        textTransform: 'uppercase',
    },

    arenaPotPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 12px',
        borderRadius: 999,
        background: 'rgba(4,9,18,0.88)',
        border: '1px solid rgba(0,212,255,0.28)',
    },

    arenaPotChip: {
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 34% 27%, #fff1f2 0 18%, #ef4444 21% 45%, #fee2e2 48% 58%, #b91c1c 61% 76%, #fecaca 79%)',
        border: '1px solid #fee2e2',
    },

    arenaPotLabel: {
        fontSize: 12,
        fontWeight: 900,
        color: '#f5a623',
        letterSpacing: 1,
    },

    arenaPotValue: {
        fontSize: 13,
        fontWeight: 800,
        color: '#f8fafc',
        fontVariantNumeric: 'tabular-nums',
    },

    arenaHandCounter: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        padding: '4px 10px',
        borderRadius: 8,
        background: 'rgba(2,8,14,0.75)',
        border: '1px solid rgba(142,216,235,0.22)',
    },

    arenaHandLabel: {
        fontSize: 12,
        fontWeight: 800,
        color: '#8ed8eb',
        letterSpacing: 1,
    },

    arenaHandValue: {
        fontSize: 13,
        fontWeight: 900,
        color: '#f8fafc',
        fontVariantNumeric: 'tabular-nums',
    },

    tiltSection: {
        marginTop: 12,
        padding: 14,
        background: 'linear-gradient(135deg, rgba(15,23,42,0.85), rgba(7,16,25,0.92))',
        borderRadius: 10,
        border: '1px solid rgba(239, 68, 68, 0.32)',
    },

    tiltHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },

    tiltLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    tiltValue: {
        fontSize: 18,
        fontWeight: 900,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
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
        fontSize: 12,
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
