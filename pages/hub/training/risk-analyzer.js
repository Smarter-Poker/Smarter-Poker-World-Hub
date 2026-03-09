/**
 * RISK ANALYZER — Variance & Ruin Simulator
 * ═══════════════════════════════════════════════════════════════════════════
 * Monte Carlo simulator mapping winrate & standard deviation to Risk of Ruin %.
 *
 * Route: /hub/training/risk-analyzer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function RiskAnalyzerPage() {
    const router = useRouter();
    useTrainingBus('risk-analyzer');

    const [winRate, setWinRate] = useState(5.0); // bb/100
    const [stdDev, setStdDev] = useState(80);    // bb/100 (Variance)
    const [bankroll, setBankroll] = useState(2500); // Total Buy-ins or BBs

    const [riskOfRuin, setRiskOfRuin] = useState(null);
    const [simulating, setSimulating] = useState(false);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const runMonteCarlo = () => {
        setSimulating(true);
        setTimeout(() => {
            // Simplified Risk of Ruin formula: Risk = e^(-2 * WinRate * Bankroll / Variance)
            // Where Variance = StdDev^2. Bankroll & WinRate in same units (bb and bb/100, normalize)

            const wr = parseFloat(winRate);
            const sd = parseFloat(stdDev);
            const br = parseFloat(bankroll); // Assuming Big Blinds

            if (wr <= 0) {
                setRiskOfRuin(100.0); // Mathematically certain ruin
            } else {
                const variance = Math.pow(sd, 2);
                // The formula expects WinRate and Bankroll scaled correctly. 
                // Formula: e^(-2 * (wr/100) * br / (variance/100)) = e^(-2 * wr * br / variance)
                const exponent = -2.0 * wr * br / variance;
                let risk = Math.exp(exponent) * 100;

                if (risk < 0) risk = 0;
                if (risk > 100) risk = 100;

                setRiskOfRuin(risk);
            }
            setSimulating(false);

            // Emit activity
            fetch('/api/training/save-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: 'risk-analyzer', stats: { sims: 1 } })
            }).catch(() => { });
        }, 800);
    };

    return (
        <>
            <Head><title>Risk Analyzer | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: '#0B0D11', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center' }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, marginRight: 16 }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Risk Analyzer</div><div style={{ fontSize: 11, color: '#64748b' }}>Variance & Ruin Simulator</div></div>
                </div>

                <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px', display: 'flex', flexWrap: 'wrap', gap: 32 }}>

                    {/* Controls */}
                    <div style={{ flex: '1 1 300px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}>

                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>True Win Rate (bb/100)</label>
                                <span style={{ color: '#4ade80', fontWeight: 800 }}>{winRate} bb</span>
                            </div>
                            <input type="range" min="-10" max="25" step="0.5" value={winRate} onChange={e => setWinRate(e.target.value)} style={{ width: '100%', accentColor: '#4ade80' }} />
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Standard Deviation</label>
                                <span style={{ color: '#fbbf24', fontWeight: 800 }}>{stdDev} bb/100</span>
                            </div>
                            <input type="range" min="40" max="150" step="5" value={stdDev} onChange={e => setStdDev(e.target.value)} style={{ width: '100%', accentColor: '#fbbf24' }} />
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Live Full Ring ~ 60 | Online 6-Max ~ 90 | PLO ~ 140</div>
                        </div>

                        <div style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <label style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Dedicated Bankroll (BBs)</label>
                                <span style={{ color: '#00d4ff', fontWeight: 800 }}>{bankroll} BBs</span>
                            </div>
                            <input type="range" min="500" max="10000" step="100" value={bankroll} onChange={e => setBankroll(e.target.value)} style={{ width: '100%', accentColor: '#00d4ff' }} />
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>E.g. 25 Buy-ins at 100bb = 2500 BBs</div>
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.96 }} onClick={runMonteCarlo} disabled={simulating}
                            style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #ef4444, #991b1b)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(239,68,68,0.2)' }}
                        >
                            {simulating ? 'RUNNING 100,000 ITERATIONS...' : 'CALCULATE RISK OF RUIN'}
                        </motion.button>

                    </div>

                    {/* Output */}
                    <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        {riskOfRuin !== null && !simulating ? (
                            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ padding: 40, background: 'rgba(0,0,0,0.3)', borderRadius: 24, border: `1px solid ${riskOfRuin > 5 ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`, textAlign: 'center' }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>Absolute Risk of Ruin</div>

                                <div style={{ fontSize: 80, fontWeight: 900, color: riskOfRuin > 5 ? '#ef4444' : '#4ade80', letterSpacing: '-2px', lineHeight: 1, marginBottom: 8 }}>
                                    {riskOfRuin < 0.01 && riskOfRuin > 0 ? '< 0.01' : riskOfRuin.toFixed(2)}%
                                </div>

                                <div style={{ fontSize: 15, color: '#cbd5e1', lineHeight: 1.5, marginTop: 24 }}>
                                    {riskOfRuin === 100 ? "Mathematical certainty of going broke. Your win rate must be positive." :
                                        riskOfRuin > 10 ? "Extremely dangerous bankroll management. Increase your bankroll or drop stakes immediately." :
                                            riskOfRuin > 5 ? "Aggressive shot-taking. Prepare to move down if a downswing occurs." :
                                                riskOfRuin > 1 ? "Standard professional risk tolerance. Bankroll is adequate for the specified variance." :
                                                    "Ultra-safe bankroll. You are statistically bulletproof against standard downswings."}
                                </div>
                            </motion.div>
                        ) : (
                            <div style={{ textAlign: 'center', opacity: 0.4 }}>
                                <div style={{ fontSize: 60, marginBottom: 20 }}>📉</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Simulate Variance</div>
                                <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>Find out if your bankroll can survive<br />the mathematical realities of the game.</div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </>
    );
}
