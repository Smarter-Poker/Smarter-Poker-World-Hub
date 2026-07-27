/**
 * SESSION NOTES — Training Journal
 * ═══════════════════════════════════════════════════════════════════════════
 * Post-session journal: what went well, what to improve, emotional state.
 * Auto-linked to session stats. Persistence via localStorage.
 *
 * Route: /hub/training/session-notes
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-51 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-43 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-3a — adoption: shared empty-state primitive

const MOOD_OPTIONS = [
  { id: 'focused', emoji: '', label: 'Focused'},
  { id: 'confident', emoji: '', label: 'Confident'},
  { id: 'neutral', emoji: '', label: 'Neutral'},
  { id: 'frustrated', emoji: '', label: 'Frustrated'},
  { id: 'tilted', emoji: '▲', label: 'Tilted'},
];

function formatDate(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

const parseMarkdown = (text) => {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    let htmlLine = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(
        /`(.*?)`/g,
        '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:3px;font-size:10px;">$1</code>'
      );
    if (htmlLine.startsWith('- ')) {
      return (
        <li
          key={i}
          dangerouslySetInnerHTML={{ __html: htmlLine.substring(2) }}
          style={{ marginLeft: 16 }}
        />
      );
    }
    return (
      <div key={i} dangerouslySetInnerHTML={{ __html: htmlLine }} style={{ minHeight: '1em' }} />
    );
  });
};

const SUGGESTED_TAGS = [
  'Preflop',
  'Postflop',
  'Bluffing',
  'Hero Call',
  'Value',
  'Tilt',
  'BB Defend',
  '3-Bet Pot',
];

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
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('session-notes');
      if (saved) setNotes(JSON.parse(saved));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  const fetchRecentSession = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) return;
    setFetchError(null);
    try {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (!token) return;
      const res = await authedFetch('/api/training/get-sessions?limit=1', {
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions?.[0]) {
        const s = data.sessions[0];
        const h = s.hands_played || s.total_questions || 0;
        const c = s.correct_count || s.correct_answers || 0;
        setRecentAccuracy(h > 0 ? Math.round((c / h) * 100) : null);
      }
    } catch (e) {
      console.warn('[SessionNotes]', e);
      setFetchError('Failed to load session data. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchRecentSession();
  }, [fetchRecentSession]);
  useEffect(() => {
    const h = () => fetchRecentSession();
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', h);
    return () => unsub();
  }, [fetchRecentSession]);

  const saveNote = () => {
    if (!wentWell.trim() && !toImprove.trim() && !freeText.trim()) return;
    const note = {
      id: `note-${Date.now()}`,
      wentWell,
      toImprove,
      mood,
      freeText,
      tags: selectedTags,
      pinned: false,
      accuracy: recentAccuracy,
      createdAt: Date.now(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    try {
      localStorage.setItem('session-notes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    setWentWell('');
    setToImprove('');
    setFreeText('');
    setMood('neutral');
    setSelectedTags([]);
    setTab('browse');
  };

  const togglePin = (id) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotes(updated);
    try {
      localStorage.setItem('session-notes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  const deleteNote = (id) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    try {
      localStorage.setItem('session-notes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  const filtered = notes
    .filter((n) => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      const matchesTag = n.tags?.some((t) => t.toLowerCase().includes(s));
      return (
        matchesTag ||
        (n.wentWell || '').toLowerCase().includes(s) ||
        (n.toImprove || '').toLowerCase().includes(s) ||
        (n.freeText || '').toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });

  // Tag frequency for quick filter
  const tagFrequency = {};
  notes.forEach((n) => (n.tags || []).forEach((t) => {
    tagFrequency[t] = (tagFrequency[t] || 0) + 1;
  }));
  const topTags = Object.entries(tagFrequency || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);

  // Note statistics
  const noteStats = {
    total: notes.length,
    avgAccuracy: notes.filter((n) => n.accuracy !== null && n.accuracy !== undefined).length > 0
      ? Math.round(
          notes.filter((n) => n.accuracy !== null).reduce((sum, n) => sum + n.accuracy, 0) /
          notes.filter((n) => n.accuracy !== null).length
        )
      : null,
    moodCounts: notes.reduce((acc, n) => {
      acc[n.mood] = (acc[n.mood] || 0) + 1;
      return acc;
    }, {}),
  };

  // Export notes as downloadable CSV
  const exportNotes = () => {
    const escCsv = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const header = 'Date,Game,Accuracy,Mood,Tags,Went Well,To Improve,Notes';
    const rows = filtered.map((n) => {
      const m = moodObj(n.mood);
      return [
        escCsv(formatDate(n.createdAt)),
        escCsv(n.gameId || 'Unknown'),
        n.accuracy !== null ? n.accuracy : '',
        escCsv(`${m.emoji} ${m.label}`),
        escCsv((n.tags || []).join(', ')),
        escCsv(n.wentWell),
        escCsv(n.toImprove),
        escCsv(n.freeText),
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smarter-poker-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const moodObj = (id) => MOOD_OPTIONS.find((m) => m.id === id) || MOOD_OPTIONS[2];

  return (
    <>
      <Head>
        <title>Session Notes | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Session Notes</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Your training journal</div>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          {[
            { id: 'write', label: 'Write'},
            { id: 'browse', label: `Browse (${notes.length})`},
          ].map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.97 }}
              aria-label={`Tab: ${t.id === 'write' ? 'Write new note' : 'Browse notes'}`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: 6,
                border: `1px solid ${tab === t.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                background: tab === t.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                color: tab === t.id ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </motion.button>
          ))}
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {tab === 'write' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* Recent accuracy tag */}
              {recentAccuracy !== null && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 16,
                    background: 'rgba(0,212,255,0.04)',
                    border: '1px solid rgba(0,212,255,0.1)',
                    fontSize: 11,
                    color: 'var(--sp-fg-muted)',
                  }}
                >
                  Last session accuracy:{' '}
                  <span
                    style={{ fontWeight: 800, color: recentAccuracy >= 75 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)' }}
                  >
                    {recentAccuracy}%
                  </span>
                </div>
              )}

              {/* Mood */}
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                HOW DO YOU FEEL?
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {MOOD_OPTIONS.map((m) => (
                  <motion.button
                    key={m.id}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setMood(m.id)}
                    style={{
                      flex: 1,
                      padding: '10px 4px',
                      borderRadius: 8,
                      border: `1px solid ${mood === m.id ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                      background: mood === m.id ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18 }}>{m.emoji}</div>
                    <div
                      style={{
                        fontSize: 8,
                        color: mood === m.id ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-faint)',
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {m.label}
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Went well */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-accent-green)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  WHAT WENT WELL
                </div>
                <textarea
                  value={wentWell}
                  onChange={(e) => setWentWell(e.target.value)}
                  placeholder="Good reads, correct folds, improved spots..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.04)',
                    border: '1px solid rgba(34,197,94,0.1)',
                    color: 'var(--sp-fg)',
                    fontSize: 12,
                    resize: 'vertical',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>

              {/* To improve */}
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-accent-red)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  WHAT TO IMPROVE
                </div>
                <textarea
                  value={toImprove}
                  onChange={(e) => setToImprove(e.target.value)}
                  placeholder="Missed spots, tilt triggers, leaks found..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.04)',
                    border: '1px solid rgba(239,68,68,0.1)',
                    color: 'var(--sp-fg)',
                    fontSize: 12,
                    resize: 'vertical',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>

              {/* Free notes */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  FREE NOTES (MARKDOWN SUPPORTED)
                </div>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Formatting: **bold**, *italic*, `code`, - bullets..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'var(--sp-fg)',
                    fontSize: 12,
                    resize: 'vertical',
                    fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>

              {/* Tags */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                  }}
                >
                  TAGS
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUGGESTED_TAGS.map((tag) => {
                    const isActive = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() =>
                          setSelectedTags(
                            isActive
                              ? selectedTags.filter((t) => t !== tag)
                              : [...selectedTags, tag]
                          )
                        }
                        style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isActive ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          color: isActive ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={saveNote}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 20px rgba(0,212,255,0.25)',
                }}
              >
                Save Note
              </motion.button>
            </motion.div>
          )}

          {tab === 'browse' && (
            <>
              {/* Note stats */}
              {notes.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 80,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(0,212,255,0.04)',
                      border: '1px solid rgba(0,212,255,0.08)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--sp-accent-cyan)' }}>
                      {noteStats.total}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                      Notes
                    </div>
                  </div>
                  {noteStats.avgAccuracy !== null && (
                    <div
                      style={{
                        flex: 1,
                        minWidth: 80,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(34,197,94,0.04)',
                        border: '1px solid rgba(34,197,94,0.08)',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--sp-accent-green)' }}>
                        {noteStats.avgAccuracy}%
                      </div>
                      <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                        Avg Accuracy
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 80,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(251,191,36,0.04)',
                      border: '1px solid rgba(251,191,36,0.08)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 20 }}>
                      {moodObj(
                        Object.entries(noteStats.moodCounts || {}).sort((a, b) => b[1] - a[1])?.[0]?.[0] || 'neutral'
                      ).emoji}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                      Top Mood
                    </div>
                  </div>
                </div>
              )}

              {/* Tag quick-filter */}
              {topTags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                  {topTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSearchTerm(searchTerm === tag ? '' : tag)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 10,
                        background:
                          searchTerm === tag ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${searchTerm === tag ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        color: searchTerm === tag ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                        fontSize: 9,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search notes..."
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--sp-fg)',
                  fontSize: 12,
                  marginBottom: 12,
                  fontFamily: 'Inter, sans-serif',
                }}
              />

              {/* Export button */}
              {filtered.length > 0 && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={exportNotes}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--sp-fg-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: 16,
                  }}
                >
                  Download {filtered.length} Notes as CSV
                </motion.button>
              )
              }
              {filtered.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No notes yet"
                  message="Switch to the Write tab after your next session to start your journal."
                  compact
                />
              )}
              <AnimatePresence>
                {filtered.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      marginBottom: 8,
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{moodObj(note.mood).emoji}</span>
                        <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
                          {formatDate(note.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {note.accuracy !== null && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: note.accuracy >= 75 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
                            }}
                          >
                            {note.accuracy}%
                          </span>
                        )}
                        <button
                          onClick={() => togglePin(note.id)}
                          title="Pin Note"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                            opacity: note.pinned ? 1 : 0.3,
                          }}
                        >
                          
                        </button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => deleteNote(note.id)}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: 'rgba(239,68,68,0.08)',
                            border: 'none',
                            color: 'var(--sp-accent-red)',
                            fontSize: 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✕
                        </motion.button>
                      </div>
                    </div>
                    {note.tags && note.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              background: 'rgba(255,255,255,0.08)',
                              borderRadius: 4,
                              color: 'var(--sp-fg)',
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    {note.wentWell && (
                      <div style={{ fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: 'var(--sp-accent-green)', fontWeight: 700 }}>Good: </span>
                        <span style={{ color: 'var(--sp-fg-muted)' }}>{note.wentWell}</span>
                      </div>
                    )}
                    {note.toImprove && (
                      <div style={{ fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: 'var(--sp-accent-red)', fontWeight: 700 }}>Fix: </span>
                        <span style={{ color: 'var(--sp-fg-muted)' }}>{note.toImprove}</span>
                      </div>
                    )}
                    {note.freeText && (
                      <div
                        style={{ fontSize: 11, color: 'var(--sp-fg)', marginTop: 6, lineHeight: 1.5 }}
                      >
                        {parseMarkdown(note.freeText)}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchRecentSession(); }} />}
      <ConnectionToast />
    </>
  );
}
