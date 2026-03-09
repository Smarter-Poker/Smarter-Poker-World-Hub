/**
 * SPR Trainer — Stack-to-Pot Ratio Commitment Decisions
 * Phase 27 · /hub/training/spr-trainer
 *
 * Given stack, pot, position, and hand strength → decide Commit / Neutral / Fold
 * SPR = Effective Stack / Pot · Teaches postflop commitment logic
 */
import React, { useState, useCallback, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';

function getAuthToken() {
    if (typeof window === 'undefined') return null;
    try { const r = localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token'); if (r) { const p = JSON.parse(r); return p?.access_token || p?.currentSession?.access_token || null; } } catch { }
    return null;
}
function saveSession(payload) {
    const token = getAuthToken(); if (!token) return;
    fetch('/api/training/save-session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }).catch(() => { });
}

// ── SPR Rules (simplified GTO) ─────────────────────────────────────
// SPR 0-1:   Always commit (top pair+, any made hand)
// SPR 1-4:   Commit with strong hands (2pair+), neutral with top pair
// SPR 4-13:  Commit only with sets+, neutral with 2pair, fold TPTK
// SPR 13+:   Commit only with monsters (straights+), fold everything else
const HAND_STRENGTHS = [
    { id: 'monsters', label: 'Monster Hand', desc: 'Straight, Flush, Full House, Quads, Straight Flush', commit_to: 0 },
    { id: 'set', label: 'Set (Trips)', desc: 'Three of a kind using a pocket pair', commit_to: 13 },
    { id: 'two_pair', label: 'Two Pair', desc: 'Two pair (e.g., pair on board + hole card pair)', commit_to: 4 },
    { id: 'tptk', label: 'Top Pair/Top Kicker', desc: 'Best possible pair with best kicker', commit_to: 1 },
    { id: 'tpwk', label: 'Top Pair/Weak Kicker', desc: 'Top pair with a subpar kicker', commit_to: 0.5 },
    { id: 'middle', label: 'Middle Pair', desc: 'Pair using middle board card', commit_to: 0.5 },
    { id: 'bottom', label: 'Bottom Pair', desc: 'Pair using lowest board card', commit_to: 0 },
    { id: 'draw', label: 'Strong Draw', desc: 'Flush draw or open-ended straight draw', commit_to: 2 },
    { id: 'weak_draw', label: 'Weak Draw', desc: 'Gutshot or backdoor draw', commit_to: 0 },
    { id: 'air', label: 'Air / Bluff', desc: 'No pair, no draw', commit_to: 0 },
];

const BOARD_TYPES = [
    { label: 'Dry Rainbow', texture: 'K♥ 7♦ 2♣' },
    { label: 'Wet Two-Tone', texture: 'J♥ T♥ 9♦' },
    { label: 'Paired Board', texture: 'A♠ A♦ 5♣' },
    { label: 'Monotone', texture: '8♥ 5♥ 2♥' },
    { label: 'Broadway Dry', texture: 'A♦ K♣ Q♠' },
    { label: 'Low Connected', texture: '6♣ 5♠ 4♦' },
];

function getCorrectAction(spr, handId) {
    const hs = HAND_STRENGTHS.find(h => h.id === handId);
    if (!hs) return 'fold';
    if (spr <= hs.commit_to) return 'commit';
    if (spr <= hs.commit_to * 3) return 'neutral';
    return 'fold';
}

function getExplanation(spr, handId, correct) {
    const hs = HAND_STRENGTHS.find(h => h.id === handId);
    const sprZone = spr <= 1 ? 'micro (0-1)' : spr <= 4 ? 'low (1-4)' : spr <= 13 ? 'medium (4-13)' : 'high (13+)';
    const lines = [
        `SPR = ${spr.toFixed(1)} — This is a **${sprZone}** SPR.`,
        `With ${hs?.label}, you can profitably commit stacks when SPR ≤ ${hs?.commit_to}.`,
    ];
    if (correct === 'commit') lines.push('✅ **Commit**: Stack-off is profitable. Get the money in.');
    else if (correct === 'neutral') lines.push('💧 **Neutral**: Play carefully. Control pot size. Re-evaluate on each street.');
    else lines.push('❌ **Fold**: Against aggression at this SPR, this hand does not have the equity to commit.');
    return lines;
}

function genScenario() {
    const stacks = [25, 35, 50, 75, 100, 150, 200, 300][Math.floor(Math.random() * 8)];
    const potFractions = [0.3, 0.4, 0.5, 0.6, 0.75, 1.0, 1.5, 2.0];
    const pot = Math.round(stacks * potFractions[Math.floor(Math.random() * potFractions.length)]);
    const spr = parseFloat((stacks / pot).toFixed(1));
    const hs = HAND_STRENGTHS[Math.floor(Math.random() * HAND_STRENGTHS.length)];
    const board = BOARD_TYPES[Math.floor(Math.random() * BOARD_TYPES.length)];
    return { stacks, pot, spr, hs, board };
}

const ACTION_CONFIG = {
    commit: { label: '💪 COMMIT', color: '#22c55e', sub: 'Stack off / Call all-in' },
    neutral: { label: '💧 NEUTRAL', color: '#f97316', sub: 'Play carefully, control pot' },
    fold: { label: '❌ FOLD', color: '#ef4444', sub: 'Give up — SPR too high' },
};

export default function SPRTrainer() {
    useTrainingBus('spr-trainer');
    const router = useRouter();

    const [scenario, setScenario] = useState(null);
    const [choice, setChoice] = useState(null);
    const [stats, setStats] = useState({ correct: 0, total: 0 });

    useEffect(() => { setScenario(genScenario()); }, []);

    const correctAction = scenario ? getCorrectAction(scenario.spr, scenario.hs.id) : null;

    const handleChoice = useCallback((action) => {
        if (!scenario || choice !== null) return;
        setChoice(action);
        const isCorrect = action === correctAction;
        setStats(prev => {
            const next = { correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 };
            const accuracy = Math.round((next.correct / next.total) * 100);
            busEmit('training:session-complete', { game_id: 'spr-trainer', accuracy, correct_answers: next.correct, total_questions: next.total });
            saveSession({ game_id: 'spr-trainer', accuracy, hands_played: next.total, correct_answers: next.correct, total_questions: next.total });
            return next;
        });
    }, [scenario, choice, correctAction]);

    const nextScenario = useCallback(() => {
        setScenario(genScenario());
        setChoice(null);
    }, []);

    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const explanation = choice !== null && scenario ? getExplanation(scenario.spr, scenario.hs.id, correctAction) : [];

    // SPR color coding
    const sprColor = scenario ? (scenario.spr <= 1 ? '#ef4444' : scenario.spr <= 4 ? '#f97316' : scenario.spr <= 13 ? '#fbbf24' : '#22c55e') : '#94a3b8';
    const sprZoneLabel = scenario ? (scenario.spr <= 1 ? 'MICRO' : scenario.spr <= 4 ? 'LOW' : scenario.spr <= 13 ? 'MEDIUM' : 'HIGH') : '';

    const C = {
        page: { minHeight: '100vh', background: 'linear-gradient(135deg,#0a0f1e,#0d1629,#0a0f1e)', color: '#e2e8f0', fontFamily: "'Inter',sans-serif", padding: '20px 16px 40px' },
        card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px', marginBottom: 14 },
        orb: { fontFamily: "'Orbitron',monospace" },
    };

    return (
        <>
            <Head>
                <title>SPR Trainer | Smarter.Poker</title>
                <meta name="description" content="Train Stack-to-Pot Ratio commitment decisions. Learn when to commit, play neutral, or fold based on SPR and hand strength." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
            </Head>
            <div style={C.page}>
                <div style={{ maxWidth: 560, margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 12, cursor: 'pointer', marginBottom: 16 }}>← Training Hub</button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#fbbf2420,#f9731620)', border: '1px solid rgba(251,191,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📐</div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, ...C.orb, background: 'linear-gradient(135deg,#fbbf24,#f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SPR TRAINER</h1>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>Stack-to-Pot Ratio · Commitment Decisions</p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                        {[
                            { label: 'Accuracy', value: `${accuracy}%`, color: accuracy >= 70 ? '#22c55e' : '#f97316' },
                            { label: 'Correct', value: stats.correct, color: '#22c55e' },
                            { label: 'Total', value: stats.total, color: '#94a3b8' },
                        ].map(s => (
                            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 900, ...C.orb, color: s.color }}>{s.value}</div>
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {scenario && (
                        <AnimatePresence mode="wait">
                            <motion.div key={scenario.stacks + scenario.pot + scenario.hs.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                {/* Scenario Card */}
                                <div style={C.card}>
                                    {/* SPR Display */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>Stack-to-Pot Ratio</div>
                                            <div style={{ fontSize: 44, fontWeight: 900, ...C.orb, color: sprColor, lineHeight: 1 }}>{scenario.spr.toFixed(1)}</div>
                                            <div style={{ fontSize: 11, fontWeight: 800, color: sprColor, marginTop: 2 }}>SPR ZONE: {sprZoneLabel}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>STACKS / POT</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8', ...C.orb }}>{scenario.stacks} / {scenario.pot}</div>
                                            <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>Eff. Stack ÷ Pot Size</div>
                                        </div>
                                    </div>

                                    {/* SPR Scale bar */}
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', fontWeight: 700, marginBottom: 3 }}>
                                            {['0', '1', '4', '13', '20+'].map(v => <span key={v}>{v}</span>)}
                                        </div>
                                        <div style={{ height: 8, borderRadius: 4, background: 'linear-gradient(to right,#ef4444,#f97316,#fbbf24,#22c55e)', position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: 0, left: `${Math.min(100, (scenario.spr / 20) * 100)}%`, width: 3, height: '100%', background: '#fff', transform: 'translateX(-50%)' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#475569', fontWeight: 600, marginTop: 3 }}>
                                            <span>Always Commit</span><span>Strong Only</span><span>Sets+</span><span>Monsters</span>
                                        </div>
                                    </div>

                                    {/* Hand + Board */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
                                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Your Hand</div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{scenario.hs.label}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{scenario.hs.desc}</div>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
                                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Board Texture</div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', ...C.orb }}>{scenario.board.texture}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{scenario.board.label}</div>
                                        </div>
                                    </div>
                                </div>

                                <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', fontWeight: 600, marginBottom: 14 }}>
                                    Facing a pot-sized bet. SPR = <strong style={{ color: sprColor }}>{scenario.spr.toFixed(1)}</strong>. What is your decision?
                                </p>

                                {/* Decision buttons */}
                                {choice === null && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                                        {Object.entries(ACTION_CONFIG).map(([a, cfg]) => (
                                            <button key={a} onClick={() => handleChoice(a)} style={{
                                                padding: '14px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                                                background: `${cfg.color}18`, color: cfg.color,
                                                fontWeight: 900, fontSize: 12, cursor: 'pointer', lineHeight: 1.4, ...C.orb,
                                            }}>
                                                {cfg.label}<br /><span style={{ fontSize: 9, opacity: 0.7, fontFamily: 'Inter,sans-serif' }}>{cfg.sub}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Result */}
                                {choice !== null && (
                                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                                        <div style={{
                                            padding: '14px 16px', borderRadius: 12, marginBottom: 12, fontSize: 14, fontWeight: 800,
                                            background: choice === correctAction ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                                            border: `1px solid ${choice === correctAction ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                            color: choice === correctAction ? '#22c55e' : '#ef4444',
                                        }}>
                                            {choice === correctAction ? '✅ CORRECT!' : `❌ WRONG — Correct: ${ACTION_CONFIG[correctAction].label}`}
                                        </div>

                                        {/* Explanation */}
                                        <div style={{ ...C.card, background: 'rgba(255,255,255,0.02)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📚 SPR Breakdown</div>
                                            {explanation.map((line, i) => (
                                                <div key={i} style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, marginBottom: 4, fontWeight: 600 }}>
                                                    {line.split('**').map((p, j) => j % 2 === 0 ? <span key={j}>{p}</span> : <strong key={j} style={{ color: sprColor }}>{p}</strong>)}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Quick SPR reference */}
                                        <div style={{ ...C.card, background: 'rgba(255,255,255,0.015)', marginBottom: 12 }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>SPR Reference Guide</div>
                                            {[
                                                { range: '0–1', zone: 'MICRO', rule: 'Always commit any made hand', color: '#ef4444' },
                                                { range: '1–4', zone: 'LOW', rule: 'Commit 2-pair+, neutral with TPTK', color: '#f97316' },
                                                { range: '4–13', zone: 'MEDIUM', rule: 'Commit sets+, fold TPTK vs heavy action', color: '#fbbf24' },
                                                { range: '13+', zone: 'HIGH', rule: 'Commit monsters only (straight, flush+)', color: '#22c55e' },
                                            ].map(row => (
                                                <div key={row.zone} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                                                    <div style={{ minWidth: 36, fontSize: 10, fontWeight: 800, color: row.color, ...C.orb }}>{row.range}</div>
                                                    <div style={{ flex: 1, fontSize: 11, color: '#64748b' }}>{row.rule}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <button onClick={nextScenario} style={{ width: '100%', padding: 14, borderRadius: 12, background: 'linear-gradient(135deg,#fbbf24,#f97316)', border: 'none', color: '#000', fontWeight: 900, fontSize: 14, cursor: 'pointer', ...C.orb }}>
                                            NEXT SCENARIO →
                                        </button>
                                    </motion.div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </>
    );
}
