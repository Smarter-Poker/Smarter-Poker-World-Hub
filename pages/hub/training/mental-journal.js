/**
 * MENTAL GAME JOURNAL — Tilt & Trigger Tracking
 * ═══════════════════════════════════════════════════════════════════════════
 * Tracks sleep quality, caffeine, states, and tilt triggers.
 * Now fully backed by Supabase training_sessions to retain historical data.
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
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { SkeletonBox } from '../../../src/components/ui/SkeletonLoader';


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
function BackArrowIcon({ size=18 }) { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function MoonIcon({ size=12 })   { return <_Svg size={size}><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></_Svg>; }
function CoffeeIcon({ size=12 }) { return <_Svg size={size}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></_Svg>; }


const STATES = [
  { id: 'zone', label: 'In The Zone', color: '#4ade80', iconKind: 'bolt', icon: '⚡' },
  { id: 'bored', label: 'Bored / Autopilot', color: '#94a3b8', iconKind: 'sleep', icon: '😴' },
  { id: 'frust', label: 'Frustrated', color: '#fbbf24', iconKind: 'angry', icon: '😤' },
  { id: 'tilt', label: 'Monkey Tilt', color: '#ef4444', iconKind: 'monkey', icon: '🦍' },
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

  useEffect(() => {
    const h = () => {};
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, []);

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
      if (!token) return;
      const res = await authedFetch('/api/training/get-sessions?gameId=mental-journal&limit=50', {
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        // Map the JSONB trainer_config into our UI entries
        const parsed = data.sessions
          .filter((s) => s.trainer_config && s.trainer_config.mindState)
          .map((s) => ({
            id: s.id || s.created_at,
            date: new Date(s.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
            sleep: s.trainer_config.sleep || 7,
            caffeine: s.trainer_config.caffeine || 0,
            mindState: s.trainer_config.mindState || 'zone',
            triggers: s.trainer_config.triggers || [],
            notes: s.trainer_config.notes || '',
          }));
        setEntries(parsed);
      }
    } catch (e) {
      console.warn('Failed to fetch journal history:', e);
      setFetchError('Unable to load journal history. Please try again.');
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
    };

    try {
      const token = getAccessToken();
      if (token) {
        await authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({
            gameId: 'mental-journal',
            questionsAnswered: 1,
            questionsCorrect: 1,
            accuracy: 100,
            trainerConfig: payload, // Hijack trainerConfig JSONB to store diary state
          }),
        });
      }

      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        { accuracy: 100, questionsAnswered: 1, questionsCorrect: 1 },
        'mental-journal'
      );

      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);

      // Reset form gracefully
      setSelectedTriggers([]);
      setNotes('');
      setView('history'); // Switch to history to see the new entry
    } catch (e) {
      console.warn(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Mental Journal | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', sans-serif",
          paddingBottom: 40,
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
                color: '#94a3b8',
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
              {/* TRAIN-JOURNAL-A11Y-1: SVG back arrow */}
              <BackArrowIcon size={18} />
            </button>
            <div>
              {/* TRAIN-JOURNAL-A11Y-1: semantic h1 */}
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Mental Journal</h1>
              <div style={{ fontSize: 11, color: '#64748b' }}>Tilt & Trigger Tracking</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '20px', maxWidth: 600, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); if (view === 'history') fetchHistory(); }} />
          {/* View Toggle */}
          <div
            role="tablist"
            aria-label="Switch between new entry and history"
            style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.3)',
              padding: 4,
              borderRadius: 10,
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              role="tab"
              aria-label="New journal entry"
              aria-pressed={view === 'add'}
              onClick={() => setView('add')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 6,
                border: 'none',
                background: view === 'add' ? '#3b82f6' : 'transparent',
                color: view === 'add' ? '#fff' : '#94a3b8',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              New Entry
            </button>
            <button
              type="button"
              role="tab"
              aria-label="Browse journal history"
              aria-pressed={view === 'history'}
              onClick={() => setView('history')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 6,
                border: 'none',
                background: view === 'history' ? '#3b82f6' : 'transparent',
                color: view === 'history' ? '#fff' : '#94a3b8',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              History
            </button>
          </div>

          {view === 'add' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* Sliders */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  padding: 20,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.05)',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                    Sleep Quality
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#00d4ff' }}>
                    {sleep} hrs
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="10"
                  step="0.5"
                  value={sleep}
                  aria-label={`Sleep quality: ${sleep} hours`}
                  aria-valuetext={`${sleep} hours`}
                  onChange={(e) => setSleep(e.target.value)}
                  style={{ width: '100%', marginBottom: 24, accentColor: '#00d4ff' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                    Caffeine Level
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>
                    {caffeine} cups
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={caffeine}
                  aria-label={`Caffeine level: ${caffeine} cups`}
                  aria-valuetext={`${caffeine} cups`}
                  onChange={(e) => setCaffeine(e.target.value)}
                  style={{ width: '100%', accentColor: '#fbbf24' }}
                />
              </div>

              {/* Mental State */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                Primary State
              </div>
              <div
                role="radiogroup"
                aria-label="Primary mental state"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {STATES.map((s) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={mindState === s.id}
                    aria-label={`Mental state: ${s.label}`}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMindState(s.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '16px',
                      borderRadius: 12,
                      border: `1px solid ${mindState === s.id ? `${s.color}66` : 'rgba(255,255,255,0.05)'}`,
                      background: mindState === s.id ? `${s.color}15` : 'rgba(0,0,0,0.2)',
                      color: mindState === s.id ? s.color : '#94a3b8',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {/* TRAIN-JOURNAL-A11Y-1: SVG StateIcon replaces emoji */}
                    <span style={{ fontSize: 20, display: 'inline-flex' }} aria-hidden><StateIcon kind={s.iconKind} size={20} /></span> {s.label}
                  </motion.button>
                ))}
              </div>

              {/* Triggers */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                Tilt Triggers (Select all that apply)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {TRIGGERS.map((t) => {
                  const active = selectedTriggers.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-label={`${active ? 'Remove' : 'Add'} trigger: ${t}`}
                      aria-pressed={active}
                      onClick={() => toggleTrigger(t)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 20,
                        border: `1px solid ${active ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: active ? 'rgba(239,68,68,0.1)' : 'transparent',
                        color: active ? '#fca5a5' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional session notes..."
                aria-label="Additional session notes"
                style={{
                  width: '100%',
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: 14,
                  minHeight: 100,
                  marginBottom: 24,
                  resize: 'none',
                  outline: 'none',
                }}
              />

              <motion.button
                type="button"
                aria-label="Log mental state to journal"
                disabled={isSaving}
                whileTap={{ scale: 0.97 }}
                onClick={saveEntry}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: 12,
                  border: 'none',
                  background: isSaving ? '#475569' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  boxShadow: isSaving ? 'none' : '0 4px 20px rgba(59,130,246,0.3)',
                  position: 'relative',
                }}
              >
                {isSaving ? 'Logging to Database...' : 'Log Mental State'}
                {savedToast && (
                  <span style={{ position: 'absolute', right: 20, color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 4 }} role="status" aria-live="polite">
                    {/* TRAIN-JOURNAL-A11Y-1: SVG check replaces ✓ */}
                    <CheckIcon size={14} /> Saved
                  </span>
                )}
              </motion.button>
            </motion.div>
          )}

          {view === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }} role="status" aria-label="Loading journal history">
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <SkeletonBox width={32} height={32} style={{ borderRadius: 8 }} />
                        <SkeletonBox width={`${50 + i * 10}%`} height={14} />
                      </div>
                      <SkeletonBox width={`${70 + i * 5}%`} height={10} />
                    </div>
                  ))}
                </div>
              )}

              {!loadingHistory && entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                  No entries found in database.
                </div>
              ) : null}

              {!loadingHistory &&
                entries.map((e) => {
                  const st = STATES.find((s) => s.id === e.mindState) || STATES[0];
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{
                        padding: '16px',
                        borderRadius: 16,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 16,
                        }}
                      >
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{e.date}</div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: st.color,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '2px 8px',
                            background: `${st.color}15`,
                            borderRadius: 12,
                          }}
                        >
                          {/* TRAIN-JOURNAL-A11Y-1: SVG StateIcon in history rows */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-hidden><StateIcon kind={st.iconKind} size={12} /></span> {st.label}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 16,
                          marginBottom: 12,
                          fontSize: 12,
                          color: '#cbd5e1',
                        }}
                      >
                        <div>
                          {/* TRAIN-JOURNAL-A11Y-1: SVG moon replaces ☁️ */}
                          <span style={{ color: '#00d4ff', display: 'inline-flex', alignItems: 'center', gap: 4 }}><MoonIcon size={12} /> Sleep:</span> {e.sleep}h
                        </div>
                        <div>
                          {/* TRAIN-JOURNAL-A11Y-1: SVG coffee replaces ☕ */}
                          <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CoffeeIcon size={12} /> Caf:</span> {e.caffeine} cups
                        </div>
                      </div>
                      {e.triggers && e.triggers.length > 0 && (
                        <div
                          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
                        >
                          {e.triggers.map((t) => (
                            <span
                              key={t}
                              style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                background: 'rgba(239,68,68,0.1)',
                                color: '#fca5a5',
                                borderRadius: 4,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {e.notes && (
                        <div
                          style={{
                            fontSize: 13,
                            color: '#94a3b8',
                            lineHeight: 1.5,
                            padding: 12,
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: 8,
                          }}
                        >
                          "{e.notes}"
                        </div>
                      )}
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
