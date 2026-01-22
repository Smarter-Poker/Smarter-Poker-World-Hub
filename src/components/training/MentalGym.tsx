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

interface MentalGymProps {
    scenarioId: string;
    scriptName: string;
    scenarioText: string;
    situationContext?: string;
    choices: Choice[];
    correctChoice: string;
    timeLimit?: number;          // Seconds for decision (0 = no limit)
    riggedOutcome?: string;      // For rigged scenarios (bad beat incoming, etc.)
    emotionalTrigger?: string;   // 'tilt', 'fear', 'greed', 'impatience'
    onChoice: (choiceId: string, timeRemaining: number) => void;
    resultFeedback?: {
        choiceId: string;
        isCorrect: boolean;
        explanation: string;
        emotionalLesson?: string;
    } | null;
    phase: 'READING' | 'DECIDING' | 'SHOWING_RESULT';
}

interface Choice {
    id: string;
    label: string;
    icon: string;
    description?: string;
    emotionalType?: 'impulsive' | 'rational' | 'passive' | 'aggressive';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EMOTIONAL_COLORS: { [key: string]: string } = {
    tilt: '#FF5722',
    fear: '#9C27B0',
    greed: '#FFD700',
    impatience: '#FF9800',
    confidence: '#4CAF50',
    focus: '#2196F3',
};

const CHOICE_TYPE_COLORS: { [key: string]: string } = {
    impulsive: '#FF5722',
    rational: '#4CAF50',
    passive: '#9E9E9E',
    aggressive: '#FF9800',
};

// ============================================================================
// TIMER COMPONENT
// ============================================================================

const CountdownTimer: React.FC<{
    seconds: number;
    onExpire: () => void;
    isPaused: boolean;
}> = ({ seconds, onExpire, isPaused }) => {
    const [timeLeft, setTimeLeft] = useState(seconds);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setTimeLeft(seconds);
    }, [seconds]);

    useEffect(() => {
        if (isPaused || timeLeft <= 0) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (timeLeft <= 0) {
                onExpire();
            }
            return;
        }

        intervalRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isPaused, timeLeft, onExpire]);

    const percentage = (timeLeft / seconds) * 100;
    const isUrgent = timeLeft <= 5;
    const isCritical = timeLeft <= 3;

    return (
        <motion.div
            animate={isCritical ? { scale: [1, 1.05, 1] } : {}}
            transition={isCritical ? { duration: 0.5, repeat: Infinity } : {}}
            style={styles.timerContainer}
        >
            <div style={styles.timerTrack}>
                <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.3 }}
                    style={{
                        ...styles.timerFill,
                        background: isCritical
                            ? '#FF5722'
                            : isUrgent
                                ? '#FF9800'
                                : 'linear-gradient(90deg, #00D4FF, #4CAF50)',
                    }}
                />
            </div>
            <div style={{
                ...styles.timerText,
                color: isCritical ? '#FF5722' : isUrgent ? '#FF9800' : '#fff',
            }}>
                {timeLeft}s
            </div>
        </motion.div>
    );
};

// ============================================================================
// SCENARIO DISPLAY
// ============================================================================

const ScenarioDisplay: React.FC<{
    text: string;
    context?: string;
    emotionalTrigger?: string;
}> = ({ text, context, emotionalTrigger }) => {
    return (
        <div style={styles.scenarioContainer}>
            {/* Emotional Trigger Badge */}
            {emotionalTrigger && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        ...styles.triggerBadge,
                        background: EMOTIONAL_COLORS[emotionalTrigger] || '#666',
                    }}
                >
                    {emotionalTrigger === 'tilt' && '🔥 TILT ALERT'}
                    {emotionalTrigger === 'fear' && '😰 FEAR TEST'}
                    {emotionalTrigger === 'greed' && '💰 GREED CHECK'}
                    {emotionalTrigger === 'impatience' && '⏰ PATIENCE TEST'}
                </motion.div>
            )}

            {/* Context */}
            {context && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    style={styles.contextText}
                >
                    {context}
                </motion.p>
            )}

            {/* Main Scenario Text */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                style={styles.scenarioText}
            >
                "{text}"
            </motion.div>
        </div>
    );
};

// ============================================================================
// CHOICE BUTTON
// ============================================================================

