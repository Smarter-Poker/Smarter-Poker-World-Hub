/**
 * 🎮 MTT DEEP STACK UI — EXACT USER REQUIREMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * REQUIREMENTS:
 * 1. LARGE question bar at top
 * 2. Vertical stadium table image (ONLY this table allowed)
 * 3. Timer (bottom-left) and Question counter (bottom-right) ABOVE buttons
 * 4. 2x2 button grid spanning ENTIRE bottom width
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';

// 9-Max seat positions (VERTICAL STADIUM - positioned around table image)
const SEAT_POSITIONS = [
    // Hero at absolute bottom center
    { id: 'hero', x: 50, y: 88, isHero: true },
    // Villain 1 - bottom left
    { id: 'v1', x: 18, y: 75 },
    // Villain 2 - left middle-lower
    { id: 'v2', x: 8, y: 52 },
    // Villain 3 - left middle-upper
    { id: 'v3', x: 15, y: 30 },
    // Villain 4 - top left
    { id: 'v4', x: 32, y: 12 },
    // Villain 5 - top right
    { id: 'v5', x: 68, y: 12 },
    // Villain 6 - right middle-upper
    { id: 'v6', x: 85, y: 30 },
    // Villain 7 - right middle-lower
    { id: 'v7', x: 92, y: 52 },
    // Villain 8 - bottom right
    { id: 'v8', x: 82, y: 75 },
];

// 3D Illustrated avatar images
const AVATARS = [
    '/avatars/table/free_fox.png',          // Hero
    '/avatars/table/vip_viking_warrior.png',// V1
    '/avatars/table/free_wizard.png',       // V2
    '/avatars/table/free_ninja.png',        // V3
    '/avatars/table/vip_wolf.png',          // V4
    '/avatars/table/vip_spartan.png',       // V5
    '/avatars/table/vip_pharaoh.png',       // V6
    '/avatars/table/vip_pirate.png',        // V7
    '/avatars/table/free_cowboy.png',       // V8
];

export default function MTTDeepStackUI({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
}) {
    const [timeLeft, setTimeLeft] = React.useState(30);

    // Parse question data
    const questionText = question?.question || question?.text || 'Loading question...';
    const options = question?.options || question?.answers || ['Fold', 'Call', 'Raise', 'All-In'];
    const correctAnswer = question?.correctAnswer || question?.correct || 'A';

    // Countdown timer
    React.useEffect(() => {
        if (showFeedback) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [showFeedback, questionNumber]);

    // Reset timer on new question
    React.useEffect(() => {
        setTimeLeft(30);
    }, [questionNumber]);

    const handleAnswer = (answer) => {
        if (showFeedback) return;
        onAnswer(answer);
    };

    const getButtonStyle = (letter) => {
        const baseStyle = { ...styles.answerButton };
        if (showFeedback) {
            if (letter === correctAnswer) {
                return { ...baseStyle, ...styles.correctButton };
            }
            if (feedbackResult === 'incorrect') {
                return { ...baseStyle, ...styles.incorrectButton };
            }
        }
        return baseStyle;
    };

    // Parse hero cards from question
    const heroCards = question?.heroCards || question?.cards || 'AhKs';
    const card1 = heroCards.substring(0, 2);
    const card2 = heroCards.substring(2, 4);

    return (
        <div style={styles.container}>
            {/* LARGE QUESTION BAR - Top */}
            <div style={styles.questionBar}>
                <div style={styles.questionText}>{questionText}</div>
            </div>

            {/* TABLE AREA - Center */}
            <div style={styles.tableArea}>
                {/* EXACT TABLE IMAGE */}
                <img
                    src="/images/training/table-vertical-stadium-transparent.png"
                    alt="Poker Table"
                    style={styles.tableImage}
                />

                {/* PLAYER SEATS - Positioned over table */}
                <div style={styles.seatsContainer}>
                    {SEAT_POSITIONS.map((seat, index) => {
                        const isHero = seat.isHero;
                        const stackSize = isHero ? 45 : Math.floor(Math.random() * 50) + 20;
                        const villainNumber = isHero ? null : index;

                        return (
                            <div
                                key={seat.id}
                                style={{
                                    ...styles.seat,
                                    left: `${seat.x}%`,
                                    top: `${seat.y}%`,
                                }}
                            >
                                {/* Avatar */}
                                <img
                                    src={AVATARS[index]}
                                    alt={isHero ? 'Hero' : `Villain ${villainNumber}`}
                                    style={styles.avatar}
                                />

                                {/* Badge */}
                                <div style={styles.badge}>
                                    <div style={styles.badgeLabel}>
                                        {isHero ? 'Hero' : `Villain ${villainNumber}`}
                                    </div>
                                    <div style={styles.badgeStack}>{stackSize} BB</div>
                                </div>

                                {/* Hero Cards */}
                                {isHero && (
                                    <div style={styles.heroCards}>
                                        <img src={`/cards/${card1}.svg`} alt={card1} style={styles.card} />
                                        <img src={`/cards/${card2}.svg`} alt={card2} style={styles.card} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* POT - Center top */}
                <div style={styles.pot}>POT 20</div>

                {/* Tournament Label - Center */}
                <div style={styles.tournamentLabel}>
                    <div style={styles.tournamentTitle}>9-Max Tournament</div>
                    <div style={styles.tournamentSubtitle}>(MTT)</div>
                    <div style={styles.tournamentSmall}>Smarter.Poker</div>
                </div>
            </div>

            {/* TIMER & COUNTER - Above buttons */}
            <div style={styles.timerCounterRow}>
                <div style={styles.timer}>{timeLeft}</div>
                <div style={styles.questionCounter}>
                    Question {questionNumber} of {totalQuestions}
                </div>
            </div>

            {/* 2x2 ANSWER GRID - Full width bottom */}
            <div style={styles.answersGrid}>
                {options.slice(0, 4).map((option, index) => {
                    const letter = String.fromCharCode(65 + index);
                    const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
                    return (
                        <motion.button
                            key={index}
                            onClick={() => handleAnswer(letter)}
                            disabled={showFeedback}
                            style={getButtonStyle(letter)}
                            whileHover={!showFeedback ? { scale: 1.02 } : {}}
                            whileTap={!showFeedback ? { scale: 0.98 } : {}}
                        >
                            {text}
                        </motion.button>
                    );
                })}
            </div>

            {/* EXPLANATION OVERLAY */}
            {showFeedback && explanation && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.explanationOverlay}
                >
                    <div style={styles.explanationBox}>
                        <div style={{
                            ...styles.explanationTitle,
                            color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                        }}>
                            {feedbackResult === 'correct' ? '✓ Correct!' : '✗ Incorrect'}
                        </div>
                        <div style={styles.explanationText}>{explanation}</div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES - EXACT USER REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // LARGE QUESTION BAR (user requirement: "WAY TOO SMALL" - now MUCH larger)
    questionBar: {
        width: '100%',
        padding: '20px 24px', // Increased from 10px to 20px
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        borderBottom: '2px solid #3b82f6',
        flexShrink: 0,
    },

    questionText: {
        color: '#fbbf24',
        fontSize: 18, // Increased from 13px to 18px
        fontWeight: 'bold',
        lineHeight: 1.4,
        textAlign: 'center',
    },

    // TABLE AREA - Center (fills remaining space)
    tableArea: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        padding: '20px',
    },

    // EXACT TABLE IMAGE (user requirement: "this table only")
    tableImage: {
        width: 'auto',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        position: 'relative',
        zIndex: 1,
    },

    // Seats container - overlays on table
    seatsContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2,
    },

    seat: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    avatar: {
        width: 50,
        height: 50,
        borderRadius: '50%',
        border: '2px solid #fbbf24',
        objectFit: 'cover',
    },

    badge: {
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 'bold',
        color: '#000',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    },

    badgeLabel: {
        fontSize: 10,
        opacity: 0.9,
    },

    badgeStack: {
        fontSize: 11,
        fontWeight: 'bold',
    },

    heroCards: {
        display: 'flex',
        gap: 4,
        marginTop: 4,
    },

    card: {
        width: 40,
        height: 56,
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    },

    pot: {
        position: 'absolute',
        top: '15%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        zIndex: 3,
    },

    tournamentLabel: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#94a3b8',
        zIndex: 3,
    },

    tournamentTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        opacity: 0.6,
    },

    tournamentSubtitle: {
        fontSize: 14,
        fontStyle: 'italic',
        opacity: 0.5,
    },

    tournamentSmall: {
        fontSize: 11,
        marginTop: 4,
        opacity: 0.4,
    },

    // TIMER & COUNTER ROW - Above buttons (user requirement)
    timerCounterRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        flexShrink: 0,
    },

    timer: {
        width: 50,
        height: 50,
        background: 'linear-gradient(135deg, #dc2626, #991b1b)',
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
    },

    questionCounter: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 'bold',
        background: 'rgba(148, 163, 184, 0.1)',
        padding: '8px 16px',
        borderRadius: 8,
    },

    // 2x2 ANSWER GRID - ENTIRE BOTTOM WIDTH (user requirement)
    answersGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
        padding: '0 0 20px 0', // No side padding - full width
        width: '100%',
        flexShrink: 0,
    },

    answerButton: {
        padding: '20px',
        fontSize: 16,
        fontWeight: 'bold',
        background: 'linear-gradient(135deg, #1e3a8a, #1e40af)',
        border: '2px solid #3b82f6',
        borderRadius: 12,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },

    correctButton: {
        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
        border: '2px solid #22c55e',
    },

    incorrectButton: {
        background: 'linear-gradient(135deg, #991b1b, #dc2626)',
        border: '2px solid #ef4444',
    },

    // Explanation overlay
    explanationOverlay: {
        position: 'absolute',
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

    explanationBox: {
        background: 'linear-gradient(135deg, #1a2744, #0f1a2e)',
        padding: '32px',
        borderRadius: 16,
        maxWidth: 500,
        margin: '0 20px',
        border: '2px solid #3b82f6',
    },

    explanationTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
    },

    explanationText: {
        fontSize: 15,
        lineHeight: 1.6,
        color: '#e2e8f0',
    },
};
