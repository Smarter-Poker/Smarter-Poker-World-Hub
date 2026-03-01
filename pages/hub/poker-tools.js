/**
 * Poker Odds Calculator — /hub/poker-tools
 * ══════════════════════════════════════════
 * Premium equity calculator supporting NLHE, PLO4, PLO5, PLO6, 7-Card Stud, Razz
 * Uses custom Smarter.Poker deck assets + Monte Carlo simulation engine
 * Facebook Dark theme
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
    calculateEquity, makeCard, GAME_CONFIGS, PRESETS, parsePresetHands
} from '../../src/lib/poker/pokerOddsEngine';

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS = { spades: '#E4E6EB', hearts: '#EF4444', diamonds: '#3B82F6', clubs: '#31A24C' };

const PLAYER_COLORS = [
    '#1877F2', '#EF4444', '#31A24C', '#F59E0B', '#A855F7',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

function getCardImage(rank, suit) {
    const r = rank === '10' ? '10' : rank.toLowerCase();
    return `/cards/${suit}_${r}.png`;
}

export default function PokerToolsPage() {
    const [game, setGame] = useState('nlhe');
    const [hands, setHands] = useState([[], []]);
    const [board, setBoard] = useState([]);
    const [deadCards, setDeadCards] = useState([]);
    const [results, setResults] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null); // { type: 'hand'|'board'|'dead', playerIdx?, cardIdx? }
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

    const addPlayer = useCallback(() => {
        if (hands.length < config.maxPlayers) {
            setHands(h => [...h, []]);
        }
    }, [hands.length, config.maxPlayers]);

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
        // Use setTimeout to allow UI to update with loading state
        setTimeout(() => {
            const res = calculateEquity({
                game,
                hands: validHands,
                board,
                dead: deadCards,
                iterations: 10000,
            });
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
        if (validHands.length >= 2) {
            runCalculation();
        }
    }, [hands, board, config.holeCards]);

    const allHandsFull = hands.every(h => h.length === config.holeCards);
    const validCount = hands.filter(h => h.length === config.holeCards).length;

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
                    padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link href="/hub" style={{ color: '#B0B3B8', textDecoration: 'none', fontSize: 12 }}>← World Hub</Link>
                        <span style={{ color: '#3A3B3C' }}>|</span>
                        <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
                            🧮 Poker Odds Calculator
                        </h1>
                    </div>
                    <span style={{ fontSize: 10, color: '#6A6B6D', letterSpacing: 1.5 }}>SMARTER.POKER</span>
                </div>

                <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 10px' }}>
                    {/* ─── GAME TABS ─── */}
                    <div style={{
                        display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10,
                        background: '#242526', borderRadius: 10, padding: 4, border: '1px solid #3A3B3C',
                    }}>
                        {Object.entries(GAME_CONFIGS).map(([key, cfg]) => (
                            <button key={key} onClick={() => changeGame(key)}
                                style={{
                                    flex: 1, minWidth: 70, padding: '8px 6px', borderRadius: 8, border: 'none',
                                    background: game === key ? '#1877F2' : 'transparent',
                                    color: game === key ? '#fff' : '#B0B3B8',
                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}>
                                {cfg.emoji} {cfg.name}
                            </button>
                        ))}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════
                        CARD PICKER — TOP, FULL WIDTH, LARGE TOUCH TARGETS
                    ═══════════════════════════════════════════════════════════ */}
                    <div style={{
                        background: '#242526', borderRadius: 12, padding: '10px 8px',
                        border: `2px solid ${selectedSlot ? '#1877F2' : '#3A3B3C'}`,
                        marginBottom: 10, transition: 'border-color 0.2s',
                    }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#E4E6EB', margin: '0 0 8px 4px' }}>
                            {selectedSlot ? (
                                selectedSlot.type === 'hand' ? `Select Card For Player ${selectedSlot.playerIdx + 1}` :
                                    selectedSlot.type === 'board' ? 'Select Board Card' :
                                        'Select Dead Card'
                            ) : 'Tap A Slot Below, Then Pick A Card'}
                        </p>

                        {/* Card Grid — 13 columns, large buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 3 }}>
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
                                                width: '100%', aspectRatio: '0.72', borderRadius: 4, border: 'none',
                                                background: isUsed ? '#3A3B3C' : '#18191A',
                                                color: isUsed ? '#4A4B4C' : SUIT_COLORS[suit],
                                                fontSize: 12, fontWeight: 900, cursor: isDisabled ? 'default' : 'pointer',
                                                opacity: isUsed ? 0.25 : 1,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                padding: 0, transition: 'all 0.15s', lineHeight: 1.1,
                                                minHeight: 36,
                                            }}
                                            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = '#1877F2'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = isUsed ? '#3A3B3C' : '#18191A'; }}>
                                            <span style={{ fontSize: 13, fontWeight: 900 }}>{rank}</span>
                                            <span style={{ fontSize: 11 }}>{SUIT_SYMBOLS[suit]}</span>
                                        </button>
                                    );
                                })
                            ))}
                        </div>

                        {/* Suit quick-filters */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {SUITS.map(suit => (
                                <div key={suit} style={{
                                    flex: 1, textAlign: 'center', fontSize: 20, padding: 6, borderRadius: 6,
                                    background: '#18191A', color: SUIT_COLORS[suit],
                                }}>
                                    {SUIT_SYMBOLS[suit]}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ─── ACTION BAR ─── */}
                    <div style={{
                        display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center',
                    }}>
                        <button onClick={resetAll}
                            style={{ padding: '7px 14px', borderRadius: 8, background: '#3A3B3C', border: 'none', color: '#B0B3B8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            ↺ Reset
                        </button>
                        {hands.length < config.maxPlayers && (
                            <button onClick={addPlayer}
                                style={{ padding: '7px 14px', borderRadius: 8, background: '#3A3B3C', border: 'none', color: '#B0B3B8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                + Add Player
                            </button>
                        )}
                        {PRESETS[game] && (
                            <button onClick={() => setShowPresets(!showPresets)}
                                style={{ padding: '7px 14px', borderRadius: 8, background: showPresets ? '#1877F2' : '#3A3B3C', border: 'none', color: showPresets ? '#fff' : '#B0B3B8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                📋 Presets
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        {validCount >= 2 && (
                            <button onClick={runCalculation} disabled={calculating}
                                style={{
                                    padding: '7px 16px', borderRadius: 8, background: '#1877F2', border: 'none',
                                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    opacity: calculating ? 0.6 : 1,
                                }}>
                                {calculating ? '⏳ Calculating...' : '▶ Calculate Equity'}
                            </button>
                        )}
                    </div>

                    {/* ─── PRESETS ─── */}
                    {showPresets && PRESETS[game] && (
                        <div style={{
                            display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap',
                            background: '#242526', borderRadius: 10, padding: 10, border: '1px solid #3A3B3C',
                        }}>
                            {PRESETS[game].map((p, i) => (
                                <button key={i} onClick={() => loadPreset(p)}
                                    style={{
                                        padding: '6px 12px', borderRadius: 6, background: '#18191A', border: '1px solid #3A3B3C',
                                        color: '#E4E6EB', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    }}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════
                        COMPACT PLAYER HANDS
                    ═══════════════════════════════════════════════════════════ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                        {hands.map((hand, pi) => {
                            const isSelected = selectedSlot?.type === 'hand' && selectedSlot.playerIdx === pi;
                            const equity = results?.[pi];
                            return (
                                <div key={pi} style={{
                                    background: '#242526', borderRadius: 10, padding: '10px 12px',
                                    border: `2px solid ${isSelected ? PLAYER_COLORS[pi] : '#3A3B3C'}`,
                                    cursor: 'pointer', transition: 'border-color 0.2s',
                                }}
                                    onClick={() => setSelectedSlot({ type: 'hand', playerIdx: pi })}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {/* Player badge */}
                                        <div style={{
                                            width: 24, height: 24, borderRadius: '50%', background: PLAYER_COLORS[pi],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                                        }}>
                                            {pi + 1}
                                        </div>

                                        {/* Card Slots — compact inline */}
                                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                            {Array.from({ length: config.holeCards }).map((_, ci) => {
                                                const card = hand[ci];
                                                return card ? (
                                                    <div key={ci} style={{ position: 'relative' }}
                                                        onClick={(e) => { e.stopPropagation(); removeCard('hand', pi, ci); }}>
                                                        <img src={getCardImage(card.rank, card.suit)} alt={`${card.rank} of ${card.suit}`}
                                                            style={{ width: 38, height: 53, borderRadius: 4, border: '1px solid #3A3B3C', cursor: 'pointer' }} />
                                                    </div>
                                                ) : (
                                                    <div key={ci}
                                                        style={{
                                                            width: 38, height: 53, borderRadius: 4,
                                                            border: `1.5px dashed ${isSelected ? PLAYER_COLORS[pi] : '#3A3B3C'}`,
                                                            background: '#18191A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 14, color: '#3A3B3C',
                                                        }}>?</div>
                                                );
                                            })}
                                        </div>

                                        {/* Equity display — inline */}
                                        {equity ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                <div style={{ width: 60, height: 5, borderRadius: 3, background: '#18191A', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: 3,
                                                        background: PLAYER_COLORS[pi],
                                                        width: `${equity.equity}%`, transition: 'width 0.5s ease',
                                                    }} />
                                                </div>
                                                <span style={{
                                                    fontSize: 16, fontWeight: 900, color: PLAYER_COLORS[pi],
                                                    fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right',
                                                }}>
                                                    {equity.equity.toFixed(1)}%
                                                </span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 10, color: '#4A4B4C', flexShrink: 0 }}>
                                                {hand.length}/{config.holeCards}
                                            </span>
                                        )}

                                        {/* Remove player */}
                                        {hands.length > 2 && (
                                            <button onClick={(e) => { e.stopPropagation(); removePlayer(pi); }}
                                                style={{
                                                    padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)',
                                                    border: 'none', color: '#EF4444', fontSize: 10, cursor: 'pointer', flexShrink: 0,
                                                }}>✕</button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════
                        COMPACT COMMUNITY BOARD
                    ═══════════════════════════════════════════════════════════ */}
                    {config.hasBoard && (
                        <div style={{
                            background: '#242526', borderRadius: 10, padding: '10px 12px',
                            border: `2px solid ${selectedSlot?.type === 'board' ? '#1877F2' : '#3A3B3C'}`,
                            cursor: 'pointer', marginBottom: 10,
                        }}
                            onClick={() => setSelectedSlot({ type: 'board' })}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Board</span>
                                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                    {Array.from({ length: 5 }).map((_, i) => {
                                        const card = board[i];
                                        const labels = ['F', 'F', 'F', 'T', 'R'];
                                        return card ? (
                                            <div key={i} style={{ textAlign: 'center' }}
                                                onClick={(e) => { e.stopPropagation(); removeCard('board', 0, i); }}>
                                                <img src={getCardImage(card.rank, card.suit)} alt=""
                                                    style={{ width: 42, height: 59, borderRadius: 4, border: '1px solid #3A3B3C', cursor: 'pointer' }} />
                                                <p style={{ fontSize: 8, color: '#6A6B6D', margin: '2px 0 0' }}>{['Flop', 'Flop', 'Flop', 'Turn', 'River'][i]}</p>
                                            </div>
                                        ) : (
                                            <div key={i} style={{ textAlign: 'center' }}>
                                                <div style={{
                                                    width: 42, height: 59, borderRadius: 4,
                                                    border: `1.5px dashed ${selectedSlot?.type === 'board' ? '#1877F2' : '#3A3B3C'}`,
                                                    background: '#18191A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, color: '#3A3B3C',
                                                }}>?</div>
                                                <p style={{ fontSize: 8, color: '#6A6B6D', margin: '2px 0 0' }}>{['Flop', 'Flop', 'Flop', 'Turn', 'River'][i]}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <span style={{ fontSize: 10, color: '#6A6B6D', flexShrink: 0 }}>{board.length}/5</span>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════
                        COMPACT DEAD CARDS
                    ═══════════════════════════════════════════════════════════ */}
                    <div style={{
                        background: '#242526', borderRadius: 10, padding: '10px 12px',
                        border: `2px solid ${selectedSlot?.type === 'dead' ? '#EF4444' : '#3A3B3C'}`,
                        cursor: 'pointer', marginBottom: 10,
                    }}
                        onClick={() => setSelectedSlot({ type: 'dead' })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Dead Cards</span>
                            {deadCards.length === 0 ? (
                                <span style={{ fontSize: 10, color: '#3A3B3C' }}>Tap Here, Then Select Cards</span>
                            ) : (
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 }}>
                                    {deadCards.map((c, i) => (
                                        <div key={i} onClick={(e) => { e.stopPropagation(); removeCard('dead', 0, i); }}>
                                            <img src={getCardImage(c.rank, c.suit)} alt="" style={{ width: 28, height: 39, borderRadius: 3, border: '1px solid #EF4444', cursor: 'pointer', opacity: 0.6 }} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <span style={{ fontSize: 10, color: '#6A6B6D', flexShrink: 0 }}>{deadCards.length}</span>
                        </div>
                    </div>

                    {/* Game Info + PLO Rule */}
                    <div style={{
                        display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
                        padding: '6px 12px', marginBottom: 10,
                    }}>
                        <span style={{ fontSize: 10, color: '#6A6B6D' }}>
                            {config.holeCards} Hole Cards • {config.hasBoard ? '5 Community Cards' : 'No Community Cards'} • Up To {config.maxPlayers} Players
                        </span>
                        {(game === 'plo4' || game === 'plo5' || game === 'plo6') && (
                            <span style={{ fontSize: 10, color: '#F59E0B' }}>
                                ⚠ Must Use Exactly 2 Hole Cards + 3 Board Cards
                            </span>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    borderTop: '1px solid #3A3B3C', padding: '12px 16px',
                    background: '#242526', textAlign: 'center',
                }}>
                    <p style={{ fontSize: 10, color: '#6A6B6D', margin: 0 }}>
                        Monte Carlo Simulation • 10,000 Iterations • Results Are Approximations
                    </p>
                    <p style={{ fontSize: 9, color: '#4A4B4C', letterSpacing: 1.5, margin: '2px 0 0' }}>
                        Powered By Smarter.Poker
                    </p>
                </div>
            </div>
        </>
    );
}

