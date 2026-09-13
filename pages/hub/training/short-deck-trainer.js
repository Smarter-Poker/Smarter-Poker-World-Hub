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
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import Card from '../../../src/components/training/Card';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import BottomSheet from '../../../src/components/ui/BottomSheet';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';
import QuizAnswer from '../../../src/components/poker/QuizAnswer';
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
    const s = [...deck];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    setHeroCards([s[0], s[1]]);
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
      <Head>
        <title>Short Deck Trainer | Smarter.Poker</title>
        <meta
          name="description"
          content="Practice one disclosed Short Deck ruleset and run hand-vs-hand Monte Carlo equity estimates."
        />
      </Head>
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #1e0b0b 0%, #0a0a0a 50%, #120808 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <BottomSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          title="How Short Deck Trainer Works"
          subtitle="Practice-Only 36-Card Ruleset"
        >
          <div style={{ padding: '0 4px', color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
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

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(239,68,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: 'none',
                color: 'var(--sp-accent-red)',
                fontSize: 18,
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: 8,
              }}
            >
              ←
            </button>
            <button
              onClick={() => setInfoOpen(true)}
              aria-label="How Short Deck Trainer works"
              style={{
                background: 'rgba(var(--sp-accent-red-rgb), 0.08)',
                border: '1px solid rgba(var(--sp-accent-red-rgb), 0.25)',
                color: 'var(--sp-accent-red)',
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
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                Short Deck (Six Plus)
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-accent-red)' }}>36-Card Dynamics Trainer</div>
            </div>
          </div>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['calc', 'quiz'].map((m) => (
              <button
                key={m}
                onClick={() => (m === 'quiz' ? startQuiz() : setMode('calc'))}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: `1px solid ${mode === m ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                  background: mode === m ? 'rgba(239,68,68,0.08)' : 'transparent',
                  color: mode === m ? 'var(--sp-accent-red)' : 'var(--sp-fg-dim)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {m === 'calc' ? 'Equity' : 'Quiz'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px' }}>
          {/* Rule Banner */}
          <motion.div
            onClick={() => setShowRules(!showRules)}
            style={{
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 24,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-red)' }}>
                Trainer Ruleset: Flush Ranks Above Full House
              </div>
              <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
                {showRules ? '● Hide' : '● Show All'}
              </span>
            </div>
            <AnimatePresence>
              {showRules && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {RULE_DIFFS.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-red)' }}>
                          {r.rule}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
                          {r.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {mode === 'calc' ? (
            /* ●●● EQUITY CALCULATOR MODE ●●● */
            <>
              {/* Hero Cards */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
                {heroCards.map((card, i) => (
                  <motion.div key={i} whileHover={{ y: -4 }}>
                    <Card rank={card[0]} suit={UNICODE_TO_SUIT[card[1]] || card[1]} size="large" />
                  </motion.div>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <button
                  onClick={randomHero}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--sp-fg-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Random Hand
                </button>
              </div>

              {/* Explicit Opponent Hand — the API calculates hand-vs-hand equity. */}
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Villain Benchmark Hand
                </label>
                <select
                  aria-label="Short Deck Training Scenario"
                  value={villainHand}
                  onChange={(e) => { setVillainHand(e.target.value); setEquity(null); setSimulationError(''); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 280,
                    margin: '8px auto',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--sp-fg)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 14,
                    outline: 'none',
                  }}
                >
                  {BENCHMARK_HANDS.map((hand) => <option key={hand.value} value={hand.value}>{hand.label}</option>)}
                </select>
                <div style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>Exact Hand Vs Hand Calculation - Not A Range Estimate</div>
              </div>

              {/* Run Button */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={runSim}
                  disabled={simulating}
                  style={{
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-red-rgb), 1), #b91c1c)',
                    border: 'none',
                    color: '#fff',
                    padding: '14px 32px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 6px 24px rgba(239,68,68,0.3)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {simulating ? 'Running Monte Carlo...' : 'Run 36-Card Equity'}
                </motion.button>
              </div>

              {simulationError && (
                <div role="alert" style={{ margin: '0 auto 18px', maxWidth: 420, color: 'var(--sp-accent-red)', fontSize: 12, lineHeight: 1.5, textAlign: 'center' }}>
                  {simulationError}
                </div>
              )}

              {/* Equity Result */}
              <AnimatePresence>
                {equity && !simulating && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      textAlign: 'center',
                      padding: 24,
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 2,
                        marginBottom: 8,
                      }}
                    >
                      Hero Equity Vs {BENCHMARK_HANDS.find((hand) => hand.value === villainHand)?.label || villainHand}
                    </div>
                    <div
                      style={{
                        fontSize: 64,
                        fontWeight: 900,
                        color: equity > 50 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        letterSpacing: -2,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      {equity}%
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginTop: 8 }}>
                      Estimated Via Short Deck Monte Carlo (36 Cards)
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            /* ●●● QUIZ MODE ●●● */
            <div style={{ textAlign: 'center' }}>
              {/* TRAIN-WIRE-PROGRESS-STRIP-3 — shared ProgressStrip (quiz mode) */}
              {quizScore.total > 0 ? (
                <ProgressStrip
                  current={quizScore.total + 1}
                  total={Math.max(10, Math.ceil((quizScore.total + 1) / 10) * 10)}
                  correct={quizScore.correct}
                  difficulty="intermediate"
                  compact
                  style={{ marginBottom: 16 }}
                />
              ) : null}

              {quiz && (
                <>
                  {/* Hero Cards Display — present only when the factual question references them. */}
                  {quiz.hero.length > 0 && (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}
                    >
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
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--sp-fg)',
                      marginBottom: 20,
                      lineHeight: 1.5,
                      padding: '0 12px',
                    }}
                  >
                    {quiz.question}
                  </div>

                  {/* Options */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      maxWidth: 320,
                      margin: '0 auto',
                    }}
                  >
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
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={nextQuiz}
                      style={{
                        marginTop: 20,
                        padding: '10px 24px',
                        borderRadius: 8,
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: 'var(--sp-accent-red)',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Next Question →
                    </motion.button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