const ChoiceButton: React.FC<{
    choice: Choice;
    index: number;
    onClick: () => void;
    disabled: boolean;
    isSelected?: boolean;
    isCorrect?: boolean;
    showResult?: boolean;
}> = ({ choice, index, onClick, disabled, isSelected, isCorrect, showResult }) => {
    const typeColor = CHOICE_TYPE_COLORS[choice.emotionalType || 'rational'] || '#666';

    const getButtonStyle = () => {
        if (showResult && isSelected) {
            return {
                background: isCorrect
                    ? 'linear-gradient(135deg, #4CAF50, #388E3C)'
                    : 'linear-gradient(135deg, #FF5722, #D84315)',
                border: `3px solid ${isCorrect ? '#4CAF50' : '#FF5722'}`,
                transform: 'scale(1.05)',
            };
        }
        if (isSelected) {
            return {
                background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
                border: '3px solid #00D4FF',
            };
        }
        return {
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
            border: '2px solid rgba(255,255,255,0.2)',
        };
    };

    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            whileHover={!disabled ? { scale: 1.02, x: 5 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
            style={{
                ...styles.choiceButton,
                ...getButtonStyle(),
                opacity: disabled && !isSelected ? 0.5 : 1,
                cursor: disabled ? 'default' : 'pointer',
            }}
        >
            {/* Icon */}
            <div style={styles.choiceIcon}>{choice.icon}</div>

            {/* Content */}
            <div style={styles.choiceContent}>
                <div style={styles.choiceLabel}>{choice.label}</div>
                {choice.description && (
                    <div style={styles.choiceDescription}>{choice.description}</div>
                )}
            </div>

            {/* Type Indicator */}
            {choice.emotionalType && (
                <div style={{
                    ...styles.choiceType,
                    background: typeColor,
                }}>
                    {choice.emotionalType}
                </div>
            )}

            {/* Result Indicator */}
            {showResult && isSelected && (
                <div style={styles.resultIndicator}>
                    {isCorrect ? '✓' : '✗'}
                </div>
            )}
        </motion.button>
    );
};

// ============================================================================
// RESULT FEEDBACK
// ============================================================================

const ResultFeedback: React.FC<{
    feedback: MentalGymProps['resultFeedback'];
}> = ({ feedback }) => {
    if (!feedback) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                ...styles.feedbackContainer,
                borderColor: feedback.isCorrect ? '#4CAF50' : '#FF5722',
            }}
        >
            {/* Header */}
            <div style={{
                ...styles.feedbackHeader,
                background: feedback.isCorrect
                    ? 'linear-gradient(135deg, #4CAF50, #388E3C)'
                    : 'linear-gradient(135deg, #FF5722, #D84315)',
            }}>
                <span style={styles.feedbackIcon}>
                    {feedback.isCorrect ? '✓' : '✗'}
                </span>
                <span style={styles.feedbackTitle}>
                    {feedback.isCorrect ? 'Excellent Decision!' : 'Room for Growth'}
                </span>
            </div>

            {/* Explanation */}
            <div style={styles.feedbackBody}>
                <p style={styles.explanation}>{feedback.explanation}</p>

                {feedback.emotionalLesson && (
                    <div style={styles.emotionalLesson}>
                        <span style={styles.lessonIcon}>🧠</span>
                        <span>{feedback.emotionalLesson}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MentalGym: React.FC<MentalGymProps> = ({
    scenarioId,
    scriptName,
    scenarioText,
    situationContext,
    choices,
    correctChoice,
    timeLimit = 15,
    riggedOutcome,
    emotionalTrigger,
    onChoice,
    resultFeedback,
    phase,
}) => {
    const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(timeLimit);

    // Handle choice selection
    const handleChoiceClick = useCallback((choiceId: string) => {
        if (phase !== 'DECIDING') return;

        setSelectedChoice(choiceId);
        onChoice(choiceId, timeRemaining);
    }, [phase, timeRemaining, onChoice]);

    // Handle timer expiry - auto-select worst option
    const handleTimerExpiry = useCallback(() => {
        if (phase !== 'DECIDING' || selectedChoice) return;

        // Find the most impulsive/worst choice when time runs out
        const worstChoice = choices.find(c => c.emotionalType === 'impulsive') || choices[0];
        setSelectedChoice(worstChoice.id);
        onChoice(worstChoice.id, 0);
    }, [phase, selectedChoice, choices, onChoice]);

    // Reset on new scenario
    useEffect(() => {
        setSelectedChoice(null);
        setTimeRemaining(timeLimit);
    }, [scenarioId, timeLimit]);

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.scriptBadge}>
                    🧠 {scriptName.replace(/_/g, ' ').toUpperCase()}
                </div>
            </div>

            {/* Timer */}
            {timeLimit > 0 && phase === 'DECIDING' && !selectedChoice && (
                <CountdownTimer
                    seconds={timeLimit}
                    onExpire={handleTimerExpiry}
                    isPaused={phase !== 'DECIDING'}
                />
            )}

            {/* Rigged Outcome Warning */}
            <AnimatePresence>
                {riggedOutcome && phase === 'READING' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        style={styles.riggedWarning}
                    >
                        ⚠️ {riggedOutcome}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Scenario Display */}
            <ScenarioDisplay
                text={scenarioText}
                context={situationContext}
                emotionalTrigger={emotionalTrigger}
            />

            {/* Choice Buttons */}
            <div style={styles.choicesContainer}>
                {choices.map((choice, index) => (
                    <ChoiceButton
                        key={choice.id}
                        choice={choice}
                        index={index}
                        onClick={() => handleChoiceClick(choice.id)}
                        disabled={phase !== 'DECIDING' || !!selectedChoice}
                        isSelected={selectedChoice === choice.id}
                        isCorrect={correctChoice === choice.id}
                        showResult={phase === 'SHOWING_RESULT'}
                    />
                ))}
            </div>

            {/* Result Feedback */}
            <AnimatePresence>
                {phase === 'SHOWING_RESULT' && resultFeedback && (
                    <ResultFeedback feedback={resultFeedback} />
                )}
            </AnimatePresence>

            {/* Instruction */}
            {phase === 'DECIDING' && !selectedChoice && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.instruction}
                >
                    Choose wisely. Your mental game is being tested.
                </motion.p>
            )}
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: '100%',
        maxWidth: 600,
        margin: '0 auto',
        padding: 20,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },

    header: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 16,
    },

    scriptBadge: {
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #9C27B0, #673AB7)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 1,
    },

    timerContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
        padding: '12px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 12,
    },

    timerTrack: {
        flex: 1,
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

    timerText: {
        fontSize: 18,
        fontWeight: 800,
        minWidth: 40,
        textAlign: 'right',
    },

    riggedWarning: {
        padding: '12px 16px',
        background: 'rgba(255, 152, 0, 0.2)',
        border: '2px solid #FF9800',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        color: '#FF9800',
        textAlign: 'center',
        marginBottom: 16,
    },

    scenarioContainer: {
        marginBottom: 24,
    },

    triggerBadge: {
        display: 'inline-block',
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 1,
        marginBottom: 12,
    },

    contextText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 12,
        lineHeight: 1.5,
    },

    scenarioText: {
        fontSize: 22,
        fontWeight: 600,
        color: '#fff',
        lineHeight: 1.6,
        fontStyle: 'italic',
        padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
        borderRadius: 16,
        borderLeft: '4px solid rgba(0, 212, 255, 0.5)',
    },

    choicesContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 24,
    },

    choiceButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        borderRadius: 16,
        textAlign: 'left',
        transition: 'all 0.2s ease',
        position: 'relative',
    },

    choiceIcon: {
        fontSize: 32,
        flexShrink: 0,
    },

    choiceContent: {
        flex: 1,
    },

    choiceLabel: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 4,
    },

    choiceDescription: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    choiceType: {
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 9,
        fontWeight: 700,
        color: '#fff',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    resultIndicator: {
        position: 'absolute',
        right: 16,
        fontSize: 28,
        fontWeight: 800,
    },

    feedbackContainer: {
        marginTop: 'auto',
        borderRadius: 16,
        overflow: 'hidden',
        border: '2px solid',
    },

    feedbackHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 20px',
    },

    feedbackIcon: {
        fontSize: 28,
    },

    feedbackTitle: {
        fontSize: 20,
        fontWeight: 800,
        color: '#fff',
    },

    feedbackBody: {
        padding: '16px 20px',
        background: 'rgba(0, 0, 0, 0.3)',
    },

    explanation: {
        fontSize: 15,
        color: '#fff',
        lineHeight: 1.6,
        margin: 0,
    },

    emotionalLesson: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 16,
        padding: '12px 16px',
        background: 'rgba(156, 39, 176, 0.2)',
        borderRadius: 12,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
    },

    lessonIcon: {
        fontSize: 18,
        flexShrink: 0,
    },

    instruction: {
        textAlign: 'center',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 'auto',
    },
};

export default MentalGym;
