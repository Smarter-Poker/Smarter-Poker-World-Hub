/**
 * MentalGym.tsx
 * ==============
 * Mental Game / Psychology training component for SCENARIO engine.
 *
 * Features:
 * - Large text scenario display
 * - Timed decision making with countdown
 * - Big action buttons for choices
 * - Emotional state indicators
 * - Feedback with explanation
 * - No poker table - focused view
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface Choice {
    id: string;
    label: string;
    icon: string;
    description?: string;
    emotionalType?: 'impulsive' | 'rational' | 'passive' | 'aggressive';
}

interface MentalGymProps {
    scenarioId: string;
    scriptName: string;
    scenarioText?: string;
    situationContext?: string;
    choices?: Choice[];
    correctChoiceId?: string;
    timeLimit?: number;        // seconds, default 15
    phase: 'READING' | 'DECIDING' | 'SHOWING_RESULT';
    resultFeedback?: {
        choiceId: string;
        isCorrect: boolean;
        explanation: string;
        emotionalLesson?: string;
    } | null;
    onChoice: (choiceId: string) => void;
}

// ============================================================================
// DEFAULT SCENARIOS (used if not provided)
// ============================================================================

const DEFAULT_SCENARIOS: Record<string, {
    text: string;
    context: string;
    choices: Choice[];
    correctId: string;
}> = {
    'tilt-control': {
        text: "You just lost 3 buy-ins to coolers. Your opponent shows you 72o after rivering a boat. Your blood is boiling.",
        context: "Session: -5 buy-ins | Time at table: 4 hours",
        choices: [
            { id: 'TILT', label: 'Express Frustration', icon: '😤', description: 'Let villain know how you feel', emotionalType: 'impulsive' },
            { id: 'BREATHE', label: 'Take a Deep Breath', icon: '🧘', description: 'Center yourself, stay calm', emotionalType: 'rational' },
            { id: 'RELOAD', label: 'Immediately Reload', icon: '💰', description: 'Get back in action fast', emotionalType: 'aggressive' },
            { id: 'LEAVE', label: 'Leave the Table', icon: '🚪', description: 'Walk away for now', emotionalType: 'passive' },
        ],
        correctId: 'BREATHE',
    },
    'fear-test': {
        text: "You're on the bubble of a $500 tournament. You have 12BB with AKo UTG. The money starts at 15th place - you're 16th.",
        context: "Bubble | 12BB | UTG | AKo",
        choices: [
            { id: 'SHOVE', label: 'Shove All-In', icon: '🚀', description: 'Maximum pressure', emotionalType: 'aggressive' },
            { id: 'MINRAISE', label: 'Min-Raise', icon: '📈', description: 'Control the pot', emotionalType: 'rational' },
            { id: 'LIMP', label: 'Limp In', icon: '🐌', description: 'See a cheap flop', emotionalType: 'passive' },
            { id: 'FOLD', label: 'Fold to Ladder', icon: '📉', description: 'Wait for a better spot', emotionalType: 'passive' },
        ],
        correctId: 'SHOVE',
    },
    'greed-check': {
        text: "You've turned a $200 session into $1,500. You're playing your A-game but it's 3 AM and you need to work tomorrow.",
        context: "Session: +$1,300 | Time: 3:00 AM | Work at 8 AM",
        choices: [
            { id: 'GRIND', label: 'Keep Grinding', icon: '💎', description: 'Run it up while hot', emotionalType: 'aggressive' },
            { id: 'ONEHOUR', label: 'One More Hour', icon: '⏰', description: 'Set a hard stop', emotionalType: 'impulsive' },
            { id: 'QUIT', label: 'Book the Win', icon: '✅', description: 'Lock in profits', emotionalType: 'rational' },
            { id: 'MOVING', label: 'Move Up Stakes', icon: '🎰', description: 'Shot at higher limits', emotionalType: 'impulsive' },
        ],
        correctId: 'QUIT',
    },
};

// ============================================================================
// TRIGGER BADGES
// ============================================================================

const getTriggerBadge = (scriptName: string): { label: string; color: string; icon: string } => {
    switch (scriptName) {
        case 'bad_beats':
        case 'tilt_test':
            return { label: 'TILT ALERT', color: '#ff4444', icon: '🔥' };
        case 'bubble_pressure':
        case 'fear_test':
            return { label: 'FEAR TEST', color: '#ffaa00', icon: '😰' };
        case 'winning_streaks':
        case 'greed_test':
            return { label: 'GREED CHECK', color: '#00ff88', icon: '💰' };
        case 'patience':
            return { label: 'PATIENCE TEST', color: '#00d4ff', icon: '⏳' };
        default:
            return { label: 'MENTAL GAME', color: '#aa66ff', icon: '🧠' };
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

const MentalGym: React.FC<MentalGymProps> = ({
    scenarioId,
    scriptName,
    scenarioText,
    situationContext,
    choices,
    correctChoiceId,
    timeLimit = 15,
    phase,
    resultFeedback,
    onChoice,
}) => {
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Get scenario data (use defaults if not provided)
    const defaultScenario = DEFAULT_SCENARIOS[scenarioId] || DEFAULT_SCENARIOS['tilt-control'];
    const displayText = scenarioText || defaultScenario.text;
    const displayContext = situationContext || defaultScenario.context;
    const displayChoices = choices || defaultScenario.choices;

    // Timer countdown
    useEffect(() => {
        if (phase !== 'DECIDING') {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        setTimeLeft(timeLimit);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    // Time's up - auto-select worst option (impulsive)
                    const impulsiveChoice = displayChoices.find(c => c.emotionalType === 'impulsive');
                    if (impulsiveChoice) {
                        onChoice(impulsiveChoice.id);
                    }
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [phase, timeLimit, displayChoices, onChoice]);

    const handleChoiceClick = useCallback((choiceId: string) => {
        if (phase !== 'DECIDING') return;
        setSelectedChoice(choiceId);
        if (timerRef.current) clearInterval(timerRef.current);
        onChoice(choiceId);
    }, [phase, onChoice]);

    const trigger = getTriggerBadge(scriptName);
    const timerPercent = (timeLeft / timeLimit) * 100;
    const timerColor = timeLeft > 5 ? '#00d4ff' : '#ff4444';

    return (
        <div style={styles.container}>
            {/* Trigger Badge */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                style={{ ...styles.triggerBadge, background: trigger.color }}
            >
                <span>{trigger.icon}</span>
                <span>{trigger.label}</span>
            </motion.div>

            {/* Scenario Card */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                style={styles.scenarioCard}
            >
                {/* Context badge */}
                <div style={styles.contextBadge}>
                    {displayContext}
                </div>

                {/* Main scenario text */}
                <p style={styles.scenarioText}>
                    "{displayText}"
                </p>
            </motion.div>

            {/* Timer (only in DECIDING phase) */}
            {phase === 'DECIDING' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.timerContainer}
                >
                    <div style={styles.timerLabel}>
                        <span style={{ color: timerColor }}>{timeLeft}</span>s
                    </div>
                    <div style={styles.timerBar}>
                        <motion.div
                            style={{
                                ...styles.timerFill,
                                background: timerColor,
                            }}
                            animate={{ width: `${timerPercent}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                </motion.div>
            )}

            {/* Choices */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                style={styles.choicesContainer}
            >
                <div style={styles.choicePrompt}>What do you do?</div>
                <div style={styles.choicesGrid}>
                    {displayChoices.map((choice, idx) => (
                        <motion.button
                            key={choice.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + idx * 0.1 }}
                            whileHover={{ scale: phase === 'DECIDING' ? 1.03 : 1 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleChoiceClick(choice.id)}
                            disabled={phase !== 'DECIDING'}
                            style={{
                                ...styles.choiceButton,
                                opacity: phase !== 'DECIDING' ? 0.6 : 1,
                                cursor: phase === 'DECIDING' ? 'pointer' : 'default',
                            }}
                        >
                            <span style={styles.choiceIcon}>{choice.icon}</span>
                            <div style={styles.choiceContent}>
                                <div style={styles.choiceLabel}>{choice.label}</div>
                                {choice.description && (
                                    <div style={styles.choiceDescription}>{choice.description}</div>
                                )}
                            </div>
                            {choice.emotionalType && (
                                <span style={{
                                    ...styles.emotionalTag,
                                    background: choice.emotionalType === 'rational' ? 'rgba(0, 255, 136, 0.2)' :
                                               choice.emotionalType === 'impulsive' ? 'rgba(255, 68, 68, 0.2)' :
                                               choice.emotionalType === 'aggressive' ? 'rgba(255, 170, 0, 0.2)' :
                                               'rgba(100, 100, 100, 0.2)',
                                    color: choice.emotionalType === 'rational' ? '#00ff88' :
                                           choice.emotionalType === 'impulsive' ? '#ff4444' :
                                           choice.emotionalType === 'aggressive' ? '#ffaa00' :
                                           '#888',
                                }}>
                                    {choice.emotionalType}
                                </span>
                            )}
                        </motion.button>
                    ))}
                </div>
            </motion.div>

            {/* Result Feedback Overlay */}
            <AnimatePresence>
                {phase === 'SHOWING_RESULT' && resultFeedback && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.resultOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            style={{
                                ...styles.resultCard,
                                borderColor: resultFeedback.isCorrect ? '#00ff88' : '#ff4444',
                            }}
                        >
                            <div style={{
                                fontSize: 56,
                                marginBottom: 16,
                            }}>
                                {resultFeedback.isCorrect ? '✅' : '❌'}
                            </div>
                            <div style={{
                                fontSize: 28,
                                fontWeight: 800,
                                color: resultFeedback.isCorrect ? '#00ff88' : '#ff4444',
                                marginBottom: 16,
                            }}>
                                {resultFeedback.isCorrect ? 'GOOD DECISION!' : 'WRONG CHOICE'}
                            </div>
                            <p style={styles.explanationText}>
                                {resultFeedback.explanation}
                            </p>
                            {resultFeedback.emotionalLesson && (
                                <div style={styles.lessonBox}>
                                    <span style={{ marginRight: 8 }}>💡</span>
                                    {resultFeedback.emotionalLesson}
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 24,
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
    },
    triggerBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 24,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 24,
    },
    scenarioCard: {
        maxWidth: 600,
        padding: 32,
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: 24,
    },
    contextBadge: {
        display: 'inline-block',
        padding: '6px 12px',
        background: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        color: '#00d4ff',
        marginBottom: 16,
    },
    scenarioText: {
        fontSize: 22,
        fontStyle: 'italic',
        color: '#fff',
        lineHeight: 1.6,
        margin: 0,
        textAlign: 'center',
    },
    timerContainer: {
        width: '100%',
        maxWidth: 400,
        marginBottom: 24,
    },
    timerLabel: {
        textAlign: 'center',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    timerBar: {
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    timerFill: {
        height: '100%',
        borderRadius: 4,
        transition: 'background 0.3s ease',
    },
    choicesContainer: {
        width: '100%',
        maxWidth: 600,
    },
    choicePrompt: {
        textAlign: 'center',
        fontSize: 18,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 20,
    },
    choicesGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    choiceButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 12,
        textAlign: 'left',
        transition: 'all 0.2s ease',
    },
    choiceIcon: {
        fontSize: 32,
        flexShrink: 0,
    },
    choiceContent: {
        flex: 1,
    },
    choiceLabel: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 2,
    },
    choiceDescription: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    emotionalTag: {
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
    },
    resultOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    resultCard: {
        maxWidth: 500,
        padding: 40,
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 20,
        border: '2px solid',
        textAlign: 'center',
    },
    explanationText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: 1.6,
        marginBottom: 20,
    },
    lessonBox: {
        padding: 16,
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 12,
        border: '1px solid rgba(255, 215, 0, 0.3)',
        fontSize: 14,
        color: '#ffd700',
        fontStyle: 'italic',
    },
};

export default MentalGym;
