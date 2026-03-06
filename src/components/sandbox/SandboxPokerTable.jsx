/**
 * SandboxPokerTable — Golden Template table adapted for the Virtual Sandbox
 * Uses the same card PNGs and visual language as TrainingGameTable
 */
import React from 'react';
import { motion } from 'framer-motion';

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
};

const SEAT_POSITIONS = {
    2: [
        { id: 'hero', x: 50, y: 88, isHero: true },
        { id: 'v1', x: 50, y: 8 },
    ],
    3: [
        { id: 'hero', x: 50, y: 88, isHero: true },
        { id: 'v1', x: 15, y: 30 },
        { id: 'v2', x: 85, y: 30 },
    ],
    6: [
        { id: 'hero', x: 50, y: 88, isHero: true },
        { id: 'v1', x: 15, y: 65 },
        { id: 'v2', x: 8, y: 30 },
        { id: 'v3', x: 35, y: 8 },
        { id: 'v4', x: 65, y: 8 },
        { id: 'v5', x: 85, y: 35 },
    ],
    9: [
        { id: 'hero', x: 50, y: 88, isHero: true },
        { id: 'v1', x: 22, y: 75 },
        { id: 'v2', x: 8, y: 48 },
        { id: 'v3', x: 20, y: 22 },
        { id: 'v4', x: 38, y: 6 },
        { id: 'v5', x: 62, y: 6 },
        { id: 'v6', x: 80, y: 22 },
        { id: 'v7', x: 92, y: 48 },
        { id: 'v8', x: 78, y: 75 },
    ],
};

const AVATARS = [
    '/avatars/table/free_fox.png',
    '/avatars/table/vip_viking_warrior.png',
    '/avatars/table/free_wizard.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/vip_wolf.png',
    '/avatars/table/vip_spartan.png',
    '/avatars/table/vip_pharaoh.png',
    '/avatars/table/free_cowboy.png',
    '/avatars/table/free_pirate.png',
];

export function TableCard({ card, style = {} }) {
    if (!card) return null;
    const r = card[0];
    const s = card[1];
    const imagePath = `/cards/${SUIT_MAP[s]}_${RANK_MAP[r] || r.toLowerCase()}.png`;
    return (
        <div style={{
            width: 46, height: 64, background: '#fff', borderRadius: 4,
            boxShadow: '0 3px 10px rgba(0,0,0,0.5)', overflow: 'hidden',
            border: '1px solid #ddd', ...style,
        }}>
            <img src={imagePath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
    );
}

function SeatBadge({ label, stack, isHero, position }) {
    return (
        <div style={{
            background: isHero
                ? 'linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)'
                : 'linear-gradient(180deg, #FFD700 0%, #FFA500 50%, #CC8800 100%)',
            border: `2px solid ${isHero ? '#1e40af' : '#996600'}`,
            borderRadius: 4, padding: '2px 8px 3px', textAlign: 'center',
            boxShadow: '0 2px 5px rgba(0,0,0,0.4)', minWidth: 50,
        }}>
            <span style={{ display: 'block', fontSize: 9, fontWeight: 'bold', color: isHero ? '#fff' : '#000', lineHeight: 1.2 }}>
                {position || label}
            </span>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 'bold', color: isHero ? '#e0f2fe' : '#000', lineHeight: 1.1 }}>
                {stack} BB
            </span>
        </div>
    );
}

