/**
 * SessionSetupModal · TRAIN-SETUP-MODAL-1
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Greenfield component originally tracked in issue #288. Mounts between a
 * game-tile click on /hub/training and the actual GodModeArena render.
 * Surfaces the "session goal + your 30-day stats + difficulty/timer/scope
 * controls + Start Training" pattern from the May 8 training-overhaul handoff.
 *
 * Data sources:
 *   - `training_dashboard_30day_stats(uuid, text)` RPC (shipped in
 *     supabase/migrations/20260510175000_training_dashboard_rpcs.sql /
 *     marker TRAIN-DB-DASHBOARD-1).
 *   - `training_dashboard_last_session(uuid, text)` for the (hidden by
 *     default) "Last session" recap row.
 *
 * Persistence:
 *   - Last difficulty / timer / scope is persisted in
 *     localStorage under key `sp-train-prefs-${gameId}`, so returning users
 *     resume their preferred setup automatically.
 *
 * Styling:
 *   - Uses the sp-* utility classes registered by TRAIN-CSS-SWEEP-1 and
 *     TRAIN-CSS-TYPO-1 (`sp-card`, `sp-cta-primary`, `sp-h2`, `sp-stack-*`,
 *     `sp-skeleton-line`, etc.) so it inherits the global training theme
 *     and a11y guardrails (touch targets ≥44pt, :focus-visible rings,
 *     prefers-reduced-motion respect).
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby on the title.
 *   - ESC dismisses; focus traps within the modal while open.
 *   - All option pills are real <button> elements with aria-pressed.
 *
 * Author: shipped 2026-05-10 (issue #288 closed).
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeTrainingSessionConfig } from '../../lib/training/sessionConfigContract.mjs';
import {
  resolvePresetForGame,
  loadTrainingPreferences,
  saveTrainingPreferences,
  resetTrainingPreferences,
  VARIANT_METADATA,
} from '../../lib/training/trainingPresets.mjs';
import TrainingGameArt from './TrainingGameArt';

const DIFFICULTY_OPTIONS = [
  { id: 'beginner', label: 'Beginner', desc: 'Generous tolerances' },
  { id: 'standard', label: 'Standard', desc: 'Full GTO' },
  { id: 'expert',   label: 'Expert',   desc: 'Tight EV bands' },
];

// GTOW's timebank is 7 / 15 / 25 seconds. Ours was No timer / 60s / 15s, so
// "Standard" gave four times the thinking time the reference product allows
// and the fast option was its middle tier.
const TIMER_OPTIONS = [
  { id: 'relaxed',  label: 'Relaxed',  desc: 'No timer' },
  { id: 'standard', label: 'Standard', desc: '25s' },
  { id: 'quick',    label: 'Quick',    desc: '15s' },
  { id: 'blitz',    label: 'Blitz',    desc: '7s' },
];

const SCOPE_OPTIONS = [
  { id: 'full',   label: 'Full Hand', desc: 'Preflop to River' },
  { id: 'spot',   label: 'Spot',      desc: 'Specific Node' },
  { id: 'street', label: 'Street',    desc: 'Single Street' },
];

const STREET_OPTIONS = [
  { id: 'preflop', label: 'Preflop', desc: 'Opening Round' },
  { id: 'flop',    label: 'Flop',    desc: 'Three Cards' },
  { id: 'turn',    label: 'Turn',    desc: 'Fourth Card' },
  { id: 'river',   label: 'River',   desc: 'Final Card' },
];

const TABLE_OPTIONS = [
  { id: '1', label: '1 Table', desc: 'Single focus' },
  { id: '2', label: '2 Tables', desc: 'Split screen' },
  { id: '4', label: '4 Tables', desc: 'Mass multi-table' },
];

// GTOW parity #7 · HAND SELECTION.
// The server applies this choice to answer-bearing canonical questions before
// it creates and signs the immutable attempt. The browser receives only the
// filtered blind DTO, so it must preserve the exact server-owned hand count.
// These ids are shared with questionSelectionContract.mjs.
const HAND_SELECTION_OPTIONS = [
  { id: 'all',        label: 'All hands',   desc: 'Nothing filtered' },
  { id: 'no-trivial', label: 'Skip trivial', desc: 'Drop pure spots' },
  { id: 'close',      label: 'Close only',  desc: 'Tight decisions' },
];

const VARIANT_OPTIONS = [
  { id: 'nlh',  label: "Hold'em",    desc: '2 Cards · NL' },
  { id: 'plo4', label: 'PLO4',       desc: '4 Cards · PL' },
  { id: 'plo5', label: 'PLO5',       desc: '5 Cards · PL' },
  { id: 'plo6', label: 'PLO6',       desc: '6 Cards · PL' },
  { id: 'plo8', label: 'PLO8 Hi-Lo', desc: '4 Cards · Hi-Lo 8+' },
];

const BETTING_STRUCTURE_OPTIONS = [
  { id: 'no_limit',    label: 'No-Limit',    desc: 'All-In Allowed' },
  { id: 'pot_limit',   label: 'Pot-Limit',   desc: 'Capped At Pot' },
  { id: 'fixed_limit', label: 'Fixed-Limit', desc: '1 BB / 2 BB Cap 4' },
];

const FORMAT_OPTIONS = [
  { id: 'cash',  label: '6-Max Cash', desc: '100 BB Ring' },
  { id: 'mtt',   label: 'MTT ICM',    desc: '35 BB + Ante' },
  { id: 'spins', label: '3-Max Spins', desc: '20 BB Hyper' },
  { id: 'hu',    label: 'Heads-Up',   desc: '40 BB 1v1' },
];


function readPrefs(gameId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`sp-train-prefs-${gameId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

function writePrefs(gameId, prefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`sp-train-prefs-${gameId}`, JSON.stringify(prefs));
  } catch (_) { /* quota / private mode: ignore */ }
}

