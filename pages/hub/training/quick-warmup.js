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
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const BOARD_CARDS = ['Qs', '7d', '2c'];

const pillButtonStyle = (active) => ({
  padding: '7px 12px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  border: active ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.16)',
  background: active
    ? 'linear-gradient(180deg, rgba(8,145,178,0.75), rgba(3,50,74,0.92))'
    : 'rgba(255,255,255,0.05)',
  color: active ? '#e8fbff' : '#cbd5e1',
});

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
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);

  const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
  const boardCards = BOARD_CARDS;

  const brainEval = useMemo(
    () =>
      evaluateTrainingSpotWithHorseBrain({
        variant: activeVariant,
        street: 'flop',
        heroCards,
        boardCards,
        pot: 6.5,
        toCall: 2.2,
        effectiveStackBb,
      }),
    [activeVariant, heroCards, boardCards, effectiveStackBb]
  );

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        { gameId: activeVariant === 'nlh' ? 'psy-001' : 'cash-005', variant: activeVariant },
        'quick-warmup'
      ),
    [activeVariant]
  );

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
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 100,
            padding: '8px 14px',
            borderRadius: 10,
            background: timeLeft <= 30 ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.8)',
            border: `1px solid ${timeLeft <= 30 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              fontSize: timeLeft === 0 ? 12 : 18,
              fontWeight: 900,
              color: timeLeft <= 30 ? '#fff' : 'var(--sp-accent-cyan)',
              fontFamily: "'Inter', monospace",
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
      <div
        style={{
          minHeight: '100dvh',
          background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Quick Warmup</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>5-Minute Speed Session</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {brainEval && (
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              style={{
                marginBottom: 20,
                padding: 18,
                borderRadius: 12,
                border: '1px solid rgba(56,189,248,0.40)',
                background: 'rgba(15,23,42,0.82)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: '#67e8f9', textTransform: 'uppercase' }}>
                  Horse Brain Session &amp; Mindset Coaching Panel
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                  {`Engine: ${brainEval.engineModule} · Recommended: ${brainEval.correctAnswerText}`}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                    Variant
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-variant-option={v}
                        onClick={() => setActiveVariant(v)}
                        style={pillButtonStyle(activeVariant === v)}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 5 }}>
                    Risk / Stack Profile
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[20, 40, 100, 200].map((stk) => (
                      <button
                        key={stk}
                        type="button"
                        data-stack-option={stk}
                        onClick={() => setEffectiveStackBb(stk)}
                        style={pillButtonStyle(effectiveStackBb === stk)}
                      >
                        {stk} BB
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 14 }}>
                {brainEval.explanation}
              </div>

              <button
                type="button"
                data-launch-club-arena-cta="true"
                data-launch-href={arenaHref}
                onClick={() => router.push(arenaHref)}
                style={{
                  display: 'inline-flex',
                  minHeight: 44,
                  alignItems: 'center',
                  padding: '0 18px',
                  borderRadius: 8,
                  border: '1px solid #67e8f9',
                  background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Launch Calibrated Drill In Club Arena →
              </button>
            </div>
          )}

          {/* READY STATE */}
          {phase === 'ready' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center', padding: '40px 20px' }}
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ fontSize: 60, marginBottom: 20 }}
              >

              </motion.div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--sp-fg)', marginBottom: 8 }}>
                Quick Warmup
              </div>
              <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', lineHeight: 1.6, marginBottom: 6 }}>
                5 Minutes. No Setup. No Choices.
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 20 }}>
                We&apos;Ll Auto-Pick Your Weakest Area And Drill It.
              </div>

              {/* Warmup mode selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, justifyContent: 'center' }}>
                {[
                  { id: 'auto', label: 'Auto', desc: 'Weakest area', icon: '◆' },
                  { id: 'position', label: 'Positions', desc: 'BB/BTN focus', icon: '♠' },
                  { id: 'postflop', label: 'Postflop', desc: 'Flop-Turn-River', icon: '◇' },
                ].map((mode) => {
                  const isActive = (warmupMode || 'auto') === mode.id;
                  return (
                    <motion.button
                      key={mode.id}
                      whileTap={{ scale: 0.95 }}
                      aria-label={`Select warmup: ${mode.label}`}
                      aria-pressed={isActive}
                      onClick={() => setWarmupMode(mode.id)}
                      style={{
                        flex: 1,
                        padding: '12px 8px',
                        borderRadius: 10,
                        border: `1px solid ${isActive ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        background: isActive ? 'rgba(0,212,255,0.08)' : 'rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{mode.icon}</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isActive ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
                        }}
                      >
                        {mode.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginTop: 2 }}>
                        {mode.desc}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={startWarmup}
                style={{
                  padding: '16px 48px',
                  borderRadius: 14,
                  border: 'none',
                  background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 6px 30px rgba(0,212,255,0.3)',
                  letterSpacing: 0.5,
                }}
              >
                START
              </motion.button>

              <div
                style={{
                  marginTop: 30,
                  padding: '12px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  HOW IT WORKS
                </div>
                <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.7 }}>
                  1. Five-Minute Clock Tracks Your Pace
                  <br />
                  2. Answer GTO Questions As Fast As You Can
                  <br />
                  3. Game Auto-Selects Your Weakest Area
                  <br />
                  4. Finish The Signed Arena To See Verified Results
                </div>
              </div>
            </motion.div>
          )}

          {/* RESULTS STATE */}
          {phase === 'results' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: 'center', padding: '20px 0' }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {results?.accuracy >= 80 ? '▲' : results?.accuracy >= 60 ? '✓' : '▲'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--sp-fg)', marginBottom: 4 }}>
                Warmup Complete
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 24 }}>
                {results?.game?.name || 'GTO Training'}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    padding: '16px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: (results?.accuracy || 0) >= 75 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
                    }}
                  >
                    {results?.accuracy || 0}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                    ACCURACY
                  </div>
                </div>
                <div
                  style={{
                    padding: '16px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sp-accent-cyan)' }}>
                    {results?.questionsAnswered || 0}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                    QUESTIONS
                  </div>
                </div>
                <div
                  style={{
                    padding: '16px 10px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sp-accent-purple)' }}>
                    {formatTime(results?.timeUsed || 0)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
                    TIME
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={startWarmup}
                  style={{
                    flex: 1,
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
                  Play Again
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push('/hub/training')}
                  style={{
                    padding: '14px 20px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--sp-fg-muted)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchSessions(); }} />}
      <HubPageSummary page="training-quick-warmup" />
      <ConnectionToast />
    </>
  );
}
