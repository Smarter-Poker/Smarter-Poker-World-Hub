/**
 * 🏗️ RANGE BUILDER — Interactive GTO Range Construction + Grading Tool
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 18: Users construct their own preflop range for a given spot by
 * toggling hands on/off, then submit for grading vs solver solution.
 *
 * Route: /hub/training/range-builder
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

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
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];

function getHandNotation(row, col) {
    if (row === col) return `${RANKS[row]}${RANKS[col]}`;
    if (row < col) return `${RANKS[row]}${RANKS[col]}s`;
    return `${RANKS[col]}${RANKS[row]}o`;
}

function getCombos(hand) {
    if (hand.length === 2) return 6;
    if (hand.endsWith('s')) return 4;
    return 12;
}

function getAuthHeaders() {
    try {
        const raw = localStorage.getItem('sb-auth-token')
            || localStorage.getItem('supabase.auth.token');
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.access_token || parsed?.currentSession?.access_token;
            if (token) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        }
    } catch (e) { /* ignore */ }
    return { 'Content-Type': 'application/json' };
}

const DIFF_COLORS = {
    correct: '#22c55e',
    wrong: '#ef4444',
    missed: '#fbbf24',
    partial: '#f97316',
    neutral: '#1e293b',
};

const GRADE_COLORS = {
    'A+': '#22c55e', 'A': '#22c55e', 'A-': '#4ade80',
    'B+': '#3b82f6', 'B': '#3b82f6', 'B-': '#60a5fa',
    'C+': '#fbbf24', 'C': '#fbbf24', 'C-': '#f59e0b',
    'D+': '#f97316', 'D': '#f97316', 'D-': '#fb923c',
    'F': '#ef4444',
};

// ═══════════════════════════════════════════════════════════════════════════
// RANGE BUILDER GRID CELL
// ═══════════════════════════════════════════════════════════════════════════

