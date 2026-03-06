/**
 * Poker Odds Calculator — /hub/poker-tools
 * ══════════════════════════════════════════
 * Golden Smarter Table with Hero + up to 6 Villains
 * Card picker BELOW table, large custom deck card images
 * Board cards on the felt, SMARTER.POKER branding
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
    calculateEquity, makeCard, GAME_CONFIGS, PRESETS, parsePresetHands
} from '../../src/lib/poker/pokerOddsEngine';

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS = { spades: '#E4E6EB', hearts: '#EF4444', diamonds: '#3B82F6', clubs: '#31A24C' };


const PLAYER_COLORS = ['#F59E0B', '#EF4444', '#31A24C', '#A855F7', '#3B82F6', '#EC4899', '#14B8A6'];

/* 7 seat positions around the table (Hero + 6 Villains) — inset for multi-card games */
const SEAT_POSITIONS = [
    { x: 50, y: 88, label: 'Hero', isHero: true },
    { x: 20, y: 70, label: 'Villain 1' },
    { x: 14, y: 38, label: 'Villain 2' },
    { x: 30, y: 8, label: 'Villain 3' },
    { x: 70, y: 8, label: 'Villain 4' },
    { x: 86, y: 38, label: 'Villain 5' },
    { x: 80, y: 70, label: 'Villain 6' },
];

/* Custom deck face images: /cards/{suit}_{rank}.png */
function getCardImage(rank, suit) {
    const r = rank === '10' ? '10' : rank.toLowerCase();
    return `/cards/${suit}_${r}.png`;
}

