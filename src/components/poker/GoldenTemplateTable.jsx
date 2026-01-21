/**
 * 🎮 GOLDEN TEMPLATE POKER TABLE
 * 
 * EXACT clone of the reference design:
 * - Large illustrated avatars extending outside table
 * - Racetrack table shape with double gold rail
 * - Gold name badges below avatars
 * - Very dark felt
 * - Cards at hero position
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// EXACT SEAT POSITIONS (matching reference image)
// Positions are % of container, avatars extend OUTSIDE the table
// ═══════════════════════════════════════════════════════════════════════════

const SEATS = [
    // Hero at bottom center
    { id: 'hero', x: 50, y: 92, isHero: true },
    // Villain 1 - bottom left (Viking)
    { id: 'v1', x: 14, y: 78, label: 'Villain 1' },
    // Villain 2 - left mid-lower (Wizard)
    { id: 'v2', x: 6, y: 52, label: 'Villain 2' },
    // Villain 3 - left mid-upper (Ninja)
    { id: 'v3', x: 8, y: 28, label: 'Villain 3' },
    // Villain 4 - top left (Wolf)
    { id: 'v4', x: 28, y: 6, label: 'Villain 4' },
    // Villain 5 - top right (Spartan)
    { id: 'v5', x: 72, y: 6, label: 'Villain 5' },
    // Villain 6 - right mid-upper (Pharaoh)
    { id: 'v6', x: 92, y: 28, label: 'Villain 6' },
    // Villain 7 - right mid-lower (Cowboy)
    { id: 'v7', x: 94, y: 52, label: 'Villain 7' },
    // Villain 8 - bottom right (Pirate)
    { id: 'v8', x: 86, y: 78, label: 'Villain 8' },
];

// Avatar images (large illustrated characters)
const AVATAR_IMAGES = {
    hero: '/avatars/table/free_fox.png',
    v1: '/avatars/table/vip_viking_warrior.png',
    v2: '/avatars/table/free_wizard.png',
    v3: '/avatars/table/free_ninja.png',
    v4: '/avatars/table/vip_wolf.png',
    v5: '/avatars/table/vip_spartan.png',
    v6: '/avatars/table/vip_pharaoh.png',
    v7: '/avatars/table/free_cowboy.png',
    v8: '/avatars/table/free_pirate.png',
};

// ═══════════════════════════════════════════════════════════════════════════
// CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Card({ card, style = {} }) {
    if (!card) {
        // Card back
        return (
            <div style={{
                width: 60,
                height: 85,
                background: 'linear-gradient(135deg, #1a1a2e 0%, #0d0d15 100%)',
                border: '2px solid #333',
                borderRadius: 8,
                ...style
            }} />
        );
    }

    const rank = card[0];
    const suit = card[1];
    const isRed = suit === 'h' || suit === 'd';
    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };

    return (
        <div style={{
            width: 65,
            height: 92,
            background: 'linear-gradient(145deg, #ffffff 0%, #f5f5f5 100%)',
            border: '2px solid #ddd',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '4px 6px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            ...style
        }}>
            <div style={{
                fontSize: 24,
                fontWeight: 'bold',
                fontFamily: 'Arial Black, sans-serif',
                color: isRed ? '#cc0000' : '#1a1a2e',
                lineHeight: 1,
            }}>
                {rank === 'T' ? '10' : rank}
            </div>
            <div style={{
                fontSize: 32,
                textAlign: 'center',
                color: isRed ? '#cc0000' : '#1a1a2e',
            }}>
                {suitSymbols[suit]}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER AVATAR WITH BADGE (matching reference EXACTLY)
// ═══════════════════════════════════════════════════════════════════════════

function PlayerAvatar({ seat, player, isDealer = false }) {
    const avatarSize = seat.isHero ? 100 : 85;

    return (
        <div style={{
            position: 'absolute',
            left: `${seat.x}%`,
            top: `${seat.y}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: seat.isHero ? 100 : 50,
        }}>
            {/* Large illustrated avatar */}
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                style={{
                    width: avatarSize,
                    height: avatarSize * 1.2,
                    position: 'relative',
                }}
            >
                <img
                    src={AVATAR_IMAGES[seat.id] || '/avatars/default.png'}
                    alt={player.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        filter: player.isFolded ? 'grayscale(100%) brightness(0.5)' : 'none',
                    }}
                    onError={(e) => {
                        e.target.src = '/avatars/default.png';
                    }}
                />
            </motion.div>

            {/* Gold name badge (below avatar) */}
            <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{
                    background: 'linear-gradient(180deg, #f0c040 0%, #c4960a 100%)',
                    border: '2px solid #8b6914',
                    borderRadius: 6,
                    padding: '3px 12px',
                    marginTop: -8,
                    minWidth: 70,
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
            >
                <div style={{
                    fontSize: 11,
                    fontWeight: 'bold',
                    color: '#000',
                    textShadow: '0 1px 0 rgba(255,255,255,0.3)',
                    whiteSpace: 'nowrap',
                }}>
                    {player.name}
                </div>
                <div style={{
                    fontSize: 13,
                    fontWeight: 'bold',
                    color: '#1a1a00',
                }}>
                    {player.stack} BB
                </div>
            </motion.div>

            {/* Dealer button */}
            {isDealer && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                        position: 'absolute',
                        bottom: seat.isHero ? 50 : 40,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#ffffff',
                        border: '2px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: '#000',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        zIndex: 200,
                    }}
                >
                    D
                </motion.div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE COMPONENT (EXACT REFERENCE MATCH)
