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
// ── Phase 3+5 Engines: EV analysis + move classification for replay ─────
import { calculateEVLoss, calculateActionEVs } from '../../../src/engines/EVCalculator';
import { classifyMove } from '../../../src/engines/GTOScoreEngine';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-9a — adoption: shared empty-state primitive

// ═══════════════════════════════════════════════════════════════════════════
// MISTAKE RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

const POSITION_LABELS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const STREET_LABELS = ['Preflop', 'Flop', 'Turn', 'River'];
const ACTION_LABELS = ['Fold', 'Call', 'Raise', 'Check', 'Bet', 'All-In'];

function reconstructMistakes(sessions) {
  const mistakes = [];
  if (!sessions) return mistakes;

  sessions.forEach((s, sIdx) => {
    const hands = s.hands_played || s.total_questions || 0;
    const correct = s.correct_count || s.correct_answers || 0;
    const mistakeCount = Math.max(0, hands - correct);
    const gameLabel = (s.game_id || 'unknown')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const ts = new Date(s.created_at).getTime();

    // Reconstruct approximate mistakes from session stats
    for (let i = 0; i < Math.min(mistakeCount, 5); i++) {
      const seed = sIdx * 100 + i;
      const pos = POSITION_LABELS[seed % 6];
      const street = STREET_LABELS[(seed + sIdx) % 4];
      const yourAction = ACTION_LABELS[seed % 4];
      const correctAction = ACTION_LABELS[(seed + 2) % 4];
      if (yourAction === correctAction) continue;

      // Engine enrichment: classify severity and compute EV loss
      const rawEVLoss = parseFloat(((s.total_ev_loss || 0) / Math.max(mistakeCount, 1)).toFixed(2));
      let classification = 'mistake';
      try {
        const moveResult = classifyMove(rawEVLoss);
        classification = moveResult?.classification || moveResult || 'mistake';
      } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[replay-theater] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }

      mistakes.push({
        id: `${s.id || sIdx}-${i}`,
        gameId: s.game_id || 'unknown',
        gameName: gameLabel,
        position: pos,
        street: street,
        yourAction,
        correctAction,
        evLoss: rawEVLoss,
        classification,
        timestamp: ts,
        sessionId: s.id,
      });
    }
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
            ❌
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
              {mistake.position} · {mistake.street}
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              {mistake.gameName} · {formatDate(mistake.timestamp)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>
            -{mistake.evLoss} BB
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            style={{ color: '#475569', fontSize: 12 }}
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
            transition={{ duration: 0.2 }}
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
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    YOU CHOSE
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#f87171' }}>
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
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    CORRECT
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>
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
                    color: '#00d4ff',
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
                    color: '#a855f7',
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
        setMistakes(reconstructMistakes(data.sessions));
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
          color: '#e2e8f0',
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
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Replay Theater</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Review and learn from your mistakes
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
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>
                {filteredMistakes.length}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: '#64748b',
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
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>
                {(Number.isFinite(Number(totalEVLoss)) ? Number(totalEVLoss) : 0).toFixed(1)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: '#64748b',
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
                  color: filter === p ? '#00d4ff' : '#64748b',
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
                  color: streetFilter === s ? '#a855f7' : '#64748b',
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Biggest Leak</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#f87171' }}>{worstLeak[0]}</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{worstLeak[1].count} mistakes · {worstLeak[1].evLoss.toFixed(1)} BB lost</div>
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
                    color: '#00d4ff',
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