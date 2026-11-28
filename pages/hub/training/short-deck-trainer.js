/**
 * SHORT DECK TRAINER — 36-Card Ruleset & Equity Practice
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Practice tool with hand-vs-hand Monte Carlo estimates and factual questions
 * for the explicitly disclosed ruleset used on this page.
 *
 * Route: /hub/training/short-deck-trainer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-ADOPT-5 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-6 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-45 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import Card from '../../../src/components/training/Card';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
const BottomSheet = dynamic(() => import('../../../src/components/ui/BottomSheet'), { ssr: false });
import QuizAnswer from '../../../src/components/poker/QuizAnswer';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
// TRAIN-WIRE-FX-3b — adoption: short-deck-trainer quiz feedback




const SUITS = ['♠', '♥', '♦', '♣'];
const UNICODE_TO_SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const SHORT_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6'];

// Explicit page ruleset. Short Deck rooms can use different hand rankings, so
// the quiz never presents these ranking rules as universal across all games.
const RULE_DIFFS = [
  {
    rule: '36 Cards: Ranks Six Through Ace',
    reason: 'This deck removes every two, three, four, and five.',
  },
  {
    rule: 'Nine Cards In Each Suit',
    reason: 'Nine ranks multiplied by four suits makes the 36-card deck.',
  },
  {
    rule: 'A-6-7-8-9 Is The Lowest Straight',
    reason: 'This trainer ruleset lets the ace play below the six.',
  },
  {
    rule: 'Flush Ranks Above Full House',
    reason: 'This is the disclosed ranking used by this trainer; verify a live room’s rules before playing.',
  },
  { rule: 'Each Pocket Pair Has Six Combos', reason: 'Choose any two of the four cards of one rank: C(4,2) = 6.' },
];

// Build 36-card deck
function buildDeck() {
  const deck = [];
  for (const r of SHORT_RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

const BENCHMARK_HANDS = [
  { value: '9c8d', label: '9♣ 8♦ - Connected Benchmark' },
  { value: 'QhJd', label: 'Q♥ J♦ - Broadway Benchmark' },
  { value: 'KhKd', label: 'K♥ K♦ - Premium Pair' },
  { value: 'AhAd', label: 'A♥ A♦ - Top Pair Benchmark' },
];

function unicodeHandToAscii(cards) {
  return cards.map((card) => `${card[0]}${UNICODE_TO_SUIT[card[1]] || card[1]}`).join('');
}

// Generate a quiz question
function generateQuiz(round) {
  const rankShuffle = [...SHORT_RANKS];
  // BUG-07 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort).
  for (let i = rankShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rankShuffle[i], rankShuffle[j]] = [rankShuffle[j], rankShuffle[i]];
  }
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const suitedHero = [`${rankShuffle[0]}${suit}`, `${rankShuffle[1]}${suit}`];

  // Factual questions only. They teach this page's declared ruleset and never
  // claim to be solver output or a hand-specific strategic recommendation.
  const types = [
    {
      q: 'How Many Cards Are In This Short Deck Ruleset?',
      correct: '36',
      options: ['36', '32', '40', '52'],
    },
    {
      q: `Holding ${suitedHero[0]} ${suitedHero[1]}, How Many Cards Of That Suit Remain Unseen?`,
      correct: '7',
      options: ['7', '6', '9', '11'],
      hero: suitedHero,
    },
    { q: 'In This Trainer Ruleset, Does A Flush Beat A Full House?', correct: 'Yes', options: ['Yes', 'No'] },
    {
      q: 'What Is The Lowest Possible Straight In Short Deck?',
      correct: 'A-6-7-8-9',
      options: ['A-6-7-8-9', 'A-2-3-4-5', '6-7-8-9-T', '7-8-9-T-J'],
    },
    {
      q: 'With 36 Cards, How Many Combos Does Each Pocket Pair Have?',
      correct: '6',
      options: ['3', '6', '10', '12'],
    },
  ];
  const t = types[round % types.length];
  return { hero: t.hero || [], question: t.q, correct: t.correct, options: t.options };
}

export default function ShortDeckTrainerPage() {
  const router = useRouter();
  useTrainingBus('short-deck-trainer');
  // TRAIN-WIRE-BOTTOMSHEET-7 — info sheet state
  const [infoOpen, setInfoOpen] = useState(false);
  const fb = useTrainingFeedback();

  // Equity Calculator State
  const [heroCards, setHeroCards] = useState(['A♠', 'K♠']);
  const [villainHand, setVillainHand] = useState('QhJd');
  const [equity, setEquity] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [showRules, setShowRules] = useState(false);

  // Quiz State
  const [mode, setMode] = useState('calc'); // 'calc' | 'quiz'
  const [quiz, setQuiz] = useState(null);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState({ total: 0, correct: 0 });
  const savedMilestoneRef = useRef(0);





  // Random hero hand
  const randomHero = useCallback(() => {
    const deck = buildDeck();
    // BUG-07 FIX: Fisher-Yates shuffle
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setHeroCards([shuffled[0], shuffled[1]]);
    setEquity(null);
  }, []);

  // Equity simulation
  const runSim = useCallback(async () => {
    setSimulating(true);
    setSimulationError('');
    try {
      const response = await authedFetch('/api/training/equity', {
        method: 'POST',
        body: JSON.stringify({
          hands: [unicodeHandToAscii(heroCards), villainHand],
          board: [],
          variant: 'short_deck',
          iterations: 10000,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.results?.[0]) {
        throw new Error(payload.error || `Equity Request Failed (${response.status})`);
      }
      setEquity(Number(payload.results[0].equity).toFixed(1));
    } catch (error) {
      setEquity(null);
      setSimulationError(error.message || 'Unable To Calculate Equity.');
    } finally {
      setSimulating(false);
    }
  }, [heroCards, villainHand]);

  // Quiz mode
  const startQuiz = useCallback(() => {
    setMode('quiz');
    setQuiz(generateQuiz(0));
    setQuizAnswer(null);
    setQuizScore({ total: 0, correct: 0 });
  }, []);

  const answerQuiz = useCallback(
    (option) => {
      if (quizAnswer !== null) return;
      const isCorrect = option === quiz.correct;
      if (isCorrect) fb.correct(); else fb.incorrect();
      setQuizAnswer(option);
      setQuizScore((p) => ({ total: p.total + 1, correct: p.correct + (isCorrect ? 1 : 0) }));
    },
    [quiz, quizAnswer, fb]
  );

  const nextQuiz = useCallback(() => {
    fb.click();
    setQuiz(generateQuiz(quizScore.total));
    setQuizAnswer(null);
  }, [quizScore.total, fb]);

  // Auto-save every 10 questions
  useEffect(() => {
    if (quizScore.total > 0 && quizScore.total % 10 === 0 && savedMilestoneRef.current !== quizScore.total) {
      savedMilestoneRef.current = quizScore.total;
      const saveSession = async () => {
        try {
          const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
          if (!token) return;
          await savePracticeSession('short-deck-trainer', {
              gameId: 'short-deck-quiz',
              gameName: `Short Deck Ruleset Practice (${quizScore.total} Qs)`,
              handsPlayed: quizScore.total,
              correctCount: quizScore.correct,
              context: {
                practiceOnly: true,
                ruleset: '36-card-flush-over-full-house',
              },
          });
        } catch (err) {
          console.warn('[ShortDeck] Save error:', err.message);
        }
      };
      saveSession();
    }
  }, [quizScore.correct, quizScore.total]);

  return (
    <>
      <SEOHead
        title="Short Deck 6+ Holdem Equity Trainer"
        description="Master Short Deck 6+ Holdem Rules, Adjusted Hand Rankings, 36-Card Draw Probabilities, And Hand-Vs-Hand Monte Carlo Equities On Smarter.Poker."
        canonical="/hub/training/short-deck-trainer"
      />
      <BottomSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How Short Deck Trainer Works"
        subtitle="Practice-Only 36-Card Ruleset"
      >
        <div className={s.sheetCopy}>
          <p>
            This Trainer Uses 36 Cards, Ranks Six Through Ace, With A-6-7-8-9
            As The Lowest Straight And <strong>Flush Above Full House</strong>.
            Short Deck Rooms Can Use Different Rankings, So Confirm The Live
            Room’s Rules. Calc Mode Runs A Hand-Vs-Hand Monte Carlo Estimate.
          </p>
          <p>
            Quiz Results Are A Private Practice Note Only. They Do Not Affect
            Account Progress, Rank, Rewards, Or Solver Accuracy.
          </p>
        </div>
      </BottomSheet>

      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead
            slug="training-short-deck-trainer"
            nav={(
              <div className={s.segmented} role="group" aria-label="Trainer Mode">
                {['calc', 'quiz'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => (m === 'quiz' ? startQuiz() : setMode('calc'))}
                    className={`sd-button ${s.button}`}
                  >
                    {m === 'calc' ? 'Equity' : 'Quiz'}
                  </button>
                ))}
              </div>
            )}
          >
            <button type="button" className="sd-button" onClick={() => setInfoOpen(true)}>
              How It Works
            </button>
          </TrainingPageHead>

          {/* Rule Banner */}
          <section className={`sd-panel ${s.panel}`} aria-labelledby="short-deck-ruleset">
            <div className={s.panelHead}>
              <h2 id="short-deck-ruleset" className={s.subTitle}>
                Trainer Ruleset: Flush Ranks Above Full House
              </h2>
              <button
                type="button"
                aria-expanded={showRules}
                onClick={() => setShowRules(!showRules)}
                className={`sd-button ${s.button}`}
              >
                {showRules ? 'Hide Rules' : 'Show All Rules'}
              </button>
            </div>
            <AnimatePresence>
              {showRules && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={s.list}>
                    {RULE_DIFFS.map((r, i) => (
                      <div key={i} className={s.ruleRow}>
                        <p className={`${s.small} ${s.white}`}><strong>{r.rule}</strong></p>
                        <p className={s.small}>{r.reason}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {mode === 'calc' ? (
            /* ●●● EQUITY CALCULATOR MODE ●●● */
            <section className={`sd-panel ${s.panel}`} aria-labelledby="short-deck-equity">
              <h2 id="short-deck-equity" className={s.sectionTitle}>36-Card Equity</h2>
              {/* Hero Cards */}
              <div className={s.cardRow}>
                {heroCards.map((card, i) => (
                  <motion.div key={i} whileHover={{ y: -4 }}>
                    <Card rank={card[0]} suit={UNICODE_TO_SUIT[card[1]] || card[1]} size="large" />
                  </motion.div>
                ))}
              </div>
              <button type="button" onClick={randomHero} className={`sd-button ${s.button}`}>
                Random Hand
              </button>

              {/* Explicit Opponent Hand — the API calculates hand-vs-hand equity. */}
              <label className={s.fieldLabel}>
                Villain Benchmark Hand
                <select
                  aria-label="Short Deck Training Scenario"
                  value={villainHand}
                  onChange={(e) => { setVillainHand(e.target.value); setEquity(null); setSimulationError(''); }}
                  className={s.field}
                >
                  {BENCHMARK_HANDS.map((hand) => <option key={hand.value} value={hand.value}>{hand.label}</option>)}
                </select>
              </label>
              <p className={s.small}>Exact Hand Vs Hand Calculation - Not A Range Estimate</p>

              {/* Run Button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={runSim}
                disabled={simulating}
                className={`sd-button sd-primary ${s.primaryAction}`}
              >
                {simulating ? 'Running Monte Carlo...' : 'Run 36-Card Equity'}
              </motion.button>

              {simulationError && (
                <p role="alert" className={s.error}>
                  {simulationError}
                </p>
              )}

              {/* Equity Result */}
              <AnimatePresence>
                {equity && !simulating && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className={`sd-metric ${s.metric}`}
                  >
                    <span className={s.metricLabel}>
                      Hero Equity Vs {BENCHMARK_HANDS.find((hand) => hand.value === villainHand)?.label || villainHand}
                    </span>
                    <strong className={`${s.metricValue} ${s.bigValue}`} data-tone="ice">
                      {equity}%
                    </strong>
                    <span className={s.small}>
                      Estimated Via Short Deck Monte Carlo (36 Cards)
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          ) : (
            /* ●●● QUIZ MODE ●●● */
            <section className={`sd-panel ${s.panel} ${s.lesson}`} aria-labelledby="short-deck-quiz">
              <h2 id="short-deck-quiz" className={s.sectionTitle}>Ruleset Quiz</h2>
              {/* TRAIN-WIRE-PROGRESS-STRIP-3 — shared ProgressStrip (quiz mode) */}
              {quizScore.total > 0 ? (
                <div className={s.metrics2} aria-label="Quiz Progress">
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Answered</span>
                    <strong className={s.metricValue}>{quizScore.total}</strong>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <span className={s.metricLabel}>Correct</span>
                    <strong className={s.metricValue} data-tone="ice">{quizScore.correct}/{quizScore.total}</strong>
                  </div>
                </div>
              ) : null}

              {quiz && (
                <>
                  {/* Hero Cards Display — present only when the factual question references them. */}
                  {quiz.hero.length > 0 && (
                    <div className={s.cardRow}>
                      {quiz.hero.map((card, i) => (
                        <div key={i}>
                          <Card
                            rank={card[0]}
                            suit={UNICODE_TO_SUIT[card[1]] || card[1]}
                            size="medium"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Question */}
                  <p className={s.subTitle}>{quiz.question}</p>

                  {/* Options */}
                  <div className={s.answers}>
                    {/* TRAIN-WIRE-QUIZ-ANSWER-3 — options via shared QuizAnswer */}
                    {quiz.options.map((opt, idx) => (
                      <QuizAnswer
                        key={opt}
                        label={opt}
                        shortcut={idx + 1}
                        selected={quizAnswer === opt}
                        correct={opt === quiz.correct}
                        show={quizAnswer !== null}
                        onClick={() => answerQuiz(opt)}
                        size="md"
                        style={{ textTransform: 'capitalize' }}
                      />
                    ))}
                  </div>

                  {/* Next */}
                  {quizAnswer !== null && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={nextQuiz}
                      className={`sd-button sd-primary ${s.primaryAction}`}
                    >
                      Next Question
                    </motion.button>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>
      <HubPageSummary page="training-short-deck-trainer" />
    </>
  );
}
