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

// 9-Max seat positions (VERTICAL STADIUM TABLE - portrait orientation)
// Reference shows avatars VERY CLOSE to center, on INNER edge of gold rail
const SEAT_POSITIONS = [
    // Hero at bottom center
    { id: 'hero', x: 50, y: 85, isHero: true },

    // LEFT SIDE (4 villains) - MUCH closer to center
    { id: 'v1', x: 30, y: 68 },  // Bottom-left
    { id: 'v2', x: 30, y: 50 },  // Mid-left
    { id: 'v3', x: 30, y: 32 },  // Upper-mid-left
    { id: 'v4', x: 35, y: 18 },  // Top-left

    // RIGHT SIDE (4 villains) - MUCH closer to center
    { id: 'v8', x: 70, y: 68 },  // Bottom-right
    { id: 'v7', x: 70, y: 50 },  // Mid-right
    { id: 'v6', x: 70, y: 32 },  // Upper-mid-right
    { id: 'v5', x: 65, y: 18 },  // Top-right
];

// Convert card notation (e.g., 'Ah' for Ace of Hearts) to image path
function getCardPath(card) {
    if (!card || card.length < 2) return '/cards/hearts_a.png';

    const rank = card[0].toLowerCase();
    const suit = card[1].toLowerCase();

    const suitMap = {
        'h': 'hearts',
        'd': 'diamonds',
        'c': 'clubs',
        's': 'spades'
    };

    const suitName = suitMap[suit] || 'hearts';
    return `/cards/${suitName}_${rank}.png`;
}

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


                            </div>
                        );
                    })}
                </div>

                {/* HERO CARDS - Bottom center below hero avatar */}
                <div style={styles.heroCardsContainer}>
                    <img src={getCardPath(card1)} alt={card1} style={styles.card} />
                    <img src={getCardPath(card2)} alt={card2} style={styles.card} />
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

    // 🎰 PREMIUM CASINO QUESTION BAR - Industrial metal frame with HUD display
    questionBar: {
        width: '100%',
        padding: '20px 24px',
        background: 'linear-gradient(180deg, #3a3a4a 0%, #1a1a24 100%)',
        borderBottom: '3px solid #00d4ff',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.2), inset 0 2px 4px rgba(255,255,255,0.05)',
        flexShrink: 0,
    },

    // 🎰 PREMIUM QUESTION TEXT - White with HUD styling
    questionText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1.4,
        textAlign: 'center',
        textShadow: '0 0 8px rgba(255, 255, 255, 0.4)',
    },

    // TABLE AREA - Center (fills remaining space)
    tableArea: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        padding: '60px 20px 20px 20px', // Increased top padding to move table down further
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

    // Seats container - positioned ON the table surface (not floating above)
    seatsContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%',
        height: '90%',
        zIndex: 2,
        pointerEvents: 'none',
    },

    seat: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    // 🎰 PREMIUM CASINO AVATAR - Metal frame with cyan glow ring
    avatar: {
        width: 50,
        height: 50,
        borderRadius: '50%',
        border: '3px solid #4a4a5a',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.4), inset 0 0 4px rgba(0,0,0,0.5)',
        objectFit: 'cover',
        background: 'linear-gradient(135deg, #2d2d3a, #1a1a24)',
    },

    // 🎰 PREMIUM CASINO BADGE - Industrial metal with gold accents
    badge: {
        background: 'linear-gradient(180deg, #4a4a5a 0%, #2d2d3a 50%, #1a1a24 100%)',
        padding: '6px 12px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 'bold',
        color: '#00d4ff',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        border: '1px solid #555',
        boxShadow: '0 0 8px rgba(0, 212, 255, 0.2), 0 3px 6px rgba(0,0,0,0.4)',
        textShadow: '0 0 4px rgba(0, 212, 255, 0.5)',
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

    // Hero cards positioned at bottom center (below hero avatar)
    heroCardsContainer: {
        position: 'absolute',
        bottom: '8%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 10,
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

    // 🎰 PREMIUM CASINO TIMER - Skeuomorphic metal with LED display
    timer: {
        width: 70,
        height: 50,
        background: 'linear-gradient(180deg, #4a4a5a 0%, #2d2d3a 50%, #1a1a24 100%)',
        color: '#ff3b3b',
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: '2px solid #666',
        boxShadow: '0 0 15px rgba(255, 59, 59, 0.5), inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.5)',
        textShadow: '0 0 10px rgba(255, 59, 59, 0.8)',
    },

    // 🎰 PREMIUM CASINO COUNTER - HUD style with cyan glow
    questionCounter: {
        color: '#00d4ff',
        fontSize: 13,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        background: 'linear-gradient(180deg, #3a3a4a 0%, #1a1a24 100%)',
        padding: '10px 18px',
        borderRadius: 10,
        border: '1px solid #00d4ff',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.3), inset 0 1px 2px rgba(255,255,255,0.05)',
        textShadow: '0 0 6px rgba(0, 212, 255, 0.6)',
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

    // 🎰 PREMIUM CASINO ACTION BUTTON - Skeuomorphic metal with HUD glow
    answerButton: {
        padding: '18px 20px',
        fontSize: 15,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textTransform: 'uppercase',
        letterSpacing: '1px',
        background: 'linear-gradient(180deg, #4a4a5a 0%, #2d2d3a 40%, #1a1a24 100%)',
        border: '2px solid #555',
        borderRadius: 10,
        color: '#00d4ff',
        cursor: 'pointer',
        transition: 'all 0.2s',
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.2), inset 0 2px 4px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.5)',
        textShadow: '0 0 8px rgba(0, 212, 255, 0.6)',
    },

    // 🎰 CORRECT FEEDBACK - Green HUD glow
    correctButton: {
        background: 'linear-gradient(180deg, #1a4a2a 0%, #0d3018 100%)',
        border: '2px solid #22c55e',
        color: '#22c55e',
        boxShadow: '0 0 20px rgba(34, 197, 94, 0.5), inset 0 2px 4px rgba(255,255,255,0.1)',
        textShadow: '0 0 10px rgba(34, 197, 94, 0.8)',
    },

    // 🎰 INCORRECT FEEDBACK - Red HUD glow
    incorrectButton: {
        background: 'linear-gradient(180deg, #4a1a1a 0%, #301010 100%)',
        border: '2px solid #ef4444',
        color: '#ef4444',
        boxShadow: '0 0 20px rgba(239, 68, 68, 0.5), inset 0 2px 4px rgba(255,255,255,0.1)',
        textShadow: '0 0 10px rgba(239, 68, 68, 0.8)',
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