function formatRelative(iso) {
  if (!iso) return null;
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return 'just now';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch (_) { return null; }
}

export default function SessionSetupModal({
  isOpen,
  onClose,
  onStart,
  game,
  userId,
}) {
  const gameId = game?.id || game?.slug || '';
  const [difficulty, setDifficulty] = useState('standard');
  const [timer,      setTimer]      = useState('relaxed');
  const [scope,      setScope]      = useState('full');
  const [targetStreet, setTargetStreet] = useState('flop');
  const [tables,     setTables]     = useState('1');
  const [handSelection, setHandSelection] = useState('all');
  const [variant, setVariant] = useState('nlh');
  const [bettingStructure, setBettingStructure] = useState('no_limit');
  const [format, setFormat] = useState('cash');

  const [stats,       setStats]       = useState(null);
  const [lastSession, setLastSession] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [statsError,  setStatsError]  = useState(null);

  const closeBtnRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  // The modal stays mounted while users move between all 107 cards. useState's
  // initializer therefore only ever saw the first render's empty game id and
  // never loaded the selected game's saved preferences. Rehydrate on each
  // actual open/game transition and reject stale/out-of-vocabulary values.
  useEffect(() => {
    if (!isOpen || !gameId) return;
    const rawSaved = readPrefs(gameId) || loadTrainingPreferences(gameId, userId);
    const canonical = resolvePresetForGame(game || gameId, rawSaved);
    const saved = normalizeTrainingSessionConfig({ ...canonical, ...rawSaved });
    setDifficulty(saved.difficulty);
    setTimer(saved.timer);
    setScope(saved.scope);
    setTargetStreet(saved.targetStreet || 'flop');
    setTables(saved.tables);
    setHandSelection(saved.handSelection);
    setVariant(canonical.variant || 'nlh');
    setBettingStructure(canonical.bettingStructure || 'no_limit');
    setFormat(canonical.format || 'cash');
  }, [isOpen, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePreset = useMemo(() => {
    return resolvePresetForGame(game || gameId, {
      difficulty,
      timer,
      scope,
      targetStreet,
      tables,
      handSelection,
      variant,
      bettingStructure,
      format,
    });
  }, [game, gameId, difficulty, timer, scope, targetStreet, tables, handSelection, variant, bettingStructure, format]);

  const handleVariantChange = useCallback((nextVariant) => {
    setVariant(nextVariant);
    const meta = VARIANT_METADATA[nextVariant] || VARIANT_METADATA.nlh;
    if (!meta.allowedStructures.includes(bettingStructure)) {
      setBettingStructure(meta.defaultStructure);
    }
  }, [bettingStructure]);

  const handleResetDefaults = useCallback(() => {
    const defaults = resetTrainingPreferences(gameId, userId);
    setDifficulty(defaults.difficulty);
    setTimer(defaults.timer);
    setScope(defaults.scope);
    setTargetStreet(defaults.targetStreet || 'flop');
    setTables(defaults.tables);
    setHandSelection(defaults.handSelection);
    setVariant(defaults.variant);
    setBettingStructure(defaults.bettingStructure);
    setFormat(defaults.format);
  }, [gameId, userId]);

  // Pull the 30-day stats + last session from the RPCs shipped in PR #303.
  useEffect(() => {
    if (!isOpen || !userId || !gameId) return;
    let cancelled = false;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setStats(null);
    setLastSession(null);
    setStatsError(null);

    Promise.all([
      supabase
        .rpc('training_dashboard_30day_stats', { p_user_id: userId, p_game_id: gameId })
        .abortSignal(controller.signal),
      supabase
        .rpc('training_dashboard_last_session', { p_user_id: userId, p_game_id: gameId })
        .abortSignal(controller.signal),
    ]).then(([statsRes, lastRes]) => {
      if (cancelled) return;
      if (statsRes?.error || lastRes?.error) {
        throw new Error('Verified performance history is temporarily unavailable.');
      }
      if (!Array.isArray(statsRes?.data) || !Array.isArray(lastRes?.data)) {
        throw new Error('Verified performance history returned an invalid response.');
      }
      if (statsRes.data[0]) {
        setStats(statsRes.data[0]);
      }
      if (lastRes.data[0]) {
        setLastSession(lastRes.data[0]);
      }
    }).catch((historyError) => {
      if (cancelled) return;
      setStats(null);
      setLastSession(null);
      setStatsError(controller.signal.aborted
        ? 'Verified performance history timed out. Please try again.'
        : historyError?.message || 'Verified performance history is temporarily unavailable.');
    })
      .finally(() => {
        window.clearTimeout(deadline);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [isOpen, userId, gameId]);

  // ESC dismisses, Tab is trapped inside the dialog, and focus returns to the
  // game card that opened it. The old comment promised a focus trap but the
  // implementation only focused Close once, allowing the next Tab to escape
  // into the obscured Training Hub.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter((element) => !element.hasAttribute('aria-hidden'));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    const t = setTimeout(() => { closeBtnRef.current?.focus(); }, 50);
    return () => {
      window.removeEventListener('keydown', handleKey);
      clearTimeout(t);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        previous.focus();
      }
    };
  }, [isOpen, onClose]);

  const handleStart = useCallback(() => {
    const prefs = normalizeTrainingSessionConfig({
      difficulty: activePreset.difficulty,
      timer: activePreset.timer,
      scope: activePreset.scope,
      targetStreet: activePreset.targetStreet,
      speed: 'normal',
      tables: activePreset.tables,
      feedbackRule: 'every',
      autoAdvanceUI: 'off',
      autoAdvance: false,
      handSelection: activePreset.handSelection,
      variant: activePreset.variant,
      bettingStructure: activePreset.bettingStructure,
      format: activePreset.format,
    });
    if (gameId) {
      writePrefs(gameId, prefs);
      saveTrainingPreferences(gameId, prefs, userId);
    }
    onStart?.({ game, ...prefs });
  }, [game, gameId, userId, activePreset, onStart]);

  if (!isOpen || !game) return null;

  const finiteOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const sessionsCount = finiteOrNull(stats?.sessions_count);
  const hands         = finiteOrNull(stats?.hands_played);
  const avgAccuracy   = finiteOrNull(stats?.avg_score);

  const lastRel       = lastSession?.created_at ? formatRelative(lastSession.created_at) : null;
  const lastAccuracy  = finiteOrNull(lastSession?.accuracy);
  const lastHands     = finiteOrNull(lastSession?.hands_played);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-setup-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(2, 7, 13, 0.84)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(env(safe-area-inset-top, 0px), 16px) 16px max(env(safe-area-inset-bottom, 0px), 16px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="sp-card-lg sp-setup-console"
        style={{
          width: '100%',
          maxWidth: 600,
          maxHeight: '92dvh',
          overflowY: 'auto',
          position: 'relative',
          background: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
          border: '2px solid transparent',
          borderRadius: 16,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), 0 24px 64px rgba(0,0,0,0.75)',
          padding: 18,
        }}
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Back to training"
          className="sp-cta sp-cta-ghost sp-setup-close"
          style={{
            position: 'absolute', top: 12, right: 12,
            padding: '6px 14px', fontSize: 13, fontWeight: 700,
            minHeight: 44,
            borderRadius: 10,
            border: '2px solid transparent',
            background: 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
            color: '#f3f7fb',
            zIndex: 4,
          }}
        >
          ← Back
        </button>

        <div className="sp-setup-layout" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <aside className="sp-setup-identity" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              className="sp-setup-art sp-setup-art-btn"
              data-setup-art-launch={gameId}
              onClick={handleStart}
              aria-label={`Start ${game.name || game.title || 'Training Session'}`}
              style={{
                display: 'block',
                width: '100%',
                padding: 0,
                borderRadius: 12,
                overflow: 'hidden',
                border: '2px solid transparent',
                background: '#03111d padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
                maxHeight: 165,
                position: 'relative',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <TrainingGameArt
                gameId={gameId}
                sizes="(max-width: 700px) 92vw, 600px"
                loading="eager"
              />
              <div className="sp-setup-art-shade" />
              <div className="sp-setup-live"><span /> Live Training System</div>
            </button>

            <header className="sp-stack-1 sp-setup-title">
              <div className="sp-caption" style={{ color: '#83deff', fontWeight: 700 }}>Mission Configuration</div>
              <h2 id="sp-setup-title" className="sp-h2" style={{ margin: '2px 0' }}>{game.name || game.title || 'Training Session'}</h2>
              <p className="sp-body-sm" style={{ margin: 0 }}>{game.focus || 'Configure the table, then sharpen the decisions that matter.'}</p>
              {(game.level || game.tier) && (
                <div className="sp-caption">
                  {game.tier ? game.tier : null}
                  {game.tier && game.level ? ' · ' : null}
                  {game.level ? `Level ${game.level}` : null}
                </div>
              )}
            </header>

            <section
              className="sp-card sp-stack-1"
              data-preset-summary-card="true"
              aria-label="Active training preset"
              style={{
                padding: '12px 14px',
                borderRadius: 7,
                border: '1px solid #688299',
                borderTopColor: '#aec0d0',
                background: 'linear-gradient(180deg, #13253a 0%, #091727 65%, #060e18 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div className="sp-h4" style={{ color: '#83deff', margin: 0 }}>Active Preset</div>
                <button
                  type="button"
                  data-reset-preset-defaults="true"
                  onClick={handleResetDefaults}
                  style={{
                    minHeight: 34,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 7,
                    border: '1px solid #688299',
                    borderTopColor: '#aec0d0',
                    background: 'linear-gradient(180deg, #13253a 0%, #060e18 100%)',
                    color: '#d9edf7',
                    cursor: 'pointer',
                  }}
                >
                  Reset To Defaults
                </button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f4fbff', marginTop: 4 }}>
                {activePreset.summary}
              </div>
              <div className="sp-caption" style={{ color: '#b7cede', marginTop: 2 }}>
                {activePreset.ruleSummary} · {activePreset.legalSizingLabel}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={handleStart}
                  className="sp-cta sp-cta-primary"
                  style={{
                    width: '100%',
                    minHeight: 46,
                    borderRadius: 7,
                    border: '1px solid #56d8ff',
                    borderTopColor: '#b3eaff',
                    background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                    color: '#f4fbff',
                    fontWeight: 800,
                  }}
                >
                  Start Training →
                </button>
              </div>
            </section>

            <section className="sp-card sp-stack-1 sp-setup-goal" aria-label="Session goal" style={{ borderRadius: 7, border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, #13253a 0%, #060e18 100%)', padding: '10px 14px' }}>
              <div className="sp-h4">Session Goal</div>
              <div className="sp-body-sm">
                Score ≥85% To Advance{game.level ? ` To Level ${Number(game.level) + 1}` : ''}.
              </div>
            </section>

            <section className="sp-card sp-stack-2 sp-setup-performance" aria-label="Your performance over the last 30 days" style={{ borderRadius: 7, border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, #13253a 0%, #060e18 100%)', padding: '10px 14px' }}>
              <div className="sp-h4">Your Performance · 30 Days</div>
              <div className="sp-cluster sp-cluster-4" style={{ justifyContent: 'space-between' }}>
                <Stat label="Avg Accuracy" value={loading || statsError ? null : avgAccuracy} unit="%" />
                <Stat label="Sessions" value={loading ? null : sessionsCount} />
                <Stat label="Hands" value={loading ? null : hands} />
              </div>
              {statsError && (
                <div role="status" className="sp-caption" style={{ marginTop: 4, color: '#86daff' }}>
                  Performance History Unavailable · No Score Or Session Count Was Inferred.
                </div>
              )}
              {lastSession && (
                <div className="sp-caption" style={{ marginTop: 4 }}>
                  Last Accuracy: <span className="sp-num-tabular">{lastAccuracy != null ? `${lastAccuracy}%` : '-'}</span>
                  {lastHands != null ? ` · ${lastHands} Hands` : ''}
                  {lastRel ? ` · ${lastRel}` : ''}
                </div>
              )}
            </section>
          </aside>

          <section className="sp-setup-config" aria-label="Training configuration">
            <details
              className="sp-mtt-disclosure"
              data-advanced-settings-disclosure="true"
              style={{
                borderRadius: 7,
                border: '1px solid #688299',
                borderTopColor: '#aec0d0',
                background: 'linear-gradient(180deg, #13253a 0%, #091727 45%, #060e18 100%)',
                padding: '10px 14px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#e9f8ff',
                  padding: '6px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Advanced Settings</span>
                <span style={{ fontSize: 12, color: '#83deff', fontWeight: 600 }}>Variant · Structure · Format · Timer</span>
              </summary>
              <div className="sp-mtt-disclosure__body" style={{ marginTop: 12 }}>
                <div className="sp-setup-config-heading" style={{ marginBottom: 10 }}>
                  <div>
                    <span>Training Control Deck</span>
                    <strong>Configure Your Session</strong>
                  </div>
                  <span>Settings Save Automatically</span>
                </div>

                <div className="sp-setup-field-grid">
                  <SetupField title="Poker Variant" wide><PillRow options={VARIANT_OPTIONS} value={variant} onChange={handleVariantChange} name="variant" /></SetupField>
                  <SetupField title="Betting Structure" wide><PillRow options={BETTING_STRUCTURE_OPTIONS} value={bettingStructure} onChange={setBettingStructure} name="bettingStructure" /></SetupField>
                  <SetupField title="Format" wide><PillRow options={FORMAT_OPTIONS} value={format} onChange={setFormat} name="format" /></SetupField>
                  <SetupField title="Difficulty"><PillRow options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} name="difficulty" /></SetupField>
                  <SetupField title="Timer"><PillRow options={TIMER_OPTIONS} value={timer} onChange={setTimer} name="timer" /></SetupField>
                  <SetupField title="Game Scope"><PillRow options={SCOPE_OPTIONS} value={scope} onChange={setScope} name="scope" /></SetupField>
                  {scope === 'street' && (
                    <SetupField title="Target Street" wide><PillRow options={STREET_OPTIONS} value={targetStreet} onChange={setTargetStreet} name="targetStreet" tile /></SetupField>
                  )}
                  <SetupField title="Tables"><PillRow options={TABLE_OPTIONS} value={tables} onChange={setTables} name="tables" /></SetupField>
                  <SetupField title="Feedback"><div className="sp-caption"><strong>After Every Answer</strong><br />Correct And Incorrect Results Stay Visible.</div></SetupField>
                  <SetupField title="Hand Advance"><div className="sp-caption"><strong>Manual Next Required</strong><br />Click Next When You Finish Reviewing.</div></SetupField>
                  <SetupField title="Hand Selection"><PillRow options={HAND_SELECTION_OPTIONS} value={handSelection} onChange={setHandSelection} name="handSelection" /></SetupField>
                </div>
              </div>
            </details>

            <div className="sp-setup-launch" style={{ marginTop: 14 }}>
              <div><span>Ready Status</span><strong>Table Systems Online</strong></div>
              <button
                type="button"
                onClick={handleStart}
                className="sp-cta sp-cta-primary"
                style={{
                  borderRadius: 7,
                  border: '1px solid #56d8ff',
                  borderTopColor: '#b3eaff',
                  background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                  color: '#f4fbff',
                }}
              >
                Start Training →
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SetupField({ title, wide = false, children }) {
  return (
    <fieldset className={`sp-card sp-stack-2 sp-setup-field${wide ? ' is-wide' : ''}`}>
      <legend className="sp-h4">{title}</legend>
      {children}
    </fieldset>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="sp-stack-1" style={{ flex: 1, minWidth: 80, textAlign: 'center' }}>
      <div className="sp-caption">{label}</div>
      {value == null ? (
        <span className="sp-skeleton-line" style={{ height: 22, maxWidth: 60, margin: '0 auto' }} />
      ) : (
        <div className="sp-h3 sp-num-tabular">
          {value}{unit ? <span className="sp-caption" style={{ marginLeft: 2 }}>{unit}</span> : null}
        </div>
      )}
    </div>
  );
}

function PillRow({ options, value, onChange, name, tile = false }) {
  return (
    <div
      className="sp-cluster sp-cluster-2"
      role="radiogroup"
      aria-label={name}
      style={{ width: '100%' }}
    >
      {options.map(opt => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            className={`sp-cta ${isActive ? 'sp-cta-primary' : 'sp-cta-secondary'}`}
            style={{
              flex: 1,
              minWidth: tile ? 100 : 72,
              padding: tile ? '10px 8px' : '8px 12px',
              flexDirection: 'column',
              gap: 2,
              fontSize: 12,
              fontWeight: isActive ? 700 : 600,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</span>
            <span className="sp-caption" style={{ opacity: 0.85 }}>{opt.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