export default function SandboxPokerTable({
    heroCards = [],
    communityCards = [],
    pot = 0,
    heroPosition = 'BTN',
    heroStack = 100,
    villains = [],
    street = 'flop',
    boardTexture,
}) {
    const totalPlayers = 1 + villains.length;
    const seatKey = totalPlayers <= 2 ? 2 : totalPlayers <= 3 ? 3 : totalPlayers <= 6 ? 6 : 9;
    const seats = SEAT_POSITIONS[seatKey] || SEAT_POSITIONS[6];

    return (
        <div style={{
            position: 'relative', width: '100%', paddingBottom: '65%',
            background: '#080810', borderRadius: '16px', overflow: 'hidden',
        }}>
            <div style={{ position: 'absolute', inset: 0 }}>
                {/* Table felt */}
                <div style={{
                    position: 'absolute', top: '5%', left: '15%', right: '15%', bottom: '5%',
                }}>
                    {/* Outer rail */}
                    <div style={{
                        position: 'absolute', inset: 0, borderRadius: 9999,
                        background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 30%, #0d0d0d 70%, #1a1a1a 100%)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.95)',
                    }}>
                        {/* Gold ring */}
                        <div style={{
                            position: 'absolute', inset: 10, borderRadius: 9999,
                            background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #996600 80%, #FFD700 95%)',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,200,0.8), 0 0 8px rgba(255,200,0,0.3)',
                        }}>
                            {/* Inner dark */}
                            <div style={{
                                position: 'absolute', inset: 5, borderRadius: 9999,
                                background: 'linear-gradient(180deg, #222 0%, #111 50%, #1a1a1a 100%)',
                            }}>
                                {/* Second gold */}
                                <div style={{
                                    position: 'absolute', inset: 8, borderRadius: 9999,
                                    background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #FFD700 95%)',
                                }}>
                                    {/* Felt */}
                                    <div style={{
                                        position: 'absolute', inset: 4, borderRadius: 9999,
                                        background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0f0f0f 30%, #080808 60%, #050505 100%)',
                                        boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)',
                                    }}>
                                        {/* Pot */}
                                        <div style={{
                                            position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            background: 'rgba(15,15,15,0.95)', borderRadius: 8,
                                            padding: '3px 10px', border: '1px solid #333',
                                        }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#222', border: '1px solid #444' }} />
                                            <span style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>POT {pot.toFixed(1)} BB</span>
                                        </div>

                                        {/* Board Texture Badge */}
                                        {boardTexture && (
                                            <div style={{
                                                position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
                                                padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700,
                                                background: boardTexture.color || 'rgba(59,130,246,0.2)',
                                                color: boardTexture.textColor || '#93c5fd',
                                                border: `1px solid ${boardTexture.textColor || '#3b82f6'}44`,
                                            }}>
                                                {boardTexture.label}
                                            </div>
                                        )}

                                        {/* Community Cards */}
                                        {communityCards.length > 0 && (
                                            <div style={{
                                                position: 'absolute', top: '35%', left: '50%', transform: 'translateX(-50%)',
                                                display: 'flex', gap: 4,
                                            }}>
                                                {communityCards.map((card, i) => (
                                                    <motion.div key={i} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}>
                                                        <TableCard card={card} />
                                                    </motion.div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Street Label */}
                                        <div style={{
                                            position: 'absolute', top: '60%', left: '50%', transform: 'translateX(-50%)',
                                            fontSize: 10, color: '#333', fontStyle: 'italic', fontFamily: 'Georgia, serif',
                                        }}>
                                            {street === 'preflop' ? 'Preflop' : `${street.charAt(0).toUpperCase() + street.slice(1)}`} • Smarter.Poker
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Player Seats */}
                {seats.map((seat, i) => {
                    const isHero = seat.isHero;
                    const villain = !isHero ? villains[i - 1] : null;
                    const avatar = isHero ? AVATARS[0] : AVATARS[(i % (AVATARS.length - 1)) + 1];
                    const size = isHero ? 70 : 58;

                    return (
                        <div key={seat.id} style={{
                            position: 'absolute', left: `${seat.x}%`, top: `${seat.y}%`,
                            transform: 'translate(-50%, -50%)', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', zIndex: isHero ? 100 : 50,
                        }}>
                            <div style={{ width: size, height: size * 1.1 }}>
                                <img src={avatar} alt={isHero ? 'Hero' : `Villain ${i}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    onError={(e) => { e.target.src = '/avatars/default.png'; }} />
                            </div>
                            <SeatBadge
                                label={isHero ? 'Hero' : villain?.archetype?.name || `V${i}`}
                                stack={isHero ? heroStack : villain?.stack || 100}
                                isHero={isHero}
                                position={isHero ? heroPosition : villain?.position || ''}
                            />
                        </div>
                    );
                })}

                {/* Hero Cards */}
                {heroCards.length > 0 && (
                    <div style={{
                        position: 'absolute', left: '50%', bottom: '8%',
                        transform: 'translateX(-50%)', display: 'flex', zIndex: 150,
                    }}>
                        {heroCards.map((card, i) => (
                            <motion.div key={i}
                                initial={{ y: 20, opacity: 0, rotate: i === 0 ? -6 : 6 }}
                                animate={{ y: 0, opacity: 1, rotate: i === 0 ? -6 : 6 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                style={{ marginLeft: i > 0 ? -8 : 0 }}
                            >
                                <TableCard card={card} />
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
