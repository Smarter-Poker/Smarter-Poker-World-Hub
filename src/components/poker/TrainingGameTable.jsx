/**
 * 🎮 TRAINING GAME TABLE — GOLDEN STANDARD
 * 
 * This table follows the MANDATORY design spec:
 * - STADIUM/RACETRACK shape (borderRadius: 9999)
 * - Double gold rails with gradients
 * - WHITE EDGE GLOW on felt fading to dark center
 * - Solid black background
 * - Large avatars outside table perimeter
 */

import React from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — Around the stadium perimeter
// ═══════════════════════════════════════════════════════════════════════════

const SEATS = [
    { id: 'hero', x: 50, y: 92, isHero: true, name: 'Hero' },
    { id: 'v1', x: 18, y: 80, name: 'Villain 1' },
    { id: 'v2', x: 5, y: 55, name: 'Villain 2' },
    { id: 'v3', x: 10, y: 30, name: 'Villain 3' },
    { id: 'v4', x: 28, y: 10, name: 'Villain 4' },
    { id: 'v5', x: 72, y: 10, name: 'Villain 5' },
    { id: 'v6', x: 90, y: 30, name: 'Villain 6' },
    { id: 'v7', x: 95, y: 55, name: 'Villain 7' },
    { id: 'v8', x: 82, y: 80, name: 'Villain 8' },
];

const DEFAULT_STACKS = [45, 32, 28, 55, 41, 38, 62, 29, 51];

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
// CARD COMPONENT — Optimized 150x210 PNGs
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
};

