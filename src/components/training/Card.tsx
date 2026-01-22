/**
 * Card.tsx
 * =========
 * Visual playing card component with suit symbols and animations.
 *
 * Features:
 * - White rounded rectangle with shadow
 * - Red text for Hearts/Diamonds, Black for Spades/Clubs
 * - Suit symbols in corners and center
 * - Flip and slide-in animations via framer-motion
 * - Facedown state with card back pattern
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

type Suit = 'h' | 'd' | 's' | 'c' | 'hearts' | 'diamonds' | 'spades' | 'clubs';
type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

interface CardProps {
    rank: Rank | string;
    suit: Suit;
    faceDown?: boolean;
    size?: 'small' | 'medium' | 'large';
    delay?: number;
    animate?: 'flip' | 'slide' | 'deal' | 'none';
    highlighted?: boolean;
    dimmed?: boolean;
    onClick?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUIT_SYMBOLS: Record<string, string> = {
    h: '♥',
    hearts: '♥',
    d: '♦',
    diamonds: '♦',
    s: '♠',
    spades: '♠',
    c: '♣',
    clubs: '♣',
};

const SUIT_COLORS: Record<string, string> = {
    h: '#E53935',      // Red
    hearts: '#E53935',
    d: '#E53935',      // Red
    diamonds: '#E53935',
    s: '#212121',      // Black
    spades: '#212121',
    c: '#212121',      // Black
    clubs: '#212121',
};

const SIZE_CONFIG = {
    small: { width: 45, height: 63, fontSize: 12, cornerSize: 10, centerSize: 20 },
    medium: { width: 60, height: 84, fontSize: 16, cornerSize: 13, centerSize: 28 },
    large: { width: 80, height: 112, fontSize: 20, cornerSize: 16, centerSize: 36 },
};

// ============================================================================
// CARD BACK PATTERN
// ============================================================================

const CardBack: React.FC<{ size: typeof SIZE_CONFIG.medium }> = ({ size }) => (
    <div style={{
        width: '100%',
        height: '100%',
        background: `
            linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)
        `,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #3949ab',
        overflow: 'hidden',
        position: 'relative',
    }}>
        {/* Diamond pattern */}
        <div style={{
            position: 'absolute',
            inset: 4,
            background: `
                repeating-linear-gradient(
                    45deg,
                    transparent,
                    transparent 5px,
                    rgba(255,255,255,0.05) 5px,
                    rgba(255,255,255,0.05) 10px
                )
            `,
            borderRadius: 4,
        }} />

        {/* Center logo */}
        <div style={{
            width: size.width * 0.5,
            height: size.width * 0.5,
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size.centerSize * 0.6,
            fontWeight: 900,
            color: '#1a237e',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 1,
        }}>
            SP
        </div>
    </div>
);

// ============================================================================
// CARD FACE
// ============================================================================

const CardFace: React.FC<{
    rank: string;
    suit: Suit;
    size: typeof SIZE_CONFIG.medium;
}> = ({ rank, suit, size }) => {
    const suitSymbol = SUIT_SYMBOLS[suit] || '?';
    const suitColor = SUIT_COLORS[suit] || '#000';

    // Normalize rank display
    const displayRank = rank === 'T' ? '10' : rank.toUpperCase();

    return (
        <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
            borderRadius: 6,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #e0e0e0',
        }}>
            {/* Top Left Corner */}
            <div style={{
                position: 'absolute',
                top: 4,
                left: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: 1,
            }}>
                <span style={{
                    fontSize: size.cornerSize,
                    fontWeight: 800,
                    color: suitColor,
                    fontFamily: 'Georgia, serif',
                }}>
                    {displayRank}
                </span>
                <span style={{
                    fontSize: size.cornerSize * 0.9,
                    color: suitColor,
                    marginTop: -2,
                }}>
                    {suitSymbol}
                </span>
            </div>

            {/* Bottom Right Corner (rotated) */}
            <div style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transform: 'rotate(180deg)',
                lineHeight: 1,
            }}>
                <span style={{
                    fontSize: size.cornerSize,
                    fontWeight: 800,
                    color: suitColor,
                    fontFamily: 'Georgia, serif',
                }}>
                    {displayRank}
                </span>
                <span style={{
                    fontSize: size.cornerSize * 0.9,
                    color: suitColor,
                    marginTop: -2,
                }}>
                    {suitSymbol}
                </span>
            </div>

            {/* Center Suit Symbol */}
            <span style={{
                fontSize: size.centerSize,
                color: suitColor,
                textShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}>
                {suitSymbol}
            </span>

            {/* Face card indicator for K, Q, J */}
            {['K', 'Q', 'J'].includes(displayRank) && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: size.centerSize * 1.2,
                    fontWeight: 900,
                    color: suitColor,
                    opacity: 0.15,
                    fontFamily: 'Georgia, serif',
                }}>
                    {displayRank}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN CARD COMPONENT
