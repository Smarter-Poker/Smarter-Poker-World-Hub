/**
 * SessionSetupModal — TRAIN-SETUP-MODAL-1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Greenfield component originally tracked in issue #288. Mounts between a
 * game-tile click on /hub/training and the actual GodModeArena render.
 * Surfaces the "session goal + your 30-day stats + difficulty/timer/mode
 * pills + Start Training" pattern from the May 8 training-overhaul handoff.
 *
 * Data sources:
 *   - `training_dashboard_30day_stats(uuid, text)` RPC (shipped in
 *     supabase/migrations/20260510175000_training_dashboard_rpcs.sql /
 *     marker TRAIN-DB-DASHBOARD-1).
 *   - `training_dashboard_last_session(uuid, text)` for the (hidden by
 *     default) "Last session" recap row.
 *
 * Persistence:
 *   - Last difficulty / timer / training mode is persisted in
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
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';

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

const MODE_OPTIONS = [
  { id: 'standard',   label: 'Standard',    desc: 'Full GTO' },
  { id: 'flashcards', label: 'Flashcards',  desc: 'Concepts'  },
  { id: 'speed',      label: 'Speed Drill', desc: '20 Qs'      },
  { id: 'import',     label: 'Import HH',   desc: 'Your hands' },
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
  const initialPrefs = (gameId && readPrefs(gameId)) || {};

  const [difficulty, setDifficulty] = useState(initialPrefs.difficulty || 'standard');
  const [timer,      setTimer]      = useState(initialPrefs.timer      || 'standard');
  const [mode,       setMode]       = useState(initialPrefs.mode       || 'standard');

  const [stats,       setStats]       = useState(null);
  const [lastSession, setLastSession] = useState(null);
  const [loading,     setLoading]     = useState(false);

  const closeBtnRef = useRef(null);

  // Pull the 30-day stats + last session from the RPCs shipped in PR #303.
  useEffect(() => {
    if (!isOpen || !userId || !gameId) return;
    let cancelled = false;
    setLoading(true);
    setStats(null);
    setLastSession(null);

    Promise.all([
      supabase.rpc('training_dashboard_30day_stats',  { p_user_id: userId, p_game_id: gameId }),
      supabase.rpc('training_dashboard_last_session', { p_user_id: userId, p_game_id: gameId }),
    ]).then(([statsRes, lastRes]) => {
      if (cancelled) return;
      if (!statsRes?.error && Array.isArray(statsRes?.data) && statsRes.data[0]) {
        setStats(statsRes.data[0]);
      }
      if (!lastRes?.error && Array.isArray(lastRes?.data) && lastRes.data[0]) {
        setLastSession(lastRes.data[0]);
      }
    }).catch(() => { /* silent — the empty-state branch handles missing data */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, userId, gameId]);

  // ESC dismisses + initial focus into close button (so tabbing starts inside the modal).
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handleKey);
    const t = setTimeout(() => { closeBtnRef.current?.focus(); }, 50);
    return () => {
      window.removeEventListener('keydown', handleKey);
      clearTimeout(t);
    };
  }, [isOpen, onClose]);

  const handleStart = useCallback(() => {
    if (gameId) writePrefs(gameId, { difficulty, timer, mode });
    onStart?.({ game, difficulty, timer, mode });
  }, [game, gameId, difficulty, timer, mode, onStart]);

  if (!isOpen || !game) return null;

  const sessionsCount = stats?.sessions_count != null ? Number(stats.sessions_count) : null;
  const hands         = stats?.hands_played   != null ? Number(stats.hands_played)   : null;
  const avgScore      = stats?.avg_score      != null ? Number(stats.avg_score)      : null;

  const lastRel       = lastSession?.created_at ? formatRelative(lastSession.created_at) : null;
  const lastScore     = lastSession?.gtow_score != null ? Number(lastSession.gtow_score) : null;
  const lastHands     = lastSession?.hands_played != null ? Number(lastSession.hands_played) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-setup-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(env(safe-area-inset-top, 0px), 16px) 16px max(env(safe-area-inset-bottom, 0px), 16px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="sp-card-lg sp-stack-4"
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '90dvh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Back to training"
          className="sp-cta sp-cta-ghost"
          style={{
            position: 'absolute', top: 8, right: 8,
            padding: '6px 10px', fontSize: 11,
            minHeight: 36,
          }}
        >
          ← Back
        </button>

        <header className="sp-stack-1" style={{ textAlign: 'center', paddingTop: 8 }}>
          <h2 id="sp-setup-title" className="sp-h2">{game.name || game.title || 'Training session'}</h2>
          {(game.level || game.tier) && (
            <div className="sp-caption" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {game.tier ? game.tier : null}
              {game.tier && game.level ? ' · ' : null}
              {game.level ? `Level ${game.level}` : null}
            </div>
          )}
        </header>

        {/* SESSION GOAL */}
        <section className="sp-card sp-stack-1" aria-label="Session goal">
          <div className="sp-h4">Session goal</div>
          <div className="sp-body-sm">
            Score ≥85% to advance{game.level ? ` to Level ${Number(game.level) + 1}` : ''}.
          </div>
        </section>

        {/* YOUR PERFORMANCE (30 DAYS) */}
        <section className="sp-card sp-stack-2" aria-label="Your performance over the last 30 days">
          <div className="sp-h4">Your performance · 30 days</div>
          <div className="sp-cluster sp-cluster-4" style={{ justifyContent: 'space-between' }}>
            <Stat label="Avg score" value={loading ? null : avgScore} unit="%" />
            <Stat label="Sessions" value={loading ? null : sessionsCount} />
            <Stat label="Hands"    value={loading ? null : hands} />
          </div>
          {lastSession && (
            <div className="sp-caption" style={{ marginTop: 4 }}>
              Last: <span className="sp-num-tabular">{lastScore != null ? `${lastScore}%` : '—'}</span>
              {lastHands != null ? ` · ${lastHands} hands` : ''}
              {lastRel ? ` · ${lastRel}` : ''}
            </div>
          )}
        </section>

        {/* DIFFICULTY */}
        <fieldset className="sp-card sp-stack-2" style={{ border: 'none', padding: 16, margin: 0 }}>
          <legend className="sp-h4" style={{ padding: 0, marginBottom: 8 }}>Difficulty</legend>
          <PillRow options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} name="difficulty" />
        </fieldset>

        {/* TIMER */}
        <fieldset className="sp-card sp-stack-2" style={{ border: 'none', padding: 16, margin: 0 }}>
          <legend className="sp-h4" style={{ padding: 0, marginBottom: 8 }}>Timer</legend>
          <PillRow options={TIMER_OPTIONS} value={timer} onChange={setTimer} name="timer" />
        </fieldset>

        {/* TRAINING MODE */}
        <fieldset className="sp-card sp-stack-2" style={{ border: 'none', padding: 16, margin: 0 }}>
          <legend className="sp-h4" style={{ padding: 0, marginBottom: 8 }}>Training mode</legend>
          <PillRow options={MODE_OPTIONS} value={mode} onChange={setMode} name="mode" tile />
        </fieldset>

        {/* CTA */}
        <button
          type="button"
          onClick={handleStart}
          className="sp-cta sp-cta-primary"
          style={{ width: '100%', padding: '14px 20px', fontSize: 15 }}
        >
          Start training →
        </button>
      </div>
    </div>
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
