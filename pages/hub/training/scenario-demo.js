/**
 * TRAINING SCENARIO DEMO — Solver-Literacy Practice Tutorial
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guided walkthrough of poker decision context and solver-output literacy.
 * All charts on this page are illustrative teaching examples, not solves.
 *
 * Route: /hub/training/scenario-demo
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-ADOPT-10 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-7 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-41 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QuizAnswer, { QuizAnswerStack } from '../../../src/components/poker/QuizAnswer';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import BottomSheet from '../../../src/components/ui/BottomSheet';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';

// TRAIN-CSS-MOTION-ADOPT-7 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-PROGRESS-2 — adoption: scenario-demo tutorial step progress
// TRAIN-WIRE-FX-2a — adoption: scenario-demo quiz answer + nav feedback
// TRAIN-WIRE-PLAYCARD-2 — adoption: scenario-demo cards via shared PlayingCard

// Tutorial steps
const TUTORIAL_STEPS = [
  {
    title: 'Welcome To Strategy Concepts',
    body: "This practice-only tutorial explains how to read a poker decision and how a mixed-strategy chart is formatted. Its examples are authored teaching aids, not solver output, and its quiz does not affect account progress, rank, or rewards.",
    highlight: 'duration',
    icon: '★',
  },
  {
    title: 'Reading the Board',
    body: 'Every training question shows you a poker scenario: the board cards, your hero hand, pot size, and street. Pay attention to board texture - is it wet (many draws possible) or dry (few draws)?',
    example: { board: ['K♠', '7♦', '2♣'], hero: ['A♠', 'K♦'], pot: '8.5 BB', street: 'Flop' },
    icon: '◇',
  },
  {
    title: 'Reading A Frequency Chart',
    body: 'A frequency chart can describe how often each action is selected in a strategy. The percentages below are illustrative only. An exact solver claim requires a matching decision node plus verified solver, machine, manifest, and source-artifact provenance.',
    example: { freqs: { Check: 70, 'Bet 33%': 25, 'Bet 75%': 5 } },
    icon: '■',
  },
  {
    title: 'Mixed Strategy Decisions',
    body: 'A chart with two non-zero actions represents a mixed strategy. Close frequencies alone do not prove equal expected value, and this illustrative example must not be used as an exact recommendation for a real hand.',
    example: { freqs: { Raise: 55, Call: 45 } },
    icon: '⇄',
  },
  {
    title: 'Position Matters',
    body: 'Position changes action order and the information available when you decide. Strategy also depends on ranges, stack depth, pot size, prior actions, board cards, and bet sizing; position alone never determines the correct action.',
    example: { positions: ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] },
    icon: '●',
  },
  {
    title: 'Evidence Before Labels',
    body: 'A solver label, action frequency, or EV number is trustworthy only when the exact game state and complete solve provenance are available. Otherwise the result should be shown as authored practice, illustrative, or unpriced.',
    icon: '▲',
  },
  {
    title: 'Practice Quiz',
    body: "Let's test your understanding with a five-question concept quiz. The result measures only your answers to this local tutorial.",
    icon: '◆',
    isQuiz: true,
  },
];

// Mini Quiz Questions
const QUIZ_QUESTIONS = [
  {
    q: 'What does "GTO" stand for?',
    options: ['Game Theory Optimal', 'Get The Odds', 'Grand Total Output', 'Game Table Order'],
    correct: 'Game Theory Optimal',
  },
  {
    q: 'What does an illustrative Check 80% / Bet 20% chart communicate?',
    options: ['Check is shown more often', 'Bet is always required', 'Fold is the only action', 'The chart proves exact EV'],
    correct: 'Check is shown more often',
  },
  {
    q: 'Which position has the most advantage postflop?',
    options: ['UTG', 'BB', 'BTN', 'SB'],
    correct: 'BTN',
  },
  {
    q: 'What does MDF (Minimum Defense Frequency) tell you?',
    options: ['How often to bluff', 'How often to continue vs a bet', 'How much to bet', 'How often to open preflop'],
    correct: 'How often to continue vs a bet',
  },
  {
    q: 'What is required before a frequency can be called solver-exact?',
    options: ['Complete exact-node provenance', 'A polished chart', 'A high quiz score', 'A popular poker rule'],
    correct: 'Complete exact-node provenance',
  },
];

function FrequencyBars({ freqs }) {
  const colors = {
    Check: 'var(--sp-accent-blue)',
    'Bet 33%': 'var(--sp-accent-green)',
    'Bet 75%': 'var(--sp-accent-amber)',
    Raise: 'var(--sp-accent-red)',
    Call: 'var(--sp-accent-green)',
    Fold: 'var(--sp-fg-dim)',
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
      <div
        style={{
          fontSize: 12,
          color: 'var(--sp-accent-amber)',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Illustrative Teaching Example · Not Solver Output
      </div>
      {Object.entries(freqs || {}).map(([action, pct]) => (
        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 60, fontSize: 12, color: 'var(--sp-fg-muted)', textAlign: 'right' }}>
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
              transition={{ duration: MOTION.glacial, delay: 0.2 }}
              style={{ height: '100%', borderRadius: 4, background: colors[action] || 'var(--sp-accent-blue)' }}
            />
          </div>
          <span style={{ width: 32, fontSize: 12, fontWeight: 700, color: 'var(--sp-fg)' }}>{pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ScenarioDemoPage() {
  const router = useRouter();
  // TRAIN-WIRE-BOTTOMSHEET-6 — info sheet state
  const [infoOpen, setInfoOpen] = useState(false);
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
    [quizAnswer, quizQ, fb]
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
          await savePracticeSession('scenario-demo', {
              gameId: 'tutorial',
              gameName: 'Strategy Concept Tutorial',
              handsPlayed: quizScore.total,
              correctCount: quizScore.correct,
              context: {
                practiceOnly: true,
                solverOutput: false,
              },
          });
        } catch (err) {
          console.warn('[Tutorial] Save error:', err.message);
        }
      };
      save();
    }
  }, [completed, quizScore.correct, quizScore.total]);

  return (
    <>
      <Head>
        <title>Strategy Concept Tutorial | Smarter.Poker</title>
        <meta
          name="description"
          content="Practice reading poker decisions and illustrative strategy charts without solver or EV claims."
        />
      </Head>
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0d0d14 0%, #0a0a1a 50%, #0d0d14 100%)',
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
          <button
            onClick={() => setInfoOpen(true)}
            aria-label="How Strategy Concept Tutorial works"
            style={{
              background: 'rgba(var(--sp-accent-cyan-rgb), 0.08)',
              border: '1px solid rgba(var(--sp-accent-cyan-rgb), 0.25)',
              color: 'var(--sp-accent-cyan)',
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 12,
              cursor: 'pointer',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            How It Works
          </button>
          <BottomSheet
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            title="How Strategy Concept Tutorial Works"
            subtitle="Practice-only poker and solver-literacy concepts"
          >
            <div style={{ padding: '0 4px', color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                Walk Through Short Concept Lessons Covering Decision Context,
                Frequency Charts, Board Texture, Position, And Evidence Labels.
                Example Percentages Are Illustrative And Are Not Solver Output.
              </p>
              <p>
                Your Optional Private Practice Note Does Not Affect Account
                Progress, Rank, Rewards, Or Solver Accuracy.
              </p>
            </div>
          </BottomSheet>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Strategy Concept Tutorial</div>
            <ProgressStrip
              current={currentStep + 1}
              total={TUTORIAL_STEPS.length}
              correct={quizScore.correct}
              difficulty="beginner"
              compact
              style={{ marginTop: 4 }}
            />
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.05)' }}>
          <div
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
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
            minHeight: 'calc(100dvh - 80px)',
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
                transition={{ duration: MOTION.standard }}
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
                    color: 'var(--sp-fg-muted)',
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
                  <div data-pills-row
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
                          color: i === 3 ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)',
                        }}
                      >
                        {p} {i === 3 && '✓'}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quiz inside tutorial */}
                {isQuizStep && quizQ && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginBottom: 12 }}>
                      Q{quizIdx + 1}/{QUIZ_QUESTIONS.length}
                    </div>
                    <div
                      style={{ fontSize: 15, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 16 }}
                    >
                      {quizQ.q}
                    </div>
                    {/* TRAIN-WIRE-QUIZ-ANSWER-1 — quiz options via shared QuizAnswer primitive */}
                    <QuizAnswerStack gap={8} maxWidth={320}>
                      {quizQ.options.map((opt, idx) => {
                        const show = quizAnswer !== null;
                        return (
                          <QuizAnswer
                            key={opt}
                            label={opt}
                            shortcut={idx + 1}
                            selected={quizAnswer === opt}
                            correct={opt === quizQ.correct}
                            show={show}
                            onClick={() => answerQuizQ(opt)}
                          />
                        );
                      })}
                    </QuizAnswerStack>
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
                          color: 'var(--sp-accent-cyan)',
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
                          color: 'var(--sp-fg-muted)',
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
                        background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
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
              <div style={{ fontSize: 60, marginBottom: 16 }}>★</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
                Tutorial Complete!
              </div>
              <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
                Concept Quiz Result:{' '}
                <span style={{ color: 'var(--sp-accent-green)', fontWeight: 700 }}>
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
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-green-rgb), 1), #16a34a)',
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
                    color: 'var(--sp-fg-muted)',
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
