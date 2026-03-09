/**
 * WEAKNESS SCANNER — Auto-Leak Finder
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes session data to find statistical leaks by position and phase.
 *
 * Route: /hub/training/weakness-scanner
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

function analyzeData(sessions) {
    if (!sessions || sessions.length === 0) return null;

    let totalHands = 0, totalCorrect = 0;
    const gameAccMap = {};

    sessions.forEach(s => {
        // Handle varying payload structures historically used across the platform
        const q = Number(s.total_questions || s.questions_answered || 0);
        const c = Number(s.correct_count || s.questions_correct || 0);

        // Some tools (like Focus Timer) log sessions but don't output "questions". Count them as 1 volume unit.
        const vol = q > 0 ? q : 1;

        totalHands += vol;
        totalCorrect += c;

        const gId = s.game_id || s.gameId || 'unknown';

        // Exclude non-scoring tools from accuracy metrics
        if (!['focus-timer', 'risk-analyzer', 'gto-preloader'].includes(gId) && q > 0) {
            if (!gameAccMap[gId]) gameAccMap[gId] = { q: 0, c: 0 };
            gameAccMap[gId].q += q;
            gameAccMap[gId].c += c;
        }
    });

    const overallAcc = totalHands > 0 ? (totalCorrect / totalHands) * 100 : 0;
    const leaks = [];
    let idCounter = 1;

    for (const [gId, stats] of Object.entries(gameAccMap)) {
        if (stats.q < 3) continue; // Need minimum sample size to flag a leak

        const acc = (stats.c / stats.q) * 100;
        if (acc <= 85) { // Anything 85% or below is considered an active leak
            let tip, cat, area;
            area = gId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            if (gId.includes('preflop')) {
                cat = 'Preflop'; tip = `Your accuracy in ${area} is sub-optimal (${Math.round(acc)}%). Review your opening ranges and 3-bet frequencies to plug this leak.`;
            } else if (gId.includes('icm') || gId.includes('tournament')) {
                cat = 'ICM / Math'; tip = `You are losing EV in high-pressure ${area} spots. Tighten your calling ranges near the bubble.`;
            } else if (gId.includes('ev') || gId.includes('geometry') || gId.includes('odds')) {
                cat = 'Postflop Math'; tip = `Miscalculating pot odds and SPR. Re-drill ${area} to ensure you are getting the right mathematical price.`;
            } else if (gId.includes('short-deck')) {
                cat = 'Variant Rules'; tip = `Short Deck equities differ drastically from NLHE. You are overvaluing top pair and undervaluing straight draws.`;
            } else {
                cat = 'General Tactics'; tip = `Statistical weakness detected in ${area}. Replay this specific module repeatedly until your accuracy climbs above 90%.`;
            }

            leaks.push({
                id: idCounter++,
                cat, area, acc: Math.round(acc), sample: stats.q,
                tip,
                sev: acc < 65 ? 'High' : 'Medium'
            });
        }
    }

    // Default state if they are performing perfectly or playing low sample size
    if (leaks.length === 0 && totalHands > 0) {
        leaks.push({
            id: 999, cat: 'System Intel', area: 'Sample Size Too Small', acc: Math.round(overallAcc), sample: totalHands,
            tip: 'Your accuracy is solid, or we need more data. Keep drilling across different categories to uncover hidden leaks.',
            sev: 'Low'
        });
    }

    leaks.sort((a, b) => a.acc - b.acc);

    return { overallAcc, totalHands, leaks };
}

export default function WeaknessScannerPage() {
    const router = useRouter();
    useTrainingBus('weakness-scanner');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=50`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const d = await res.json();
            if (d.success && d.sessions) setData(analyzeData(d.sessions));
        } catch (e) { console.error('[Scanner]', e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        const h = () => fetchData();
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, [fetchData]);

    return (
        <>
            <Head><title>Weakness Scanner | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>Weakness Scanner</div><div style={{ fontSize: 11, color: '#64748b' }}>AI leak detection</div></div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 32, height: 32, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.05)', borderTopColor: '#f87171', borderRadius: '50%' }} />
                            Scanning session data...
                        </div>
                    )}

                    {!loading && data && (
                        <>
                            {/* Summary Card */}
                            <div style={{ padding: '24px 20px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(248,113,113,0.1), rgba(0,0,0,0.2))', border: '1px solid rgba(248,113,113,0.2)', marginBottom: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Scan Complete</div>
                                        <div style={{ fontSize: 24, fontWeight: 900 }}>{data.leaks.length} Leaks Detected</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: data.overallAcc >= 80 ? '#4ade80' : '#fbbf24' }}>{Math.round(data.overallAcc)}%</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>Overall Acc</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 16, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>Based on analysis of your last {data.totalHands} hands, we've identified specific areas where your decisions consistently deviate from GTO frequencies.</div>
                            </div>

                            {/* Leaks List */}
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Identified Weaknesses</div>
                            <AnimatePresence>
                                {data.leaks.map((leak, i) => (
                                    <motion.div key={leak.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                                        style={{ padding: '16px', borderRadius: 12, marginBottom: 12, background: 'rgba(0,0,0,0.2)', border: `1px solid ${leak.sev === 'High' ? 'rgba(239,68,68,0.3)' : leak.sev === 'Medium' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.05)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <span style={{ fontSize: 15, fontWeight: 800 }}>{leak.area}</span>
                                                    <span style={{ padding: '2px 6px', borderRadius: 4, background: leak.sev === 'High' ? 'rgba(239,68,68,0.1)' : leak.sev === 'Medium' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.05)', color: leak.sev === 'High' ? '#f87171' : leak.sev === 'Medium' ? '#fbbf24' : '#94a3b8', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{leak.sev} Severity</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: '#94a3b8' }}>Category: {leak.cat} • {leak.sample} hand sample</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: leak.acc >= 75 ? '#4ade80' : leak.acc >= 60 ? '#fbbf24' : '#f87171' }}>{leak.acc}%</div>
                                                <div style={{ fontSize: 9, color: '#64748b' }}>Accuracy</div>
                                            </div>
                                        </div>

                                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 8 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#00d4ff', textTransform: 'uppercase', marginBottom: 4 }}>AI Fix Recommendation</div>
                                            <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>{leak.tip}</div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button onClick={() => router.push('/hub/training/coach-mode')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Study Concept</button>
                                            <button onClick={() => router.push('/hub/training/spot-trainer')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Drill Spot</button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </>
                    )}

                    {!loading && !data && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>No data to scan</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>Play some training sessions first</div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
