/**
 * MENTAL GAME JOURNAL — Tilt & Trigger Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 * Tracks sleep quality, caffeine, states, and tilt triggers. Shows correlation to Win Rate.
 *
 * Route: /hub/training/mental-journal
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const STATES = [
    { id: 'zone', label: 'In The Zone', color: '#4ade80', icon: '⚡' },
    { id: 'bored', label: 'Bored / Autopilot', color: '#94a3b8', icon: '😴' },
    { id: 'frust', label: 'Frustrated', color: '#fbbf24', icon: '😤' },
    { id: 'tilt', label: 'Monkey Tilt', color: '#ef4444', icon: '🦍' },
];

const TRIGGERS = ['Bad Beat', 'Card Dead', 'Cooler', 'Missed Value', 'Lost Big Pot', 'Tired', 'Distracted'];

export default function MentalJournalPage() {
    const router = useRouter();
    useTrainingBus('mental-journal');

    const [entries, setEntries] = useState([]);
    const [view, setView] = useState('add'); // 'add' or 'history'

    // Form State
    const [sleep, setSleep] = useState(7);
    const [caffeine, setCaffeine] = useState(2);
    const [mindState, setMindState] = useState('zone');
    const [selectedTriggers, setSelectedTriggers] = useState([]);
    const [notes, setNotes] = useState('');
    const [savedToast, setSavedToast] = useState(false);

    useEffect(() => {
        try { const stored = localStorage.getItem('mental-journal-entries'); if (stored) setEntries(JSON.parse(stored)); } catch { }
    }, []);

    useEffect(() => {
        const h = () => { };
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, []);

    const toggleTrigger = (t) => {
        setSelectedTriggers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    };

    const saveEntry = () => {
        const entry = {
            id: Date.now(),
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
            sleep, caffeine, mindState, triggers: selectedTriggers, notes
        };
        const next = [entry, ...entries].slice(0, 50);
        setEntries(next);
        try { localStorage.setItem('mental-journal-entries', JSON.stringify(next)); } catch { }

        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 2000);

        // Reset form
        setSelectedTriggers([]); setNotes('');
    };

    return (
        <>
            <Head><title>Mental Journal | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                        <div><div style={{ fontSize: 16, fontWeight: 700 }}>Mental Journal</div><div style={{ fontSize: 11, color: '#64748b' }}>Tilt & Trigger Tracking</div></div>
                    </div>
                </div>

                <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
                    {/* View Toggle */}
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10, marginBottom: 24 }}>
                        <button onClick={() => setView('add')} style={{ flex: 1, padding: '10px', borderRadius: 6, border: 'none', background: view === 'add' ? '#3b82f6' : 'transparent', color: view === 'add' ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>New Entry</button>
                        <button onClick={() => setView('history')} style={{ flex: 1, padding: '10px', borderRadius: 6, border: 'none', background: view === 'history' ? '#3b82f6' : 'transparent', color: view === 'history' ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>History ({entries.length})</button>
                    </div>

                    {view === 'add' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                            {/* Sliders */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Sleep Quality</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#00d4ff' }}>{sleep} hrs</span>
                                </div>
                                <input type="range" min="3" max="10" step="0.5" value={sleep} onChange={e => setSleep(e.target.value)} style={{ width: '100%', marginBottom: 24, accentColor: '#00d4ff' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Caffeine Level</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>{caffeine} cups</span>
                                </div>
                                <input type="range" min="0" max="6" step="1" value={caffeine} onChange={e => setCaffeine(e.target.value)} style={{ width: '100%', accentColor: '#fbbf24' }} />
                            </div>

                            {/* Mental State */}
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Primary State</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                                {STATES.map(s => (
                                    <motion.button key={s.id} whileTap={{ scale: 0.95 }} onClick={() => setMindState(s.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px', borderRadius: 12, border: `1px solid ${mindState === s.id ? `${s.color}66` : 'rgba(255,255,255,0.05)'}`, background: mindState === s.id ? `${s.color}15` : 'rgba(0,0,0,0.2)', color: mindState === s.id ? s.color : '#94a3b8', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                                        <span style={{ fontSize: 20 }}>{s.icon}</span> {s.label}
                                    </motion.button>
                                ))}
                            </div>

                            {/* Triggers */}
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Tilt Triggers (Select all that apply)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                                {TRIGGERS.map(t => {
                                    const active = selectedTriggers.includes(t);
                                    return (
                                        <button key={t} onClick={() => toggleTrigger(t)} style={{ padding: '8px 14px', borderRadius: 20, border: `1px solid ${active ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(239,68,68,0.1)' : 'transparent', color: active ? '#fca5a5' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                            {t}
                                        </button>
                                    )
                                })}
                            </div>

                            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional session notes..." style={{ width: '100%', padding: 16, borderRadius: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, minHeight: 100, marginBottom: 24, resize: 'none', outline: 'none' }} />

                            <motion.button whileTap={{ scale: 0.97 }} onClick={saveEntry} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,0.3)', position: 'relative' }}>
                                Log Mental State
                                {savedToast && <span style={{ position: 'absolute', right: 20, color: '#4ade80' }}>✓ Saved</span>}
                            </motion.button>
                        </motion.div>
                    )}

                    {view === 'history' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {entries.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No entries yet.</div> : null}
                            {entries.map(e => {
                                const st = STATES.find(s => s.id === e.mindState) || STATES[0];
                                return (
                                    <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '16px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{e.date}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: st.color, fontSize: 12, fontWeight: 700, padding: '2px 8px', background: `${st.color}15`, borderRadius: 12 }}>
                                                {st.icon} {st.label}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: '#cbd5e1' }}>
                                            <div><span style={{ color: '#00d4ff' }}>☁️ Sleep:</span> {e.sleep}h</div>
                                            <div><span style={{ color: '#fbbf24' }}>☕ Caf:</span> {e.caffeine} cups</div>
                                        </div>
                                        {e.triggers.length > 0 && (
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                                {e.triggers.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', borderRadius: 4 }}>{t}</span>)}
                                            </div>
                                        )}
                                        {e.notes && <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>"{e.notes}"</div>}
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
