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
                    padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href="/hub" style={{ color: '#B0B3B8', textDecoration: 'none', fontSize: 13 }}>← World Hub</Link>
                        <span style={{ color: '#3A3B3C' }}>|</span>
                        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            🧮 Poker Odds Calculator
                        </h1>
                    </div>
                    <span style={{ fontSize: 12, color: '#6A6B6D', letterSpacing: 1.5 }}>SMARTER.POKER</span>
                </div>

                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
                    {/* ─── GAME TABS ─── */}
                    <div style={{
                        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20,
                        background: '#242526', borderRadius: 14, padding: 6, border: '1px solid #3A3B3C',
                    }}>
                        {Object.entries(GAME_CONFIGS).map(([key, cfg]) => (
                            <button key={key} onClick={() => changeGame(key)}
                                style={{
                                    flex: 1, minWidth: 100, padding: '10px 14px', borderRadius: 10, border: 'none',
                                    background: game === key ? '#1877F2' : 'transparent',
                                    color: game === key ? '#fff' : '#B0B3B8',
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap',
                                }}>
                                {cfg.emoji} {cfg.name}
                            </button>
                        ))}
                    </div>

                    {/* ─── ACTION BAR ─── */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
                    }}>

                        <button onClick={resetAll}
                            style={{ padding: '8px 16px', borderRadius: 8, background: '#3A3B3C', border: 'none', color: '#B0B3B8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            ↺ Reset
                        </button>
                        {hands.length < config.maxPlayers && (
                            <button onClick={addPlayer}
                                style={{ padding: '8px 16px', borderRadius: 8, background: '#3A3B3C', border: 'none', color: '#B0B3B8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                + Add Player
                            </button>
                        )}
                        {PRESETS[game] && (
                            <button onClick={() => setShowPresets(!showPresets)}
                                style={{ padding: '8px 16px', borderRadius: 8, background: showPresets ? '#1877F2' : '#3A3B3C', border: 'none', color: showPresets ? '#fff' : '#B0B3B8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                📋 Presets
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        {validCount >= 2 && (
                            <button onClick={runCalculation} disabled={calculating}
                                style={{
                                    padding: '8px 20px', borderRadius: 8, background: '#1877F2', border: 'none',
                                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    opacity: calculating ? 0.6 : 1,
                                }}>
                                {calculating ? '⏳ Calculating...' : '▶ Calculate Equity'}
                            </button>
                        )}
                    </div>

                    {/* ─── PRESETS ─── */}
                    {showPresets && PRESETS[game] && (
                        <div style={{
                            display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
                            background: '#242526', borderRadius: 12, padding: 12, border: '1px solid #3A3B3C',
                        }}>
                            {PRESETS[game].map((p, i) => (
                                <button key={i} onClick={() => loadPreset(p)}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, background: '#18191A', border: '1px solid #3A3B3C',
                                        color: '#E4E6EB', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    }}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
                        {/* ─── LEFT: PLAYERS + BOARD ─── */}
                        <div>
                            {/* Player Hands */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                                {hands.map((hand, pi) => {
                                    const isSelected = selectedSlot?.type === 'hand' && selectedSlot.playerIdx === pi;
                                    const equity = results?.[pi];
                                    return (
                                        <div key={pi} style={{
                                            background: '#242526', borderRadius: 14, padding: 16,
                                            border: `2px solid ${isSelected ? PLAYER_COLORS[pi] : '#3A3B3C'}`,
                                            cursor: 'pointer', transition: 'border-color 0.2s',
                                        }}
                                            onClick={() => setSelectedSlot({ type: 'hand', playerIdx: pi })}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: '50%', background: PLAYER_COLORS[pi],
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 13, fontWeight: 800, color: '#fff',
                                                    }}>
                                                        {pi + 1}
                                                    </div>
                                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>Player {pi + 1}</span>
                                                    <span style={{ fontSize: 11, color: '#6A6B6D' }}>({hand.length}/{config.holeCards} cards)</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    {equity && (
                                                        <span style={{
                                                            fontSize: 22, fontWeight: 900, color: PLAYER_COLORS[pi],
                                                            fontVariantNumeric: 'tabular-nums',
                                                        }}>
                                                            {equity.equity.toFixed(1)}%
                                                        </span>
                                                    )}
                                                    {hands.length > 2 && (
                                                        <button onClick={(e) => { e.stopPropagation(); removePlayer(pi); }}
                                                            style={{
                                                                padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)',
                                                                border: 'none', color: '#EF4444', fontSize: 11, cursor: 'pointer',
                                                            }}>✕</button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card Slots */}
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {Array.from({ length: config.holeCards }).map((_, ci) => {
                                                    const card = hand[ci];
                                                    return card ? (
                                                        <div key={ci} style={{ position: 'relative' }}
                                                            onClick={(e) => { e.stopPropagation(); removeCard('hand', pi, ci); }}>
                                                            <img src={getCardImage(card.rank, card.suit)} alt={`${card.rank} of ${card.suit}`}
                                                                style={{ width: 56, height: 78, borderRadius: 6, border: '2px solid #3A3B3C', cursor: 'pointer' }} />
                                                        </div>
                                                    ) : (
                                                        <div key={ci}
                                                            style={{
                                                                width: 56, height: 78, borderRadius: 6,
                                                                border: `2px dashed ${isSelected ? PLAYER_COLORS[pi] : '#3A3B3C'}`,
                                                                background: '#18191A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: 20, color: '#3A3B3C',
                                                            }}>?</div>
                                                    );
                                                })}
                                            </div>

                                            {/* Equity Bar */}
                                            {equity && (
                                                <div style={{ marginTop: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#18191A', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', borderRadius: 3,
                                                            background: `linear-gradient(90deg, ${PLAYER_COLORS[pi]}, ${PLAYER_COLORS[pi]}88)`,
                                                            width: `${equity.equity}%`, transition: 'width 0.5s ease',
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: 10, color: '#6A6B6D', minWidth: 70, textAlign: 'right' }}>
                                                        W:{equity.wins} T:{equity.ties}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Board */}
                            {config.hasBoard && (
                                <div style={{
                                    background: '#242526', borderRadius: 14, padding: 16,
                                    border: `2px solid ${selectedSlot?.type === 'board' ? '#1877F2' : '#3A3B3C'}`,
                                    cursor: 'pointer', marginBottom: 20,
                                }}
                                    onClick={() => setSelectedSlot({ type: 'board' })}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700 }}>Community Board</span>
                                        <span style={{ fontSize: 11, color: '#6A6B6D' }}>({board.length}/5 cards)</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {Array.from({ length: 5 }).map((_, i) => {
                                            const card = board[i];
                                            const labels = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];
                                            return card ? (
                                                <div key={i} style={{ position: 'relative', textAlign: 'center' }}
                                                    onClick={(e) => { e.stopPropagation(); removeCard('board', 0, i); }}>
                                                    <img src={getCardImage(card.rank, card.suit)} alt=""
                                                        style={{ width: 64, height: 90, borderRadius: 8, border: '2px solid #3A3B3C', cursor: 'pointer' }} />
                                                    <p style={{ fontSize: 9, color: '#6A6B6D', margin: '4px 0 0' }}>{labels[i]}</p>
                                                </div>
                                            ) : (
                                                <div key={i} style={{ textAlign: 'center' }}>
                                                    <div style={{
                                                        width: 64, height: 90, borderRadius: 8,
                                                        border: `2px dashed ${selectedSlot?.type === 'board' ? '#1877F2' : '#3A3B3C'}`,
                                                        background: '#18191A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 22, color: '#3A3B3C',
                                                    }}>?</div>
                                                    <p style={{ fontSize: 9, color: '#6A6B6D', margin: '4px 0 0' }}>{labels[i]}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Dead Cards */}
                            <div style={{
                                background: '#242526', borderRadius: 14, padding: 16,
                                border: `2px solid ${selectedSlot?.type === 'dead' ? '#EF4444' : '#3A3B3C'}`,
                                cursor: 'pointer',
                            }}
                                onClick={() => setSelectedSlot({ type: 'dead' })}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700 }}>Dead Cards</span>
                                    <span style={{ fontSize: 11, color: '#6A6B6D' }}>({deadCards.length} cards removed)</span>
                                </div>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 40 }}>
                                    {deadCards.length === 0 ? (
                                        <span style={{ fontSize: 12, color: '#3A3B3C', padding: 8 }}>Click here, then select cards to mark as dead</span>
                                    ) : (
                                        deadCards.map((c, i) => (
                                            <div key={i} onClick={(e) => { e.stopPropagation(); removeCard('dead', 0, i); }}>
                                                <img src={getCardImage(c.rank, c.suit)} alt="" style={{ width: 36, height: 50, borderRadius: 4, border: '1px solid #EF4444', cursor: 'pointer', opacity: 0.6 }} />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ─── RIGHT: CARD PICKER ─── */}
                        <div style={{
                            background: '#242526', borderRadius: 14, padding: 16,
                            border: '1px solid #3A3B3C', position: 'sticky', top: 20,
                        }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#E4E6EB', marginBottom: 12 }}>
                                {selectedSlot ? (
                                    selectedSlot.type === 'hand' ? `Select card for Player ${selectedSlot.playerIdx + 1}` :
                                        selectedSlot.type === 'board' ? 'Select board card' :
                                            'Select dead card'
                                ) : 'Click a slot to start selecting cards'}
                            </p>

                            {/* Card Grid */}
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
                                                    fontSize: 10, fontWeight: 800, cursor: isDisabled ? 'default' : 'pointer',
                                                    opacity: isUsed ? 0.3 : 1,
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                    padding: 1, transition: 'all 0.15s', lineHeight: 1.1,
                                                }}
                                                onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = '#1877F2'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = isUsed ? '#3A3B3C' : '#18191A'; }}>
                                                <span style={{ fontSize: 11, fontWeight: 900 }}>{rank}</span>
                                                <span style={{ fontSize: 9 }}>{SUIT_SYMBOLS[suit]}</span>
                                            </button>
                                        );
                                    })
                                ))}
                            </div>

                            {/* Suit quick-select row */}
                            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                                {SUITS.map(suit => (
                                    <div key={suit} style={{
                                        flex: 1, textAlign: 'center', fontSize: 18, padding: 4, borderRadius: 6,
                                        background: '#18191A', color: SUIT_COLORS[suit],
                                    }}>
                                        {SUIT_SYMBOLS[suit]}
                                    </div>
                                ))}
                            </div>

                            {/* Instructions */}
                            <div style={{
                                marginTop: 16, padding: 12, borderRadius: 10, background: '#18191A',
                                border: '1px solid #3A3B3C',
                            }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#6A6B6D', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>How to Use</p>
                                <ol style={{ fontSize: 11, color: '#B0B3B8', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                                    <li>Click a player slot or the board</li>
                                    <li>Click cards from the deck above</li>
                                    <li>Equity calculates automatically</li>
                                    <li>Click a dealt card to remove it</li>
                                </ol>
                            </div>

                            {/* Game Info */}
                            <div style={{
                                marginTop: 12, padding: 12, borderRadius: 10, background: '#18191A',
                                border: '1px solid #3A3B3C',
                            }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#6A6B6D', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                    {config.name}
                                </p>
                                <p style={{ fontSize: 11, color: '#B0B3B8', margin: 0 }}>
                                    {config.holeCards} hole cards • {config.hasBoard ? '5 community cards' : 'No community cards'} • Up to {config.maxPlayers} players
                                </p>
                                {(game === 'plo4' || game === 'plo5' || game === 'plo6') && (
                                    <p style={{ fontSize: 10, color: '#F59E0B', margin: '4px 0 0' }}>
                                        ⚠ Must use exactly 2 hole cards + 3 board cards
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    borderTop: '1px solid #3A3B3C', padding: '20px 24px', marginTop: 40,
                    background: '#242526', textAlign: 'center',
                }}>
                    <p style={{ fontSize: 11, color: '#6A6B6D', margin: 0 }}>
                        Monte Carlo simulation • 10,000 iterations • Results are approximations
                    </p>
                    <p style={{ fontSize: 10, color: '#4A4B4C', letterSpacing: 1.5, margin: '4px 0 0' }}>
                        Powered by Smarter.Poker
                    </p>
                </div>
            </div>

            <style jsx global>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 340px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </>
    );
}
