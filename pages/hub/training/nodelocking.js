/**
 * 🔒 NODELOCKING TOOL — Exploitative Strategy Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Lock villain strategies at decision nodes to compute optimal counter-strategies.
 * Pre-built profiles: Nit, TAG, LAG, Calling Station, Maniac.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { DiamondEngine } from '../../../src/services/DiamondEngine';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// VILLAIN PROFILES
// ═══════════════════════════════════════════════════════════════════════════

const VILLAIN_PROFILES = {
    gto: {
        name: 'GTO Baseline', icon: '🎯', color: '#22c55e',
        desc: 'Balanced, unexploitable strategy',
        tendencies: { vpip: 24, pfr: 19, threeBet: 7.5, foldTo3Bet: 55, cBet: 65, foldToCBet: 42, callDown: 50 },
    },
    nit: {
        name: 'Nit', icon: '🐢', color: '#94a3b8',
        desc: 'Very tight, only plays premium hands. Folds too much.',
        tendencies: { vpip: 12, pfr: 10, threeBet: 3, foldTo3Bet: 78, cBet: 80, foldToCBet: 28, callDown: 25 },
    },
    tag: {
        name: 'TAG', icon: '🦅', color: '#3b82f6',
        desc: 'Tight-Aggressive. Solid but predictable ranges.',
        tendencies: { vpip: 20, pfr: 18, threeBet: 6, foldTo3Bet: 60, cBet: 72, foldToCBet: 38, callDown: 40 },
    },
    lag: {
        name: 'LAG', icon: '🔥', color: '#f59e0b',
        desc: 'Loose-Aggressive. Wide ranges, lots of aggression.',
        tendencies: { vpip: 35, pfr: 28, threeBet: 12, foldTo3Bet: 40, cBet: 55, foldToCBet: 50, callDown: 55 },
    },
    callingStation: {
        name: 'Calling Station', icon: '📞', color: '#a855f7',
        desc: 'Calls too much, rarely raises or folds. Passive player.',
        tendencies: { vpip: 45, pfr: 8, threeBet: 2, foldTo3Bet: 30, cBet: 35, foldToCBet: 20, callDown: 80 },
    },
    maniac: {
        name: 'Maniac', icon: '💥', color: '#ef4444',
        desc: 'Ultra-aggressive. Bets and raises with everything.',
        tendencies: { vpip: 55, pfr: 45, threeBet: 18, foldTo3Bet: 25, cBet: 90, foldToCBet: 55, callDown: 40 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT CALCULATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function calculateExploits(profile) {
    const t = profile.tendencies;
    const gto = VILLAIN_PROFILES.gto.tendencies;
    const exploits = [];

    // Fold-to-3bet exploit
    if (t.foldTo3Bet > gto.foldTo3Bet + 10) {
        exploits.push({
            action: '3-Bet More', priority: 'HIGH',
            desc: `Villain folds to 3-bet ${t.foldTo3Bet}% (GTO: ${gto.foldTo3Bet}%). 3-bet wider for auto-profit.`,
            frequency: `3-bet ${Math.min(25, Math.round(t.foldTo3Bet * 0.3))}% of hands`,
            ev: `+${((t.foldTo3Bet - gto.foldTo3Bet) * 0.03).toFixed(2)} BB/hand`,
            color: '#22c55e',
        });
    }

    // Low VPIP exploit (steal more)
    if (t.vpip < gto.vpip - 5) {
        exploits.push({
            action: 'Steal Blinds Aggressively', priority: 'HIGH',
            desc: `Villain plays only ${t.vpip}% of hands. Steal with wider ranges from late positions.`,
            frequency: `Open ${Math.min(60, Math.round(100 - t.foldTo3Bet))}% from BTN`,
            ev: `+${((gto.vpip - t.vpip) * 0.02).toFixed(2)} BB/hand`,
            color: '#22c55e',
        });
    }

    // High call-down (value bet relentlessly)
    if (t.callDown > gto.callDown + 15) {
        exploits.push({
            action: 'Value Bet Thin', priority: 'HIGH',
            desc: `Villain calls down ${t.callDown}% (GTO: ${gto.callDown}%). Bet for value with medium-strength hands.`,
            frequency: 'Bet all 3 streets with top pair+',
            ev: `+${((t.callDown - gto.callDown) * 0.04).toFixed(2)} BB/hand`,
            color: '#22c55e',
        });
    }

    // High call-down also means reduce bluffs
    if (t.callDown > gto.callDown + 10) {
        exploits.push({
            action: 'Reduce Bluffs', priority: 'MEDIUM',
            desc: `Villain doesn't fold enough. Cut bluffing frequency significantly.`,
            frequency: `Bluff only ${Math.max(10, Math.round(100 - t.callDown))}% of bet freq`,
            ev: `+${((t.callDown - gto.callDown) * 0.02).toFixed(2)} BB/hand`,
            color: '#fbbf24',
        });
    }

    // Low fold-to-cbet (give up more)
    if (t.foldToCBet < gto.foldToCBet - 10) {
        exploits.push({
            action: 'Reduce C-Betting', priority: 'MEDIUM',
            desc: `Villain only folds to C-bet ${t.foldToCBet}%. Don't auto-cbet without equity.`,
            frequency: `C-bet only ${Math.min(50, t.foldToCBet + 10)}% of the time`,
            ev: `+${((gto.foldToCBet - t.foldToCBet) * 0.015).toFixed(2)} BB/hand`,
            color: '#fbbf24',
        });
    }

    // High aggression (trap more)
    if (t.pfr > gto.pfr + 10) {
        exploits.push({
            action: 'Set Traps', priority: 'MEDIUM',
            desc: `Villain over-raises (PFR: ${t.pfr}%). Flat-call with strong hands to trap.`,
            frequency: 'Flat AA/KK vs their opens sometimes',
            ev: `+${((t.pfr - gto.pfr) * 0.025).toFixed(2)} BB/hand`,
            color: '#f97316',
        });
    }

    // Low aggression (probe and take pots)
    if (t.cBet < gto.cBet - 15) {
        exploits.push({
            action: 'Probe / Donk Bet', priority: 'MEDIUM',
            desc: `Villain C-bets only ${t.cBet}%. Take the initiative with probing bets.`,
            frequency: 'Donk-bet 40% on favorable boards',
            ev: `+${((gto.cBet - t.cBet) * 0.02).toFixed(2)} BB/hand`,
            color: '#fbbf24',
        });
    }

    if (exploits.length === 0) {
        exploits.push({
            action: 'Play GTO', priority: 'LOW',
            desc: 'This villain plays close to GTO. No major exploits available.',
            frequency: 'Maintain balanced strategy',
            ev: '0.00 BB/hand',
            color: '#22c55e',
        });
    }

    return exploits.sort((a, b) => {
        const p = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return (p[a.priority] || 2) - (p[b.priority] || 2);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE TREE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════

function DecisionNode({ action, freq, isLocked, isVillain, depth = 0 }) {
    const color = isLocked ? '#ef4444' : isVillain ? '#a855f7' : '#00d4ff';
    return (
        <div style={{ marginLeft: depth * 24, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
                width: 16, height: 16, borderRadius: depth > 0 ? '50%' : 4,
                background: `${color}30`, border: `2px solid ${color}`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 8,
            }}>
                {isLocked ? '🔒' : ''}
            </div>
            <div style={{
                padding: '4px 12px', borderRadius: 6,
                background: `${color}15`, border: `1px solid ${color}30`,
                fontSize: 11, fontWeight: 600, color,
            }}>
                {action} <span style={{ color: '#64748b', fontWeight: 400 }}>({freq}%)</span>
            </div>
        </div>
    );
}

function NodeTree({ profile }) {
    const t = profile.tendencies;
    return (
        <div style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 16,
        }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Decision Tree (Villain's Locked Strategy)</div>
            <DecisionNode action="Open Raise" freq={t.pfr} isVillain depth={0} />
            <DecisionNode action="Fold to 3-Bet" freq={t.foldTo3Bet} isLocked isVillain depth={1} />
            <DecisionNode action="Call 3-Bet" freq={Math.max(0, 100 - t.foldTo3Bet - 8)} isVillain depth={1} />
            <DecisionNode action="4-Bet" freq={Math.min(12, 8)} isVillain depth={1} />
            <DecisionNode action="C-Bet Flop" freq={t.cBet} isLocked isVillain depth={2} />
            <DecisionNode action="Check" freq={100 - t.cBet} isVillain depth={2} />
            <DecisionNode action="Call Down" freq={t.callDown} isLocked isVillain depth={3} />
            <DecisionNode action="Fold" freq={Math.max(0, 100 - t.callDown)} isVillain depth={3} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function NodelockingPage() {
    const router = useRouter();
    useTrainingBus('nodelocking');

    const [isCheckingVIP, setIsCheckingVIP] = useState(true);

    useEffect(() => {
        const checkVIP = async () => {
            const user = getAuthUser();
            if (!user) {
                router.push('/login');
                return;
            }
            await DiamondEngine.init(user.id);
            const isVIP = await DiamondEngine.isVIP();
            if (!isVIP) {
                if (typeof window !== 'undefined') {
                    // Slight delay so toast from routing can show if applicable
                    setTimeout(() => router.push('/hub/diamond-store?tab=vip'), 500);
                }
                return;
            }
            setIsCheckingVIP(false);
        };
        checkVIP();
    }, [router]);

    // Persist last-used profile in localStorage
    const [selectedProfile, setSelectedProfile] = useState('nit');
    const [customTendencies, setCustomTendencies] = useState(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('sp_nodelock_profile');
            if (saved && VILLAIN_PROFILES[saved]) setSelectedProfile(saved);
        } catch (e) { /* SSG safety */ }
    }, []);

    const handleProfileChange = useCallback((key) => {
        setSelectedProfile(key);
        setCustomTendencies(null);
        try { localStorage.setItem('sp_nodelock_profile', key); } catch (e) { }
        if (typeof eventBus !== 'undefined' && eventBus.emit) {
            eventBus.emit(EventType?.SETTINGS_CHANGE || 'settings:change', { tool: 'nodelocking', profile: key }, 'Nodelocking');
        }
    }, []);

    const activeProfile = customTendencies
        ? { ...VILLAIN_PROFILES[selectedProfile], tendencies: customTendencies }
        : VILLAIN_PROFILES[selectedProfile];

    const exploits = useMemo(() => calculateExploits(activeProfile), [activeProfile]);

    const handleTendencyChange = useCallback((key, value) => {
        const base = VILLAIN_PROFILES[selectedProfile].tendencies;
        setCustomTendencies(prev => ({ ...(prev || base), [key]: Math.max(0, Math.min(100, parseFloat(value) || 0)) }));
    }, [selectedProfile]);

    // Total EV from exploits
    const totalEV = useMemo(() => {
        return exploits.reduce((sum, e) => sum + parseFloat(e.ev) || 0, 0).toFixed(2);
    }, [exploits]);

    // Save profile analysis to Supabase
    const saveAnalysis = useCallback(async () => {
        try {
            const token = getAccessToken();
            if (token) {
                await fetch('/api/training/save-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        gameId: 'nodelocking',
                        questionsAnswered: exploits.length,
                        questionsCorrect: exploits.filter(e => e.priority === 'HIGH').length,
                        accuracy: Math.round((exploits.filter(e => e.priority === 'HIGH').length / Math.max(exploits.length, 1)) * 100),
                        trainerConfig: { profile: selectedProfile, tendencies: activeProfile.tendencies, exploits: exploits.map(e => e.action), totalEV },
                    }),
                });
            }
            eventBus.emit(EventType.SESSION_END, { accuracy: 100, questionsAnswered: exploits.length, questionsCorrect: exploits.length }, 'nodelocking');
        } catch (e) { console.error('[Nodelocking] Save error:', e); }
    }, [selectedProfile, activeProfile, exploits, totalEV]);

    if (isCheckingVIP) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0a12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: 24, fontWeight: 900 }}>Verifying VIP Status...</div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Nodelocking | Smarter.Poker Training</title>
                <meta name="description" content="Lock villain strategies at decision nodes and discover optimal exploits. Build exploitative adjustments vs any player type." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                    >← Training</button>
                    <h1 style={{
                        fontSize: 20, fontWeight: 800, margin: 0,
                        background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        fontFamily: "'Orbitron', monospace",
                    }}>Nodelocking</h1>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
                    {/* Villain Profile Selector */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20,
                    }}>
                        {Object.entries(VILLAIN_PROFILES).filter(([k]) => k !== 'gto').map(([key, profile]) => (
                            <motion.button
                                key={key}
                                onClick={() => handleProfileChange(key)}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                    padding: '12px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                                    background: selectedProfile === key
                                        ? `${profile.color}20`
                                        : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${selectedProfile === key ? profile.color + '50' : 'rgba(255,255,255,0.06)'}`,
                                    textAlign: 'center',
                                }}
                            >
                                <div style={{ fontSize: 24 }}>{profile.icon}</div>
                                <div style={{
                                    fontSize: 11, fontWeight: 700,
                                    color: selectedProfile === key ? profile.color : '#94a3b8',
                                }}>{profile.name}</div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Active Profile Description */}
                    <div style={{
                        padding: '12px 16px', borderRadius: 10, marginBottom: 16,
                        background: `${activeProfile.color}10`,
                        border: `1px solid ${activeProfile.color}30`,
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: activeProfile.color, marginBottom: 4 }}>
                            {activeProfile.icon} {activeProfile.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{activeProfile.desc}</div>
                    </div>

                    {/* Tendency Sliders (Editable) */}
                    <div style={{
                        padding: 16, borderRadius: 12,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                        marginBottom: 16,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
                            🏛️ Locked Tendencies <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>(drag sliders to customize)</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(activeProfile.tendencies).map(([key, val]) => (
                                <div key={key}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: val > 50 ? '#fbbf24' : '#00d4ff', fontFamily: "'Orbitron', monospace" }}>{val}%</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="100" step="1"
                                        value={val}
                                        onChange={(e) => handleTendencyChange(key, e.target.value)}
                                        style={{ width: '100%', accentColor: activeProfile.color, height: 6 }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Decision Tree */}
                    <NodeTree profile={activeProfile} />

                    {/* Exploit Recommendations */}
                    <div style={{
                        padding: 16, borderRadius: 12,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
                            Optimal Exploits
                        </div>
                        {exploits.map((exploit, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                style={{
                                    padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                                    background: `${exploit.color}10`,
                                    border: `1px solid ${exploit.color}30`,
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: exploit.color }}>
                                        {exploit.action}
                                    </div>
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                        background: exploit.priority === 'HIGH' ? 'rgba(34,197,94,0.2)' : 'rgba(251,191,36,0.2)',
                                        color: exploit.priority === 'HIGH' ? '#22c55e' : '#fbbf24',
                                    }}>{exploit.priority}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{exploit.desc}</div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
                                    <span style={{ color: '#00d4ff' }}>Freq: {exploit.frequency}</span>
                                    <span style={{ color: '#22c55e', fontWeight: 700 }}>EV: {exploit.ev}</span>
                                </div>
                            </motion.div>
                        ))}

                        {/* Total EV Impact */}
                        <div style={{
                            marginTop: 12, padding: '16px', borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(0,212,255,0.08))',
                            border: '1px solid rgba(34,197,94,0.2)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Estimated Total Edge</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Combined EV from all exploits</div>
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e', fontFamily: "'Orbitron', monospace" }}>
                                +{totalEV} <span style={{ fontSize: 12, color: '#64748b' }}>BB/hand</span>
                            </div>
                        </div>

                        {/* Save Analysis Button */}
                        <motion.button
                            whileTap={{ scale: 0.97 }}
                            onClick={saveAnalysis}
                            style={{
                                width: '100%', marginTop: 16, padding: '14px', borderRadius: 10,
                                border: 'none', background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                                color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(239,68,68,0.2)',
                            }}
                        >
                            💾 Save Analysis to Database
                        </motion.button>
                    </div>
                </div>
            </div>
        </>
    );
}
