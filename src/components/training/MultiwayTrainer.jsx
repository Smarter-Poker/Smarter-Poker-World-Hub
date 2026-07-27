/**
 * MULTIWAY TRAINER — 3+ Player Postflop Scenario Practice
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style multiway pot trainer:
 *   - Configure 2-6 player pots
 *   - Visualize how strategy changes with each additional player
 *   - Side-by-side comparison: HU strategy vs multiway
 *   - Key adjustments panel (c-bet freq, bluff freq, sizing)
 *   - Practice scenarios in multiway contexts
 *
 * Uses MultiwayPotEngine (#23) for all decisions.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { getMultiwayStrategy } from '../../engines/MultiwayPotEngine';

const SuitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SuitColor = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e2e8f0' };

// ●● Sample Scenarios ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SCENARIOS = [
    { label: 'AK on A72r', hero: ['Ah', 'Kd'], board: ['As', '7c', '2d'], street: 'flop', position: 'IP', isPFR: true },
    { label: 'TT on J84tt', hero: ['Th', 'Td'], board: ['Jh', '8h', '4c'], street: 'flop', position: 'OOP', isPFR: true },
    { label: 'KQs NFD on T72', hero: ['Ks', 'Qs'], board: ['Ts', '7s', '2d'], street: 'flop', position: 'IP', isPFR: true },
    { label: '87s on 965r', hero: ['8d', '7d'], board: ['9c', '6h', '5s'], street: 'flop', position: 'OOP', isPFR: false },
    { label: 'AA on QJT', hero: ['Ac', 'Ad'], board: ['Qh', 'Jd', 'Tc'], street: 'flop', position: 'IP', isPFR: true },
    { label: 'AJ on AQ4', hero: ['As', 'Jh'], board: ['Ac', 'Qd', '4h'], street: 'flop', position: 'OOP', isPFR: true },
    { label: '66 on K83r', hero: ['6h', '6d'], board: ['Ks', '8c', '3d'], street: 'flop', position: 'IP', isPFR: true },
    { label: 'KJs on KT5tt', hero: ['Kc', 'Jc'], board: ['Kh', 'Th', '5d'], street: 'flop', position: 'IP', isPFR: true },
];

// ●● Strategy Comparison Card ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StrategyCard = memo(({ numPlayers, strategy, isBaseline = false }) => {
    if (!strategy) return null;
    const betPct = (strategy.betFrequency * 100).toFixed(0);
    const checkPct = (strategy.checkFrequency * 100).toFixed(0);
    const betColor = strategy.betFrequency >= 0.5 ? '#22c55e' : strategy.betFrequency >= 0.25 ? '#f59e0b' : '#ef4444';

    return (
        <div style={{
            padding: 10, borderRadius: 8,
            background: isBaseline ? 'rgba(59,130,246,0.06)' : 'rgba(15,23,42,0.4)',
            border: `1px solid ${isBaseline ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.08)'}`,
            flex: 1, minWidth: 100,
        }}>
            <div style={{
                fontSize: 12, fontWeight: 700, color: '#e2e8f0',
                marginBottom: 6, textAlign: 'center',
            }}>
                {numPlayers}-Way
                {isBaseline && <span style={{ fontSize: 8, color: '#3b82f6', marginLeft: 4 }}>baseline</span>}
            </div>

            {/* Bet/Check bar */}
            <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${betPct}%` }}
                    style={{
                        height: '100%',
                        background: `linear-gradient(90deg, ${betColor}88, ${betColor})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {strategy.betFrequency >= 0.15 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>Bet {betPct}%</span>
                    )}
                </motion.div>
                <div style={{
                    flex: 1, background: 'rgba(100,116,139,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {strategy.checkFrequency >= 0.15 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8' }}>Check {checkPct}%</span>
                    )}
                </div>
            </div>

            {/* Details */}
            <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.5 }}>
                <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Action:</span> {strategy.action}{strategy.sizing ? ` (${strategy.sizing})` : ''}</div>
                <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Reason:</span> {strategy.motivation}</div>
            </div>

            {/* Adjustment indicators */}
            {strategy.adjustments && (
                <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {strategy.adjustments.cbetMultiplier < 0.8 && (
                        <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                            C-bet ↓{((1 - strategy.adjustments.cbetMultiplier) * 100).toFixed(0)}%
                        </span>
                    )}
                    {strategy.adjustments.bluffMultiplier < 0.6 && (
                        <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                            Bluff ↓{((1 - strategy.adjustments.bluffMultiplier) * 100).toFixed(0)}%
                        </span>
                    )}
                    {strategy.adjustments.protectionMultiplier > 1.2 && (
                        <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                            Protection ↑{((strategy.adjustments.protectionMultiplier - 1) * 100).toFixed(0)}%
                        </span>
                    )}
                </div>
            )}
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function MultiwayTrainer() {
    const [selectedScenario, setSelectedScenario] = useState(0);
    const [customPlayers, setCustomPlayers] = useState(null);

    const scenario = SCENARIOS[selectedScenario];

    // Calculate strategies for 2-6 players
    const strategies = useMemo(() => {
        const results = {};
        for (let n = 2; n <= 6; n++) {
            results[n] = getMultiwayStrategy({
                holeCards: scenario.hero,
                board: scenario.board,
                numPlayers: n,
                potSize: n === 2 ? 6 : n === 3 ? 8 : n * 2.5,
                effectiveStack: 100,
                street: scenario.street,
                position: scenario.position,
                isPFR: scenario.isPFR,
            });
        }
        return results;
    }, [scenario]);

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
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                    Multiway Pot Trainer
                </div>

                {/* Scenario selector */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {SCENARIOS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedScenario(i)}
                            style={{
                                padding: '3px 8px', fontSize: 9, fontWeight: 600,
                                borderRadius: 4, border: '1px solid',
                                cursor: 'pointer',
                                background: selectedScenario === i ? 'rgba(0,212,255,0.1)' : 'rgba(0,0,0,0.15)',
                                color: selectedScenario === i ? '#00d4ff' : '#94a3b8',
                                borderColor: selectedScenario === i ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.08)',
                            }}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hand display */}
            <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.08)',
                display: 'flex', alignItems: 'center', gap: 12,
            }}>
                <div style={{ display: 'flex', gap: 3 }}>
                    {scenario.hero.map((c, i) => (
                        <div key={i} style={{
                            width: 32, height: 44, borderRadius: 4,
                            background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
                            border: '1px solid rgba(0,0,0,0.12)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 'bold',
                            color: SuitColor[c[1]] || '#1e293b',
                        }}>
                            <span>{c[0]}</span>
                            <span style={{ fontSize: 9 }}>{SuitSymbol[c[1]] || ''}</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                    {scenario.board.map((c, i) => (
                        <div key={i} style={{
                            width: 32, height: 44, borderRadius: 4,
                            background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
                            border: '1px solid rgba(0,0,0,0.12)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 'bold',
                            color: SuitColor[c[1]] || '#1e293b',
                        }}>
                            <span>{c[0]}</span>
                            <span style={{ fontSize: 9 }}>{SuitSymbol[c[1]] || ''}</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#818cf8', padding: '2px 6px', background: 'rgba(129,140,248,0.1)', borderRadius: 3 }}>
                        {scenario.position}
                    </span>
                    {scenario.isPFR && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', padding: '2px 6px', background: 'rgba(34,197,94,0.1)', borderRadius: 3 }}>
                            PFR
                        </span>
                    )}
                </div>
            </div>

            {/* Strategy comparison grid */}
            <div style={{ padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>
                    How Strategy Changes by Number of Players
                </div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                    {[2, 3, 4, 5, 6].map(n => (
                        <StrategyCard
                            key={n}
                            numPlayers={n}
                            strategy={strategies[n]}
                            isBaseline={n === 2}
                        />
                    ))}
                </div>

                {/* Key takeaways */}
                <div style={{
                    marginTop: 12, padding: 10, borderRadius: 6,
                    background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.12)',
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', marginBottom: 4, textTransform: 'uppercase' }}>
                        Key Multiway Adjustments
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.6 }}>
                        {strategies[2]?.betFrequency > 0 && strategies[3]?.betFrequency < strategies[2]?.betFrequency && (
                            <div>
                                Bet frequency drops from <strong>{(strategies[2].betFrequency * 100).toFixed(0)}%</strong> heads-up to{' '}
                                <strong>{(strategies[3].betFrequency * 100).toFixed(0)}%</strong> 3-way to{' '}
                                <strong>{(strategies[4]?.betFrequency * 100 || 0).toFixed(0)}%</strong> 4-way.
                            </div>
                        )}
                        {strategies[3] && (
                            <div style={{ marginTop: 2 }}>
                                3-way motivation: <em style={{ color: '#a5b4fc' }}>{strategies[3].motivation}</em>
                            </div>
                        )}
                    </div>
                </div>

                {/* Visual bet freq chart across player counts */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                        Bet Frequency by Player Count
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 60 }}>
                        {[2, 3, 4, 5, 6].map(n => {
                            const freq = strategies[n]?.betFrequency || 0;
                            const color = n === 2 ? '#3b82f6' : freq >= 0.5 ? '#22c55e' : freq >= 0.25 ? '#f59e0b' : '#ef4444';
                            return (
                                <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: Math.max(4, freq * 50) }}
                                        style={{
                                            width: '100%', borderRadius: '4px 4px 0 0',
                                            background: `linear-gradient(180deg, ${color}, ${color}88)`,
                                        }}
                                    />
                                    <div style={{ fontSize: 9, color: '#e2e8f0', fontWeight: 700, marginTop: 2 }}>
                                        {(freq * 100).toFixed(0)}%
                                    </div>
                                    <div style={{ fontSize: 8, color: '#64748b' }}>{n}p</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
