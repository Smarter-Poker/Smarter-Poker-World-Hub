/**
 * EV HEATMAP — Decision Profitability Map
 * ═══════════════════════════════════════════════════════════════════════════
 * Grid visualization: position × street
 * Color-coded cells (green = +EV, red = -EV) with game type filtering.
 *
 * Route: /hub/training/ev-heatmap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken } from '../../../src/lib/authUtils';

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const FILTERS = ['NLHE Cash', 'MTT', 'PLO', 'Short Deck'];

// Base template data
const BASE_STATS = {
    'UTG-Preflop': { ev: 0.15, sample: 120 }, 'HJ-Preflop': { ev: 0.22, sample: 140 }, 'CO-Preflop': { ev: 0.45, sample: 160 }, 'BTN-Preflop': { ev: 0.85, sample: 210 }, 'SB-Preflop': { ev: -0.15, sample: 180 }, 'BB-Preflop': { ev: -0.45, sample: 230 },
    'UTG-Flop': { ev: 0.05, sample: 45 }, 'HJ-Flop': { ev: 0.12, sample: 55 }, 'CO-Flop': { ev: 0.25, sample: 65 }, 'BTN-Flop': { ev: 0.45, sample: 90 }, 'SB-Flop': { ev: -0.25, sample: 70 }, 'BB-Flop': { ev: -0.35, sample: 110 },
    'UTG-Turn': { ev: 0.02, sample: 20 }, 'HJ-Turn': { ev: -0.05, sample: 25 }, 'CO-Turn': { ev: 0.15, sample: 30 }, 'BTN-Turn': { ev: 0.35, sample: 45 }, 'SB-Turn': { ev: -0.45, sample: 35 }, 'BB-Turn': { ev: -0.15, sample: 50 },
    'UTG-River': { ev: 0.10, sample: 10 }, 'HJ-River': { ev: 0.20, sample: 12 }, 'CO-River': { ev: 0.40, sample: 18 }, 'BTN-River': { ev: 0.65, sample: 25 }, 'SB-River': { ev: -0.65, sample: 20 }, 'BB-River': { ev: 0.05, sample: 22 },
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
    const [activeFilter, setActiveFilter] = useState('NLHE Cash');

    // Dynamically adjust the baseline mock EV data based on the selected game type filter
    const activeData = useMemo(() => {
        const adjusted = {};
        for (const [key, value] of Object.entries(BASE_STATS)) {
            let evMod = value.ev;
            if (activeFilter === 'MTT') evMod -= 0.1; // ICM taxation lowers overall EV 
            if (activeFilter === 'PLO') evMod *= 1.5; // High variance swings
            if (activeFilter === 'Short Deck') {
                if (key.includes('Preflop') && (key.includes('SB') || key.includes('BB'))) evMod += 0.3; // Flatter equity
                else evMod -= 0.2;
            }
            adjusted[key] = { ev: Number(evMod.toFixed(2)), sample: value.sample };
        }
        return adjusted;
    }, [activeFilter]);

    // Handle tracking when user reviews a spot
    const handleCellClick = async (key) => {
        setSelectedCell(selectedCell === key ? null : key);
        if (selectedCell !== key) {
            try {
                const token = getAccessToken();
                if (token) {
                    await fetch('/api/training/save-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            gameId: 'ev-heatmap',
                            questionsAnswered: 1, questionsCorrect: 1, accuracy: 100
                        })
                    });
                }
                eventBus.emit(EventType.SESSION_END, { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 }, 'ev-heatmap');
            } catch (e) { console.error(e); }
        }
    };

    return (
        <>
            <Head><title>EV Heatmap | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: 60 }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>EV Heatmap</div><div style={{ fontSize: 11, color: '#64748b' }}>Positional profitability map</div></div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 800, margin: '0 auto' }}>

                    {/* Format Filter */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 8 }}>
                        {FILTERS.map(f => (
                            <button
                                key={f}
                                onClick={() => setActiveFilter(f)}
                                style={{
                                    padding: '8px 16px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: activeFilter === f ? 'transparent' : 'rgba(255,255,255,0.05)',
                                    color: activeFilter === f ? '#fff' : '#94a3b8',
                                    boxShadow: activeFilter === f ? 'inset 0 0 0 1px rgba(99,102,241,0.5)' : 'none'
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Overall Context */}
                    <div style={{ padding: '16px', borderRadius: 12, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)', marginBottom: 20 }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                            This map shows your <strong style={{ color: '#e2e8f0' }}>Expected Value (EV)</strong> across all positions and streets for <strong>{activeFilter}</strong>.
                            <span style={{ color: '#4ade80' }}> Green</span> indicates high profitability, while <span style={{ color: '#f87171' }}> Red</span> indicates structural loss.
                        </div>
                    </div>

                    {/* Heatmap Grid Container */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24 }}>
                        <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: 8 }}>
                            {/* Y-Axis Labels (Positions) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginRight: 16, marginTop: 26 }}>
                                {POSITIONS.map(p => (
                                    <div key={p} style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 11, fontWeight: 800, color: '#94a3b8', width: 35 }}>{p}</div>
                                ))}
                            </div>

                            {/* Grid Columns (Streets) */}
                            <div style={{ display: 'flex', gap: 6 }}>
                                {STREETS.map(street => (
                                    <div key={street} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ height: 20, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 1 }}>{street}</div>
                                        {POSITIONS.map(pos => {
                                            const key = `${pos}-${street}`;
                                            const data = activeData[key];
                                            const isSelected = selectedCell === key;
                                            return (
                                                <motion.button key={key}
                                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleCellClick(key)}
                                                    style={{
                                                        width: 70, height: 44, borderRadius: 6, border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.05)',
                                                        background: getCellColor(data.ev),
                                                        color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
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
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Loss (-EV)</span>
                        <div style={{ width: 24, height: 12, borderRadius: 2, background: getCellColor(-0.8) }} />
                        <div style={{ width: 24, height: 12, borderRadius: 2, background: getCellColor(-0.3) }} />
                        <div style={{ width: 24, height: 12, borderRadius: 2, background: getCellColor(0) }} />
                        <div style={{ width: 24, height: 12, borderRadius: 2, background: getCellColor(0.3) }} />
                        <div style={{ width: 24, height: 12, borderRadius: 2, background: getCellColor(0.8) }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Profit (+EV)</span>
                    </div>

                    {/* Cell Details Detail Panel */}
                    <AnimatePresence>
                        {selectedCell && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                style={{ padding: '24px', borderRadius: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0', letterSpacing: 1 }}>{selectedCell.replace('-', ' • ')}</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6 }}>{activeData[selectedCell].sample} hands analyzed</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ padding: '12px 20px', borderRadius: 12, background: getCellColor(activeData[selectedCell].ev), color: '#fff', fontSize: 28, fontWeight: 900 }}>
                                        {activeData[selectedCell].ev > 0 ? '+' : ''}{activeData[selectedCell].ev}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                                        {activeData[selectedCell].ev > 0
                                            ? `You are highly profitable in this spot relative to the population. Your decisions here capture significant EV, likely from strong value targeting or effective bluffs.`
                                            : `This is a structural leak. You are losing EV in this spot. Consider tightening your range, minimizing cold calls, or increasing aggression when leading.`}
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
