/* ═══════════════════════════════════════════════════════════════════════════
   HAND DIAGRAM — Visual poker board/hand representation
   Shows community cards, hole cards, and player positions
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

// Card representation
const SUITS: Record<string, { symbol: string; color: string }> = {
    's': { symbol: '♠', color: '#1a1a1a' },    // Spades
    'h': { symbol: '♥', color: '#dc143c' },    // Hearts
    'd': { symbol: '♦', color: '#1e90ff' },    // Diamonds
    'c': { symbol: '♣', color: '#228b22' }     // Clubs
};

interface CardProps {
    card: string;  // e.g., 'As', 'Kh', 'Qd'
    size?: 'small' | 'medium' | 'large';
}

function Card({ card, size = 'medium' }: CardProps) {
    if (!card || card.length < 2) {
        // Unknown card
        return (
            <div style={{
                width: size === 'small' ? 24 : size === 'large' ? 48 : 36,
                height: size === 'small' ? 34 : size === 'large' ? 68 : 50,
                background: 'linear-gradient(135deg, #2a2a4a, #1a1a3a)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                borderRadius: size === 'small' ? 3 : 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 215, 0, 0.4)',
                fontSize: size === 'small' ? 10 : 14
            }}>
                ?
            </div>
        );
    }

    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    const suitInfo = SUITS[suit] || SUITS['s'];

    const dimensions = {
        small: { width: 24, height: 34, fontSize: 10, symbolSize: 8 },
        medium: { width: 36, height: 50, fontSize: 14, symbolSize: 12 },
        large: { width: 48, height: 68, fontSize: 18, symbolSize: 16 }
    };

    const d = dimensions[size];

    return (
        <div style={{
            width: d.width,
            height: d.height,
            background: 'linear-gradient(135deg, #fff, #f0f0f0)',
            border: '1px solid #ccc',
            borderRadius: size === 'small' ? 3 : 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            position: 'relative'
        }}>
            <span style={{
                position: 'absolute',
                top: 2,
                left: 3,
                fontSize: d.fontSize - 4,
                fontWeight: 700,
                color: suitInfo.color,
                fontFamily: 'monospace'
            }}>
                {rank}
            </span>
            <span style={{
                fontSize: d.symbolSize,
                color: suitInfo.color
            }}>
                {suitInfo.symbol}
            </span>
        </div>
    );
}

// Position labels
const POSITIONS = ['UTG', 'UTG+1', 'MP', 'CO', 'BTN', 'SB', 'BB'];

interface HandDiagramProps {
    board?: string[];           // Community cards: ['As', 'Kh', 'Qd', 'Jc', 'Ts']
    heroCards?: string[];       // Hero's hole cards: ['Ah', 'Kd']
    heroPosition?: string;      // 'BTN', 'CO', etc.
    villainCards?: string[];    // Villain's cards (if known)
    villainPosition?: string;
    potSize?: number;
    action?: string;            // Current action: 'Hero bets $50'
    onClose?: () => void;
}

export function HandDiagram({
    board = [],
    heroCards = [],
    heroPosition = 'BTN',
    villainCards = [],
    villainPosition = 'BB',
    potSize,
    action,
    onClose
}: HandDiagramProps) {
    // Determine street
    const getStreet = () => {
        if (board.length === 0) return 'Preflop';
        if (board.length === 3) return 'Flop';
        if (board.length === 4) return 'Turn';
        return 'River';
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '300px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{
                        margin: 0,
                        color: '#FFD700',
                        fontSize: '14px',
                        fontWeight: 600
                    }}>
                        🃏 Hand Analysis
                    </h4>
                    <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: 'rgba(255, 215, 0, 0.2)',
                        color: '#FFD700',
                        borderRadius: '4px'
                    }}>
                        {getStreet()}
                    </span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Board */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
            }}>
                <div style={{
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                    Board
                </div>
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #0a5f2c, #0d7a38)',
                    borderRadius: '8px',
                    border: '2px solid #1a8044'
                }}>
                    {board.length > 0 ? (
                        board.map((card, idx) => (
                            <Card key={idx} card={card} size="medium" />
                        ))
                    ) : (
                        Array(5).fill(null).map((_, idx) => (
                            <Card key={idx} card="" size="medium" />
                        ))
                    )}
                </div>

                {/* Pot Size */}
                {potSize !== undefined && (
                    <div style={{
                        fontSize: '12px',
                        color: '#FFD700',
                        fontWeight: 600
                    }}>
                        Pot: ${potSize}
                    </div>
                )}
            </div>

            {/* Players */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                gap: '16px'
            }}>
                {/* Hero */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        background: 'rgba(100, 255, 100, 0.2)',
                        color: '#4CAF50',
                        borderRadius: '4px',
                        fontWeight: 600
                    }}>
                        HERO ({heroPosition})
                    </span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {heroCards.length > 0 ? (
                            heroCards.map((card, idx) => (
                                <Card key={idx} card={card} size="medium" />
                            ))
                        ) : (
                            <>
                                <Card card="" size="medium" />
                                <Card card="" size="medium" />
                            </>
                        )}
                    </div>
                </div>

                {/* Villain */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        background: 'rgba(255, 100, 100, 0.2)',
                        color: '#f44336',
                        borderRadius: '4px',
                        fontWeight: 600
                    }}>
                        VILLAIN ({villainPosition})
                    </span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                        {villainCards.length > 0 ? (
                            villainCards.map((card, idx) => (
                                <Card key={idx} card={card} size="medium" />
                            ))
                        ) : (
                            <>
                                <Card card="" size="medium" />
                                <Card card="" size="medium" />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Action */}
            {action && (
                <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: 'rgba(255, 215, 0, 0.1)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#FFD700',
                    textAlign: 'center',
                    fontStyle: 'italic'
                }}>
                    {action}
                </div>
            )}
        </div>
    );
}

// Export a mini card component for inline use
export function InlineCard({ card }: { card: string }) {
    if (!card || card.length < 2) return null;

    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    const suitInfo = SUITS[suit] || SUITS['s'];

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 4px',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '3px',
            fontSize: '11px',
            fontWeight: 700,
            color: suitInfo.color,
            margin: '0 2px'
        }}>
            {rank}{suitInfo.symbol}
        </span>
    );
}
