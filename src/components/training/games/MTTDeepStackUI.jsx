/**
 * 🎮 MTT DEEP STACK UI — EXACT REFERENCE TEMPLATE MATCH
 * ═══════════════════════════════════════════════════════════════════════════
 * Matches the reference image EXACTLY:
 * - Smarter.Poker header at top (optional, or uses parent header)
 * - Yellow/gold question bar below header
 * - VERTICAL stadium poker table filling center
 * - All 9 seats with 3D illustrated avatars around table edge
 * - Hero at BOTTOM with large cards next to badge
 * - Red square timer in bottom-left corner
 * - "Question X of Y" in bottom-right corner
 * - 2x2 button grid at very bottom
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion } from 'framer-motion';

// 9-Max seat positions (VERTICAL STADIUM - matching reference exactly)
// Positions are % based for responsive scaling
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
    '/avatars/table/free_cowboy.png',       // V7
    '/avatars/table/free_pirate.png',       // V8
];

// Card component - renders actual card images
function HeroCard({ card, rotation = 0 }) {
    if (!card || card.length < 2) return null;

    const rank = card[0].toUpperCase();
    const suitChar = card[1].toLowerCase();

    const suitMap = { 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs', 's': 'spades' };
    const suit = suitMap[suitChar] || 'hearts';

    const rankMap = {
        'A': 'a', 'K': 'k', 'Q': 'q', 'J': 'j', 'T': '10',
        '10': '10', '9': '9', '8': '8', '7': '7', '6': '6',
        '5': '5', '4': '4', '3': '3', '2': '2'
    };
    const cardRank = rankMap[rank] || rank.toLowerCase();

    return (
        <motion.img
            src={`/cards/${suit}_${cardRank}.png`}
            alt={`${rank} of ${suit}`}
            initial={{ scale: 0, rotate: rotation - 20 }}
            animate={{ scale: 1, rotate: rotation }}
            transition={{ duration: 0.3 }}
            style={{
                width: 55,
                height: 77,
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
            onError={(e) => { e.target.style.opacity = 0.5; }}
        />
    );
}

// Player avatar with gold badge
function PlayerSeat({ position, name, stack, avatarSrc, isHero }) {
    const avatarSize = isHero ? 70 : 55;

    return (
        <div style={{
            position: 'absolute',
            left: `${position.x}%`,
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: isHero ? 100 : 50,
        }}>
            {/* Avatar */}
            <motion.img
                src={avatarSrc}
                alt={name}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                    width: avatarSize,
                    height: avatarSize * 1.15,
                    objectFit: 'contain',
                }}
                onError={(e) => { e.target.src = '/smarter-poker-logo.png'; }}
            />
            {/* Gold badge */}
            <div style={{
                background: 'linear-gradient(180deg, #f0c040 0%, #c4960a 100%)',
                border: '2px solid #8b6914',
                borderRadius: 5,
                padding: '2px 10px',
                marginTop: -6,
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }}>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a1a00' }}>{name}</div>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000' }}>{stack} BB</div>
            </div>
        </div>
    );
}