function Card({ card, style = {} }) {
    if (!card) return null;
    const suitName = SUIT_MAP[card[1]];
    const rankName = RANK_MAP[card[0]] || card[0].toLowerCase();
    const imagePath = `/cards/${suitName}_${rankName}.png`;

    return (
        <div style={{
            width: 50,
            height: 70,
            background: '#fff',
            borderRadius: 4,
            boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            border: '1px solid #ddd',
            ...style
        }}>
            <img
                src={imagePath}
                alt={card}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                }}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT — Avatar + Single Gold Badge
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({ seat, stack }) {
    const size = seat.isHero ? 70 : 58;

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
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{ width: size, height: size * 1.1 }}
            >
                <img
                    src={AVATARS[seat.id]}
                    alt={seat.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/avatars/default.png'; }}
                />
            </motion.div>

            {/* Single Gold Badge */}
            <div style={{
                background: 'linear-gradient(180deg, #f0c040 0%, #c49808 100%)',
                border: '2px solid #8b6914',
                borderRadius: 4,
                padding: '2px 8px 3px',
                marginTop: -4,
                textAlign: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                minWidth: 50,
            }}>
                <span style={{ display: 'block', fontSize: 9, fontWeight: 'bold', color: '#000', lineHeight: 1.2 }}>
                    {seat.name}
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 'bold', color: '#000', lineHeight: 1.1 }}>
                    {stack} BB
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE — GOLDEN STANDARD DESIGN
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingGameTable({
    heroCards = ['Ah', 'Kh'],
    communityCards = [],
    pot = 0,
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
            background: '#080810', // SOLID BLACK background
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'Inter', -apple-system, sans-serif",
            overflow: 'hidden',
        }}>

            {/* HEADER */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
            }}>
                <button onClick={onBack} style={{
                    background: '#0891b2',
                    border: 'none',
                    borderRadius: 14,
                    padding: '5px 12px',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    ← Back to Training
                </button>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#22d3ee', letterSpacing: 1 }}>
                    {gameTitle}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 'bold' }}>
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}>💎 {diamonds}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div style={{ padding: '0 12px 8px' }}>
                <div style={{
                    background: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.5)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    textAlign: 'center',
                    boxShadow: '0 0 15px rgba(34, 211, 238, 0.15)',
                }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: '600', color: '#e0f2fe', lineHeight: 1.4 }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* TABLE AREA */}
            <div style={{ flex: 1, position: 'relative', padding: '0 8px', minHeight: 0 }}>

                {/* Table container - NARROW to create STADIUM shape */}
                <div style={{
                    position: 'absolute',
                    top: '3%',
                    left: '18%',   /* More margin = narrower = stadium shape */
                    right: '18%',
                    bottom: '3%',
                }}>

                    {/* OUTER DARK FRAME */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 9999, // STADIUM shape
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
                        boxShadow: '0 15px 50px rgba(0,0,0,0.9), inset 0 -4px 10px rgba(0,0,0,0.5)',
                    }}>

                        {/* OUTER GOLD RAIL */}
                        <div style={{
                            position: 'absolute',
                            inset: 8,
                            borderRadius: 9999,
                            background: 'linear-gradient(180deg, #d4a000 0%, #a07800 50%, #6b4f0a 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(255,220,100,0.5)',
                        }}>

                            {/* BLACK GAP */}
                            <div style={{
                                position: 'absolute',
                                inset: 6,
                                borderRadius: 9999,
                                background: '#0a0a0a',
                            }}>

                                {/* INNER GOLD RAIL */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 4,
                                    borderRadius: 9999,
                                    background: 'linear-gradient(180deg, #d4a000 0%, #a07800 50%, #6b4f0a 100%)',
                                    boxShadow: 'inset 0 2px 3px rgba(255,220,100,0.4)',
                                }}>

                                    {/* DARK EDGE */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 5,
                                        borderRadius: 9999,
                                        background: '#080808',
                                    }}>

                                        {/* THIN INNER GOLD LINE */}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 3,
                                            borderRadius: 9999,
                                            border: '1px solid rgba(180,140,50,0.3)',
                                            background: 'transparent',
                                        }}>

                                            {/* FELT SURFACE — WHITE EDGE GLOW */}
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                borderRadius: 9999,
                                                background: `radial-gradient(
                          ellipse at 50% 50%,
                          #080808 0%,
                          #0c0c0c 25%,
                          #101010 40%,
                          #1a1a1a 60%,
                          #2a2a2a 75%,
                          #3a3a3a 90%,
                          #252525 100%
                        )`,
                                                boxShadow: 'inset 0 0 80px 25px rgba(255,255,255,0.06)',
                                            }}>

                                                {/* POT */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '18%',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    background: 'rgba(15,15,15,0.95)',
                                                    borderRadius: 10,
                                                    padding: '3px 8px',
                                                    border: '1px solid #333',
                                                }}>
                                                    <div style={{
                                                        width: 12,
                                                        height: 12,
                                                        borderRadius: '50%',
                                                        background: '#222',
                                                        border: '2px solid #444',
                                                    }} />
                                                    <span style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>POT {pot}</span>
                                                </div>

                                                {/* Game Title */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '48%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    textAlign: 'center',
                                                }}>
                                                    <div style={{
                                                        fontSize: 16,
                                                        fontFamily: 'Georgia, serif',
                                                        fontStyle: 'italic',
                                                        color: '#3a3a3a',
                                                    }}>
                                                        ICM Fundamentals
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#c4960a', marginTop: 3 }}>
                                                        Smarter.Poker
                                                    </div>
                                                </div>

                                                {/* Community Cards */}
                                                {communityCards.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '32%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        display: 'flex',
                                                        gap: 4,
                                                    }}>
                                                        {communityCards.map((card, i) => <Card key={i} card={card} />)}
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
                        <PlayerSeat key={seat.id} seat={seat} stack={DEFAULT_STACKS[i]} />
                    ))}

                    {/* HERO CARDS */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '15%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        zIndex: 150,
                    }}>
                        {heroCards.map((card, i) => (
                            <motion.div
                                key={i}
                                initial={{ y: 20, opacity: 0, rotate: i === 0 ? -10 : 10 }}
                                animate={{ y: 0, opacity: 1, rotate: i === 0 ? -6 : 6 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                style={{ marginLeft: i > 0 ? -10 : 0 }}
                            >
                                <Card card={card} />
                            </motion.div>
                        ))}
                    </div>

                    {/* DEALER BUTTON */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '25%',
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
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                        zIndex: 200,
                    }}>
                        D
                    </div>

                </div>

                {/* TIMER */}
                <div style={{
                    position: 'absolute',
                    left: 12,
                    bottom: 12,
                    width: 45,
                    height: 45,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 12px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* QUESTION COUNTER */}
                <div style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    background: 'rgba(30,30,40,0.9)',
                    border: '1px solid #444',
                    borderRadius: 5,
                    padding: '6px 10px',
                    color: '#f0f0f0',
                    fontSize: 11,
                }}>
                    Question {questionNumber} of {totalQuestions}
                </div>

            </div>

            {/* ACTION BUTTONS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                padding: '10px 12px',
            }}>
                {[
                    { label: 'Fold', onClick: onFold },
                    { label: 'Call', onClick: onCall },
                    { label: 'Raise to 8bb', onClick: onRaise },
                    { label: 'All-In', onClick: onAllIn },
                ].map((btn) => (
                    <button
                        key={btn.label}
                        onClick={btn.onClick}
                        style={{
                            background: '#1e40af',
                            border: 'none',
                            borderRadius: 6,
                            padding: '12px',
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                        }}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

        </div>
    );
}
