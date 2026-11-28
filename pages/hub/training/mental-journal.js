/**
 * MENTAL GAME JOURNAL - Tilt & Trigger Tracking
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Tracks sleep quality, caffeine, states, and tilt triggers.
 * Backed by dedicated non-graded tool records so journal entries never affect
 * accuracy, streaks, rewards, or leaderboards.
 *
 * Route: /hub/training/mental-journal
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-29 - hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-22 - gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
// TRAIN-WIRE-EMPTY-1c - adoption: shared empty-state primitive

// BUG FIX (TRAIN-JOURNAL-A11Y-1): SVG icons replacing the mental-journal
// emoji set. STATES now carries iconKind; StateIcon renders by kind. Legacy
// `icon` emoji string preserved for back-compat. Plus standalone SVGs for
// ✓ save toast and ← back. Same surface-specific a11y pattern as PR #320/
// #322/#324/#327/#328/#329/#330/#331/#332/#333/#334/#335/#336.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=20, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function BoltIcon({ size=20 })   { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function SleepIcon({ size=20 })  { return <_Svg size={size}><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/><path d="M16 4l1.5 3 3 .5-2 2 .5 3-3-1.5L13 12.5l.5-3-2-2 3-.5z"/></_Svg>; }
function AngryIcon({ size=20 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><path d="M8 16s1.5-2 4-2 4 2 4 2"/><line x1="7.5" y1="8.5" x2="9.5" y2="10"/><line x1="16.5" y1="8.5" x2="14.5" y2="10"/></_Svg>; }
function MonkeyIcon({ size=20 }) { return <_Svg size={size}><circle cx="12" cy="13" r="6"/><circle cx="6" cy="9" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="10" cy="12" r="0.5"/><circle cx="14" cy="12" r="0.5"/><path d="M9 16s1.5 1.5 3 1.5 3-1.5 3-1.5"/></_Svg>; }
function StateIcon({ kind, size=20 }) {
  switch (kind) {
    case 'bolt':   return <BoltIcon size={size}/>;
    case 'sleep':  return <SleepIcon size={size}/>;
    case 'angry':  return <AngryIcon size={size}/>;
    case 'monkey': return <MonkeyIcon size={size}/>;
    default:       return <BoltIcon size={size}/>;
  }
}
function CheckIcon({ size=14 }) { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function MoonIcon({ size=12 })   { return <_Svg size={size}><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></_Svg>; }
function CoffeeIcon({ size=12 }) { return <_Svg size={size}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></_Svg>; }

const STATES = [
  { id: 'zone', label: 'In The Zone', color: 'var(--sp-accent-green)', iconKind: 'bolt', icon: '⌁' },
  { id: 'bored', label: 'Bored / Autopilot', color: 'var(--sp-fg-muted)', iconKind: 'sleep', icon: '·' },
  { id: 'frust', label: 'Frustrated', color: '#86daff', iconKind: 'angry', icon: '▲' },
  { id: 'tilt', label: 'Monkey Tilt', color: 'var(--sp-accent-red)', iconKind: 'monkey', icon: '●' },
];

const TRIGGERS = [
  'Bad Beat',
  'Card Dead',
  'Cooler',
  'Missed Value',
  'Lost Big Pot',
  'Tired',
  'Distracted',
];

const LOCAL_JOURNAL_KEY = 'training-mental-journal-v2';

function readLocalEntries() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_JOURNAL_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export default function MentalJournalPage() {
  const router = useRouter();
  useTrainingBus('mental-journal');

  const [entries, setEntries] = useState([]);
  const [view, setView] = useState('add'); // 'add' or 'history'
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form State
  const [sleep, setSleep] = useState(7);
  const [caffeine, setCaffeine] = useState(2);
  const [mindState, setMindState] = useState('zone');
  const [selectedTriggers, setSelectedTriggers] = useState([]);
  const [notes, setNotes] = useState('');
  const [savedToast, setSavedToast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Fetch history on mount or when switching to 'history'
  useEffect(() => {
    if (view === 'history') {
      fetchHistory();
    }
  }, [view]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    setFetchError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        setEntries(readLocalEntries());
        return;
      }
      const res = await authedFetch('/api/training/tool-records?toolId=mental-journal&recordType=entry&limit=50');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      const rawRecords = Array.isArray(json.records)
        ? json.records
        : Array.isArray(json.data)
          ? json.data
          : [];
      if ((json.success || rawRecords.length > 0) && Array.isArray(rawRecords)) {
        const parsed = rawRecords
          .filter((record) => record.data?.mindState || record.mindState)
          .map((record) => {
            const recData = record.data || record;
            return {
              id: record.record_key || record.id,
              date: new Date(recData.clientCreatedAt || record.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }),
              sleep: recData.sleep ?? 7,
              caffeine: recData.caffeine ?? 0,
              mindState: recData.mindState || 'zone',
              triggers: recData.triggers || [],
              notes: recData.notes || '',
            };
          });
        setEntries(parsed);
      }
    } catch (e) {
      console.warn('Failed to fetch journal history:', e);
      setEntries(readLocalEntries());
      setFetchError('Cloud history could not load. Showing entries saved on this device.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleTrigger = (t) => {
    setSelectedTriggers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const saveEntry = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const payload = {
      sleep,
      caffeine,
      mindState,
      triggers: selectedTriggers,
      notes,
      clientCreatedAt: new Date().toISOString(),
    };

    const recordKey = `entry-${Date.now()}`;
    const localEntry = {
      id: recordKey,
      date: new Date(payload.clientCreatedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }),
      ...payload,
    };

    const localEntries = [localEntry, ...readLocalEntries()].slice(0, 50);
    try {
      localStorage.setItem(LOCAL_JOURNAL_KEY, JSON.stringify(localEntries));
    } catch (error) {
      console.warn('[MentalJournal] Local save failed:', error?.message || error);
    }

    try {
      const token = getAccessToken();
      if (token) {
        const response = await authedFetch('/api/training/tool-records', {
          method: 'POST',
          body: JSON.stringify({
            toolId: 'mental-journal',
            recordType: 'entry',
            recordKey,
            data: payload,
          }),
        });
        if (!response.ok) throw new Error(`Cloud save failed (${response.status})`);
      }

      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);

      // Reset form gracefully
      setSelectedTriggers([]);
      setNotes('');
      setView('history'); // Switch to history to see the new entry
    } catch (e) {
      console.warn('[MentalJournal] Cloud save failed:', e?.message || e);
      setEntries(localEntries);
      setFetchError('Saved on this device. Cloud sync is temporarily unavailable.');
      setView('history');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Mental Journal | Smarter.Poker Training</title>
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={st.shell}>
        <TrainingPageHead slug="training-mental-journal" note="Tilt & Trigger Tracking" />

        <div className={st.page}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); if (view === 'history') fetchHistory(); }} />

          {/* View Toggle */}
          <div role="group" aria-label="Switch between new entry and history" className={`sd-tabs ${st.grid2}`}>
            <button
              type="button"
              aria-label="New journal entry"
              aria-pressed={view === 'add'}
              onClick={() => setView('add')}
              className="sd-button"
            >
              New Entry
            </button>
            <button
              type="button"
              aria-label="Browse journal history"
              aria-pressed={view === 'history'}
              onClick={() => setView('history')}
              className="sd-button"
            >
              History
            </button>
          </div>

          {view === 'add' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={st.list}>
              {/* Sliders */}
              <section className={`sd-panel ${st.panel}`} aria-labelledby="journal-baseline-title">
                <h2 id="journal-baseline-title" className={st.title}>Session Baseline</h2>
                <label className={st.field}>
                  <span className={st.sliderHead}>
                    <span className={st.label}>Sleep Quality</span>
                    <strong className={st.ice}>{sleep} Hrs</strong>
                  </span>
                  <input
                    type="range"
                    min="3"
                    max="10"
                    step="0.5"
                    value={sleep}
                    aria-label={`Sleep quality: ${sleep} hours`}
                    aria-valuetext={`${sleep} hours`}
                    onChange={(e) => setSleep(e.target.value)}
                    className={st.range}
                  />
                </label>

                <label className={st.field}>
                  <span className={st.sliderHead}>
                    <span className={st.label}>Caffeine Level</span>
                    <strong className={st.ice}>{caffeine} Cups</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="6"
                    step="1"
                    value={caffeine}
                    aria-label={`Caffeine level: ${caffeine} cups`}
                    aria-valuetext={`${caffeine} cups`}
                    onChange={(e) => setCaffeine(e.target.value)}
                    className={st.range}
                  />
                </label>
              </section>

              <section className={`sd-panel ${st.panel}`} aria-labelledby="journal-state-title">
                {/* Mental State */}
                <h2 id="journal-state-title" className={st.title}>Primary State</h2>
                <div role="radiogroup" aria-label="Primary mental state" className={st.grid2}>
                  {STATES.map((s) => (
                    <motion.button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={mindState === s.id}
                      aria-label={`Mental state: ${s.label}`}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setMindState(s.id)}
                      className={`sd-button ${st.stateButton}`}
                    >
                      {/* TRAIN-JOURNAL-A11Y-1: SVG StateIcon replaces emoji */}
                      <span className={st.stateIcon} aria-hidden><StateIcon kind={s.iconKind} size={20} /></span>
                      <span>{s.label}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Triggers */}
                <fieldset className={st.fieldset}>
                  <legend className={st.label}>Tilt Triggers (Select All That Apply)</legend>
                  <div className={st.chips}>
                    {TRIGGERS.map((t) => {
                      const active = selectedTriggers.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          aria-label={`${active ? 'Remove' : 'Add'} trigger: ${t}`}
                          aria-pressed={active}
                          onClick={() => toggleTrigger(t)}
                          className="sd-button"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <label className={st.field}>
                  <span className={st.label}>Session Notes</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional session notes..."
                    aria-label="Additional session notes"
                    rows={4}
                    className={st.input}
                  />
                </label>
              </section>

              <motion.button
                type="button"
                aria-label="Log mental state to journal"
                disabled={isSaving}
                whileTap={{ scale: 0.97 }}
                onClick={saveEntry}
                className={`sd-button sd-primary ${st.block}`}
              >
                {isSaving ? 'Logging To Database...' : 'Log Mental State'}
              </motion.button>
              {savedToast && (
                <p className={st.notice} role="status" aria-live="polite">
                  {/* TRAIN-JOURNAL-A11Y-1: SVG check replaces ✓ */}
                  <CheckIcon size={14} /> Saved
                </p>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <div className={st.list}>
              {loadingHistory && (
                <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading journal history">
                  <div className={st.skeleton} aria-hidden><span /><span /><span /><span /></div>
                  <p className={st.small}>Loading Journal History...</p>
                </section>
              )}

              {!loadingHistory && entries.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Journal Entries Yet"
                  message="Log A Mental Check-In To Start Building Your Trend."
                  compact
                />
              ) : null}

              {!loadingHistory &&
                entries.map((e) => {
                  const stateInfo = STATES.find((s) => s.id === e.mindState) || STATES[0];
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={st.item}
                    >
                      <div className={st.panelHead}>
                        <span className={st.small}>{e.date}</span>
                        <span className={st.tag}>
                          {/* TRAIN-JOURNAL-A11Y-1: SVG StateIcon in history rows */}
                          <span style={{ display: 'inline-flex' }} aria-hidden><StateIcon kind={stateInfo.iconKind} size={12} /></span> {stateInfo.label}
                        </span>
                      </div>
                      <dl className={st.facts}>
                        {/* TRAIN-JOURNAL-A11Y-1: SVG moon replaces ○ */}
                        <div><dt><MoonIcon size={12} /> Sleep</dt><dd className="no-capitalize">{e.sleep}h</dd></div>
                        {/* TRAIN-JOURNAL-A11Y-1: SVG coffee replaces ● */}
                        <div><dt><CoffeeIcon size={12} /> Caffeine</dt><dd>{e.caffeine} Cups</dd></div>
                      </dl>
                      {e.triggers && e.triggers.length > 0 && (
                        <div className={st.chips}>
                          {e.triggers.map((t) => (
                            <span key={t} className={st.tag}>{t}</span>
                          ))}
                        </div>
                      )}
                      {e.notes && <p className={`${st.copy} no-capitalize`}>&ldquo;{e.notes}&rdquo;</p>}
                    </motion.div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
