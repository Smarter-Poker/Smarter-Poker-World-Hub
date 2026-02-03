/**
 * 🎯 Scene Cards — Card Rendering with Flip Animations
 * ═══════════════════════════════════════════════════════════════════
 * Renders playing cards with optional flip animation.
 * Uses pure CSS/HTML - NO CANVAS.
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Card suits with colors (Standard 2-color deck - matches Club Arena/Golden Template)
const SUIT_MAP = {
    'h': { symbol: '♥', color: '#cc0000' },  // Hearts - Red
    's': { symbol: '♠', color: '#1a1a2e' },  // Spades - Black
    'd': { symbol: '♦', color: '#cc0000' },  // Diamonds - Red
    'c': { symbol: '♣', color: '#1a1a2e' },  // Clubs - Black
};

// Parse card string like "Ah" or "Kd"
function parseCard(cardStr) {
    if (!cardStr || cardStr.length < 2) return null;
    const rank = cardStr.slice(0, -1).toUpperCase();
    const suit = cardStr.slice(-1).toLowerCase();
    return { rank, suit, ...SUIT_MAP[suit] };
}

export default function SceneCards({
    cards = [],
    size = 'medium',
    showFlip = false,
    faceDown = false,
}) {
    const dimensions = CARD_SIZES[size] || CARD_SIZES.medium;

    return (
        <div style={{ display: 'flex', gap: size === 'small' ? 4 : 6 }}>
            <AnimatePresence>
                {cards.map((cardStr, i) => {
                    const card = parseCard(cardStr);
                    if (!card) return null;

                    return (
                        <motion.div
                            key={`${cardStr}-${i}`}
                            initial={showFlip ? { rotateY: 180, opacity: 0 } : { scale: 0.8, opacity: 0 }}
                            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{
                                duration: 0.4,
                                delay: showFlip ? i * 0.15 : i * 0.1,
                                ease: 'easeOut',
                            }}
                            style={{
                                ...styles.card,
                                width: dimensions.width,
                                height: dimensions.height,
                                fontSize: dimensions.fontSize,
                            }}
                        >
                            {faceDown ? (
                                <div style={styles.cardBack}>
                                    <div style={styles.backPattern} />
                                </div>
                            ) : (
                                <>
                                    {/* Top left rank + suit */}
                                    <div style={{ ...styles.cornerLabel, color: card.color }}>
                                        <div style={styles.rank}>{card.rank}</div>
                                        <div style={styles.suit}>{card.symbol}</div>
                                    </div>

                                    {/* Center suit */}
                                    <div style={{ ...styles.centerSuit, color: card.color }}>
                                        {card.symbol}
                                    </div>

                                    {/* Bottom right (rotated) */}
                                    <div style={{
                                        ...styles.cornerLabel,
                                        ...styles.bottomCorner,
                                        color: card.color,
                                    }}>
                                        <div style={styles.rank}>{card.rank}</div>
                                        <div style={styles.suit}>{card.symbol}</div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

const CARD_SIZES = {
    small: { width: 36, height: 52, fontSize: 12 },
    medium: { width: 48, height: 68, fontSize: 14 },
    large: { width: 56, height: 80, fontSize: 16 },
};

const styles = {
    card: {
        position: 'relative',
        background: 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
        borderRadius: 6,
        boxShadow: '0 4px 15px rgba(0,0,0,0.4), 0 0 20px rgba(255,255,255,0.1)',
        border: '1px solid rgba(0,0,0,0.1)',
        overflow: 'hidden',
        transformStyle: 'preserve-3d',
    },

    cardBack: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #1a3a5c 0%, #0d1f33 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    backPattern: {
        width: '70%',
        height: '80%',
        background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.1) 3px, rgba(255,255,255,0.1) 6px)',
        borderRadius: 4,
        border: '2px solid rgba(255,255,255,0.2)',
    },

    cornerLabel: {
        position: 'absolute',
        top: 3,
        left: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
    },

    bottomCorner: {
        top: 'auto',
        left: 'auto',
        right: 4,
        bottom: 3,
        transform: 'rotate(180deg)',
    },

    rank: {
        fontWeight: 'bold',
        fontFamily: "'Inter', sans-serif",
    },

    suit: {
        fontSize: '0.85em',
    },

    centerSuit: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '1.8em',
    },
};
