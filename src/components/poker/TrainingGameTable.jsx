/**
 * 🎮 TRAINING GAME TABLE — 100% GOLDEN TEMPLATE MATCH
 * 
 * CRITICAL: This MUST match the golden reference EXACTLY:
 * - NARROW stadium shape with straight sides
 * - BRIGHT WHITE EDGE GLOW on felt (very visible)
 * - THICK gold rails
 * - HUGE avatars filling space outside table
 */

import React from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — LARGE avatars positioned around narrow stadium
// ═══════════════════════════════════════════════════════════════════════════

const SEATS = [
    { id: 'hero', x: 50, y: 91, isHero: true, name: 'Hero' },
    { id: 'v1', x: 16, y: 76, name: 'Villain 1' },
    { id: 'v2', x: 3, y: 50, name: 'Villain 2' },
    { id: 'v3', x: 14, y: 24, name: 'Villain 3' },
    { id: 'v4', x: 35, y: 6, name: 'Villain 4' },
    { id: 'v5', x: 65, y: 6, name: 'Villain 5' },
    { id: 'v6', x: 86, y: 24, name: 'Villain 6' },
    { id: 'v7', x: 97, y: 50, name: 'Villain 7' },
    { id: 'v8', x: 84, y: 76, name: 'Villain 8' },
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
// CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
};

function Card({ card, style = {} }) {
    if (!card) return null;
    const imagePath = `/cards/${SUIT_MAP[card[1]]}_${RANK_MAP[card[0]] || card[0].toLowerCase()}.png`;
    return (
        <div style={{
            width: 48,
            height: 67,
            background: '#fff',
            borderRadius: 4,
            boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            border: '1px solid #ddd',
            ...style
        }}>
            <img src={imagePath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER SEAT — LARGE Avatar + Gold Badge
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({ seat, stack }) {
    // LARGE avatars as in reference
    const size = seat.isHero ? 80 : 70;

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
                style={{ width: size, height: size * 1.15 }}
            >
                <img
                    src={AVATARS[seat.id]}
                    alt={seat.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/avatars/default.png'; }}
                />
            </motion.div>

            {/* Gold Badge */}
            <div style={{
                background: 'linear-gradient(180deg, #f0c040 0%, #b8860b 100%)',
                border: '2px solid #8b6914',
                borderRadius: 4,
                padding: '2px 10px 4px',
                marginTop: -4,
                textAlign: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                minWidth: 55,
            }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 'bold', color: '#000', lineHeight: 1.2 }}>
                    {seat.name}
                </span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 'bold', color: '#000', lineHeight: 1.1 }}>
                    {stack} BB
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE — 100% GOLDEN TEMPLATE MATCH
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
            background: '#080810',
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
                padding: '6px 10px',
            }}>
                <button onClick={onBack} style={{
                    background: '#0891b2',
                    border: 'none',
                    borderRadius: 14,
                    padding: '4px 10px',
                    color: 'white',
                    fontSize: 9,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    ← Back to Training
                </button>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#22d3ee', letterSpacing: 1 }}>
                    {gameTitle}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, fontWeight: 'bold' }}>
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}>💎 {diamonds}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div style={{ padding: '0 10px 6px' }}>
                <div style={{
                    background: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.6)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    textAlign: 'center',
                }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: '600', color: '#e0f2fe', lineHeight: 1.4 }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* TABLE AREA */}
            <div style={{ flex: 1, position: 'relative', padding: '0 6px', minHeight: 0 }}>

                {/* VERY NARROW container for STADIUM shape */}
                <div style={{
                    position: 'absolute',
                    top: '2%',
                    left: '22%',   /* VERY NARROW = true stadium */
                    right: '22%',
                    bottom: '2%',
                }}>

                    {/* OUTER DARK FRAME */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 9999,
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.9)',
                    }}>

                        {/* OUTER GOLD RAIL — THICK */}
                        <div style={{
                            position: 'absolute',
                            inset: 6,
                            borderRadius: 9999,
                            background: 'linear-gradient(180deg, #f0c040 0%, #d4a000 30%, #8b6914 70%, #6b4f0a 100%)',
                            boxShadow: 'inset 0 3px 6px rgba(255,220,100,0.5)',
                        }}>

                            {/* BLACK GAP */}
                            <div style={{
                                position: 'absolute',
                                inset: 8,
                                borderRadius: 9999,
                                background: '#080808',
                            }}>

                                {/* INNER GOLD RAIL — THICK */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 5,
                                    borderRadius: 9999,
                                    background: 'linear-gradient(180deg, #f0c040 0%, #d4a000 30%, #8b6914 70%, #6b4f0a 100%)',
                                    boxShadow: 'inset 0 2px 4px rgba(255,220,100,0.4)',
                                }}>

                                    {/* DARK EDGE */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 6,
                                        borderRadius: 9999,
                                        background: '#0a0a0a',
                                    }}>

                                        {/* *** WHITE EDGE GLOW *** — BRIGHT and VISIBLE */}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 4,
                                            borderRadius: 9999,
                                            background: 'linear-gradient(180deg, #555 0%, #444 20%, #333 50%, #222 80%, #333 100%)',
                                            boxShadow: 'inset 0 0 25px 8px rgba(255,255,255,0.15)',
                                        }}>

                                            {/* DARK FELT CENTER */}
                                            <div style={{
                                                position: 'absolute',
                                                inset: 8,
                                                borderRadius: 9999,
                                                background: 'radial-gradient(ellipse at 50% 50%, #0a0a0a 0%, #0d0d0d 50%, #151515 100%)',
                                                boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)',
                                            }}>

                                                {/* POT */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '15%',
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
                                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#222', border: '2px solid #444' }} />
                                                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>POT {pot}</span>
                                                </div>

                                                {/* Game Title */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '46%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 14, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#2a2a2a' }}>
                                                        ICM Fundamentals
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#8b6914', marginTop: 2 }}>
                                                        Smarter.Poker
                                                    </div>
                                                </div>

                                                {/* Community Cards */}
                                                {communityCards.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '28%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        display: 'flex',
                                                        gap: 3,
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
                        bottom: '14%',
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
                        bottom: '23%',
                        transform: 'translateX(-50%)',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#fff',
                        border: '2px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
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
                    left: 10,
                    bottom: 10,
                    width: 42,
                    height: 42,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 12px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* QUESTION COUNTER */}
                <div style={{
                    position: 'absolute',
                    right: 10,
                    bottom: 10,
                    background: 'rgba(30,30,40,0.9)',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '5px 8px',
                    color: '#f0f0f0',
                    fontSize: 10,
                }}>
                    Question {questionNumber} of {totalQuestions}
                </div>

            </div>

            {/* ACTION BUTTONS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                padding: '8px 10px',
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
                            borderRadius: 5,
                            padding: '10px',
                            color: 'white',
                            fontSize: 13,
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
