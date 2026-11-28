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
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import {
  handFieldOf,
  heroPositionOf,
  playerActionOf,
  streetOf,
} from '../../../src/lib/training/handHistoryEntry';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';




import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
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
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sd-panel ${at.rowCard}`}
    >
      <button
        type="button"
        className={at.rowHead}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={at.rowIcon} aria-hidden>✕</span>
        <span style={{ minWidth: 0 }}>
          <strong className={at.white} style={{ display: 'block' }}>
            {mistake.position} · {mistake.street}
          </strong>
          <span className={at.small}>
            {mistake.gameName} · {formatDate(mistake.timestamp)}
          </span>
        </span>
        <strong className={at.down}>-{mistake.evLoss} BB</strong>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className={at.small} aria-hidden>
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.standard }}
            style={{ overflow: 'hidden' }}
          >
            <div className={at.rowBody}>
              <div className={`${at.metrics} ${at.metrics2}`}>
                <div className={`sd-metric ${at.metric}`}>
                  <span className={at.metricLabel}>You Chose</span>
                  <strong className={at.metricValue} data-tone="down" style={{ fontSize: '1.1rem' }}>{mistake.yourAction}</strong>
                </div>
                <div className={`sd-metric ${at.metric}`}>
                  <span className={at.metricLabel}>Correct</span>
                  <strong className={at.metricValue} data-tone="up" style={{ fontSize: '1.1rem' }}>{mistake.correctAction}</strong>
                </div>
              </div>
              <div className={`${at.metrics} ${at.metrics2}`}>
                <button
                  type="button"
                  className="sd-button sd-primary"
                  data-drill-similar-spot-cta="true"
                  onClick={() => onPractice(mistake)}
                >
                  Practice This Spot
                </button>
                <button
                  type="button"
                  className="sd-button"
                  onClick={() => {
                    const q = new URLSearchParams({
                      position: mistake.position || '',
                      street: mistake.street || '',
                      action: mistake.yourAction || '',
                      correct: mistake.correctAction || '',
                    });
                    window.location.href = `/hub/training/jarvis?context=mistake&${q.toString()}`;
                  }}
                >
                  Get GTO Coaching
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
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
    router.push(buildCustomTrainingArenaHref({
      gameId: mistake.gameId,
      format: 'cash',
      position: mistake.position,
      street: mistake.street.toLowerCase(),
    }, 'replay-theater'));
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
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={at.shell}>
        <TrainingPageHead slug="training-replay-theater" note="Review And Learn From Your Mistakes" />

        <div className={at.page}>

          {/* Stats */}
          <div className={`${at.metrics} ${at.metrics2}`}>
            <div className={`sd-metric ${at.metric}`}>
              <strong className={at.metricValue} data-tone={filteredMistakes.length > 0 ? 'down' : undefined}>
                {filteredMistakes.length}
              </strong>
              <span className={at.metricLabel}>Mistakes</span>
            </div>
            <div className={`sd-metric ${at.metric}`}>
              <strong className={at.metricValue} data-tone={Number(totalEVLoss) > 0 ? 'down' : undefined}>
                {(Number.isFinite(Number(totalEVLoss)) ? Number(totalEVLoss) : 0).toFixed(1)}
              </strong>
              <span className={at.metricLabel}>Total EV Loss (BB)</span>
            </div>
          </div>

          <section className={`sd-panel ${at.panel}`} aria-label="Mistake Filters">
            {/* Position Filter */}
            <div className={at.field}>
              <span className={at.label}>Position</span>
              <div className={at.segmented} role="group" aria-label="Position Filter">
                {['all', ...POSITION_LABELS].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="sd-button"
                    aria-label={`Filter by position ${p === 'all' ? 'All' : p}`}
                    aria-pressed={filter === p}
                    onClick={() => setFilter(p)}
                  >
                    {p === 'all' ? 'All' : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Street Filter */}
            <div className={at.field}>
              <span className={at.label}>Street</span>
              <div className={at.segmented} role="group" aria-label="Street Filter">
                {['all', ...STREET_LABELS].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="sd-button"
                    aria-label={`Filter by street ${s === 'all' ? 'All' : s}`}
                    aria-pressed={streetFilter === s}
                    onClick={() => setStreetFilter(s)}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Loading */}
          {loading && (
            <div role="status" aria-label="Loading Mistakes" className={at.list}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`sd-panel ${at.skeleton}`} aria-hidden />
              ))}
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
              <section className={`sd-panel ${at.panelHead}`} aria-labelledby="rt-leak-title">
                <div>
                  <h2 id="rt-leak-title" className={at.label}>Biggest Leak</h2>
                  <strong className={at.subTitle} style={{ display: 'block' }}>{worstLeak[0]}</strong>
                  <span className={at.small}>{worstLeak[1].count} Mistakes · <span className={at.down}>{worstLeak[1].evLoss.toFixed(1)} BB Lost</span></span>
                </div>
                <button
                  type="button"
                  className="sd-button sd-primary"
                  onClick={() => {
                    const [pos, street] = worstLeak[0].split(' · ');
                    const sourceMistake = filteredMistakes.find(
                      (mistake) => mistake.position === pos && mistake.street === street,
                    );
                    router.push(buildCustomTrainingArenaHref({
                      gameId: sourceMistake?.gameId,
                      format: 'cash',
                      position: pos,
                      street: street.toLowerCase(),
                    }, 'replay-theater'));
                  }}
                >
                  Drill This
                </button>
              </section>
            );
          })()}

          {/* Mistakes */}
          {!loading && filteredMistakes.length > 0 && (
            <div className={at.list}>
              {filteredMistakes.map((m) => (
                <MistakeCard key={m.id} mistake={m} onPractice={handlePractice} />
              ))}
            </div>
          )}

          {!loading && filteredMistakes.length === 0 && (
            <TrainerEmptyState
              variant="complete"
              title="No Mistakes Found"
              message={mistakes.length === 0
                ? 'Complete Some Training Sessions First.'
                : 'Try Adjusting Your Filters.'}
              compact
            />
          )}
          {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
