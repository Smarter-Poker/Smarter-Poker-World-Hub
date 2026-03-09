/**
 * MY PLAYBOOK — Custom Strategy Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Create custom named strategies with hole combos, board textures, and notes.
 *
 * Route: /hub/training/my-playbook
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const TAG_COLORS = ['#ef4444', '#f97316', '#fbbf24', '#34d399', '#0ea5e9', '#8b5cf6'];

export default function MyPlaybookPage() {
    const router = useRouter();
    useTrainingBus('my-playbook');

    const [plays, setPlays] = useState([]);
    const [view, setView] = useState('list'); // list or form

    const [title, setTitle] = useState('');
    const [hands, setHands] = useState('');
    const [board, setBoard] = useState('');
    const [color, setColor] = useState(TAG_COLORS[0]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        try { const stored = localStorage.getItem('my-playbook'); if (stored) setPlays(JSON.parse(stored)); } catch { }
    }, []);

    useEffect(() => {
        const h = () => { };
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, []);

    const savePlay = () => {
        if (!title) return;
        const newPlay = { id: Date.now(), title, hands, board, color, notes };
        const next = [newPlay, ...plays];
        setPlays(next);
        try { localStorage.setItem('my-playbook', JSON.stringify(next)); } catch { }

        // Reset and back to list
        setTitle(''); setHands(''); setBoard(''); setNotes('');
        setView('list');
    };

    const deletePlay = (id) => {
        const next = plays.filter(p => p.id !== id);
        setPlays(next);
        try { localStorage.setItem('my-playbook', JSON.stringify(next)); } catch { }
    };

    return (
        <>
            <Head><title>My Playbook | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>My Playbook</div><div style={{ fontSize: 11, color: '#64748b' }}>Custom Strategy Repository</div></div>
                    </div>
                    {view === 'list' && (
                        <button onClick={() => setView('form')} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New Play</button>
                    )}
                </div>

                <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
                    {view === 'form' ? (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Play Name</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Exploiting OMC Opens" style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, fontSize: 15, outline: 'none' }} />
                            </div>

                            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Relevant Range</label>
                                    <input value={hands} onChange={e => setHands(e.target.value)} placeholder="e.g., 87s+, 55+" style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Board Texture</label>
                                    <input value={board} onChange={e => setBoard(e.target.value)} placeholder="e.g., A-high dry" style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                                </div>
                            </div>

                            <div style={{ marginBottom: 24 }}>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Tag Color</label>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {TAG_COLORS.map(c => (
                                        <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: `3px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.2s' }} />
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 24 }}>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Strategy Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the exploit and conditions..." style={{ width: '100%', padding: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', borderRadius: 8, minHeight: 120, fontSize: 14, resize: 'none', outline: 'none' }} />
                            </div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <button onClick={() => setView('list')} style={{ flex: 1, padding: 14, background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={savePlay} style={{ flex: 2, padding: 14, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save Playbook Entry</button>
                            </div>
                        </motion.div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {plays.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                                    <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>📖</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>Your Playbook is empty</div>
                                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>Create custom exploits and strategies to reference before live sessions.</div>
                                </div>
                            ) : null}

                            {plays.map((p, i) => (
                                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 20px', borderBottom: `2px solid ${p.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{p.title}</div>
                                        <button onClick={() => deletePlay(p.id)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer' }}>✕</button>
                                    </div>
                                    <div style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                            {p.hands && <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}><span style={{ color: '#94a3b8', marginRight: 6 }}>Range:</span>{p.hands}</div>}
                                            {p.board && <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}><span style={{ color: '#94a3b8', marginRight: 6 }}>Board:</span>{p.board}</div>}
                                        </div>
                                        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{p.notes}</div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