// ============================================================================

const Card: React.FC<CardProps> = ({
    rank,
    suit,
    faceDown = false,
    size = 'medium',
    delay = 0,
    animate = 'slide',
    highlighted = false,
    dimmed = false,
    onClick,
}) => {
    const [isFlipped, setIsFlipped] = useState(faceDown);
    const sizeConfig = SIZE_CONFIG[size];

    // Animation variants
    const slideVariants = {
        hidden: { opacity: 0, y: -50, scale: 0.8 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                delay,
                duration: 0.4,
                ease: 'easeOut',
            },
        },
    };

    const dealVariants = {
        hidden: { opacity: 0, x: 100, y: -100, rotate: -20, scale: 0.5 },
        visible: {
            opacity: 1,
            x: 0,
            y: 0,
            rotate: 0,
            scale: 1,
            transition: {
                delay,
                duration: 0.5,
                type: 'spring',
                stiffness: 200,
                damping: 20,
            },
        },
    };

    const flipVariants = {
        hidden: { rotateY: 180, opacity: 0 },
        visible: {
            rotateY: 0,
            opacity: 1,
            transition: {
                delay,
                duration: 0.6,
                ease: 'easeInOut',
            },
        },
    };

    const getVariants = () => {
        switch (animate) {
            case 'flip': return flipVariants;
            case 'deal': return dealVariants;
            case 'slide': return slideVariants;
            default: return {};
        }
    };

    return (
        <motion.div
            initial={animate !== 'none' ? 'hidden' : undefined}
            animate="visible"
            variants={getVariants()}
            whileHover={onClick ? { scale: 1.05, y: -5 } : undefined}
            whileTap={onClick ? { scale: 0.95 } : undefined}
            onClick={onClick}
            style={{
                width: sizeConfig.width,
                height: sizeConfig.height,
                perspective: 1000,
                cursor: onClick ? 'pointer' : 'default',
                filter: dimmed ? 'brightness(0.5)' : 'none',
            }}
        >
            <div style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                borderRadius: 8,
                boxShadow: highlighted
                    ? '0 0 20px rgba(255, 215, 0, 0.8), 0 4px 12px rgba(0,0,0,0.4)'
                    : '0 4px 12px rgba(0,0,0,0.3)',
                border: highlighted ? '2px solid #FFD700' : 'none',
            }}>
                {isFlipped || faceDown ? (
                    <CardBack size={sizeConfig} />
                ) : (
                    <CardFace rank={rank} suit={suit} size={sizeConfig} />
                )}
            </div>
        </motion.div>
    );
};

// ============================================================================
// CARD GROUP COMPONENT (for hole cards, board, etc.)
// ============================================================================

export const CardGroup: React.FC<{
    cards: Array<{ rank: string; suit: Suit }>;
    size?: 'small' | 'medium' | 'large';
    gap?: number;
    stagger?: number;
    animate?: 'flip' | 'slide' | 'deal' | 'none';
}> = ({ cards, size = 'medium', gap = 8, stagger = 0.1, animate = 'slide' }) => {
    return (
        <div style={{
            display: 'flex',
            gap,
            alignItems: 'center',
        }}>
            {cards.map((card, index) => (
                <Card
                    key={`${card.rank}${card.suit}-${index}`}
                    rank={card.rank as Rank}
                    suit={card.suit}
                    size={size}
                    delay={index * stagger}
                    animate={animate}
                />
            ))}
        </div>
    );
};

// ============================================================================
// PARSE CARD STRING UTILITY
// ============================================================================

export const parseCardString = (cardStr: string): { rank: string; suit: Suit } | null => {
    if (!cardStr || cardStr.length < 2) return null;

    const rank = cardStr.slice(0, -1).toUpperCase();
    const suitChar = cardStr.slice(-1).toLowerCase();

    const suitMap: Record<string, Suit> = {
        'h': 'h', 's': 's', 'd': 'd', 'c': 'c',
    };

    const suit = suitMap[suitChar];
    if (!suit) return null;

    return { rank, suit };
};

export const parseCards = (cardsStr: string): Array<{ rank: string; suit: Suit }> => {
    // Handle formats like "AhKd" or "Ah Kd" or "Ah,Kd"
    const cards: Array<{ rank: string; suit: Suit }> = [];

    // Split by space or comma if present
    const parts = cardsStr.split(/[\s,]+/).filter(Boolean);

    if (parts.length > 1) {
        // Cards are already separated
        for (const part of parts) {
            const card = parseCardString(part);
            if (card) cards.push(card);
        }
    } else {
        // Cards are concatenated like "AhKd"
        const str = cardsStr.replace(/\s/g, '');
        for (let i = 0; i < str.length; i += 2) {
            const card = parseCardString(str.slice(i, i + 2));
            if (card) cards.push(card);
        }
    }

    return cards;
};

export default Card;
