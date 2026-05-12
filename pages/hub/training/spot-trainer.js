/**
 * Spot Trainer — Postflop GTO Decision Drills
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 20: Rapid-fire quiz for postflop GTO decisions. Users are shown a
 * solver-verified spot and must choose the correct action.
 *
 * Route: /hub/training/spot-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-ADOPT-4 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-5 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import Card, { parseCards } from '../../../src/components/training/Card';
import { authedFetch } from '../../../src/lib/authUtils';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import QuizAnswer from '../../../src/components/poker/QuizAnswer';
// TRAIN-WIRE-FX-4a — adoption: feedback hook for spot-trainer.fresh.js

function saveSession(payload) {
  authedFetch('/api/training/save-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FORMAT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'cash', label: 'Cash' },
  { value: 'mtt', label: 'MTT' },
];

const POSITION_OPTIONS = [
  { value: '', label: 'Any Pos' },
  { value: 'BTN', label: 'BTN' },
  { value: 'CO', label: 'CO' },
  { value: 'HJ', label: 'HJ' },
  { value: 'MP', label: 'MP' },
  { value: 'SB', label: 'SB' },
  { value: 'BB', label: 'BB' },
];


// ═══════════════════════════════════════════════════════════════════════════
// HAND DISPLAY — hero hand rendered as PNG card images
// ═══════════════════════════════════════════════════════════════════════════

function HandBadge({ hand }) {
  if (!hand) return null;
  const cards = parseCards(hand);
  if (!cards || cards.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
      {cards.map((c, i) => (
        <Card key={i} rank={c.rank} suit={c.suit} size="small" />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SpotTrainerPage() {
  const router = useRouter();
  const bus = useTrainingBus('spot-trainer');
  const fb = useTrainingFeedback();

  // State
  const [spot, setSpot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // Filters
  const [format, setFormat] = useState('');
  const [position, setPosition] = useState('');

  // Stats
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalDrills, setTotalDrills] = useState(0);
  const [correctDrills, setCorrectDrills] = useState(0);
  const [sessionStart] = useState(Date.now());

  const autoNextTimer = useRef(null);
  const questionStartRef = useRef(Date.now());
  const sessionHandHistory = useRef([]);

  // Fetch a random spot
  const fetchSpot = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setShowResult(false);
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);

    try {
      const params = new URLSearchParams();
      if (format) params.set('format', format);
      if (position) params.set('position', position);

      const res = await authedFetch(`/api/training/spot-drill?${params.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();

      if (data.success) {
        setSpot(data.spot);
        questionStartRef.current = Date.now(); // Reset answer timer when spot loads
      } else if (data.retry) {
        // Spot had no data, retry
        setTimeout(fetchSpot, 200);
      } else {
        setError(data.error || 'Failed to load spot');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [format, position]);

  // Load first spot on mount
  useEffect(() => {
    fetchSpot();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle answer selection
  const handleAnswer = useCallback(
    (action) => {
      if (showResult || !spot) return;

      const responseTimeMs = Date.now() - questionStartRef.current;
      setSelected(action);
      setShowResult(true);
      setTotalDrills((prev) => prev + 1);

      const isCorrect = action === spot.gtoAction;
      if (isCorrect) fb.correct(); else fb.incorrect();

      // Record per-question detail for session granularity
      sessionHandHistory.current.push({
        hand: spot.heroHand,
        board: spot.board,
        position: spot.heroPosition,
        correct_action: spot.gtoAction,
        selected_action: action,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        street: spot.street,
        stack_depth: spot.stackDepth,
      });

      if (isCorrect) {
        setCorrectDrills((prev) => prev + 1);
        setStreak((prev) => {
          const newStreak = prev + 1;
          setBestStreak((best) => Math.max(best, newStreak));
          if (bus?.emitStreakUpdate) bus.emitStreakUpdate(newStreak);
          return newStreak;
        });
        if (bus?.emitDecisionCorrect) bus.emitDecisionCorrect();
      } else {
        setStreak(0);
        if (bus?.emitDecisionIncorrect) bus.emitDecisionIncorrect();
        if (bus?.emitStreakUpdate) bus.emitStreakUpdate(0);
      }

      // Emit answer speed for Leak Detection analysis
      if (bus?.emitAnswerSpeed)
        bus.emitAnswerSpeed(responseTimeMs, {
          is_correct: isCorrect,
          position: spot?.heroPosition,
          street: spot?.street,
        });

      // Emit card viewed for card exposure tracking
      if (bus?.emitCardViewed) bus.emitCardViewed(spot.board);

      // Save session with per-question detail
      saveSession({
        game_id: 'spot-trainer',
        hands_played: 1,
        accuracy: isCorrect ? 100 : 0,
        correct_answers: isCorrect ? 1 : 0,
        total_questions: 1,
        handHistory: sessionHandHistory.current.slice(-100),
      });

      // Emit bus event for cross-page sync (session-dashboard, position-mastery)
      try {
        eventBus?.emit?.(
          'training:spot-drilled',
          {
            action,
            isCorrect,
            position: spot?.heroPosition,
            format: spot?.gameType,
            responseTimeMs,
          },
          'SpotTrainer'
        );
        eventBus?.emit?.('training:drill-complete', {}, 'SpotTrainer');
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

      // Reset question timer and auto-next after 2 seconds
      autoNextTimer.current = setTimeout(() => {
        questionStartRef.current = Date.now();
        fetchSpot();
      }, 2000);
    },
    [showResult, spot, bus, fetchSpot]
  );

  // Clean up timer
  useEffect(() => {
    return () => {
      if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    };
  }, []);

  const accuracy = totalDrills > 0 ? Math.round((correctDrills / totalDrills) * 100) : 0;
  const elapsed = Math.floor((Date.now() - sessionStart) / 60000);

  return (
    <>
      <Head>
        <title>Spot Trainer | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Drill postflop GTO decisions with solver-verified spots. Test your skills with rapid-fire action selection."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div data-pills-row
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              &larr; Training
            </button>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Spot Trainer
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-accent-orange)',
                background: 'rgba(249,115,22,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(249,115,22,0.2)',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              PHASE 20
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: '16px 24px', maxWidth: 600, margin: '0 auto' }}>
          {/* Stats Bar */}
          <div data-pills-row
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 14,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {[
              { label: 'Streak', value: streak, color: streak >= 5 ? 'var(--sp-accent-green)' : 'var(--sp-accent-orange)' },
              { label: 'Best', value: bestStreak, color: 'var(--sp-accent-purple)' },
              {
                label: 'Accuracy',
                value: `${accuracy}%`,
                color: accuracy >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
              },
              { label: 'Drills', value: totalDrills, color: 'var(--sp-accent-cyan)' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center', flex: '1 1 60px' }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 900,
                    color: stat.color,
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'var(--sp-fg-dim)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter Controls */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            {/* Format */}
            <div style={{ display: 'flex', gap: 3 }}>
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setFormat(opt.value);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      format === opt.value
                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                        : 'rgba(255,255,255,0.06)',
                    color: format === opt.value ? '#fff' : 'var(--sp-fg-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Position */}
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {POSITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setPosition(opt.value);
                  }}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      position === opt.value
                        ? 'linear-gradient(135deg, #f97316, #ef4444)'
                        : 'rgba(255,255,255,0.06)',
                    color: position === opt.value ? '#fff' : 'var(--sp-fg-muted)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: 'var(--sp-accent-red)',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              {error}
              <button
                onClick={fetchSpot}
                style={{
                  marginLeft: 12,
                  background: 'rgba(249,115,22,0.2)',
                  border: '1px solid rgba(249,115,22,0.4)',
                  borderRadius: 6,
                  padding: '4px 12px',
                  color: 'var(--sp-accent-orange)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && !spot && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--sp-fg-dim)',
                fontFamily: "'Orbitron', monospace",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              LOADING SPOT...
            </div>
          )}

          {/* Spot Display */}
          <AnimatePresence mode="wait">
            {spot && (
              <motion.div
                key={spot.id + spot.heroHand}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Spot Info Bar */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: 'var(--sp-accent-orange)',
                        background: 'rgba(249,115,22,0.1)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      {spot.heroPosition}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--sp-fg-muted)',
                        background: 'rgba(255,255,255,0.04)',
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {spot.street}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      {spot.stackDepth}BB {spot.gameType?.replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    onClick={fetchSpot}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '5px 10px',
                      color: 'var(--sp-fg-muted)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    Skip
                  </button>
                </div>

                {/* Board Cards */}
                <div
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    marginBottom: 14,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1.5,
                      marginBottom: 10,
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    BOARD
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    {spot.board.map((card, i) => (
                      <Card
                        key={i}
                        rank={card[0]?.toUpperCase()}
                        suit={card[1]?.toLowerCase()}
                        size="small"
                      />
                    ))}
                  </div>

                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1.5,
                      marginBottom: 8,
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    YOUR HAND
                  </div>
                  <HandBadge hand={spot.heroHand} />
                </div>

                {/* Question */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--sp-fg)',
                    textAlign: 'center',
                    marginBottom: 14,
                  }}
                >
                  What is the GTO play?
                </div>

                {/* Action Buttons */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {/* TRAIN-WIRE-QUIZ-ANSWER-6 — options via shared QuizAnswer (preserves 2-col grid from parent) */}
                  {spot.options.map((action, i) => (
                    <QuizAnswer
                      key={action}
                      label={action}
                      shortcut={i + 1}
                      selected={selected === action}
                      correct={action === spot.gtoAction}
                      show={showResult}
                      onClick={() => handleAnswer(action)}
                      ariaLabel={`Choose ${action}`}
                      size="md"
                      fullWidth
                    >
                      {showResult && action === spot.gtoAction ? (
                        <span style={{ marginLeft: 6, fontSize: 11 }}>({spot.gtoFrequency}%)</span>
                      ) : null}
                    </QuizAnswer>
                  ))}
                </div>

                {/* Result Feedback */}
                <AnimatePresence>
                  {showResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        background:
                          selected === spot.gtoAction
                            ? 'rgba(34,197,94,0.1)'
                            : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${selected === spot.gtoAction ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 10,
                        padding: '12px 16px',
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          marginBottom: 6,
                          color: selected === spot.gtoAction ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {selected === spot.gtoAction ? 'CORRECT' : 'INCORRECT'}
                      </div>

                      {/* Action Breakdown */}
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'var(--sp-fg-dim)',
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        GTO Frequencies
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(spot.actionBreakdown || {})
                          .sort(([, a], [, b]) => b - a)
                          .map(([action, freq]) => (
                            <span
                              key={action}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: action === spot.gtoAction ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)',
                                background:
                                  action === spot.gtoAction
                                    ? 'rgba(34,197,94,0.1)'
                                    : 'rgba(255,255,255,0.04)',
                                padding: '3px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {action}: {freq}%
                            </span>
                          ))}
                      </div>

                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--sp-fg-dim)',
                          marginTop: 6,
                        }}
                      >
                        Next spot in 2s...
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Next Button (manual override) */}
                {showResult && (
                  <button
                    onClick={fetchSpot}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      background: 'linear-gradient(135deg, #f97316, #ef4444)',
                      border: 'none',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    Next Spot
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* About Section */}
          <div
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              About Spot Trainer
            </div>
            <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
              Rapid-fire postflop GTO drills using solver-verified spots. Each spot shows you a
              board texture, your hand, and 4 action options. Choose the highest-frequency GTO play
              to build your streak. Filter by format and position to target specific leaks. The GTO
              frequency breakdown is shown after each answer.
            </p>
          </div>
        </div>

      </div>
    </>
  );
}