export default function MTTDeepStackUI({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    viewMode = 'standard',
    timeLeft = 30,
}) {
    const scenario = question?.scenario || {};
    const options = question?.options || [];
    const correctAnswer = question?.correctAnswer;

    // Extract scenario data
    const heroStack = scenario?.heroStack || 45;
    const heroPosition = scenario?.heroPosition || 'BTN';
    const heroHand = scenario?.heroHand || 'AhKh';
    const pot = scenario?.pot || 0;
    const gameType = scenario?.gameType || 'Blind vs Blind';

    const villainStacks = scenario?.villainStacks || [32, 28, 55, 41, 38, 62, 29, 51];

    // Build question text
    const buildQuestionText = () => {
        const text = question?.question || '';
        if (text && !text.includes('GTO play')) return text;

        const posName = heroPosition === 'BTN' ? 'On The Button' :
            heroPosition === 'SB' ? 'In The Small Blind' :
                heroPosition === 'BB' ? 'In The Big Blind' :
                    heroPosition === 'CO' ? 'CO' : heroPosition;
        const action = scenario?.action || 'The Player To Your Right Bets 2.5 BB';
        return `You Are ${posName}. ${action}. What Is Your Best Move?`;
    };

    // Parse hero cards
    const parseCards = () => {
        if (!heroHand) return ['Ah', 'Kh'];
        const cards = [];
        for (let i = 0; i < heroHand.length; i += 2) {
            if (i + 1 < heroHand.length) cards.push(heroHand.substring(i, i + 2));
        }
        return cards.length > 0 ? cards : ['Ah', 'Kh'];
    };

    const heroCards = parseCards();

    const handleAnswer = (optionLetter) => {
        if (showFeedback) return;
        onAnswer(optionLetter);
    };

    const getButtonStyle = (optionLetter) => {
        if (!showFeedback) return styles.answerButton;
        if (optionLetter === correctAnswer) return { ...styles.answerButton, ...styles.correctButton };
        return { ...styles.answerButton, ...styles.wrongButton };
    };

    return (
        <div style={styles.container}>
            {/* YELLOW/GOLD QUESTION BAR - matches reference */}
            <div style={styles.questionBar}>
                {buildQuestionText()}
            </div>

            {/* TABLE AREA - VERTICAL STADIUM */}
            <div style={styles.tableArea}>
                {/* VERTICAL STADIUM TABLE */}
                <div style={styles.table}>
                    {/* Dark felt with gold border */}
                    <div style={styles.outerRail}>
                        <div style={styles.innerRail}>
                            <div style={styles.felt}>
                                {/* POT Display - center top */}
                                <div style={styles.potDisplay}>
                                    <span style={styles.potChip}>●</span>
                                    <span style={styles.potText}>POT {pot}</span>
                                </div>

                                {/* Game Title - center */}
                                <div style={styles.gameTitle}>
                                    <div style={styles.gameName}>{gameType}</div>
                                    <div style={styles.gameSubtitle}>Smarter.Poker</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* All 9 player positions */}
                    {SEAT_POSITIONS.map((seat, index) => (
                        <PlayerSeat
                            key={seat.id}
                            position={seat}
                            name={seat.isHero ? 'Hero' : `Villain ${index}`}
                            stack={seat.isHero ? heroStack : (villainStacks[index - 1] || 50)}
                            avatarSrc={AVATARS[index] || '/avatars/default.png'}
                            isHero={seat.isHero}
                        />
                    ))}

                    {/* Hero's cards - positioned NEXT TO hero badge (right side) */}
                    <div style={styles.heroCardsContainer}>
                        {heroCards.map((card, i) => (
                            <HeroCard key={i} card={card} rotation={i === 0 ? -8 : 8} />
                        ))}
                    </div>

                    {/* Dealer button near hero */}
                    <div style={styles.dealerButton}>D</div>
                </div>
            </div>

            {/* BOTTOM CONTROLS */}
            <div style={styles.bottomControls}>
                {/* RED TIMER - bottom left */}
                <div style={styles.timer}>{timeLeft}</div>

                {/* 2x2 ANSWER GRID - center */}
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

                {/* QUESTION COUNTER - bottom right */}
                <div style={styles.questionCounter}>
                    Question {questionNumber} of {totalQuestions}
                </div>
            </div>

            {/* EXPLANATION OVERLAY */}
            {showFeedback && explanation && (
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.explanationOverlay}
                >
                    <div style={styles.explanationBox}>
                        <div style={{ color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444', fontWeight: '700', marginBottom: 8 }}>
                            {feedbackResult === 'correct' ? '✅ Correct!' : '❌ Incorrect'}
                        </div>
                        <p style={{ color: '#e5e7eb', margin: 0, fontSize: 14 }}>{explanation}</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES - EXACT REFERENCE MATCH
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0a0a14',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // Yellow/gold question bar (matches reference)
    questionBar: {
        width: '100%',
        padding: '10px 16px',
        background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
        color: '#fbbf24', // Gold/yellow text
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
        flexShrink: 0,
    },

    // Table area - fills center
    tableArea: {
        flex: 1,
        position: 'relative',
        padding: '10px 15px',
        overflow: 'hidden',
    },

    // Vertical stadium table
    table: {
        position: 'relative',
        width: '100%',
        height: '100%',
        maxWidth: 420,
        margin: '0 auto',
    },

    // Outer gold rail
    outerRail: {
        position: 'absolute',
        top: '5%',
        left: '5%',
        right: '5%',
        bottom: '12%',
        borderRadius: '50% / 40%',
        background: 'linear-gradient(180deg, #d4a020 0%, #8b6914 50%, #553d0a 100%)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,215,0,0.3)',
        padding: 6,
    },

    // Inner gold rail
    innerRail: {
        width: '100%',
        height: '100%',
        borderRadius: '50% / 40%',
        background: 'linear-gradient(180deg, #1a1a20 0%, #0d0d12 100%)',
        padding: 5,
    },

    // Dark felt
    felt: {
        width: '100%',
        height: '100%',
        borderRadius: '50% / 40%',
        background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0a0a0a 60%, #050505 100%)',
        position: 'relative',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.8)',
    },

    // POT display
    potDisplay: {
        position: 'absolute',
        top: '15%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(30,30,35,0.9)',
        borderRadius: 12,
        padding: '4px 12px',
        border: '1px solid #333',
    },
    potChip: { color: '#666', fontSize: 10 },
    potText: { color: '#fff', fontSize: 11, fontWeight: '600' },

    // Game title
    gameTitle: {
        position: 'absolute',
        top: '45%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
    },
    gameName: {
        fontSize: 18,
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        color: '#555',
        letterSpacing: 1,
    },
    gameSubtitle: {
        fontSize: 11,
        color: '#c4960a',
        marginTop: 4,
    },

    // Hero cards - positioned to RIGHT of hero
    heroCardsContainer: {
        position: 'absolute',
        bottom: '6%',
        left: '62%',
        display: 'flex',
        gap: -12,
        zIndex: 150,
    },

    // Dealer button
    dealerButton: {
        position: 'absolute',
        bottom: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 'bold',
        color: '#000',
        zIndex: 200,
    },

    // Bottom controls area
    bottomControls: {
        display: 'flex',
        alignItems: 'flex-end',
        padding: '8px 12px 12px',
        flexShrink: 0,
        gap: 8,
    },

    // RED timer (matches reference exactly)
    timer: {
        width: 48,
        height: 48,
        background: '#dc2626',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        flexShrink: 0,
    },

    // 2x2 answer grid
    answersGrid: {
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 6,
    },
    answerButton: {
        padding: '12px 10px',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1a2d4a 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        cursor: 'pointer',
    },
    correctButton: {
        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
        border: '1px solid #22c55e',
    },
    wrongButton: {
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        border: '1px solid #ef4444',
    },

    // Question counter
    questionCounter: {
        background: 'rgba(30,30,40,0.9)',
        border: '1px solid #444',
        borderRadius: 8,
        padding: '10px 14px',
        color: '#f0f0f0',
        fontSize: 12,
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },

    // Explanation overlay
    explanationOverlay: {
        position: 'absolute',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: 500,
        zIndex: 1000,
    },
    explanationBox: {
        padding: '14px 18px',
        background: 'rgba(15, 15, 25, 0.95)',
        borderRadius: 10,
        border: '2px solid rgba(251, 191, 36, 0.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    },
};
