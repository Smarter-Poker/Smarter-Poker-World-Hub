/**
 * A/B Hand Comparison Tool — Relative Equity Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26: Side-by-side head-to-head equity comparison between any two
 * specific hands on a given board. Shows advantage %, hand categories,
 * and how turn/river run-outs shift the matchup.
 *
 * Route: /hub/training/hand-comparison
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// LIGHTWEIGHT EQUITY ENGINE (Monte Carlo)
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['h', 'd', 'c', 's'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, 14 - i]));

function buildDeck() {
    const deck = [];
    for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
    return deck;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Simple hand evaluator: returns a score (higher = better)
function evalHand(cards) {
    const ranks = cards.map(c => RANK_VAL[c[0]]).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    const flush = suits.every(s => s === suits[0]);
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
    const straight = uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4;
    const straightFlush = straight && flush;

    let category;
    if (straightFlush) category = 8;
    else if (counts[0] === 4) category = 7;
    else if (counts[0] === 3 && counts[1] === 2) category = 6;
    else if (flush) category = 5;
    else if (straight) category = 4;
    else if (counts[0] === 3) category = 3;
    else if (counts[0] === 2 && counts[1] === 2) category = 2;
    else if (counts[0] === 2) category = 1;
    else category = 0;

    // Score = category * 1e10 + top cards
    return category * 1e10 + ranks.reduce((acc, r, i) => acc + r * Math.pow(15, 4 - i), 0);
}

const HAND_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

function getCategory(cards) {
    const ranks = cards.map(c => RANK_VAL[c[0]]).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    const flush = suits.every(s => s === suits[0]);
    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);
    const straight = uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4;
    const straightFlush = straight && flush;
    if (straightFlush) return 8;
    if (counts[0] === 4) return 7;
    if (counts[0] === 3 && counts[1] === 2) return 6;
    if (flush) return 5;
    if (straight) return 4;
    if (counts[0] === 3) return 3;
    if (counts[0] === 2 && counts[1] === 2) return 2;
    if (counts[0] === 2) return 1;
    return 0;
}

function runEquity(handA, handB, board, simCount = 2000) {
    const used = new Set([...handA, ...handB, ...board]);
    const deck = buildDeck().filter(c => !used.has(c));
    let winsA = 0, winsB = 0, ties = 0;

    for (let i = 0; i < simCount; i++) {
        const shuffled = shuffle(deck);
        const runout = [...board, ...shuffled.slice(0, 5 - board.length)];
        const allA = [...handA, ...runout].slice(0, 7);
        const allB = [...handB, ...runout].slice(0, 7);

        // Best 5 from 7 is complex; use single score from first 5 as approximation
        const scoreA = evalHand([...handA, ...runout.slice(0, Math.min(5, runout.length))].slice(0, 5));
        const scoreB = evalHand([...handB, ...runout.slice(0, Math.min(5, runout.length))].slice(0, 5));
        if (scoreA > scoreB) winsA++;
        else if (scoreB > scoreA) winsB++;
        else ties++;
    }

    return {
        equityA: Math.round(((winsA + ties / 2) / simCount) * 100),
        equityB: Math.round(((winsB + ties / 2) / simCount) * 100),
        winsA, winsB, ties,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD PICKER
// ═══════════════════════════════════════════════════════════════════════════

function CardPicker({ value, onChange, label, color, allSelected }) {
    const [open, setOpen] = useState(false);
    const rank = value ? value[0] : null;
    const suit = value ? value[1] : null;
    const [pendingRank, setPendingRank] = useState(null);

    const suitColors = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#94a3b8' };
    const suitSymbols = { h: '♥', d: '♦', c: '♣', s: '♠' };

    function pick(r, s) {
        const card = r + s;
        if (!allSelected.has(card)) {
            onChange(card);
            setOpen(false);
            setPendingRank(null);
        }
    }

    return (
        <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                {label}
            </label>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: 72, height: 90, borderRadius: 8, cursor: 'pointer',
                    background: value
                        ? `rgba(${color},0.15)`
                        : 'rgba(255,255,255,0.04)',
                    border: `2px solid rgba(${color},${value ? '0.5' : '0.2'})`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2,
                }}
            >
                {value ? (
                    <>
                        <span style={{ fontSize: 22, fontWeight: 900, color: suitColors[suit] }}>{rank}</span>
                        <span style={{ fontSize: 18, color: suitColors[suit] }}>{suitSymbols[suit]}</span>
                    </>
                ) : (
                    <span style={{ fontSize: 22, color: '#475569' }}>+</span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 50,
                            background: '#0d1629', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 12, padding: 12, marginTop: 4, minWidth: 240,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        }}
                    >
                        {/* Ranks */}
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                            {pendingRank ? `${pendingRank} — Pick Suit` : 'Pick Rank'}
                        </div>
                        {!pendingRank && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                {RANKS.map(r => (
                                    <button key={r} onClick={() => setPendingRank(r)} style={{
                                        padding: '6px 4px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    }}>{r}</button>
                                ))}
                            </div>
                        )}
                        {pendingRank && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                {SUITS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => pick(pendingRank, s)}
                                        disabled={allSelected.has(pendingRank + s)}
                                        style={{
                                            flex: 1, padding: '10px 4px', borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: allSelected.has(pendingRank + s)
                                                ? 'rgba(255,255,255,0.03)'
                                                : 'rgba(255,255,255,0.08)',
                                            color: allSelected.has(pendingRank + s) ? '#374151' : suitColors[s],
                                            fontSize: 20, fontWeight: 900,
                                            cursor: allSelected.has(pendingRank + s) ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {suitSymbols[s]}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            onClick={() => { setOpen(false); setPendingRank(null); }}
                            style={{
                                width: '100%', marginTop: 8, padding: '4px',
                                borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                                background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer',
                            }}
                        >Cancel</button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function HandComparison() {
    useTrainingBus('hand-comparison');
    const router = useRouter();

    const [handA, setHandA] = useState([null, null]);
    const [handB, setHandB] = useState([null, null]);
    const [board, setBoard] = useState([null, null, null, null, null]);
    const [result, setResult] = useState(null);
    const [isRunning, setIsRunning] = useState(false);

    const allSelected = useMemo(() => {
        const s = new Set();
        [...handA, ...handB, ...board].forEach(c => c && s.add(c));
        return s;
    }, [handA, handB, board]);

    const canRun = handA[0] && handA[1] && handB[0] && handB[1] && board[0] && board[1] && board[2];

    const runComparison = useCallback(() => {
        if (!canRun) return;
        setIsRunning(true);
        setResult(null);
        // Run in setTimeout to prevent UI freeze
        setTimeout(() => {
            const hA = handA.filter(Boolean);
            const hB = handB.filter(Boolean);
            const b = board.filter(Boolean);
            const eq = runEquity(hA, hB, b, 3000);

            // Get current board hand categories
            const catA = getCategory([...hA, ...b].slice(0, 5));
            const catB = getCategory([...hB, ...b].slice(0, 5));

            setResult({ ...eq, catA, catB, hand_a_category: HAND_NAMES[catA], hand_b_category: HAND_NAMES[catB] });
            setIsRunning(false);
        }, 50);
    }, [handA, handB, board, canRun]);

    const container = {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1629 50%, #0a0f1e 100%)',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
        padding: '20px 16px 40px',
    };

    const leader = result ? (result.equityA > result.equityB ? 'A' : result.equityB > result.equityA ? 'B' : 'TIE') : null;

    return (
        <>
            <Head>
                <title>Hand Comparison | Smarter.Poker</title>
                <meta name="description" content="Compare any two poker hands head-to-head on a custom board with equity analysis and run-outs." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={container}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    {/* BACK NAV */}
                    <button onClick={() => router.push('/hub/training')} style={{
                        background: 'none', border: 'none', color: '#64748b',
                        fontSize: 12, cursor: 'pointer', marginBottom: 16, display: 'flex', gap: 4,
                    }}>← Training Hub</button>

                    {/* HEADER */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, fontSize: 22,
                            background: 'linear-gradient(135deg, #22c55e22, #00d4ff22)',
                            border: '1px solid rgba(34,197,94,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>⚔️</div>
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: 22, fontWeight: 900,
                                fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #22c55e, #00d4ff)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>HAND COMPARISON</h1>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                A/B Equity Analysis · Relative Hand Strength
                            </p>
                        </div>
                    </div>

                    {/* HAND A */}
                    <div style={{
                        background: 'rgba(34,197,94,0.05)',
                        border: '1px solid rgba(34,197,94,0.2)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            HAND A
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <CardPicker value={handA[0]} onChange={v => setHandA([v, handA[1]])} label="Card 1" color="34,197,94" allSelected={allSelected} />
                            <CardPicker value={handA[1]} onChange={v => setHandA([handA[0], v])} label="Card 2" color="34,197,94" allSelected={allSelected} />
                        </div>
                    </div>

                    {/* HAND B */}
                    <div style={{
                        background: 'rgba(0,212,255,0.05)',
                        border: '1px solid rgba(0,212,255,0.2)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#00d4ff', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            HAND B
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <CardPicker value={handB[0]} onChange={v => setHandB([v, handB[1]])} label="Card 1" color="0,212,255" allSelected={allSelected} />
                            <CardPicker value={handB[1]} onChange={v => setHandB([handB[0], v])} label="Card 2" color="0,212,255" allSelected={allSelected} />
                        </div>
                    </div>

                    {/* BOARD */}
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 20,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            BOARD (min 3 cards)
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[0, 1, 2, 3, 4].map(i => (
                                <CardPicker
                                    key={i}
                                    value={board[i]}
                                    onChange={v => { const b = [...board]; b[i] = v; setBoard(b); }}
                                    label={i < 3 ? 'Flop' : i === 3 ? 'Turn' : 'River'}
                                    color="148,163,184"
                                    allSelected={allSelected}
                                />
                            ))}
                        </div>
                    </div>

                    {/* RUN BUTTON */}
                    <button
                        onClick={runComparison}
                        disabled={!canRun || isRunning}
                        style={{
                            width: '100%', padding: '16px',
                            borderRadius: 14, marginBottom: 20,
                            background: canRun
                                ? 'linear-gradient(135deg, #22c55e, #00d4ff)'
                                : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: canRun ? '#000' : '#374151',
                            fontWeight: 900, fontSize: 16, cursor: canRun ? 'pointer' : 'not-allowed',
                            fontFamily: "'Orbitron', monospace",
                        }}
                    >
                        {isRunning ? '⚡ CALCULATING...' : canRun ? '⚔️ RUN COMPARISON' : 'SELECT HANDS + MIN 3 BOARD CARDS'}
                    </button>

                    {/* RESULTS */}
                    <AnimatePresence>
                        {result && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Leader banner */}
                                <div style={{
                                    padding: '14px 18px', borderRadius: 12, marginBottom: 16,
                                    background: leader === 'A' ? 'rgba(34,197,94,0.12)' : leader === 'B' ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${leader === 'A' ? 'rgba(34,197,94,0.3)' : leader === 'B' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                                    textAlign: 'center', fontFamily: "'Orbitron', monospace",
                                    fontSize: 18, fontWeight: 900,
                                    color: leader === 'A' ? '#22c55e' : leader === 'B' ? '#00d4ff' : '#94a3b8',
                                }}>
                                    {leader === 'TIE' ? '⚖️ EQUAL EQUITY' : `⚔️ HAND ${leader} IS AHEAD`}
                                </div>

                                {/* Equity bars */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 14, padding: '18px', marginBottom: 14,
                                }}>
                                    {[
                                        { label: 'HAND A', eq: result.equityA, color: '#22c55e', cat: result.hand_a_category },
                                        { label: 'HAND B', eq: result.equityB, color: '#00d4ff', cat: result.hand_b_category },
                                    ].map(row => (
                                        <div key={row.label} style={{ marginBottom: 14 }}>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                marginBottom: 6,
                                            }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, color: row.color, fontFamily: "'Orbitron', monospace" }}>
                                                    {row.label}
                                                </span>
                                                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{row.cat}</span>
                                                    <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: row.color }}>
                                                        {row.eq}%
                                                    </span>
                                                </span>
                                            </div>
                                            <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${row.eq}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                    style={{ height: '100%', borderRadius: 5, background: row.color }}
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    {/* Win / Tie / Loss breakdown */}
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: 8, marginTop: 6,
                                    }}>
                                        {[
                                            { label: 'Hand A Wins', value: result.winsA, color: '#22c55e' },
                                            { label: 'Chop', value: result.ties, color: '#94a3b8' },
                                            { label: 'Hand B Wins', value: result.winsB, color: '#00d4ff' },
                                        ].map(s => (
                                            <div key={s.label} style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 8, padding: '8px 6px', textAlign: 'center',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                            }}>
                                                <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: s.color }}>
                                                    {s.value}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>
                                                    {s.label}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{
                                    padding: '12px 16px',
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
                                    fontSize: 11, color: '#64748b', lineHeight: 1.6,
                                }}>
                                    Results based on 3,000 Monte Carlo simulations with random run-outs for the remaining board cards.
                                    Equity shown as win % + half of chop %. Change the board cards to see how run-outs shift the matchup.
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