function BuilderCell({ hand, isSelected, isDiffMode, diffResult, onToggle, size }) {
    const [hovered, setHovered] = useState(false);

    const bgColor = isDiffMode
        ? DIFF_COLORS[diffResult] || DIFF_COLORS.neutral
        : isSelected ? '#22c55e' : '#1e293b';

    const opacity = isDiffMode
        ? (diffResult !== 'neutral' ? 0.85 : 0.2)
        : isSelected ? 0.8 : 0.3;

    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    return (
        <div
            onClick={() => !isDiffMode && onToggle(hand)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: size, height: size,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: typeof size === 'number' ? (size > 28 ? 10 : 8) : 'clamp(7px, 2vw, 10px)', fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                cursor: isDiffMode ? 'default' : 'pointer',
                borderRadius: 2,
                border: hovered && !isDiffMode
                    ? '2px solid #00d4ff'
                    : isSelected && !isDiffMode
                        ? '1px solid rgba(34,197,94,0.6)'
                        : '1px solid rgba(255,255,255,0.08)',
                backgroundColor: bgColor,
                opacity,
                color: isSelected || (isDiffMode && diffResult !== 'neutral') ? '#fff' : '#555',
                position: 'relative',
                transition: 'all 0.1s ease',
                userSelect: 'none',
            }}
        >
            {hand}
            {/* Hand type indicator */}
            {!isDiffMode && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                    background: isPair ? '#a855f7' : isSuited ? '#3b82f6' : 'transparent',
                    borderRadius: '0 0 2px 2px',
                    opacity: 0.5,
                }} />
            )}
            {/* Diff tooltip */}
            {isDiffMode && hovered && diffResult !== 'neutral' && (
                <div style={{
                    position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 6, padding: '4px 8px', whiteSpace: 'nowrap',
                    fontSize: 9, color: DIFF_COLORS[diffResult], fontWeight: 700,
                    zIndex: 100, pointerEvents: 'none',
                }}>
                    {diffResult === 'correct' && 'Correct ✓'}
                    {diffResult === 'wrong' && 'Wrong ✗ (Not in GTO range)'}
                    {diffResult === 'missed' && 'Missed (GTO includes this)'}
                    {diffResult === 'partial' && 'Partial (Mixed frequency)'}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function RangeBuilder() {
    const router = useRouter();
    const bus = useTrainingBus('range-builder');

    // Spot selection
    const [position, setPosition] = useState('BTN');

    // Selection state
    const [selectedHands, setSelectedHands] = useState(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState(null); // 'add' or 'remove'

    // Grading state
    const [grading, setGrading] = useState(false);
    const [result, setResult] = useState(null);

    // Clear result when position changes
    useEffect(() => {
        setResult(null);
    }, [position]);

    // Toggle hand
    const toggleHand = useCallback((hand) => {
        setSelectedHands(prev => {
            const next = new Set(prev);
            if (next.has(hand)) next.delete(hand);
            else next.add(hand);
            return next;
        });
    }, []);

    // Clear all
    const clearAll = useCallback(() => {
        setSelectedHands(new Set());
        setResult(null);
    }, []);

    // Select all pairs
    const selectCategory = useCallback((category) => {
        setSelectedHands(prev => {
            const next = new Set(prev);
            for (let r = 0; r < 13; r++) {
                for (let c = 0; c < 13; c++) {
                    const hand = getHandNotation(r, c);
                    if (category === 'pairs' && r === c) next.add(hand);
                    if (category === 'suited' && r < c) next.add(hand);
                    if (category === 'broadways') {
                        const r1 = RANKS[r], r2 = RANKS[c];
                        if (['A', 'K', 'Q', 'J', 'T'].includes(r1) && ['A', 'K', 'Q', 'J', 'T'].includes(r2)) {
                            next.add(hand);
                        }
                    }
                }
            }
            return next;
        });
    }, []);

    // Computed stats
    const selectionStats = useMemo(() => {
        let totalCombos = 0;
        let pairs = 0, suited = 0, offsuit = 0;
        selectedHands.forEach(hand => {
            const combos = getCombos(hand);
            totalCombos += combos;
            if (hand.length === 2) pairs += combos;
            else if (hand.endsWith('s')) suited += combos;
            else offsuit += combos;
        });
        return {
            handCount: selectedHands.size,
            totalCombos,
            pct: (totalCombos / 1326 * 100).toFixed(1),
            pairs, suited, offsuit,
        };
    }, [selectedHands]);

    // Submit for grading
    const submitRange = useCallback(async () => {
        if (selectedHands.size === 0) return;
        setGrading(true);
        try {
            const res = await fetch('/api/training/grade-range', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({
                    position,
                    scenario: 'rfi',
                    selectedHands: Array.from(selectedHands),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setResult(data);
                // Emit bus events based on grade
                if (data.grade?.score >= 80) {
                    bus.emitDecisionCorrect();
                } else {
                    bus.emitDecisionIncorrect();
                    // Persist to Supabase
                    saveSession({
                        game_id: 'range-builder',
                        hands_played: 1,
                        accuracy: data.score || 0,
                        correct_answers: data.correctCount || 0,
                        total_questions: data.totalCount || 1,
                    });
                }
            }
        } catch (err) {
            console.error('[RangeBuilder] Grade error:', err);
        } finally {
            setGrading(false);
        }
    }, [selectedHands, position]);

    // Build grid
    const gridRows = useMemo(() => {
        const rows = [];
        for (let r = 0; r < 13; r++) {
            const cells = [];
            for (let c = 0; c < 13; c++) {
                cells.push(getHandNotation(r, c));
            }
            rows.push(cells);
        }
        return rows;
    }, []);

    const isDiffMode = !!result;
    const gridDiff = result?.diff?.gridDiff || {};

    return (
        <>
            <Head>
                <title>Range Builder | Smarter.Poker GTO Training</title>
                <meta name="description" content="Build your own preflop range and get graded against GTO solver solutions. Interactive range construction and accuracy analysis." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* ─── Header ─────────────────────────────────────────────── */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                        >
                            ← Training
                        </button>
                        <h1 style={{
                            fontSize: 22, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #f97316, #ef4444)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Range Builder
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#f97316', background: 'rgba(249,115,22,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(249,115,22,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 18
                        </span>
                    </div>

                    {/* Position Selector */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{
                            fontSize: 10, color: '#64748b', fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: 1, marginRight: 4,
                        }}>
                            Build RFI Range for:
                        </span>
                        {POSITIONS.map(pos => (
                            <button
                                key={pos}
                                onClick={() => { setPosition(pos); setSelectedHands(new Set()); }}
                                style={{
                                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                                    cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                    background: position === pos
                                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: position === pos ? '#fff' : '#94a3b8',
                                    fontFamily: "'Orbitron', monospace",
                                }}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Main Content ───────────────────────────────────────── */}
                <div style={{
                    padding: '20px 24px',
                    display: 'flex', gap: 20, justifyContent: 'center',
                    flexWrap: 'wrap', alignItems: 'flex-start',
                }}>
                    {/* Grid */}
                    <div>
                        <div style={{
                            fontSize: 11, fontWeight: 700, color: '#64748b',
                            textAlign: 'center', marginBottom: 8,
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            {isDiffMode ? 'RESULTS — GTO DIFF' : 'SELECT HANDS TO INCLUDE IN YOUR RANGE'}
                        </div>
                        <div style={{
                            display: 'inline-grid',
                            gridTemplateColumns: `repeat(13, clamp(21px, 6.5vw, 34px))`,
                            gap: 1,
                            background: 'rgba(255,255,255,0.03)',
                            padding: 4, borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            {gridRows.flat().map(hand => (
                                <BuilderCell
                                    key={hand}
                                    hand={hand}
                                    isSelected={selectedHands.has(hand)}
                                    isDiffMode={isDiffMode}
                                    diffResult={gridDiff[hand]}
                                    onToggle={toggleHand}
                                    size={"clamp(21px, 6.5vw, 34px)"}
                                />
                            ))}
                        </div>

                        {/* Quick select buttons */}
                        {!isDiffMode && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center' }}>
                                <button onClick={() => selectCategory('pairs')} style={quickBtnStyle}>+ All Pairs</button>
                                <button onClick={() => selectCategory('broadways')} style={quickBtnStyle}>+ Broadways</button>
                                <button onClick={() => selectCategory('suited')} style={quickBtnStyle}>+ All Suited</button>
                                <button onClick={clearAll} style={{ ...quickBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Clear All</button>
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div style={{ width: 240, flexShrink: 0 }}>
                        <AnimatePresence mode="wait">
                            {result ? (
                                /* ─── Grade Results ─────────────────── */
                                <motion.div
                                    key="results"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    style={sidebarStyle}
                                >
                                    {/* Grade */}
                                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                        <div style={{
                                            fontSize: 56, fontWeight: 900,
                                            color: GRADE_COLORS[result.grade?.letter] || '#e2e8f0',
                                            fontFamily: "'Orbitron', monospace",
                                            lineHeight: 1,
                                            textShadow: `0 0 30px ${GRADE_COLORS[result.grade?.letter] || '#fff'}40`,
                                        }}>
                                            {result.grade?.letter}
                                        </div>
                                        <div style={{
                                            fontSize: 14, color: '#94a3b8', fontWeight: 600, marginTop: 4,
                                        }}>
                                            Score: {result.grade?.score}%
                                        </div>
                                        <div style={{
                                            fontSize: 11, color: '#64748b', marginTop: 2,
                                        }}>
                                            Range Accuracy: {result.grade?.accuracy}%
                                        </div>
                                    </div>

                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

                                    {/* Stats */}
                                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                                        BREAKDOWN
                                    </div>
                                    <StatRow label="Correct" value={result.stats?.correctCount} color="#22c55e" />
                                    <StatRow label="Missed" value={result.stats?.missedCount} color="#fbbf24" />
                                    <StatRow label="Wrong" value={result.stats?.wrongCount} color="#ef4444" />
                                    <StatRow label="Mixed" value={result.stats?.mixedCount} color="#f97316" />

                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

                                    <StatRow label="Your Combos" value={result.stats?.userCombos} color="#94a3b8" />
                                    <StatRow label="GTO Combos" value={result.stats?.totalGTOCombos} color="#94a3b8" />
                                    <StatRow label="Overlap" value={result.stats?.overlapCombos} color="#00d4ff" />

                                    {/* Legend */}
                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
                                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                                        LEGEND
                                    </div>
                                    <LegendItem color="#22c55e" label="Correct — You included, GTO includes" />
                                    <LegendItem color="#fbbf24" label="Missed — GTO includes, you didn't" />
                                    <LegendItem color="#ef4444" label="Wrong — You included, GTO doesn't" />
                                    <LegendItem color="#f97316" label="Partial — Mixed frequency hand" />

                                    <button
                                        onClick={() => { setResult(null); setSelectedHands(new Set()); }}
                                        style={{
                                            width: '100%', marginTop: 16, padding: '10px 0',
                                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
                                            fontSize: 12, fontWeight: 700,
                                        }}
                                    >
                                        Try Again
                                    </button>
                                </motion.div>
                            ) : (
                                /* ─── Build Mode Sidebar ───────────── */
                                <motion.div
                                    key="build"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    style={sidebarStyle}
                                >
                                    <div style={{
                                        fontSize: 10, fontWeight: 800, color: '#f97316',
                                        letterSpacing: 1.5, textTransform: 'uppercase',
                                        marginBottom: 12, fontFamily: "'Orbitron', monospace",
                                    }}>
                                        {position} RFI RANGE
                                    </div>

                                    {/* Range % */}
                                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                        <div style={{
                                            fontSize: 36, fontWeight: 900, color: '#e2e8f0',
                                            fontFamily: "'Orbitron', monospace", lineHeight: 1,
                                        }}>
                                            {selectionStats.pct}%
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                                            {selectionStats.totalCombos} / 1326 combos
                                        </div>
                                        <div style={{
                                            width: '100%', height: 6, background: 'rgba(255,255,255,0.06)',
                                            borderRadius: 3, marginTop: 8, overflow: 'hidden',
                                        }}>
                                            <motion.div
                                                animate={{ width: `${selectionStats.pct}%` }}
                                                transition={{ duration: 0.3 }}
                                                style={{
                                                    height: '100%', borderRadius: 3,
                                                    background: 'linear-gradient(90deg, #f97316, #ef4444)',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

                                    {/* Category breakdown */}
                                    <StatRow label="Hands" value={selectionStats.handCount} color="#e2e8f0" />
                                    <StatRow label="Pairs" value={`${selectionStats.pairs} combos`} color="#a855f7" />
                                    <StatRow label="Suited" value={`${selectionStats.suited} combos`} color="#3b82f6" />
                                    <StatRow label="Offsuit" value={`${selectionStats.offsuit} combos`} color="#64748b" />

                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

                                    {/* Instructions */}
                                    <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.5, margin: '0 0 12px' }}>
                                        Click hands to toggle on/off. Build what you think the GTO open-raising range is for {position}, then grade it.
                                    </p>

                                    <button
                                        onClick={submitRange}
                                        disabled={selectedHands.size === 0 || grading}
                                        style={{
                                            width: '100%', padding: '12px 0',
                                            background: selectedHands.size > 0
                                                ? 'linear-gradient(135deg, #f97316, #ef4444)'
                                                : 'rgba(255,255,255,0.06)',
                                            border: 'none', borderRadius: 10,
                                            color: selectedHands.size > 0 ? '#fff' : '#475569',
                                            cursor: selectedHands.size > 0 ? 'pointer' : 'default',
                                            fontSize: 14, fontWeight: 800,
                                            fontFamily: "'Orbitron', monospace",
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {grading ? 'Grading...' : 'Grade My Range'}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Helper Components ──────────────────────────────────────────────────

function StatRow({ label, value, color }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, marginBottom: 4, padding: '2px 0',
        }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{label}</span>
            <span style={{ color, fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>{value}</span>
        </div>
    );
}

function LegendItem({ color, label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{label}</span>
        </div>
    );
}

// ─── Shared Styles ──────────────────────────────────────────────────────

const quickBtnStyle = {
    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
    transition: 'all 0.15s',
};

const sidebarStyle = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 16,
};
