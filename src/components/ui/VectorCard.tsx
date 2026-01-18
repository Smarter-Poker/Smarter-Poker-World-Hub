/**
 * 🃏 VECTOR CARD DECK - No Sprites Needed
 * 
 * Pure CSS/SVG playing cards that look crisp at any resolution.
 * Features:
 * - Unicode suits (♠ ♥ ♦ ♣)
 * - Clean typography
 * - 4K ready
 * - Card backs with patterns
 */

import React, { useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface VectorCardProps {
    code?: string;          // e.g., "Ah", "Kd", "2c"
    isFaceDown?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    rotation?: number;
    elevation?: number;
    glowColor?: string;
    onClick?: () => void;
    style?: React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_SYMBOLS: Record<Suit, string> = {
    'h': '♥',
    'd': '♦',
    'c': '♣',
    's': '♠'
};

const SUIT_COLORS: Record<Suit, string> = {
    'h': '#dc2626', // Red
    'd': '#dc2626', // Red
    'c': '#1a1a2e', // Black
    's': '#1a1a2e'  // Black
};

const SIZE_CONFIGS = {
    xs: { width: 35, height: 50, fontSize: 12, subFontSize: 10 },
    sm: { width: 45, height: 63, fontSize: 14, subFontSize: 12 },
    md: { width: 55, height: 77, fontSize: 18, subFontSize: 14 },
    lg: { width: 70, height: 98, fontSize: 22, subFontSize: 18 },
    xl: { width: 90, height: 126, fontSize: 28, subFontSize: 22 }
};

// ═══════════════════════════════════════════════════════════════════════════
// PARSE CARD CODE
// ═══════════════════════════════════════════════════════════════════════════

function parseCardCode(code: string): { rank: string; suit: Suit } | null {
    if (!code || code.length < 2) return null;

    const rank = code.charAt(0).toUpperCase();
    const suit = code.charAt(1).toLowerCase() as Suit;

    if (!['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'].includes(rank)) {
        return null;
    }

    if (!['h', 'd', 'c', 's'].includes(suit)) {
        return null;
    }

    return { rank, suit };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function VectorCard({
    code,
    isFaceDown = false,
    size = 'md',
    rotation = 0,
    elevation = 3,
    glowColor,
    onClick,
    style
}: VectorCardProps) {
    const sizeConfig = SIZE_CONFIGS[size];
    const parsed = useMemo(() => code ? parseCardCode(code) : null, [code]);

    const cardStyle: React.CSSProperties = {
        width: sizeConfig.width,
        height: sizeConfig.height,
        borderRadius: sizeConfig.width * 0.1,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        transform: `rotate(${rotation}deg)`,
        transition: 'transform 0.2s, box-shadow 0.2s',
        ...style
    };

    if (isFaceDown || !parsed) {
        return (
            <CardBack
                {...sizeConfig}
                style={cardStyle}
                elevation={elevation}
                onClick={onClick}
            />
        );
    }

    const suitColor = SUIT_COLORS[parsed.suit];
    const suitSymbol = SUIT_SYMBOLS[parsed.suit];

    return (
        <div
            onClick={onClick}
            style={{
                ...cardStyle,
                background: 'linear-gradient(145deg, #ffffff, #f5f5f5)',
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: `
                    0 ${elevation}px ${elevation * 2}px rgba(0,0,0,0.15),
                    0 ${elevation * 2}px ${elevation * 4}px rgba(0,0,0,0.1)
                    ${glowColor ? `, 0 0 ${elevation * 4}px ${glowColor}` : ''}
                `,
                overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = `rotate(${rotation}deg) translateY(-3px)`;
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = `rotate(${rotation}deg)`;
            }}
        >
            {/* Top-left corner */}
            <div style={{
                position: 'absolute',
                top: sizeConfig.width * 0.08,
                left: sizeConfig.width * 0.1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: 1
            }}>
                <span style={{
                    fontSize: sizeConfig.fontSize,
                    fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
                    fontWeight: 700,
                    color: suitColor
                }}>
                    {parsed.rank}
                </span>
                <span style={{
                    fontSize: sizeConfig.subFontSize,
                    color: suitColor
                }}>
                    {suitSymbol}
                </span>
            </div>

            {/* Center suit (large) */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: sizeConfig.width * 0.5,
                color: suitColor,
                opacity: 0.9
            }}>
                {suitSymbol}
            </div>

            {/* Bottom-right corner (inverted) */}
            <div style={{
                position: 'absolute',
                bottom: sizeConfig.width * 0.08,
                right: sizeConfig.width * 0.1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                lineHeight: 1,
                transform: 'rotate(180deg)'
            }}>
                <span style={{
                    fontSize: sizeConfig.fontSize,
                    fontFamily: "'Bebas Neue', 'Arial Black', sans-serif",
                    fontWeight: 700,
                    color: suitColor
                }}>
                    {parsed.rank}
                </span>
                <span style={{
                    fontSize: sizeConfig.subFontSize,
                    color: suitColor
                }}>
                    {suitSymbol}
                </span>
            </div>

            {/* Shine effect */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '40%',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)',
                borderRadius: `${sizeConfig.width * 0.1}px ${sizeConfig.width * 0.1}px 0 0`,
                pointerEvents: 'none'
            }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD BACK COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface CardBackProps {
    width: number;
    height: number;
    fontSize: number;
    subFontSize: number;
    style?: React.CSSProperties;
    elevation?: number;
    onClick?: () => void;
}

function CardBack({ width, height, style, elevation = 3, onClick }: CardBackProps) {
    return (
        <div
            onClick={onClick}
            style={{
                ...style,
                width,
                height,
                background: 'linear-gradient(135deg, #1a1a3a, #0a0a2a)',
                border: '2px solid rgba(255,255,255,0.15)',
                boxShadow: `
                    0 ${elevation}px ${elevation * 2}px rgba(0,0,0,0.3),
                    inset 0 1px 0 rgba(255,255,255,0.1)
                `,
                overflow: 'hidden',
                position: 'relative'
            }}
        >
            {/* Pattern background using SVG */}
            <svg
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0 }}
            >
                <defs>
                    <pattern id="cardPattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
                        <path
                            d="M6 0L12 6L6 12L0 6Z"
                            fill="none"
                            stroke="rgba(0,212,255,0.2)"
                            strokeWidth="0.5"
                        />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cardPattern)" />
            </svg>

            {/* Center logo */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: width * 0.3,
                color: 'rgba(0,212,255,0.4)',
                textShadow: '0 0 10px rgba(0,212,255,0.3)'
            }}>
                ♠
            </div>

            {/* Border decoration */}
            <div style={{
                position: 'absolute',
                inset: width * 0.08,
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: width * 0.05,
                pointerEvents: 'none'
            }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD PAIR (Hero Hole Cards)
// ═══════════════════════════════════════════════════════════════════════════

interface CardPairProps {
    cards: [string, string];
    size?: VectorCardProps['size'];
    overlap?: number;
    spreadAngle?: number;
    isFaceDown?: boolean;
    glowColor?: string;
}

export function CardPair({
    cards,
    size = 'md',
    overlap = 20,
    spreadAngle = 8,
    isFaceDown = false,
    glowColor
}: CardPairProps) {
    return (
        <div style={{
            display: 'flex',
            position: 'relative'
        }}>
            <VectorCard
                code={cards[0]}
                size={size}
                isFaceDown={isFaceDown}
                rotation={-spreadAngle}
                glowColor={glowColor}
                style={{ marginRight: -overlap, zIndex: 1 }}
            />
            <VectorCard
                code={cards[1]}
                size={size}
                isFaceDown={isFaceDown}
                rotation={spreadAngle}
                glowColor={glowColor}
                style={{ zIndex: 2 }}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD DISPLAY (Community Cards)
// ═══════════════════════════════════════════════════════════════════════════

interface BoardDisplayProps {
    cards: string[];
    size?: VectorCardProps['size'];
    gap?: number;
}

export function BoardDisplay({
    cards,
    size = 'md',
    gap = 8
}: BoardDisplayProps) {
    // Pad to 5 cards with empty slots
    const paddedCards = [...cards, ...Array(5 - cards.length).fill(null)];

    return (
        <div style={{
            display: 'flex',
            gap,
            justifyContent: 'center'
        }}>
            {paddedCards.map((card, index) => (
                <div key={index}>
                    {card ? (
                        <VectorCard code={card} size={size} />
                    ) : (
                        <EmptyCardSlot size={size} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY CARD SLOT
// ═══════════════════════════════════════════════════════════════════════════

interface EmptyCardSlotProps {
    size?: VectorCardProps['size'];
}

function EmptyCardSlot({ size = 'md' }: EmptyCardSlotProps) {
    const sizeConfig = SIZE_CONFIGS[size];

    return (
        <div style={{
            width: sizeConfig.width,
            height: sizeConfig.height,
            borderRadius: sizeConfig.width * 0.1,
            background: 'rgba(0,0,0,0.2)',
            border: '2px dashed rgba(255,255,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                width: sizeConfig.width * 0.3,
                height: sizeConfig.height * 0.3,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)'
            }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DECK STACK (Visual Indicator)
// ═══════════════════════════════════════════════════════════════════════════

interface DeckStackProps {
    cardCount?: number;
    size?: VectorCardProps['size'];
}

export function DeckStack({ cardCount = 52, size = 'md' }: DeckStackProps) {
    const sizeConfig = SIZE_CONFIGS[size];
    const visibleCards = Math.min(5, Math.ceil(cardCount / 10));

    return (
        <div style={{
            position: 'relative',
            width: sizeConfig.width + visibleCards * 2,
            height: sizeConfig.height + visibleCards * 2
        }}>
            {Array.from({ length: visibleCards }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        top: i * 2,
                        left: i * 2,
                        zIndex: visibleCards - i
                    }}
                >
                    <VectorCard isFaceDown size={size} />
                </div>
            ))}
        </div>
    );
}

export default VectorCard;
