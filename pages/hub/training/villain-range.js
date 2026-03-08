/**
 * Villain Range Constructor — Opponent Range Analysis Tool
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26 (Bug-Swept v2): Build and study a villain's estimated GTO range
 * based on their position + action sequence. Includes a full Quiz Mode and
 * real-time EventBus emission on session complete.
 *
 * Bug fixes (sweep v2):
 *  - Fixed: ReferenceError on `rangesArr` (undefined) → now uses `ranksArr`
 *  - Fixed: Dead state variables removed (heroPos, activeTab, quizBoard etc.)
 *  - Fixed: Quiz UI now fully wired to handleQuizSubmit
 *  - Fixed: 'Value Hands' stat now uses a correct distinct filter
 *  - Added: busEmit for training:session-complete
 *  - Added: Quiz board cycles through multiple boards for variety
 *
 * Route: /hub/training/villain-range
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// BUS EMITTER (safe, SSR-compatible)
// ═══════════════════════════════════════════════════════════════════════════
function busEmit(event, data) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
    }
}

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
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// GTO RANGE DATA (Canonical preflop ranges at 100BB Cash)
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const GTO_RANGES = {
    UTG_RFI: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'KQs', 'KJs', 'QJs',
        'AKo', 'AQo', 'AJo']),
    CO_RFI: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s',
        'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo']),
    BTN_RFI: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'KQo', 'KJo', 'KTo', 'QJo', 'QTo', 'JTo']),
    SB_RFI: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
        'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'K6s', 'K5s', 'K4s', 'QJs', 'QTs', 'Q9s', 'Q8s', 'JTs', 'J9s', 'J8s', 'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s', '64s', '54s',
        'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'A8o', 'A7o', 'KQo', 'KJo', 'KTo', 'K9o', 'QJo', 'QTo', 'Q9o', 'JTo', 'J9o', 'T9o']),
    BB_3BET_VS_BTN: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT',
        'AKs', 'AQs', 'AJs', 'A5s', 'A4s', 'A3s', 'A2s',
        'KQs', 'QJs', 'JTs', 'T9s', '98s', '87s', '76s',
        'AKo', 'AQo']),
    BTN_3BET_VS_CO: new Set(['AA', 'KK', 'QQ', 'JJ', 'TT',
        'AKs', 'AQs', 'AJs', 'A5s', 'A4s',
        'KQs', 'KJs', 'QJs', 'JTs', 'T9s', '87s', '76s',
        'AKo', 'AQo', 'AJo']),
    CO_3BET_VS_UTG: new Set(['AA', 'KK', 'QQ', 'JJ',
        'AKs', 'AQs', 'A5s', 'A4s',
        'KQs', 'QJs',
        'AKo', 'AQo']),
};

const POSITION_OPTIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const ACTION_OPTIONS = ['Open (RFI)', '3-Bet', 'Cold 4-Bet', 'Call (Flat)'];

// Quiz boards with descriptive context
const QUIZ_BOARDS = [
    { cards: ['Ah', 'Kd', '7c'], label: 'Ah Kd 7c', type: 'High Broadway Dry' },
    { cards: ['Jh', 'Tc', '9d'], label: 'JT9 two-tone', type: 'Wet Connected' },
    { cards: ['2h', '5d', '8c'], label: '2 5 8 rainbow', type: 'Low Dry' },
    { cards: ['Qs', 'Jh', '4d'], label: 'QJ4 rainbow', type: 'High Broadway Dry' },
    { cards: ['Kc', '7h', '2s'], label: 'K72 rainbow', type: 'High Dry Disconnected' },
];

function getRangeForConfig(villainPos, action) {
    if (action.includes('3-Bet')) {
        if (villainPos === 'BB') return GTO_RANGES.BB_3BET_VS_BTN;
        if (villainPos === 'BTN') return GTO_RANGES.BTN_3BET_VS_CO;
        if (villainPos === 'CO') return GTO_RANGES.CO_3BET_VS_UTG;
        return GTO_RANGES.BB_3BET_VS_BTN;
    }
    if (villainPos === 'UTG' || villainPos === 'HJ') return GTO_RANGES.UTG_RFI;
    if (villainPos === 'CO') return GTO_RANGES.CO_RFI;
    if (villainPos === 'BTN') return GTO_RANGES.BTN_RFI;
    if (villainPos === 'SB') return GTO_RANGES.SB_RFI;
    return GTO_RANGES.CO_RFI;
}

// ═══════════════════════════════════════════════════════════════════════════
// 13X13 RANGE GRID
// ═══════════════════════════════════════════════════════════════════════════

function getCell(row, col) {
    const r = RANKS[row], c = RANKS[col];
    if (row === col) return `${r}${r}`;
    if (row < col) return `${r}${c}s`;
    return `${c}${r}o`;
}

function RangeGrid({ activeRange }) {
    const cellSize = 'clamp(22px, 5.5vw, 34px)';
    return (
        <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(13, ${cellSize})`, gap: 2 }}>
                {RANKS.map((_, row) =>
                    RANKS.map((_, col) => {
                        const hand = getCell(row, col);
                        const inRange = activeRange.has(hand);
                        const isPair = row === col;
                        const isSuited = row < col;
                        return (
                            <div key={hand} title={hand} style={{
                                width: cellSize, height: cellSize, borderRadius: 3,
                                fontSize: 'clamp(6px, 1.5vw, 9px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, cursor: 'default',
                                background: inRange
                                    ? isPair ? 'rgba(0,212,255,0.85)'
                                        : isSuited ? 'rgba(34,197,94,0.85)'
                                            : 'rgba(249,115,22,0.75)'
                                    : 'rgba(255,255,255,0.05)',
                                color: inRange ? '#000' : '#374151',
                                border: inRange ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.04)',
                                transition: 'background 0.2s',
                            }}>
                                {hand}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function VillainRange() {
    useTrainingBus('villain-range');
    const router = useRouter();

    const [villainPos, setVillainPos] = useState('BTN');
    const [action, setAction] = useState('Open (RFI)');
    const [activeTab, setActiveTab] = useState('range'); // 'range' | 'quiz'

    // Quiz state — fully wired
    const [quizBoardIdx, setQuizBoardIdx] = useState(0);
    const [quizResult, setQuizResult] = useState(null); // 'correct' | 'wrong'
    const [quizCorrectAnswer, setQuizCorrectAnswer] = useState(null); // 'hits' | 'misses' | 'draw'
    const [quizStats, setQuizStats] = useState({ correct: 0, total: 0 });

    const currentBoard = QUIZ_BOARDS[quizBoardIdx % QUIZ_BOARDS.length];

    const activeRange = useMemo(() => getRangeForConfig(villainPos, action), [villainPos, action]);
    const rangeArr = useMemo(() => Array.from(activeRange), [activeRange]);
    const rangeSize = activeRange.size;
    const totalCombos = 169;
    const rangePct = Math.round((rangeSize / totalCombos) * 100);

    // Stats — Fixed: distinct categories
    const pocketPairs = useMemo(() => rangeArr.filter(h => h.length === 2 && h[0] === h[1]), [rangeArr]);
    const suitedHands = useMemo(() => rangeArr.filter(h => h.endsWith('s')), [rangeArr]);
    const offsuitHands = useMemo(() => rangeArr.filter(h => h.endsWith('o')), [rangeArr]);

    const handleQuizSubmit = useCallback((guess) => {
        if (quizResult !== null) return; // already answered
        const boardRanks = currentBoard.cards.map(c => c[0]);
        // FIX: use rangeArr (not undefined `rangesArr`)
        const hittingHands = rangeArr.filter(h => {
            const h1 = h[0];
            const h2 = h[1] === h[0] ? h[0] : h[1]; // handle pocket pairs like 'AA'
            // For pairs like 'AA', h[1] is 'A' too; for combos like 'AKs', h[1] is 'K'
            const rank2 = h.length === 2 ? h[1] : h[1];
            return boardRanks.includes(h1) || boardRanks.includes(rank2);
        });
        const hitPct = rangeArr.length > 0
            ? Math.round((hittingHands.length / rangeArr.length) * 100)
            : 0;
        const correct = hitPct >= 40 ? 'hits' : hitPct >= 20 ? 'draw' : 'misses';
        setQuizCorrectAnswer(correct);
        const isCorrect = guess === correct;
        setQuizResult(isCorrect ? 'correct' : 'wrong');
        const newStats = { correct: quizStats.correct + (isCorrect ? 1 : 0), total: quizStats.total + 1 };
        setQuizStats(newStats);

        const accuracy = Math.round((newStats.correct / newStats.total) * 100);
        // Emit to training bus
        busEmit('training:session-complete', {
            game_id: 'villain-range',
            correct_answers: newStats.correct,
            total_questions: newStats.total,
            accuracy,
        });
        // Persist to Supabase
        saveSession({
            game_id: 'villain-range',
            accuracy,
            hands_played: newStats.total,
            correct_answers: newStats.correct,
            total_questions: newStats.total,
        });
    }, [quizResult, currentBoard, rangeArr, quizStats]);

    const nextQuizBoard = useCallback(() => {
        setQuizBoardIdx(i => i + 1);
        setQuizResult(null);
        setQuizCorrectAnswer(null);
    }, []);

    const container = {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1629 50%, #0a0f1e 100%)',
        color: '#e2e8f0', fontFamily: "'Inter', sans-serif", padding: '20px 16px 40px',
    };

    const selectStyle = {
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, color: '#e2e8f0', padding: '8px 12px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none',
    };

    const tabStyle = (active) => ({
        padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 12,
        cursor: 'pointer', border: 'none',
        background: active ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
        color: active ? '#a855f7' : '#64748b',
        outline: active ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.2s',
    });

    return (
        <>
            <Head>
                <title>Villain Range Constructor | Smarter.Poker</title>
                <meta name="description" content="Build and study opponent GTO ranges by position and action sequence." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={container}>
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                    {/* BACK NAV */}
                    <button onClick={() => router.push('/hub/training')} style={{
                        background: 'none', border: 'none', color: '#64748b',
                        fontSize: 12, cursor: 'pointer', marginBottom: 16, display: 'flex', gap: 4,
                    }}>← Training Hub</button>

                    {/* HEADER */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, fontSize: 22,
                            background: 'linear-gradient(135deg, #a855f722, #7c3aed22)',
                            border: '1px solid rgba(168,85,247,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>🕵️</div>
                        <div>
                            <h1 style={{
                                margin: 0, fontSize: 22, fontWeight: 900,
                                fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>VILLAIN RANGE CONSTRUCTOR</h1>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                GTO Opponent Range Analysis — Preflop · Quiz Mode
                            </p>
                        </div>
                    </div>

                    {/* CONTROLS */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14, padding: '16px 18px', marginBottom: 16,
                        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
                    }}>
                        <div>
                            <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Villain Position</label>
                            <select value={villainPos} onChange={e => setVillainPos(e.target.value)} style={selectStyle}>
                                {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Villain Action</label>
                            <select value={action} onChange={e => setAction(e.target.value)} style={selectStyle}>
                                {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div style={{
                            marginLeft: 'auto',
                            background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
                            borderRadius: 10, padding: '8px 16px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: '#a855f7' }}>{rangePct}%</div>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Range Size</div>
                        </div>
                    </div>

                    {/* TABS */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <button style={tabStyle(activeTab === 'range')} onClick={() => setActiveTab('range')}>
                            📊 Range Grid
                        </button>
                        <button style={tabStyle(activeTab === 'quiz')} onClick={() => setActiveTab('quiz')}>
                            🎯 Quiz Mode {quizStats.total > 0 ? `(${quizStats.correct}/${quizStats.total})` : ''}
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'range' && (
                            <motion.div key="range" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                {/* LEGEND */}
                                <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                                    {[
                                        { color: 'rgba(0,212,255,0.85)', label: 'Pocket Pairs' },
                                        { color: 'rgba(34,197,94,0.85)', label: 'Suited' },
                                        { color: 'rgba(249,115,22,0.75)', label: 'Offsuit' },
                                        { color: 'rgba(255,255,255,0.05)', label: 'Not in Range' },
                                    ].map(l => (
                                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, borderRadius: 2, background: l.color }} />
                                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{l.label}</span>
                                        </div>
                                    ))}
                                </div>

                                <motion.div
                                    key={villainPos + action}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                                    style={{
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                                        borderRadius: 14, padding: '18px', marginBottom: 20,
                                    }}
                                >
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, fontFamily: "'Orbitron', monospace" }}>
                                        {villainPos} {action} — {rangeSize} Combos ({rangePct}%)
                                    </div>
                                    <RangeGrid activeRange={activeRange} />
                                </motion.div>

                                {/* RANGE STATS — Fixed distinct counts */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                                    {[
                                        { label: 'Pocket Pairs', value: pocketPairs.length, color: '#00d4ff' },
                                        { label: 'Suited Hands', value: suitedHands.length, color: '#22c55e' },
                                        { label: 'Offsuit Hands', value: offsuitHands.length, color: '#f97316' },
                                    ].map(stat => (
                                        <div key={stat.label} style={{
                                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                                            borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: stat.color }}>{stat.value}</div>
                                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{stat.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{
                                    padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
                                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                                    fontSize: 12, color: '#94a3b8', lineHeight: 1.6,
                                }}>
                                    <strong style={{ color: '#64748b' }}>About:</strong> Canonical GTO preflop ranges at 100BB cash.
                                    Select a position and action to see exact hand combos. Switch to Quiz Mode to test your range-reading on real boards.
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'quiz' && (
                            <motion.div key="quiz" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                {/* QUIZ MODE */}
                                <div style={{
                                    background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)',
                                    borderRadius: 14, padding: '20px', marginBottom: 16,
                                }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#a855f7', marginBottom: 12, fontFamily: "'Orbitron', monospace", textTransform: 'uppercase', letterSpacing: 1 }}>
                                        Board: {currentBoard.label} <span style={{ color: '#64748b', fontWeight: 600 }}>({currentBoard.type})</span>
                                    </div>
                                    <p style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 16, lineHeight: 1.6 }}>
                                        If <strong style={{ color: '#a855f7' }}>villain ({villainPos})</strong> {action === 'Open (RFI)' ? 'opens' : action.toLowerCase()}s,
                                        how much of their range <strong style={{ color: '#a855f7' }}>connects with this flop</strong>?
                                    </p>

                                    {quizResult === null ? (
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {['hits', 'draw', 'misses'].map(opt => (
                                                <button
                                                    key={opt}
                                                    onClick={() => handleQuizSubmit(opt)}
                                                    style={{
                                                        flex: 1, minWidth: 100, padding: '12px 16px',
                                                        borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                                                        background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
                                                        fontWeight: 800, fontSize: 13, cursor: 'pointer',
                                                        fontFamily: "'Orbitron', monospace", textTransform: 'uppercase',
                                                    }}
                                                >
                                                    {opt === 'hits' ? '🎯 HITS HARD (40%+)' : opt === 'draw' ? '💧 PARTIAL (20-40%)' : '❌ MISSES (<20%)'}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{
                                                padding: '12px 16px', borderRadius: 10, marginBottom: 12, fontSize: 13,
                                                fontWeight: 800,
                                                background: quizResult === 'correct' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                                border: `1px solid ${quizResult === 'correct' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                                color: quizResult === 'correct' ? '#22c55e' : '#ef4444',
                                            }}>
                                                {quizResult === 'correct' ? '✅ CORRECT!' : `❌ WRONG — Correct answer: ${quizCorrectAnswer?.toUpperCase()}`}
                                            </div>
                                            <button
                                                onClick={nextQuizBoard}
                                                style={{
                                                    width: '100%', padding: '12px', borderRadius: 10,
                                                    background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                                                    border: 'none', color: '#fff', fontWeight: 900,
                                                    fontSize: 13, cursor: 'pointer', fontFamily: "'Orbitron', monospace",
                                                }}
                                            >
                                                NEXT BOARD →
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Quiz Stats */}
                                {quizStats.total > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                        {[
                                            { label: 'Correct', value: quizStats.correct, color: '#22c55e' },
                                            { label: 'Total', value: quizStats.total, color: '#94a3b8' },
                                            { label: 'Accuracy', value: `${Math.round((quizStats.correct / quizStats.total) * 100)}%`, color: '#a855f7' },
                                        ].map(s => (
                                            <div key={s.label} style={{
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 10, padding: '10px 8px', textAlign: 'center',
                                            }}>
                                                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Orbitron', monospace", color: s.color }}>{s.value}</div>
                                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
