/**
 * TRAINING SCENARIO DEMO — Interactive GTO Tutorial
 * ═══════════════════════════════════════════════════════════════════════════
 * Guided walkthrough of the GTO training system with interactive examples,
 * step-by-step instructions, and a mini-quiz to validate understanding.
 *
 * Route: /hub/training/scenario-demo
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
// TRAIN-WIRE-FX-2a — adoption: scenario-demo quiz answer + nav feedback
// TRAIN-WIRE-PLAYCARD-2 — adoption: scenario-demo cards via shared PlayingCard

// Tutorial steps
const TUTORIAL_STEPS = [
  {
    title: 'Welcome to GTO Training',
    body: "This tutorial will teach you how the Smarter.Poker training system works. You'll learn how to read GTO frequencies, understand solver recommendations, and answer training questions like a pro.",
    highlight: 'duration',
    icon: '🎓',
  },
  {
    title: 'Reading the Board',
    body: 'Every training question shows you a poker scenario: the board cards, your hero hand, pot size, and street. Pay attention to board texture — is it wet (many draws possible) or dry (few draws)?',
    example: { board: ['K♠', '7♦', '2♣'], hero: ['A♠', 'K♦'], pot: '8.5 BB', street: 'Flop' },
    icon: '🃏',
  },
  {
    title: 'Understanding GTO Frequencies',
    body: "After answering, you'll see the GTO-optimal action frequencies. A 70% Check / 30% Bet split means the solver checks 70% of the time with this exact hand in this exact spot.",
    example: { freqs: { Check: 70, 'Bet 33%': 25, 'Bet 75%': 5 } },
    icon: '📊',
  },
  {
    title: 'Mixed Strategy Decisions',
    body: 'When frequencies are close (like 55% Raise / 45% Call), the solver is nearly indifferent. Both plays are acceptable. Focus on the clearly dominant actions (80%+) first.',
    example: { freqs: { Raise: 55, Call: 45 } },
    icon: '🔀',
  },
  {
    title: 'Position Matters',
    body: 'Your position relative to the button changes everything. IP (In Position) you can bet more aggressively. OOP (Out of Position) you need to check-raise or check more often for protection.',
    example: { positions: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] },
    icon: '🪑',
  },
  {
    title: 'EV and Accuracy',
    body: "Your GTO Score measures how often you choose the solver-preferred action. An 80%+ score means you're playing near-optimal poker. Below 60% means significant leaks to work on.",
    example: { scores: { Elite: '90%+', Strong: '75-89%', Average: '60-74%', Weak: '<60%' } },
    icon: '📈',
  },
  {
    title: 'Practice Quiz',
    body: "Let's test your understanding with a quick 5-question quiz about GTO concepts.",
    icon: '🎯',
    isQuiz: true,
  },
];

// Mini Quiz Questions
const QUIZ_QUESTIONS = [
  {
    q: 'What does "GTO" stand for?',
    options: ['Game Theory Optimal', 'Get The Odds', 'Grand Total Output'],
    correct: 'Game Theory Optimal',
  },
  {
    q: 'If the solver says Check 80% / Bet 20%, what should you primarily do?',
    options: ['Always bet', 'Primarily check', 'Fold'],
    correct: 'Primarily check',
  },
  {
    q: 'Which position has the most advantage postflop?',
    options: ['UTG', 'BB', 'BTN'],
    correct: 'BTN',
  },
  {
    q: 'What does MDF (Minimum Defense Frequency) tell you?',
    options: ['How often to bluff', 'How often to continue vs a bet', 'How much to bet'],
    correct: 'How often to continue vs a bet',
  },
  {
    q: 'An 85% GTO accuracy score is considered:',
    options: ['Weak — needs improvement', 'Strong — near-optimal', 'Average — room to grow'],
    correct: 'Strong — near-optimal',
  },
];

function FrequencyBars({ freqs }) {
  const colors = {
    Check: '#3b82f6',
    'Bet 33%': '#22c55e',
    'Bet 75%': '#fbbf24',
    Raise: '#ef4444',
    Call: '#22c55e',
    Fold: '#64748b',
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxWidth: 300,
        margin: '16px auto',
      }}
    >
      {Object.entries(freqs || {}).map(([action, pct]) => (
        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 60, fontSize: 10, color: '#94a3b8', textAlign: 'right' }}>
            {action}
          </span>
          <div
            style={{
              flex: 1,
              height: 16,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              style={{ height: '100%', borderRadius: 4, background: colors[action] || '#3b82f6' }}
            />
          </div>
          <span style={{ width: 32, fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ScenarioDemoPage() {
  const router = useRouter();
  useTrainingBus('scenario-demo');
  const fb = useTrainingFeedback();

  const [currentStep, setCurrentStep] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState({ total: 0, correct: 0 });
  const [completed, setCompleted] = useState(false);
  const savedRef = useRef(false);

  const step = TUTORIAL_STEPS[currentStep];
  const isQuizStep = step?.isQuiz;
  const quizQ = QUIZ_QUESTIONS[quizIdx];

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'ScenarioDemo') return;
    });
    return unsub;
  }, []);

  const nextStep = useCallback(() => {
    fb.click();
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      setCompleted(true);
    }
  }, [currentStep, fb]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  const answerQuizQ = useCallback(
    (opt) => {
      if (quizAnswer !== null) return;
      const isCorrect = opt === quizQ.correct;
      if (isCorrect) fb.correct(); else fb.incorrect();
      setQuizAnswer(opt);
      setQuizScore((p) => ({ total: p.total + 1, correct: p.correct + (isCorrect ? 1 : 0) }));
    },
    [quizAnswer, quizQ]
  );

  const nextQuizQ = useCallback(() => {
    fb.click();
    if (quizIdx < QUIZ_QUESTIONS.length - 1) {
      setQuizIdx((i) => i + 1);
      setQuizAnswer(null);
    } else {
      setCompleted(true);
    }
  }, [quizIdx, fb]);

  // Save completion
  useEffect(() => {
    if (completed && !savedRef.current) {
      savedRef.current = true;
      const save = async () => {
        try {
          const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
          if (!token) return;
          const accuracy =
            quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 100;
          await authedFetch('/api/training/save-session', {
            method: 'POST',
            body: JSON.stringify({
              gameId: 'tutorial',
              gameName: 'GTO Training Tutorial',
              gtowScore: accuracy,
              totalEVLoss: 0,
              handsPlayed: quizScore.total,
              mistakeCount: quizScore.total - quizScore.correct,
              accuracy,
              correctCount: quizScore.correct,
              bestStreak: 0,
              levelPassed: true,
              level: 1,
              handHistory: [],
            }),
          });
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            { gameId: 'tutorial', completed: true, accuracy },
            'ScenarioDemo'
          );
        } catch (err) {
          console.warn('[Tutorial] Save error:', err.message);
        }
      };
      save();
    }
  }, [completed]);

  return (
    <>
      <Head>
        <title>GTO Training Tutorial | Smarter.Poker</title>
        <meta
          name="description"
          content="Learn how to use the Smarter.Poker GTO training system with this interactive tutorial."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0d0d14 0%, #0a0a1a 50%, #0d0d14 100%)',
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
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>GTO Training Tutorial</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Step {currentStep + 1} of {TUTORIAL_STEPS.length}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.05)' }}>
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00d4ff, #a855f7)',
              width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%`,
              transition: 'width 0.3s',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 'calc(100vh - 80px)',
            padding: 20,
          }}
        >
          {!completed ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep + '-' + quizIdx}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>{step.icon}</div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: '#fff',
                    marginBottom: 12,
                    letterSpacing: '-0.5px',
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: '#94a3b8',
                    lineHeight: 1.7,
                    marginBottom: 24,
                    padding: '0 12px',
                  }}
                >
                  {step.body}
                </div>

                {/* Example Cards */}
                {step.example?.board && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                    {step.example.board.map((c, i) => (
                      <PlayingCard key={'b'+i} card={c} size="md" priority />
                    ))}
                    {step.example.hero ? (
                      <div style={{ width: 12 }} aria-hidden />
                    ) : null}
                    {step.example.hero && step.example.hero.map((c, i) => (
                      <PlayingCard key={'h'+i} card={c} size="md" highlighted priority />
                    ))}
                  </div>
                )}

                {/* Frequency Example */}
                {step.example?.freqs && <FrequencyBars freqs={step.example.freqs} />}

                {/* Position Example */}
                {step.example?.positions && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 8,
                      marginBottom: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    {step.example.positions.map((p, i) => (
                      <div
                        key={p}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          background: i === 3 ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0.3)',
                          border: `1px solid ${i === 3 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          fontSize: 12,
                          fontWeight: 700,
                          color: i === 3 ? '#22c55e' : '#94a3b8',
                        }}
                      >
                        {p} {i === 3 && '✓'}
                      </div>
                    ))}
                  </div>
                )}

                {/* Score Example */}
                {step.example?.scores && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      maxWidth: 260,
                      margin: '0 auto 16px',
                    }}
                  >
                    {Object.entries(step.example.scores || {}).map(([label, score]) => {
                      const colors = {
                        Elite: '#fbbf24',
                        Strong: '#22c55e',
                        Average: '#3b82f6',
                        Weak: '#ef4444',
                      };
                      return (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '6px 12px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.2)',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, color: colors[label] }}>
                            {label}
                          </span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{score}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quiz inside tutorial */}
                {isQuizStep && quizQ && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                      Q{quizIdx + 1}/{QUIZ_QUESTIONS.length}
                    </div>
                    <div
                      style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 16 }}
                    >
                      {quizQ.q}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        maxWidth: 320,
                        margin: '0 auto',
                      }}
                    >
                      {quizQ.options.map((opt) => {
                        const isSelected = quizAnswer === opt;
                        const isCorrect = opt === quizQ.correct;
                        const show = quizAnswer !== null;
                        return (
                          <motion.button
                            key={opt}
                            whileTap={!show ? { scale: 0.97 } : {}}
                            onClick={() => answerQuizQ(opt)}
                            disabled={show}
                            style={{
                              padding: '12px',
                              borderRadius: 8,
                              background: show
                                ? isCorrect
                                  ? 'rgba(34,197,94,0.12)'
                                  : isSelected
                                    ? 'rgba(239,68,68,0.12)'
                                    : 'rgba(0,0,0,0.2)'
                                : 'rgba(0,0,0,0.2)',
                              border: `1px solid ${show ? (isCorrect ? 'rgba(34,197,94,0.4)' : isSelected ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.05)') : 'rgba(255,255,255,0.08)'}`,
                              color: '#e2e8f0',
                              fontSize: 13,
                              cursor: show ? 'default' : 'pointer',
                            }}
                          >
                            {opt} {show && isCorrect && '✓'}{' '}
                            {show && isSelected && !isCorrect && '✗'}
                          </motion.button>
                        );
                      })}
                    </div>
                    {quizAnswer !== null && (
                      <motion.button
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={nextQuizQ}
                        style={{
                          marginTop: 16,
                          padding: '10px 24px',
                          borderRadius: 8,
                          background: 'rgba(0,212,255,0.1)',
                          border: '1px solid rgba(0,212,255,0.3)',
                          color: '#00d4ff',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {quizIdx < QUIZ_QUESTIONS.length - 1
                          ? 'Next Question →'
                          : 'Finish Tutorial →'}
                      </motion.button>
                    )}
                  </div>
                )}

                {/* Nav Buttons (non-quiz mode) */}
                {!isQuizStep && (
                  <div
                    style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}
                  >
                    {currentStep > 0 && (
                      <button
                        onClick={prevStep}
                        style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#94a3b8',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ← Back
                      </button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={nextStep}
                      style={{
                        padding: '10px 24px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                        border: 'none',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0,212,255,0.2)',
                      }}
                    >
                      {currentStep < TUTORIAL_STEPS.length - 1 ? 'Next →' : 'Start Quiz →'}
                    </motion.button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            /* Completion Screen */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: 'center' }}
            >
              <div style={{ fontSize: 60, marginBottom: 16 }}>🎓</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
                Tutorial Complete!
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
                Quiz Score:{' '}
                <span style={{ color: '#4ade80', fontWeight: 700 }}>
                  {quizScore.correct}/{quizScore.total}
                </span>
                {quizScore.total > 0 &&
                  ` (${Math.round((quizScore.correct / quizScore.total) * 100)}%)`}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push('/hub/training')}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Start Training →
                </motion.button>
                <button
                  onClick={() => {
                    setCurrentStep(0);
                    setQuizIdx(0);
                    setQuizAnswer(null);
                    setQuizScore({ total: 0, correct: 0 });
                    setCompleted(false);
                    savedRef.current = false;
                  }}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Restart
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
