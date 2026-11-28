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
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
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

function renderNoteText(text) {
  if (!text) return null;
  return text.split('\n').map((line, lineIndex) => {
    const bulleted = line.startsWith('- ');
    const words = (bulleted ? line.slice(2) : line)
      .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
      .map((part, index) => {
        if (index % 2 === 0) return part;
        if (part.startsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
        return <code key={index}>{part.slice(1, -1)}</code>;
      });
    return (
      <div key={lineIndex} style={{ minHeight: '1em', paddingInlineStart: bulleted ? 16 : undefined }}>
        {bulleted && <span aria-hidden="true">• </span>}
        {words}
      </div>
    );
  });
}

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
    if (!getAccessToken()) return;
    authedFetch('/api/training/tool-records?tool_id=session-notes&limit=25')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const records = Array.isArray(json?.records) ? json.records : [];
        const latestSnapshot = records.find((r) => Array.isArray(r?.payload?.notes));
        if (latestSnapshot) {
          setNotes((prev) => {
            const byId = new Map();
            [...(latestSnapshot.payload.notes || []), ...(prev || [])].forEach((n) => {
              if (n && n.id) byId.set(n.id, n);
            });
            const merged = Array.from(byId.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
            try {
              localStorage.setItem('session-notes', JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
        }
      })
      .catch(() => {});
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

  const persistNotesToServer = (updatedNotes, summaryText = 'Session notes updated') => {
    authedFetch('/api/training/tool-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_id: 'session-notes',
        record_key: 'notes_snapshot',
        record_type: 'notes_snapshot',
        title: `Session Notes (${updatedNotes.length})`,
        summary: summaryText,
        payload: { notes: updatedNotes },
      }),
    }).catch(() => {});
  };

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
    persistNotesToServer(updated, wentWell.trim() || freeText.trim() || 'Saved session note');
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
    persistNotesToServer(updated, 'Toggled note pin');
  };

  const deleteNote = (id) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    try {
      localStorage.setItem('session-notes', JSON.stringify(updated));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    persistNotesToServer(updated, 'Deleted session note');
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
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={st.shell}>
        <TrainingPageHead slug="training-session-notes" />

        <div className={st.page}>
        {/* Tabs */}
        <div className={`sd-tabs ${st.grid2}`} role="group" aria-label="Session Notes Views">
          {[
            { id: 'write', label: 'Write'},
            { id: 'browse', label: `Browse (${notes.length})`},
          ].map((t) => (
            <motion.button
              key={t.id}
              type="button"
              className="sd-button"
              whileTap={{ scale: 0.97 }}
              aria-label={`Tab: ${t.id === 'write' ? 'Write new note' : 'Browse notes'}`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </motion.button>
          ))}
        </div>

          {tab === 'write' && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`sd-panel ${st.panel}`} aria-label="Write A Session Note">
              {/* Recent accuracy tag */}
              {recentAccuracy !== null && (
                <p className={st.notice}>
                  Last Session Accuracy:{' '}
                  <strong className={st.ice}>{recentAccuracy}%</strong>
                </p>
              )}

              {/* Mood */}
              <fieldset className={st.fieldset}>
                <legend className={st.label}>How Do You Feel?</legend>
                <div className={st.chips}>
                  {MOOD_OPTIONS.map((m) => (
                    <motion.button
                      key={m.id}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setMood(m.id)}
                      aria-pressed={mood === m.id}
                      className="sd-button"
                    >
                      {m.label}
                    </motion.button>
                  ))}
                </div>
              </fieldset>

              {/* Went well */}
              <label className={st.field}>
                <span className={st.label}>What Went Well</span>
                <textarea
                  value={wentWell}
                  onChange={(e) => setWentWell(e.target.value)}
                  placeholder="Good reads, correct folds, improved spots..."
                  rows={2}
                  className={st.input}
                />
              </label>

              {/* To improve */}
              <label className={st.field}>
                <span className={st.label}>What To Improve</span>
                <textarea
                  value={toImprove}
                  onChange={(e) => setToImprove(e.target.value)}
                  placeholder="Missed spots, tilt triggers, leaks found..."
                  rows={2}
                  className={st.input}
                />
              </label>

              {/* Free notes */}
              <label className={st.field}>
                <span className={st.label}>Free Notes (Markdown Supported)</span>
                <textarea
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="Formatting: **bold**, *italic*, `code`, - bullets..."
                  rows={4}
                  className={st.input}
                />
              </label>

              {/* Tags */}
              <fieldset className={st.fieldset}>
                <legend className={st.label}>Tags</legend>
                <div className={st.chips}>
                  {SUGGESTED_TAGS.map((tag) => {
                    const isActive = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={isActive}
                        className="sd-button"
                        onClick={() =>
                          setSelectedTags(
                            isActive
                              ? selectedTags.filter((t) => t !== tag)
                              : [...selectedTags, tag]
                          )
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={saveNote}
                className={`sd-button sd-primary ${st.block}`}
              >
                Save Note
              </motion.button>
            </motion.section>
          )}

          {tab === 'browse' && (
            <>
              {/* Note stats */}
              {notes.length > 0 && (
                <section className={st.metrics} style={{ '--cols': noteStats.avgAccuracy !== null ? 3 : 2 }} aria-label="Note Summary">
                  <div className={`sd-metric ${st.metric}`}>
                    <strong className={st.metricValue} data-tone="ice">{noteStats.total}</strong>
                    <span className={st.metricLabel}>Notes</span>
                  </div>
                  {noteStats.avgAccuracy !== null && (
                    <div className={`sd-metric ${st.metric}`}>
                      <strong className={st.metricValue}>{noteStats.avgAccuracy}%</strong>
                      <span className={st.metricLabel}>Avg Accuracy</span>
                    </div>
                  )}
                  <div className={`sd-metric ${st.metric}`}>
                    <strong className={st.metricValue}>
                      {moodObj(
                        Object.entries(noteStats.moodCounts || {}).sort((a, b) => b[1] - a[1])?.[0]?.[0] || 'neutral'
                      ).label}
                    </strong>
                    <span className={st.metricLabel}>Top Mood</span>
                  </div>
                </section>
              )}

              <section className={`sd-panel ${st.panel}`} aria-label="Find Notes">
                {/* Tag quick-filter */}
                {topTags.length > 0 && (
                  <div className={st.chips} role="group" aria-label="Filter By Tag">
                    {topTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={searchTerm === tag}
                        className="sd-button"
                        onClick={() => setSearchTerm(searchTerm === tag ? '' : tag)}
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
                  aria-label="Search Notes"
                  className={st.input}
                />

                {/* Export button */}
                {filtered.length > 0 && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={exportNotes}
                    className={`sd-button ${st.block}`}
                  >
                    Download {filtered.length} Notes As CSV
                  </motion.button>
                )}
              </section>
              {filtered.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Notes Yet"
                  message="Switch To The Write Tab After Your Next Session To Start Your Journal."
                  compact
                />
              )}
              <div className={st.list}>
              <AnimatePresence>
                {filtered.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`${st.item} ${note.pinned ? st.itemActive : ''}`}
                  >
                    <div className={st.noteHead}>
                      <span className={st.dayText}>
                        <span className={st.itemTitle}>{moodObj(note.mood).label}</span>
                        <span className={st.small}>{formatDate(note.createdAt)}</span>
                      </span>
                      {note.accuracy !== null && (
                        <strong className={st.ice}>{note.accuracy}%</strong>
                      )}
                      <button
                        type="button"
                        onClick={() => togglePin(note.id)}
                        title="Pin Note"
                        aria-pressed={!!note.pinned}
                        className="sd-button"
                      >
                        {note.pinned ? 'Pinned' : 'Pin'}
                      </button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => deleteNote(note.id)}
                        aria-label="Delete Note"
                        className={`sd-button ${st.close}`}
                      >
                        ✕
                      </motion.button>
                    </div>
                    {note.tags && note.tags.length > 0 && (
                      <div className={st.chips}>
                        {note.tags.map((t) => (
                          <span key={t} className={st.tag}>#{t}</span>
                        ))}
                      </div>
                    )}
                    {note.wentWell && (
                      <p className={st.copy}>
                        <strong className={st.white}>Good: </strong><span className="no-capitalize">{note.wentWell}</span>
                      </p>
                    )}
                    {note.toImprove && (
                      <p className={st.copy}>
                        <strong className={st.white}>Fix: </strong><span className="no-capitalize">{note.toImprove}</span>
                      </p>
                    )}
                    {note.freeText && (
                      <div className={`${st.noteBody} no-capitalize`}>
                        {renderNoteText(note.freeText)}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              </div>
            </>
          )}

        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchRecentSession(); }} />}
      <ConnectionToast />
    </>
  );
}
