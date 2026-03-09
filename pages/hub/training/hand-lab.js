/**
 * HAND LAB — Multi-Scenario Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Build custom scenarios: pick position, stack size, board texture.
 * Compare EV of different actions side by side.
 *
 * Route: /hub/training/hand-lab
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const ACTIONS = ['Bet Small (33%)', 'Bet Medium (66%)', 'Bet Large (100%)', 'Check', 'Raise', 'Fold'];
const BOARDS = [
    'A♠K♦7♣', 'K♠Q♥J♦', 'T♠9♥8♦', '7♠6♥5♣', 'A♣A♥3♦',
    'Q♠9♦4♣', 'J♠T♥2♣', '8♠5♥2♦', 'K♠J♦6♣', 'A♠8♥3♠',
];

function generateEV(position, street, action) {
    const posBonus = { BTN: 8, CO: 5, HJ: 2, UTG: -2, SB: -5, BB: -3 };
    const streetBonus = { Preflop: 3, Flop: 5, Turn: 2, River: 0 };
    const actionBase = {
        'Bet Small (33%)': 4, 'Bet Medium (66%)': 6, 'Bet Large (100%)': 3,
        'Check': 1, 'Raise': 7, 'Fold': -2,
    };
    const base = (actionBase[action] || 0) + (posBonus[position] || 0) + (streetBonus[street] || 0);
    const noise = Math.sin(position.length * 17 + street.length * 13 + action.length * 7) * 5;
    return Math.round((base + noise) * 10) / 10;
}

export default function HandLabPage() {
    const router = useRouter();
    useTrainingBus('hand-lab');
    const [position, setPosition] = useState('BTN');
    const [street, setStreet] = useState('Flop');
    const [board, setBoard] = useState(BOARDS[0]);
    const [stack, setStack] = useState(100);
    const [results, setResults] = useState(null);
    const [saved, setSaved] = useState([]);

    useEffect(() => {
        try { const s = localStorage.getItem('hand-lab-saved'); if (s) setSaved(JSON.parse(s)); } catch { }
    }, []);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const analyze = () => {
        const actionResults = ACTIONS.map(a => ({ action: a, ev: generateEV(position, street, a) }));
        actionResults.sort((a, b) => b.ev - a.ev);
        setResults({ position, street, board, stack, actions: actionResults });
    };

    const saveScenario = () => {
        if (!results) return;
        const next = [{ ...results, id: `lab-${Date.now()}`, savedAt: Date.now() }, ...saved].slice(0, 20);
        setSaved(next);
        try { localStorage.setItem('hand-lab-saved', JSON.stringify(next)); } catch { }
    };

    const deleteSaved = (id) => {
        const next = saved.filter(s => s.id !== id);
        setSaved(next);
        try { localStorage.setItem('hand-lab-saved', JSON.stringify(next)); } catch { }
    };

    return (
        <>
            <Head><title>Hand Lab | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Hand Lab</div><div style={{ fontSize: 11, color: '#64748b' }}>Build &amp; analyze scenarios</div></div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {/* Position */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Position</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                        {POSITIONS.map(p => (
                            <motion.button key={p} whileTap={{ scale: 0.95 }} onClick={() => setPosition(p)}
                                style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${position === p ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: position === p ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.15)', color: position === p ? '#00d4ff' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {p}
                            </motion.button>
                        ))}
                    </div>

                    {/* Street */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Street</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                        {STREETS.map(s => (
                            <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => setStreet(s)}
                                style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${street === s ? 'rgba(251,191,36,0.2)' : 'transparent'}`, background: street === s ? 'rgba(251,191,36,0.06)' : 'rgba(0,0,0,0.15)', color: street === s ? '#fbbf24' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {s}
                            </motion.button>
                        ))}
                    </div>

                    {/* Board */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Board Texture</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
                        {BOARDS.map(b => (
                            <motion.button key={b} whileTap={{ scale: 0.95 }} onClick={() => setBoard(b)}
                                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${board === b ? 'rgba(34,197,94,0.2)' : 'transparent'}`, background: board === b ? 'rgba(34,197,94,0.06)' : 'rgba(0,0,0,0.15)', color: board === b ? '#4ade80' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {b}
                            </motion.button>
                        ))}
                    </div>

                    {/* Stack */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Effective Stack (BB)</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
                        {[20, 50, 100, 150, 200].map(s => (
                            <motion.button key={s} whileTap={{ scale: 0.95 }} onClick={() => setStack(s)}
                                style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${stack === s ? 'rgba(168,85,247,0.2)' : 'transparent'}`, background: stack === s ? 'rgba(168,85,247,0.06)' : 'rgba(0,0,0,0.15)', color: stack === s ? '#a855f7' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                {s}bb
                            </motion.button>
                        ))}
                    </div>

                    <motion.button whileTap={{ scale: 0.97 }} onClick={analyze}
                        style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #00d4ff, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,212,255,0.25)', marginBottom: 20 }}>
                        Analyze Scenario
                    </motion.button>

                    {/* Results */}
                    <AnimatePresence>
                        {results && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>EV Analysis: {results.position} | {results.street} | {results.board}</div>
                                    <motion.button whileTap={{ scale: 0.9 }} onClick={saveScenario} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Save</motion.button>
                                </div>
                                {results.actions.map((a, i) => (
                                    <div key={a.action} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: i === 0 ? 'rgba(34,197,94,0.06)' : 'rgba(0,0,0,0.15)', border: `1px solid ${i === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)'}` }}>
                                        {i === 0 && <span style={{ fontSize: 12, marginRight: 8 }}>⭐</span>}
                                        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: i === 0 ? '#4ade80' : '#94a3b8' }}>{a.action}</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: a.ev > 0 ? '#4ade80' : a.ev < 0 ? '#f87171' : '#64748b' }}>{a.ev > 0 ? '+' : ''}{a.ev}</div>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Saved Scenarios */}
                    {saved.length > 0 && (
                        <div style={{ marginTop: 24 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Saved Scenarios ({saved.length})</div>
                            {saved.map(s => (
                                <div key={s.id} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{s.position} | {s.street} | {s.board}</div>
                                        <div style={{ fontSize: 9, color: '#475569' }}>Best: {s.actions[0]?.action} ({s.actions[0]?.ev > 0 ? '+' : ''}{s.actions[0]?.ev} EV)</div>
                                    </div>
                                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteSaved(s.id)} style={{ width: 20, height: 20, borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: 'none', color: '#f87171', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</motion.button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
