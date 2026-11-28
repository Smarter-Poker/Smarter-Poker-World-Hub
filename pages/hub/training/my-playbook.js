/**
 * MY PLAYBOOK - Custom Strategy Builder
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Create custom named strategies with hole combos, board textures, and notes.
 *
 * Route: /hub/training/my-playbook
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-34 - hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-11 - hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useOnlineStatus } from '../../../src/hooks/useOnlineStatus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
// TRAIN-WIRE-EMPTY-3b - adoption: shared empty-state primitive

// Tag swatches are fills that label a play, never text colours. Earlier
// entries keep whatever colour they were saved with.
const TAG_COLORS = ['#86daff', '#1981ec', '#5ee08a', '#ff7a86', '#bdd0e2', '#2ec8d8'];
const TAG_COLOR_NAMES = { '#86daff': 'Ice', '#1981ec': 'Cobalt', '#5ee08a': 'Green', '#ff7a86': 'Red', '#bdd0e2': 'Silver', '#2ec8d8': 'Cyan' };


async function syncPlaybook(plays) {
  if (!getAccessToken()) return;
  const response = await authedFetch('/api/training/tool-records', {
    method: 'POST',
    body: JSON.stringify({
      toolId: 'my-playbook',
      recordType: 'library',
      recordKey: 'library',
      data: { plays },
    }),
  });
  if (!response.ok) throw new Error(`Playbook sync failed (${response.status})`);
}

// BUG FIX (TRAIN-PLAYBOOK-A11Y-1): SVG icon components replacing the
// emojis on the my-playbook surface (□ empty state, ● pin marker + pin
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


export default function MyPlaybookPage() {
  const router = useRouter();
  const online = useOnlineStatus();
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
    let active = true;
    try {
      const stored = localStorage.getItem('my-playbook');
      if (stored) setPlays(JSON.parse(stored));
    } catch (e) { console.warn('[App] Handled exception:', e); }

    const loadCloud = async () => {
      if (!getAccessToken()) return;
      try {
        const response = await authedFetch('/api/training/tool-records?toolId=my-playbook&recordType=library&limit=1');
        if (!response.ok) throw new Error(`Playbook load failed (${response.status})`);
        const json = await response.json();
        const rawRecords = Array.isArray(json.records)
          ? json.records
          : Array.isArray(json.data)
            ? json.data
            : [];
        const firstRecord = rawRecords[0];
        const cloudPlays = firstRecord?.data?.plays ?? firstRecord?.plays ?? json.data?.plays;
        if (active && Array.isArray(cloudPlays)) {
          setPlays(cloudPlays);
          localStorage.setItem('my-playbook', JSON.stringify(cloudPlays));
        }
      } catch (error) {
        console.warn('[MyPlaybook] Cloud load failed:', error?.message || error);
      }
    };
    loadCloud();
    return () => { active = false; };
  }, []);

  const savePlay = () => {
    if (!title) return;
    const newPlay = { id: Date.now(), title, hands, board, color, notes, pinned: false };
    const next = [newPlay, ...plays];
    setPlays(next);
    try {
      localStorage.setItem('my-playbook', JSON.stringify(next));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    syncPlaybook(next).catch((error) => console.warn('[MyPlaybook] Cloud sync failed:', error?.message || error));

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
    syncPlaybook(next).catch((error) => console.warn('[MyPlaybook] Cloud sync failed:', error?.message || error));
  };

  const togglePin = (id) => {
    const next = plays.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p));
    setPlays(next);
    try {
      localStorage.setItem('my-playbook', JSON.stringify(next));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    syncPlaybook(next).catch((error) => console.warn('[MyPlaybook] Cloud sync failed:', error?.message || error));
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
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={st.shell}>
        <TrainingPageHead slug="training-my-playbook">
          {!online && <p className="sp-head-note" role="status">Offline. Cloud Sync Is Unavailable.</p>}
          <p className="sp-head-note" role="status" aria-label={`${plays.length} plays saved`}><strong>{plays.length}</strong> {plays.length === 1 ? 'Play' : 'Plays'} Saved</p>
          {view === 'list' && (
            <button
              type="button"
              aria-label="Create a new playbook entry"
              onClick={() => setView('form')}
              className="sd-button sd-primary"
            >
              + New Play
            </button>
          )}
        </TrainingPageHead>

        <div className={st.page}>

          {/* Search (list mode only) */}
          {view === 'list' && plays.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plays..."
              aria-label="Search saved plays"
              className={st.input}
            />
          )}
          {view === 'form' ? (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`sd-panel ${st.panel}`}
              aria-labelledby="new-play-title"
            >
              <h2 id="new-play-title" className={st.title}>New Play</h2>
                <label className={st.field}>
                  <span className={st.label}>Play Name</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Exploiting OMC Opens"
                    className={st.input}
                  />
                </label>
              <div className={st.grid2}>
                <label className={st.field}>
                  <span className={st.label}>Relevant Range</span>
                  <input
                    value={hands}
                    onChange={(e) => setHands(e.target.value)}
                    placeholder="e.g., 87s+, 55+"
                    className={st.input}
                  />
                </label>
                <label className={st.field}>
                  <span className={st.label}>Board Texture</span>
                  <input
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    placeholder="e.g., A-high dry"
                    className={st.input}
                  />
                </label>
              </div>

              <fieldset className={st.fieldset}>
                <legend className={st.label}>Tag Color</legend>
                <div className={st.swatches}>
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-pressed={color === c}
                      aria-label={`${TAG_COLOR_NAMES[c] || 'Tag'} Tag`}
                      className={st.swatch}
                    >
                      <span className={st.swatchDot} style={{ background: c }} aria-hidden />
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className={st.field}>
                <span className={st.label}>Strategy Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the exploit and conditions..."
                  rows={5}
                  className={st.input}
                />
              </label>

              <div className={st.formFoot}>
                <button
                  type="button"
                  aria-label="Cancel and return to playbook list"
                  onClick={() => setView('list')}
                  className="sd-button"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  aria-label="Save playbook entry"
                  onClick={savePlay}
                  className="sd-button sd-primary"
                >
                  Save Playbook Entry
                </button>
              </div>
            </motion.section>
          ) : (
            <div className={st.list}>
              {plays.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="Your Playbook Is Empty"
                  message="Create Custom Exploits And Strategies To Reference Before Live Sessions."
                  cta={{ label: '+ New Play', onClick: () => setView('form') }}
                />
              ) : null}

              {displayPlays.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.05 }}
                  className={`sd-panel ${st.panel} ${st.playCard}`}
                  style={{ '--play-tag': p.color }}
                >
                  <div className={st.playHead}>
                    <span className={st.playDot} aria-hidden />
                    <h2 className={st.itemTitle}>
                      {/* TRAIN-PLAYBOOK-A11Y-1: SVG pin replaces ● marker */}
                      {p.pinned && <span className={st.ice} style={{ display: 'inline-flex', marginRight: 6 }} aria-label="Pinned"><PinIcon size={12} filled /></span>}
                      {p.title}
                    </h2>
                    <button
                      type="button"
                      aria-label={p.pinned ? `Unpin ${p.title}` : `Pin ${p.title}`}
                      aria-pressed={p.pinned}
                      onClick={() => togglePin(p.id)}
                      className={`sd-button ${st.close}`}
                    >
                      {/* TRAIN-PLAYBOOK-A11Y-1: SVG pin toggle replaces ● */}
                      <PinIcon size={16} filled={p.pinned} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete playbook entry: ${p.title}`}
                      onClick={() => deletePlay(p.id)}
                      className={`sd-button ${st.close}`}
                    >
                      {/* TRAIN-PLAYBOOK-A11Y-1: SVG close replaces ✕ */}
                      <CloseIcon size={16} />
                    </button>
                  </div>
                  {(p.hands || p.board) && (
                    <dl className={st.facts}>
                      {p.hands && <div><dt>Range</dt><dd className="no-capitalize">{p.hands}</dd></div>}
                      {p.board && <div><dt>Board</dt><dd>{p.board}</dd></div>}
                    </dl>
                  )}
                  {p.notes && <p className={`${st.copy} no-capitalize`}>{p.notes}</p>}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
