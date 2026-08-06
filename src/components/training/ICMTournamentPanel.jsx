/**
 * ICM TOURNAMENT PANEL — ICM Calculator & Push/Fold Range Visualizer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style ICM calculator for tournament spots:
 *   - Interactive stack input for up to 9 players
 *   - ICM equity display per player
 *   - Bubble factor and risk premium visualization
 *   - Push/fold range grid adjusted for ICM pressure
 *   - cEV vs $EV comparison panel
 *   - Payout structure selector
 *
 * Uses ICMCalculator engine (#22) for all computations.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
    calculateICM,
    calculateICMPressure,
    getICMPushRange,
    getICMCallRange,
    PAYOUT_STRUCTURES,
} from '../../engines/ICMCalculator';

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITION_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
    '#a855f7', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
];

// ●● Stack Input Row ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StackInput = memo(({ index, stack, onUpdate, icmEquity, isHero, color }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
        opacity: stack <= 0 ? 0.3 : 1,
    }}>
        <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: color, flexShrink: 0,
        }} />
        <div style={{
            width: 50, fontSize: 10, fontWeight: 600,
            color: isHero ? '#00d4ff' : '#94a3b8',
        }}>
            {isHero ? 'Hero' : `P${index + 1}`}
        </div>
        <input
            type="number"
            value={stack}
            onChange={e => onUpdate(index, Number(e.target.value) || 0)}
            style={{
                width: 70, padding: '4px 6px', fontSize: 11,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(100,116,139,0.2)',
                borderRadius: 4, color: '#e2e8f0', outline: 'none', textAlign: 'right',
                fontFamily: "'Fira Code', monospace",
            }}
        />
        <div style={{ fontSize: 9, color: '#64748b', width: 20 }}>BB</div>
        {/* ICM equity bar */}
        <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 4, overflow: 'hidden' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, icmEquity * 100)}%` }}
                style={{ height: '100%', borderRadius: 4, background: color }}
            />
        </div>
        <div style={{
            width: 50, fontSize: 11, fontWeight: 700, textAlign: 'right',
            color: '#e2e8f0', fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
        }}>
            {(icmEquity * 100).toFixed(1)}%
        </div>
    </div>
));

// ●● Push/Fold Range Grid ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PushFoldGrid = memo(({ pushRange, callRange, mode = 'push' }) => {
    const range = mode === 'push' ? pushRange : callRange;
    const color = mode === 'push' ? '#22c55e' : '#3b82f6';

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(13, 1fr)',
            gap: 1,
        }}>
            {RANKS.map((r1, row) =>
                RANKS.map((r2, col) => {
                    let hand;
                    if (row === col) hand = `${r1}${r2}`;
                    else if (row < col) hand = `${r1}${r2}s`;
                    else hand = `${r2}${r1}o`;

                    const inRange = range?.range?.[hand];
                    return (
                        <div
                            key={`${row}-${col}`}
                            style={{
                                aspectRatio: '1/1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 7, fontWeight: 700,
                                background: inRange ? `${color}33` : 'rgba(30,41,59,0.3)',
                                border: inRange ? `1px solid ${color}44` : '1px solid rgba(100,116,139,0.05)',
                                borderRadius: 1,
                                color: inRange ? color : '#334155',
                            }}
                        >
                            {hand}
                        </div>
                    );
                })
            )}
        </div>
    );
});

// ●● Pressure Gauge ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const PressureGauge = memo(({ pressure, bubbleFactor, riskPremium }) => {
    const gaugeColor = pressure >= 0.7 ? '#ef4444' : pressure >= 0.4 ? '#f59e0b' : '#22c55e';
    const angle = -90 + pressure * 180; // -90 to 90 degrees

    return (
        <div style={{ textAlign: 'center' }}>
            <svg viewBox="0 0 120 70" style={{ width: 140, height: 80 }}>
                {/* Background arc */}
                <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
                {/* Colored arc */}
                <path
                    d="M 10 60 A 50 50 0 0 1 110 60"
                    fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${pressure * 157} 157`}
                    opacity="0.8"
                />
                {/* Needle */}
                <line
                    x1="60" y1="60"
                    x2={60 + Math.cos(angle * Math.PI / 180) * 35}
                    y2={60 - Math.sin(angle * Math.PI / 180) * 35}
                    stroke={gaugeColor} strokeWidth="2" strokeLinecap="round"
                />
                <circle cx="60" cy="60" r="4" fill={gaugeColor} />
                {/* Labels */}
                <text x="10" y="68" fontSize="7" fill="#64748b" textAnchor="start">Low</text>
                <text x="110" y="68" fontSize="7" fill="#64748b" textAnchor="end">High</text>
                <text x="60" y="55" fontSize="14" fill={gaugeColor} fontWeight="bold" textAnchor="middle" style={{ fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                    {(pressure * 100).toFixed(0)}
                </text>
            </svg>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4 }}>
                <div>
                    <div style={{ fontSize: 8, color: '#64748b' }}>Bubble Factor</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                        {bubbleFactor.toFixed(2)}x
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 8, color: '#64748b' }}>Risk Premium</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                        {(riskPremium * 100).toFixed(1)}%
                    </div>
                </div>
            </div>
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function ICMTournamentPanel() {
    const [playerCount, setPlayerCount] = useState(6);
    const [heroIdx, setHeroIdx] = useState(0);
    const [stacks, setStacks] = useState([25, 40, 15, 30, 20, 35, 0, 0, 0]);
    const [payoutType, setPayoutType] = useState('standard_mtt');
    const [rangeMode, setRangeMode] = useState('push');
    const [playersLeft, setPlayersLeft] = useState(12);

    const activeStacks = stacks.slice(0, playerCount);
    const totalChips = activeStacks.reduce((a, b) => a + b, 0);

    const updateStack = useCallback((idx, value) => {
        setStacks(prev => {
            const next = [...prev];
            next[idx] = Math.max(0, value);
            return next;
        });
    }, []);

    // Payouts
    const payouts = useMemo(() => {
        const gen = PAYOUT_STRUCTURES[payoutType];
        if (!gen) return [1.0];
        const result = gen(10, playersLeft);
        // Normalize to sum to 1
        const sum = result.reduce((a, b) => a + b, 0);
        return result.map(p => p / sum);
    }, [payoutType, playersLeft]);

    // ICM Equities
    const icmEquities = useMemo(() => {
        if (activeStacks.every(s => s === 0)) return activeStacks.map(() => 0);
        return calculateICM(activeStacks, payouts);
    }, [activeStacks, payouts]);

    // ICM Pressure
    const pressure = useMemo(() => {
        const heroStack = activeStacks[heroIdx] || 0;
        return calculateICMPressure(heroStack, activeStacks, payouts, playersLeft);
    }, [activeStacks, heroIdx, payouts, playersLeft]);

    // Push/Fold Ranges
    const pushRange = useMemo(() => {
        const heroStack = activeStacks[heroIdx] || 20;
        return getICMPushRange(heroStack, pressure.pressure);
    }, [activeStacks, heroIdx, pressure]);

    const callRange = useMemo(() => {
        const heroStack = activeStacks[heroIdx] || 20;
        const avgVillain = activeStacks.filter((_, i) => i !== heroIdx).reduce((a, b) => a + b, 0) / (playerCount - 1);
        return getICMCallRange(heroStack, avgVillain, pressure.pressure);
    }, [activeStacks, heroIdx, pressure, playerCount]);

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    ICM Calculator
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                        value={payoutType}
                        onChange={e => setPayoutType(e.target.value)}
                        style={{
                            padding: '3px 6px', fontSize: 9, fontWeight: 600,
                            background: 'rgba(0,0,0,0.3)', color: '#94a3b8',
                            border: '1px solid rgba(100,116,139,0.2)',
                            borderRadius: 4, outline: 'none',
                        }}
                    >
                        <option value="standard_mtt">Standard MTT</option>
                        <option value="top_heavy">Top Heavy</option>
                        <option value="winner_take_all">Winner Take All</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 9, color: '#64748b' }}>Left:</span>
                        <input
                            type="number"
                            value={playersLeft}
                            onChange={e => setPlayersLeft(Math.max(playerCount, Number(e.target.value) || playerCount))}
                            style={{
                                width: 40, padding: '3px 4px', fontSize: 10,
                                background: 'rgba(0,0,0,0.3)', color: '#e2e8f0',
                                border: '1px solid rgba(100,116,139,0.2)',
                                borderRadius: 3, outline: 'none', textAlign: 'center',
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 9, color: '#64748b' }}>Table:</span>
                        {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <button
                                key={n}
                                onClick={() => setPlayerCount(n)}
                                style={{
                                    width: 20, height: 20, fontSize: 9, fontWeight: 600,
                                    borderRadius: 3, border: '1px solid',
                                    cursor: 'pointer',
                                    background: playerCount === n ? 'rgba(0,212,255,0.1)' : 'transparent',
                                    color: playerCount === n ? '#00d4ff' : '#475569',
                                    borderColor: playerCount === n ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.1)',
                                }}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 0 }}>
                {/* Left: Stack inputs + ICM equity */}
                <div style={{ flex: 1, padding: 12, borderRight: '1px solid rgba(100,116,139,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>
                        Stack Distribution & ICM Equity
                    </div>
                    {activeStacks.map((s, i) => (
                        <StackInput
                            key={i}
                            index={i}
                            stack={s}
                            onUpdate={updateStack}
                            icmEquity={icmEquities[i] || 0}
                            isHero={i === heroIdx}
                            color={POSITION_COLORS[i]}
                        />
                    ))}
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {activeStacks.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setHeroIdx(i)}
                                style={{
                                    padding: '2px 8px', fontSize: 9, fontWeight: 600,
                                    borderRadius: 3, border: '1px solid',
                                    cursor: 'pointer',
                                    background: heroIdx === i ? 'rgba(0,212,255,0.1)' : 'transparent',
                                    color: heroIdx === i ? '#00d4ff' : '#475569',
                                    borderColor: heroIdx === i ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.1)',
                                }}
                            >
                                {heroIdx === i ? 'Hero' : `P${i + 1}`}
                            </button>
                        ))}
                    </div>

                    {/* Pressure gauge */}
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>
                            ICM Pressure
                        </div>
                        <PressureGauge
                            pressure={pressure.pressure}
                            bubbleFactor={pressure.bubbleFactor}
                            riskPremium={pressure.riskPremium}
                        />
                        <div style={{
                            marginTop: 6, fontSize: 10, color: '#818cf8',
                            textAlign: 'center', fontStyle: 'italic',
                        }}>
                            {pressure.description}
                        </div>
                        {pressure.onBubble && (
                            <div style={{
                                marginTop: 4, padding: '4px 8px', borderRadius: 4,
                                background: 'rgba(239,68,68,0.1)', textAlign: 'center',
                                fontSize: 11, fontWeight: 700, color: '#f87171',
                            }}>
                                ON THE BUBBLE
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Push/Fold Range */}
                <div style={{ flex: 1, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                            {rangeMode === 'push' ? 'Push Range' : 'Call Range'}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {['push', 'call'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setRangeMode(m)}
                                    style={{
                                        padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                        borderRadius: 4, border: '1px solid', cursor: 'pointer',
                                        textTransform: 'capitalize',
                                        background: rangeMode === m ? 'rgba(0,212,255,0.1)' : 'transparent',
                                        color: rangeMode === m ? '#00d4ff' : '#64748b',
                                        borderColor: rangeMode === m ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                                    }}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <PushFoldGrid
                        pushRange={pushRange}
                        callRange={callRange}
                        mode={rangeMode}
                    />

                    {/* Range stats */}
                    <div style={{
                        marginTop: 8, display: 'flex', justifyContent: 'center', gap: 16,
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Hands</div>
                            <div style={{
                                fontSize: 14, fontWeight: 700,
                                color: rangeMode === 'push' ? '#22c55e' : '#3b82f6',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}>
                                {(rangeMode === 'push' ? pushRange : callRange).handCount}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Range %</div>
                            <div style={{
                                fontSize: 14, fontWeight: 700,
                                color: rangeMode === 'push' ? '#22c55e' : '#3b82f6',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}>
                                {(rangeMode === 'push' ? pushRange : callRange).percentage.toFixed(1)}%
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 8, color: '#64748b' }}>Hero Stack</div>
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: '#f59e0b',
                                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}>
                                {activeStacks[heroIdx]}BB
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