/* ═══════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════ */
export default function PokerToolsPage() {
    const [game, setGame] = useState('nlhe');
    const [hands, setHands] = useState([[], []]);
    const [board, setBoard] = useState([]);
    const [deadCards, setDeadCards] = useState([]);
    const [results, setResults] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({ type: 'hand', playerIdx: 0 });
    const [showMenu, setShowMenu] = useState(false);
    const [showPresets, setShowPresets] = useState(false);

    const config = GAME_CONFIGS[game];

    const usedCardIds = useMemo(() => {
        const ids = new Set();
        hands.forEach(h => h.forEach(c => ids.add(c.id)));
        board.forEach(c => ids.add(c.id));
        deadCards.forEach(c => ids.add(c.id));
        return ids;
    }, [hands, board, deadCards]);

    const resetAll = useCallback(() => {
        setHands([[], []]);
        setBoard([]);
        setDeadCards([]);
        setResults(null);
        setSelectedSlot({ type: 'hand', playerIdx: 0 });
    }, []);

    const changeGame = useCallback((g) => {
        setGame(g);
        resetAll();
    }, [resetAll]);

    /* Max players: PLO5/PLO6 = 4, everything else = 7 */
    const maxPlayers = config.holeCards >= 5 ? 4 : 7;

    const addVillain = useCallback(() => {
        if (hands.length < maxPlayers) setHands(h => [...h, []]);
    }, [hands.length, maxPlayers]);

    const removePlayer = useCallback((idx) => {
        if (hands.length <= 2 || idx === 0) return;
        setHands(h => h.filter((_, i) => i !== idx));
        setResults(null);
        if (selectedSlot?.type === 'hand' && selectedSlot.playerIdx === idx) {
            setSelectedSlot({ type: 'hand', playerIdx: 0 });
        }
    }, [hands.length, selectedSlot]);

    /* Auto-advance to next empty slot */
    const advanceSlot = useCallback((currentSlot) => {
        if (currentSlot.type === 'hand') {
            const pi = currentSlot.playerIdx;
            if ((hands[pi]?.length || 0) + 1 < config.holeCards) return currentSlot;
            for (let i = 1; i <= hands.length; i++) {
                const nextPi = (pi + i) % hands.length;
                if ((hands[nextPi]?.length || 0) < config.holeCards) {
                    return { type: 'hand', playerIdx: nextPi };
                }
            }
            if (config.hasBoard && board.length < 5) return { type: 'board' };
            return currentSlot;
        }
        return currentSlot;
    }, [hands, config, board]);

    const selectCard = useCallback((rank, suit) => {
        if (!selectedSlot) return;
        const card = makeCard(rank, suit);
        if (!card || usedCardIds.has(card.id)) return;

        if (selectedSlot.type === 'hand') {
            setHands(prev => {
                const updated = [...prev];
                const hand = [...updated[selectedSlot.playerIdx]];
                if (hand.length < config.holeCards) {
                    hand.push(card);
                    updated[selectedSlot.playerIdx] = hand;
                }
                return updated;
            });
        } else if (selectedSlot.type === 'board') {
            setBoard(prev => prev.length < 5 ? [...prev, card] : prev);
        } else if (selectedSlot.type === 'dead') {
            setDeadCards(prev => [...prev, card]);
        }
        setResults(null);
        setSelectedSlot(advanceSlot(selectedSlot));
    }, [selectedSlot, usedCardIds, config.holeCards, advanceSlot]);

    const removeCard = useCallback((type, playerIdx, cardIdx) => {
        if (type === 'hand') {
            setHands(prev => {
                const updated = [...prev];
                updated[playerIdx] = updated[playerIdx].filter((_, i) => i !== cardIdx);
                return updated;
            });
            setSelectedSlot({ type: 'hand', playerIdx });
        } else if (type === 'board') {
            setBoard(prev => prev.filter((_, i) => i !== cardIdx));
            setSelectedSlot({ type: 'board' });
        } else if (type === 'dead') {
            setDeadCards(prev => prev.filter((_, i) => i !== cardIdx));
        }
        setResults(null);
    }, []);

    const runCalculation = useCallback(() => {
        const validHands = hands.filter(h => h.length === config.holeCards);
        if (validHands.length < 2) return;
        setCalculating(true);
        setTimeout(() => {
            const res = calculateEquity({ game, hands: validHands, board, dead: deadCards, iterations: 10000 });
            setResults(res);
            setCalculating(false);
        }, 50);
    }, [game, hands, board, deadCards, config.holeCards]);

    const loadPreset = useCallback((preset) => {
        const parsed = parsePresetHands(preset.hands);
        setHands(parsed);
        setBoard([]);
        setDeadCards([]);
        setResults(null);
        setShowPresets(false);
    }, []);

    useEffect(() => {
        const validHands = hands.filter(h => h.length === config.holeCards);
        if (validHands.length >= 2) runCalculation();
    }, [hands, board]);

    const validCount = hands.filter(h => h.length === config.holeCards).length;

    /* ═══════════════════════════════════════
       RENDER
    ═══════════════════════════════════════ */
    return (
        <>
            <Head>
                <title>Poker Odds Calculator | Smarter.Poker</title>
                <meta name="description" content="Free poker odds calculator for Hold'em, Omaha, PLO5, PLO6, Stud, and Razz." />
                
            </Head>

            <div style={{
                minHeight: '100vh', background: '#080810', color: '#E4E6EB',
                fontFamily: "var(--font-inter), -apple-system, sans-serif" , textTransform: 'capitalize',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* ─── HEADER ─── */}
                <div style={{
                    background: '#0f0f18', borderBottom: '1px solid #222',
                    padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link href="/hub" style={{ color: '#888', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>← Hub</Link>
                        <span style={{ color: '#333' }}>|</span>
                        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Poker Odds Calculator</h1>
                    </div>
                    <button onClick={() => setShowMenu(!showMenu)}
                        style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: '2px 6px' }}>
                        ☰
                    </button>
                </div>

                {/* ─── HAMBURGER MENU ─── */}
                {showMenu && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setShowMenu(false)}>
                        <div style={{
                            position: 'absolute', top: 0, right: 0, width: 280, height: '100%',
                            background: '#111118', borderLeft: '1px solid #333',
                            padding: '24px 20px', overflowY: 'auto',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                <span style={{ fontSize: 16, fontWeight: 800 }}>Settings</span>
                                <button onClick={() => setShowMenu(false)}
                                    style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer' }}>✕</button>
                            </div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#666', letterSpacing: 1, marginBottom: 10 }}>LINKS</p>
                            <Link href="/hub" style={{ display: 'block', color: '#888', fontSize: 13, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #222' }}>← Back To World Hub</Link>
                            <Link href="/hub/profile-edit" style={{ display: 'block', color: '#888', fontSize: 13, padding: '10px 0', textDecoration: 'none' }}>Edit Profile</Link>
                        </div>
                    </div>
                )}

                {/* ─── GAME TABS — LARGE, NO EMOJIS ─── */}
                <div style={{ padding: '8px 10px' }}>
                    <div style={{
                        display: 'flex', gap: 3, flexWrap: 'wrap',
                        background: '#111', borderRadius: 10, padding: 4, border: '1px solid #222',
                    }}>
                        {Object.entries(GAME_CONFIGS).map(([key, cfg]) => (
                            <button key={key} onClick={() => changeGame(key)}
                                style={{
                                    flex: 1, minWidth: 70, padding: '10px 6px', borderRadius: 8, border: 'none',
                                    background: game === key ? '#1877F2' : 'transparent',
                                    color: game === key ? '#fff' : '#888',
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}>
                                {cfg.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════
                   GOLDEN TEMPLATE TABLE — EXACT MATCH (GoldenTemplateTable.jsx)
                ═══════════════════════════════════════════════════════ */}
                <div style={{ position: 'relative', width: '100%', paddingBottom: '55%', margin: '0 auto' }}>

                    {/* Table Container — matching GoldenTemplateTable positioning */}
                    <div style={{ position: 'absolute', top: '2%', left: '3%', right: '3%', bottom: '2%' }}>

                        {/* OUTER DARK FRAME — 3D raised effect */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            borderRadius: '50% / 38%',
                            background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
                            boxShadow: '0 25px 80px rgba(0,0,0,0.95), 0 8px 30px rgba(0,0,0,0.8), inset 0 -8px 20px rgba(0,0,0,0.6), inset 0 8px 20px rgba(50,50,50,0.2)',
                        }}>
                            {/* OUTER GOLD RAIL — gradient for 3D */}
                            <div style={{
                                position: 'absolute', inset: 12,
                                borderRadius: '50% / 37%',
                                background: 'linear-gradient(180deg, #f0d050 0%, #d4a000 25%, #a07800 60%, #705000 100%)',
                                boxShadow: 'inset 0 3px 6px rgba(255,255,180,0.5), inset 0 -3px 6px rgba(0,0,0,0.5)',
                            }}>
                                {/* BLACK GAP */}
                                <div style={{
                                    position: 'absolute', inset: 10,
                                    borderRadius: '50% / 36%',
                                    background: 'linear-gradient(180deg, #151515 0%, #0a0a0a 100%)',
                                }}>
                                    {/* INNER GOLD RAIL */}
                                    <div style={{
                                        position: 'absolute', inset: 8,
                                        borderRadius: '50% / 35%',
                                        background: 'linear-gradient(180deg, #ffe070 0%, #e8b810 25%, #b08000 60%, #785500 100%)',
                                        boxShadow: 'inset 0 3px 6px rgba(255,255,180,0.6), inset 0 -3px 6px rgba(0,0,0,0.5)',
                                    }}>
                                        {/* THIN DARK EDGE */}
                                        <div style={{
                                            position: 'absolute', inset: 6,
                                            borderRadius: '50% / 34%',
                                            background: 'linear-gradient(180deg, #101010 0%, #080808 100%)',
                                        }}>
                                            {/* INNER GLOW LINE */}
                                            <div style={{
                                                position: 'absolute', inset: 4,
                                                borderRadius: '50% / 33%',
                                                border: '3px solid rgba(180,140,50,0.35)',
                                                background: 'transparent',
                                            }}>
                                                {/* FELT with radial gradient depth */}
                                                <div style={{
                                                    position: 'absolute', inset: 0,
                                                    borderRadius: '50% / 33%',
                                                    background: 'radial-gradient(ellipse at 50% 35%, #181818 0%, #121212 25%, #0d0d0d 50%, #080808 75%, #050505 100%)',
                                                    boxShadow: 'inset 0 0 120px rgba(0,0,0,0.9), inset 0 0 60px rgba(0,0,0,0.7), inset 0 -20px 40px rgba(0,0,0,0.5)',
                                                }}>

                                                    {/* COMMUNITY BOARD — Large, centered on felt */}
                                                    {config.hasBoard && (
                                                        <div style={{
                                                            position: 'absolute', top: '32%', left: '50%', transform: 'translate(-50%, -50%)',
                                                            display: 'flex', gap: 6, cursor: 'pointer', zIndex: 10,
                                                        }}
                                                            onClick={() => setSelectedSlot({ type: 'board' })}>
                                                            {Array.from({ length: 5 }).map((_, i) => {
                                                                const card = board[i];
                                                                const isActive = selectedSlot?.type === 'board';
                                                                return card ? (
                                                                    <div key={i} onClick={e => { e.stopPropagation(); removeCard('board', 0, i); }}
                                                                        style={{ cursor: 'pointer' }}>
                                                                        <img src={getCardImage(card.rank, card.suit)} alt=""
                                                                            style={{
                                                                                width: 65, height: 91, borderRadius: 5,
                                                                                border: '2px solid #1877F2',
                                                                                boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
                                                                                background: '#fff',
                                                                            }} />
                                                                    </div>
                                                                ) : (
                                                                    <div key={i} style={{
                                                                        width: 65, height: 91, borderRadius: 5,
                                                                        border: `2px dashed ${isActive ? '#1877F2' : 'rgba(255,255,255,0.12)'}`,
                                                                        background: 'rgba(255,255,255,0.03)',
                                                                    }} />
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* SMARTER.POKER — LARGE and BRIGHT branding UNDER the board */}
                                                    <div style={{
                                                        position: 'absolute', top: '60%', left: '50%', transform: 'translate(-50%, -50%)',
                                                        textAlign: 'center', pointerEvents: 'none', zIndex: 5,
                                                    }}>
                                                        <div style={{
                                                            fontSize: 28, fontWeight: 900, color: 'rgba(255,215,0,0.4)',
                                                            letterSpacing: 8, textTransform: 'uppercase',
                                                        }}>
                                                            Smarter.Poker
                                                        </div>
                                                        <div style={{
                                                            fontSize: 14, fontWeight: 700, color: 'rgba(255,215,0,0.25)',
                                                            letterSpacing: 5, marginTop: 4,
                                                        }}>
                                                            Odds Calculator
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PLAYER SEATS — ON the felt, not on rail */}
                    {hands.map((hand, pi) => {
                        const pos = SEAT_POSITIONS[pi];
                        if (!pos) return null;
                        const isHero = pi === 0;
                        const isSelected = selectedSlot?.type === 'hand' && selectedSlot.playerIdx === pi;
                        const equity = results?.[pi];
                        const color = PLAYER_COLORS[pi];


                        return (
                            <div key={pi} style={{
                                position: 'absolute',
                                left: `${pos.x}%`, top: `${pos.y}%`,
                                transform: 'translate(-50%, -50%)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                cursor: 'pointer', zIndex: isHero ? 100 : 50,
                            }}
                                onClick={() => setSelectedSlot({ type: 'hand', playerIdx: pi })}>

                                {/* Cards — blue frames, sized to fit on table */}
                                {(() => {
                                    /* Size cards to fit on table: 2-card=65, 4-card=55, 5-card=48, 6-card=42, 7-card=38 */
                                    const cw = config.holeCards <= 2 ? 65 : config.holeCards <= 4 ? 55 : config.holeCards <= 5 ? 48 : config.holeCards <= 6 ? 42 : 38;
                                    const ch = Math.round(cw * 1.4);
                                    const gap = config.holeCards >= 5 ? 1 : 2;
                                    return (
                                        <div style={{ display: 'flex', gap, marginBottom: 4 }}>
                                            {Array.from({ length: config.holeCards }).map((_, ci) => {
                                                const card = hand[ci];
                                                return card ? (
                                                    <div key={ci} onClick={e => { e.stopPropagation(); removeCard('hand', pi, ci); }}
                                                        style={{ cursor: 'pointer' }}>
                                                        <img src={getCardImage(card.rank, card.suit)} alt=""
                                                            style={{
                                                                width: cw, height: ch, borderRadius: 4,
                                                                border: '2px solid #1877F2',
                                                                boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
                                                                background: '#fff',
                                                            }} />
                                                    </div>
                                                ) : (
                                                    <div key={ci} style={{
                                                        width: cw, height: ch, borderRadius: 4,
                                                        border: `2px solid ${isSelected ? '#1877F2' : 'rgba(255,255,255,0.15)'}`,
                                                        boxShadow: isSelected ? '0 0 12px rgba(24,119,242,0.3)' : 'none',
                                                        background: 'linear-gradient(135deg, #1a1a3e 0%, #0a0a20 100%)',
                                                        position: 'relative', overflow: 'hidden',
                                                    }}>
                                                        {/* Card back decorative design */}
                                                        <div style={{
                                                            position: 'absolute', inset: 3, borderRadius: 2,
                                                            border: '1px solid rgba(255,215,0,0.25)',
                                                        }}>
                                                            <div style={{
                                                                position: 'absolute', top: '50%', left: '50%',
                                                                transform: 'translate(-50%, -50%) rotate(45deg)',
                                                                width: Math.round(cw * 0.35), height: Math.round(cw * 0.35),
                                                                border: '1px solid rgba(255,215,0,0.2)',
                                                                background: 'rgba(255,215,0,0.05)',
                                                            }} />
                                                            <div style={{
                                                                position: 'absolute', top: '50%', left: '50%',
                                                                transform: 'translate(-50%, -50%)',
                                                                fontSize: Math.max(8, Math.round(cw * 0.18)),
                                                                fontWeight: 900, color: 'rgba(255,215,0,0.2)',
                                                                letterSpacing: 1,
                                                            }}>S</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* Gold Badge */}
                                <div style={{
                                    background: isSelected
                                        ? `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`
                                        : 'linear-gradient(180deg, #FFD700 0%, #FFA500 50%, #CC8800 100%)',
                                    border: isSelected ? `2px solid ${color}` : '2px solid #996600',
                                    borderRadius: 5,
                                    padding: '2px 12px 4px',
                                    textAlign: 'center',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                    minWidth: 55,
                                }}>
                                    <span style={{
                                        display: 'block', fontSize: 10, fontWeight: 'bold',
                                        color: isSelected ? '#fff' : '#000', lineHeight: 1.3,
                                    }}>
                                        {isHero ? '★ Hero' : `Villain ${pi}`}
                                    </span>
                                    {equity && (
                                        <span style={{
                                            display: 'block', fontSize: 14, fontWeight: 900,
                                            color: isSelected ? '#fff' : '#000', lineHeight: 1.1,
                                        }}>
                                            {equity.equity.toFixed(1)}%
                                        </span>
                                    )}
                                </div>

                                {/* Remove X */}
                                {!isHero && hands.length > 2 && (
                                    <button onClick={e => { e.stopPropagation(); removePlayer(pi); }}
                                        style={{
                                            position: 'absolute', top: -8, right: -8,
                                            width: 20, height: 20, borderRadius: '50%',
                                            background: '#EF4444', border: '2px solid #080810', color: '#fff',
                                            fontSize: 10, cursor: 'pointer', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', zIndex: 200,
                                        }}>✕</button>
                                )}
                            </div>
                        );
                    })}

                    {/* + ADD BUTTONS — Show at ALL empty seat positions */}
                    {SEAT_POSITIONS.slice(hands.length, maxPlayers).map((pos, idx) => (
                        <div key={`add-${idx}`} style={{
                            position: 'absolute',
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            transform: 'translate(-50%, -50%)',
                            cursor: 'pointer', zIndex: 30,
                        }}
                            onClick={addVillain}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%',
                                border: '2px dashed rgba(255,215,0,0.25)',
                                background: 'rgba(0,0,0,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 22, color: 'rgba(255,215,0,0.3)',
                                transition: 'all 0.2s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#FFD700'; e.currentTarget.style.color = '#FFD700'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,215,0,0.25)'; e.currentTarget.style.color = 'rgba(255,215,0,0.3)'; }}>
                                +
                            </div>
                        </div>
                    ))}
                </div>

                {/* ─── ACTION BAR ─── */}
                <div style={{ padding: '6px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={resetAll}
                        style={{ padding: '8px 14px', borderRadius: 8, background: '#1a1a1a', border: '1px solid #333', color: '#aaa', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        ↺ New Hand
                    </button>
                    <button onClick={() => setSelectedSlot({ type: 'board' })}
                        style={{
                            padding: '8px 14px', borderRadius: 8, border: '1px solid #333', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            background: selectedSlot?.type === 'board' ? '#1877F2' : '#1a1a1a',
                            color: selectedSlot?.type === 'board' ? '#fff' : '#aaa',
                        }}>
                        Board
                    </button>
                    <button onClick={() => setSelectedSlot({ type: 'dead' })}
                        style={{
                            padding: '8px 14px', borderRadius: 8, border: '1px solid #333', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            background: selectedSlot?.type === 'dead' ? '#EF4444' : '#1a1a1a',
                            color: selectedSlot?.type === 'dead' ? '#fff' : '#aaa',
                        }}>
                        Dead{deadCards.length > 0 ? ` (${deadCards.length})` : ''}
                    </button>
                    {PRESETS[game] && (
                        <button onClick={() => setShowPresets(!showPresets)}
                            style={{
                                padding: '8px 14px', borderRadius: 8, border: '1px solid #333', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                background: showPresets ? '#1877F2' : '#1a1a1a',
                                color: showPresets ? '#fff' : '#aaa',
                            }}>
                            Presets
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    {validCount >= 2 && !results && (
                        <button onClick={runCalculation} disabled={calculating}
                            style={{
                                padding: '8px 18px', borderRadius: 8, background: '#1877F2', border: 'none',
                                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                opacity: calculating ? 0.5 : 1,
                            }}>
                            {calculating ? '⏳' : '▶ Calculate'}
                        </button>
                    )}
                </div>

                {/* Dead Cards */}
                {deadCards.length > 0 && (
                    <div style={{ padding: '2px 12px 6px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#555' }}>Dead:</span>
                        {deadCards.map((c, i) => (
                            <div key={i} onClick={() => removeCard('dead', 0, i)} style={{ cursor: 'pointer' }}>
                                <img src={getCardImage(c.rank, c.suit)} alt=""
                                    style={{ width: 30, height: 42, borderRadius: 3, border: '1px solid #EF4444', opacity: 0.5 }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Presets */}
                {showPresets && PRESETS[game] && (
                    <div style={{
                        margin: '0 12px 6px', display: 'flex', gap: 5, flexWrap: 'wrap',
                        background: '#111', borderRadius: 8, padding: 10, border: '1px solid #222',
                    }}>
                        {PRESETS[game].map((p, i) => (
                            <button key={i} onClick={() => loadPreset(p)}
                                style={{
                                    padding: '6px 12px', borderRadius: 6, background: '#0a0a0a', border: '1px solid #333',
                                    color: '#aaa', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}>
                                {p.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* ═══════════════════════════════════════════
                    CARD PICKER — BELOW TABLE, LARGE
                ═══════════════════════════════════════════ */}
                <div style={{ padding: '0 10px 8px' }}>
                    <div style={{
                        background: '#0f0f18', borderRadius: 12, padding: '10px',
                        border: `2px solid ${selectedSlot ? '#1877F2' : '#222'}`,
                        transition: 'border-color 0.2s',
                    }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#ccc', margin: '0 0 8px 4px', textTransform: 'none' }}>
                            {selectedSlot ? (
                                selectedSlot.type === 'hand'
                                    ? `Select card for ${selectedSlot.playerIdx === 0 ? 'Hero' : 'Villain ' + selectedSlot.playerIdx}`
                                    : selectedSlot.type === 'board' ? 'Select board card'
                                        : 'Select dead card'
                            ) : 'Tap a seat above, then pick cards'}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 4 }}>
                            {SUITS.map(suit =>
                                RANKS.map(rank => {
                                    const card = makeCard(rank, suit);
                                    const isUsed = card && usedCardIds.has(card.id);
                                    const isDisabled = !selectedSlot || isUsed;
                                    const imgSrc = getCardImage(rank, suit);
                                    return (
                                        <button key={`${rank}-${suit}`}
                                            onClick={() => !isDisabled && selectCard(rank, suit)}
                                            disabled={isDisabled}
                                            style={{
                                                width: '100%', aspectRatio: '0.7', borderRadius: 5,
                                                border: 'none', padding: 0, overflow: 'hidden',
                                                cursor: isDisabled ? 'default' : 'pointer',
                                                opacity: isUsed ? 0.15 : 1,
                                                transition: 'all 0.12s',
                                                boxShadow: isUsed ? 'none' : '0 2px 6px rgba(0,0,0,0.3)',
                                                background: '#fff',
                                            }}
                                            onMouseEnter={e => { if (!isDisabled) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(24,119,242,0.5)'; } }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = isUsed ? 'none' : '0 2px 6px rgba(0,0,0,0.3)'; }}>
                                            <img src={imgSrc} alt={`${rank} of ${suit}`}
                                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>


            </div>
        </>
    );
}
