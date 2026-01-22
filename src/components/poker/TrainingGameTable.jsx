/**
 * 🎮 TRAINING GAME TABLE — Vertical Oval Design
 * 
 * EXACT clone of reference:
 * - VERTICAL (portrait) oval table, taller than wide
 * - Single gold badge per player (name + BB in ONE box)
 * - Large avatars outside table
 * - Header with back button, title, XP/diamonds
 * - Question box at top
 * - Timer bottom-left, question counter bottom-right
 * - 2x2 action buttons at bottom
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS for VERTICAL OVAL (9-max)
// Positions are % of table container
// ═══════════════════════════════════════════════════════════════════════════

const SEATS = [
    // Hero at bottom center
    { id: 'hero', x: 50, y: 88, isHero: true, name: 'Hero' },
    // Villain 1 - bottom left
    { id: 'v1', x: 18, y: 78, name: 'Villain 1' },
    // Villain 2 - left lower
    { id: 'v2', x: 8, y: 58, name: 'Villain 2' },
    // Villain 3 - left upper
    { id: 'v3', x: 10, y: 38, name: 'Villain 3' },
    // Villain 4 - top left
    { id: 'v4', x: 25, y: 18, name: 'Villain 4' },
    // Villain 5 - top right
    { id: 'v5', x: 75, y: 18, name: 'Villain 5' },
    // Villain 6 - right upper
    { id: 'v6', x: 90, y: 38, name: 'Villain 6' },
    // Villain 7 - right lower
    { id: 'v7', x: 92, y: 58, name: 'Villain 7' },
    // Villain 8 - bottom right
    { id: 'v8', x: 82, y: 78, name: 'Villain 8' },
];

// Default stacks
const DEFAULT_STACKS = [45, 32, 28, 55, 41, 38, 62, 29, 51];

// Avatar images
const AVATARS = {
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
    if (!card) return null;

    const rank = card[0];
    const suit = card[1];
    const isRed = suit === 'h' || suit === 'd';
    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };

    return (
        <div style={{
            width: 50,
            height: 70,
            background: 'linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%)',
            border: '1.5px solid #ccc',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '3px 5px',
            boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
            ...style
        }}>
            <div style={{
                fontSize: 18,
                fontWeight: 'bold',
                fontFamily: 'Arial Black, sans-serif',
                color: isRed ? '#cc0000' : '#1a1a2e',
                lineHeight: 1,
            }}>
                {rank === 'T' ? '10' : rank}
            </div>
            <div style={{
                fontSize: 24,
                textAlign: 'center',
                color: isRed ? '#cc0000' : '#1a1a2e',
            }}>
                {suitSymbols[suit]}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT — Single box badge with name + BB
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({ seat, stack, isDealer = false }) {
    const avatarSize = seat.isHero ? 75 : 65;

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
            {/* Avatar */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3 }}
                style={{ width: avatarSize, height: avatarSize * 1.15 }}
            >
                <img
                    src={AVATARS[seat.id]}
                    alt={seat.name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                    }}
                    onError={(e) => { e.target.src = '/avatars/default.png'; }}
                />
            </motion.div>

            {/* SINGLE BADGE — Name + BB in one box */}
            <div style={{
                background: 'linear-gradient(180deg, #f0c040 0%, #c4960a 100%)',
                border: '2px solid #8b6914',
                borderRadius: 5,
                padding: '4px 10px',
                marginTop: -6,
                textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                minWidth: 60,
            }}>
                <div style={{
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: '#000',
                    lineHeight: 1.2,
                }}>
                    {seat.name}
                </div>
                <div style={{
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#1a1a00',
                    lineHeight: 1.2,
                }}>
                    {stack} BB
                </div>
            </div>

            {/* Dealer button */}
            {isDealer && (
                <div style={{
                    position: 'absolute',
                    bottom: seat.isHero ? 55 : 45,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '2px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    zIndex: 200,
                }}>
                    D
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingGameTable({
    heroCards = ['Ah', 'Kh'],
    communityCards = [],
    pot = 0,
    dealerPosition = 0,
    timer = 15,
    questionNumber = 1,
    totalQuestions = 20,
    gameTitle = 'ICM FUNDAMENTALS',
    questionText = 'You Are On The Button (Last To Act). The Player To Your Right Bets 2.5 Big Blinds. What Is Your Best Move?',
    xp = 1250,
    diamonds = 500,
    onFold,
    onCall,
    onRaise,
    onAllIn,
    onBack,
}) {
    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: '#080810',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, sans-serif",
            overflow: 'hidden',
        }}>

            {/* ═══════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                background: '#080810',
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: '#0891b2',
                        border: 'none',
                        borderRadius: 16,
                        padding: '6px 14px',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                    }}
                >
                    ← Back to Training
                </button>

                <div style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: '#22d3ee',
                    letterSpacing: 1,
                }}>
                    {gameTitle}
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 'bold' }}>
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}>💎 {diamonds}</span>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          QUESTION BOX
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{ padding: '0 16px 10px' }}>
                <div style={{
                    background: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.5)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    textAlign: 'center',
                    boxShadow: '0 0 20px rgba(34, 211, 238, 0.15)',
                }}>
                    <p style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: '600',
                        color: '#e0f2fe',
                        lineHeight: 1.4,
                    }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          TABLE AREA (flex-1 to fill remaining space)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                flex: 1,
                position: 'relative',
                padding: '0 10px',
                minHeight: 0,
            }}>
                {/* VERTICAL OVAL TABLE */}
                <div style={{
                    position: 'absolute',
                    top: '8%',
                    left: '15%',
                    right: '15%',
                    bottom: '8%',
                }}>
                    {/* Outer dark frame */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '45% / 50%', // Vertical oval
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
                        boxShadow: `
              0 20px 60px rgba(0,0,0,0.9),
              inset 0 -6px 15px rgba(0,0,0,0.5),
              inset 0 6px 15px rgba(40,40,40,0.2)
            `,
                    }}>
                        {/* Outer gold rail */}
                        <div style={{
                            position: 'absolute',
                            inset: 8,
                            borderRadius: '45% / 50%',
                            background: 'linear-gradient(180deg, #f0d050 0%, #d4a000 30%, #a07800 70%, #705000 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(255,255,180,0.5), inset 0 -2px 4px rgba(0,0,0,0.4)',
                        }}>
                            {/* Black gap */}
                            <div style={{
                                position: 'absolute',
                                inset: 7,
                                borderRadius: '45% / 50%',
                                background: 'linear-gradient(180deg, #151515 0%, #0a0a0a 100%)',
                            }}>
                                {/* Inner gold rail */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 5,
                                    borderRadius: '45% / 50%',
                                    background: 'linear-gradient(180deg, #ffe070 0%, #e8b810 30%, #b08000 70%, #785500 100%)',
                                    boxShadow: 'inset 0 2px 4px rgba(255,255,180,0.5), inset 0 -2px 4px rgba(0,0,0,0.4)',
                                }}>
                                    {/* Dark edge */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 5,
                                        borderRadius: '44% / 49%',
                                        background: '#0a0a0a',
                                    }}>
                                        {/* Inner glow line */}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 3,
                                            borderRadius: '44% / 49%',
                                            border: '2px solid rgba(180,140,50,0.3)',
                                            background: 'transparent',
                                        }}>
                                            {/* Felt */}
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                borderRadius: '44% / 49%',
                                                background: `radial-gradient(
                          ellipse at 50% 40%,
                          #151515 0%,
                          #101010 30%,
                          #0a0a0a 60%,
                          #050505 100%
                        )`,
                                                boxShadow: 'inset 0 0 80px rgba(0,0,0,0.8)',
                                            }}>
                                                {/* POT display */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '22%',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 5,
                                                    background: 'rgba(25,25,25,0.95)',
                                                    borderRadius: 12,
                                                    padding: '4px 10px',
                                                    border: '1px solid #3a3a3a',
                                                }}>
                                                    <div style={{
                                                        width: 14,
                                                        height: 14,
                                                        borderRadius: '50%',
                                                        background: '#333',
                                                        border: '2px solid #555',
                                                    }} />
                                                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                                        POT {pot}
                                                    </span>
                                                </div>

                                                {/* Game title in center */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    textAlign: 'center',
                                                }}>
                                                    <div style={{
                                                        fontSize: 18,
                                                        fontFamily: 'Georgia, serif',
                                                        fontStyle: 'italic',
                                                        color: '#444',
                                                        letterSpacing: 1,
                                                    }}>
                                                        ICM Fundamentals
                                                    </div>
                                                    <div style={{
                                                        fontSize: 12,
                                                        color: '#c4960a',
                                                        marginTop: 4,
                                                    }}>
                                                        Smarter.Poker
                                                    </div>
                                                </div>

                                                {/* Community cards */}
                                                {communityCards.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '35%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        display: 'flex',
                                                        gap: 4,
                                                    }}>
                                                        {communityCards.map((card, i) => (
                                                            <Card key={i} card={card} />
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

                    {/* PLAYER SEATS */}
                    {SEATS.map((seat, i) => (
                        <PlayerSeat
                            key={seat.id}
                            seat={seat}
                            stack={DEFAULT_STACKS[i]}
                            isDealer={dealerPosition === i && seat.isHero}
                        />
                    ))}

                    {/* HERO CARDS */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '18%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        zIndex: 150,
                    }}>
                        {heroCards.map((card, i) => (
                            <motion.div
                                key={i}
                                initial={{ y: 30, opacity: 0, rotate: i === 0 ? -12 : 12 }}
                                animate={{ y: 0, opacity: 1, rotate: i === 0 ? -8 : 8 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                style={{ marginLeft: i > 0 ? -12 : 0 }}
                            >
                                <Card card={card} />
                            </motion.div>
                        ))}
                    </div>

                    {/* DEALER BUTTON */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '28%',
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
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        zIndex: 200,
                    }}>
                        D
                    </div>
                </div>

                {/* TIMER (bottom left) */}
                <div style={{
                    position: 'absolute',
                    left: 16,
                    bottom: 16,
                    width: 50,
                    height: 50,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 15px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* QUESTION COUNTER (bottom right) */}
                <div style={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    background: 'rgba(30,30,40,0.9)',
                    border: '1px solid #444',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: '#f0f0f0',
                    fontSize: 12,
                }}>
                    Question {questionNumber} of {totalQuestions}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
          ACTION BUTTONS (2x2 grid)
          ═══════════════════════════════════════════════════════════════════ */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                padding: '12px 16px',
                background: '#080810',
            }}>
                <button onClick={onFold} style={{
                    background: '#1e40af',
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    Fold
                </button>
                <button onClick={onCall} style={{
                    background: '#1e40af',
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    Call
                </button>
                <button onClick={onRaise} style={{
                    background: '#1e40af',
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    Raise to 8bb
                </button>
                <button onClick={onAllIn} style={{
                    background: '#1e40af',
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    All-In
                </button>
            </div>
        </div>
    );
}
