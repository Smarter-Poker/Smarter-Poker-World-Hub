/**
 * 🎮 PREMIUM POKER TABLE — Next-Gen UI
 * 
 * Architecture:
 * - React for state management
 * - Framer Motion for fluid animations
 * - CSS for glassmorphism effects
 * - Canvas for particle effects
 * 
 * Design Philosophy:
 * - Premium dark theme with neon accents
 * - Cinematic card animations
 * - Haptic-feeling interactions
 * - Mobile-first responsiveness
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// PREMIUM DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const TOKENS = {
    // Backgrounds
    bgAbyss: '#050508',
    bgTable: '#080810',
    feltDark: '#0a0f12',

    // Neon Accents
    neonCyan: '#00f5ff',
    neonGold: '#ffd700',
    neonPink: '#ff007f',
    neonGreen: '#00ff88',
    neonRed: '#ff4757',

    // Metallic
    gold: '#d4a000',
    goldLight: '#f0c040',
    goldDark: '#8b6914',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#a0a0b0',
    textMuted: '#6b6b7b',
};

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS (9-Max Fanned Layout)
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_LAYOUT = {
    hero: { x: 50, y: 88, isHero: true },
    seat1: { x: 15, y: 72 },
    seat2: { x: 8, y: 50 },
    seat3: { x: 12, y: 28 },
    seat4: { x: 30, y: 12 },
    seat5: { x: 50, y: 8 },
    seat6: { x: 70, y: 12 },
    seat7: { x: 88, y: 28 },
    seat8: { x: 92, y: 50 },
    seat9: { x: 85, y: 72 },
};

// ═══════════════════════════════════════════════════════════════════════════
// CARD COMPONENT — Cinematic Design
// ═══════════════════════════════════════════════════════════════════════════

const SUITS = {
    s: { symbol: '♠', color: '#1a1a2e', name: 'spades' },
    h: { symbol: '♥', color: '#ff4757', name: 'hearts' },
    d: { symbol: '♦', color: '#3498db', name: 'diamonds' },
    c: { symbol: '♣', color: '#2ecc71', name: 'clubs' },
};

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function PlayingCard({
    card, // e.g., "As", "Kh", "Td"
    size = 'medium',
    isFlipped = false,
    isDealing = false,
    dealDelay = 0,
    style = {}
}) {
    const rank = card?.[0];
    const suit = card?.[1];
    const suitConfig = SUITS[suit] || SUITS.s;

    const sizes = {
        small: { width: 40, height: 56, fontSize: 14 },
        medium: { width: 60, height: 84, fontSize: 20 },
        large: { width: 80, height: 112, fontSize: 26 },
    };

    const s = sizes[size];

    const cardVariants = {
        hidden: {
            scale: 0.5,
            rotateY: 180,
            opacity: 0,
            y: -100
        },
        visible: {
            scale: 1,
            rotateY: 0,
            opacity: 1,
            y: 0,
            transition: {
                delay: dealDelay,
                duration: 0.4,
                ease: [0.34, 1.56, 0.64, 1]
            }
        },
        hover: {
            y: -8,
            scale: 1.05,
            boxShadow: `0 20px 40px rgba(0,0,0,0.4), 0 0 20px ${suitConfig.color}40`
        }
    };

    return (
        <motion.div
            variants={cardVariants}
            initial={isDealing ? "hidden" : "visible"}
            animate="visible"
            whileHover="hover"
            style={{
                width: s.width,
                height: s.height,
                borderRadius: 8,
                background: isFlipped
                    ? `linear-gradient(135deg, ${TOKENS.neonCyan}20 0%, ${TOKENS.bgAbyss} 100%)`
                    : 'linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%)',
                border: isFlipped
                    ? `2px solid ${TOKENS.neonCyan}60`
                    : '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 4,
                cursor: 'pointer',
                perspective: 1000,
                transformStyle: 'preserve-3d',
                ...style
            }}
        >
            {!isFlipped && (
                <>
                    <div style={{
                        fontSize: s.fontSize,
                        fontWeight: 'bold',
                        color: suitConfig.color,
                        fontFamily: 'Arial Black, sans-serif',
                        lineHeight: 1
                    }}>
                        {rank === 'T' ? '10' : rank}
                    </div>
                    <div style={{
                        fontSize: s.fontSize * 1.2,
                        textAlign: 'center',
                        color: suitConfig.color
                    }}>
                        {suitConfig.symbol}
                    </div>
                    <div style={{
                        fontSize: s.fontSize,
                        fontWeight: 'bold',
                        color: suitConfig.color,
                        textAlign: 'right',
                        transform: 'rotate(180deg)',
                        fontFamily: 'Arial Black, sans-serif',
                        lineHeight: 1
                    }}>
                        {rank === 'T' ? '10' : rank}
                    </div>
                </>
            )}

            {isFlipped && (
                <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `repeating-linear-gradient(
            45deg,
            ${TOKENS.neonCyan}10,
            ${TOKENS.neonCyan}10 2px,
            transparent 2px,
            transparent 8px
          )`
                }}>
                    <span style={{ fontSize: s.fontSize * 0.8, color: TOKENS.neonCyan }}>SP</span>
                </div>
            )}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHIP STACK COMPONENT — 3D Perspective
// ═══════════════════════════════════════════════════════════════════════════

const CHIP_COLORS = {
    1: '#ffffff',
    5: '#ff4757',
    25: '#2ecc71',
    100: '#1a1a2e',
    500: '#9b59b6',
    1000: '#f39c12',
};

function ChipStack({ amount, size = 'medium' }) {
    const chipHeight = size === 'small' ? 3 : 4;
    const chipWidth = size === 'small' ? 24 : 32;

    // Calculate chip breakdown
    const chips = useMemo(() => {
        const result = [];
        let remaining = amount;
        const denominations = [1000, 500, 100, 25, 5, 1];

        for (const denom of denominations) {
            while (remaining >= denom && result.length < 10) {
                result.push(denom);
                remaining -= denom;
            }
        }
        return result.slice(0, 8); // Max 8 chips visible
    }, [amount]);

    return (
        <div style={{
            position: 'relative',
            height: chips.length * chipHeight + 10,
            width: chipWidth
        }}>
            {chips.map((denom, i) => (
                <motion.div
                    key={i}
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                        position: 'absolute',
                        bottom: i * chipHeight,
                        left: 0,
                        width: chipWidth,
                        height: chipWidth,
                        borderRadius: '50%',
                        background: `radial-gradient(circle at 30% 30%, ${CHIP_COLORS[denom]}dd, ${CHIP_COLORS[denom]}99)`,
                        border: `2px solid ${CHIP_COLORS[denom]}`,
                        boxShadow: `
              0 ${chipHeight}px 0 rgba(0,0,0,0.3),
              inset 0 2px 4px rgba(255,255,255,0.3),
              inset 0 -2px 4px rgba(0,0,0,0.2)
            `,
                    }}
                />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT COMPONENT — Premium Avatar Display
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({
    player,
    position,
    isActive = false,
    isFolded = false,
    isHero = false,
    isDealer = false,
    cards = [],
    timerProgress = 1,
}) {
    const activeRingVariants = {
        inactive: {
            boxShadow: 'none',
            borderColor: 'transparent'
        },
        active: {
            boxShadow: [
                `0 0 20px ${TOKENS.neonCyan}`,
                `0 0 40px ${TOKENS.neonCyan}60`,
                `0 0 20px ${TOKENS.neonCyan}`
            ],
            borderColor: TOKENS.neonCyan,
            transition: {
                duration: 1,
                repeat: Infinity,
                ease: 'easeInOut'
            }
        }
    };

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: isFolded ? 0.4 : 1 }}
            style={{
                position: 'absolute',
                left: `${position.x}%`,
                top: `${position.y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
            }}
        >
            {/* Cards (for hero) */}
            {isHero && cards.length > 0 && (
                <div style={{
                    display: 'flex',
                    gap: -10,
                    marginBottom: 8,
                    transform: 'perspective(500px) rotateX(10deg)'
                }}>
                    {cards.map((card, i) => (
                        <PlayingCard
                            key={i}
                            card={card}
                            size="medium"
                            isDealing
                            dealDelay={i * 0.1}
                            style={{
                                transform: `rotate(${i === 0 ? -8 : 8}deg)`,
                                marginLeft: i > 0 ? -15 : 0
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Avatar Container */}
            <motion.div
                variants={activeRingVariants}
                animate={isActive ? 'active' : 'inactive'}
                style={{
                    width: isHero ? 80 : 64,
                    height: isHero ? 80 : 64,
                    borderRadius: '50%',
                    border: `3px solid ${isActive ? TOKENS.neonCyan : TOKENS.gold}`,
                    overflow: 'hidden',
                    position: 'relative',
                    background: TOKENS.bgAbyss,
                }}
            >
                {/* Timer Ring */}
                {isActive && (
                    <svg
                        style={{
                            position: 'absolute',
                            top: -3,
                            left: -3,
                            width: isHero ? 86 : 70,
                            height: isHero ? 86 : 70,
                            transform: 'rotate(-90deg)',
                            zIndex: 10,
                        }}
                    >
                        <circle
                            cx={isHero ? 43 : 35}
                            cy={isHero ? 43 : 35}
                            r={isHero ? 40 : 32}
                            fill="none"
                            stroke={timerProgress > 0.5 ? TOKENS.neonGreen : timerProgress > 0.2 ? TOKENS.neonGold : TOKENS.neonRed}
                            strokeWidth="3"
                            strokeDasharray={`${2 * Math.PI * (isHero ? 40 : 32)}`}
                            strokeDashoffset={`${2 * Math.PI * (isHero ? 40 : 32) * (1 - timerProgress)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                        />
                    </svg>
                )}

                {/* Avatar Image */}
                <img
                    src={player.avatarUrl || '/avatars/default.png'}
                    alt={player.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: isFolded ? 'grayscale(100%) brightness(0.5)' : 'none',
                    }}
                />

                {/* Dealer Button */}
                {isDealer && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                            position: 'absolute',
                            bottom: -8,
                            right: -8,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'white',
                            border: '2px solid #333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 'bold',
                            color: '#333',
                            zIndex: 20,
                        }}
                    >
                        D
                    </motion.div>
                )}
            </motion.div>

            {/* Name Badge */}
            <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                style={{
                    background: `linear-gradient(135deg, ${TOKENS.gold} 0%, ${TOKENS.goldLight} 100%)`,
                    borderRadius: 6,
                    padding: '4px 12px',
                    minWidth: 80,
                    textAlign: 'center',
                }}
            >
                <div style={{
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: '#000',
                    whiteSpace: 'nowrap'
                }}>
                    {player.name}
                </div>
                <div style={{
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#000'
                }}>
                    {player.stack} BB
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTON COMPONENT — Glassmorphism Design
// ═══════════════════════════════════════════════════════════════════════════

function ActionButton({
    label,
    onClick,
    variant = 'default',
    size = 'medium',
    disabled = false
}) {
    const variants = {
        fold: { bg: '#1e3a5f', glow: TOKENS.neonCyan },
        check: { bg: '#1e3a5f', glow: TOKENS.neonCyan },
        call: { bg: '#1e4d2e', glow: TOKENS.neonGreen },
        raise: { bg: '#4d1e1e', glow: TOKENS.neonRed },
        allin: {
            bg: `linear-gradient(135deg, #4d1e1e 0%, #8b0000 100%)`,
            glow: TOKENS.neonRed
        },
        default: { bg: '#1e2a3f', glow: TOKENS.neonCyan },
    };

    const v = variants[variant] || variants.default;

    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            whileHover={{
                scale: 1.02,
                y: -2,
                boxShadow: `0 0 30px ${v.glow}40`
            }}
            whileTap={{ scale: 0.98 }}
            style={{
                background: typeof v.bg === 'string' && v.bg.includes('gradient')
                    ? v.bg
                    : `linear-gradient(145deg, ${v.bg} 0%, ${v.bg}dd 100%)`,
                backdropFilter: 'blur(10px)',
                border: `1px solid ${v.glow}30`,
                borderRadius: 12,
                padding: size === 'large' ? '16px 32px' : '12px 24px',
                color: 'white',
                fontSize: size === 'large' ? 18 : 14,
                fontWeight: 'bold',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                boxShadow: `
          0 4px 15px rgba(0,0,0,0.3),
          inset 0 1px 0 rgba(255,255,255,0.1)
        `,
                transition: 'all 0.2s ease',
            }}
        >
            {label}
        </motion.button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// POT DISPLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PotDisplay({ amount }) {
    return (
        <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
                position: 'absolute',
                top: '35%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(10px)',
                borderRadius: 20,
                padding: '8px 16px',
                border: `1px solid ${TOKENS.gold}40`,
            }}
        >
            <ChipStack amount={amount} size="small" />
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                POT: {amount} BB
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY CARDS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CommunityCards({ cards = [] }) {
    return (
        <div style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            gap: 8,
        }}>
            {[0, 1, 2, 3, 4].map((i) => (
                <PlayingCard
                    key={i}
                    card={cards[i]}
                    size="medium"
                    isFlipped={!cards[i]}
                    isDealing={!!cards[i]}
                    dealDelay={i * 0.15}
                />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PREMIUM POKER TABLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PremiumPokerTable({
    players = [],
    heroCards = [],
    communityCards = [],
    pot = 0,
    activePlayer = null,
    dealerPosition = 0,
    timerProgress = 1,
    onFold,
    onCheck,
    onCall,
    onRaise,
    onAllIn,
    gameTitle = 'GTO TRAINER',
}) {
    return (
        <div style={{
            width: '100%',
            height: '100%',
            minHeight: '100vh',
            background: `radial-gradient(ellipse at center, ${TOKENS.bgTable} 0%, ${TOKENS.bgAbyss} 100%)`,
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Ambient Gradient Overlay */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: `
          radial-gradient(ellipse at 50% 30%, ${TOKENS.neonCyan}08 0%, transparent 50%),
          radial-gradient(ellipse at 20% 80%, ${TOKENS.neonPink}05 0%, transparent 40%),
          radial-gradient(ellipse at 80% 80%, ${TOKENS.neonGold}05 0%, transparent 40%)
        `,
                pointerEvents: 'none',
            }} />

            {/* Header */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
                zIndex: 100,
            }}>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: `${TOKENS.neonCyan}20`,
                        border: `1px solid ${TOKENS.neonCyan}40`,
                        borderRadius: 20,
                        padding: '8px 16px',
                        color: TOKENS.neonCyan,
                        fontSize: 12,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                    }}
                >
                    ← Exit
                </motion.button>

                <h1 style={{
                    color: TOKENS.neonCyan,
                    fontSize: 18,
                    fontWeight: 'bold',
                    textShadow: `0 0 20px ${TOKENS.neonCyan}60`,
                    letterSpacing: 2,
                }}>
                    {gameTitle}
                </h1>

                <div style={{ width: 80 }} /> {/* Spacer */}
            </div>

            {/* Table Area */}
            <div style={{
                position: 'absolute',
                top: '12%',
                left: '5%',
                right: '5%',
                bottom: '25%',
            }}>
                {/* Table Felt with Double Rail */}
                <div style={{
                    position: 'absolute',
                    inset: '10%',
                    borderRadius: '50%',
                    background: `radial-gradient(ellipse at center, #0d1117 0%, ${TOKENS.feltDark} 100%)`,
                    border: `12px solid ${TOKENS.goldDark}`,
                    boxShadow: `
            0 0 0 4px #0a0a0a,
            0 0 0 16px ${TOKENS.gold},
            0 0 0 18px #0a0a0a,
            0 0 0 22px ${TOKENS.goldLight},
            0 0 60px rgba(0,0,0,0.5),
            inset 0 0 100px rgba(0,0,0,0.3),
            0 0 100px ${TOKENS.neonCyan}10
          `,
                }}>
                    {/* Center Branding */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        opacity: 0.3,
                    }}>
                        <div style={{ fontSize: 24, color: TOKENS.gold, fontStyle: 'italic' }}>
                            Smarter.Poker
                        </div>
                    </div>
                </div>

                {/* Pot Display */}
                <PotDisplay amount={pot} />

                {/* Community Cards */}
                <CommunityCards cards={communityCards} />

                {/* Player Seats */}
                {players.map((player, i) => (
                    <PlayerSeat
                        key={player.id || i}
                        player={player}
                        position={Object.values(SEAT_LAYOUT)[i]}
                        isActive={activePlayer === player.id}
                        isFolded={player.isFolded}
                        isHero={i === 0}
                        isDealer={dealerPosition === i}
                        cards={i === 0 ? heroCards : []}
                        timerProgress={activePlayer === player.id ? timerProgress : 1}
                    />
                ))}
            </div>

            {/* Action Panel */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '20px',
                background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 100%)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                maxWidth: 500,
                margin: '0 auto',
            }}>
                <ActionButton label="Fold" variant="fold" onClick={onFold} />
                <ActionButton label="Check" variant="check" onClick={onCheck} />
                <ActionButton label="Call" variant="call" onClick={onCall} />
                <ActionButton label="Raise" variant="raise" onClick={onRaise} />
                <motion.div style={{ gridColumn: 'span 2' }}>
                    <ActionButton
                        label="ALL IN"
                        variant="allin"
                        size="large"
                        onClick={onAllIn}
                    />
                </motion.div>
            </div>
        </div>
    );
}
