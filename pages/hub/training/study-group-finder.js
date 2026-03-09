/**
 * STUDY GROUP FINDER
 * ═══════════════════════════════════════════════════════════════════════════
 * Mock matchmaking interface to find Discord/Hub study partners by stakes/timezone.
 *
 * Route: /hub/training/study-group-finder
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const MOCK_GROUPS = [
    { id: 1, name: '200NL Crushers', format: 'Cash', stakes: '200NL-500NL', tz: 'EST', members: 4, max: 6, tool: 'PioSolver' },
    { id: 2, name: 'MTT Final Tablists', format: 'Tournament', stakes: 'Mid/High', tz: 'CET', members: 8, max: 10, tool: 'ICMIZER' },
    { id: 3, name: 'Live 2/5 Grinders', format: 'Live Cash', stakes: '$2/$5+', tz: 'PST', members: 3, max: 5, tool: 'Smarter.Poker' },
    { id: 4, name: 'PLO Degens Anonymous', format: 'PLO', stakes: 'Micro', tz: 'GMT', members: 5, max: 8, tool: 'Vision' }
];

export default function StudyGroupFinderPage() {
    const router = useRouter();
    useTrainingBus('study-group-finder');

    const [filterFmt, setFilterFmt] = useState('All');
    const [applied, setApplied] = useState([]);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const applyGroup = (gId) => {
        if (applied.includes(gId)) return;
        setApplied([...applied, gId]);

        // Sim log
        fetch('/api/training/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: 'study-group', stats: { applied_id: gId } })
        }).catch(() => { });
    };

    const filtered = filterFmt === 'All' ? MOCK_GROUPS : MOCK_GROUPS.filter(g => g.format.includes(filterFmt));

    return (
        <>
            <Head><title>Study Group Finder | Smarter.Poker</title></Head>
            <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>Study Group Finder</div><div style={{ fontSize: 11, color: '#64748b' }}>Discord & Hub Matchmaking</div></div>
                    </div>
                    <button style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>+ Create Group</button>
                </div>

                <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                        {['All', 'Cash', 'Tournament', 'Live', 'PLO'].map(f => (
                            <button
                                key={f} onClick={() => setFilterFmt(f)}
                                style={{ padding: '8px 16px', borderRadius: 20, border: `1px solid ${filterFmt === f ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, background: filterFmt === f ? 'rgba(59,130,246,0.1)' : 'transparent', color: filterFmt === f ? '#60a5fa' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Group Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {filtered.map(g => {
                            const isApplied = applied.includes(g.id);
                            const isFull = g.members >= g.max;

                            return (
                                <motion.div key={g.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '24px', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>

                                    <div style={{ flex: 1, minWidth: 200 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{g.name}</div>
                                            <div style={{ fontSize: 10, fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', padding: '2px 8px', borderRadius: 12, textTransform: 'uppercase' }}>{g.format}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#94a3b8' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#cbd5e1' }}>Stakes:</span> {g.stakes}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#cbd5e1' }}>TZ:</span> {g.tz}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#cbd5e1' }}>Tool:</span> {g.tool}</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 18, fontWeight: 800, color: isFull ? '#ef4444' : '#4ade80' }}>{g.members}/{g.max}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Slots</div>
                                        </div>

                                        <button
                                            onClick={() => applyGroup(g.id)} disabled={isApplied || isFull}
                                            style={{ padding: '12px 24px', borderRadius: 8, background: isApplied ? 'transparent' : isFull ? 'rgba(255,255,255,0.05)' : '#3b82f6', border: isApplied ? '1px solid #4ade80' : 'none', color: isApplied ? '#4ade80' : isFull ? '#64748b' : '#fff', fontSize: 13, fontWeight: 700, cursor: isApplied || isFull ? 'not-allowed' : 'pointer', minWidth: 120, transition: '0.2s' }}
                                        >
                                            {isApplied ? 'Application Sent ✓' : isFull ? 'Group Full' : 'Apply to Join'}
                                        </button>
                                    </div>

                                </motion.div>
                            )
                        })}
                    </div>

                </div>
            </div>
        </>
    );
}
