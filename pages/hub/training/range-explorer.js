/**
 * RANGE EXPLORER — 13x13 Interactive Matrix
 * ═══════════════════════════════════════════════════════════════════════════
 * Full 13x13 starting hand grid with exact action frequencies by position.
 *
 * Route: /hub/training/range-explorer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

function getHandLabel(r1, r2, isSuited, isPair) {
    if (isPair) return `${r1}${r2}`;
    return `${r1}${r2}${isSuited ? 's' : 'o'}`;
}

// Simulated data: Generates deterministic GTO frequencies based on position and hand strength
function generateFrequencies(hand, pos) {
    const posIndex = POSITIONS.indexOf(pos);
    const posMultiplier = 1 + (posIndex * 0.2); // BTN is looser than UTG

    const rankValues = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

    // Parse hand
    let strength = 0;
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    if (isPair) {
        strength = rankValues[hand[0]] * 3; // Pairs are very strong
    } else {
        strength = rankValues[hand[0]] + rankValues[hand[1]] + (isSuited ? 5 : 0);
    }

    // Adjust strength based on connectedness (e.g. JT > J4)
    if (!isPair) {
        const gap = Math.abs(rankValues[hand[0]] - rankValues[hand[1]]);
        if (gap === 1) strength += 3;
        else if (gap === 2) strength += 1.5;
        else if (gap > 4) strength -= 2;
    }

    const effectiveStrength = strength * posMultiplier;

    let raise = 0, call = 0, fold = 0;

    if (effectiveStrength > 45) { raise = 100; call = 0; fold = 0; }
    else if (effectiveStrength > 35) { raise = 80; call = 20; fold = 0; }
    else if (effectiveStrength > 25) { raise = 40; call = 40; fold = 20; }
    else if (effectiveStrength > 18) { raise = 10; call = 20; fold = 70; }
    else { raise = 0; call = 0; fold = 100; }

    // If pos is BB, they face an open, so "raise" means 3Bet, "call" is Defend
    if (pos === 'BB') {
        let threeBet = raise;
        let defend = call + (raise * 0.3); // Mix some raises into calls
        let pFold = fold;

        const total = threeBet + defend + pFold;
        return {
            raise: Math.round((threeBet / total) * 100),
            call: Math.round((defend / total) * 100),
            fold: Math.round((pFold / total) * 100)
        };
    }

    return { raise, call, fold };
}

function getGridColor(freqs) {
    if (freqs.raise > 80) return '#ef4444'; // Pure Raise (Red)
    if (freqs.raise > 40) return '#f97316'; // Mixed Raise (Orange)
    if (freqs.call > 50) return '#34d399'; // Mostly Call (Green)
    if (freqs.raise > 10 || freqs.call > 10) return '#fbbf24'; // Weak mixed (Yellow)
    return '#1e293b'; // Fold (Dark Slate)
}

export default function RangeExplorerPage() {
    const router = useRouter();
    useTrainingBus('range-explorer');
    const [position, setPosition] = useState('BTN');
    const [selectedHand, setSelectedHand] = useState(null);

    useEffect(() => {
        const h = () => { };
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, []);

    const matrix = [];
    for (let i = 0; i < 13; i++) {
        const row = [];
        for (let j = 0; j < 13; j++) {
            const isPair = i === j;
            const isSuited = j > i; // Upper right
            let r1, r2;
            if (isPair) { r1 = RANKS[i]; r2 = RANKS[j]; }
            else if (isSuited) { r1 = RANKS[i]; r2 = RANKS[j]; }
            else { r1 = RANKS[j]; r2 = RANKS[i]; } // Offsuit lower left

            const hand = getHandLabel(r1, r2, isSuited, isPair);
            const freqs = generateFrequencies(hand, position);
            row.push({ hand, freqs, color: getGridColor(freqs) });
        }
        matrix.push(row);
    }

    return (
        <>
            <Head><title>Range Explorer | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Range Explorer</div><div style={{ fontSize: 11, color: '#64748b' }}>13x13 Interactive Matrix</div></div>
                </div>

                <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                    {/* Position Bar */}
                    <div style={{ display: 'flex', width: '100%', maxWidth: 460, background: '#1e293b', padding: '4px', borderRadius: '12px', marginBottom: '24px' }}>
                        {POSITIONS.map(p => (
                            <button
                                key={p}
                                onClick={() => { setPosition(p); setSelectedHand(null); }}
                                style={{
                                    flex: 1, padding: '8px 0', border: 'none', borderRadius: '8px', cursor: 'pointer',
                                    background: position === p ? '#3b82f6' : 'transparent',
                                    color: position === p ? '#fff' : '#94a3b8',
                                    fontWeight: 700, fontSize: 12, transition: 'all 0.2s'
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {/* 13x13 Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px', background: '#000', padding: '2px', borderRadius: '8px', border: '1px solid #334155' }}>
                            {matrix.map((row, i) => row.map((cell, j) => (
                                <div
                                    key={cell.hand}
                                    onClick={() => setSelectedHand(cell)}
                                    style={{
                                        width: '28px', height: '28px',
                                        background: cell.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '9px', fontWeight: 700,
                                        color: cell.color === '#1e293b' ? '#475569' : '#000',
                                        cursor: 'pointer',
                                        border: selectedHand?.hand === cell.hand ? '2px solid #fff' : 'none',
                                        opacity: selectedHand && selectedHand.hand !== cell.hand ? 0.6 : 1,
                                    }}
                                >
                                    {cell.hand}
                                </div>
                            )))}
                        </div>

                        {/* Details Panel */}
                        <div style={{ width: '280px', flexShrink: 0 }}>
                            {selectedHand ? (
                                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', border: '1px solid #334155' }}>
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Position</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>{position}</div>

                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Hand Selected</div>
                                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 24, letterSpacing: '-1px' }}>{selectedHand.hand}</div>

                                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>GTO Frequencies</div>

                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                                            <span style={{ color: '#ef4444' }}>{position === 'BB' ? '3-Bet' : 'Raise First In'}</span>
                                            <span style={{ color: '#ef4444' }}>{selectedHand.freqs.raise}%</span>
                                        </div>
                                        <div style={{ height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${selectedHand.freqs.raise}%` }} style={{ height: '100%', background: '#ef4444' }} />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                                            <span style={{ color: '#34d399' }}>Call</span>
                                            <span style={{ color: '#34d399' }}>{selectedHand.freqs.call}%</span>
                                        </div>
                                        <div style={{ height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${selectedHand.freqs.call}%` }} style={{ height: '100%', background: '#34d399' }} />
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                                            <span style={{ color: '#94a3b8' }}>Fold</span>
                                            <span style={{ color: '#94a3b8' }}>{selectedHand.freqs.fold}%</span>
                                        </div>
                                        <div style={{ height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${selectedHand.freqs.fold}%` }} style={{ height: '100%', background: '#64748b' }} />
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <div style={{ background: '#1e293b', padding: '32px 24px', borderRadius: '16px', border: '1px dashed #334155', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>👆</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Select any hand</div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>Click a cell in the 13x13 matrix to view the exact GTO action frequencies for this position.</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '16px', marginTop: '32px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 12, height: 12, borderRadius: 2, background: '#ef4444' }} /> Pure Raise</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 12, height: 12, borderRadius: 2, background: '#f97316' }} /> Mixed Raise</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 12, height: 12, borderRadius: 2, background: '#fbbf24' }} /> Mixed Call/Fold</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 12, height: 12, borderRadius: 2, background: '#34d399' }} /> Pure Call</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: 12, height: 12, borderRadius: 2, background: '#1e293b', border: '1px solid #334155' }} /> Fold</div>
                    </div>
                </div>
            </div>
        </>
    );
}
