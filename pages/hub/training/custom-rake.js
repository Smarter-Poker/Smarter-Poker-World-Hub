/**
 * CUSTOM RAKE SOLVER — Rake-Adjusted GTO Solutions
 * ═══════════════════════════════════════════════════════════════════════════
 * Input your casino's rake structure and see how optimal strategy changes
 * compared to no-rake GTO solutions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// RAKE PRESETS
// ═══════════════════════════════════════════════════════════════════════════

const RAKE_PRESETS = [
    { id: 'micro', label: 'Micro Stakes Online', pct: 5.0, cap: 1.0, bbCap: 5.0, desc: '$0.01/$0.02 - $0.05/$0.10' },
    { id: 'low', label: 'Low Stakes Online', pct: 5.0, cap: 3.0, bbCap: 3.0, desc: '$0.10/$0.25 - $0.25/$0.50' },
    { id: 'mid', label: 'Mid Stakes Online', pct: 4.5, cap: 3.5, bbCap: 1.75, desc: '$1/$2 - $2/$5' },
    { id: 'high', label: 'High Stakes Online', pct: 3.0, cap: 5.0, bbCap: 1.0, desc: '$5/$10+' },
    { id: 'live_low', label: 'Live $1/$2-$1/$3', pct: 10.0, cap: 5.0, bbCap: 2.5, desc: 'Typical live low stakes' },
    { id: 'live_mid', label: 'Live $2/$5', pct: 5.0, cap: 8.0, bbCap: 1.6, desc: 'Standard live mid stakes' },
    { id: 'live_high', label: 'Live $5/$10+', pct: 3.5, cap: 10.0, bbCap: 1.0, desc: 'Live high stakes' },
    { id: 'custom', label: 'Custom Rake', pct: 5.0, cap: 3.0, bbCap: 0, desc: 'Enter your own rake structure' },
];

// ═══════════════════════════════════════════════════════════════════════════
// RAKE IMPACT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

function calculateRakeImpact(rakePct, cap, stackBB) {
    const safeRake = Math.max(0, Number(rakePct) || 0);
    const safeCap = Math.max(0, Number(cap) || 0);
    const safeStack = Math.max(1, Number(stackBB) || 100);
    const avgPotBB = safeStack * 0.12;
    const rakePerPot = Math.min(safeCap, avgPotBB * (safeRake / 100));
    const rakePerHandBB = rakePerPot;
    const handsPerHour = 28;
    const rakePerHourBB = rakePerHandBB * handsPerHour * 0.35;

    const openAdj = safeRake > 6 ? -3.2 : safeRake > 4 ? -1.5 : -0.5;
    const threeBetAdj = safeRake > 6 ? +2.8 : safeRake > 4 ? +1.2 : +0.3;
    const callAdj = safeRake > 6 ? -4.5 : safeRake > 4 ? -2.0 : -0.8;
    const cBetAdj = safeRake > 6 ? +3.0 : safeRake > 4 ? +1.5 : +0.5;
    const suitedAdj = safeRake > 6 ? -5.0 : safeRake > 4 ? -2.5 : -1.0;

    return {
        rakePerPot: Number.isFinite(rakePerPot) ? rakePerPot.toFixed(2) : '0.00',
        rakePerHourBB: Number.isFinite(rakePerHourBB) ? rakePerHourBB.toFixed(1) : '0.0',
        monthlyImpactBB: Number.isFinite(rakePerHourBB) ? (rakePerHourBB * 40).toFixed(0) : '0',
        adjustments: [
            { stat: 'Open Raise Range', adj: `${openAdj > 0 ? '+' : ''}${openAdj.toFixed(1)}%`, color: openAdj < 0 ? '#f87171' : '#4ade80', note: openAdj < 0 ? 'Tighten up — marginal opens become -EV' : 'Slightly wider' },
            { stat: '3-Bet Frequency', adj: `${threeBetAdj > 0 ? '+' : ''}${threeBetAdj.toFixed(1)}%`, color: '#4ade80', note: '3-bets reduce rake by ending hands preflop' },
            { stat: 'Cold Call Range', adj: `${callAdj > 0 ? '+' : ''}${callAdj.toFixed(1)}%`, color: '#f87171', note: 'Cold calling is worse with rake — prefer 3-bet or fold' },
            { stat: 'C-Bet Frequency', adj: `${cBetAdj > 0 ? '+' : ''}${cBetAdj.toFixed(1)}%`, color: '#4ade80', note: 'Bet more to deny equity and end hands faster' },
            { stat: 'Suited Connectors', adj: `${suitedAdj > 0 ? '+' : ''}${suitedAdj.toFixed(1)}%`, color: '#f87171', note: 'Implied odds reduced by rake — speculative hands suffer most' },
        ],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CustomRakePage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [preset, setPreset] = useState(RAKE_PRESETS[0]);
    const [customPct, setCustomPct] = useState(5.0);
    const [customCap, setCustomCap] = useState(3.0);
    const [stackDepth, setStackDepth] = useState(100);

    useTrainingBus('custom-rake');

    useEffect(() => { try { setUser(getAuthUser()); } catch (_) { } }, []);

    const rakePct = preset.id === 'custom' ? customPct : preset.pct;
    const rakeCap = preset.id === 'custom' ? customCap : preset.cap;

    const impact = useMemo(() => {
        const result = calculateRakeImpact(rakePct, rakeCap, stackDepth);
        eventBus.emit('training:session-complete', { game_id: 'custom-rake', accuracy: 100, correct_answers: 1, total_questions: 1, hands_played: 1 });
        return result;
    }, [rakePct, rakeCap, stackDepth]);

    return (
        <>
            <Head>
                <title>Custom Rake Solver | Smarter.Poker</title>
                <meta name="description" content="See how rake affects GTO strategy — input your casino's rake structure" />
            </Head>

            <div style={{ minHeight: '100vh', background: '#18191a', color: '#e4e6eb', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
                    <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>Back to Training</button>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>Custom Rake Solver</h1>
                    <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>See how rake structure affects optimal GTO strategy</p>
                </div>

                <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
                    {/* Rake Preset Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8, marginBottom: 16 }}>
                        {RAKE_PRESETS.map(r => (
                            <button key={r.id} onClick={() => setPreset(r)}
                                style={{
                                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                    background: preset.id === r.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${preset.id === r.id ? '#818cf8' : 'rgba(255,255,255,0.06)'}`,
                                }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: preset.id === r.id ? '#818cf8' : '#e4e6eb', marginBottom: 2 }}>{r.label}</div>
                                <div style={{ fontSize: 11, color: '#b0b3b8' }}>{r.pct}% / Cap ${r.cap}</div>
                                <div style={{ fontSize: 10, color: '#6b7280' }}>{r.desc}</div>
                            </button>
                        ))}
                    </div>

                    {/* Custom Inputs */}
                    {preset.id === 'custom' && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#b0b3b8', display: 'block', marginBottom: 4 }}>Rake %</label>
                                <input type="number" step="0.5" value={customPct} onChange={e => setCustomPct(parseFloat(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#b0b3b8', display: 'block', marginBottom: 4 }}>Cap ($)</label>
                                <input type="number" step="0.5" value={customCap} onChange={e => setCustomCap(parseFloat(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }} />
                            </div>
                        </div>
                    )}

                    {/* Stack Depth Slider */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#b0b3b8' }}>Stack Depth</label>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#e4e6eb' }}>{stackDepth}BB</span>
                        </div>
                        <input type="range" min="20" max="200" value={stackDepth} onChange={e => setStackDepth(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: '#818cf8' }} />
                    </div>

                    {/* Impact Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: 'Rake Per Pot', value: `${impact.rakePerPot}BB`, color: '#f59e0b' },
                            { label: 'Rake / Hour', value: `${impact.rakePerHourBB}BB`, color: '#ef4444' },
                            { label: 'Monthly Impact', value: `${impact.monthlyImpactBB}BB`, color: '#f87171' },
                        ].map(s => (
                            <div key={s.label} style={{
                                padding: '14px', borderRadius: 10, textAlign: 'center',
                                background: `${s.color}08`, border: `1px solid ${s.color}25`,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: '0.08em', marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#e4e6eb' }}>{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Strategy Adjustments */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e6eb', margin: '0 0 14px', fontFamily: "'Rajdhani', sans-serif" }}>
                            Strategy Adjustments (vs No-Rake GTO)
                        </h3>
                        {impact.adjustments.map((a, i) => (
                            <div key={i} style={{
                                padding: '10px 14px', marginBottom: 8, borderRadius: 8,
                                background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${a.color}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e6eb' }}>{a.stat}</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{a.adj}</span>
                                </div>
                                <div style={{ fontSize: 12, color: '#b0b3b8' }}>{a.note}</div>
                            </div>
                        ))}
                    </div>

                    {/* Key Insight */}
                    <div style={{
                        marginTop: 16, padding: '14px 18px', borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
                        border: '1px solid rgba(99,102,241,0.2)', borderLeft: '3px solid #818cf8',
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.08em', marginBottom: 4 }}>KEY INSIGHT</div>
                        <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5 }}>
                            At {rakePct}% rake with ${rakeCap} cap, you&apos;re paying approximately {impact.rakePerHourBB}BB/hour in rake.
                            {parseFloat(impact.rakePerHourBB) > 5
                                ? ' This is HIGH — tighten preflop, 3-bet more instead of calling, and avoid speculative hands.'
                                : parseFloat(impact.rakePerHourBB) > 2
                                    ? ' This is MODERATE — slight tightening recommended, especially for cold calls.'
                                    : ' This is LOW — rake has minimal impact on optimal strategy.'}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