// ═══════════════════════════════════════════════════════════════════════════

export default function GoldenTemplateTable({
    players = [],
    heroCards = ['Ah', 'Kh'],
    communityCards = [],
    pot = 0,
    dealerPosition = 0,
    timer = 15,
    questionNumber = 1,
    totalQuestions = 20,
    gameTitle = 'ICM Fundamentals',
    onFold,
    onCheck,
    onCall,
    onRaise,
    onAllIn,
}) {
    // Default players if not provided
    const defaultPlayers = SEATS.map((seat, i) => ({
        id: seat.id,
        name: seat.isHero ? 'HERO' : seat.label,
        stack: [45, 32, 28, 55, 41, 38, 62, 29, 51][i],
        isFolded: false,
    }));

    const gamePlayers = players.length > 0 ? players : defaultPlayers;

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: '#080810',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>

            {/* ═══════════════════════════════════════════════════════════════════
          TABLE CONTAINER (centered, maintains aspect ratio)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'absolute',
                top: '5%',
                left: '5%',
                right: '5%',
                bottom: '20%',
            }}>

                {/* ═══════════════════════════════════════════════════════════════════
            RACETRACK TABLE with 3D DEPTH and layered gold rails
            ═══════════════════════════════════════════════════════════════════ */}

                {/* OUTER DARK FRAME - 3D raised effect */}
                <div style={{
                    position: 'absolute',
                    top: '12%',
                    left: '8%',
                    right: '8%',
                    bottom: '12%',
                    borderRadius: '50% / 38%',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
                    boxShadow: `
                        0 25px 80px rgba(0,0,0,0.95),
                        0 8px 30px rgba(0,0,0,0.8),
                        inset 0 -8px 20px rgba(0,0,0,0.6),
                        inset 0 8px 20px rgba(50,50,50,0.2)
                    `,
                }}>
                    {/* OUTER GOLD RAIL - gradient for 3D */}
                    <div style={{
                        position: 'absolute',
                        inset: 12,
                        borderRadius: '50% / 37%',
                        background: 'linear-gradient(180deg, #f0d050 0%, #d4a000 25%, #a07800 60%, #705000 100%)',
                        boxShadow: `
                            inset 0 3px 6px rgba(255,255,180,0.5),
                            inset 0 -3px 6px rgba(0,0,0,0.5)
                        `,
                    }}>
                        {/* BLACK GAP */}
                        <div style={{
                            position: 'absolute',
                            inset: 10,
                            borderRadius: '50% / 36%',
                            background: 'linear-gradient(180deg, #151515 0%, #0a0a0a 100%)',
                        }}>
                            {/* INNER GOLD RAIL */}
                            <div style={{
                                position: 'absolute',
                                inset: 8,
                                borderRadius: '50% / 35%',
                                background: 'linear-gradient(180deg, #ffe070 0%, #e8b810 25%, #b08000 60%, #785500 100%)',
                                boxShadow: `
                                    inset 0 3px 6px rgba(255,255,180,0.6),
                                    inset 0 -3px 6px rgba(0,0,0,0.5)
                                `,
                            }}>
                                {/* THIN DARK EDGE */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 6,
                                    borderRadius: '50% / 34%',
                                    background: 'linear-gradient(180deg, #101010 0%, #080808 100%)',
                                }}>
                                    {/* INNER GLOW LINE */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 4,
                                        borderRadius: '50% / 33%',
                                        border: '3px solid',
                                        borderColor: 'rgba(180,140,50,0.35)',
                                        background: 'transparent',
                                    }}>
                                        {/* FELT with radial gradient depth */}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 0,
                                            borderRadius: '50% / 33%',
                                            background: `radial-gradient(
                                                ellipse at 50% 35%,
                                                #181818 0%,
                                                #121212 25%,
                                                #0d0d0d 50%,
                                                #080808 75%,
                                                #050505 100%
                                            )`,
                                            boxShadow: `
                                                inset 0 0 120px rgba(0,0,0,0.9),
                                                inset 0 0 60px rgba(0,0,0,0.7),
                                                inset 0 -20px 40px rgba(0,0,0,0.5)
                                            `,
                                        }}>
                                            {/* POT display (center top of table) */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '18%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                background: 'rgba(25,25,25,0.95)',
                                                borderRadius: 14,
                                                padding: '5px 12px',
                                                border: '1px solid #3a3a3a',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                                            }}>
                                                <div style={{
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: '50%',
                                                    background: 'linear-gradient(180deg, #444 0%, #222 100%)',
                                                    border: '2px solid #555',
                                                    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
                                                }} />
                                                <span style={{
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 'bold',
                                                    letterSpacing: 0.5,
                                                }}>
                                                    POT {pot}
                                                </span>
                                            </div>

                                            {/* Game title (center of table) */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                textAlign: 'center',
                                            }}>
                                                <div style={{
                                                    fontSize: 24,
                                                    fontFamily: 'Georgia, serif',
                                                    fontStyle: 'italic',
                                                    color: '#4a4a4a',
                                                    letterSpacing: 2,
                                                    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                }}>
                                                    {gameTitle}
                                                </div>
                                                <div style={{
                                                    fontSize: 14,
                                                    color: '#c4960a',
                                                    marginTop: 6,
                                                    textShadow: '0 0 10px rgba(196,150,10,0.3)',
                                                }}>
                                                    Smarter.Poker
                                                </div>
                                            </div>

                                            {/* Community cards (center, below title) */}
                                            {communityCards.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '68%',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    display: 'flex',
                                                    gap: 6,
                                                }}>
                                                    {communityCards.map((card, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ scale: 0, rotateY: 180 }}
                                                            animate={{ scale: 1, rotateY: 0 }}
                                                            transition={{ delay: i * 0.1 }}
                                                        >
                                                            <Card card={card} />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
            PLAYER AVATARS (positioned around outside of table)
            ═══════════════════════════════════════════════════════════════════ */}
                {SEATS.map((seat, i) => (
                    <PlayerAvatar
                        key={seat.id}
                        seat={seat}
                        player={gamePlayers[i] || { name: seat.label, stack: 0 }}
                        isDealer={dealerPosition === i && seat.isHero}
                    />
                ))}

                {/* Hero cards (above hero avatar) */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '18%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: -8,
                    zIndex: 150,
                }}>
                    {heroCards.map((card, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: 50, opacity: 0, rotate: i === 0 ? -15 : 15 }}
                            animate={{ y: 0, opacity: 1, rotate: i === 0 ? -8 : 8 }}
                            transition={{ delay: 0.3 + i * 0.1 }}
                            style={{
                                marginLeft: i > 0 ? -15 : 0,
                            }}
                        >
                            <Card card={card} />
                        </motion.div>
                    ))}
                </div>

                {/* Dealer button for hero */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '30%',
                        transform: 'translateX(-50%)',
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: '#ffffff',
                        border: '2px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: '#000',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        zIndex: 200,
                    }}
                >
                    D
                </motion.div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          TIMER (bottom left, red square)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'absolute',
                left: 20,
                bottom: 20,
                width: 60,
                height: 60,
                background: timer > 5 ? '#dc2626' : '#ff0000',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                fontWeight: 'bold',
                color: 'white',
                boxShadow: timer <= 5 ? '0 0 20px #ff0000' : 'none',
                animation: timer <= 5 ? 'pulse 0.5s infinite' : 'none',
            }}>
                {timer}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          QUESTION COUNTER (bottom right)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'absolute',
                right: 20,
                bottom: 20,
                background: 'rgba(30,30,40,0.9)',
                border: '1px solid #444',
                borderRadius: 8,
                padding: '10px 16px',
                color: '#f0f0f0',
                fontSize: 14,
            }}>
                Question {questionNumber} of {totalQuestions}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          ACTION BUTTONS (bottom, full width)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                position: 'absolute',
                bottom: 100,
                left: 100,
                right: 100,
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
            }}>
                {[
                    { label: 'Fold', onClick: onFold, bg: '#1e3a5f' },
                    { label: 'Check', onClick: onCheck, bg: '#1e3a5f' },
                    { label: 'Call', onClick: onCall, bg: '#1e4d2e' },
                    { label: 'Raise', onClick: onRaise, bg: '#4d1e2e' },
                ].map((btn) => (
                    <motion.button
                        key={btn.label}
                        onClick={btn.onClick}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        style={{
                            background: btn.bg,
                            border: 'none',
                            borderRadius: 10,
                            padding: '14px 20px',
                            color: 'white',
                            fontSize: 16,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        }}
                    >
                        {btn.label}
                    </motion.button>
                ))}
            </div>

            {/* ALL IN button (full width below) */}
            <motion.button
                onClick={onAllIn}
                whileHover={{ scale: 1.01, y: -2 }}
                whileTap={{ scale: 0.99 }}
                style={{
                    position: 'absolute',
                    bottom: 100,
                    left: 100,
                    right: 100,
                    marginTop: 60,
                    transform: 'translateY(60px)',
                    background: 'linear-gradient(135deg, #8b0000 0%, #4d0000 100%)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '16px 20px',
                    color: 'white',
                    fontSize: 18,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(139,0,0,0.4)',
                }}
            >
                ALL IN
            </motion.button>

            <style jsx global>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
        </div>
    );
}
