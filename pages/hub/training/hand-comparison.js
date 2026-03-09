/**
 * A/B Hand Comparison Tool — Relative Equity Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26 (Bug-Swept v2):
 *  - Fixed: evalHand was called with a wrong slice — now uses a proper
 *    best-5-from-N hand evaluator to correctly score 6 or 7 card hands
 *  - Fixed: stale canRun in useCallback — now reads from useMemo inside cb
 *  - Fixed: dead allA/allB variables removed
 *  - Added: busEmit on comparison complete for real-time training dashboard
 *  - Added: "Clear all" button to reset hand/board selections quickly
 *  - Added: Card deselect support — click an existing card to remove it
 *  - Improved: CardPicker now closes on outside click (document listener)
 *
 * Route: /hub/training/hand-comparison
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import Card from '../../../src/components/training/Card';

// ═══════════════════════════════════════════════════════════════════════════
// BUS EMITTER (SSR-safe)
// ═══════════════════════════════════════════════════════════════════════════

// ── Save-session helper (SSR-safe) ──────────────────────────────
function getAuthToken() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
        if (raw) {
            const parsed = JSON.parse(raw);
            return parsed?.access_token || parsed?.currentSession?.access_token || null;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function saveSession(payload) {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/training/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
    }).catch(() => { });
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND EVALUATOR ENGINE — Best 5 From N Cards
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

// Evaluate exactly 5 cards — returns numeric score, higher = better hand
function evalFiveCards(cards) {
    const ranks = cards.map(c => RANK_VAL[c[0]]).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    const flush = suits.every(s => s === suits[0]);

    const rankCounts = {};
    for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const uniqueRanks = Object.keys(rankCounts).map(Number).sort((a, b) => b - a);

    // Wheel straight: A-2-3-4-5
    const isWheelStraight = uniqueRanks.length === 5 &&
        uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[4] === 2;
    const isNormalStraight = uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4;
    const straight = isNormalStraight || isWheelStraight;
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

    // Score: sort by count desc, then rank desc to handle kickers properly
    const sortedByCountThenRank = Object.entries(rankCounts)
        .map(([rank, count]) => ({ rank: Number(rank), count }))
        .sort((a, b) => b.count - a.count || b.rank - a.rank)
        .map(e => e.rank);

    const kicker = sortedByCountThenRank.reduce((acc, r, i) => acc + r * Math.pow(15, 4 - i), 0);
    return category * 1e10 + kicker;
}

// FIX: Proper best-5-from-N evaluator using combinations
function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === k) return [arr];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = combinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

function bestHandScore(cards) {
    if (cards.length <= 5) return evalFiveCards(cards);
    const combos = combinations(cards, 5);
    return Math.max(...combos.map(evalFiveCards));
}

function bestHandCategory(cards) {
    if (cards.length < 3) return 0;
    const clipped = cards.slice(0, Math.min(cards.length, 7));
    if (clipped.length <= 5) {
        const score = evalFiveCards(clipped);
        return Math.floor(score / 1e10);
    }
    const combos = combinations(clipped, 5);
    let best = -Infinity;
    let bestCat = 0;
    for (const combo of combos) {
        const s = evalFiveCards(combo);
        if (s > best) { best = s; bestCat = Math.floor(s / 1e10); }
    }
    return bestCat;
}

const HAND_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

// FIX: runEquity now uses proper best-5-from-7 scoring
function runEquity(handA, handB, board, simCount = 3000) {
    const used = new Set([...handA, ...handB, ...board]);
    const deck = buildDeck().filter(c => !used.has(c));
    let winsA = 0, winsB = 0, ties = 0;
    const remaining = 5 - board.length;

    for (let i = 0; i < simCount; i++) {
        const shuffled = shuffle(deck);
        const runout = [...board, ...shuffled.slice(0, remaining)];
        // Full 7 cards for each hand — best 5 from 7
        const cardsA = [...handA, ...runout]; // 2 + 5 = 7
        const cardsB = [...handB, ...runout]; // 2 + 5 = 7
        const scoreA = bestHandScore(cardsA);
        const scoreB = bestHandScore(cardsB);
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
// CARD PICKER — With outside-click dismiss and deselect support
// ═══════════════════════════════════════════════════════════════════════════

function CardPicker({ value, onChange, onClear, label, color, allSelected }) {
    const [open, setOpen] = useState(false);
    const [pendingRank, setPendingRank] = useState(null);
    const ref = useRef(null);

    const rank = value ? value[0] : null;
    const suit = value ? value[1] : null;

    const suitColors = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#94a3b8' };
    const suitSymbols = { h: '♥', d: '♦', c: '♣', s: '♠' };

    // FIX: Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                setPendingRank(null);
            }
        }
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [open]);

    function pick(r, s) {
        const card = r + s;
        if (!allSelected.has(card)) {
            onChange(card);
            setOpen(false);
            setPendingRank(null);
        }
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <label style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                {label}
            </label>
            <button
                onClick={() => {
                    if (value) { onClear(); } else { setOpen(!open); }
                }}
                style={{
                    width: 72, height: 90, borderRadius: 8, cursor: 'pointer',
                    background: value ? `rgba(${color},0.15)` : 'rgba(255,255,255,0.04)',
                    border: `2px solid rgba(${color},${value ? '0.5' : '0.2'})`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    position: 'relative',
                }}
            >
                {value ? (
                    <>
                        <Card rank={rank} suit={suit} size="medium" />
                        <span style={{ position: 'absolute', top: 2, right: 5, fontSize: 10, color: '#64748b' }}>✕</span>
                    </>
                ) : (
                    <span style={{ fontSize: 22, color: '#475569' }}>+</span>
                )}
            </button>

            {!value && (
                <button
                    onClick={() => setOpen(!open)}
                    style={{
                        width: '100%', marginTop: 3, padding: '3px 0',
                        borderRadius: 5, border: '1px solid rgba(255,255,255,0.07)',
                        background: 'none', color: '#475569', fontSize: 9, cursor: 'pointer',
                        fontWeight: 700,
                    }}
                >PICK</button>
            )}

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 100,
                            background: '#0d1629', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 12, padding: 12, marginTop: 4, minWidth: 280,
                            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                        }}
                    >
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
                                {SUITS.map(s => {
                                    const card = pendingRank + s;
                                    const disabled = allSelected.has(card);
                                    return (
                                        <button key={s} onClick={() => pick(pendingRank, s)} disabled={disabled} style={{
                                            flex: 1, padding: '10px 4px', borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                                            color: disabled ? '#374151' : { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#94a3b8' }[s],
                                            fontSize: 20, fontWeight: 900,
                                            cursor: disabled ? 'not-allowed' : 'pointer',
                                        }}>
                                            {suitSymbols[s]}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {pendingRank && (
                                <button onClick={() => setPendingRank(null)} style={{
                                    flex: 1, padding: '4px', borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                                }}>← Back</button>
                            )}
                            <button onClick={() => { setOpen(false); setPendingRank(null); }} style={{
                                flex: 1, padding: '4px', borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer',
                            }}>Cancel</button>
                        </div>
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

    // FIX: derive canRun inside the component rather than inside callback
    const canRun = Boolean(handA[0] && handA[1] && handB[0] && handB[1] && board[0] && board[1] && board[2]);

    const handleClearAll = useCallback(() => {
        setHandA([null, null]);
        setHandB([null, null]);
        setBoard([null, null, null, null, null]);
        setResult(null);
    }, []);

    const runComparison = useCallback(() => {
        // FIX: guard uses local canRun check — no stale closure
        const hA = handA.filter(Boolean);
        const hB = handB.filter(Boolean);
        const b = board.filter(Boolean);
        if (hA.length < 2 || hB.length < 2 || b.length < 3) return;

        setIsRunning(true);
        setResult(null);

        // Push to next tick so UI shows "CALCULATING..."
        setTimeout(() => {
            const eq = runEquity(hA, hB, b, 3000);

            // FIX: Use correct best-5-from-N for category with all available cards
            const catA = bestHandCategory([...hA, ...b]);
            const catB = bestHandCategory([...hB, ...b]);

            const res = {
                ...eq,
                catA, catB,
                hand_a_category: HAND_NAMES[catA],
                hand_b_category: HAND_NAMES[catB],
            };
            setResult(res);
            setIsRunning(false);

            // Emit to training event bus
            eventBus.emit('training:session-complete', {
                game_id: 'hand-comparison',
                winner: eq.equityA > eq.equityB ? 'A' : eq.equityB > eq.equityA ? 'B' : 'TIE',
                equityA: eq.equityA,
                equityB: eq.equityB,
            });
            // Persist to Supabase
            saveSession({
                game_id: 'hand-comparison',
                hands_played: 1,
                accuracy: eq.equityA > eq.equityB ? 100 : 0,
                correct_answers: 1,
                total_questions: 1,
            });
        }, 50);
    }, [handA, handB, board]); // FIX: removed `canRun` from deps — guard is direct check

    const leader = result
        ? (result.equityA > result.equityB ? 'A' : result.equityB > result.equityA ? 'B' : 'TIE')
        : null;

    const container = {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1629 50%, #0a0f1e 100%)',
        color: '#e2e8f0', fontFamily: "'Inter', sans-serif", padding: '20px 16px 40px',
    };

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <button onClick={() => router.push('/hub/training')} style={{
                            background: 'none', border: 'none', color: '#64748b',
                            fontSize: 12, cursor: 'pointer', display: 'flex', gap: 4,
                        }}>← Training Hub</button>
                        {allSelected.size > 0 && (
                            <button onClick={handleClearAll} style={{
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: 8, color: '#ef4444', padding: '4px 12px',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}>🗑 Clear All</button>
                        )}
                    </div>

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
                                margin: 0, fontSize: 22, fontWeight: 900, fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #22c55e, #00d4ff)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>HAND COMPARISON</h1>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                A/B Equity Analysis · Best-5-From-7 · Monte Carlo
                            </p>
                        </div>
                    </div>

                    {/* HAND A */}
                    <div style={{
                        background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            HAND A
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <CardPicker
                                value={handA[0]}
                                onChange={v => setHandA([v, handA[1]])}
                                onClear={() => setHandA([null, handA[1]])}
                                label="Card 1" color="34,197,94" allSelected={allSelected}
                            />
                            <CardPicker
                                value={handA[1]}
                                onChange={v => setHandA([handA[0], v])}
                                onClear={() => setHandA([handA[0], null])}
                                label="Card 2" color="34,197,94" allSelected={allSelected}
                            />
                        </div>
                    </div>

                    {/* HAND B */}
                    <div style={{
                        background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#00d4ff', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            HAND B
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <CardPicker
                                value={handB[0]}
                                onChange={v => setHandB([v, handB[1]])}
                                onClear={() => setHandB([null, handB[1]])}
                                label="Card 1" color="0,212,255" allSelected={allSelected}
                            />
                            <CardPicker
                                value={handB[1]}
                                onChange={v => setHandB([handB[0], v])}
                                onClear={() => setHandB([handB[0], null])}
                                label="Card 2" color="0,212,255" allSelected={allSelected}
                            />
                        </div>
                    </div>

                    {/* BOARD */}
                    <div style={{
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 20,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 10, fontFamily: "'Orbitron', monospace" }}>
                            BOARD <span style={{ color: '#475569', fontWeight: 600, fontSize: 10 }}>(min 3 for Flop)</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {[0, 1, 2, 3, 4].map(i => (
                                <CardPicker
                                    key={i}
                                    value={board[i]}
                                    onChange={v => { const b = [...board]; b[i] = v; setBoard(b); }}
                                    onClear={() => { const b = [...board]; b[i] = null; setBoard(b); }}
                                    label={i < 3 ? `Flop ${i + 1}` : i === 3 ? 'Turn' : 'River'}
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
                            width: '100%', padding: '16px', borderRadius: 14, marginBottom: 20,
                            background: canRun && !isRunning
                                ? 'linear-gradient(135deg, #22c55e, #00d4ff)'
                                : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: canRun && !isRunning ? '#000' : '#374151',
                            fontWeight: 900, fontSize: 16,
                            cursor: canRun && !isRunning ? 'pointer' : 'not-allowed',
                            fontFamily: "'Orbitron', monospace",
                            transition: 'all 0.2s',
                        }}
                    >
                        {isRunning
                            ? '⚡ CALCULATING...'
                            : canRun
                                ? '⚔️ RUN COMPARISON (3,000 sims)'
                                : 'SELECT HANDS + MIN 3 BOARD CARDS TO BEGIN'}
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
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 14, padding: '18px', marginBottom: 14,
                                }}>
                                    {[
                                        { label: 'HAND A', eq: result.equityA, color: '#22c55e', cat: result.hand_a_category },
                                        { label: 'HAND B', eq: result.equityB, color: '#00d4ff', cat: result.hand_b_category },
                                    ].map(row => (
                                        <div key={row.label} style={{ marginBottom: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
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
                                                    initial={{ width: 0 }} animate={{ width: `${row.eq}%` }}
                                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                                    style={{ height: '100%', borderRadius: 5, background: row.color }}
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    {/* Win / Tie / Loss breakdown */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
                                        {[
                                            { label: 'Hand A Wins', value: result.winsA, color: '#22c55e' },
                                            { label: 'Chop', value: result.ties, color: '#94a3b8' },
                                            { label: 'Hand B Wins', value: result.winsB, color: '#00d4ff' },
                                        ].map(s => (
                                            <div key={s.label} style={{
                                                background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 6px',
                                                textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)',
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

                                {/* Run again with different board */}
                                <button
                                    onClick={runComparison}
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: 10, marginBottom: 12,
                                        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                                        color: '#22c55e', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                                        fontFamily: "'Orbitron', monospace",
                                    }}
                                >
                                    🔄 RE-RUN (new random run-outs)
                                </button>

                                <div style={{
                                    padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
                                    fontSize: 11, color: '#64748b', lineHeight: 1.6,
                                }}>
                                    Results based on 3,000 Monte Carlo simulations using the best-5-from-7 hand evaluator.
                                    Equity = Win% + ½ Chop%. Click a selected card to deselect it. Change board cards to study run-outs.
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
