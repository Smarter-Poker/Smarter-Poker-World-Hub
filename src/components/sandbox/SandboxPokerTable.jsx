/**
 * SandboxPokerTable — Vertical Mobile-First Table Visual (v2.0)
 * 
 * Uses a cropped + rotated poker-table-vertical.png for portrait orientation.
 * Elliptical seat positions recalculated for vertical layout.
 * Community cards, pot, equity, and board texture all rendered ON the table felt.
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
            width: 40, height: 56,
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
// VERTICAL SEAT POSITIONS — Recalculated for portrait layout
// ═══════════════════════════════════════════════════════════════════════════

function computeVerticalSeatPositions(maxSeats) {
    // For a vertical table, the ellipse is taller than wide
    const cx = 50, cy = 50;
    const rx = 32;  // Narrower horizontal radius
    const ry = 38;  // Taller vertical radius

    const seatPositions = [];
    // Place hero at bottom (angle = PI/2 = 6 o'clock), villain at top
    const startAngle = Math.PI / 2; // Start from bottom
    for (let i = 0; i < maxSeats; i++) {
        const angle = startAngle + (2 * Math.PI * i) / maxSeats;
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);
        seatPositions.push({ top: `${y}%`, left: `${x}%` });
    }
    return { seatPositions };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE — Vertical portrait orientation
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
    equity,
    onTapHeroCards,
    onTapBoard,
}) {
    const totalSeats = 1 + villains.length;
    const maxSeats = Math.max(totalSeats, 2);
    const { seatPositions } = computeVerticalSeatPositions(maxSeats);

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

    const avatarSize = 38;

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 340,
            margin: '0 auto',
            aspectRatio: '344 / 610',
            overflow: 'visible',
        }}>
            {/* Poker table image — vertical orientation */}
            <img
                src="/images/poker-table-vertical.png"
                alt="Poker Table"
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                }}
                loading="lazy"
            />

            {/* Center info on the table felt */}
            <div style={{
                position: 'absolute', top: '42%', left: '50%',
                transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
            }}>
                {/* Pot Display */}
                <div style={{
                    fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.9)',
                    letterSpacing: 0.5, marginBottom: 2,
                    textShadow: '0 1px 6px rgba(0,0,0,0.7)',
                }}>
                    Pot {(pot || 0).toFixed(1)} BB
                </div>

                {/* Street Label */}
                <div style={{
                    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase', letterSpacing: 1.5,
                }}>
                    {street === 'preflop' ? 'Preflop' : street.charAt(0).toUpperCase() + street.slice(1)}
                </div>

                {/* Equity on felt */}
                {equity != null && (
                    <div style={{
                        marginTop: 4, fontSize: 11, fontWeight: 700,
                        color: equity >= 50 ? '#4ade80' : '#fbbf24',
                        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}>
                        {equity.toFixed(1)}% equity
                    </div>
                )}

                {/* Branding */}
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', marginTop: 3 }}>
                    Smarter.Poker
                </div>
            </div>

            {/* Community Cards — centered above pot */}
            {communityCards.length > 0 && (
                <div
                    onClick={onTapBoard}
                    style={{
                        position: 'absolute', top: '30%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex', gap: 2, zIndex: 10,
                        cursor: onTapBoard ? 'pointer' : 'default',
                    }}
                >
                    {communityCards.map((card, i) => (
                        <motion.div key={i} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                            <TableCard card={card} style={{ width: 32, height: 45 }} />
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Empty board slots — tappable to open deck */}
            {communityCards.length === 0 && onTapBoard && (
                <div
                    onClick={onTapBoard}
                    style={{
                        position: 'absolute', top: '30%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex', gap: 3, zIndex: 10,
                        cursor: 'pointer',
                    }}
                >
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: 30, height: 42, borderRadius: 3,
                            border: '1.5px dashed rgba(255,255,255,0.2)',
                            background: 'rgba(255,255,255,0.03)',
                        }} />
                    ))}
                </div>
            )}

            {/* Board Texture Badge */}
            {boardTexture && (
                <div style={{
                    position: 'absolute', top: '24%', left: '50%', transform: 'translateX(-50%)',
                    padding: '2px 6px', borderRadius: 4, fontSize: 7, fontWeight: 700, zIndex: 10,
                    background: boardTexture.color || 'rgba(59,130,246,0.2)',
                    color: boardTexture.textColor || '#4599FF',
                    border: `1px solid ${boardTexture.textColor || '#2374E1'}44`,
                    whiteSpace: 'nowrap',
                }}>
                    {boardTexture.label}
                </div>
            )}

            {/* Seat badges */}
            {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                const pos = seatPositions[idx];
                const topPct = parseFloat(pos.top);
                const leftPct = parseFloat(pos.left);
                const isBottom = topPct > 70;
                const isTop = topPct < 30;
                const isLeftSide = leftPct < 25;
                const isRightSide = leftPct > 75;

                let badgeTransform = 'translate(-50%, -50%)';
                if (isLeftSide) badgeTransform = 'translate(-10px, -50%)';
                else if (isRightSide) badgeTransform = 'translate(calc(-100% + 10px), -50%)';

                return (
                    <motion.div key={idx}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                            position: 'absolute', top: pos.top, left: pos.left,
                            transform: badgeTransform, zIndex: 2,
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(36,37,38,0.95)',
                            borderRadius: 8,
                            padding: '3px 6px 3px 3px',
                            border: `2px solid ${seat.isHero ? 'rgba(35,116,225,0.7)' : '#3A3B3C'}`,
                            backdropFilter: 'blur(6px)',
                            minWidth: 50,
                        }}>
                        {/* Avatar circle */}
                        <div style={{
                            width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: seat.isHero
                                ? 'linear-gradient(135deg, #2374E1 0%, #1a5db8 100%)'
                                : 'linear-gradient(135deg, #1877F2 0%, #1565c0 100%)',
                            border: `2px solid ${seat.isHero ? '#2374E1' : '#1877F2'}`,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                            fontSize: 16, fontWeight: 800, color: '#fff',
                        }}>
                            {seat.isHero ? 'H' : seat.name.charAt(0).toUpperCase()}
                        </div>
                        {/* Name + Stack */}
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{
                                fontSize: 10, fontWeight: 600, lineHeight: 1.2,
                                color: seat.isHero ? '#4599FF' : '#E4E6EB',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                maxWidth: 65,
                            }}>
                                {seat.isHero ? `You (${seat.name})` : seat.name}
                            </div>
                            <div style={{
                                fontSize: 9, fontWeight: 700, color: '#B0B3B8', lineHeight: 1.2,
                            }}>
                                {seat.stack} BB
                            </div>
                            {!seat.isHero && seat.archetype && (
                                <div style={{
                                    fontSize: 7, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.3)', lineHeight: 1.2,
                                }}>
                                    {seat.archetype}
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
            })}

            {/* Hero Cards — positioned near hero seat (bottom) */}
            {heroCards.length > 0 && seatPositions.length > 0 && (
                <div
                    onClick={onTapHeroCards}
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0].top} - 50px)`,
                        left: seatPositions[0].left,
                        transform: 'translateX(-50%)',
                        display: 'flex', zIndex: 150,
                        cursor: onTapHeroCards ? 'pointer' : 'default',
                    }}
                >
                    {heroCards.map((card, i) => (
                        <motion.div
                            key={i}
                            initial={{ y: 15, opacity: 0, rotate: i === 0 ? -8 : 8 }}
                            animate={{ y: 0, opacity: 1, rotate: i === 0 ? -5 : 5 }}
                            transition={{ delay: 0.2 + i * 0.1 }}
                            style={{ marginLeft: i > 0 ? -6 : 0 }}
                        >
                            <TableCard card={card} style={{ width: 34, height: 48 }} />
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Empty hero card slots — tappable */}
            {heroCards.length === 0 && onTapHeroCards && (
                <div
                    onClick={onTapHeroCards}
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0]?.top || '85%'} - 50px)`,
                        left: seatPositions[0]?.left || '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex', gap: 3, zIndex: 150,
                        cursor: 'pointer',
                    }}
                >
                    {[0, 1].map(i => (
                        <div key={i} style={{
                            width: 32, height: 45, borderRadius: 4,
                            border: '2px dashed rgba(35,116,225,0.4)',
                            background: 'rgba(35,116,225,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: 'rgba(35,116,225,0.5)', fontWeight: 700,
                        }}>
                            ?
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
