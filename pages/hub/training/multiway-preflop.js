/**
 * 🔀 MULTIWAY PREFLOP — 3+ Player Preflop Range Viewer
 * ═══════════════════════════════════════════════════════════════════════════
 * View preflop ranges for common multiway scenarios (3-way, 4-way).
 * BTN open / SB 3-bet / BB cold-call decision trees.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// ═══════════════════════════════════════════════════════════════════════════
// MULTIWAY RANGES DATA — Pre-computed for common spots
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const MULTIWAY_SCENARIOS = {
    'btn_open_sb_3bet_bb_cold': {
        name: 'BTN Open → SB 3-Bet → BB Cold-Call',
        positions: ['BTN', 'SB', 'BB'],
        desc: 'Common 3-way pot scenario. BTN opens, SB 3-bets, BB decides to cold-call or fold.',
        ranges: {
            BTN: { open: 'AA-22, AKs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s-75s, 65s-64s, 54s, AKo-ATo, KQo-KJo, QJo' },
            SB: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo' },
            BB: { coldCall: 'JJ-88, AQs-ATs, KQs-KJs, QJs, JTs, T9s, 98s, AQo-AJo, KQo' },
        },
    },
    'utg_open_mp_3bet_co_cold': {
        name: 'UTG Open → MP 3-Bet → CO Decision',
        positions: ['UTG', 'MP', 'CO'],
        desc: 'Tight 3-way spot. UTG opens from early position, MP 3-bets, CO must decide with a tight range.',
        ranges: {
            UTG: { open: 'AA-66, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo, KQo' },
            MP: { threeBet: 'AA-QQ, AKs, AKo' },
            CO: { coldCall: 'JJ-99, AQs-AJs, KQs' },
        },
    },
    'co_open_btn_flat_bb_squeeze': {
        name: 'CO Open → BTN Flat → BB Squeeze',
        positions: ['CO', 'BTN', 'BB'],
        desc: 'BTN flats CO open, BB has a squeeze opportunity with a polarized range.',
        ranges: {
            CO: { open: 'AA-22, AKs-A2s, KQs-K8s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, 54s, AKo-ATo, KQo-KJo, QJo' },
            BTN: { flat: 'JJ-66, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo-AJo, KQo' },
            BB: { squeeze: 'AA-TT, AKs-AJs, AKo-AQo, A5s-A4s, K9s, Q9s, J8s' },
        },
    },
    'limp_iso_bb': {
        name: 'SB Limp → BB Iso-Raise → 3-Way',
        positions: ['SB', 'BB', 'Caller'],
        desc: 'SB limps, BB iso-raises, one caller. Common 3-way limped pot scenario.',
        ranges: {
            SB: { limp: 'AA-22, AKs-A2s, KQs-K6s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s-86s, 76s, 65s, 54s, AKo-A8o, KQo-KTo, QJo-QTo, JTo' },
            BB: { isoRaise: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
            Caller: { call: 'JJ-55, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo-AJo' },
        },
    },
};

// Generate simple range grid for visualization
function isInRange(hand, rangeStr) {
    if (!rangeStr) return false;
    // Simplified check — in production this would use a proper range parser
    const parts = rangeStr.split(/,\s*/);
    for (const part of parts) {
        if (part.includes('-')) {
            // Range like AA-TT or AKs-ATs
            if (hand.length >= 2 && part.includes(hand)) return true;
        }
        if (hand === part || hand.replace('s', '') === part.replace('s', '').replace('o', '')) return true;
    }
    // Simple heuristic
    return rangeStr.includes(hand.substring(0, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE GRID COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function RangeGrid({ rangeStr, color, label }) {
    const grid = useMemo(() => {
        const cells = [];
        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                const isSuited = c > r;
                const isPair = r === c;
                const hand = isPair
                    ? `${RANKS[r]}${RANKS[c]}`
                    : isSuited
                        ? `${RANKS[r]}${RANKS[c]}s`
                        : `${RANKS[c]}${RANKS[r]}o`;
                const inRange = isInRange(hand, rangeStr);
                cells.push({ hand, inRange, r, c, isSuited, isPair });
            }
        }
        return cells;
    }, [rangeStr]);

    const handsInRange = grid.filter(c => c.inRange).length;
    const pct = ((handsInRange / 169) * 100).toFixed(1);

    return (
        <div style={{
            padding: 12, borderRadius: 10,
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>{pct}% of hands</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
                {grid.map((cell, i) => (
                    <div
                        key={i}
                        title={cell.hand}
                        style={{
                            width: '100%', aspectRatio: '1',
                            borderRadius: 2, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 6, fontWeight: 600,
                            background: cell.inRange ? `${color}50` : 'rgba(255,255,255,0.02)',
                            color: cell.inRange ? '#fff' : '#333',
                            border: `1px solid ${cell.inRange ? `${color}40` : 'transparent'}`,
                            cursor: 'pointer',
                        }}
                    >
                        {cell.hand.length <= 3 ? cell.hand : ''}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MultiwayPreflopPage() {
    const router = useRouter();
    useTrainingBus('multiway-preflop');
    const [selectedScenario, setSelectedScenario] = useState('btn_open_sb_3bet_bb_cold');

    const scenario = MULTIWAY_SCENARIOS[selectedScenario];
    const posColors = { UTG: '#ef4444', MP: '#f97316', CO: '#fbbf24', BTN: '#22c55e', SB: '#3b82f6', BB: '#a855f7', Caller: '#94a3b8' };

    return (
        <>
            <Head>
                <title>Multiway Preflop Ranges | Smarter.Poker Training</title>
                <meta name="description" content="Explore 3+ player preflop range interactions. See how ranges change in multiway pots." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                    >← Training</button>
                    <h1 style={{
                        fontSize: 20, fontWeight: 800, margin: 0,
                        background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        fontFamily: "'Orbitron', monospace",
                    }}>Multiway Preflop</h1>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 800, margin: '0 auto' }}>
                    {/* Scenario Selector */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
                        {Object.entries(MULTIWAY_SCENARIOS).map(([key, s]) => (
                            <motion.button
                                key={key}
                                onClick={() => setSelectedScenario(key)}
                                whileHover={{ scale: 1.02 }}
                                style={{
                                    padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                    textAlign: 'left',
                                    background: selectedScenario === key ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selectedScenario === key ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: selectedScenario === key ? '#a855f7' : '#e2e8f0', marginBottom: 4 }}>
                                    {s.name}
                                </div>
                                <div style={{ fontSize: 9, color: '#64748b' }}>
                                    {s.positions.join(' → ')}
                                </div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Scenario Description */}
                    <div style={{
                        padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                        background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7', marginBottom: 4 }}>
                            {scenario.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{scenario.desc}</div>
                    </div>

                    {/* Range Grids for Each Position */}
                    <div style={{ display: 'grid', gridTemplateColumns: scenario.positions.length <= 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 12 }}>
                        {scenario.positions.map(pos => {
                            const rangeData = scenario.ranges[pos] || {};
                            const action = Object.keys(rangeData)[0] || 'range';
                            const rangeStr = Object.values(rangeData)[0] || '';
                            return (
                                <RangeGrid
                                    key={pos}
                                    rangeStr={rangeStr}
                                    color={posColors[pos] || '#94a3b8'}
                                    label={`${pos} — ${action.replace(/([A-Z])/g, ' $1').trim()}`}
                                />
                            );
                        })}
                    </div>

                    {/* Interaction Legend */}
                    <div style={{
                        marginTop: 20, padding: 12, borderRadius: 10,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Action Flow</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {scenario.positions.map((pos, i) => {
                                const rangeData = scenario.ranges[pos] || {};
                                const action = Object.keys(rangeData)[0] || '';
                                return (
                                    <React.Fragment key={pos}>
                                        <div style={{
                                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                            background: `${posColors[pos] || '#94a3b8'}20`,
                                            color: posColors[pos] || '#94a3b8',
                                            border: `1px solid ${posColors[pos] || '#94a3b8'}40`,
                                        }}>
                                            {pos}: {action.replace(/([A-Z])/g, ' $1').trim()}
                                        </div>
                                        {i < scenario.positions.length - 1 && (
                                            <span style={{ color: '#475569', fontSize: 12 }}>→</span>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
