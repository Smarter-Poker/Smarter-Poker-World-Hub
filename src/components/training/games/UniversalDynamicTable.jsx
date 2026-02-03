/**
 * 🎯 UNIVERSAL DYNAMIC TABLE — All Poker Games
 * ═══════════════════════════════════════════════════════════════════════════
 * A dynamic poker table that updates with EVERY question/scenario:
 * - Hero position (button, BB, SB, etc.) changes per question
 * - Hero cards update per question
 * - Board cards (flop, turn, river) update per question
 * - Pot size, stack depths change dynamically
 * - Villain positions and actions update per scenario
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 9-Max Layout (portrait orientation)
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_CONFIGS = {
    // 9-Max positions - All seats INSIDE THE FELT OVAL
    // The table felt spans roughly 30%-70% X and 20%-80% Y
    9: [
        { id: 0, name: 'BTN', x: 50, y: 78 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 35, y: 72 },    // Bottom-left
        { id: 2, name: 'BB', x: 32, y: 52 },    // Mid-left
        { id: 3, name: 'UTG', x: 35, y: 32 },   // Upper-mid-left
        { id: 4, name: 'UTG+1', x: 42, y: 22 }, // Top-left
        { id: 5, name: 'MP', x: 58, y: 22 },    // Top-right
        { id: 6, name: 'MP+1', x: 65, y: 32 },  // Upper-mid-right
        { id: 7, name: 'HJ', x: 68, y: 52 },    // Mid-right
        { id: 8, name: 'CO', x: 65, y: 72 },    // Bottom-right
    ],
    // 6-Max positions - All inside felt
    6: [
        { id: 0, name: 'BTN', x: 50, y: 78 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 35, y: 58 },    // Mid-left
        { id: 2, name: 'BB', x: 35, y: 35 },    // Upper-left
        { id: 3, name: 'UTG', x: 50, y: 22 },   // Top center
        { id: 4, name: 'HJ', x: 65, y: 35 },    // Upper-right
        { id: 5, name: 'CO', x: 65, y: 58 },    // Mid-right
    ],
    // 3-Max (Spins) - Inside felt
    3: [
        { id: 0, name: 'BTN', x: 50, y: 75 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 38, y: 32 },    // Top-left
        { id: 2, name: 'BB', x: 62, y: 32 },    // Top-right
    ],
    // Heads-Up - Inside felt
    2: [
        { id: 0, name: 'BTN/SB', x: 50, y: 75 }, // Hero: Center bottom
        { id: 1, name: 'BB', x: 50, y: 25 },     // Villain: Top center
    ],
};

// Position name mapping for display
const POSITION_NAMES = {
    'BTN': 'Button',
    'SB': 'Small Blind',
    'BB': 'Big Blind',
    'UTG': 'Under the Gun',
    'UTG+1': 'UTG+1',
    'MP': 'Middle Position',
    'MP+1': 'MP+1',
    'HJ': 'Hijack',
    'CO': 'Cutoff',
    'BTN/SB': 'Button/SB',
};

// 3D Illustrated avatar images
const AVATARS = [
    '/avatars/table/free_fox.png',
    '/avatars/table/vip_viking_warrior.png',
    '/avatars/table/free_wizard.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/vip_wolf.png',
    '/avatars/table/vip_spartan.png',
    '/avatars/table/vip_pharaoh.png',
    '/avatars/table/vip_pirate.png',
    '/avatars/table/free_cowboy.png',
];

// Convert card notation (e.g., 'Ah' for Ace of Hearts) to image path
function getCardPath(card) {
    if (!card || card.length < 2) return '/cards/back.png';

    const rankChar = card[0].toLowerCase();
    const suit = card[1].toLowerCase();

    // Handle tens - card notation uses 'T' but image files use '10'
    const rank = rankChar === 't' ? '10' : rankChar;

    const suitMap = {
        'h': 'hearts',
        'd': 'diamonds',
        'c': 'clubs',
        's': 'spades'
    };

    const suitName = suitMap[suit] || 'hearts';
    return `/cards/${suitName}_${rank}.png`;
}

// Render miniature inline card images for question text
function renderInlineCards(text) {
    if (!text) return text;

    // Pattern to match card notation: Ah, Ks, Td, 2c, etc.
    const cardPattern = /\b([AKQJT2-9])([hdcs])\b/gi;

    const parts = [];
    let lastIndex = 0;
    let match;

    // Create a fresh regex for exec
    const regex = new RegExp(cardPattern);
    while ((match = regex.exec(text)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        // Add the card image element
        const cardNotation = match[0];
        parts.push({
            type: 'card',
            notation: cardNotation,
            path: getCardPath(cardNotation)
        });

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

// Parse hero position from string to seat index
// Account for different table sizes having different position mappings
function getHeroSeatIndex(heroPosition, playerCount) {
    const normalized = (heroPosition || 'BTN').toUpperCase().trim();

    // Position mappings for different table sizes
    const positionMaps = {
        9: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'UTG+1': 4,
            'MP': 5, 'MIDDLE': 5,
            'MP+1': 6,
            'HJ': 7, 'HIJACK': 7,
            'CO': 8, 'CUTOFF': 8,
        },
        6: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'HJ': 4, 'HIJACK': 4, 'MP': 4, 'MIDDLE': 4,
            'CO': 5, 'CUTOFF': 5,
        },
        3: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
        },
        2: {
            'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0,
            'BB': 1, 'BIG BLIND': 1,
        }
    };

    const map = positionMaps[playerCount] || positionMaps[6];
    return map[normalized] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON — Shown while question is being fetched
// ═══════════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
    return (
        <div style={loadingStyles.container}>
            <div style={loadingStyles.questionBar}>
                <div style={loadingStyles.pulse} />
            </div>
            <div style={loadingStyles.tableArea}>
                <img
                    src="/images/training/table-vertical-stadium-transparent.png"
                    alt="Loading..."
                    style={loadingStyles.tableImage}
                />
                <div style={loadingStyles.loadingText}>Loading Question...</div>
            </div>
            <div style={loadingStyles.buttonsArea}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} style={loadingStyles.buttonSkeleton} />
                ))}
            </div>
        </div>
    );
}

const loadingStyles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)',
    },
    questionBar: {
        height: 60,
        background: 'rgba(255,255,255,0.05)',
        margin: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    pulse: {
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
        animation: 'pulse 1.5s infinite',
    },
    tableArea: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    tableImage: {
        opacity: 0.3,
        height: '60%',
        objectFit: 'contain',
    },
    loadingText: {
        position: 'absolute',
        color: '#00d4ff',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', sans-serif",
        animation: 'pulse 1.5s infinite',
    },
    buttonsArea: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        padding: 16,
    },
    buttonSkeleton: {
        height: 56,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function UniversalDynamicTable({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    gameType = 'cash', // 'cash', 'mtt', 'sng', 'spins'
    gameTitle = '',    // Title of the training game
    streak = 0,        // Current streak count (only show if >= 2)
}) {
    const [timeLeft, setTimeLeft] = React.useState(30);
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);

    // ════════════════════════════════════════════════════════════════════════
    // LOADING STATE — Show skeleton while question is being fetched
    // ════════════════════════════════════════════════════════════════════════
    if (!question) {
        return <LoadingSkeleton />;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC DATA EXTRACTION FROM QUESTION
    // ═══════════════════════════════════════════════════════════════════════

    const scenario = question?.scenario || {};

    // Core question data
    const questionText = question?.question || question?.text || 'Loading question...';
    const options = question?.options || [];
    const correctAnswer = question?.correctAnswer || question?.correct || 'a';

    // Dynamic table state from question scenario
    const heroPosition = scenario.heroPosition || scenario.position || 'BTN';
    const heroStack = scenario.heroStack || scenario.stackDepth || 100;
    const villainStack = scenario.villainStack || 100;
    const pot = scenario.pot || 0;
    const board = scenario.board || '';
    const villainPosition = scenario.villainPosition || 'BB';
    const villainAction = scenario.action || scenario.villainAction || '';

    // Parse hero cards - can be "AhKs" or ["Ah", "Ks"] or from scenario
    const rawHeroCards = question?.heroCards || scenario.heroHand || scenario.heroCards || 'AsKs';
    const heroCards = useMemo(() => {
        if (Array.isArray(rawHeroCards)) return rawHeroCards;
        if (typeof rawHeroCards === 'string' && rawHeroCards.length >= 4) {
            return [rawHeroCards.substring(0, 2), rawHeroCards.substring(2, 4)];
        }
        return ['As', 'Ks']; // Fallback
    }, [rawHeroCards]);

    // Parse board cards
    const boardCards = useMemo(() => {
        if (Array.isArray(board)) return board;
        if (typeof board === 'string' && board.length > 0) {
            // Handle "Jh 7s 2d" or "Jh7s2d"
            const cleaned = board.replace(/\s+/g, '');
            const cards = [];
            for (let i = 0; i < cleaned.length; i += 2) {
                if (i + 1 < cleaned.length) {
                    cards.push(cleaned.substring(i, i + 2));
                }
            }
            return cards;
        }
        return [];
    }, [board]);

    // Determine player count based on game type
    const playerCount = useMemo(() => {
        if (gameType === 'spins' || gameType === 'sng') return 3;
        if (gameType === 'heads-up' || gameType === 'hu') return 2;
        if (gameType === '6max' || gameType === 'cash') return 6;
        return 9; // Default to 9-max for MTT
    }, [gameType]);

    // Get seat configuration
    const seats = SEAT_CONFIGS[playerCount] || SEAT_CONFIGS[9];

    // Find hero seat index based on position
    const heroSeatIndex = getHeroSeatIndex(heroPosition, playerCount);

    // Calculate BUTTON position - button is seat 0 in the config, but we need to 
    // determine which seat index currently HAS the button based on the game state
    // If hero is BTN, then hero's seat index is the button
    // If hero is BB, then button is 2 seats before hero (in 9-max)
    const getButtonSeatIndex = useMemo(() => {
        // Position to relative offset from button (seat 0)
        // In SEAT_CONFIGS, seat 0 is always "BTN"
        // So if hero is at BTN position, hero IS the button
        const posToSeatIndex = {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1,
            'BB': 2,
            'UTG': 3,
            'UTG+1': 4,
            'MP': 5,
            'MP+1': 6,
            'HJ': 7,
            'CO': 8,
        };

        // The button is always at the seat that has position "BTN" in this hand
        // Since heroPosition tells us where hero is, and heroSeatIndex tells us 
        // which seat hero occupies, we need to find where BTN is

        // For simplicity: BTN is always at seat index 0 in our layout
        // Hero moves to their correct position based on heroSeatIndex
        return 0; // BTN is always seat 0 in our static layout
    }, [heroPosition, playerCount]);

    // Generate STABLE villain stacks using seat index as seed (not random())
    // This ensures stacks don't change on re-render
    const generateVillainStack = useMemo(() => {
        return (seatIndex) => {
            // Use question number + seat index to create deterministic but varied stacks
            const seed = (questionNumber || 1) * 13 + seatIndex * 7;
            // Generate a stack between 30-150 BB based on the seed
            return 30 + (seed % 120);
        };
    }, [questionNumber]);

    // Timer countdown
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

    // Reset timer AND selectedAnswer on new question
    React.useEffect(() => {
        setTimeLeft(30);
        setSelectedAnswer(null);
    }, [questionNumber]);

    const handleAnswer = (answerId) => {
        if (showFeedback) return;
        setSelectedAnswer(answerId); // Track which answer was selected
        onAnswer(answerId);
    };

    const getButtonStyle = (option, index) => {
        const baseStyle = { ...styles.answerButton };
        if (showFeedback) {
            const optionId = option.id || String.fromCharCode(97 + index); // a, b, c, d
            const isCorrect = optionId === correctAnswer || optionId?.toLowerCase() === correctAnswer?.toLowerCase();
            const isSelected = optionId === selectedAnswer || optionId?.toLowerCase() === selectedAnswer?.toLowerCase();

            // Always show correct answer in green
            if (isCorrect) {
                return { ...baseStyle, ...styles.correctButton };
            }
            // Only show selected wrong answer in red (not all wrong answers)
            if (isSelected && feedbackResult === 'incorrect') {
                return { ...baseStyle, ...styles.incorrectButton };
            }
            // Dim unselected wrong answers
            return { ...baseStyle, opacity: 0.5 };
        }
        return baseStyle;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    return (
        <div style={styles.container}>
            {/* QUESTION BAR - Top - with Game Title and Streak */}
            <div style={styles.questionBar}>
                {/* Game Title Row */}
                <div style={styles.titleRow}>
                    <div style={styles.gameTitle}>{gameTitle || 'GTO Training'}</div>
                    <div style={styles.gameBrand}>Smarter.Poker</div>
                </div>

                {/* Question Text with Inline Cards */}
                <div style={styles.questionText}>
                    {(() => {
                        const parts = renderInlineCards(questionText);
                        if (!Array.isArray(parts)) return questionText;
                        return parts.map((part, idx) => {
                            if (typeof part === 'string') return part;
                            if (part.type === 'card') {
                                return (
                                    <img
                                        key={idx}
                                        src={part.path}
                                        alt={part.notation}
                                        style={styles.inlineCard}
                                    />
                                );
                            }
                            return null;
                        });
                    })()}
                </div>

                {/* Streak Indicator - Only show if streak >= 2 */}
                {streak >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={styles.streakBadge}
                    >
                        <motion.span
                            animate={{ y: [0, -3, 0] }}
                            transition={{ repeat: Infinity, duration: 0.5 }}
                            style={{ fontSize: 16 }}
                        >
                            🔥
                        </motion.span>
                        <span style={styles.streakText}>{streak} STREAK</span>
                    </motion.div>
                )}
            </div>

            {/* TABLE AREA - Center */}
            <div style={styles.tableArea}>
                {/* Table Image */}
                <img
                    src="/images/training/table-vertical-stadium-transparent.png"
                    alt="Poker Table"
                    style={styles.tableImage}
                />

                {/* DYNAMIC PLAYER SEATS */}
                <div style={styles.seatsContainer}>
                    {seats.map((seat, index) => {
                        const isHero = index === heroSeatIndex;
                        const isButton = index === getButtonSeatIndex; // Dynamic button position
                        // Use stable stack calculation for villains
                        const stackSize = isHero ? heroStack : generateVillainStack(index);

                        return (
                            <motion.div
                                key={seat.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                style={{
                                    ...styles.seat,
                                    left: `${seat.x}%`,
                                    top: `${seat.y}%`,
                                }}
                            >
                                {/* Avatar with hero pulse */}
                                <motion.img
                                    src={AVATARS[index % AVATARS.length]}
                                    alt={isHero ? 'Hero' : `Player ${index}`}
                                    animate={isHero ? {
                                        boxShadow: [
                                            '0 0 15px rgba(0, 212, 255, 0.6)',
                                            '0 0 25px rgba(0, 212, 255, 0.9)',
                                            '0 0 15px rgba(0, 212, 255, 0.6)',
                                        ]
                                    } : {}}
                                    transition={isHero ? { repeat: Infinity, duration: 2 } : {}}
                                    style={{
                                        ...styles.avatar,
                                        border: isHero ? '3px solid #00d4ff' : '3px solid #4a4a5a',
                                        boxShadow: isHero
                                            ? '0 0 15px rgba(0, 212, 255, 0.6)'
                                            : '0 0 8px rgba(0, 0, 0, 0.5)',
                                    }}
                                />

                                {/* Dealer Button with subtle pulse */}
                                {isButton && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', delay: 0.3 }}
                                        style={styles.dealerButton}
                                    >
                                        D
                                    </motion.div>
                                )}

                                {/* Badge + Hero Cards */}
                                <div style={isHero ? styles.heroRow : undefined}>
                                    {/* Position Badge */}
                                    <div style={{
                                        ...styles.badge,
                                        background: isHero
                                            ? 'linear-gradient(180deg, #0a4a6a 0%, #083050 100%)'
                                            : 'linear-gradient(180deg, #4a4a5a 0%, #2d2d3a 50%, #1a1a24 100%)',
                                        borderColor: isHero ? '#00d4ff' : '#555',
                                    }}>
                                        <div style={styles.badgeLabel}>
                                            {isHero ? `HERO (${seat.name})` : seat.name}
                                        </div>
                                        <div style={styles.badgeStack}>{stackSize} BB</div>
                                    </div>

                                    {/* Hero Cards - Only show for hero */}
                                    {isHero && (
                                        <div style={styles.heroCardsInline}>
                                            <motion.img
                                                src={getCardPath(heroCards[0])}
                                                alt={heroCards[0]}
                                                initial={{ y: 50, opacity: 0, rotateZ: -30 }}
                                                animate={{ y: 0, opacity: 1, rotateZ: -12 }}
                                                transition={{ delay: 0.1, duration: 0.4, type: 'spring' }}
                                                style={{
                                                    ...styles.card,
                                                    transformOrigin: 'bottom center',
                                                }}
                                            />
                                            <motion.img
                                                src={getCardPath(heroCards[1])}
                                                alt={heroCards[1]}
                                                initial={{ y: 50, opacity: 0, rotateZ: 30 }}
                                                animate={{ y: 0, opacity: 1, rotateZ: 8 }}
                                                transition={{ delay: 0.2, duration: 0.4, type: 'spring' }}
                                                style={{
                                                    ...styles.card,
                                                    marginLeft: -20,
                                                    transformOrigin: 'bottom center',
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* BOARD CARDS - Center of table */}
                {boardCards.length > 0 && (
                    <div style={styles.boardCards}>
                        {boardCards.map((card, i) => (
                            <motion.img
                                key={`${card}-${i}`}
                                src={getCardPath(card)}
                                alt={card}
                                style={styles.boardCard}
                                initial={{ scale: 0, rotateY: 180 }}
                                animate={{ scale: 1, rotateY: 0 }}
                                transition={{ delay: i * 0.1, duration: 0.3 }}
                            />
                        ))}
                    </div>
                )}

                {/* POT DISPLAY with chip icon */}
                {pot > 0 && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={styles.pot}
                    >
                        <span style={styles.chipIcon}>🪙</span>
                        <span>POT: {pot} BB</span>
                    </motion.div>
                )}

                {/* VILLAIN ACTION SPEECH BUBBLE */}
                {villainAction && (
                    <motion.div
                        initial={{ x: -30, opacity: 0, scale: 0.9 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', damping: 15 }}
                        style={styles.villainActionBubble}
                    >
                        <div style={styles.villainActionHeader}>{villainPosition}</div>
                        <div style={styles.villainActionText}>{villainAction}</div>
                        <div style={styles.speechTail} />
                    </motion.div>
                )}

                {/* STREET INDICATOR */}
                <motion.div
                    key={boardCards.length}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.8, y: 0 }}
                    style={styles.streetIndicator}
                >
                    {boardCards.length === 0 && '● PREFLOP'}
                    {boardCards.length === 3 && '● FLOP'}
                    {boardCards.length === 4 && '● TURN'}
                    {boardCards.length === 5 && '● RIVER'}
                </motion.div>
            </div>

            {/* TIMER & COUNTER ROW */}
            <div style={styles.timerCounterRow}>
                {/* Timer with circular progress ring */}
                <div style={styles.timerContainer}>
                    <svg style={styles.timerRing} viewBox="0 0 60 60">
                        {/* Background circle */}
                        <circle
                            cx="30"
                            cy="30"
                            r="26"
                            stroke="rgba(100,100,100,0.3)"
                            strokeWidth="4"
                            fill="none"
                        />
                        {/* Progress circle */}
                        <motion.circle
                            cx="30"
                            cy="30"
                            r="26"
                            stroke={timeLeft <= 10 ? '#ff3b3b' : '#00d4ff'}
                            strokeWidth="4"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={163.36} // 2 * PI * 26
                            strokeDashoffset={163.36 * (1 - timeLeft / 30)}
                            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                        />
                    </svg>
                    <motion.div
                        style={{
                            ...styles.timerText,
                            color: timeLeft <= 10 ? '#ff3b3b' : '#00d4ff',
                        }}
                        animate={timeLeft <= 5 ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 0.5 }}
                    >
                        {timeLeft}
                    </motion.div>
                </div>

                {/* Question Counter */}
                <div style={styles.questionCounter}>
                    Q{questionNumber}/{totalQuestions}
                </div>
            </div>

            {/* YOUR TURN INDICATOR */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={styles.yourTurnIndicator}
            >
                <motion.span
                    animate={{ opacity: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                >
                    ▶ YOUR TURN — What's the best action?
                </motion.span>
            </motion.div>

            {/* ANSWER GRID - Dynamic layout: 2x2 for 4 options, 1x2 for 2 options */}
            <div style={{
                ...styles.answersGrid,
                gridTemplateRows: options.length <= 2 ? '1fr' : '1fr 1fr', // Single row for push/fold
            }}>
                {options.slice(0, 4).map((option, index) => {
                    const optionId = option.id || String.fromCharCode(97 + index); // a, b, c, d
                    const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
                    return (
                        <motion.button
                            key={optionId}
                            onClick={() => handleAnswer(optionId)}
                            disabled={showFeedback}
                            style={getButtonStyle(option, index)}
                            whileHover={!showFeedback ? { scale: 1.03, y: -2 } : {}}
                            whileTap={!showFeedback ? { scale: 0.97 } : {}}
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
                    {/* Confetti for correct answers */}
                    {feedbackResult === 'correct' && (
                        <div style={styles.confettiContainer}>
                            {['🎉', '⭐', '✨', '🌟', '🎊', '💫'].map((emoji, i) => (
                                <motion.span
                                    key={i}
                                    initial={{
                                        opacity: 1,
                                        y: 0,
                                        x: (i - 2.5) * 30,
                                        scale: 0
                                    }}
                                    animate={{
                                        opacity: 0,
                                        y: -80 - (i * 15),
                                        x: (i - 2.5) * 50,
                                        scale: 1,
                                        rotate: (i - 2.5) * 45
                                    }}
                                    transition={{ duration: 1, delay: i * 0.05 }}
                                    style={{
                                        position: 'absolute',
                                        fontSize: 28,
                                        top: '40%',
                                        left: '50%',
                                    }}
                                >
                                    {emoji}
                                </motion.span>
                            ))}
                        </div>
                    )}

                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        style={{
                            ...styles.explanationBox,
                            borderColor: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                            boxShadow: feedbackResult === 'correct'
                                ? '0 0 40px rgba(34, 197, 94, 0.5), 0 0 80px rgba(34, 197, 94, 0.2)'
                                : '0 0 40px rgba(239, 68, 68, 0.5), 0 0 80px rgba(239, 68, 68, 0.2)',
                        }}
                    >
                        {/* Result Icon - Enhanced with color */}
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                            style={{
                                fontSize: 56,
                                marginBottom: 12,
                                color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                                textShadow: feedbackResult === 'correct'
                                    ? '0 0 30px rgba(34, 197, 94, 0.8)'
                                    : '0 0 30px rgba(239, 68, 68, 0.8)',
                            }}
                        >
                            {feedbackResult === 'correct' ? '✓' : '✗'}
                        </motion.div>

                        <div style={{
                            ...styles.explanationTitle,
                            color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                        }}>
                            {feedbackResult === 'correct' ? 'Correct!' : 'Incorrect'}
                        </div>

                        <div style={styles.explanationText}>{explanation}</div>

                        {/* Continue Indicator */}
                        <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            style={styles.continueHint}
                        >
                            Continuing in 2s...
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
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

    questionBar: {
        width: '100%',
        padding: '16px 24px',
        background: 'linear-gradient(180deg, #3a3a4a 0%, #1a1a24 100%)',
        borderBottom: '3px solid #00d4ff',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.2), inset 0 2px 4px rgba(255,255,255,0.05)',
        flexShrink: 0,
        position: 'relative',
    },

    titleRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 8,
    },

    gameTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#00d4ff',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textTransform: 'uppercase',
        letterSpacing: 2,
    },

    gameBrand: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: "'Inter', sans-serif",
        marginTop: 2,
    },

    questionText: {
        color: '#ffffff',
        fontSize: 22,  // Increased from 18
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1.4,
        textAlign: 'center',
        textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
    },

    streakBadge: {
        position: 'absolute',
        top: 12,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.3), rgba(251, 146, 60, 0.15))',
        padding: '6px 12px',
        borderRadius: 16,
        border: '1px solid rgba(251, 146, 60, 0.5)',
    },

    inlineCard: {
        width: 28,
        height: 38,
        borderRadius: 3,
        verticalAlign: 'middle',
        marginLeft: 4,
        marginRight: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    },

    tableArea: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        padding: '60px 20px 20px 20px',
    },

    tableImage: {
        width: 'auto',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        position: 'relative',
        zIndex: 1,
    },

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

    avatar: {
        width: 40,  // Smaller to fit on felt
        height: 40,
        borderRadius: '50%',
        objectFit: 'cover',
        background: 'linear-gradient(135deg, #2d2d3a, #1a1a24)',
        border: '2px solid #555',
    },

    dealerButton: {
        position: 'absolute',
        top: -20,         // Above the avatar, toward table center
        left: '50%',
        transform: 'translateX(-50%)',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        color: '#000',
        fontSize: 12,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #fff',
        boxShadow: '0 2px 10px rgba(251, 191, 36, 0.5), 0 2px 8px rgba(0,0,0,0.4)',
        zIndex: 10,
    },

    badge: {
        padding: '4px 8px',  // More compact
        borderRadius: 4,
        fontSize: 9,         // Smaller
        fontWeight: 'bold',
        color: '#00d4ff',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        border: '1px solid #555',
        boxShadow: '0 0 8px rgba(0, 212, 255, 0.2), 0 2px 4px rgba(0,0,0,0.4)',
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

    heroRow: {
        display: 'flex',
        flexDirection: 'column',  // Changed to column - cards BELOW badge
        alignItems: 'center',
        gap: 4,
    },

    heroCardsInline: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },

    card: {
        width: 38,
        height: 54,
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.2)',
    },

    boardCards: {
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 6,
        zIndex: 3,
    },

    boardCard: {
        width: 48,
        height: 68,
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    },

    pot: {
        position: 'absolute',
        top: '28%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#fbbf24',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textShadow: '0 0 10px rgba(251, 191, 36, 0.6)',
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'linear-gradient(135deg, rgba(30, 30, 40, 0.9), rgba(20, 20, 30, 0.9))',
        padding: '8px 16px',
        borderRadius: 12,
        border: '1px solid rgba(251, 191, 36, 0.4)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3), 0 0 15px rgba(251, 191, 36, 0.2)',
    },

    chipIcon: {
        fontSize: 18,
    },

    // Speech bubble for villain action
    villainActionBubble: {
        position: 'absolute',
        top: '15%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: '#fff',
        padding: '10px 18px',
        borderRadius: 16,
        fontSize: 14,
        fontWeight: 'bold',
        zIndex: 10,
        boxShadow: '0 4px 20px rgba(239, 68, 68, 0.5)',
        textAlign: 'center',
        minWidth: 120,
    },

    villainActionHeader: {
        fontSize: 11,
        opacity: 0.85,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    villainActionText: {
        fontSize: 15,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },

    speechTail: {
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid #dc2626',
    },

    streetIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#64748b',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
        zIndex: 2,
    },

    timerCounterRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        flexShrink: 0,
    },

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
        boxShadow: '0 0 15px rgba(255, 59, 59, 0.5), inset 0 2px 4px rgba(255,255,255,0.1)',
        textShadow: '0 0 10px rgba(255, 59, 59, 0.8)',
    },

    timerContainer: {
        position: 'relative',
        width: 60,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    timerRing: {
        position: 'absolute',
        width: 60,
        height: 60,
    },

    timerText: {
        fontSize: 20,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        textShadow: '0 0 10px currentColor',
    },

    streakIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.2), rgba(251, 146, 60, 0.1))',
        padding: '8px 14px',
        borderRadius: 20,
        border: '1px solid rgba(251, 146, 60, 0.4)',
    },

    streakText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fbbf24',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        letterSpacing: 1,
    },

    questionCounter: {
        color: '#00d4ff',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        background: 'linear-gradient(180deg, #3a3a4a 0%, #1a1a24 100%)',
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 0 10px rgba(0, 212, 255, 0.2)',
    },

    yourTurnIndicator: {
        textAlign: 'center',
        padding: '12px 20px',
        color: '#00d4ff',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        letterSpacing: 1,
        textTransform: 'uppercase',
        textShadow: '0 0 10px rgba(0, 212, 255, 0.6)',
        flexShrink: 0,
    },

    answersGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
        padding: '0 0 20px 0',
        width: '100%',
        flexShrink: 0,
    },

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
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.2), inset 0 2px 4px rgba(255,255,255,0.08)',
        textShadow: '0 0 8px rgba(0, 212, 255, 0.6)',
    },

    correctButton: {
        background: 'linear-gradient(180deg, #1a4a2a 0%, #0d3018 100%)',
        border: '2px solid #22c55e',
        color: '#22c55e',
        boxShadow: '0 0 20px rgba(34, 197, 94, 0.5)',
        textShadow: '0 0 10px rgba(34, 197, 94, 0.8)',
    },

    incorrectButton: {
        background: 'linear-gradient(180deg, #4a1a1a 0%, #301010 100%)',
        border: '2px solid #ef4444',
        color: '#ef4444',
        boxShadow: '0 0 20px rgba(239, 68, 68, 0.5)',
        textShadow: '0 0 10px rgba(239, 68, 68, 0.8)',
    },

    confettiContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 101,
    },

    explanationOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.88)',
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
        textAlign: 'center',
    },

    xpReward: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#22c55e',
        marginBottom: 12,
        textShadow: '0 0 10px rgba(34, 197, 94, 0.6)',
    },

    continueHint: {
        marginTop: 20,
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
    },
};
