/**
 * QUICK WARMUP - 5-Minute Speed Session
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Instant 5-minute timed session - no setup, no choices. Mixes questions
 * from weakest areas + random variety. Designed for pre-session warmups.
 *
 * Route: /hub/training/quick-warmup
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-42 - hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-34 - gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { normalizeTrainingSessionConfig } from '../../../src/lib/training/sessionConfigContract.mjs';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
const GodModeArena = dynamic(() => import('../../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
        background: '#040d18',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--sp-fg-dim)',
      }}
    >
      Loading Arena...
    </div>
  ),
});

// Quick Warmup is intentionally embedded, but it is still the same canonical,
// server-signed Arena. A fixed config avoids a second setup screen and prevents
// legacy pseudo-mode values from changing the delivery contract.
const WARMUP_ARENA_CONFIG = Object.freeze(normalizeTrainingSessionConfig({
  difficulty: 'standard',
  timer: 'standard',
  mode: 'standard',
  gameMode: 'full',
  tables: '1',
  handSelection: 'all',
}));

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// WARMUP CONFIG
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const WARMUP_DURATION = 300; // 5 minutes in seconds
const WARMUP_GAMES = [
  { id: 'cash-001', name: 'Preflop Blueprint' },
  { id: 'cash-003', name: 'Defense Matrix' },
  { id: 'cash-002', name: 'C-Bet Academy' },
  { id: 'cash-024', name: 'Pot Control' },
  { id: 'cash-012', name: 'River Decisions' },
  { id: 'cash-007', name: '3-Bet Pots' },
];

const POSITION_GAMES = [
  { id: 'cash-003', name: 'Defense Matrix' },
  { id: 'cash-006', name: 'Position Power' },
  { id: 'cash-018', name: 'Blind Vs Blind' },
  { id: 'cash-001', name: 'Preflop Blueprint' },
  { id: 'cash-007', name: '3-Bet Pots' },
];

const POSTFLOP_GAMES = [
  { id: 'cash-002', name: 'C-Bet Academy' },
  { id: 'cash-024', name: 'Pot Control' },
  { id: 'cash-012', name: 'River Decisions' },
  { id: 'cash-013', name: 'Probe Betting' },
  { id: 'cash-014', name: 'Check-Raise Art' },
];

function selectWarmupGame(sessions, mode) {
  const pool = mode === 'position' ? POSITION_GAMES : mode === 'postflop' ? POSTFLOP_GAMES : WARMUP_GAMES;
  if (!sessions || sessions.length === 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Prefer the user's weakest game from the pool
  const gameStats = {};
  sessions.forEach((s) => {
    const gid = s.game_id || '';
    if (!gameStats[gid]) gameStats[gid] = { hands: 0, correct: 0 };
    gameStats[gid].hands += s.hands_played || s.total_questions || 0;
    gameStats[gid].correct += s.correct_count || s.correct_answers || 0;
  });

  let weakest = pool[0];
  let lowestAcc = 100;
  pool.forEach((g) => {
    const st = gameStats[g.id];
    if (st && st.hands > 0) {
      const acc = (st.correct / st.hands) * 100;
      if (acc < lowestAcc) {
        lowestAcc = acc;
        weakest = g;
      }
    }
  });

  return weakest;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createWarmupRunId() {
  const randomUUID = globalThis?.crypto?.randomUUID;
  const suffix = typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `warmup-${suffix}`;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function QuickWarmupPage() {
  const router = useRouter();
  useTrainingBus('quick-warmup');
  const [phase, setPhase] = useState('ready'); // ready | playing | results
  const [timeLeft, setTimeLeft] = useState(WARMUP_DURATION);
  const [selectedGame, setSelectedGame] = useState(null);
  const [results, setResults] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [warmupMode, setWarmupMode] = useState('auto');
  const [arenaSessionId, setArenaSessionId] = useState(null);
  const timerRef = useRef(null);
  const [arenaUserId, setArenaUserId] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Fetch user data for weakness detection
  const fetchSessions = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) return;
    setFetchError(null);
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=50`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.warn('[QuickWarmup] Error:', e);
      setFetchError('Failed to load session data. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchSessions());
    return unsub;
  }, [fetchSessions]);

  // Timer countdown
  useEffect(() => {
    if (phase === 'playing') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [phase]);

  // At 0:00 the clock stops, but the signed Arena stays mounted until it can
  // return its authoritative completion totals. Unmounting here used to show a
  // fabricated 0% / 0-question result for players who had already answered.

  const startWarmup = () => {
    const user = getAuthUser();
    if (!user?.id) {
      router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath || '/hub/training/quick-warmup')}`);
      return;
    }
    const game = selectWarmupGame(sessions, warmupMode);
    setArenaSessionId(createWarmupRunId());
    setArenaUserId(user.id);
    setSelectedGame(game);
    setTimeLeft(WARMUP_DURATION);
    setResults(null);
    setPhase('playing');
  };

  const handleArenaComplete = (arenaResults) => {
    clearInterval(timerRef.current);
    setResults({
      accuracy: arenaResults?.accuracy || 0,
      questionsAnswered: arenaResults?.questionsAnswered || 0,
      timeUsed: WARMUP_DURATION - timeLeft,
      game: selectedGame,
    });
    setPhase('results');
  };

  // Active arena with timer overlay
  if (phase === 'playing' && selectedGame && arenaUserId && arenaSessionId) {
    return (
      <div style={{ position: 'relative' }}>
        <SEOHead
          title="5-Minute Pre-Session Poker Warmup"
          description="Calibrate Your Poker Decision Speed And Solver Accuracy Before Sitting Down At The Table With A Timed 5-Minute GTO Speed Warmup On Smarter.Poker."
          canonical="/hub/training/quick-warmup"
        />
        {/* Timer overlay */}
        <div
          className="sd-metric"
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 100,
            padding: '8px 14px',
            background: timeLeft <= 30 ? 'linear-gradient(180deg, #7a1c27, #3a0910)' : 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
          }}
        >
          <div
            style={{
              fontSize: timeLeft === 0 ? 12 : 18,
              fontWeight: 800,
              color: timeLeft <= 30 ? '#fff' : '#86daff',
              fontVariantNumeric: 'tabular-nums',
              maxWidth: timeLeft === 0 ? 170 : 'none',
              textAlign: 'center',
            }}
            role="status"
            aria-live="polite"
          >
            {timeLeft === 0
              ? 'Time Complete - Finish The Signed Arena For Verified Results'
              : formatTime(timeLeft)}
          </div>
        </div>
        <GodModeArena
          presetOnly
          key={`${arenaSessionId}:${selectedGame.id}`}
          userId={arenaUserId}
          gameId={selectedGame.id}
          gameName={`Warmup: ${selectedGame.name}`}
          level={1}
          sessionId={arenaSessionId}
          initialConfig={WARMUP_ARENA_CONFIG}
          onComplete={handleArenaComplete}
        />
        <HubPageSummary page="training-quick-warmup" />
      </div>
    );
  }

  return (
    <>
      <SEOHead
        title="5-Minute Pre-Session Poker Warmup"
        description="Calibrate Your Poker Decision Speed And Solver Accuracy Before Sitting Down At The Table With A Timed 5-Minute GTO Speed Warmup On Smarter.Poker."
        canonical="/hub/training/quick-warmup"
      />
      <div className={s.shell}>
        <TrainingPageHead slug="training-quick-warmup" note="5-Minute Speed Session" />

        <div className={s.page}>

          {/* READY STATE */}
          {phase === 'ready' && (
            <>
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`sd-panel ${s.panel}`}
                aria-labelledby="warmup-focus-title"
              >
                <h2 id="warmup-focus-title" className={s.sectionTitle}>Choose A Focus</h2>
                <p className={s.copy}>Choose A Focus Or Start With The Recommended Drill.</p>

                {/* Warmup mode selector */}
                <div className={s.metrics3} role="group" aria-label="Warmup Focus">
                  {[
                    { id: 'auto', label: 'Auto', desc: 'Weakest Area', icon: '◆' },
                    { id: 'position', label: 'Positions', desc: 'BB/BTN Focus', icon: '♠' },
                    { id: 'postflop', label: 'Postflop', desc: 'Flop-Turn-River', icon: '◇' },
                  ].map((mode) => {
                    const isActive = (warmupMode || 'auto') === mode.id;
                    return (
                      <motion.button
                        type="button"
                        key={mode.id}
                        whileTap={{ scale: 0.95 }}
                        className={`sd-button ${s.button}`}
                        aria-label={`Select warmup: ${mode.label}`}
                        aria-pressed={isActive}
                        onClick={() => setWarmupMode(mode.id)}
                        style={{ flexDirection: 'column', gap: 2, minHeight: 72, padding: '8px 4px' }}
                      >
                        <span aria-hidden style={{ fontSize: 16 }}>{mode.icon}</span>
                        <span style={{ fontSize: '1rem' }}>{mode.label}</span>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, opacity: 0.9 }}>{mode.desc}</span>
                      </motion.button>
                    );
                  })}
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={startWarmup}
                  className={`sd-button sd-primary ${s.button} ${s.primary} ${s.full}`}
                >
                  Start
                </motion.button>
              </motion.section>

              <section className={`sd-panel ${s.panel}`} aria-labelledby="warmup-how-title">
                <h2 id="warmup-how-title" className={s.subTitle}>How It Works</h2>
                <ol className={s.list} style={{ listStyle: 'decimal', paddingLeft: 20 }}>
                  <li className={s.copy} style={{ padding: '3px 0' }}>Five-Minute Clock Tracks Your Pace</li>
                  <li className={s.copy} style={{ padding: '3px 0' }}>Answer GTO Questions As Fast As You Can</li>
                  <li className={s.copy} style={{ padding: '3px 0' }}>Game Auto-Selects Your Weakest Area</li>
                  <li className={s.copy} style={{ padding: '3px 0' }}>Finish The Signed Arena To See Verified Results</li>
                </ol>
              </section>
            </>
          )}

          {/* RESULTS STATE */}
          {phase === 'results' && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`sd-panel ${s.panel}`}
              aria-labelledby="warmup-results-title"
            >
              <p className={s.eyebrow}>{results?.game?.name || 'GTO Training'}</p>
              <h2 id="warmup-results-title" className={s.sectionTitle}>Warmup Complete</h2>

              <div className={s.metrics3}>
                <div className={`sd-metric ${s.metric}`}>
                  <strong className={s.metricValue} data-tone={(results?.accuracy || 0) >= 75 ? 'up' : 'ice'}>{results?.accuracy || 0}%</strong>
                  <span className={s.metricLabel}>Accuracy</span>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <strong className={s.metricValue} data-tone="ice">{results?.questionsAnswered || 0}</strong>
                  <span className={s.metricLabel}>Questions</span>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <strong className={s.metricValue}>{formatTime(results?.timeUsed || 0)}</strong>
                  <span className={s.metricLabel}>Time</span>
                </div>
              </div>

              <div className={s.actions}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={startWarmup}
                  className={`sd-button sd-primary ${s.button}`}
                >
                  Play Again
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push('/hub/training')}
                  className={`sd-button ${s.button}`}
                >
                  Done
                </motion.button>
              </div>
            </motion.section>
          )}
          {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchSessions(); }} />}
        </div>
      </div>
      <HubPageSummary page="training-quick-warmup" />
      <ConnectionToast />
    </>
  );
}
