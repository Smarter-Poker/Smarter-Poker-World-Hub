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
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import PlayingCard from '../../../src/components/poker/PlayingCard';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
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
    title: 'Reading The Board',
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
    <div className={s.freqBars}>
      <p className={s.eyebrow}>
        Illustrative Teaching Example · Not Solver Output
      </p>
      {Object.entries(freqs || {}).map(([action, pct]) => (
        <div key={action} className={s.freqRow}>
          <span className={s.freqLabel}>{action}</span>
          <div className={s.freqTrack}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: MOTION.glacial, delay: 0.2 }}
              className={s.freqFill}
              style={{ background: colors[action] || 'var(--sp-accent-blue)' }}
            />
          </div>
          <span className={s.freqPct}>{pct}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ScenarioDemoPage() {
  const router = useRouter();
  // TRAIN-WIRE-BOTTOMSHEET-6 — info sheet state
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
      setCurrentStep((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  }, [currentStep, fb]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
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
      <SEOHead
        title="Interactive GTO Strategy Tutorial"
        description="Learn How To Read GTO Poker Strategy Charts, Mixed Action Frequencies, Range Advantage, And Expected Value Loss In Big Blinds On Smarter.Poker."
        canonical="/hub/training/scenario-demo"
      />
      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead
            slug="training-scenario-demo"
            title="Strategy Concepts"
            helpContent={
              <>
                <p>
                  Walk Through Short Concept Lessons Covering Decision Context,
                  Frequency Charts, Board Texture, Position, And Evidence Labels.
                  Example Percentages Are Illustrative And Are Not Solver Output.
                </p>
                <p>
                  Your Optional Private Practice Note Does Not Affect Account
                  Progress, Rank, Rewards, Or Solver Accuracy.
                </p>
              </>
            }
            note={(
              <>
                Step <strong>{currentStep + 1}</strong> Of {TUTORIAL_STEPS.length}
                {quizScore.total > 0 ? <> · Quiz <strong>{quizScore.correct}/{quizScore.total}</strong></> : null}
              </>
            )}
          />
          <div className={s.track} role="progressbar" aria-label="Tutorial Progress" aria-valuemin={1} aria-valuemax={TUTORIAL_STEPS.length} aria-valuenow={currentStep + 1}>
            <div className={s.fill} style={{ width: `${((currentStep + 1) / TUTORIAL_STEPS.length) * 100}%` }} />
          </div>

          {!completed ? (
            <AnimatePresence mode="wait">
              <motion.section
                key={currentStep + '-' + quizIdx}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: MOTION.standard }}
                className={`sd-panel ${s.panel} ${s.lesson}`}
                aria-labelledby="scenario-step-title"
              >
                <p className={s.tag}><span aria-hidden>{step.icon}</span> Step {currentStep + 1} Of {TUTORIAL_STEPS.length}</p>
                <h2 id="scenario-step-title" className={s.sectionTitle}>{step.title}</h2>
                <p className={s.copy}>{step.body}</p>

                {/* Example Cards */}
                {step.example?.board && (
                  <div className={s.cardRow}>
                    {step.example.board.map((c, i) => (
                      <PlayingCard key={'b'+i} card={c} size="md" priority />
                    ))}
                    {step.example.hero ? (
                      <span className={s.cardGap} aria-hidden />
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
                  <div data-pills-row className={s.pills}>
                    {step.example.positions.map((p, i) => (
                      <span key={p} className={s.pill} data-on={i === 3 ? 'true' : undefined}>
                        {p}{i === 3 ? ' ✓' : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quiz inside tutorial */}
                {isQuizStep && quizQ && (
                  <div className={s.panel}>
                    <p className={s.eyebrow}>Question {quizIdx + 1} Of {QUIZ_QUESTIONS.length}</p>
                    <p className={s.subTitle}>{quizQ.q}</p>
                    {/* TRAIN-WIRE-QUIZ-ANSWER-1 — quiz options via shared QuizAnswer primitive */}
                    <QuizAnswerStack gap={8} maxWidth={520}>
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
                        type="button"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={nextQuizQ}
                        className={`sd-button sd-primary ${s.primaryAction}`}
                      >
                        {quizIdx < QUIZ_QUESTIONS.length - 1
                          ? 'Next Question'
                          : 'Finish Tutorial'}
                      </motion.button>
                    )}
                  </div>
                )}

                {/* Nav Buttons (non-quiz mode) */}
                {!isQuizStep && (
                  <div className={s.actions}>
                    {currentStep > 0 && (
                      <button type="button" onClick={prevStep} className={`sd-button ${s.button}`}>
                        Previous
                      </button>
                    )}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={nextStep}
                      className={`sd-button sd-primary ${s.button}`}
                    >
                      {currentStep < TUTORIAL_STEPS.length - 1 ? 'Next' : 'Start Quiz'}
                    </motion.button>
                  </div>
                )}
              </motion.section>
            </AnimatePresence>
          ) : (
            /* Completion Screen */
            <motion.section
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`sd-panel ${s.panel} ${s.lesson}`}
              aria-labelledby="scenario-complete-title"
            >
              <h2 id="scenario-complete-title" className={s.sectionTitle}>Tutorial Complete</h2>
              <div className={s.metrics2}>
                <div className={`sd-metric ${s.metric}`}>
                  <span className={s.metricLabel}>Concept Quiz Result</span>
                  <strong className={s.metricValue} data-tone="ice">{quizScore.correct}/{quizScore.total}</strong>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <span className={s.metricLabel}>Accuracy</span>
                  <strong className={s.metricValue}>
                    {quizScore.total > 0 ? `${Math.round((quizScore.correct / quizScore.total) * 100)}%` : '0%'}
                  </strong>
                </div>
              </div>
              <div className={s.actions}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push('/hub/training')}
                  className={`sd-button sd-primary ${s.button}`}
                >
                  Start Training
                </motion.button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(0);
                    setQuizIdx(0);
                    setQuizAnswer(null);
                    setQuizScore({ total: 0, correct: 0 });
                    setCompleted(false);
                    savedRef.current = false;
                  }}
                  className={`sd-button ${s.button}`}
                >
                  Restart
                </button>
              </div>
            </motion.section>
          )}
        </main>
      </div>
      <HubPageSummary page="training-scenario-demo" />
    </>
  );
}
