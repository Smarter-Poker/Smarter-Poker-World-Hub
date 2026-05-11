/**
 * GTO Quiz Gauntlet — Timed Multi-Topic Blitz
 * Phase 27 · /hub/training/quiz-gauntlet
 *
 * 10 questions · 30s shot clock · combo multiplier · leaderboard-ready
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';
import FeedbackCard from '../../../src/components/poker/FeedbackCard';
// TRAIN-WIRE-FEEDBACK-V2-1 — adoption: quiz-gauntlet feedback panel
// TRAIN-WIRE-PROGRESS-3 — adoption: quiz-gauntlet question progress
// TRAIN-WIRE-FX-6b — adoption: feedback hook

function saveSession(payload) {
  authedFetch('/api/training/save-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

// ── Question generators ───────────────────────────────────────────
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function genPotOdds() {
  const pot = [60, 80, 100, 120, 150][Math.floor(Math.random() * 5)];
  const bet = Math.round(pot * [0.33, 0.5, 0.75, 1.0][Math.floor(Math.random() * 4)]);
  const answer = Math.round((bet / (pot + bet)) * 100);
  return {
    topic: 'Pot Odds',
    icon: '📐',
    color: '#00d4ff',
    answer,
    unit: '%',
    tolerance: 2,
    question: `Villain bets **${bet}** into a **${pot}** chip pot. What are your pot odds?`,
    hint: 'Bet ÷ (Pot + Bet) × 100',
    explanation: `${bet} / (${pot} + ${bet}) = ${bet} / ${pot + bet} = **${answer}%**`,
  };
}
function genMDF() {
  const pot = [60, 80, 100, 120][Math.floor(Math.random() * 4)];
  const bet = Math.round(pot * [0.33, 0.5, 0.75, 1.0][Math.floor(Math.random() * 4)]);
  const answer = Math.round((pot / (pot + bet)) * 100);
  return {
    topic: 'MDF',
    icon: '🛡️',
    color: '#a855f7',
    answer,
    unit: '%',
    tolerance: 2,
    question: `Villain bets **${bet}** into **${pot}**. What is your Min Defense Frequency?`,
    hint: 'Pot ÷ (Pot + Bet) × 100',
    explanation: `${pot} / (${pot} + ${bet}) = **${answer}%**`,
  };
}
function genEV() {
  const pot = [80, 100, 120, 150][Math.floor(Math.random() * 4)];
  const bet = Math.round(pot * [0.5, 0.75, 1.0][Math.floor(Math.random() * 3)]);
  const eq = 20 + Math.floor(Math.random() * 25);
  const answer = Math.round((eq / 100) * (pot + bet) - ((100 - eq) / 100) * bet);
  return {
    topic: 'EV of Call',
    icon: '⚡',
    color: '#22c55e',
    answer,
    unit: ' chips',
    tolerance: 2,
    question: `Pot **${pot}**, bet **${bet}**, you have **${eq}% equity**. EV of calling?`,
    hint: '(Equity × Total Pot) − ((1−Equity) × Call)',
    explanation: `(${eq}% × ${pot + bet}) − (${100 - eq}% × ${bet}) = **${answer > 0 ? '+' : ''}${answer}**`,
  };
}
function genBreakEven() {
  const pot = [80, 100, 120][Math.floor(Math.random() * 3)];
  const bet = Math.round(pot * [0.5, 0.75, 1.0][Math.floor(Math.random() * 3)]);
  const answer = Math.round((bet / (pot + bet)) * 100);
  return {
    topic: 'Break-Even',
    icon: '⚖️',
    color: '#f97316',
    answer,
    unit: '%',
    tolerance: 2,
    question: `Bet **${bet}**, pot **${pot}**. Min equity to break even on a call?`,
    hint: 'Call ÷ (Pot + Call) × 100',
    explanation: `${bet} / (${pot + bet}) = **${answer}%**`,
  };
}

const GENERATORS = [genPotOdds, genMDF, genEV, genBreakEven];
const TOTAL_Q = 10;
const SHOT_CLOCK = 30;

function generateGauntlet() {
  const qs = [];
  // BUG-06 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
  const shuffled = [...GENERATORS, ...GENERATORS, ...GENERATORS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < TOTAL_Q; i++) qs.push(shuffled[i % shuffled.length]());
  return qs;
}

// ── Scoring ───────────────────────────────────────────────────────
function calcScore(isCorrect, timeLeft, combo) {
  if (!isCorrect) return 0;
  const timeBonus = Math.round(timeLeft * 3.33); // max 100 pts for instant
  const base = 50;
  const comboMult = Math.min(4, 1 + (combo - 1) * 0.5);
  return Math.round((base + timeBonus) * comboMult);
}

export default function QuizGauntlet() {
  useTrainingBus('quiz-gauntlet');
  const fb = useTrainingFeedback();
  const router = useRouter();

  const [phase, setPhase] = useState('splash'); // splash | playing | results
  const [questions, setQuestions] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(SHOT_CLOCK);
  const [combo, setCombo] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [history, setHistory] = useState([]); // {isCorrect, score, topic}
  const [showFeedback, setShowFeedback] = useState(null); // null | 'correct' | 'close' | 'wrong' | 'timeout'

  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const q = questions[qIdx];

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const advanceQuestion = useCallback((entry) => {
    setHistory((h) => {
      const next = [...h, entry];
      if (next.length === TOTAL_Q) {
        // Game over
        clearTimer();
        const correct = next.filter((e) => e.isCorrect).length;
        const score = next.reduce((s, e) => s + e.score, 0);
        const accuracy = Math.round((correct / TOTAL_Q) * 100);
        eventBus?.emit?.(EventType.SESSION_END, {
          game_id: 'quiz-gauntlet',
          accuracy,
          correct_answers: correct,
          total_questions: TOTAL_Q,
          score,
        });
        saveSession({
          game_id: 'quiz-gauntlet',
          accuracy,
          hands_played: TOTAL_Q,
          correct_answers: correct,
          total_questions: TOTAL_Q,
        });
        setTimeout(() => setPhase('results'), 800);
      } else {
        setTimeout(() => {
          setQIdx((i) => i + 1);
          setUserAnswer('');
          setTimeLeft(SHOT_CLOCK);
          setShowFeedback(null);
          requestAnimationFrame(() => setTimeout(() => inputRef.current?.focus(), 50));
        }, 900);
      }
      return next;
    });
  }, []);

  const submitAnswer = useCallback(
    (forced = false) => {
      if (!q || showFeedback) return;
      clearTimer();
      const num = parseFloat(userAnswer);
      const isTimeout = forced && isNaN(num);
      let res = 'wrong',
        isCorrect = false,
        pts = 0;
      if (!isTimeout && !isNaN(num)) {
        const diff = Math.abs(num - q.answer);
        if (diff === 0) res = 'correct';
        else if (diff <= q.tolerance) res = 'close';
        isCorrect = res !== 'wrong';
        if (isCorrect) fb.correct(); else fb.incorrect();
        const newCombo = isCorrect ? combo + 1 : 0;
        pts = calcScore(isCorrect, timeLeft, combo + 1);
        setCombo(newCombo);
        setTotalScore((s) => s + pts);
      } else {
        res = 'timeout';
        setCombo(0);
      }
      setShowFeedback(res);
      advanceQuestion({ isCorrect, score: pts, topic: q.topic, res });
    },
    [q, userAnswer, showFeedback, timeLeft, combo, advanceQuestion]
  );

  // Shot clock
  useEffect(() => {
    if (phase !== 'playing' || showFeedback) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          submitAnswer(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return clearTimer;
  }, [phase, qIdx, showFeedback, submitAnswer]);

  function startGame() {
    const qs = generateGauntlet();
    setQuestions(qs);
    setQIdx(0);
    setUserAnswer('');
    setTimeLeft(SHOT_CLOCK);
    setCombo(0);
    setTotalScore(0);
    setHistory([]);
    setShowFeedback(null);
    setPhase('playing');
    requestAnimationFrame(() => setTimeout(() => inputRef.current?.focus(), 100));
  }

  const correctCount = history.filter((h) => h.isCorrect).length;
  const accuracy = history.length ? Math.round((correctCount / history.length) * 100) : 0;

  const C = {
    page: {
      minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
      background: 'linear-gradient(135deg,#0a0f1e,#0d1629,#0a0f1e)',
      color: '#e2e8f0',
      fontFamily: "'Inter',sans-serif",
      padding: '20px 16px 40px',
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: '24px 20px',
      marginBottom: 16,
    },
    orb: { fontFamily: "'Orbitron',monospace" },
  };

  return (
    <>
      <Head>
        <title>GTO Quiz Gauntlet | Smarter.Poker</title>
        <meta
          name="description"
          content="10-question timed GTO blitz. Test pot odds, MDF, EV, and range knowledge under pressure."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div style={C.page}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            ← Training Hub
          </button>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg,#f9731620,#ef444420)',
                border: '1px solid rgba(249,115,22,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              ⚡
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 900,
                  ...C.orb,
                  background: 'linear-gradient(135deg,#f97316,#ef4444)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                GTO QUIZ GAUNTLET
              </h1>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                10 Questions · 30s Shot Clock · Combo Multiplier
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* SPLASH */}
            {phase === 'splash' && (
              <motion.div
                key="splash"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div style={C.card}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#94a3b8',
                      lineHeight: 1.8,
                      marginBottom: 20,
                    }}
                  >
                    Answer <strong style={{ color: '#f97316' }}>10 GTO questions</strong> as fast
                    and accurately as possible.
                    <br />
                    You have <strong style={{ color: '#00d4ff' }}>30 seconds</strong> per question.
                    <br />
                    Correct answers build your{' '}
                    <strong style={{ color: '#a855f7' }}>COMBO multiplier</strong> for bonus points.
                    <br />
                    Max score: <strong style={{ color: '#22c55e' }}>1000 pts</strong>.
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2,1fr)',
                      gap: 8,
                      marginBottom: 20,
                    }}
                  >
                    {[
                      { i: '📐', t: 'Pot Odds' },
                      { i: '🛡️', t: 'MDF' },
                      { i: '⚡', t: 'EV of Call' },
                      { i: '⚖️', t: 'Break-Even' },
                    ].map((item) => (
                      <div
                        key={item.t}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#94a3b8',
                        }}
                      >
                        {item.i} {item.t}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={startGame}
                    style={{
                      width: '100%',
                      padding: 16,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg,#f97316,#ef4444)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: 16,
                      cursor: 'pointer',
                      ...C.orb,
                    }}
                  >
                    START GAUNTLET ⚡
                  </button>
                </div>
              </motion.div>
            )}

            {/* PLAYING */}
            {phase === 'playing' && q && (
              <motion.div
                key={`q-${qIdx}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2 }}
              >
                {/* HUD */}
                <ProgressStrip
                  current={qIdx + 1}
                  total={TOTAL_Q}
                  correct={history.filter((e) => e.isCorrect).length}
                  bestStreak={combo}
                  difficulty="intermediate"
                  compact
                  style={{ marginBottom: 12 }}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3,1fr)',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  {[
                    { label: 'Score', value: totalScore, color: '#f97316' },
                    {
                      label: 'Combo',
                      value: `x${Math.min(4, 1 + combo * 0.5).toFixed(1)}`,
                      color: '#a855f7',
                    },
                    {
                      label: 'Time',
                      value: `${timeLeft}s`,
                      color: timeLeft <= 10 ? '#ef4444' : '#22c55e',
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 10,
                        padding: '8px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 18, fontWeight: 900, ...C.orb, color: s.color }}>
                        {s.value}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: '#475569',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shot Clock Bar */}
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                    marginBottom: 16,
                  }}
                >
                  <motion.div
                    animate={{ width: `${(timeLeft / SHOT_CLOCK) * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                    style={{
                      height: '100%',
                      borderRadius: 3,
                      background:
                        timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f97316' : '#22c55e',
                    }}
                  />
                </div>

                {/* Topic badge */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: `${q.color}18`,
                    border: `1px solid ${q.color}40`,
                    borderRadius: 20,
                    padding: '4px 14px',
                    marginBottom: 14,
                    fontSize: 11,
                    fontWeight: 700,
                    color: q.color,
                    textTransform: 'uppercase',
                  }}
                >
                  {q.icon} {q.topic}
                </div>

                {/* Question */}
                <div style={C.card}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 16,
                      lineHeight: 1.7,
                      color: '#e2e8f0',
                      fontWeight: 600,
                      marginBottom: 12,
                    }}
                  >
                    {q.question.split('**').map((p, i) =>
                      i % 2 === 0 ? (
                        <span key={i}>{p}</span>
                      ) : (
                        <strong key={i} style={{ color: q.color }}>
                          {p}
                        </strong>
                      )
                    )}
                  </p>
                  <div
                    style={{
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#64748b',
                      borderLeft: `3px solid ${q.color}60`,
                    }}
                  >
                    💡 {q.hint}
                  </div>
                </div>

                {/* Input */}
                {!showFeedback && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      ref={inputRef}
                      type="number"
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                      placeholder={`Answer in ${q.unit.trim() || '%'}`}
                      style={{
                        flex: 1,
                        padding: '14px 16px',
                        borderRadius: 12,
                        fontSize: 20,
                        fontWeight: 700,
                        ...C.orb,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => submitAnswer()}
                      style={{
                        padding: '14px 24px',
                        borderRadius: 12,
                        background: `linear-gradient(135deg,${q.color},${q.color}99)`,
                        border: 'none',
                        color: '#000',
                        fontWeight: 900,
                        fontSize: 14,
                        cursor: 'pointer',
                        ...C.orb,
                      }}
                    >
                      LOCK IN
                    </button>
                  </div>
                )}

                {/* Feedback (TRAIN-WIRE-FEEDBACK-V2-1) */}
                {showFeedback && (
                  <FeedbackCard
                    verdict={showFeedback === 'correct' ? 'correct' : showFeedback === 'close' ? 'mixed' : 'incorrect'}
                    userAction={userAnswer ? `${userAnswer}${q.unit || ''}` : (showFeedback === 'timeout' ? 'No answer' : '—')}
                    solverAction={`${q.answer}${q.unit || ''}`}
                    evLoss={0}
                    whyShort={q.explanation ? q.explanation.replace(/\*\*/g, '') : ''}
                    accuracy={undefined}
                    compact
                  />
                )}
              </motion.div>
            )}

            {/* RESULTS */}
            {phase === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ ...C.card, textAlign: 'center', marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 48,
                      fontWeight: 900,
                      ...C.orb,
                      background: 'linear-gradient(135deg,#f97316,#a855f7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      lineHeight: 1,
                    }}
                  >
                    {totalScore}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginTop: 4,
                      marginBottom: 20,
                    }}
                  >
                    Gauntlet Score
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {[
                      { label: 'Correct', value: correctCount, color: '#22c55e' },
                      { label: 'Accuracy', value: `${accuracy}%`, color: '#a855f7' },
                      {
                        label: 'Best Combo',
                        // BUG-10 FIX: compute longest CONSECUTIVE correct streak, not cumulative count
                        value: (() => {
                          let maxStreak = 0, cur = 0;
                          history.forEach(e => { if (e.isCorrect) { cur++; maxStreak = Math.max(maxStreak, cur); } else { cur = 0; } });
                          return `x${Math.min(4, 1 + maxStreak * 0.5).toFixed(1)}`;
                        })(),
                        color: '#f97316',
                      },
                    ].map((s) => (
                      <div
                        key={s.label}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: 10,
                          padding: '12px 8px',
                        }}
                      >
                        <div style={{ fontSize: 22, fontWeight: 900, ...C.orb, color: s.color }}>
                          {s.value}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#64748b',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Per-question recap */}
                <div style={C.card}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    Question Recap
                  </div>
                  {history.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 0',
                        borderBottom:
                          i < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: '#64748b', fontWeight: 700 }}>
                        Q{i + 1} · {h.topic}
                      </span>
                      <span style={{ color: h.isCorrect ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                        {h.isCorrect ? `✅ +${h.score}pt` : '❌ 0pt'}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={startGame}
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg,#f97316,#ef4444)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: 14,
                      cursor: 'pointer',
                      ...C.orb,
                    }}
                  >
                    PLAY AGAIN ⚡
                  </button>
                  <button
                    onClick={() => router.push('/hub/training')}
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#94a3b8',
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Training Hub
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
