/**
 * SKILL TREE — Visual Progression Map
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive node graph showing skill branches from Preflop → Postflop →
 * Advanced → Mastery. Nodes unlock based on accuracy thresholds.
 *
 * Route: /hub/training/skill-tree
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// SKILL TREE DATA
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_BRANCHES = [
    {
        id: 'preflop', name: 'Preflop Foundations', color: '#3b82f6', icon: '🃏',
        nodes: [
            { id: 'open-raise', name: 'Open Raise', threshold: 60, xp: 100, gameId: 'cash-preflop' },
            { id: 'bb-defense', name: 'BB Defense', threshold: 65, xp: 150, gameId: 'cash-bb-defense', requires: 'open-raise' },
            { id: '3bet-ranges', name: '3-Bet Ranges', threshold: 70, xp: 200, gameId: 'cash-threeBet-spots', requires: 'bb-defense' },
            { id: 'squeeze-play', name: 'Squeeze Play', threshold: 75, xp: 250, gameId: 'cash-squeeze', requires: '3bet-ranges' },
        ],
    },
    {
        id: 'postflop', name: 'Postflop Mastery', color: '#22c55e', icon: '🎯',
        nodes: [
            { id: 'cbet-basics', name: 'C-Bet Basics', threshold: 60, xp: 100, gameId: 'cash-cbet' },
            { id: 'turn-barrels', name: 'Turn Barrels', threshold: 65, xp: 150, gameId: 'cash-turn-play', requires: 'cbet-basics' },
            { id: 'river-decisions', name: 'River Decisions', threshold: 70, xp: 200, gameId: 'cash-river-bluffs', requires: 'turn-barrels' },
            { id: 'multistreet', name: 'Multi-Street Plans', threshold: 75, xp: 250, gameId: 'cash-multistreet', requires: 'river-decisions' },
        ],
    },
    {
        id: 'advanced', name: 'Advanced Theory', color: '#a855f7', icon: '⚡',
        nodes: [
            { id: 'pot-geometry', name: 'Pot Geometry', threshold: 65, xp: 200, gameId: 'adv-pot-geometry' },
            { id: 'range-advantage', name: 'Range Advantage', threshold: 70, xp: 250, gameId: 'adv-range-advantage', requires: 'pot-geometry' },
            { id: 'nodelock', name: 'Nodelocking', threshold: 75, xp: 300, gameId: 'adv-nodelock', requires: 'range-advantage' },
            { id: 'mixed-strategies', name: 'Mixed Strategies', threshold: 80, xp: 400, gameId: 'adv-mixed', requires: 'nodelock' },
        ],
    },
    {
        id: 'mastery', name: 'GTO Mastery', color: '#fbbf24', icon: '👑',
        nodes: [
            { id: 'icm-mastery', name: 'ICM Mastery', threshold: 70, xp: 300, gameId: 'mtt-icm' },
            { id: 'multiway-pots', name: 'Multiway Pots', threshold: 75, xp: 350, gameId: 'cash-multiway', requires: 'icm-mastery' },
            { id: 'exploitative', name: 'Exploitative Play', threshold: 80, xp: 400, gameId: 'adv-exploitative', requires: 'multiway-pots' },
            { id: 'gto-master', name: 'GTO Master', threshold: 85, xp: 500, gameId: 'adv-gto-master', requires: 'exploitative' },
        ],
    },
];

function computeSkillData(sessions) {
    const stats = {};
    if (!sessions) return stats;
    sessions.forEach(s => {
        const gid = (s.game_id || '').toLowerCase();
        const hands = s.hands_played || s.total_questions || 0;
        const correct = s.correct_count || s.correct_answers || 0;
        if (!stats[gid]) stats[gid] = { hands: 0, correct: 0 };
        stats[gid].hands += hands;
        stats[gid].correct += correct;
    });
    return stats;
}

function getNodeStatus(node, stats, unlockedNodes) {
    // Check prerequisite
    if (node.requires && !unlockedNodes.has(node.requires)) {
        return { status: 'locked', accuracy: null, progress: 0 };
    }
    // Find matching stats
    let totalHands = 0, totalCorrect = 0;
    Object.entries(stats).forEach(([gid, data]) => {
        if (gid.includes(node.gameId?.split('-').pop() || '') || node.gameId?.includes(gid.split('-')[1] || '')) {
            totalHands += data.hands;
            totalCorrect += data.correct;
        }
    });
    const accuracy = totalHands > 0 ? Math.round((totalCorrect / totalHands) * 100) : 0;
    const progress = totalHands > 0 ? Math.min(100, Math.round((accuracy / node.threshold) * 100)) : 0;
    const mastered = accuracy >= node.threshold && totalHands >= 10;
    return { status: mastered ? 'mastered' : totalHands > 0 ? 'in-progress' : 'available', accuracy, progress, hands: totalHands };
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL NODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SkillNode({ node, nodeStatus, branchColor, onTap }) {
    const { status, accuracy, progress } = nodeStatus;
    const isLocked = status === 'locked';
    const isMastered = status === 'mastered';

    return (
        <motion.button
            whileTap={!isLocked ? { scale: 0.95 } : {}}
            onClick={() => !isLocked && onTap(node)}
            style={{
                padding: '12px 14px', borderRadius: 12, width: '100%',
                background: isMastered
                    ? `linear-gradient(135deg, ${branchColor}15, ${branchColor}08)`
                    : isLocked ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.2)',
                border: `1px solid ${isMastered ? `${branchColor}30` : isLocked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'}`,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                textAlign: 'left',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isMastered ? `${branchColor}20` : isLocked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                }}>
                    {isLocked ? '🔒' : isMastered ? '✅' : '🎯'}
                </div>
                <div>
                    <div style={{
                        fontSize: 13, fontWeight: 700,
                        color: isMastered ? branchColor : isLocked ? '#334155' : '#e2e8f0',
                    }}>
                        {node.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                        {isLocked ? 'Locked — complete prerequisite'
                            : isMastered ? `Mastered at ${accuracy}%`
                                : accuracy ? `${accuracy}% — need ${node.threshold}%`
                                    : `Goal: ${node.threshold}% accuracy`}
                    </div>
                </div>
            </div>
            <div style={{ textAlign: 'right' }}>
                {!isLocked && (
                    <>
                        <div style={{
                            fontSize: 14, fontWeight: 800,
                            color: isMastered ? '#4ade80' : accuracy >= node.threshold * 0.8 ? '#fbbf24' : '#64748b',
                        }}>
                            {accuracy !== null ? `${accuracy}%` : '—'}
                        </div>
                        <div style={{ fontSize: 9, color: '#475569' }}>{node.xp} XP</div>
                    </>
                )}
            </div>
        </motion.button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function SkillTreePage() {
    const router = useRouter();
    useTrainingBus('skill-tree');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({});
    const [totalXP, setTotalXP] = useState(0);

    const fetchData = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) { setLoading(false); return; }
        try {
            const token = getAccessToken();
            const res = await fetch(`/api/training/get-sessions?limit=500`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions) {
                setStats(computeSkillData(data.sessions));
            }
        } catch (e) {
            console.error('[SkillTree] Fetch error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Bus listener
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => fetchData());
        return unsub;
    }, [fetchData]);

    // Compute unlocked nodes and total XP
    const unlockedNodes = new Set();
    let xp = 0;
    SKILL_BRANCHES.forEach(branch => {
        branch.nodes.forEach(node => {
            const ns = getNodeStatus(node, stats, unlockedNodes);
            if (ns.status === 'mastered') {
                unlockedNodes.add(node.id);
                xp += node.xp;
            }
        });
    });

    const totalNodes = SKILL_BRANCHES.reduce((s, b) => s + b.nodes.length, 0);
    const masteredCount = unlockedNodes.size;

    const handleNodeTap = (node) => {
        router.push(`/hub/training/arena/spot-trainer?gameId=${node.gameId || 'cash-preflop'}`);
    };

    return (
        <>
            <Head>
                <title>Skill Tree | Smarter.Poker GTO Training</title>
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: 'none',
                            color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                            width: 36, height: 36, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        ←
                    </button>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Skill Tree</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Master your GTO progression</div>
                    </div>
                    <div style={{
                        padding: '6px 12px', borderRadius: 8,
                        background: 'rgba(251,191,36,0.08)',
                        border: '1px solid rgba(251,191,36,0.2)',
                    }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>{xp}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>XP</span>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

                    {/* Progress Overview */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            padding: '16px', borderRadius: 14, marginBottom: 20,
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(139,92,246,0.04) 100%)',
                            border: '1px solid rgba(0,212,255,0.12)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                                NODES MASTERED
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#00d4ff' }}>
                                {masteredCount}/{totalNodes}
                            </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(masteredCount / totalNodes) * 100}%` }}
                                transition={{ duration: 0.8 }}
                                style={{
                                    height: '100%', borderRadius: 3,
                                    background: 'linear-gradient(90deg, #00d4ff, #a855f7)',
                                }}
                            />
                        </div>
                    </motion.div>

                    {/* Loading */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    width: 32, height: 32, margin: '0 auto 12px',
                                    border: '2px solid rgba(255,255,255,0.05)',
                                    borderTopColor: '#a855f7', borderRadius: '50%',
                                }}
                            />
                            Loading skill tree...
                        </div>
                    )}

                    {/* Skill Branches */}
                    {!loading && SKILL_BRANCHES.map((branch, bIdx) => (
                        <motion.div
                            key={branch.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: bIdx * 0.1 }}
                            style={{ marginBottom: 20 }}
                        >
                            {/* Branch Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                                padding: '0 4px',
                            }}>
                                <span style={{ fontSize: 16 }}>{branch.icon}</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: branch.color }}>
                                    {branch.name}
                                </div>
                                <div style={{
                                    marginLeft: 'auto', fontSize: 10, color: '#475569',
                                }}>
                                    {branch.nodes.filter(n => getNodeStatus(n, stats, unlockedNodes).status === 'mastered').length}/{branch.nodes.length}
                                </div>
                            </div>

                            {/* Nodes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {branch.nodes.map((node, nIdx) => {
                                    const nodeStatus = getNodeStatus(node, stats, unlockedNodes);
                                    return (
                                        <div key={node.id} style={{ position: 'relative' }}>
                                            {/* Connector line */}
                                            {nIdx > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: -6, left: 26,
                                                    width: 2, height: 6,
                                                    background: nodeStatus.status === 'locked' ? 'rgba(255,255,255,0.03)' : `${branch.color}30`,
                                                }} />
                                            )}
                                            <SkillNode
                                                node={node}
                                                nodeStatus={nodeStatus}
                                                branchColor={branch.color}
                                                onTap={handleNodeTap}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </>
    );
}
