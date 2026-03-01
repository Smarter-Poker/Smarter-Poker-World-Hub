/**
 * Poker Odds Calculator — /hub/poker-tools
 * ══════════════════════════════════════════
 * Uses the EXACT Golden Smarter Table from TrainingGameTable.jsx
 * Hero + up to 6 Villains, card picker at top, auto-advance
 * White deck back default, changeable in hamburger menu
 * Supports NLHE, PLO4, PLO5, PLO6, 7-Card Stud, Razz
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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

const DECK_OPTIONS = [
    { id: 'white', label: 'White' },
    { id: 'black', label: 'Black' },
    { id: 'red', label: 'Red' },
    { id: 'blue', label: 'Blue' },
];

const PLAYER_COLORS = ['#F59E0B', '#EF4444', '#31A24C', '#A855F7', '#3B82F6', '#EC4899', '#14B8A6'];

/* Seat positions — EXACT from TrainingGameTable.jsx */
const SEAT_POSITIONS = [
    { x: 50, y: 92, label: 'Hero', isHero: true },
    { x: 22, y: 78, label: 'Villain 1' },
    { x: 8, y: 48, label: 'Villain 2' },
    { x: 22, y: 18, label: 'Villain 3' },
    { x: 50, y: 5, label: 'Villain 4' },
    { x: 78, y: 18, label: 'Villain 5' },
    { x: 92, y: 48, label: 'Villain 6' },
];

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
    const [cardBack, setCardBack] = useState('white');
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

    const addVillain = useCallback(() => {
        if (hands.length < 7) setHands(h => [...h, []]);
    }, [hands.length]);

    const removePlayer = useCallback((idx) => {
        if (hands.length <= 2 || idx === 0) return;
        setHands(h => h.filter((_, i) => i !== idx));
        setResults(null);
        if (selectedSlot?.type === 'hand' && selectedSlot.playerIdx === idx) {
            setSelectedSlot({ type: 'hand', playerIdx: 0 });
        }
    }, [hands.length, selectedSlot]);

    /* Auto-advance: after placing a card, move to next empty slot */
    const advanceSlot = useCallback((currentSlot) => {
        if (currentSlot.type === 'hand') {
            const pi = currentSlot.playerIdx;
            // Check if current hand still has room
            const handLen = hands[pi]?.length || 0;
            if (handLen + 1 < config.holeCards) return currentSlot; // Stay on same player
            // Move to next player with empty slots
            for (let i = 1; i <= hands.length; i++) {
                const nextPi = (pi + i) % hands.length;
                if ((hands[nextPi]?.length || 0) < config.holeCards) {
                    return { type: 'hand', playerIdx: nextPi };
                }
            }
            // All hands full, move to board
            if (config.hasBoard && board.length < 5) return { type: 'board' };
            return currentSlot;
        }
        if (currentSlot.type === 'board') {
            if (board.length + 1 < 5) return currentSlot;
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
        // Auto-advance
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

    // Auto-calculate
    useEffect(() => {
        const validHands = hands.filter(h => h.length === config.holeCards);
        if (validHands.length >= 2) runCalculation();
    }, [hands, board]);

    const validCount = hands.filter(h => h.length === config.holeCards).length;

    /* Card size constants */
    const CARD_W = 52;
    const CARD_H = 73;
    const HERO_CARD_W = 60;
    const HERO_CARD_H = 84;
    const BOARD_CARD_W = 52;
    const BOARD_CARD_H = 73;

    return (
        <>
            <Head>
                <title>Poker Odds Calculator | Smarter.Poker</title>
                <meta name="description" content="Free poker odds calculator for Hold'em, Omaha, PLO5, PLO6, Stud, and Razz." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh', background: '#080810', color: '#E4E6EB',
                fontFamily: "'Inter', -apple-system, sans-serif", textTransform: 'capitalize',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* ─── HEADER ─── */}
                <div style={{
                    background: '#0f0f18', borderBottom: '1px solid #222',
                    padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href="/hub" style={{ color: '#888', textDecoration: 'none', fontSize: 11 }}>← Hub</Link>
                        <span style={{ color: '#333' }}>|</span>
                        <h1 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>🧮 Poker Odds Calculator</h1>
                    </div>
                    <button onClick={() => setShowMenu(!showMenu)}
                        style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', padding: '2px 6px' }}>
                        ☰
                    </button>
                </div>

                {/* ─── HAMBURGER MENU (deck selector lives here) ─── */}
                {showMenu && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={() => setShowMenu(false)}>
                        <div style={{
                            position: 'absolute', top: 0, right: 0, width: 260, height: '100%',
                            background: '#111118', borderLeft: '1px solid #333',
                            padding: '20px 16px', overflowY: 'auto',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <span style={{ fontSize: 14, fontWeight: 800 }}>Settings</span>
                                <button onClick={() => setShowMenu(false)}
                                    style={{ background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer' }}>✕</button>
                            </div>

                            {/* Deck Selector */}
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1, marginBottom: 10 }}>CARD BACK</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
                                {DECK_OPTIONS.map(d => (
                                    <div key={d.id} onClick={() => setCardBack(d.id)}
                                        style={{
                                            cursor: 'pointer', textAlign: 'center', borderRadius: 8,
                                            border: cardBack === d.id ? '2px solid #FFD700' : '2px solid #333',
                                            padding: 8, background: cardBack === d.id ? 'rgba(255,215,0,0.06)' : 'transparent',
                                        }}>
                                        <img src={`/images/card-backs/${d.id}.jpg`} alt={d.label}
                                            style={{ width: 50, height: 70, objectFit: 'cover', borderRadius: 4 }} />
                                        <div style={{ fontSize: 9, fontWeight: 700, color: cardBack === d.id ? '#FFD700' : '#666', marginTop: 4 }}>{d.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Links */}
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 1, marginBottom: 10 }}>QUICK LINKS</p>
                            <Link href="/hub" style={{ display: 'block', color: '#888', fontSize: 12, padding: '8px 0', textDecoration: 'none', borderBottom: '1px solid #222' }}>← Back To World Hub</Link>
                            <Link href="/hub/profile-edit" style={{ display: 'block', color: '#888', fontSize: 12, padding: '8px 0', textDecoration: 'none', borderBottom: '1px solid #222' }}>Edit Profile</Link>
                        </div>
                    </div>
                )}

                {/* ─── GAME TABS ─── */}
                <div style={{ padding: '6px 10px' }}>
                    <div style={{
                        display: 'flex', gap: 2, flexWrap: 'wrap',
                        background: '#111', borderRadius: 8, padding: 3, border: '1px solid #222',
                    }}>
                        {Object.entries(GAME_CONFIGS).map(([key, cfg]) => (
                            <button key={key} onClick={() => changeGame(key)}
                                style={{
                                    flex: 1, minWidth: 55, padding: '6px 2px', borderRadius: 6, border: 'none',
                                    background: game === key ? '#1877F2' : 'transparent',
                                    color: game === key ? '#fff' : '#888',
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}>
                                {cfg.emoji} {cfg.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════
                    CARD PICKER — LARGE, FULL WIDTH
                ═══════════════════════════════════════════ */}
                <div style={{ padding: '0 10px 6px' }}>
                    <div style={{
                        background: '#111', borderRadius: 10, padding: '8px',
                        border: `2px solid ${selectedSlot ? '#1877F2' : '#222'}`,
                        transition: 'border-color 0.2s',
                    }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#aaa', margin: '0 0 6px 2px', textTransform: 'none' }}>
                            {selectedSlot ? (
                                selectedSlot.type === 'hand'
                                    ? `Select card for ${selectedSlot.playerIdx === 0 ? 'Hero' : 'Villain ' + selectedSlot.playerIdx}`
                                    : selectedSlot.type === 'board' ? 'Select board card'
                                        : 'Select dead card'
                            ) : 'Tap a seat, then pick cards'}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3 }}>
                            {SUITS.map(suit =>
                                RANKS.map(rank => {
                                    const card = makeCard(rank, suit);
                                    const isUsed = card && usedCardIds.has(card.id);
                                    const isDisabled = !selectedSlot || isUsed;
                                    return (
                                        <button key={`${rank}-${suit}`}
                                            onClick={() => !isDisabled && selectCard(rank, suit)}
                                            disabled={isDisabled}
                                            style={{
                                                width: '100%', aspectRatio: '0.7', borderRadius: 4, border: 'none',
                                                background: isUsed ? '#222' : '#0a0a0a',
                                                color: isUsed ? '#333' : SUIT_COLORS[suit],
                                                fontSize: 12, fontWeight: 900, cursor: isDisabled ? 'default' : 'pointer',
                                                opacity: isUsed ? 0.2 : 1,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                padding: 0, transition: 'all 0.12s', lineHeight: 1.1, minHeight: 36,
                                            }}
                                            onMouseEnter={e => { if (!isDisabled) { e.currentTarget.style.background = '#1877F2'; e.currentTarget.style.color = '#fff'; } }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isUsed ? '#222' : '#0a0a0a'; e.currentTarget.style.color = isUsed ? '#333' : SUIT_COLORS[suit]; }}>
                                            <span style={{ fontSize: 13, fontWeight: 900 }}>{rank}</span>
                                            <span style={{ fontSize: 11 }}>{SUIT_SYMBOLS[suit]}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════
                   GOLDEN SMARTER TABLE — EXACT 6-LAYER CLONE
                ═══════════════════════════════════════════════════════ */}
                <div style={{ flex: 1, position: 'relative', padding: '0 4px', minHeight: 300 }}>

                    {/* Narrow Stadium Container */}
                    <div style={{
                        position: 'absolute',
                        top: '2%', left: '5%', right: '5%', bottom: '2%',
                    }}>

                        {/* LAYER 1: OUTER DARK MATTE PADDED RAIL */}
                        <div style={{
                            position: 'absolute', inset: 0, borderRadius: 9999,
                            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 30%, #0d0d0d 70%, #1a1a1a 100%)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.95), inset 0 2px 4px rgba(255,255,255,0.05)',
                        }}>

                            {/* LAYER 2: OUTER GOLD ACCENT LINE */}
                            <div style={{
                                position: 'absolute', inset: 10, borderRadius: 9999,
                                background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #996600 80%, #FFD700 95%, #FFE066 100%)',
                                boxShadow: 'inset 0 1px 2px rgba(255,255,200,0.8), inset 0 -1px 2px rgba(0,0,0,0.4), 0 0 8px rgba(255,200,0,0.3)',
                            }}>

                                {/* LAYER 3: INNER DARK PADDED SECTION */}
                                <div style={{
                                    position: 'absolute', inset: 5, borderRadius: 9999,
                                    background: 'linear-gradient(180deg, #262626 0%, #1a1a1a 30%, #0f0f0f 70%, #1a1a1a 100%)',
                                    boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.6)',
                                }}>

                                    {/* LAYER 4: INNER GOLD ACCENT LINE */}
                                    <div style={{
                                        position: 'absolute', inset: 8, borderRadius: 9999,
                                        background: 'linear-gradient(135deg, #FFE066 0%, #FFD700 15%, #FFA500 40%, #CC8800 60%, #996600 80%, #FFD700 95%, #FFE066 100%)',
                                        boxShadow: 'inset 0 1px 2px rgba(255,255,200,0.7), inset 0 -1px 2px rgba(0,0,0,0.3), 0 0 6px rgba(255,200,0,0.25)',
                                    }}>

                                        {/* LAYER 5: FINAL DARK FRAME */}
                                        <div style={{
                                            position: 'absolute', inset: 4, borderRadius: 9999,
                                            background: 'linear-gradient(180deg, #222 0%, #111 50%, #1a1a1a 100%)',
                                            boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.7)',
                                        }}>

                                            {/* LAYER 6: DARK FELT SURFACE */}
                                            <div style={{
                                                position: 'absolute', inset: 3, borderRadius: 9999,
                                                background: 'radial-gradient(ellipse at 50% 40%, #1a1a1a 0%, #0f0f0f 30%, #080808 60%, #050505 100%)',
                                                boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)',
                                            }}>

                                                {/* Table Branding */}
                                                <div style={{
                                                    position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)',
                                                    textAlign: 'center', opacity: 0.12, pointerEvents: 'none',
                                                }}>
                                                    <div style={{ fontSize: 10, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#444' }}>
                                                        Smarter.Poker
                                                    </div>
                                                    <div style={{ fontSize: 7, color: '#8b6914', marginTop: 1 }}>
                                                        Odds Calculator
                                                    </div>
                                                </div>

                                                {/* COMMUNITY BOARD — center of table */}
                                                {config.hasBoard && (
                                                    <div style={{
                                                        position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)',
                                                        display: 'flex', gap: 4, cursor: 'pointer', zIndex: 10,
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
                                                                            width: BOARD_CARD_W, height: BOARD_CARD_H, borderRadius: 4,
                                                                            border: '1px solid rgba(255,255,255,0.25)',
                                                                            boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
                                                                        }} />
                                                                </div>
                                                            ) : (
                                                                <div key={i} style={{
                                                                    width: BOARD_CARD_W, height: BOARD_CARD_H, borderRadius: 4,
                                                                    border: `1.5px dashed ${isActive ? '#1877F2' : 'rgba(255,255,255,0.1)'}`,
                                                                    background: 'rgba(0,0,0,0.15)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 10, color: 'rgba(255,255,255,0.15)',
                                                                }}>
                                                                    {['F', 'F', 'F', 'T', 'R'][i]}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PLAYER SEATS — positioned over the table */}
                    {hands.map((hand, pi) => {
                        const pos = SEAT_POSITIONS[pi];
                        if (!pos) return null;
                        const isHero = pi === 0;
                        const isSelected = selectedSlot?.type === 'hand' && selectedSlot.playerIdx === pi;
                        const equity = results?.[pi];
                        const color = PLAYER_COLORS[pi];
                        const cw = isHero ? HERO_CARD_W : CARD_W;
                        const ch = isHero ? HERO_CARD_H : CARD_H;

                        return (
                            <div key={pi} style={{
                                position: 'absolute',
                                left: `${pos.x}%`, top: `${pos.y}%`,
                                transform: 'translate(-50%, -50%)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                cursor: 'pointer', zIndex: isHero ? 100 : 50,
                            }}
                                onClick={() => setSelectedSlot({ type: 'hand', playerIdx: pi })}>

                                {/* Cards */}
                                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                                    {Array.from({ length: config.holeCards }).map((_, ci) => {
                                        const card = hand[ci];
                                        return card ? (
                                            <div key={ci} onClick={e => { e.stopPropagation(); removeCard('hand', pi, ci); }}
                                                style={{ cursor: 'pointer' }}>
                                                <img src={getCardImage(card.rank, card.suit)} alt=""
                                                    style={{
                                                        width: cw, height: ch, borderRadius: 4,
                                                        border: '1px solid rgba(255,255,255,0.25)',
                                                        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
                                                    }} />
                                            </div>
                                        ) : (
                                            <div key={ci} style={{
                                                width: cw, height: ch, borderRadius: 4,
                                                overflow: 'hidden', position: 'relative',
                                                border: `1.5px dashed ${isSelected ? color : 'rgba(255,255,255,0.12)'}`,
                                                background: 'rgba(0,0,0,0.3)',
                                            }}>
                                                <img src={`/images/card-backs/${cardBack}.jpg`} alt=""
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }} />
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Gold Name Badge — exact from TrainingGameTable */}
                                <div style={{
                                    background: isSelected
                                        ? `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`
                                        : 'linear-gradient(180deg, #FFD700 0%, #FFA500 50%, #CC8800 100%)',
                                    border: isSelected ? `2px solid ${color}` : '2px solid #996600',
                                    borderRadius: 4,
                                    padding: '1px 10px 3px',
                                    textAlign: 'center',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                                    minWidth: 50,
                                }}>
                                    <span style={{
                                        display: 'block', fontSize: 9, fontWeight: 'bold',
                                        color: isSelected ? '#fff' : '#000', lineHeight: 1.2,
                                    }}>
                                        {isHero ? '★ Hero' : `Villain ${pi}`}
                                    </span>
                                    {equity && (
                                        <span style={{
                                            display: 'block', fontSize: 13, fontWeight: 900,
                                            color: isSelected ? '#fff' : '#000', lineHeight: 1.1,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {equity.equity.toFixed(1)}%
                                        </span>
                                    )}
                                </div>

                                {/* Remove X for villains */}
                                {!isHero && hands.length > 2 && (
                                    <button onClick={e => { e.stopPropagation(); removePlayer(pi); }}
                                        style={{
                                            position: 'absolute', top: -8, right: -8,
                                            width: 18, height: 18, borderRadius: '50%',
                                            background: '#EF4444', border: '2px solid #0a0a0a', color: '#fff',
                                            fontSize: 9, cursor: 'pointer', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            zIndex: 200,
                                        }}>✕</button>
                                )}
                            </div>
                        );
                    })}

                    {/* + Add Villain */}
                    {hands.length < 7 && (() => {
                        const nextPos = SEAT_POSITIONS[hands.length];
                        if (!nextPos) return null;
                        return (
                            <div style={{
                                position: 'absolute',
                                left: `${nextPos.x}%`, top: `${nextPos.y}%`,
                                transform: 'translate(-50%, -50%)',
                                cursor: 'pointer', zIndex: 40,
                            }}
                                onClick={addVillain}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    border: '2px dashed rgba(255,215,0,0.25)',
                                    background: 'rgba(0,0,0,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 20, color: 'rgba(255,215,0,0.3)',
                                    transition: 'all 0.2s',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#FFD700'; e.currentTarget.style.color = '#FFD700'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,215,0,0.25)'; e.currentTarget.style.color = 'rgba(255,215,0,0.3)'; }}>
                                    +
                                </div>
                                <div style={{ fontSize: 7, color: 'rgba(255,215,0,0.25)', textAlign: 'center', marginTop: 2 }}>Add Villain</div>
                            </div>
                        );
                    })()}
                </div>

                {/* ─── ACTION BAR ─── */}
                <div style={{ padding: '4px 10px 6px', display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={resetAll}
                        style={{ padding: '6px 12px', borderRadius: 6, background: '#1a1a1a', border: '1px solid #333', color: '#888', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                        ↺ New Hand
                    </button>
                    <button onClick={() => setSelectedSlot({ type: 'board' })}
                        style={{
                            padding: '6px 12px', borderRadius: 6, border: '1px solid #333', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: selectedSlot?.type === 'board' ? '#1877F2' : '#1a1a1a',
                            color: selectedSlot?.type === 'board' ? '#fff' : '#888',
                        }}>
                        Board
                    </button>
                    <button onClick={() => setSelectedSlot({ type: 'dead' })}
                        style={{
                            padding: '6px 12px', borderRadius: 6, border: '1px solid #333', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: selectedSlot?.type === 'dead' ? '#EF4444' : '#1a1a1a',
                            color: selectedSlot?.type === 'dead' ? '#fff' : '#888',
                        }}>
                        Dead{deadCards.length > 0 ? ` (${deadCards.length})` : ''}
                    </button>
                    {PRESETS[game] && (
                        <button onClick={() => setShowPresets(!showPresets)}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #333', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                background: showPresets ? '#1877F2' : '#1a1a1a',
                                color: showPresets ? '#fff' : '#888',
                            }}>
                            Presets
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    {validCount >= 2 && !results && (
                        <button onClick={runCalculation} disabled={calculating}
                            style={{
                                padding: '6px 16px', borderRadius: 6, background: '#1877F2', border: 'none',
                                color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                opacity: calculating ? 0.5 : 1,
                            }}>
                            {calculating ? '⏳' : '▶ Calculate'}
                        </button>
                    )}
                </div>

                {/* Dead Cards Display */}
                {deadCards.length > 0 && (
                    <div style={{
                        padding: '4px 10px', display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 9, color: '#555' }}>Dead:</span>
                        {deadCards.map((c, i) => (
                            <div key={i} onClick={() => removeCard('dead', 0, i)} style={{ cursor: 'pointer' }}>
                                <img src={getCardImage(c.rank, c.suit)} alt=""
                                    style={{ width: 26, height: 36, borderRadius: 3, border: '1px solid #EF4444', opacity: 0.4 }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Presets */}
                {showPresets && PRESETS[game] && (
                    <div style={{
                        margin: '0 10px 6px', display: 'flex', gap: 4, flexWrap: 'wrap',
                        background: '#111', borderRadius: 8, padding: 8, border: '1px solid #222',
                    }}>
                        {PRESETS[game].map((p, i) => (
                            <button key={i} onClick={() => loadPreset(p)}
                                style={{
                                    padding: '5px 10px', borderRadius: 5, background: '#0a0a0a', border: '1px solid #333',
                                    color: '#aaa', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                }}>
                                {p.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    borderTop: '1px solid #222', padding: '8px 16px',
                    background: '#0a0a0a', textAlign: 'center',
                }}>
                    <span style={{ fontSize: 8, color: '#444' }}>
                        Monte Carlo • 10,000 Iterations • {config.holeCards} Hole Cards • {config.hasBoard ? '5 Community' : 'No Board'} • Up To 7 Players
                    </span>
                </div>
            </div>
        </>
    );
}
