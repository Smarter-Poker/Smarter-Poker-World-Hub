/**
 * QUICK WARMUP — 5-Minute Speed Session
 * ═══════════════════════════════════════════════════════════════════════════
 * Instant 5-minute timed session — no setup, no choices. Mixes questions
 * from weakest areas + random variety. Designed for pre-session warmups.
 *
 * Route: /hub/training/quick-warmup
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-42 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-34 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

const GodModeArena = dynamic(() => import('../../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: '#0a0a1a',
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

// ═══════════════════════════════════════════════════════════════════════════
// WARMUP CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const WARMUP_DURATION = 300; // 5 minutes in seconds
const WARMUP_GAMES = [
  { id: 'cash-preflop', name: 'Preflop Opens' },
  { id: 'cash-bb-defense', name: 'BB Defense' },
  { id: 'cash-cbet', name: 'C-Betting' },
  { id: 'cash-turn-play', name: 'Turn Play' },
  { id: 'cash-river-bluffs', name: 'River Decisions' },
  { id: 'cash-threeBet-spots', name: '3-Bet Pots' },
];

const POSITION_GAMES = [
  { id: 'cash-bb-defense', name: 'BB Defense' },
  { id: 'cash-btn-play', name: 'BTN Play' },
  { id: 'cash-sb-3bet', name: 'SB 3-Bet' },
  { id: 'cash-co-opens', name: 'CO Opens' },
  { id: 'cash-preflop', name: 'Preflop Opens' },
];

const POSTFLOP_GAMES = [
  { id: 'cash-cbet', name: 'C-Betting' },
  { id: 'cash-turn-play', name: 'Turn Play' },
  { id: 'cash-river-bluffs', name: 'River Decisions' },
  { id: 'cash-probe-bets', name: 'Probe Bets' },
  { id: 'cash-delayed-cbet', name: 'Delayed C-Bet' },
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function QuickWarmupPage() {
  const router = useRouter();
  useTrainingBus('quick-warmup');
  const [phase, setPhase] = useState('ready'); // ready | playing | results
  const [timeLeft, setTimeLeft] = useState(WARMUP_DURATION);
  const [selectedGame, setSelectedGame] = useState(null);
  const [results, setResults] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [warmupMode, setWarmupMode] = useState('auto');
  const timerRef = useRef(null);
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

  // Time's up
  useEffect(() => {
    if (timeLeft === 0 && phase === 'playing') {
      setPhase('results');
    }
  }, [timeLeft, phase]);

  const startWarmup = () => {
    const game = selectWarmupGame(sessions, warmupMode);
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

  const handleArenaExit = () => {
    clearInterval(timerRef.current);
    if (timeLeft < WARMUP_DURATION - 10) {
      // User played at least 10 seconds
      setResults({
        accuracy: 0,
        questionsAnswered: 0,
        timeUsed: WARMUP_DURATION - timeLeft,
        game: selectedGame,
      });
      setPhase('results');
    } else {
      setPhase('ready');
    }
  };

  // Active arena with timer overlay
  if (phase === 'playing' && selectedGame) {
    return (
      <div style={{ position: 'relative' }}>
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
              fontSize: 18,
              fontWeight: 900,
              color: timeLeft <= 30 ? '#fff' : 'var(--sp-accent-cyan)',
              fontFamily: "'Inter', monospace",
            }}
          >
            {formatTime(timeLeft)}
          </div>
        </div>
        <GodModeArena
          userId={getAuthUser()?.id || `anon-${Date.now()}`}
          gameId={selectedGame.id}
          gameName={`Warmup: ${selectedGame.name}`}
          level={1}
          sessionId={`warmup-${Date.now()}`}
          onComplete={handleArenaComplete}
          onExit={handleArenaExit}
        />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Quick Warmup | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
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
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>5-minute speed session</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
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
                ⚡
              </motion.div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--sp-fg)', marginBottom: 8 }}>
                Quick Warmup
              </div>
              <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', lineHeight: 1.6, marginBottom: 6 }}>
                5 minutes. No setup. No choices.
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 20 }}>
                We&apos;ll auto-pick your weakest area and drill it.
              </div>

              {/* Warmup mode selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, justifyContent: 'center' }}>
                {[
                  { id: 'auto', label: 'Auto', desc: 'Weakest area', icon: '🎯' },
                  { id: 'position', label: 'Positions', desc: 'BB/BTN focus', icon: '♠️' },
                  { id: 'postflop', label: 'Postflop', desc: 'Flop-Turn-River', icon: '🃏' },
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
                          fontSize: 11,
                          fontWeight: 700,
                          color: isActive ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
                        }}
                      >
                        {mode.label}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)', marginTop: 2 }}>
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
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  HOW IT WORKS
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', lineHeight: 1.7 }}>
                  1. Timer starts at 5:00
                  <br />
                  2. Answer GTO questions as fast as you can
                  <br />
                  3. Game auto-selects your weakest area
                  <br />
                  4. See your speed + accuracy results
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
                {results?.accuracy >= 80 ? '🔥' : results?.accuracy >= 60 ? '👍' : '💪'}
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
                  <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
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
                  <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
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
                  <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
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
      <ConnectionToast />
    </>
  );
}
