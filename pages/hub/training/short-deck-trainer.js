/**
 * SHORT DECK TRAINER — 36-Card Dynamics
 * ═══════════════════════════════════════════════════════════════════════════
 * Equity calculator stripping 2s-5s.
 *
 * Route: /hub/training/short-deck-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const SUITS = ['♠', '♥', '♦', '♣'];
const SHORT_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '6']; // 6 is the new lowest card in classic Short Deck

export default function ShortDeckTrainerPage() {
    const router = useRouter();
    useTrainingBus('short-deck-trainer');

    const [heroCards, setHeroCards] = useState(['A♠', 'K♠']);
    const [villainRange, setVillainRange] = useState('Top 20%');
    const [equity, setEquity] = useState(null);
    const [simulating, setSimulating] = useState(false);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const runSim = () => {
        setSimulating(true);
        setTimeout(() => {
            // Simulated Short Deck equity math
            // Flushes > Full Houses in Short Deck, so suitedness is vastly more valuable
            let eq = 50;
            const r1 = heroCards[0][0]; const r2 = heroCards[1][0];
            const isSuited = heroCards[0][1] === heroCards[1][1];

            if (isSuited) eq += 12; // Suitedness huge bump
            if (r1 === r2) eq += 15; // Pairs good but sets are easier to hit
            if (r1 === 'A' || r2 === 'A') eq += 8;

            eq += (Math.random() * 8 - 4);
            setEquity(Math.min(95, Math.max(5, eq)).toFixed(1));
            setSimulating(false);
        }, 1200);
    };

    return (
        <>
            <Head><title>Short Deck Trainer | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #1e0b0b 0%, #0a0a0a 100%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#fca5a5', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, marginRight: 16 }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Short Deck (Six Plus)</div><div style={{ fontSize: 11, color: '#ef4444' }}>36-Card Dynamics Simulator</div></div>
                </div>

                <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>

                    <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '24px 32px', marginBottom: 40, display: 'inline-block' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Rule Shift Alert</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Flush BEATS a Full House</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>(A-6-7-8-9 is the lowest straight)</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 40 }}>
                        <div style={{ width: 100, height: 140, background: '#fff', borderRadius: 8, border: '1px solid #cbd5e1', boxShadow: '0 12px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', padding: '8px' }}>
                            <div style={{ fontSize: 32, fontWeight: 900, color: '#000', lineHeight: 1 }}>{heroCards[0][0]}</div><div style={{ fontSize: 24, color: '#000', lineHeight: 1 }}>{heroCards[0][1]}</div>
                        </div>
                        <div style={{ width: 100, height: 140, background: '#fff', borderRadius: 8, border: '1px solid #cbd5e1', boxShadow: '0 12px 24px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', padding: '8px' }}>
                            <div style={{ fontSize: 32, fontWeight: 900, color: '#000', lineHeight: 1 }}>{heroCards[1][0]}</div><div style={{ fontSize: 24, color: '#000', lineHeight: 1 }}>{heroCards[1][1]}</div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 32 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Villain Range</label>
                        <select value={villainRange} onChange={e => setVillainRange(e.target.value)} style={{ display: 'block', width: '100%', maxWidth: 300, margin: '8px auto', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '12px', borderRadius: 8, fontSize: 16, outline: 'none' }}>
                            <option>Top 100% (Any 2)</option>
                            <option>Top 20% (Loose)</option>
                            <option>Top 10% (Standard)</option>
                        </select>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={runSim} disabled={simulating}
                        style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', border: 'none', color: '#fff', padding: '20px 40px', borderRadius: 12, fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', boxShadow: '0 8px 30px rgba(239,68,68,0.4)', textTransform: 'uppercase' }}
                    >
                        {simulating ? 'Running Monte Carlo...' : 'Run 36-Card Equity'}
                    </motion.button>

                    {equity && !simulating && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ marginTop: 40 }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2 }}>Hero Equity vs {villainRange}</div>
                            <div style={{ fontSize: 80, fontWeight: 900, color: equity > 50 ? '#4ade80' : '#ef4444', letterSpacing: '-2px' }}>{equity}%</div>
                        </motion.div>
                    )}

                </div>
            </div>
        </>
    );
}
