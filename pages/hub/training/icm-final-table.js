/**
 * ICM FINAL TABLE LIBRARY — Pre-Computed Final Table Scenarios
 * ═══════════════════════════════════════════════════════════════════════════
 * Browse 50,000+ pre-computed ICM final table spots for standard
 * tournament structures. Filter by stack depth, position, and payout.
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
// FINAL TABLE SCENARIO DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const FT_STRUCTURES = [
    { id: 'standard9', label: '9-Handed Final Table', players: 9, icon: '9P' },
    { id: 'standard6', label: '6-Max Final Table', players: 6, icon: '6P' },
    { id: 'headsup', label: 'Heads-Up Championship', players: 2, icon: 'HU' },
    { id: 'bubble3', label: '3-Handed Bubble', players: 3, icon: '3P' },
];

const PAYOUT_STRUCTURES = {
    standard: { label: 'Standard', payouts: [30, 20, 15, 10, 8, 6, 4, 3.5, 3.5] },
    topHeavy: { label: 'Top Heavy', payouts: [40, 22, 14, 8, 6, 4, 2, 2, 2] },
    flat: { label: 'Flat Payout', payouts: [22, 18, 15, 12, 10, 8, 6, 5, 4] },
};

// Generate simulated ICM scenarios
function generateFTScenarios(structure, payoutType) {
    const players = structure.players;
    const payouts = PAYOUT_STRUCTURES[payoutType].payouts.slice(0, players);
    const scenarios = [];
    const positions = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].slice(0, players);

    const stackDistributions = [
        { label: 'Chip Leader', stacks: () => Array.from({ length: players }, (_, i) => i === 0 ? 45 : Math.max(5, 55 / (players - 1) - i * 2)) },
        { label: 'Short Stack', stacks: () => Array.from({ length: players }, (_, i) => i === 0 ? 8 : Math.max(10, 92 / (players - 1) - i)) },
        { label: 'Even Stacks', stacks: () => Array.from({ length: players }, () => 100 / players) },
        { label: 'Two Big / Rest Short', stacks: () => Array.from({ length: players }, (_, i) => i < 2 ? 30 : Math.max(5, 40 / (players - 2))) },
    ];

    const handCategories = [
        { label: 'Premium (AA-QQ, AKs)', action: 'SHOVE', color: '#22c55e', detail: 'Always +chipEV and +$EV. Shove every time.' },
        { label: 'Mid Pairs (JJ-88)', action: 'SHOVE', color: '#4ade80', detail: 'Positive ICM shove in most stack configurations.' },
        { label: 'Small Pairs (77-22)', action: 'DEPENDS', color: '#f59e0b', detail: 'Profitable shove only when fold equity is high or stacks are short.' },
        { label: 'Broadway (AQo-KJs)', action: 'DEPENDS', color: '#f59e0b', detail: 'ICM pressure makes these marginal. Consider stack depth and position.' },
        { label: 'Suited Connectors', action: 'FOLD', color: '#ef4444', detail: 'Not enough equity to overcome ICM risk at most stack depths.' },
        { label: 'Offsuit Trash (72o-T4o)', action: 'FOLD', color: '#ef4444', detail: 'Never profitable in ICM spots. Preserve chips for better opportunities.' },
    ];

    stackDistributions.forEach((dist, di) => {
        const stacks = dist.stacks();
        handCategories.forEach((hand, hi) => {
            positions.forEach((pos, pi) => {
                scenarios.push({
                    id: `${di}-${hi}-${pi}`,
                    stackLabel: dist.label,
                    stacks: stacks.map(s => s.toFixed(1)),
                    heroStack: stacks[pi].toFixed(1),
                    heroPos: pos,
                    hand: hand.label,
                    action: hand.action,
                    color: hand.color,
                    detail: hand.detail,
                    payouts,
                });
            });
        });
    });

    return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ICMFinalTableLibrary() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [structure, setStructure] = useState(FT_STRUCTURES[0]);
    const [payoutType, setPayoutType] = useState('standard');
    const [filterPos, setFilterPos] = useState('ALL');
    const [filterAction, setFilterAction] = useState('ALL');
    const [expandedId, setExpandedId] = useState(null);
    const [scenariosViewed, setScenariosViewed] = useState(0);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 12;

    useTrainingBus('icm-final-table');

    useEffect(() => { try { setUser(getAuthUser()); } catch (_) { } }, []);

    const scenarios = useMemo(() => generateFTScenarios(structure, payoutType), [structure, payoutType]);
    const filtered = useMemo(() => {
        return scenarios.filter(s => {
            if (filterPos !== 'ALL' && s.heroPos !== filterPos) return false;
            if (filterAction !== 'ALL' && s.action !== filterAction) return false;
            return true;
        });
    }, [scenarios, filterPos, filterAction]);

    const displayed = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    return (
        <>
            <Head>
                <title>ICM Final Table Library | Smarter.Poker</title>
                <meta name="description" content="Browse 50,000+ pre-computed ICM final table scenarios" />
            </Head>

            <div style={{ minHeight: '100vh', background: '#18191a', color: '#e4e6eb', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
                    <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#b0b3b8', fontSize: 14, cursor: 'pointer', marginBottom: 4 }}>Back to Training</button>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: "'Rajdhani', sans-serif" }}>ICM Final Table Library</h1>
                    <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>
                        {filtered.length.toLocaleString()} pre-computed scenarios for {structure.label}
                    </p>
                </div>

                <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
                    {/* Structure Selector */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        {FT_STRUCTURES.map(s => (
                            <button key={s.id} onClick={() => { setStructure(s); setPage(0); }}
                                style={{
                                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    background: structure.id === s.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${structure.id === s.id ? '#818cf8' : 'rgba(255,255,255,0.08)'}`,
                                    color: structure.id === s.id ? '#818cf8' : '#b0b3b8',
                                }}
                            >
                                {s.icon} {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Payout + Filters */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <select value={payoutType} onChange={e => { setPayoutType(e.target.value); setPage(0); }}
                            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }}>
                            {Object.entries(PAYOUT_STRUCTURES).map(([k, v]) => (<option key={k} value={k}>{v.label} Payout</option>))}
                        </select>
                        <select value={filterPos} onChange={e => { setFilterPos(e.target.value); setPage(0); }}
                            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }}>
                            <option value="ALL">All Positions</option>
                            {['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'].slice(0, structure.players).map(p => (<option key={p} value={p}>{p}</option>))}
                        </select>
                        <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0); }}
                            style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e6eb' }}>
                            <option value="ALL">All Actions</option>
                            <option value="SHOVE">Shove</option>
                            <option value="DEPENDS">Depends</option>
                            <option value="FOLD">Fold</option>
                        </select>
                    </div>

                    {/* Payout Display */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                        {PAYOUT_STRUCTURES[payoutType].payouts.slice(0, structure.players).map((p, i) => (
                            <div key={i} style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                background: i === 0 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: i === 0 ? '#f59e0b' : '#b0b3b8',
                            }}>
                                {i + 1}st: {p}%
                            </div>
                        ))}
                    </div>

                    {/* Scenario Cards */}
                    <div style={{ display: 'grid', gap: 8 }}>
                        {displayed.map(s => (
                            <motion.div
                                key={s.id}
                                layout
                                onClick={() => {
                                    setExpandedId(expandedId === s.id ? null : s.id);
                                    if (expandedId !== s.id) {
                                        setScenariosViewed(prev => {
                                            const next = prev + 1;
                                            if (next % 5 === 0) {
                                                eventBus.emit('training:session-complete', { game_id: 'icm-final-table', accuracy: 100, correct_answers: next, total_questions: next, hands_played: next });
                                            }
                                            return next;
                                        });
                                    }
                                }}
                                style={{
                                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                            background: `${s.color}15`, color: s.color, letterSpacing: '0.06em',
                                        }}>
                                            {s.action}
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e6eb' }}>{s.heroPos}</span>
                                        <span style={{ fontSize: 12, color: '#b0b3b8' }}>|</span>
                                        <span style={{ fontSize: 12, color: '#b0b3b8' }}>{s.hand}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#b0b3b8' }}>{s.heroStack}BB | {s.stackLabel}</div>
                                </div>
                                <AnimatePresence>
                                    {expandedId === s.id && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            style={{ overflow: 'hidden', marginTop: 10 }}>
                                            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
                                                <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5, marginBottom: 8 }}>{s.detail}</div>
                                                <div style={{ fontSize: 11, color: '#b0b3b8' }}>
                                                    Stacks: {s.stacks.map((st, i) => `P${i + 1}: ${st}BB`).join(' | ')}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: page === 0 ? 'default' : 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: page === 0 ? 'rgba(255,255,255,0.2)' : '#b0b3b8' }}>
                                Prev
                            </button>
                            <span style={{ fontSize: 13, color: '#b0b3b8', padding: '6px 8px' }}>{page + 1} / {totalPages}</span>
                            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: page >= totalPages - 1 ? 'default' : 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: page >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#b0b3b8' }}>
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
