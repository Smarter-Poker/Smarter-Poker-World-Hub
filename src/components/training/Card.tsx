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

type Suit = 'h' | 'd' | 's' | 'c';
type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

interface CardProps {
    rank?: Rank | string;
    suit?: Suit | string;
    faceDown?: boolean;
    size?: 'small' | 'medium' | 'large';
    animate?: 'none' | 'flip' | 'slide' | 'deal';
    delay?: number;
    highlighted?: boolean;
    onClick?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUIT_SYMBOLS: Record<string, string> = {
    h: '♥',
    d: '♦',
    s: '♠',
    c: '♣',
    hearts: '♥',
    diamonds: '♦',
    spades: '♠',
    clubs: '♣',
};

const SUIT_COLORS: Record<string, string> = {
    h: '#ff2d55',
    d: '#ff2d55',
    s: '#1a1a2e',
    c: '#1a1a2e',
    hearts: '#ff2d55',
    diamonds: '#ff2d55',
    spades: '#1a1a2e',
    clubs: '#1a1a2e',
};

const SIZES = {
    small: { width: 45, height: 63, fontSize: 12, suitSize: 14 },
    medium: { width: 60, height: 84, fontSize: 16, suitSize: 20 },
    large: { width: 80, height: 112, fontSize: 22, suitSize: 28 },
};

// ============================================================================
// ANIMATIONS
// ============================================================================

const animations = {
    none: {},
    flip: {
        initial: { rotateY: 180, opacity: 0 },
        animate: { rotateY: 0, opacity: 1 },
        transition: { duration: 0.4, ease: 'easeOut' },
    },
    slide: {
        initial: { x: -100, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        transition: { duration: 0.3, ease: 'easeOut' },
    },
    deal: {
        initial: { y: -50, opacity: 0, scale: 0.8 },
        animate: { y: 0, opacity: 1, scale: 1 },
        transition: { duration: 0.3, ease: 'easeOut' },
    },
};

// ============================================================================
// CARD COMPONENT
// ============================================================================

const Card: React.FC<CardProps> = ({
    rank = 'A',
    suit = 'h',
    faceDown = false,
    size = 'medium',
    animate = 'none',
    delay = 0,
    highlighted = false,
    onClick,
}) => {
    const dims = SIZES[size];
    const suitSymbol = SUIT_SYMBOLS[suit] || '?';
    const suitColor = SUIT_COLORS[suit] || '#1a1a2e';
    const anim = animations[animate];

    const cardStyle: React.CSSProperties = {
        width: dims.width,
        height: dims.height,
        borderRadius: 8,
        background: faceDown
            ? 'linear-gradient(135deg, #1a4ca0 0%, #0d2a5c 100%)'
            : '#fff',
        boxShadow: highlighted
            ? `0 4px 20px rgba(255, 215, 0, 0.5), 0 0 0 3px #ffd700`
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
    };

    return (
        <motion.div
            style={cardStyle}
            onClick={onClick}
            initial={anim.initial}
            animate={anim.animate}
            transition={{ ...anim.transition, delay }}
            whileHover={onClick ? { scale: 1.05, y: -5 } : {}}
        >
            {faceDown ? (
                // Card back
                <div style={styles.cardBack}>
                    <div style={styles.cardBackPattern}>
                        <div style={styles.cardBackInner}>
                            <span style={styles.cardBackLogo}>SP</span>
                        </div>
                    </div>
                </div>
            ) : (
                // Card face
                <>
                    {/* Top left corner */}
                    <div style={{ ...styles.corner, ...styles.topLeft }}>
                        <span style={{ ...styles.cornerRank, color: suitColor, fontSize: dims.fontSize }}>
                            {rank}
                        </span>
                        <span style={{ ...styles.cornerSuit, color: suitColor, fontSize: dims.suitSize * 0.7 }}>
                            {suitSymbol}
                        </span>
                    </div>

                    {/* Center suit */}
                    <div style={styles.center}>
                        <span style={{ ...styles.centerSuit, color: suitColor, fontSize: dims.suitSize * 1.5 }}>
                            {suitSymbol}
                        </span>
                    </div>

                    {/* Bottom right corner (inverted) */}
                    <div style={{ ...styles.corner, ...styles.bottomRight }}>
                        <span style={{ ...styles.cornerRank, color: suitColor, fontSize: dims.fontSize }}>
                            {rank}
                        </span>
                        <span style={{ ...styles.cornerSuit, color: suitColor, fontSize: dims.suitSize * 0.7 }}>
                            {suitSymbol}
                        </span>
                    </div>
                </>
            )}
        </motion.div>
    );
};

// ============================================================================
// CARD GROUP COMPONENT
// ============================================================================

interface CardGroupProps {
    cards: Array<{ rank: string; suit: string }>;
    size?: 'small' | 'medium' | 'large';
    spacing?: number;
    animate?: 'none' | 'deal';
    stagger?: number;
}

export const CardGroup: React.FC<CardGroupProps> = ({
    cards,
    size = 'medium',
    spacing = -20,
    animate = 'deal',
    stagger = 0.1,
}) => {
    return (
        <div style={{ display: 'flex', marginLeft: -spacing }}>
            {cards.map((card, idx) => (
                <div key={idx} style={{ marginLeft: spacing }}>
                    <Card
                        rank={card.rank as Rank}
                        suit={card.suit as Suit}
                        size={size}
                        animate={animate}
                        delay={idx * stagger}
                    />
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// HELPER: Parse cards from string
// ============================================================================

export const parseCards = (cardString: string): Array<{ rank: string; suit: string }> => {
    // Parse formats like "AhKd" or "Ah Kd" or "A♥ K♦"
    const cards: Array<{ rank: string; suit: string }> = [];
    const cleanStr = cardString.replace(/\s+/g, '').replace(/♥/g, 'h').replace(/♦/g, 'd').replace(/♠/g, 's').replace(/♣/g, 'c');

    for (let i = 0; i < cleanStr.length - 1; i += 2) {
        cards.push({
            rank: cleanStr[i].toUpperCase(),
            suit: cleanStr[i + 1].toLowerCase(),
        });
    }

    return cards;
};

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    corner: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'absolute',
        padding: 3,
    },
    topLeft: {
        top: 2,
        left: 4,
    },
    bottomRight: {
        bottom: 2,
        right: 4,
        transform: 'rotate(180deg)',
    },
    cornerRank: {
        fontWeight: 700,
        lineHeight: 1,
    },
    cornerSuit: {
        lineHeight: 1,
    },
    center: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerSuit: {
        opacity: 0.8,
    },
    cardBack: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
    },
    cardBackPattern: {
        width: '100%',
        height: '100%',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)',
    },
    cardBackInner: {
        width: '60%',
        height: '60%',
        borderRadius: '50%',
        background: 'rgba(255, 215, 0, 0.2)',
        border: '2px solid rgba(255, 215, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardBackLogo: {
        color: '#ffd700',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: 1,
    },
};

export default Card;
