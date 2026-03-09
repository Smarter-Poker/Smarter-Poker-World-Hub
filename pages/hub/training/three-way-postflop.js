/**
 * 3-WAY POSTFLOP SOLVER — Multiway Postflop Solving
 * ═══════════════════════════════════════════════════════════════════════════
 * Configure 3-player postflop scenarios with custom ranges and see
 * solver-recommended strategies for all three positions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// POSITION/RANGE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

const DEFAULT_RANGES = {
    UTG: { range: '77+, ATs+, KQs, AJo+', pct: 13.5 },
    MP: { range: '66+, A8s+, KTs+, QJs, ATo+, KQo', pct: 17.2 },
    HJ: { range: '55+, A5s+, K9s+, QTs+, J9s+, T9s, ATo+, KJo+', pct: 21.3 },
    CO: { range: '44+, A2s+, K6s+, Q9s+, J9s+, T8s+, 98s, A9o+, KTo+, QJo', pct: 27.1 },
    BTN: { range: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 87s, 76s, A5o+, K9o+, QTo+, JTo', pct: 40.8 },
    SB: { range: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 87s, A2o+, K7o+, Q9o+, J9o+', pct: 43.5 },
    BB: { range: 'Defend vs 2.5x: 22+, A2s+, K2s+, Q2s+, J5s+, T6s+, 96s+, 86s+, 75s+, 65s, 54s', pct: 52.0 },
};

const BOARD_TEXTURES = [
    { id: 'dry', label: 'Dry', example: 'K♠ 7♥ 2♦', boards: ['Ks 7h 2d', 'Ah 8c 3d', 'Qd 6s 2h'] },
    { id: 'wet', label: 'Wet', example: 'J♥ T♠ 8♥', boards: ['Jh Ts 8h', 'Tc 9c 7d', '8s 7s 6h'] },
    { id: 'paired', label: 'Paired', example: 'K♠ K♦ 5♣', boards: ['Ks Kd 5c', 'Ah Ad 7s', '9c 9h 3d'] },
    { id: 'monotone', label: 'Monotone', example: 'Q♠ 9♠ 4♠', boards: ['Qs 9s 4s', 'Jh 7h 3h', 'Td 6d 2d'] },
    { id: 'broadw', label: 'Broadway', example: 'A♦ K♠ Q♥', boards: ['Ad Ks Qh', 'Kh Qc Js', 'As Jd Tc'] },
];

// Simplified GTO-approximate actions for 3-way
function computeThreeWayActions(pos, texture, potType) {
    const isIP = pos === 'BTN' || pos === 'CO';
    const isDry = texture === 'dry' || texture === 'paired';

    if (potType === 'srp') {
        if (isIP) {
            return {
                bet33: isDry ? 45 : 30, bet67: isDry ? 15 : 25, bet100: 5,
                check: isDry ? 35 : 40,
                fold: 0,
                note: isIP
                    ? 'IP in a multiway SRP — use smaller c-bet sizes. Equity disperses across more players.'
                    : 'OOP in multiway pot — check more frequently. Your range is capped.',
            };
        }
        return {
            bet33: isDry ? 25 : 15, bet67: 10, bet100: 3,
            check: isDry ? 55 : 65, fold: 0,
            note: 'OOP in 3-way SRP — check most of your range. Only bet strong value and occasional blockers.',
        };
    }
    // 3BP
    return {
        bet33: isDry ? 55 : 40, bet67: isDry ? 20 : 30, bet100: 10,
        check: isDry ? 15 : 20, fold: 0,
        note: '3-Bet pot as aggressor — c-bet frequently. Your range is stronger and opponents are capped.',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ActionBar({ label, pct, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#b0b3b8', width: 55, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>{label}</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, position: 'relative' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }}
                    style={{ position: 'absolute', height: '100%', background: color, borderRadius: 4 }}
                />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color, width: 36, textAlign: 'right' }}>{pct}%</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ThreeWayPostflopPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [players, setPlayers] = useState([
        { pos: 'CO', locked: false },
        { pos: 'BTN', locked: false },
        { pos: 'BB', locked: false },
    ]);
    const [selectedTexture, setSelectedTexture] = useState('dry');
    const [potType, setPotType] = useState('srp'); // 'srp' | '3bp'
    const [selectedPlayer, setSelectedPlayer] = useState(0);
    const [stackDepth, setStackDepth] = useState(100);
    const [solvesRun, setSolvesRun] = useState(0);

    useTrainingBus('three-way-postflop');

    useEffect(() => {
        try { setUser(getAuthUser()); } catch (_) { }
    }, []);

    const actions = useMemo(() => {
        const result = computeThreeWayActions(players[selectedPlayer].pos, selectedTexture, potType);
        setSolvesRun(prev => {
            const next = prev + 1;
            if (next > 1 && next % 3 === 0) {
                busEmit('training:session-complete', { game_id: 'three-way-postflop', accuracy: 100, correct_answers: next, total_questions: next, hands_played: next });
            }
            return next;
        });
        return result;
    }, [selectedPlayer, selectedTexture, potType, players]);

    const texture = BOARD_TEXTURES.find(t => t.id === selectedTexture);

    return (
        <>
            <Head>
                <title>3-Way Postflop Solver | Smarter.Poker</title>
                <meta name="description" content="Analyze multiway postflop scenarios with 3 players and custom ranges" />
            </Head>

            <div style={{ minHeight: '100vh', background: '#18191a', color: '#e4e6eb', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
                    <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>
                        Back to Training
                    </button>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>3-Way Postflop Solver</h1>
                    <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>Configure multiway postflop scenarios with custom positions and ranges</p>
                </div>

                <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
                    {/* Player Position Config */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
                    }}>
                        {players.map((p, i) => (
                            <div
                                key={i}
                                onClick={() => setSelectedPlayer(i)}
                                style={{
                                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                                    background: selectedPlayer === i ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)',
                                    border: `2px solid ${selectedPlayer === i ? '#818cf8' : 'rgba(255,255,255,0.06)'}`,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: selectedPlayer === i ? '#818cf8' : '#b0b3b8', letterSpacing: '0.06em' }}>
                                        PLAYER {i + 1}
                                    </span>
                                </div>
                                <select
                                    value={p.pos}
                                    onChange={e => {
                                        const np = [...players];
                                        np[i] = { ...np[i], pos: e.target.value };
                                        setPlayers(np);
                                    }}
                                    style={{
                                        width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb',
                                    }}
                                >
                                    {POSITIONS.map(pos => (<option key={pos} value={pos}>{pos}</option>))}
                                </select>
                                <div style={{ fontSize: 11, color: '#b0b3b8', marginTop: 6 }}>
                                    Range: {DEFAULT_RANGES[p.pos].pct}%
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Board Texture + Pot Type */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#b0b3b8', display: 'block', marginBottom: 6, letterSpacing: '0.08em' }}>BOARD TEXTURE</label>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {BOARD_TEXTURES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedTexture(t.id)}
                                        style={{
                                            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            background: selectedTexture === t.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${selectedTexture === t.id ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                                            color: selectedTexture === t.id ? '#818cf8' : '#b0b3b8',
                                        }}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: '#b0b3b8', display: 'block', marginBottom: 6, letterSpacing: '0.08em' }}>POT TYPE</label>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[{ id: 'srp', label: 'SRP' }, { id: '3bp', label: '3-Bet Pot' }].map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setPotType(t.id)}
                                        style={{
                                            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                            background: potType === t.id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                                            border: `1px solid ${potType === t.id ? '#4ade80' : 'rgba(255,255,255,0.08)'}`,
                                            color: potType === t.id ? '#4ade80' : '#b0b3b8',
                                        }}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Board Display */}
                    <div style={{
                        padding: '14px 20px', background: 'rgba(0,0,0,0.3)', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16, textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#b0b3b8', marginBottom: 6, letterSpacing: '0.1em' }}>BOARD</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#e4e6eb', letterSpacing: '0.15em', fontFamily: "'Rajdhani', sans-serif" }}>
                            {texture?.example || 'K 7 2'}
                        </div>
                    </div>

                    {/* Strategy Output */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: 12, padding: 20,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e6eb', margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>
                                Strategy — {players[selectedPlayer].pos} ({potType === 'srp' ? 'Single Raised Pot' : '3-Bet Pot'})
                            </h3>
                            <div style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                background: 'rgba(99,102,241,0.15)', color: '#818cf8', letterSpacing: '0.08em',
                            }}>
                                {texture?.label.toUpperCase()} BOARD
                            </div>
                        </div>

                        <ActionBar label="Bet 33%" pct={actions.bet33} color="#4ade80" />
                        <ActionBar label="Bet 67%" pct={actions.bet67} color="#f59e0b" />
                        <ActionBar label="Bet 100%" pct={actions.bet100} color="#ef4444" />
                        <ActionBar label="Check" pct={actions.check} color="#3b82f6" />

                        <div style={{
                            marginTop: 14, padding: '12px 16px', background: 'rgba(99,102,241,0.06)',
                            borderRadius: 8, borderLeft: '3px solid #818cf8',
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: '0.08em', marginBottom: 4 }}>
                                SOLVER NOTE
                            </div>
                            <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5 }}>{actions.note}</div>
                        </div>
                    </div>

                    {/* Range Comparison */}
                    <div style={{ marginTop: 16 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e6eb', margin: '0 0 10px', fontFamily: "'Rajdhani', sans-serif" }}>
                            Player Ranges
                        </h3>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {players.map((p, i) => (
                                <div key={i} style={{
                                    padding: '10px 14px', borderRadius: 8,
                                    background: selectedPlayer === i ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${selectedPlayer === i ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: selectedPlayer === i ? '#818cf8' : '#b0b3b8' }}>
                                            Player {i + 1}: {p.pos}
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#e4e6eb' }}>{DEFAULT_RANGES[p.pos].pct}%</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: '#b0b3b8', fontFamily: "'Courier New', monospace" }}>
                                        {DEFAULT_RANGES[p.pos].range}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
