/**
 * Card.tsx
 * =========
 * Playing card component using Smarter.Poker's CUSTOM-BUILT card deck.
 * 
 * Uses the 52 hand-designed PNG images at /public/cards/
 * Uploaded Jan 22, 2026 — commit 67ad8744
 * 
 * Card backs from /public/images/card-backs/ (black, blue, red, white)
 * 
 * Image format: /cards/{suit}_{rank}.png
 *   Suits: clubs, diamonds, hearts, spades
 *   Ranks: 2, 3, 4, 5, 6, 7, 8, 9, 10, j, q, k, a
 *   Optimized: /cards/optimized/{suit}_{rank}.png
 * 
 * Native card dimensions: 150 x 210 px
 *
 * @author Smarter.Poker Engineering
 */

import React from 'react';
import { motion } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

type Suit = 'h' | 'd' | 's' | 'c';
type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

interface CardProps {
    rank?: Rank | string;
    suit?: Suit | string;
    faceDown?: boolean;
    size?: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge' | 'responsive';
    animate?: 'none' | 'flip' | 'slide' | 'deal';
    delay?: number;
    highlighted?: boolean;
    dimmed?: boolean;
    onClick?: () => void;
    cardBack?: 'black' | 'blue' | 'red' | 'white';
    optimized?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

// ============================================================================
// CONSTANTS — CUSTOM DECK ASSET MAPPING
// ============================================================================

/** Map single-char suit codes to the filename suit word */
const SUIT_TO_FILENAME: Record<string, string> = {
    h: 'hearts',
    d: 'diamonds',
    s: 'spades',
    c: 'clubs',
    hearts: 'hearts',
    diamonds: 'diamonds',
    spades: 'spades',
    clubs: 'clubs',
};

/** Map rank characters to the filename rank */
const RANK_TO_FILENAME: Record<string, string> = {
    'A': 'a',
    'K': 'k',
    'Q': 'q',
    'J': 'j',
    'T': '10',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2',
};

/** Card sizes — maintain 150:210 aspect ratio (5:7) */
const SIZES = {
    tiny: { width: 36, height: 50 },
    small: { width: 50, height: 70 },
    medium: { width: 75, height: 105 },
    large: { width: 100, height: 140 },
    xlarge: { width: 150, height: 210 },
    responsive: { width: 75, height: 105 }, // base size, CSS max-width:100% handles scaling
};

// ============================================================================
// ASSET PATH HELPERS
// ============================================================================

/**
 * Get the image path for a card face.
 * @example getCardImagePath('A', 'h') → '/cards/hearts_a.png'
 * @example getCardImagePath('T', 's') → '/cards/spades_10.png'
 */
function getCardImagePath(rank: string, suit: string, optimized: boolean = false): string {
    const suitName = SUIT_TO_FILENAME[suit] || SUIT_TO_FILENAME[suit.toLowerCase()] || 'hearts';
    const rankName = RANK_TO_FILENAME[rank] || RANK_TO_FILENAME[rank.toUpperCase()] || rank.toLowerCase();
    const dir = optimized ? '/cards/optimized' : '/cards';
    return `${dir}/${suitName}_${rankName}.png`;
}

/**
 * Get the image path for a card back.
 * @example getCardBackPath('blue') → '/images/card-backs/blue.jpg'
 */
function getCardBackPath(color: string = 'blue'): string {
    const validColors = ['black', 'blue', 'red', 'white'];
    const safeColor = validColors.includes(color) ? color : 'blue';
    return `/images/card-backs/${safeColor}.jpg`;
}

/**
 * Convert engine card integer (0-51) to rank + suit for image lookup.
 * Engine format: card = rank * 4 + suit
 *   rank: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suit: 0=c, 1=d, 2=h, 3=s
 */
const ENGINE_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const ENGINE_SUITS = ['c', 'd', 'h', 's'];

export function cardIntToProps(cardInt: number): { rank: string; suit: string } {
    const rankIdx = Math.floor(cardInt / 4);
    const suitIdx = cardInt % 4;
    return {
        rank: ENGINE_RANKS[rankIdx] || 'A',
        suit: ENGINE_SUITS[suitIdx] || 'h',
    };
}

export function cardIntToImagePath(cardInt: number, optimized: boolean = false): string {
    const { rank, suit } = cardIntToProps(cardInt);
    return getCardImagePath(rank, suit, optimized);
}

// ============================================================================
// ANIMATIONS
// ============================================================================

const animations = {
    none: {
        initial: {},
        animate: {},
        transition: { duration: 0 },
    },
    flip: {
        initial: { rotateY: 180, opacity: 0 },
        animate: { rotateY: 0, opacity: 1 },
        transition: { duration: 0.4, ease: 'easeOut' as const },
    },
    slide: {
        initial: { x: -100, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        transition: { duration: 0.3, ease: 'easeOut' as const },
    },
    deal: {
        initial: { y: -50, opacity: 0, scale: 0.8 },
        animate: { y: 0, opacity: 1, scale: 1 },
        transition: { duration: 0.3, ease: 'easeOut' as const },
    },
};

// ============================================================================
// CARD COMPONENT — CUSTOM PNG DECK
// ============================================================================

const Card: React.FC<CardProps> = ({
    rank = 'A',
    suit = 'h',
    faceDown = false,
    size = 'medium',
    animate = 'none',
    delay = 0,
    highlighted = false,
    dimmed = false,
    onClick,
    cardBack = 'blue',
    optimized = false,
    className = '',
    style: customStyle,
}) => {
    const dims = SIZES[size] || SIZES.medium;
    const anim = animations[animate] || animations.none;

    // Build the image source
    const imageSrc = faceDown
        ? getCardBackPath(cardBack)
        : getCardImagePath(rank, suit, optimized);

    const containerStyle: React.CSSProperties = {
        width: dims.width,
        height: dims.height,
        borderRadius: Math.max(4, dims.width * 0.08),
        overflow: 'hidden',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: highlighted
            ? '0 4px 20px rgba(255, 215, 0, 0.5), 0 0 0 3px #ffd700'
            : '0 2px 8px rgba(0, 0, 0, 0.3)',
        opacity: dimmed ? 0.4 : 1,
        ...customStyle,
    };

    return (
        <motion.div
            style={containerStyle}
            className={className}
            onClick={onClick}
            role="img"
            aria-label={faceDown ? 'Card (face down)' : `${rank} of ${SUIT_TO_FILENAME[suit] || suit}`}
            initial={anim.initial}
            animate={anim.animate}
            transition={{ ...anim.transition, delay }}
            whileHover={onClick ? { scale: 1.05, y: -5 } : {}}
        >
            <img
                src={imageSrc}
                alt={faceDown ? 'Card (face down)' : `${rank} of ${SUIT_TO_FILENAME[suit] || suit}`}
                width={dims.width}
                height={dims.height}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    draggable: false,
                } as React.CSSProperties}
                draggable={false}
                loading="lazy"
            />
        </motion.div>
    );
};

