/**
 * SESSION NOTES — Training Journal
 * ═══════════════════════════════════════════════════════════════════════════
 * Post-session journal: what went well, what to improve, emotional state.
 * Auto-linked to session stats. Persistence via localStorage.
 *
 * Route: /hub/training/session-notes
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';


const MOOD_OPTIONS = [
    { id: 'focused', emoji: '🎯', label: 'Focused' },
    { id: 'confident', emoji: '💪', label: 'Confident' },
    { id: 'neutral', emoji: '😐', label: 'Neutral' },
    { id: 'frustrated', emoji: '😤', label: 'Frustrated' },
    { id: 'tilted', emoji: '🔥', label: 'Tilted' },
];

function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const parseMarkdown = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
        let htmlLine = line
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;font-size:10px;">$1</code>');
        if (htmlLine.startsWith('- ')) {
            return <li key={i} dangerouslySetInnerHTML={{ __html: htmlLine.substring(2) }} style={{ marginLeft: 16 }} />;
        }
        return <div key={i} dangerouslySetInnerHTML={{ __html: htmlLine }} style={{ minHeight: '1em' }} />;
    });
};

const SUGGESTED_TAGS = ['Preflop', 'Postflop', 'Bluffing', 'Hero Call', 'Value', 'Tilt', 'BB Defend', '3-Bet Pot'];

export default function SessionNotesPage() {
    const router = useRouter();
    useTrainingBus('session-notes');
    const [notes, setNotes] = useState([]);
    const [tab, setTab] = useState('write');
    const [wentWell, setWentWell] = useState('');
    const [toImprove, setToImprove] = useState('');
    const [mood, setMood] = useState('neutral');
    const [freeText, setFreeText] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [recentAccuracy, setRecentAccuracy] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem('session-notes');
            if (saved) setNotes(JSON.parse(saved));
        } catch { }
    }, []);

    const fetchRecentSession = useCallback(async () => {
        const user = getAuthUser();
        if (!user?.id) return;
        try {
            const token = getAccessToken();
            const res = await fetch('/api/training/get-sessions?limit=1', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.sessions?.[0]) {
                const s = data.sessions[0];
                const h = s.hands_played || s.total_questions || 0;
                const c = s.correct_count || s.correct_answers || 0;
                setRecentAccuracy(h > 0 ? Math.round((c / h) * 100) : null);
            }
        } catch (e) { console.error('[SessionNotes]', e); }
    }, []);

    useEffect(() => { fetchRecentSession(); }, [fetchRecentSession]);
    useEffect(() => {
        const h = () => fetchRecentSession();
        eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
        return () => eventBus.off(EventType?.SESSION_END || 'training:session-complete', h);
    }, [fetchRecentSession]);

    const saveNote = () => {
        if (!wentWell.trim() && !toImprove.trim() && !freeText.trim()) return;
        const note = {
            id: `note-${Date.now()}`,
            wentWell, toImprove, mood, freeText,
            tags: selectedTags,
            pinned: false,
            accuracy: recentAccuracy,
            createdAt: Date.now(),
        };
        const updated = [note, ...notes];
        setNotes(updated);
        try { localStorage.setItem('session-notes', JSON.stringify(updated)); } catch { }
        setWentWell(''); setToImprove(''); setFreeText(''); setMood('neutral'); setSelectedTags([]);
        setTab('browse');
    };

    const togglePin = (id) => {
        const updated = notes.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n);
        setNotes(updated);
        try { localStorage.setItem('session-notes', JSON.stringify(updated)); } catch { }
    };

    const deleteNote = (id) => {
        const updated = notes.filter(n => n.id !== id);
        setNotes(updated);
        try { localStorage.setItem('session-notes', JSON.stringify(updated)); } catch { }
    };

    const filtered = notes.filter(n => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        const matchesTag = n.tags?.some(t => t.toLowerCase().includes(s));
        return matchesTag || (n.wentWell || '').toLowerCase().includes(s) || (n.toImprove || '').toLowerCase().includes(s) || (n.freeText || '').toLowerCase().includes(s);
    }).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
    });

    const moodObj = (id) => MOOD_OPTIONS.find(m => m.id === id) || MOOD_OPTIONS[2];

    return (
        <>
            <Head><title>Session Notes | Smarter.Poker GTO Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Session Notes</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Your training journal</div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.15)' }}>
                    {[{ id: 'write', label: '✏️ Write' }, { id: 'browse', label: `📖 Browse (${notes.length})` }].map(t => (
                        <motion.button key={t.id} whileTap={{ scale: 0.97 }} onClick={() => setTab(t.id)}
                            style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${tab === t.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: tab === t.id ? 'rgba(0,212,255,0.06)' : 'transparent', color: tab === t.id ? '#00d4ff' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            {t.label}
                        </motion.button>
                    ))}
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {tab === 'write' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                            {/* Recent accuracy tag */}
                            {recentAccuracy !== null && (
                                <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 16, background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', fontSize: 11, color: '#94a3b8' }}>
                                    Last session accuracy: <span style={{ fontWeight: 800, color: recentAccuracy >= 75 ? '#4ade80' : '#fbbf24' }}>{recentAccuracy}%</span>
                                </div>
                            )}

                            {/* Mood */}
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>HOW DO YOU FEEL?</div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                                {MOOD_OPTIONS.map(m => (
                                    <motion.button key={m.id} whileTap={{ scale: 0.9 }} onClick={() => setMood(m.id)}
                                        style={{ flex: 1, padding: '10px 4px', borderRadius: 8, border: `1px solid ${mood === m.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: mood === m.id ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.15)', cursor: 'pointer', textAlign: 'center' }}>
                                        <div style={{ fontSize: 18 }}>{m.emoji}</div>
                                        <div style={{ fontSize: 8, color: mood === m.id ? '#00d4ff' : '#475569', fontWeight: 600, marginTop: 2 }}>{m.label}</div>
                                    </motion.button>
                                ))}
                            </div>

                            {/* Went well */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>WHAT WENT WELL</div>
                                <textarea value={wentWell} onChange={e => setWentWell(e.target.value)} placeholder="Good reads, correct folds, improved spots..." rows={2}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)', color: '#e2e8f0', fontSize: 12, resize: 'vertical', fontFamily: 'Inter, sans-serif' }} />
                            </div>

                            {/* To improve */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>WHAT TO IMPROVE</div>
                                <textarea value={toImprove} onChange={e => setToImprove(e.target.value)} placeholder="Missed spots, tilt triggers, leaks found..." rows={2}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', color: '#e2e8f0', fontSize: 12, resize: 'vertical', fontFamily: 'Inter, sans-serif' }} />
                            </div>

                            {/* Free notes */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>FREE NOTES (MARKDOWN SUPPORTED)</div>
                                <textarea value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="Formatting: **bold**, *italic*, `code`, - bullets..." rows={4}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 12, resize: 'vertical', fontFamily: 'Inter, sans-serif' }} />
                            </div>

                            {/* Tags */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>TAGS</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {SUGGESTED_TAGS.map(tag => {
                                        const isActive = selectedTags.includes(tag);
                                        return (
                                            <button key={tag} onClick={() => setSelectedTags(isActive ? selectedTags.filter(t => t !== tag) : [...selectedTags, tag])}
                                                style={{ padding: '4px 10px', borderRadius: 12, background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: isActive ? '#00d4ff' : '#94a3b8', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                                {tag}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <motion.button whileTap={{ scale: 0.97 }} onClick={saveNote}
                                style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #00d4ff, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,212,255,0.25)' }}>
                                Save Note
                            </motion.button>
                        </motion.div>
                    )}

                    {tab === 'browse' && (
                        <>
                            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search notes..."
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 12, marginBottom: 16, fontFamily: 'Inter, sans-serif' }} />
                            {filtered.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>No notes yet</div>
                                    <div style={{ fontSize: 11, marginTop: 4 }}>Switch to Write tab after your next session</div>
                                </div>
                            )}
                            <AnimatePresence>
                                {filtered.map(note => (
                                    <motion.div key={note.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 14 }}>{moodObj(note.mood).emoji}</span>
                                                <span style={{ fontSize: 10, color: '#64748b' }}>{formatDate(note.createdAt)}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {note.accuracy !== null && <span style={{ fontSize: 11, fontWeight: 700, color: note.accuracy >= 75 ? '#4ade80' : '#fbbf24' }}>{note.accuracy}%</span>}
                                                <button onClick={() => togglePin(note.id)} title="Pin Note" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, opacity: note.pinned ? 1 : 0.3 }}>📌</button>
                                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteNote(note.id)}
                                                    style={{ width: 20, height: 20, borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: 'none', color: '#f87171', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</motion.button>
                                            </div>
                                        </div>
                                        {note.tags && note.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                                {note.tags.map(t => <span key={t} style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 4, color: '#cbd5e1' }}>#{t}</span>)}
                                            </div>
                                        )}
                                        {note.wentWell && <div style={{ fontSize: 11, marginBottom: 4 }}><span style={{ color: '#4ade80', fontWeight: 700 }}>Good: </span><span style={{ color: '#94a3b8' }}>{note.wentWell}</span></div>}
                                        {note.toImprove && <div style={{ fontSize: 11, marginBottom: 4 }}><span style={{ color: '#f87171', fontWeight: 700 }}>Fix: </span><span style={{ color: '#94a3b8' }}>{note.toImprove}</span></div>}
                                        {note.freeText && <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 6, lineHeight: 1.5 }}>{parseMarkdown(note.freeText)}</div>}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
