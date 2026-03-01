/**
 * Poker Odds Calculator — /hub/poker-tools
 * ══════════════════════════════════════════
 * Visual poker table layout with Hero + up to 6 Villains
 * Card picker at top, compact table below
 * Supports NLHE, PLO4, PLO5, PLO6, 7-Card Stud, Razz
 * 4 deck back options (white/black/red/blue)
 * Monte Carlo simulation engine
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
    calculateEquity, makeCard, GAME_CONFIGS, PRESETS, parsePresetHands
} from '../../src/lib/poker/pokerOddsEngine';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS = { spades: '#E4E6EB', hearts: '#EF4444', diamonds: '#3B82F6', clubs: '#31A24C' };

const DECK_OPTIONS = [
    { id: 'white', label: 'White', src: '/images/card-backs/white.jpg' },
    { id: 'black', label: 'Black', src: '/images/card-backs/black.jpg' },
    { id: 'red', label: 'Red', src: '/images/card-backs/red.jpg' },
    { id: 'blue', label: 'Blue', src: '/images/card-backs/blue.jpg' },
];

const PLAYER_COLORS = [
    '#F59E0B', '#EF4444', '#31A24C', '#A855F7', '#3B82F6', '#EC4899', '#14B8A6'
];

/* Seat positions around the table (percentages) */
const SEAT_POSITIONS = [
    { x: 50, y: 88, label: 'Hero' },       // 0 = Hero (bottom center)
    { x: 15, y: 65, label: 'Villain 1' },  // 1
    { x: 8, y: 32, label: 'Villain 2' },  // 2
    { x: 25, y: 8, label: 'Villain 3' },  // 3
    { x: 75, y: 8, label: 'Villain 4' },  // 4
    { x: 92, y: 32, label: 'Villain 5' },  // 5
    { x: 85, y: 65, label: 'Villain 6' },  // 6
];

