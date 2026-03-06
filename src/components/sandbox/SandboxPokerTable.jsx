/**
 * SandboxPokerTable — Tablet-Style Table Visual
 * 
 * Uses the SAME table rendering as the Club Commander table-tablets.js:
 * - poker-table-black-gold.png image as the table
 * - Elliptical seat positions via computeSeatPositions()
 * - Facebook-dark avatar badges with player info
 * - Community cards centered on the felt
 * 
 * This is a standalone widget version for the sandbox page.
 */
import React from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
};

export function TableCard({ card, style = {} }) {
    if (!card) return null;
    const imagePath = `/cards/${SUIT_MAP[card[1]]}_${RANK_MAP[card[0]] || card[0].toLowerCase()}.png`;
    return (
        <div style={{
            width: 46, height: 64,
            background: '#fff', borderRadius: 4,
            boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
            overflow: 'hidden', border: '1px solid #ddd',
            ...style
        }}>
            <img src={imagePath} alt={card} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ELLIPTICAL SEAT POSITIONS — Matches table-tablets.js computeSeatPositions()
// ═══════════════════════════════════════════════════════════════════════════

function computeSeatPositions(maxSeats) {
    const cx = 50, cy = 44;
    const rx = 42, ry = 36;
    const dealerAngle = Math.PI * 0.5;
    const dealerPos = {
        top: `${cy - ry * Math.sin(dealerAngle) - 8}%`,
        left: `${cx + rx * Math.cos(dealerAngle)}%`,
    };

    const seatPositions = [];
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < maxSeats; i++) {
        const angle = startAngle + (2 * Math.PI * i) / maxSeats;
        const x = cx + rx * Math.cos(angle);
        const y = cy - ry * Math.sin(angle);
        seatPositions.push({ top: `${y}%`, left: `${x}%` });
    }
    return { dealerPos, seatPositions };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE — Tablet-style visual matching table-tablets.js renderTableVisual()
// ═══════════════════════════════════════════════════════════════════════════

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
    const totalSeats = 1 + villains.length;
    const maxSeats = Math.max(totalSeats, 2);
    const { seatPositions } = computeSeatPositions(maxSeats);

    // Build seat array: hero at index 0, then villains
    const seatArr = [
        { name: heroPosition, stack: heroStack, isHero: true },
        ...villains.map((v, i) => ({
            name: v.position || `V${i + 1}`,
            stack: v.stack || 100,
            archetype: v.archetype?.name || 'Opponent',
            isHero: false,
        })),
    ];

    const avatarSize = 44;

    return (
        <div style={{
            position: 'relative', width: '100%', paddingBottom: '60%',
            overflow: 'hidden',
            background: 'radial-gradient(ellipse 85% 65% at 50% 42%, #0d1210 0%, #151a1d 40%, #1a1a2e 90%)',
            borderRadius: 12,
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, aspectRatio: '1 / 1', marginTop: '-16%' }}>
                {/* Poker table image — same as table-tablets.js */}
                <img
                    src="/images/poker-table-black-gold.png"
                    alt="Poker Table"
                    style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                    }} loading="lazy" />

                {/* Center info on the table felt */}
                <div style={{
                    position: 'absolute', top: '48%', left: '50%',
                    transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                }}>
                    {/* Pot Display */}
                    <div style={{
                        fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.85)',
                        letterSpacing: 0.5, marginBottom: 4,
                    }}>
                        Pot {(pot || 0).toFixed(1)} BB
                    </div>

                    {/* Street Label */}
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
                        textTransform: 'uppercase', letterSpacing: 1.5,
                    }}>
                        {street === 'preflop' ? 'Preflop' : street.charAt(0).toUpperCase() + street.slice(1)}
                    </div>

                    {/* Branding */}
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                        Smarter.Poker
                    </div>
                </div>

                {/* Community Cards — centered above the pot */}
                {communityCards.length > 0 && (
                    <div style={{
                        position: 'absolute', top: '34%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex', gap: 3, zIndex: 10,
                    }}>
                        {communityCards.map((card, i) => (
                            <motion.div key={i} initial={{ y: -15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}>
                                <TableCard card={card} style={{ width: 40, height: 56 }} />
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Board Texture Badge */}
                {boardTexture && (
                    <div style={{
                        position: 'absolute', top: '26%', left: '50%', transform: 'translateX(-50%)',
                        padding: '2px 8px', borderRadius: 4, fontSize: 8, fontWeight: 700, zIndex: 10,
                        background: boardTexture.color || 'rgba(59,130,246,0.2)',
                        color: boardTexture.textColor || '#93c5fd',
                        border: `1px solid ${boardTexture.textColor || '#3b82f6'}44`,
                        whiteSpace: 'nowrap',
                    }}>
                        {boardTexture.label}
                    </div>
                )}

                {/* Seat badges — matching table-tablets.js avatar card style */}
                {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                    const pos = seatPositions[idx];
                    const leftPct = parseFloat(pos.left);
                    const isLeftSide = leftPct < 25;
                    const isRightSide = leftPct > 75;
                    const badgeTransform = isLeftSide
                        ? 'translate(-17px, -50%)'
                        : isRightSide
                            ? 'translate(calc(-100% + 17px), -50%)'
                            : 'translate(-50%, -50%)';
                    const badgeDirection = isRightSide ? 'row-reverse' : 'row';

                    return (
                        <motion.div key={idx}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            style={{
                                position: 'absolute', top: pos.top, left: pos.left,
                                transform: badgeTransform, zIndex: 2,
                                display: 'flex', flexDirection: badgeDirection, alignItems: 'center', gap: 6,
                                background: 'rgba(36,37,38,0.9)',
                                borderRadius: 10,
                                padding: '4px 8px 4px 4px',
                                border: `2px solid ${seat.isHero ? 'rgba(59,130,246,0.7)' : 'rgba(24,119,242,0.5)'}`,
                                backdropFilter: 'blur(6px)',
                                minWidth: 60,
                            }}>
                            {/* Avatar circle */}
                            <div style={{
                                width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: seat.isHero
                                    ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                                    : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                                border: `2px solid ${seat.isHero ? '#3b82f6' : '#1877F2'}`,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                fontSize: 18, fontWeight: 800, color: '#fff',
                            }}>
                                {seat.isHero ? 'H' : seat.name.charAt(0).toUpperCase()}
                            </div>
                            {/* Name + Stack */}
                            <div style={{ overflow: 'hidden', textAlign: isRightSide ? 'right' : 'left' }}>
                                <div style={{
                                    fontSize: 11, fontWeight: 600, lineHeight: 1.2,
                                    color: seat.isHero ? '#93c5fd' : '#E4E6EB',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    maxWidth: 80,
                                }}>
                                    {seat.isHero ? `You (${seat.name})` : seat.name}
                                </div>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: '#B0B3B8', lineHeight: 1.2,
                                }}>
                                    {seat.stack} BB
                                </div>
                                {!seat.isHero && seat.archetype && (
                                    <div style={{
                                        fontSize: 8, fontWeight: 600,
                                        color: 'rgba(255,255,255,0.35)', lineHeight: 1.2,
                                    }}>
                                        {seat.archetype}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}

                {/* Hero Cards — positioned near hero seat */}
                {heroCards.length > 0 && seatPositions.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0].top} - 40px)`,
                        left: seatPositions[0].left,
                        transform: 'translateX(-50%)',
                        display: 'flex', zIndex: 150,
                    }}>
                        {heroCards.map((card, i) => (
                            <motion.div
                                key={i}
                                initial={{ y: 20, opacity: 0, rotate: i === 0 ? -8 : 8 }}
                                animate={{ y: 0, opacity: 1, rotate: i === 0 ? -5 : 5 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                                style={{ marginLeft: i > 0 ? -6 : 0 }}
                            >
                                <TableCard card={card} style={{ width: 36, height: 50 }} />
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
