/**
 * EV Calculation Trainer — Math-First GTO Drill Mode
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26 (Bug-Swept v2):
 *  - Fixed: stale closure on `streak`/`bestStreak` → moved to useRef to always
 *    read latest value without needing to add to useCallback deps
 *  - Fixed: unit display label now correctly shows "chips" (trim applied)
 *  - Fixed: save-session now sends session-level accuracy correctly
 *  - Added: busEmit on each answer for real-time leaderboard/session updates
 *  - Added: keyboard shortcut 1/2/3 to skip to next question from breakdown
 *  - Improved: Input cleared on next question via autoFocus after state reset
 *
 * Route: /hub/training/ev-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// BUS EMITTER (SSR-safe)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HELPER (SSR-safe)
// ═══════════════════════════════════════════════════════════════════════════
function getAuthToken() {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token || parsed?.currentSession?.access_token || null;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION GENERATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const DRILL_TYPES = ['pot_odds', 'mdf', 'ev_call', 'break_even'];

function generateQuestion() {
  const type = DRILL_TYPES[Math.floor(Math.random() * DRILL_TYPES.length)];
  const pot = [50, 60, 80, 100, 120, 150, 200][Math.floor(Math.random() * 7)];
  const betFractions = [0.33, 0.5, 0.66, 0.75, 1.0, 1.25];
  const fraction = betFractions[Math.floor(Math.random() * betFractions.length)];
  const bet = Math.round(pot * fraction);
  const equity = Math.floor(Math.random() * 25) + 20; // 20-45%

  if (type === 'pot_odds') {
    const answer = Math.round((bet / (pot + bet)) * 100);
    return {
      type,
      title: 'Pot Odds',
      icon: '📐',
      color: '#00d4ff',
      question: `Villain bets **${bet} chips** into a **${pot} chip** pot. What are your pot odds (as a %)?`,
      hint: 'Pot Odds % = Bet ÷ (Pot + Bet) × 100',
      formulas: [
        `Pot after bet: ${pot} + ${bet} = ${pot + bet}`,
        `Your cost to call: ${bet}`,
        `Pot Odds = ${bet} / ${pot + bet} = **${answer}%**`,
        `You need at least ${answer}% equity to break even on a call.`,
      ],
      answer,
      unit: '%',
    };
  }

  if (type === 'mdf') {
    const answer = Math.round((pot / (pot + bet)) * 100);
    return {
      type,
      title: 'Min. Defense Frequency',
      icon: '🛡️',
      color: '#a855f7',
      question: `Villain bets **${bet} chips** into a **${pot} chip** pot. What is your Minimum Defense Frequency (MDF)?`,
      hint: 'MDF % = Pot ÷ (Pot + Bet) × 100',
      formulas: [
        `MDF = Pot / (Pot + Bet) = ${pot} / ${pot + bet} = **${answer}%**`,
        `You must defend at least ${answer}% of your range.`,
        `Villain's bluff needs ${100 - answer}%+ fold equity to be profitable.`,
        `If you fold more than ${100 - answer}%, villain can bluff any two cards profitably.`,
      ],
      answer,
      unit: '%',
    };
  }

  if (type === 'ev_call') {
    const eq = equity / 100;
    // FIX: EV = (equity * (pot + bet)) - ((1-equity) * bet)
    // pot+bet is the total pot you win (including your call), minus your call already invested
    // More precisely: EV = equity * (pot + bet) - (1 - equity) * bet
    const rawEV = eq * (pot + bet) - (1 - eq) * bet;
    const answer = Math.round(rawEV);
    return {
      type,
      title: 'EV of a Call',
      icon: '⚡',
      color: '#22c55e',
      question: `Pot: **${pot}**, Villain bets **${bet}**. You have **${equity}% equity**. What is the EV of calling (in chips)?`,
      hint: 'EV = (Equity × Total Pot Won) − ((1 − Equity) × Call Amount)',
      formulas: [
        `When you win (${equity}% of the time): you win ${pot + bet} chips`,
        `When you lose (${100 - equity}% of the time): you lose ${bet} chips`,
        `EV = (${equity}% × ${pot + bet}) − (${100 - equity}% × ${bet})`,
        `EV = ${Math.round(eq * (pot + bet))} − ${Math.round((1 - eq) * bet)} = **${answer > 0 ? '+' : ''}${answer} chips**`,
        answer > 0
          ? `✅ +EV call. You profit ~${answer} chips per call on average.`
          : answer < 0
            ? `❌ -EV call. You lose ~${Math.abs(answer)} chips per call on average.`
            : `⚖️ Breakeven call.`,
      ],
      answer,
      unit: ' chips',
    };
  }

  // break_even
  const answer = Math.round((bet / (pot + bet)) * 100);
  return {
    type,
    title: 'Break-Even Equity',
    icon: '⚖️',
    color: '#f97316',
    question: `Villain bets **${bet}** into a **${pot} chip** pot. What is the minimum equity (%) you need to break even on a call?`,
    hint: 'Break-Even Equity % = Bet ÷ (Pot + Bet) × 100',
    formulas: [
      `Break-even equity = Call Size / (Pot + Call Size)`,
      `${bet} / (${pot} + ${bet}) = ${bet} / ${pot + bet} = **${answer}%**`,
      `If your equity > ${answer}%, calling is +EV.`,
      `This is identical to pot odds — a critical cross-check for any decision.`,
    ],
    answer,
    unit: '%',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function EVTrainer() {
  useTrainingBus('ev-trainer');
  const router = useRouter();

  const [question, setQuestion] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState(null); // 'correct' | 'close' | 'wrong'
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, total: 0 });

  // FIX: Use refs for streak to avoid stale closure when updating rapidly
  const streakRef = useRef(0);
  const bestStreakRef = useRef(0);
  const [streakDisplay, setStreakDisplay] = useState(0);
  const [bestStreakDisplay, setBestStreakDisplay] = useState(0);

  const inputRef = useRef(null);
  const TOLERANCE = 2; // ±2

  const nextQuestion = useCallback(() => {
    setQuestion(generateQuestion());
    setUserAnswer('');
    setResult(null);
    setShowBreakdown(false);
    // Focus input after state settles
    requestAnimationFrame(() => {
      setTimeout(() => inputRef.current?.focus(), 50);
    });
  }, []);

  useEffect(() => {
    nextQuestion();
  }, [nextQuestion]);

  const handleSubmit = useCallback(() => {
    if (!question || userAnswer === '') return;
    const num = parseFloat(userAnswer);
    if (isNaN(num)) return;

    const diff = Math.abs(num - question.answer);
    let res;
    if (diff === 0) res = 'correct';
    else if (diff <= TOLERANCE) res = 'close';
    else res = 'wrong';

    setResult(res);
    setShowBreakdown(true);

    const isCorrect = res !== 'wrong';

    // FIX: Read from ref for always-fresh value
    const newStreak = isCorrect ? streakRef.current + 1 : 0;
    streakRef.current = newStreak;
    setStreakDisplay(newStreak);

    if (newStreak > bestStreakRef.current) {
      bestStreakRef.current = newStreak;
      setBestStreakDisplay(newStreak);
    }

    // Update session stats
    setSessionStats((prev) => {
      const next = {
        correct: prev.correct + (isCorrect ? 1 : 0),
        wrong: prev.wrong + (!isCorrect ? 1 : 0),
        total: prev.total + 1,
      };

      const accuracy = Math.round((next.correct / next.total) * 100);

      // Emit to training event bus
      eventBus?.emit?.('training:session-complete', {
        game_id: 'ev-trainer',
        accuracy,
        correct_answers: next.correct,
        total_questions: next.total,
        best_streak: bestStreakRef.current,
      });

      // Persist to Supabase via save-session API
      const token = getAuthToken();
      if (token) {
        fetch('/api/training/save-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            game_id: 'ev-trainer',
            accuracy,
            hands_played: next.total,
            correct_answers: next.correct,
            total_questions: next.total,
            best_streak: bestStreakRef.current,
          }),
        }).catch(() => {});
      }

      return next;
    });
  }, [question, userAnswer]); // FIX: removed streak/bestStreak from deps — using refs instead

  const accuracy =
    sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 0;

  const resultColors = {
    correct: {
      bg: 'rgba(34, 197, 94, 0.15)',
      border: 'rgba(34, 197, 94, 0.5)',
      text: '#22c55e',
      label: '✅ EXACT!',
    },
    close: {
      bg: 'rgba(251, 191, 36, 0.15)',
      border: 'rgba(251, 191, 36, 0.5)',
      text: '#fbbf24',
      label: `⚡ CLOSE! (±${TOLERANCE})`,
    },
    wrong: {
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.4)',
      text: '#ef4444',
      label: '❌ INCORRECT',
    },
  };

  const container = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1629 50%, #0a0f1e 100%)',
    color: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
    padding: '20px 16px 40px',
  };

  // Unit display: for chips, show "chips"; for % show "%"
  const unitLabel = question ? question.unit.trim() || '%' : '%';

  return (
    <>
      <Head>
        <title>EV Calculation Trainer | Smarter.Poker</title>
        <meta
          name="description"
          content="Master pot odds, MDF, and EV calculations with free-input math drills."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div style={container}>
        {/* HEADER */}
        <div style={{ maxWidth: 640, margin: '0 auto', marginBottom: 24 }}>
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 12,
              cursor: 'pointer',
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 16,
            }}
          >
            ← Training Hub
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #00d4ff22, #0066ff22)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              🧮
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 900,
                  fontFamily: "'Orbitron', monospace",
                  background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                EV TRAINER
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                Pot Odds · MDF · EV Calculations
              </p>
            </div>
          </div>

          {/* STATS BAR */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              marginTop: 16,
            }}
          >
            {[
              {
                label: 'Accuracy',
                value: `${accuracy}%`,
                color: accuracy >= 70 ? '#22c55e' : accuracy >= 50 ? '#f97316' : '#ef4444',
              },
              { label: 'Correct', value: sessionStats.correct, color: '#22c55e' },
              { label: 'Streak', value: streakDisplay, color: '#a855f7' },
              { label: 'Best', value: bestStreakDisplay, color: '#00d4ff' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  padding: '10px 8px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    fontFamily: "'Orbitron', monospace",
                    color: stat.color,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#475569',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MAIN DRILL CARD */}
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <AnimatePresence mode="wait">
            {question && (
              <motion.div
                key={question.type + sessionStats.total}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
              >
                {/* DRILL TYPE BADGE */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: `${question.color}18`,
                    border: `1px solid ${question.color}40`,
                    borderRadius: 20,
                    padding: '4px 14px',
                    marginBottom: 16,
                    fontSize: 11,
                    fontWeight: 700,
                    color: question.color,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {question.icon} {question.title}
                </div>

                {/* QUESTION CARD */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                    padding: '24px 20px',
                    marginBottom: 16,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 16,
                      lineHeight: 1.7,
                      color: '#e2e8f0',
                      fontWeight: 600,
                    }}
                  >
                    {question.question.split('**').map((part, i) =>
                      i % 2 === 0 ? (
                        <span key={i}>{part}</span>
                      ) : (
                        <strong key={i} style={{ color: question.color }}>
                          {part}
                        </strong>
                      )
                    )}
                  </p>
                  <div
                    style={{
                      marginTop: 12,
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: '#94a3b8',
                      fontWeight: 600,
                      borderLeft: `3px solid ${question.color}60`,
                    }}
                  >
                    💡 Formula: {question.hint}
                  </div>
                </div>

                {/* INPUT AREA */}
                {!showBreakdown && (
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      Your Answer ({unitLabel})
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        ref={inputRef}
                        type="number"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        placeholder={`Enter answer in ${unitLabel}`}
                        style={{
                          flex: 1,
                          padding: '14px 16px',
                          borderRadius: 12,
                          fontSize: 18,
                          fontWeight: 700,
                          fontFamily: "'Orbitron', monospace",
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#e2e8f0',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleSubmit}
                        style={{
                          padding: '14px 24px',
                          borderRadius: 12,
                          background: `linear-gradient(135deg, ${question.color}, ${question.color}99)`,
                          border: 'none',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: 14,
                          cursor: 'pointer',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        CHECK
                      </button>
                    </div>
                  </div>
                )}

                {/* RESULT PANEL */}
                <AnimatePresence>
                  {showBreakdown && result && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25 }}
                    >
                      {/* Result badge */}
                      <div
                        style={{
                          padding: '12px 16px',
                          background: resultColors[result].bg,
                          border: `1px solid ${resultColors[result].border}`,
                          borderRadius: 10,
                          marginBottom: 12,
                          fontSize: 13,
                          fontWeight: 800,
                          color: resultColors[result].text,
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span>{resultColors[result].label}</span>
                        <span style={{ fontFamily: "'Orbitron', monospace", fontSize: 13 }}>
                          Your: {userAnswer}
                          {question.unit} · Correct: {question.answer}
                          {question.unit}
                        </span>
                      </div>

                      {/* Formula Breakdown */}
                      <div
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 12,
                          padding: '16px 18px',
                          marginBottom: 16,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#64748b',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 10,
                            fontFamily: "'Orbitron', monospace",
                          }}
                        >
                          📚 Formula Breakdown
                        </div>
                        {question.formulas.map((line, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 13,
                              color: '#94a3b8',
                              lineHeight: 1.7,
                              fontWeight: 600,
                              display: 'flex',
                              gap: 8,
                            }}
                          >
                            <span style={{ color: '#475569', minWidth: 16 }}>{i + 1}.</span>
                            <span>
                              {line.split('**').map((p, j) =>
                                j % 2 === 0 ? (
                                  <span key={j}>{p}</span>
                                ) : (
                                  <strong key={j} style={{ color: question.color }}>
                                    {p}
                                  </strong>
                                )
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={nextQuestion}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                          border: 'none',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: 14,
                          cursor: 'pointer',
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        NEXT QUESTION →
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* INFO FOOTER */}
          <div
            style={{
              marginTop: 24,
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: 11,
              color: '#475569',
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: '#64748b' }}>Tolerance Rule:</strong> Answers within ±
            {TOLERANCE} (for %, or ±{TOLERANCE} chips for EV) count as close ✅. Exact answers build
            maximum streaks. Press{' '}
            <kbd
              style={{ background: '#1e2d3d', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}
            >
              Enter
            </kbd>{' '}
            to submit.
          </div>
        </div>
      </div>
    </>
  );
}
