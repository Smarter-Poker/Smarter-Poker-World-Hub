/**
 * REPLAY THEATER — Mistake Review & Practice
 * ═══════════════════════════════════════════════════════════════════════════
 * Browse and replay past mistakes from training sessions.
 * Shows original scenario, your answer, correct GTO action.
 *
 * Route: /hub/training/replay-theater
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-49 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import {
  handFieldOf,
  heroPositionOf,
  playerActionOf,
  streetOf,
} from '../../../src/lib/training/handHistoryEntry';

// TRAIN-CSS-MOTION-ADOPT-23 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-9a — adoption: shared empty-state primitive

// ═══════════════════════════════════════════════════════════════════════════
// MISTAKE RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

const POSITION_LABELS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const STREET_LABELS = ['Preflop', 'Flop', 'Turn', 'River'];
const MISTAKE_CLASSES = new Set(['inaccuracy', 'wrong', 'blunder', 'mistake']);

function displayAction(action) {
  if (typeof action !== 'string' || !action.trim()) return 'Not Recorded';
  return action
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mistakesFromSessions(sessions) {
  const mistakes = [];
  if (!sessions) return mistakes;

  sessions.forEach((s) => {
    const gameLabel = (s.game_id || 'unknown')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const history = Array.isArray(s.hand_history) ? s.hand_history : [];

    history.forEach((entry, index) => {
      const classification = String(handFieldOf(entry, 'classification') || '').toLowerCase();
      const yourAction = playerActionOf(entry) || handFieldOf(entry, 'selectedAction');
      const correctAction = handFieldOf(entry, 'correctAction')
        || handFieldOf(entry, 'correctAnswer')
        || handFieldOf(entry, 'optimalAction');
      const actionsDisagree = yourAction && correctAction
        && displayAction(yourAction) !== displayAction(correctAction);
      if (!MISTAKE_CLASSES.has(classification) && !actionsDisagree) return;

      const rawEVLoss = Number(handFieldOf(entry, 'evLoss'));
      const recordedAt = handFieldOf(entry, 'timestamp') || s.created_at;
      const street = streetOf(entry);

      mistakes.push({
        id: `${s.id}-${handFieldOf(entry, 'handNumber') || index}`,
        gameId: s.game_id || 'unknown',
        gameName: gameLabel,
        position: heroPositionOf(entry),
        street: street ? displayAction(street) : 'Unknown',
        yourAction: displayAction(yourAction),
        correctAction: displayAction(correctAction),
        evLoss: Number.isFinite(rawEVLoss) ? Math.max(0, rawEVLoss) : 0,
        classification: classification || 'mistake',
        timestamp: new Date(recordedAt).getTime() || new Date(s.created_at).getTime(),
        sessionId: s.id,
      });
    });
  });

  return mistakes.sort((a, b) => b.timestamp - a.timestamp);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
// MISTAKE CARD
// ═══════════════════════════════════════════════════════════════════════════

function MistakeCard({ mistake, onPractice }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 8,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(239,68,68,0.08)',
      }}
    >
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileTap={{ scale: 0.99 }}
        style={{
          width: '100%',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            ✕
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>
              {mistake.position} · {mistake.street}
            </div>
            <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
              {mistake.gameName} · {formatDate(mistake.timestamp)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
            -{mistake.evLoss} BB
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}
          >
            ▼
          </motion.span>
        </div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.standard }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.1)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    YOU CHOSE
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                    {mistake.yourAction}
                  </div>
                </div>
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.1)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    CORRECT
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sp-accent-green)' }}>
                    {mistake.correctAction}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onPractice(mistake)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,212,255,0.2)',
                    background: 'rgba(0,212,255,0.06)',
                    color: 'var(--sp-accent-cyan)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Practice This Spot
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const q = new URLSearchParams({
                      position: mistake.position || '',
                      street: mistake.street || '',
                      action: mistake.yourAction || '',
                      correct: mistake.correctAction || '',
                    });
                    window.location.href = `/hub/training/jarvis?context=mistake&${q.toString()}`;
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 8,
                    border: '1px solid rgba(168,85,247,0.2)',
                    background: 'rgba(168,85,247,0.06)',
                    color: 'var(--sp-accent-purple)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Get GTO Coaching
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ReplayTheaterPage() {
  const router = useRouter();
  useTrainingBus('replay-theater');
  const [loading, setLoading] = useState(true);
  const [mistakes, setMistakes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [streetFilter, setStreetFilter] = useState('all');
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setFetchError(null);
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=200`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        const mistakeSessions = data.sessions
          .filter((session) => Number(session.mistake_count) > 0)
          .slice(0, 50);
        const details = await Promise.all(mistakeSessions.map(async (session) => {
          const detailRes = await authedFetch(`/api/training/get-sessions?sessionId=${encodeURIComponent(session.id)}`);
          if (!detailRes.ok) return null;
          const detail = await detailRes.json();
          return detail.success ? detail.session : null;
        }));
        setMistakes(mistakesFromSessions(details.filter(Boolean)));
      }
    } catch (e) {
      console.warn('[ReplayTheater] Error:', e);
      setFetchError('Failed to load replay data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  const handlePractice = (mistake) => {
    const params = new URLSearchParams({
      format: 'cash',
      positions: mistake.position,
      streets: mistake.street.toLowerCase(),
    });
    router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);
  };

  const filteredMistakes = mistakes.filter((m) => {
    if (filter !== 'all' && m.position !== filter) return false;
    if (streetFilter !== 'all' && m.street !== streetFilter) return false;
    return true;
  });

  const totalEVLoss = filteredMistakes.reduce((s, m) => s + m.evLoss, 0);

  return (
    <>
      <Head>
        <title>Replay Theater | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Replay Theater</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              Review And Learn From Your Mistakes
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: '14px',
                borderRadius: 12,
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.1)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                {filteredMistakes.length}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                MISTAKES
              </div>
            </div>
            <div
              style={{
                padding: '14px',
                borderRadius: 12,
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.1)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                {(Number.isFinite(Number(totalEVLoss)) ? Number(totalEVLoss) : 0).toFixed(1)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                TOTAL EV LOSS (BB)
              </div>
            </div>
          </div>

          {/* Position Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto' }}>
            {['all', ...POSITION_LABELS].map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.95 }}
                aria-label={`Filter by position ${p === 'all' ? 'All' : p}`}
                aria-pressed={filter === p}
                onClick={() => setFilter(p)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  flexShrink: 0,
                  border: `1px solid ${filter === p ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: filter === p ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: filter === p ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p === 'all' ? 'All' : p}
              </motion.button>
            ))}
          </div>

          {/* Street Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['all', ...STREET_LABELS].map((s) => (
              <motion.button
                key={s}
                whileTap={{ scale: 0.95 }}
                aria-label={`Filter by street ${s === 'all' ? 'All' : s}`}
                aria-pressed={streetFilter === s}
                onClick={() => setStreetFilter(s)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  flex: 1,
                  border: `1px solid ${streetFilter === s ? 'rgba(168,85,247,0.2)' : 'transparent'}`,
                  background: streetFilter === s ? 'rgba(168,85,247,0.06)' : 'transparent',
                  color: streetFilter === s ? 'var(--sp-accent-purple)' : 'var(--sp-fg-dim)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {s === 'all' ? 'All' : s}
              </motion.button>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="card" count={3} />
            </div>
          )}

          {/* Worst Leak Summary */}
          {!loading && filteredMistakes.length > 0 && (() => {
            const leakMap = {};
            filteredMistakes.forEach(m => {
              const key = `${m.position} · ${m.street}`;
              if (!leakMap[key]) leakMap[key] = { count: 0, evLoss: 0 };
              leakMap[key].count++;
              leakMap[key].evLoss += m.evLoss;
            });
            const worstLeak = Object.entries(leakMap || {}).sort((a, b) => b[1].count - a[1].count)[0];
            if (!worstLeak) return null;
            return (
              <div style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.1)',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Biggest Leak</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-red)' }}>{worstLeak[0]}</div>
                  <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)', marginTop: 2 }}>{worstLeak[1].count} Mistakes · {worstLeak[1].evLoss.toFixed(1)} BB Lost</div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const [pos, street] = worstLeak[0].split(' · ');
                    const params = new URLSearchParams({ format: 'cash', positions: pos, streets: street.toLowerCase() });
                    router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: 'rgba(0,212,255,0.06)',
                    border: '1px solid rgba(0,212,255,0.2)',
                    color: 'var(--sp-accent-cyan)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Drill This
                </motion.button>
              </div>
            );
          })()}

          {/* Mistakes */}
          {!loading &&
            filteredMistakes.map((m) => (
              <MistakeCard key={m.id} mistake={m} onPractice={handlePractice} />
            ))}

          {!loading && filteredMistakes.length === 0 && (
            <TrainerEmptyState
              variant="complete"
              title="No mistakes found"
              message={mistakes.length === 0
                ? 'Complete some training sessions first.'
                : 'Try adjusting your filters.'}
              compact
            />
          )}
        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}
      <ConnectionToast />
    </>
  );
}