// ============================================================================
// CARD GROUP COMPONENT
// ============================================================================

interface CardGroupProps {
    cards: Array<{ rank: string; suit: string }>;
    size?: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';
    spacing?: number;
    animate?: 'none' | 'deal';
    stagger?: number;
    cardBack?: 'black' | 'blue' | 'red' | 'white';
}

export const CardGroup: React.FC<CardGroupProps> = ({
    cards,
    size = 'medium',
    spacing = -20,
    animate = 'deal',
    stagger = 0.1,
    cardBack = 'blue',
}) => {
    return (
        <div style={{ display: 'flex', marginLeft: -spacing }}>
            {cards.map((card, idx) => (
                <div key={idx} style={{ marginLeft: spacing, zIndex: idx }}>
                    <Card
                        rank={card.rank as Rank}
                        suit={card.suit as Suit}
                        size={size}
                        animate={animate}
                        delay={idx * stagger}
                        cardBack={cardBack}
                    />
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// CARD FROM ENGINE INTEGER
// ============================================================================

interface EngineCardProps extends Omit<CardProps, 'rank' | 'suit'> {
    /** Card integer from the poker engine (0-51), or null for face-down */
    cardInt: number | null;
}

export const EngineCard: React.FC<EngineCardProps> = ({ cardInt, ...props }) => {
    if (cardInt === null || cardInt === undefined) {
        return <Card {...props} faceDown={true} />;
    }
    const { rank, suit } = cardIntToProps(cardInt);
    return <Card rank={rank} suit={suit} {...props} />;
};

// ============================================================================
// PRELOAD HELPER — Call when player sits at table
// ============================================================================

export function preloadCardDeck(optimized: boolean = true): void {
    const dir = optimized ? '/cards/optimized' : '/cards';
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];

    suits.forEach(suit => {
        ranks.forEach(rank => {
            const img = new Image();
            img.src = `${dir}/${suit}_${rank}.png`;
        });
    });

    // Preload default card back
    const back = new Image();
    back.src = '/images/card-backs/blue.jpg';
}

// ============================================================================
// HELPER: Parse cards from string
// ============================================================================

export const parseCards = (cardString: string): Array<{ rank: string; suit: string }> => {
    const cards: Array<{ rank: string; suit: string }> = [];
    const cleanStr = cardString
        .replace(/\s+/g, '')
        .replace(/♥/g, 'h')
        .replace(/♦/g, 'd')
        .replace(/♠/g, 's')
        .replace(/♣/g, 'c');

    for (let i = 0; i < cleanStr.length - 1; i += 2) {
        cards.push({
            rank: cleanStr[i].toUpperCase(),
            suit: cleanStr[i + 1].toLowerCase(),
        });
    }

    return cards;
};

// ============================================================================
// EXPORTS
// ============================================================================

export { getCardImagePath, getCardBackPath, SIZES, SUIT_TO_FILENAME, RANK_TO_FILENAME };
export default Card;