function getCardImage(rank, suit) {
    const r = rank === '10' ? '10' : rank.toLowerCase();
    return `/cards/${suit}_${r}.png`;
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
═══════════════════════════════════════════════════════════ */
export default function PokerToolsPage() {
    const [game, setGame] = useState('nlhe');
    const [hands, setHands] = useState([[], []]); // Start with 2 players (Hero + Villain 1)
    const [board, setBoard] = useState([]);
    const [deadCards, setDeadCards] = useState([]);
    const [results, setResults] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [cardBack, setCardBack] = useState('blue');
    const [showSettings, setShowSettings] = useState(false);
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
        setSelectedSlot(null);
    }, []);

    const changeGame = useCallback((g) => {
        setGame(g);
        resetAll();
    }, [resetAll]);

    const addVillain = useCallback(() => {
        if (hands.length < 7) { // Hero + 6 villains max
            setHands(h => [...h, []]);
        }
    }, [hands.length]);

    const removePlayer = useCallback((idx) => {
        if (hands.length <= 2) return;
        setHands(h => h.filter((_, i) => i !== idx));
        setResults(null);
    }, [hands.length]);

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
    }, [selectedSlot, usedCardIds, config.holeCards]);

    const removeCard = useCallback((type, playerIdx, cardIdx) => {
        if (type === 'hand') {
            setHands(prev => {
                const updated = [...prev];
                updated[playerIdx] = updated[playerIdx].filter((_, i) => i !== cardIdx);
                return updated;
            });
        } else if (type === 'board') {
            setBoard(prev => prev.filter((_, i) => i !== cardIdx));
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

    // Auto-calculate when hands are ready
    useEffect(() => {
        const validHands = hands.filter(h => h.length === config.holeCards);
        if (validHands.length >= 2) runCalculation();
    }, [hands, board, config.holeCards]);

    const validCount = hands.filter(h => h.length === config.holeCards).length;

    /* ═══════════════════════════════════════════════════════════
       RENDER
    ═══════════════════════════════════════════════════════════ */
    return (
        <>
            <Head>
                <title>Poker Odds Calculator | Smarter.Poker</title>
                <meta name="description" content="Free poker odds calculator for Hold'em, Omaha, PLO5, PLO6, Stud, and Razz. Calculate equity with Monte Carlo simulation." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh', background: '#18191A', color: '#E4E6EB',
                fontFamily: "'Inter', sans-serif", textTransform: 'capitalize',
            }}>
                {/* ─── HEADER ─── */}
                <div style={{
                    background: '#242526', borderBottom: '1px solid #3A3B3C',
                    padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href="/hub" style={{ color: '#B0B3B8', textDecoration: 'none', fontSize: 12 }}>← World Hub</Link>
                        <span style={{ color: '#3A3B3C' }}>|</span>
                        <h1 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>🧮 Poker Odds Calculator</h1>
                    </div>
                    <button onClick={() => setShowSettings(!showSettings)}
                        style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}>
                        ⚙️
                    </button>
                </div>

                {/* ─── SETTINGS PANEL (deck selector) ─── */}
                {showSettings && (
                    <div style={{
                        background: '#242526', borderBottom: '1px solid #3A3B3C', padding: '12px 16px',
                    }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#6A6B6D', margin: '0 0 8px', letterSpacing: 1 }}>DECK STYLE</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {DECK_OPTIONS.map(d => (
                                <div key={d.id} onClick={() => setCardBack(d.id)}
                                    style={{
                                        cursor: 'pointer', textAlign: 'center', borderRadius: 8,
                                        border: cardBack === d.id ? '2px solid #FFD700' : '2px solid #3A3B3C',
                                        padding: 6, background: cardBack === d.id ? 'rgba(255,215,0,0.08)' : 'transparent',
                                        transition: 'all 0.2s',
                                    }}>
                                    <img src={d.src} alt={d.label} style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4 }} />
                                    <div style={{ fontSize: 9, fontWeight: 700, color: cardBack === d.id ? '#FFD700' : '#6A6B6D', marginTop: 4 }}>{d.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 10px' }}>
                    {/* ─── GAME TABS ─── */}
                    <div style={{
                        display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8,
                        background: '#242526', borderRadius: 10, padding: 3, border: '1px solid #3A3B3C',
                    }}>
                        {Object.entries(GAME_CONFIGS).map(([key, cfg]) => (
                            <button key={key} onClick={() => changeGame(key)}
                                style={{
                                    flex: 1, minWidth: 60, padding: '7px 4px', borderRadius: 7, border: 'none',
                                    background: game === key ? '#1877F2' : 'transparent',
                                    color: game === key ? '#fff' : '#B0B3B8',
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}>
                                {cfg.emoji} {cfg.name}
                            </button>
                        ))}
                    </div>

                    {/* ═══════════════════════════════════════════════════════
                        CARD PICKER — FULL WIDTH, LARGE TOUCH TARGETS
                    ═══════════════════════════════════════════════════════ */}
                    <div style={{
                        background: '#242526', borderRadius: 10, padding: '8px 6px',
                        border: `2px solid ${selectedSlot ? '#1877F2' : '#3A3B3C'}`,
                        marginBottom: 8, transition: 'border-color 0.2s',
                    }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#E4E6EB', margin: '0 0 6px 4px' }}>
                            {selectedSlot ? (
                                selectedSlot.type === 'hand'
                                    ? `Select Card For ${selectedSlot.playerIdx === 0 ? 'Hero' : 'Villain ' + selectedSlot.playerIdx}`
                                    : selectedSlot.type === 'board' ? 'Select Board Card' : 'Select Dead Card'
                            ) : 'Tap A Seat Below, Then Pick Cards'}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 2 }}>
                            {SUITS.map(suit => (
                                RANKS.map(rank => {
                                    const card = makeCard(rank, suit);
                                    const isUsed = card && usedCardIds.has(card.id);
                                    const isDisabled = !selectedSlot || isUsed;
                                    return (
                                        <button key={`${rank}-${suit}`}
                                            onClick={() => !isDisabled && selectCard(rank, suit)}
                                            disabled={isDisabled}
                                            style={{
                                                width: '100%', aspectRatio: '0.7', borderRadius: 3, border: 'none',
                                                background: isUsed ? '#3A3B3C' : '#18191A',
                                                color: isUsed ? '#4A4B4C' : SUIT_COLORS[suit],
                                                fontSize: 11, fontWeight: 900, cursor: isDisabled ? 'default' : 'pointer',
                                                opacity: isUsed ? 0.25 : 1,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                padding: 0, transition: 'all 0.15s', lineHeight: 1.1, minHeight: 32,
                                            }}
                                            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = '#1877F2'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isUsed ? '#3A3B3C' : '#18191A'; }}>
                                            <span style={{ fontSize: 12, fontWeight: 900 }}>{rank}</span>
                                            <span style={{ fontSize: 10 }}>{SUIT_SYMBOLS[suit]}</span>
                                        </button>
                                    );
                                })
                            ))}
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════════════
                        POKER TABLE
                    ═══════════════════════════════════════════════════════ */}
                    <div style={{
                        position: 'relative', width: '100%', paddingBottom: '60%',
                        marginBottom: 8, borderRadius: 16, overflow: 'hidden',
                    }}>
                        {/* Table felt background */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'radial-gradient(ellipse at 50% 45%, #1a5c2a 0%, #14472a 40%, #0d3520 70%, #0a2918 100%)',
                            borderRadius: 16,
                            border: '4px solid #2a2a2a',
                            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.4)',
                        }}>
                            {/* Gold rail accent */}
                            <div style={{
                                position: 'absolute', inset: 4, borderRadius: 12,
                                border: '2px solid rgba(180,140,50,0.3)',
                            }} />

                            {/* Table branding */}
                            <div style={{
                                position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%, -50%)',
                                textAlign: 'center', opacity: 0.15,
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>SMARTER.POKER</div>
                                <div style={{ fontSize: 9, color: '#fff', marginTop: 2 }}>ODDS CALCULATOR</div>
                            </div>

                            {/* Community Board — Center of table */}
                            {config.hasBoard && (
                                <div style={{
                                    position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                                    display: 'flex', gap: 3, cursor: 'pointer', zIndex: 10,
                                }}
                                    onClick={() => setSelectedSlot({ type: 'board' })}>
                                    {Array.from({ length: 5 }).map((_, i) => {
                                        const card = board[i];
                                        const isActive = selectedSlot?.type === 'board';
                                        return card ? (
                                            <div key={i} onClick={(e) => { e.stopPropagation(); removeCard('board', 0, i); }}>
                                                <img src={getCardImage(card.rank, card.suit)} alt=""
                                                    style={{
                                                        width: 36, height: 50, borderRadius: 3,
                                                        border: '1px solid rgba(255,255,255,0.3)',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                                                    }} />
                                            </div>
                                        ) : (
                                            <div key={i} style={{
                                                width: 36, height: 50, borderRadius: 3,
                                                border: `1.5px dashed ${isActive ? '#1877F2' : 'rgba(255,255,255,0.2)'}`,
                                                background: 'rgba(0,0,0,0.2)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, color: 'rgba(255,255,255,0.2)',
                                            }}>?</div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Player Seats */}
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
                                        cursor: 'pointer', zIndex: isHero ? 20 : 15,
                                    }}
                                        onClick={() => setSelectedSlot({ type: 'hand', playerIdx: pi })}>
                                        {/* Cards */}
                                        <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                                            {Array.from({ length: config.holeCards }).map((_, ci) => {
                                                const card = hand[ci];
                                                return card ? (
                                                    <div key={ci} onClick={(e) => { e.stopPropagation(); removeCard('hand', pi, ci); }}>
                                                        <img src={getCardImage(card.rank, card.suit)} alt=""
                                                            style={{
                                                                width: isHero ? 34 : 28, height: isHero ? 48 : 39,
                                                                borderRadius: 3, border: '1px solid rgba(255,255,255,0.3)',
                                                                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                                            }} />
                                                    </div>
                                                ) : (
                                                    <div key={ci} style={{
                                                        width: isHero ? 34 : 28, height: isHero ? 48 : 39,
                                                        borderRadius: 3, overflow: 'hidden',
                                                        border: `1.5px dashed ${isSelected ? color : 'rgba(255,255,255,0.15)'}`,
                                                        background: 'rgba(0,0,0,0.3)',
                                                    }}>
                                                        <img src={`/images/card-backs/${cardBack}.jpg`} alt="" style={{
                                                            width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3,
                                                        }} />
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Name + Equity Badge */}
                                        <div style={{
                                            background: isSelected ? color : 'rgba(0,0,0,0.7)',
                                            borderRadius: 4, padding: '2px 8px',
                                            border: `1.5px solid ${isSelected ? color : 'rgba(255,255,255,0.15)'}`,
                                            textAlign: 'center', transition: 'all 0.2s',
                                            minWidth: 50,
                                        }}>
                                            <div style={{
                                                fontSize: 8, fontWeight: 800,
                                                color: isSelected ? '#fff' : '#B0B3B8',
                                            }}>
                                                {isHero ? '★ Hero' : `V${pi}`}
                                            </div>
                                            {equity && (
                                                <div style={{
                                                    fontSize: 12, fontWeight: 900,
                                                    color: isSelected ? '#fff' : color,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {equity.equity.toFixed(1)}%
                                                </div>
                                            )}
                                        </div>

                                        {/* Remove button for villains */}
                                        {!isHero && hands.length > 2 && (
                                            <button onClick={(e) => { e.stopPropagation(); removePlayer(pi); }}
                                                style={{
                                                    position: 'absolute', top: -6, right: -6,
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: '#EF4444', border: 'none', color: '#fff',
                                                    fontSize: 9, cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    lineHeight: 1, zIndex: 30,
                                                }}>✕</button>
                                        )}
                                    </div>
                                );
                            })}

                            {/* + Add Villain button */}
                            {hands.length < 7 && (() => {
                                const nextPos = SEAT_POSITIONS[hands.length];
                                if (!nextPos) return null;
                                return (
                                    <div style={{
                                        position: 'absolute',
                                        left: `${nextPos.x}%`, top: `${nextPos.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                        cursor: 'pointer', zIndex: 10,
                                    }}
                                        onClick={addVillain}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            border: '2px dashed rgba(255,255,255,0.2)',
                                            background: 'rgba(0,0,0,0.3)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 18, color: 'rgba(255,255,255,0.3)',
                                            transition: 'all 0.2s',
                                        }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1877F2'; e.currentTarget.style.color = '#1877F2'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
                                            +
                                        </div>
                                        <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 2 }}>
                                            Add
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* ─── ACTION BAR ─── */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button onClick={resetAll}
                            style={{ padding: '6px 12px', borderRadius: 6, background: '#3A3B3C', border: 'none', color: '#B0B3B8', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                            ↺ Reset
                        </button>
                        <button onClick={() => setSelectedSlot({ type: 'board' })}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                background: selectedSlot?.type === 'board' ? '#1877F2' : '#3A3B3C',
                                color: selectedSlot?.type === 'board' ? '#fff' : '#B0B3B8',
                            }}>
                            Board
                        </button>
                        <button onClick={() => setSelectedSlot({ type: 'dead' })}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                background: selectedSlot?.type === 'dead' ? '#EF4444' : '#3A3B3C',
                                color: selectedSlot?.type === 'dead' ? '#fff' : '#B0B3B8',
                            }}>
                            Dead{deadCards.length > 0 ? ` (${deadCards.length})` : ''}
                        </button>
                        {PRESETS[game] && (
                            <button onClick={() => setShowPresets(!showPresets)}
                                style={{
                                    padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    background: showPresets ? '#1877F2' : '#3A3B3C',
                                    color: showPresets ? '#fff' : '#B0B3B8',
                                }}>
                                📋 Presets
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        {validCount >= 2 && (
                            <button onClick={runCalculation} disabled={calculating}
                                style={{
                                    padding: '6px 14px', borderRadius: 6, background: '#1877F2', border: 'none',
                                    color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    opacity: calculating ? 0.6 : 1,
                                }}>
                                {calculating ? '⏳...' : '▶ Calculate'}
                            </button>
                        )}
                    </div>

                    {/* Dead Cards Display */}
                    {deadCards.length > 0 && (
                        <div style={{
                            display: 'flex', gap: 3, flexWrap: 'wrap', padding: '6px 8px',
                            background: '#242526', borderRadius: 8, marginBottom: 8,
                            border: '1px solid #3A3B3C',
                        }}>
                            <span style={{ fontSize: 10, color: '#6A6B6D', alignSelf: 'center', marginRight: 4 }}>Dead:</span>
                            {deadCards.map((c, i) => (
                                <div key={i} onClick={() => removeCard('dead', 0, i)}>
                                    <img src={getCardImage(c.rank, c.suit)} alt=""
                                        style={{ width: 24, height: 34, borderRadius: 2, border: '1px solid #EF4444', cursor: 'pointer', opacity: 0.5 }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Presets */}
                    {showPresets && PRESETS[game] && (
                        <div style={{
                            display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap',
                            background: '#242526', borderRadius: 8, padding: 8, border: '1px solid #3A3B3C',
                        }}>
                            {PRESETS[game].map((p, i) => (
                                <button key={i} onClick={() => loadPreset(p)}
                                    style={{
                                        padding: '5px 10px', borderRadius: 5, background: '#18191A', border: '1px solid #3A3B3C',
                                        color: '#E4E6EB', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                    }}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Game Info */}
                    <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
                        <span style={{ fontSize: 9, color: '#4A4B4C' }}>
                            {config.holeCards} Hole Cards • {config.hasBoard ? '5 Community' : 'No Board'} • Up To 7 Players
                        </span>
                        {(game === 'plo4' || game === 'plo5' || game === 'plo6') && (
                            <span style={{ fontSize: 9, color: '#F59E0B', marginLeft: 8 }}>
                                ⚠ Must Use 2 Hole + 3 Board
                            </span>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    borderTop: '1px solid #3A3B3C', padding: '10px 16px',
                    background: '#242526', textAlign: 'center',
                }}>
                    <p style={{ fontSize: 9, color: '#6A6B6D', margin: 0 }}>
                        Monte Carlo Simulation • 10,000 Iterations
                    </p>
                    <p style={{ fontSize: 8, color: '#4A4B4C', letterSpacing: 1.5, margin: '2px 0 0' }}>
                        Powered By Smarter.Poker
                    </p>
                </div>
            </div>
        </>
    );
}
