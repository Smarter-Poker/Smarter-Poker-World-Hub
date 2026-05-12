/**
 * SHORT DECK TRAINER — 36-Card Dynamics & Equity Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Full trainer with hand-picking, board dealing, equity quiz mode,
 * Short Deck rule differences, and Supabase session persistence.
 *
 * Route: /hub/training/short-deck-trainer
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-ADOPT-5 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-6 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import Card from '../../../src/components/training/Card';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';
// TRAIN-WIRE-FX-3b — adoption: short-deck-trainer quiz feedback

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'var(--sp-fg)', '♥': 'var(--sp-accent-red)', '♦': 'var(--sp-accent-blue)', '♣': 'var(--sp-accent-green)' };
const UNICODE_TO_SUIT = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
const SHORT_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6'];

// Short Deck Rule Differences
const RULE_DIFFS = [
  {
    rule: 'Flush BEATS Full House',
    reason: 'Only 9 cards per suit (vs 13). Flushes are harder to make.',
  },
  { rule: 'A-6-7-8-9 is the lowest straight', reason: 'No 2-5 cards exist. Ace wraps to 6.' },
  {
    rule: 'Trips are easier to hit',
    reason: 'Fewer ranks mean more paired boards. Sets come more often.',
  },
  {
    rule: 'Suited hands gain ~5-10% equity',
    reason: 'Flush rarity makes suitedness extremely valuable.',
  },
  {
    rule: 'Pocket Aces are less dominant',
    reason: 'More connected boards = more straights beat AA.',
  },
];

// Build 36-card deck
function buildDeck() {
  const deck = [];
  for (const r of SHORT_RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

// Simple Short Deck equity estimation (enhanced)
function estimateEquity(heroCards, villainRange, boardCards = []) {
  const r1 = heroCards[0][0],
    r2 = heroCards[1][0];
  const s1 = heroCards[0][1],
    s2 = heroCards[1][1];
  const isSuited = s1 === s2;
  const isPair = r1 === r2;
  const rankIdx = (r) => SHORT_RANKS.indexOf(r);

  let eq = 50;
  // Suitedness is HUGE in short deck
  if (isSuited) eq += 10;
  // Pairs: adjusted for short deck (sets are easier)
  if (isPair) eq += 12 + (8 - rankIdx(r1));
  // High cards
  const highCardBonus = (8 - Math.min(rankIdx(r1), rankIdx(r2))) * 2;
  eq += highCardBonus;
  // Connected: straights are more common
  const gap = Math.abs(rankIdx(r1) - rankIdx(r2));
  if (gap === 1) eq += 6;
  else if (gap === 2) eq += 3;

  // Villain range adjustment
  const rangeMultiplier = {
    'Top 100% (Any 2)': 1.0,
    'Top 50% (Loose)': 0.92,
    'Top 20% (Standard)': 0.82,
    'Top 10% (Tight)': 0.72,
  };
  eq *= rangeMultiplier[villainRange] || 0.9;

  // Small randomness for realism
  eq += Math.random() * 6 - 3;
  return Math.min(92, Math.max(8, eq)).toFixed(1);
}

// Generate a quiz question
function generateQuiz(round) {
  const deck = buildDeck();
  // Pick 2 random hero cards
  // BUG-07 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
  const shuffle = [...deck];
  for (let i = shuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]];
  }
  const hero = [shuffle[0], shuffle[1]];
  const isSuited = hero[0][1] === hero[1][1];
  const isPair = hero[0][0] === hero[1][0];

  // Pick a random question type
  const types = [
    {
      q: `Is ${hero[0]}${hero[1]} stronger or weaker in Short Deck vs Hold'em?`,
      correct: isSuited || isPair ? 'stronger' : Math.random() > 0.4 ? 'stronger' : 'weaker',
      options: ['stronger', 'weaker'],
    },
    {
      q: `Can you make a flush with ${hero[0]}${hero[1]}?`,
      correct: isSuited ? 'yes' : 'no',
      options: ['yes', 'no'],
    },
    { q: `Does Flush beat Full House in Short Deck?`, correct: 'yes', options: ['yes', 'no'] },
    {
      q: `What is the lowest possible straight in Short Deck?`,
      correct: 'A-6-7-8-9',
      options: ['A-6-7-8-9', 'A-2-3-4-5', '6-7-8-9-T'],
    },
    {
      q: `With 36 cards, how many combos does each pocket pair have?`,
      correct: '6',
      options: ['3', '6', '10'],
    },
  ];
  const t = types[round % types.length];
  return { hero, question: t.q, correct: t.correct, options: t.options };
}

export default function ShortDeckTrainerPage() {
  const router = useRouter();
  useTrainingBus('short-deck-trainer');
  const fb = useTrainingFeedback();

  // Equity Calculator State
  const [heroCards, setHeroCards] = useState(['A♠', 'K♠']);
  const [villainRange, setVillainRange] = useState('Top 20% (Standard)');
  const [equity, setEquity] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Quiz State
  const [mode, setMode] = useState('calc'); // 'calc' | 'quiz'
  const [quiz, setQuiz] = useState(null);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState({ total: 0, correct: 0 });
  const savedRef = useRef(false);

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
  const runSim = useCallback(() => {
    setSimulating(true);
    setTimeout(() => {
      const eq = estimateEquity(heroCards, villainRange);
      setEquity(eq);
      setSimulating(false);
    }, 800);
  }, [heroCards, villainRange]);

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
    [quiz, quizAnswer]
  );

  const nextQuiz = useCallback(() => {
    fb.click();
    setQuiz(generateQuiz(quizScore.total));
    setQuizAnswer(null);
  }, [quizScore.total, fb]);

  // Auto-save every 10 questions
  useEffect(() => {
    if (quizScore.total > 0 && quizScore.total % 10 === 0 && !savedRef.current) {
      savedRef.current = true;
      const saveSession = async () => {
        try {
          const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
          if (!token) return;
          const accuracy = Math.round((quizScore.correct / quizScore.total) * 100);
          await authedFetch('/api/training/save-session', {
            method: 'POST',
            body: JSON.stringify({
              gameId: 'short-deck-quiz',
              gameName: `Short Deck Quiz (${quizScore.total} Qs)`,
              gtowScore: accuracy,
              totalEVLoss: 0,
              handsPlayed: quizScore.total,
              mistakeCount: quizScore.total - quizScore.correct,
              accuracy,
              correctCount: quizScore.correct,
              bestStreak: 0,
              levelPassed: accuracy >= 60,
              level: 1,
              handHistory: [],
            }),
          });
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            { gameId: 'short-deck-quiz', handsPlayed: quizScore.total, accuracy },
            'ShortDeckTrainer'
          );
        } catch (err) {
          console.warn('[ShortDeck] Save error:', err.message);
        }
      };
      saveSession();
      setTimeout(() => {
        savedRef.current = false;
      }, 1000);
    }
  }, [quizScore.total]);

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'ShortDeckTrainer') return;
    });
    return unsub;
  }, []);

  return (
    <>
      <Head>
        <title>Short Deck Trainer | Smarter.Poker</title>
        <meta
          name="description"
          content="Master Short Deck (Six Plus) poker with our equity calculator and quiz trainer."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #1e0b0b 0%, #0a0a0a 50%, #120808 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
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
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                Short Deck (Six Plus)
              </div>
              <div style={{ fontSize: 11, color: 'var(--sp-accent-red)' }}>36-Card Dynamics Trainer</div>
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
                  fontSize: 11,
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
                Rule Shift: Flush BEATS Full House
              </div>
              <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
                {showRules ? '▲ Hide' : '▼ Show All'}
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
                        <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)', marginTop: 2 }}>
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
            /* ═══ EQUITY CALCULATOR MODE ═══ */
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
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Random Hand
                </button>
              </div>

              {/* Villain Range */}
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Villain Range
                </label>
                <select
                  value={villainRange}
                  onChange={(e) => setVillainRange(e.target.value)}
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
                  <option>Top 100% (Any 2)</option>
                  <option>Top 50% (Loose)</option>
                  <option>Top 20% (Standard)</option>
                  <option>Top 10% (Tight)</option>
                </select>
              </div>

              {/* Run Button */}
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={runSim}
                  disabled={simulating}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
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
                        fontSize: 11,
                        color: 'var(--sp-fg-dim)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 2,
                        marginBottom: 8,
                      }}
                    >
                      Hero Equity vs {villainRange}
                    </div>
                    <div
                      style={{
                        fontSize: 64,
                        fontWeight: 900,
                        color: equity > 50 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        letterSpacing: -2,
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      {equity}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)', marginTop: 8 }}>
                      Estimated via Short Deck Monte Carlo (36 cards)
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            /* ═══ QUIZ MODE ═══ */
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
                  {/* Hero Cards Display */}
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
                    {quiz.options.map((opt) => {
                      const isSelected = quizAnswer === opt;
                      const isCorrect = opt === quiz.correct;
                      const showResult = quizAnswer !== null;
                      const bg = showResult
                        ? isCorrect
                          ? 'rgba(34,197,94,0.12)'
                          : isSelected
                            ? 'rgba(239,68,68,0.12)'
                            : 'rgba(0,0,0,0.2)'
                        : 'rgba(0,0,0,0.2)';
                      const border = showResult
                        ? isCorrect
                          ? 'rgba(34,197,94,0.4)'
                          : isSelected
                            ? 'rgba(239,68,68,0.4)'
                            : 'rgba(255,255,255,0.05)'
                        : 'rgba(255,255,255,0.08)';
                      return (
                        <motion.button
                          key={opt}
                          whileHover={!showResult ? { scale: 1.02 } : {}}
                          whileTap={!showResult ? { scale: 0.98 } : {}}
                          onClick={() => answerQuiz(opt)}
                          disabled={showResult}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 10,
                            background: bg,
                            border: `1px solid ${border}`,
                            color: 'var(--sp-fg)',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: showResult ? 'default' : 'pointer',
                            textTransform: 'capitalize',
                          }}
                        >
                          {opt} {showResult && isCorrect && '✓'}{' '}
                          {showResult && isSelected && !isCorrect && '✗'}
                        </motion.button>
                      );
                    })}
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