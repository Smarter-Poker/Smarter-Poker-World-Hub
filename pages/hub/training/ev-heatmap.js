/**
 * EV HEATMAP — Decision Profitability Map
 * ═══════════════════════════════════════════════════════════════════════════
 * Grid visualization: position × street
 * Color-coded cells (green = +EV, red = -EV)
 *
 * Route: /hub/training/ev-heatmap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];

// Simulated EV data map (in a real app this comes from aggregated backend stats)
const MOCK_EV_DATA = {
    'UTG-Preflop': { ev: 0.15, sample: 120 },
    'HJ-Preflop': { ev: 0.22, sample: 140 },
    'CO-Preflop': { ev: 0.45, sample: 160 },
    'BTN-Preflop': { ev: 0.85, sample: 210 },
    'SB-Preflop': { ev: -0.15, sample: 180 },
    'BB-Preflop': { ev: -0.45, sample: 230 },

    'UTG-Flop': { ev: 0.05, sample: 45 },
    'HJ-Flop': { ev: 0.12, sample: 55 },
    'CO-Flop': { ev: 0.25, sample: 65 },
    'BTN-Flop': { ev: 0.45, sample: 90 },
    'SB-Flop': { ev: -0.25, sample: 70 },
    'BB-Flop': { ev: -0.35, sample: 110 },

    'UTG-Turn': { ev: 0.02, sample: 20 },
    'HJ-Turn': { ev: -0.05, sample: 25 },
    'CO-Turn': { ev: 0.15, sample: 30 },
    'BTN-Turn': { ev: 0.35, sample: 45 },
    'SB-Turn': { ev: -0.45, sample: 35 },
    'BB-Turn': { ev: -0.15, sample: 50 },

    'UTG-River': { ev: 0.10, sample: 10 },
    'HJ-River': { ev: 0.20, sample: 12 },
    'CO-River': { ev: 0.40, sample: 18 },
    'BTN-River': { ev: 0.65, sample: 25 },
    'SB-River': { ev: -0.65, sample: 20 },
    'BB-River': { ev: 0.05, sample: 22 },
};

function getCellColor(ev) {
    if (ev > 0.5) return 'rgba(34,197,94,0.8)'; // Bright green
    if (ev > 0.1) return 'rgba(34,197,94,0.4)'; // Medium green
    if (ev > -0.1) return 'rgba(148,163,184,0.2)'; // Neutral gray
    if (ev > -0.4) return 'rgba(239,68,68,0.4)'; // Medium red
    return 'rgba(239,68,68,0.8)'; // Bright red
}

export default function EvHeatmapPage() {
    const router = useRouter();
    useTrainingBus('ev-heatmap');
    const [selectedCell, setSelectedCell] = useState(null);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    return (
        <>
            <Head><title>EV Heatmap | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>EV Heatmap</div><div style={{ fontSize: 11, color: '#64748b' }}>Positional profitability map</div></div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {/* Overall Context */}
                    <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)', marginBottom: 20 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                            This map shows your <strong style={{ color: '#e2e8f0' }}>Expected Value (EV)</strong> across all positions and streets.
                            <span style={{ color: '#4ade80' }}> Green</span> indicates high profitability (e.g. BTN), while
                            <span style={{ color: '#f87171' }}> Red</span> indicates structural loss (e.g. Small Blind).
                        </div>
                    </div>

                    {/* Heatmap Grid */}
                    <div style={{ display: 'flex', marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
                        {/* Y-Axis Labels (Positions) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginRight: 12, marginTop: 24 }}>
                            {POSITIONS.map(p => (
                                <div key={p} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10, fontWeight: 700, color: '#64748b', width: 30 }}>{p}</div>
                            ))}
                        </div>

                        {/* Grid Columns (Streets) */}
                        <div style={{ display: 'flex', gap: 4 }}>
                            {STREETS.map(street => (
                                <div key={street} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ height: 20, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{street}</div>
                                    {POSITIONS.map(pos => {
                                        const key = `${pos}-${street}`;
                                        const data = MOCK_EV_DATA[key];
                                        const isSelected = selectedCell === key;
                                        return (
                                            <motion.button key={key}
                                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                onClick={() => setSelectedCell(isSelected ? null : key)}
                                                style={{
                                                    width: 60, height: 40, borderRadius: 6, border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.05)',
                                                    background: getCellColor(data.ev),
                                                    color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                {data.ev > 0 ? '+' : ''}{data.ev}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>Loss (-EV)</span>
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: getCellColor(-0.8) }} />
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: getCellColor(-0.3) }} />
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: getCellColor(0) }} />
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: getCellColor(0.3) }} />
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: getCellColor(0.8) }} />
                        <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>Profit (+EV)</span>
                    </div>

                    {/* Cell Details Detail Panel */}
                    <AnimatePresence>
                        {selectedCell && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                style={{ padding: '20px', borderRadius: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedCell.replace('-', ' • ')}</div>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>{MOCK_EV_DATA[selectedCell].sample} hands</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ padding: '8px 16px', borderRadius: 8, background: getCellColor(MOCK_EV_DATA[selectedCell].ev), color: '#fff', fontSize: 24, fontWeight: 900 }}>
                                        {MOCK_EV_DATA[selectedCell].ev > 0 ? '+' : ''}{MOCK_EV_DATA[selectedCell].ev}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                                        {MOCK_EV_DATA[selectedCell].ev > 0
                                            ? `You are highly profitable in this spot. Your decisions here capture more EV than the population average.`
                                            : `This is a structural leak. You are losing EV in this spot, likely due to positional disadvantage combined with over-calling or bad bluffs.`}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
