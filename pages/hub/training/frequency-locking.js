/**
 * FREQUENCY LOCKING 2.0 — Node-Level Frequency Constraints
 * ═══════════════════════════════════════════════════════════════════════════
 * Lock specific action frequencies at any decision node and see how
 * the rest of the game tree adjusts to maintain equilibrium.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// DECISION TREE NODES
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_TREE = [
    {
        id: 'root', label: 'Preflop Decision', street: 'preflop',
        actions: [
            { name: 'Raise', freq: 68, locked: false, color: '#ef4444' },
            { name: 'Call', freq: 18, locked: false, color: '#4ade80' },
            { name: 'Fold', freq: 14, locked: false, color: '#6b7280' },
        ],
    },
    {
        id: 'flop', label: 'Flop C-Bet', street: 'flop',
        actions: [
            { name: 'Bet 33%', freq: 35, locked: false, color: '#f59e0b' },
            { name: 'Bet 67%', freq: 20, locked: false, color: '#ef4444' },
            { name: 'Check', freq: 45, locked: false, color: '#3b82f6' },
        ],
    },
    {
        id: 'turn', label: 'Turn Barrel', street: 'turn',
        actions: [
            { name: 'Bet 67%', freq: 38, locked: false, color: '#ef4444' },
            { name: 'Bet 100%', freq: 12, locked: false, color: '#f87171' },
            { name: 'Check', freq: 50, locked: false, color: '#3b82f6' },
        ],
    },
    {
        id: 'river', label: 'River Decision', street: 'river',
        actions: [
            { name: 'Value Bet', freq: 30, locked: false, color: '#4ade80' },
            { name: 'Bluff', freq: 15, locked: false, color: '#ef4444' },
            { name: 'Check', freq: 55, locked: false, color: '#3b82f6' },
        ],
    },
];

function rebalanceFrequencies(actions, changedIdx) {
    const locked = actions.filter((_, i) => actions[i].locked || i === changedIdx);
    const lockedSum = locked.reduce((s, a) => s + a.freq, 0);
    const unlocked = actions.filter((a, i) => !a.locked && i !== changedIdx);

    if (unlocked.length === 0 || lockedSum >= 100) return actions;

    const remaining = 100 - lockedSum;
    const equalShare = remaining / unlocked.length;

    return actions.map((a, i) => {
        if (a.locked || i === changedIdx) return a;
        return { ...a, freq: Math.max(0, Math.round(equalShare)) };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY SLIDER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function FreqSlider({ action, onChange, onToggleLock }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: action.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e6eb' }}>{action.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: action.color }}>{action.freq}%</span>
                    <button
                        onClick={onToggleLock}
                        style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: action.locked ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${action.locked ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
                            color: action.locked ? '#f59e0b' : '#6b7280', letterSpacing: '0.05em',
                        }}
                    >
                        {action.locked ? 'LOCKED' : 'LOCK'}
                    </button>
                </div>
            </div>
            <div style={{ position: 'relative' }}>
                <input
                    type="range" min="0" max="100" value={action.freq}
                    onChange={e => onChange(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: action.color }}
                />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function FrequencyLockingPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [tree, setTree] = useState(DEFAULT_TREE);
    const [activeNode, setActiveNode] = useState(0);
    const [showImpact, setShowImpact] = useState(false);

    useTrainingBus('frequency-locking');

    useEffect(() => { try { setUser(getAuthUser()); } catch (_) { } }, []);

    const handleFreqChange = useCallback((nodeIdx, actionIdx, newFreq) => {
        setTree(prev => {
            const updated = [...prev];
            const node = { ...updated[nodeIdx] };
            const actions = [...node.actions];
            actions[actionIdx] = { ...actions[actionIdx], freq: newFreq };
            node.actions = rebalanceFrequencies(actions, actionIdx);
            updated[nodeIdx] = node;
            return updated;
        });
    }, []);

    const handleToggleLock = useCallback((nodeIdx, actionIdx) => {
        setTree(prev => {
            const updated = [...prev];
            const node = { ...updated[nodeIdx] };
            const actions = [...node.actions];
            actions[actionIdx] = { ...actions[actionIdx], locked: !actions[actionIdx].locked };
            node.actions = actions;
            updated[nodeIdx] = node;
            return updated;
        });
    }, []);

    const handleReset = useCallback(() => {
        setTree(DEFAULT_TREE);
        eventBus.emit(EventType.SESSION_END, { source: 'FrequencyLocking', action: 'reset' }, 'FrequencyLocking');
        eventBus.emit('training:session-complete', { game_id: 'frequency-locking', accuracy: 100, correct_answers: 1, total_questions: 1, hands_played: 1 });
    }, []);

    const lockedCount = tree.reduce((s, n) => s + n.actions.filter(a => a.locked).length, 0);

    return (
        <>
            <Head>
                <title>Frequency Locking 2.0 | Smarter.Poker</title>
                <meta name="description" content="Lock action frequencies at decision nodes and see how the game tree adjusts" />
            </Head>

            <div style={{ minHeight: '100vh', background: '#18191a', color: '#e4e6eb', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
                    <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>Back to Training</button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>Frequency Locking 2.0</h1>
                            <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>Lock frequencies at nodes — see how the tree adjusts</p>
                        </div>
                        <button onClick={handleReset} style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#b0b3b8',
                        }}>
                            Reset All
                        </button>
                    </div>
                </div>

                <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
                    {/* Locked Count */}
                    <div style={{
                        padding: '8px 14px', borderRadius: 8, marginBottom: 16,
                        background: lockedCount > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${lockedCount > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: lockedCount > 0 ? '#f59e0b' : '#b0b3b8' }}>
                            {lockedCount} node{lockedCount !== 1 ? 's' : ''} locked
                        </span>
                        <span style={{ fontSize: 11, color: '#b0b3b8' }}>
                            Unlocked nodes auto-rebalance to 100%
                        </span>
                    </div>

                    {/* Decision Tree Visual */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
                        {tree.map((node, i) => (
                            <button key={node.id} onClick={() => setActiveNode(i)} style={{
                                minWidth: 90, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                                background: activeNode === i ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                                border: `2px solid ${activeNode === i ? '#818cf8' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: activeNode === i ? '#818cf8' : '#6b7280', letterSpacing: '0.1em', marginBottom: 4 }}>
                                    {node.street.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: activeNode === i ? '#e4e6eb' : '#b0b3b8' }}>
                                    {node.label}
                                </div>
                                {node.actions.some(a => a.locked) && (
                                    <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 4 }}>LOCKED</div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Active Node Editor */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: 12, padding: 20, marginBottom: 16,
                    }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e6eb', margin: '0 0 16px', fontFamily: "'Rajdhani', sans-serif" }}>
                            {tree[activeNode].label}
                        </h3>

                        {tree[activeNode].actions.map((action, i) => (
                            <FreqSlider
                                key={`${activeNode}-${i}`}
                                action={action}
                                onChange={(val) => handleFreqChange(activeNode, i, val)}
                                onToggleLock={() => handleToggleLock(activeNode, i)}
                            />
                        ))}

                        {/* Frequency Bar Visualization */}
                        <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
                            {tree[activeNode].actions.map((a, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ width: `${a.freq}%` }}
                                    transition={{ duration: 0.3 }}
                                    style={{ background: a.color, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {a.freq > 10 && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#000' }}>{a.freq}%</span>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Impact Analysis Toggle */}
                    <button onClick={() => setShowImpact(!showImpact)} style={{
                        width: '100%', padding: '14px', borderRadius: 10, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06))',
                        border: '1px solid rgba(99,102,241,0.2)', fontSize: 14, fontWeight: 700,
                        color: '#a5b4fc', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.08em',
                    }}>
                        {showImpact ? 'HIDE' : 'SHOW'} TREE IMPACT ANALYSIS
                    </button>

                    <AnimatePresence>
                        {showImpact && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden' }}>
                                <div style={{ marginTop: 12, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: 16 }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#818cf8', margin: '0 0 12px', letterSpacing: '0.08em' }}>
                                        FREQUENCY LOCK IMPACT ACROSS STREETS
                                    </h4>
                                    {tree.map((node, i) => {
                                        const hasLocked = node.actions.some(a => a.locked);
                                        const deviation = node.actions.reduce((sum, a) => {
                                            const gto = DEFAULT_TREE[i].actions.find(d => d.name === a.name);
                                            return sum + Math.abs(a.freq - (gto?.freq || 0));
                                        }, 0);
                                        return (
                                            <div key={node.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                                                background: hasLocked ? 'rgba(245,158,11,0.06)' : 'rgba(0,0,0,0.15)',
                                                borderLeft: `3px solid ${hasLocked ? '#f59e0b' : '#3a3b3c'}`,
                                            }}>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e6eb' }}>{node.label}</span>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: deviation > 20 ? '#f87171' : deviation > 5 ? '#f59e0b' : '#4ade80' }}>
                                                        {deviation > 0 ? `${deviation.toFixed(0)}% deviation` : 'Balanced'}
                                                    </span>
                                                    {hasLocked && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', padding: '1px 6px', background: 'rgba(245,158,11,0.15)', borderRadius: 3 }}>LOCKED</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
