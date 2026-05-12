/**
 * MY PLAYBOOK — Custom Strategy Builder
 * ═══════════════════════════════════════════════════════════════════════════
 * Create custom named strategies with hole combos, board textures, and notes.
 *
 * Route: /hub/training/my-playbook
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-34 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-11 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-3b — adoption: shared empty-state primitive

const TAG_COLORS = ['var(--sp-accent-red)', 'var(--sp-accent-orange)', 'var(--sp-accent-amber)', 'var(--sp-accent-emerald)', '#0ea5e9', 'var(--sp-accent-purple)'];

// BUG FIX (TRAIN-PLAYBOOK-A11Y-1): SVG icon components replacing the
// emojis on the my-playbook surface (📖 empty state, 📌 pin marker + pin
// toggle, ✕ delete) and a bare ← back-button entity. Same surface-
// specific a11y pattern as PR #320/#322/#324/#327/#328/#329/#330/#331/
// #332/#333/#334/#335.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=14, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function BookOpenIcon({ size=40 }) {
  return (
    <_Svg size={size}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </_Svg>
  );
}
function PinIcon({ size=14, filled=false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
         fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="17" x2="12" y2="22"/>
      <path d="M5 17h14l-2-7H7z"/>
      <path d="M9 10V5h6v5"/>
    </svg>
  );
}
function CloseIcon({ size=16 }) {
  return (
    <_Svg size={size}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </_Svg>
  );
}
function BackArrowIcon({ size=18 }) {
  return (
    <_Svg size={size}>
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </_Svg>
  );
}


export default function MyPlaybookPage() {
  const router = useRouter();
  useTrainingBus('my-playbook');

  const [plays, setPlays] = useState([]);
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');

  const [title, setTitle] = useState('');
  const [hands, setHands] = useState('');
  const [board, setBoard] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('my-playbook');
      if (stored) setPlays(JSON.parse(stored));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'MyPlaybook') return;
    });
    return unsub;
  }, []);

  const savePlay = () => {
    if (!title) return;
    const newPlay = { id: Date.now(), title, hands, board, color, notes, pinned: false };
    const next = [newPlay, ...plays];
    setPlays(next);
    try {
      localStorage.setItem('my-playbook', JSON.stringify(next));
    } catch (e) { console.warn('[App] Handled exception:', e); }

    // Save to Supabase
    const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
    if (token) {
      authedFetch('/api/training/save-session', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'my-playbook',
          gameName: `Playbook: ${title}`,
          gtowScore: 100,
          totalEVLoss: 0,
          handsPlayed: next.length,
          mistakeCount: 0,
          accuracy: 100,
          correctCount: next.length,
          bestStreak: 0,
          levelPassed: true,
          level: 1,
          handHistory: [],
        }),
      }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        { gameId: 'my-playbook', plays: next.length, newPlay: title },
        'MyPlaybook'
      );
    }

    // Reset
    setTitle('');
    setHands('');
    setBoard('');
    setNotes('');
    setView('list');
  };

  const deletePlay = (id) => {
    const next = plays.filter((p) => p.id !== id);
    setPlays(next);
    try {
      localStorage.setItem('my-playbook', JSON.stringify(next));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  const togglePin = (id) => {
    const next = plays.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p));
    setPlays(next);
    try {
      localStorage.setItem('my-playbook', JSON.stringify(next));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  // Sort: pinned first, then search
  const displayPlays = useMemo(() => {
    let list = [...plays].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(s) ||
          (p.notes || '').toLowerCase().includes(s) ||
          (p.hands || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [plays, search]);

  return (
    <>
      <Head>
        <title>My Playbook | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              aria-label="Back to training"
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
              {/* TRAIN-PLAYBOOK-A11Y-1: SVG back arrow */}
              <BackArrowIcon size={18} />
            </button>
            <div>
              {/* TRAIN-PLAYBOOK-A11Y-1: semantic h1 */}
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>My Playbook</h1>
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }} role="status" aria-label={`${plays.length} plays saved`}>{plays.length} plays saved</div>
            </div>
          </div>
          {view === 'list' && (
            <button
              type="button"
              aria-label="Create a new playbook entry"
              onClick={() => setView('form')}
              style={{
                background: 'var(--sp-accent-blue)',
                color: '#fff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + New Play
            </button>
          )}
        </div>

        <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
          {/* Search (list mode only) */}
          {view === 'list' && plays.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plays..."
              aria-label="Search saved plays"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--sp-fg)',
                fontSize: 13,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
          )}
          {view === 'form' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                padding: 24,
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-fg-muted)',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Play Name
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Exploiting OMC Opens"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 15,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--sp-fg-muted)',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Relevant Range
                  </label>
                  <input
                    value={hands}
                    onChange={(e) => setHands(e.target.value)}
                    placeholder="e.g., 87s+, 55+"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--sp-fg-muted)',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Board Texture
                  </label>
                  <input
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    placeholder="e.g., A-high dry"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      borderRadius: 8,
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-fg-muted)',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Tag Color
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: c,
                        border: `3px solid ${color === c ? '#fff' : 'transparent'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-fg-muted)',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Strategy Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the exploit and conditions..."
                  style={{
                    width: '100%',
                    padding: 16,
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--sp-fg)',
                    borderRadius: 8,
                    minHeight: 120,
                    fontSize: 14,
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  aria-label="Cancel and return to playbook list"
                  onClick={() => setView('list')}
                  style={{
                    flex: 1,
                    padding: 14,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--sp-fg)',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="Save playbook entry"
                  onClick={savePlay}
                  style={{
                    flex: 2,
                    padding: 14,
                    background: 'var(--sp-accent-blue)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save Playbook Entry
                </button>
              </div>
            </motion.div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {plays.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="Your Playbook is empty"
                  message="Create custom exploits and strategies to reference before live sessions."
                />
              ) : null}

              {displayPlays.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: `1px solid ${p.pinned ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 16,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: `2px solid ${p.color}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* TRAIN-PLAYBOOK-A11Y-1: SVG pin replaces 📌 marker */}
                      {p.pinned && <span style={{ display: 'inline-flex', color: 'var(--sp-accent-amber)' }} aria-label="Pinned"><PinIcon size={12} filled /></span>}
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{p.title}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        aria-label={p.pinned ? `Unpin ${p.title}` : `Pin ${p.title}`}
                        aria-pressed={p.pinned}
                        onClick={() => togglePin(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: p.pinned ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)',
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'inline-flex',
                        }}
                      >
                        {/* TRAIN-PLAYBOOK-A11Y-1: SVG pin toggle replaces 📌 */}
                        <PinIcon size={14} filled={p.pinned} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete playbook entry: ${p.title}`}
                        onClick={() => deletePlay(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--sp-fg-dim)',
                          fontSize: 16,
                          cursor: 'pointer',
                          display: 'inline-flex',
                        }}
                      >
                        {/* TRAIN-PLAYBOOK-A11Y-1: SVG close replaces ✕ */}
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      {p.hands && (
                        <div
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--sp-fg)',
                          }}
                        >
                          <span style={{ color: 'var(--sp-fg-muted)', marginRight: 6 }}>Range:</span>
                          {p.hands}
                        </div>
                      )}
                      {p.board && (
                        <div
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--sp-fg)',
                          }}
                        >
                          <span style={{ color: 'var(--sp-fg-muted)', marginRight: 6 }}>Board:</span>
                          {p.board}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>{p.notes}</div>
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
