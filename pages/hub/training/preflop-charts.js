/**
 * 📊 PREFLOP CHARTS — GTO Wizard-Style Preflop Range Browser
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 17: Standalone study tool for browsing preflop ranges by position,
 * stack depth, and action scenario. Compare mode for side-by-side analysis.
 *
 * Route: /hub/training/preflop-charts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';
import PreflopChartStats from '../../../src/components/training/PreflopChartStats';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';


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

const GAME_TYPES = [
    { value: 'cash_6max', label: 'Cash 6-Max', icon: '💰' },
    { value: 'mtt', label: 'MTT', icon: '🏆' },
    { value: 'spins', label: 'Spins', icon: '♠️' },
];

const SCENARIOS = [
    { value: 'rfi', label: 'RFI (Raise First In)', desc: 'Open-raising range' },
    { value: 'vs3bet', label: 'Vs 3-Bet', desc: 'Facing a 3-bet after opening' },
    { value: 'bb_defense', label: 'BB Defense', desc: 'Defending big blind vs open' },
    { value: 'push_fold', label: 'Push / Fold', desc: 'Short-stack all-in or fold' },
];

const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
const BB_DEFENSE_POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']; // Who opened (BB is always defending)

const STACK_DEPTHS = {
    cash_6max: [100, 60, 40],
    mtt: [60, 40, 25, 15, 10],
    spins: [25, 15, 10, 8],
};

const ACTION_COLORS = {
    'Raise': '#22c55e',
    'Fold': '#64748b',
    'Call': '#3b82f6',
    '3-Bet': '#ef4444',
    '4-Bet': '#f97316',
    'Push': '#ef4444',
};

// Auth helper
function getAuthHeaders() {
    try {
        const raw = localStorage.getItem('sb-auth-token')
            || localStorage.getItem('supabase.auth.token');
        if (raw) {
            const parsed = JSON.parse(raw);
            const token = parsed?.access_token || parsed?.currentSession?.access_token;
            if (token) return { Authorization: `Bearer ${token}` };
        }
    } catch (e) { /* ignore */ }
    return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PreflopCharts() {
    const router = useRouter();
    useTrainingBus('preflop-charts');

    // Filters
    const [gameType, setGameType] = useState('cash_6max');
    const [scenario, setScenario] = useState('rfi');
    const [position, setPosition] = useState('BTN');
    const [stackDepth, setStackDepth] = useState(100);

    // Data
    const [rangeData, setRangeData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [actions, setActions] = useState([]);

    // Compare mode
    const [compareMode, setCompareMode] = useState(false);
    const [comparePosition, setComparePosition] = useState('UTG');
    const [compareData, setCompareData] = useState(null);
    const [compareStats, setCompareStats] = useState(null);
    const [compareActions, setCompareActions] = useState([]);
    const [loadingCompare, setLoadingCompare] = useState(false);

    // Available stacks for current game type
    const availableStacks = useMemo(() => STACK_DEPTHS[gameType] || [100], [gameType]);

    // Reset stack depth when game type changes
    useEffect(() => {
        const stacks = STACK_DEPTHS[gameType] || [100];
        if (!stacks.includes(stackDepth)) {
            setStackDepth(stacks[0]);
        }
    }, [gameType]);

    // Displayed positions depend on scenario
    const displayedPositions = useMemo(() => {
        if (scenario === 'bb_defense') return BB_DEFENSE_POSITIONS;
        return POSITIONS;
    }, [scenario]);

    // Fetch range data
    const fetchRange = useCallback(async (pos, isCompare = false) => {
        if (isCompare) setLoadingCompare(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({
                gameType,
                stackDepth: stackDepth.toString(),
                position: scenario === 'bb_defense' ? pos : pos,
                scenario,
            });

            const res = await fetch(`/api/training/preflop-ranges?${params}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();

            if (data.success && data.range) {
                if (isCompare) {
                    setCompareData(data.range.gridData);
                    setCompareStats(data.range.stats);
                    setCompareActions(data.range.actions);
                } else {
                    setRangeData(data.range.gridData);
                    busEmit('training:session-complete', { game_id: 'preflop-charts', hands_played: 1 });
                    saveSession({ game_id: 'preflop-charts', hands_played: 1, accuracy: 100, correct_answers: 1, total_questions: 1 });
                    setStats(data.range.stats);
                    setActions(data.range.actions);
                }
            }
        } catch (err) {
            console.error('[PreflopCharts] Fetch error:', err);
        } finally {
            if (isCompare) setLoadingCompare(false);
            else setLoading(false);
        }
    }, [gameType, stackDepth, scenario]);

    // Fetch primary range on filter change
    useEffect(() => {
        fetchRange(position);
    }, [position, fetchRange]);

    // Fetch compare range
    useEffect(() => {
        if (compareMode) {
            fetchRange(comparePosition, true);
        }
    }, [comparePosition, compareMode, fetchRange]);

    // Reset compare when turning off
    useEffect(() => {
        if (!compareMode) {
            setCompareData(null);
            setCompareStats(null);
        }
    }, [compareMode]);

    return (
        <>
            <Head>
                <title>Preflop Charts | Smarter.Poker GTO Training</title>
                <meta name="description" content="Browse GTO preflop ranges by position, stack depth, and scenario. Study optimal open-raising, 3-bet defense, and push/fold ranges." />
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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
                            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Preflop Charts
                        </h1>
                        <span style={{
                            fontSize: 10, color: '#00d4ff', background: 'rgba(0,212,255,0.1)',
                            padding: '3px 8px', borderRadius: 12, fontWeight: 700,
                            border: '1px solid rgba(0,212,255,0.2)',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            PHASE 17
                        </span>
                    </div>

                    {/* ─── Filters ─────────────────────────────────────────── */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {GAME_TYPES.map(gt => (
                            <button
                                key={gt.value}
                                onClick={() => setGameType(gt.value)}
                                style={{
                                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                    cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                    background: gameType === gt.value
                                        ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: gameType === gt.value ? '#fff' : '#94a3b8',
                                }}
                            >
                                {gt.icon} {gt.label}
                            </button>
                        ))}
                    </div>

                    {/* Scenario + Stack */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Scenario:
                            </span>
                            {SCENARIOS.map(sc => (
                                <button
                                    key={sc.value}
                                    onClick={() => setScenario(sc.value)}
                                    title={sc.desc}
                                    style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: scenario === sc.value ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: scenario === sc.value ? '#00d4ff' : '#64748b',
                                    }}
                                >
                                    {sc.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Stack:
                            </span>
                            {availableStacks.map(sd => (
                                <button
                                    key={sd}
                                    onClick={() => setStackDepth(sd)}
                                    style={{
                                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                        background: stackDepth === sd ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: stackDepth === sd ? '#00d4ff' : '#64748b',
                                        fontFamily: "'Orbitron', monospace",
                                    }}
                                >
                                    {sd}BB
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ─── Main Content ───────────────────────────────────────── */}
                <div style={{ padding: '20px 24px' }}>
                    {/* Position Selector + Compare Toggle */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 20, flexWrap: 'wrap', gap: 12,
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                            <span style={{
                                fontSize: 10, color: '#64748b', fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: 1, marginRight: 4,
                            }}>
                                {scenario === 'bb_defense' ? 'Opener:' : 'Position:'}
                            </span>
                            {displayedPositions.map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setPosition(pos)}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                                        cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                                        background: position === pos
                                            ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                                            : 'rgba(255,255,255,0.06)',
                                        color: position === pos ? '#fff' : '#94a3b8',
                                        fontFamily: "'Orbitron', monospace",
                                    }}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>

                        {/* Compare Toggle */}
                        <button
                            onClick={() => {
                                setCompareMode(!compareMode);
                                if (!compareMode && comparePosition === position) {
                                    const alt = displayedPositions.find(p => p !== position);
                                    if (alt) setComparePosition(alt);
                                }
                            }}
                            style={{
                                padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.15s',
                                border: compareMode ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                background: compareMode ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                                color: compareMode ? '#00d4ff' : '#94a3b8',
                            }}
                        >
                            {compareMode ? '✕ Close Compare' : '⇄ Compare Positions'}
                        </button>
                    </div>

                    {/* Compare position selector */}
                    <AnimatePresence>
                        {compareMode && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden', marginBottom: 16 }}
                            >
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center',
                                    padding: '10px 14px',
                                    background: 'rgba(124,58,237,0.08)',
                                    borderRadius: 10,
                                    border: '1px solid rgba(124,58,237,0.2)',
                                }}>
                                    <span style={{
                                        fontSize: 10, color: '#a78bfa', fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 1, marginRight: 4,
                                    }}>
                                        Compare With:
                                    </span>
                                    {displayedPositions.filter(p => p !== position).map(pos => (
                                        <button
                                            key={pos}
                                            onClick={() => setComparePosition(pos)}
                                            style={{
                                                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                                cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                                                background: comparePosition === pos
                                                    ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                                                    : 'rgba(255,255,255,0.06)',
                                                color: comparePosition === pos ? '#fff' : '#94a3b8',
                                                fontFamily: "'Orbitron', monospace",
                                            }}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ─── Grid(s) + Stats ────────────────────────────────── */}
                    <div style={{
                        display: 'flex',
                        gap: 20,
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                    }}>
                        {/* Primary Range */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{
                                fontSize: 12, fontWeight: 800, color: '#00d4ff',
                                fontFamily: "'Orbitron', monospace", marginBottom: 8,
                                padding: '4px 12px', background: 'rgba(0,212,255,0.1)',
                                borderRadius: 6, border: '1px solid rgba(0,212,255,0.2)',
                            }}>
                                {scenario === 'bb_defense' ? `BB vs ${position}` : position} — {stackDepth}BB
                            </div>

                            {loading ? (
                                <div style={{ padding: 60, textAlign: 'center' }}>
                                    <div style={{
                                        width: 36, height: 36, border: '3px solid rgba(0,212,255,0.2)',
                                        borderTop: '3px solid #00d4ff', borderRadius: '50%',
                                        animation: 'spin 1s linear infinite', margin: '0 auto',
                                    }} />
                                    <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Loading range...</p>
                                    <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                </div>
                            ) : rangeData ? (
                                <motion.div
                                    key={`${position}-${scenario}-${stackDepth}`}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <RangeGrid
                                        gridData={rangeData}
                                        actions={actions}
                                        cellSize={compareMode ? "clamp(20px, 6vw, 28px)" : "clamp(21px, 6.5vw, 34px)"}
                                        colorMode="action"
                                    />
                                </motion.div>
                            ) : (
                                <div style={{
                                    padding: 60, textAlign: 'center', color: '#475569',
                                    fontSize: 13,
                                }}>
                                    No range data available for this configuration
                                </div>
                            )}
                        </div>

                        {/* Compare Range */}
                        <AnimatePresence>
                            {compareMode && (
                                <motion.div
                                    initial={{ opacity: 0, x: 30 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 30 }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                >
                                    <div style={{
                                        fontSize: 12, fontWeight: 800, color: '#a855f7',
                                        fontFamily: "'Orbitron', monospace", marginBottom: 8,
                                        padding: '4px 12px', background: 'rgba(168,85,247,0.1)',
                                        borderRadius: 6, border: '1px solid rgba(168,85,247,0.2)',
                                    }}>
                                        {scenario === 'bb_defense' ? `BB vs ${comparePosition}` : comparePosition} — {stackDepth}BB
                                    </div>

                                    {loadingCompare ? (
                                        <div style={{ padding: 60, textAlign: 'center' }}>
                                            <div style={{
                                                width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)',
                                                borderTop: '3px solid #a855f7', borderRadius: '50%',
                                                animation: 'spin 1s linear infinite', margin: '0 auto',
                                            }} />
                                        </div>
                                    ) : compareData ? (
                                        <RangeGrid
                                            gridData={compareData}
                                            actions={compareActions}
                                            cellSize={"clamp(20px, 6vw, 28px)"}
                                            colorMode="action"
                                        />
                                    ) : null}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Stats Sidebar */}
                        <PreflopChartStats
                            stats={stats}
                            position={scenario === 'bb_defense' ? `BB vs ${position}` : position}
                            scenario={scenario}
                            actions={actions}
                        />

                        {/* Compare Stats */}
                        {compareMode && compareStats && (
                            <PreflopChartStats
                                stats={compareStats}
                                position={scenario === 'bb_defense' ? `BB vs ${comparePosition}` : comparePosition}
                                scenario={scenario}
                                actions={compareActions}
                            />
                        )}
                    </div>

                    {/* ─── Scenario Description ──────────────────────────── */}
                    <div style={{
                        marginTop: 24, padding: '14px 18px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                        maxWidth: 700, margin: '24px auto 0',
                    }}>
                        <div style={{
                            fontSize: 10, fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            About This Chart
                        </div>
                        <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                            {scenario === 'rfi' && (
                                <>Open-raising range (RFI) shows which hands to raise with when folded to you in this position. Pure raise (100%) hands are always opened. Mixed frequency hands are sometimes raised, sometimes folded — use a randomizer to stay GTO.</>
                            )}
                            {scenario === 'vs3bet' && (
                                <>Shows how to react when you open-raise and face a 3-bet. High-equity hands 4-bet, medium-equity hands flat call, and the rest fold. Mixed frequencies are common — exact GTO play requires randomization.</>
                            )}
                            {scenario === 'bb_defense' && (
                                <>BB defense range against an open-raise from the selected position. Wider defense ranges apply against late position opens (BTN, CO) and tighter ranges vs early position (UTG, MP). Includes both call and 3-bet frequencies.</>
                            )}
                            {scenario === 'push_fold' && (
                                <>Short-stack push/fold charts for the selected stack depth. Based on Nash equilibrium calculations. At very short stacks (under 10BB), ranges widen significantly as fold equity becomes the dominant factor.</>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
