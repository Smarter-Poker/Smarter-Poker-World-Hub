/**
 * 🎮 TRAINING GAME TABLE — EXACT GOLDEN TEMPLATE CLONE
 * 
 * MANDATORY SPECS (NO DEVIATION ALLOWED):
 * - VERY NARROW stadium (left: 25%, right: 25%)
 * - BRIGHT WHITE EDGE GLOW (visible, wide, #ccc to #888)
 * - BRIGHT GOLD rails (#FFD700, #FFA500)
 * - MASSIVE avatars (90-100px) positioned ON the rail edge
 */

import React from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — MASSIVE avatars ON the table edge
// ═══════════════════════════════════════════════════════════════════════════

const SEATS = [
    { id: 'hero', x: 50, y: 90, isHero: true, name: 'Hero' },
    { id: 'v1', x: 22, y: 75, name: 'Villain 1' },
    { id: 'v2', x: 8, y: 48, name: 'Villain 2' },
    { id: 'v3', x: 20, y: 22, name: 'Villain 3' },
    { id: 'v4', x: 38, y: 6, name: 'Villain 4' },
    { id: 'v5', x: 62, y: 6, name: 'Villain 5' },
    { id: 'v6', x: 80, y: 22, name: 'Villain 6' },
    { id: 'v7', x: 92, y: 48, name: 'Villain 7' },
    { id: 'v8', x: 78, y: 75, name: 'Villain 8' },
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
            width: 46,
            height: 64,
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
// PLAYER SEAT — MASSIVE Avatar + Gold Badge
// ═══════════════════════════════════════════════════════════════════════════

function PlayerSeat({ seat, stack }) {
    // MASSIVE avatars as in reference
    const size = seat.isHero ? 85 : 75;

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

            {/* Bright Gold Badge */}
            <div style={{
                background: 'linear-gradient(180deg, #FFD700 0%, #FFA500 50%, #CC8800 100%)',
                border: '2px solid #996600',
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
// MAIN TABLE — EXACT GOLDEN TEMPLATE CLONE
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
                padding: '5px 8px',
            }}>
                <button onClick={onBack} style={{
                    background: '#0891b2',
                    border: 'none',
                    borderRadius: 12,
                    padding: '4px 8px',
                    color: 'white',
                    fontSize: 8,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                }}>
                    ← Back to Training
                </button>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#22d3ee', letterSpacing: 1 }}>
                    {gameTitle}
                </div>
                <div style={{ display: 'flex', gap: 6, fontSize: 8, fontWeight: 'bold' }}>
                    <span style={{ color: '#22d3ee' }}>⚡ {xp.toLocaleString()} XP</span>
                    <span style={{ color: '#ef4444' }}><img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> {diamonds}</span>
                </div>
            </div>

            {/* QUESTION BOX */}
            <div style={{ padding: '0 8px 5px' }}>
                <div style={{
                    background: '#0f172a',
                    border: '2px solid rgba(34, 211, 238, 0.6)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    textAlign: 'center',
                }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: '600', color: '#e0f2fe', lineHeight: 1.3 }}>
                        {questionText}
                    </p>
                </div>
            </div>

            {/* TABLE AREA — 100% GOLDEN TEMPLATE CLONE */}
            <div style={{ flex: 1, position: 'relative', padding: '0 4px', minHeight: 0 }}>

                {/* SUPER NARROW for true vertical stadium - MATCHING GOLDEN REFERENCE */}
                <div style={{
                    position: 'absolute',
                    top: '0%',
                    left: '30%',   /* EXTREMELY NARROW to match reference */
                    right: '30%',
                    bottom: '0%',
                }}>

                    {/* LAYER 1: OUTER DARK MATTE PADDED RAIL (thick dark frame) */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 9999,
                        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 30%, #0d0d0d 70%, #1a1a1a 100%)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.95), inset 0 2px 4px rgba(255,255,255,0.05)',
                    }}>

                        {/* LAYER 2: OUTER GOLD ACCENT LINE - Bright metallic gold */}
                        <div style={{
                            position: 'absolute',
                            inset: 12,
                            borderRadius: 9999,
                            background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #996600 80%, #FFD700 95%, #FFE066 100%)',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,200,0.8), inset 0 -1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,200,0,0.3)',
                        }}>

                            {/* LAYER 3: INNER DARK PADDED SECTION */}
                            <div style={{
                                position: 'absolute',
                                inset: 6,
                                borderRadius: 9999,
                                background: 'linear-gradient(180deg, #262626 0%, #1a1a1a 30%, #0f0f0f 70%, #1a1a1a 100%)',
                                boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.6)',
                            }}>

                                {/* LAYER 4: INNER GOLD ACCENT LINE - Second gold ring */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 10,
                                    borderRadius: 9999,
                                    background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #996600 80%, #FFD700 95%, #FFE066 100%)',
                                    boxShadow: 'inset 0 1px 2px rgba(255,255,200,0.7), inset 0 -1px 2px rgba(0,0,0,0.3), 0 0 6px rgba(255,200,0,0.25)',
                                }}>

                                    {/* LAYER 5: FINAL DARK FRAME before felt */}
                                    <div style={{
                                        position: 'absolute',
                                        inset: 5,
                                        borderRadius: 9999,
                                        background: 'linear-gradient(180deg, #222 0%, #111 50%, #1a1a1a 100%)',
                                        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.7)',
                                    }}>

                                        {/* LAYER 6: DARK FELT SURFACE */}
                                        <div style={{
                                            position: 'absolute',
                                            inset: 4,
                                            borderRadius: 9999,
                                            background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0f0f0f 30%, #080808 60%, #050505 100%)',
                                            boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)',
                                        }}>

                                            {/* POT */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '12%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                background: 'rgba(15,15,15,0.95)',
                                                borderRadius: 8,
                                                padding: '2px 6px',
                                                border: '1px solid #333',
                                            }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#222', border: '1px solid #444' }} />
                                                <span style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>POT {pot}</span>
                                            </div>

                                            {/* Game Title */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '45%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                textAlign: 'center',
                                            }}>
                                                <div style={{ fontSize: 12, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#222' }}>
                                                    ICM Fundamentals
                                                </div>
                                                <div style={{ fontSize: 9, color: '#8b6914', marginTop: 2 }}>
                                                    Smarter.Poker
                                                </div>
                                            </div>

                                            {/* Community Cards */}
                                            {communityCards.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '25%',
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
                            style={{ marginLeft: i > 0 ? -8 : 0 }}
                        >
                            <Card card={card} />
                        </motion.div>
                    ))}
                </div>

                {/* DEALER BUTTON */}
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '24%',
                    transform: 'translateX(-50%)',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '2px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 'bold',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                    zIndex: 200,
                }}>
                    D
                </div>

                {/* TIMER */}
                <div style={{
                    position: 'absolute',
                    left: 8,
                    bottom: 8,
                    width: 38,
                    height: 38,
                    background: timer > 5 ? '#dc2626' : '#ff0000',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 'bold',
                    color: 'white',
                    boxShadow: timer <= 5 ? '0 0 10px #ff0000' : 'none',
                }}>
                    {timer}
                </div>

                {/* QUESTION COUNTER */}
                <div style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    background: 'rgba(30,30,40,0.9)',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '4px 6px',
                    color: '#f0f0f0',
                    fontSize: 9,
                }}>
                    Question {questionNumber} of {totalQuestions}
                </div>

            </div>

            {/* ACTION BUTTONS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 5,
                padding: '6px 8px',
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
                            borderRadius: 4,
                            padding: '9px',
                            color: 'white',
                            fontSize: 12,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                        }}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

        </div >
    );
}
