/**
 * GTO FLASHCARDS — Spaced Repetition Review
 * ═══════════════════════════════════════════════════════════════════════════
 * Swipeable card deck with GTO concepts. SM-2 Spaced Repetition logic.
 *
 * Route: /hub/training/flashcards
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-ADOPT-6 — adoption of --sp-* token contract from PR #470
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';

// TRAIN-CSS-MOTION-ADOPT-13 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-8a — adoption: shared empty-state primitive

const CARDS = [
  // Original 30
  {
    id: 1,
    cat: 'Preflop',
    q: 'What is the standard open raise size from any position?',
    a: '2.5x the Big-Blind (2.5BB). Larger sizes from EP are outdated.',
  },
  {
    id: 2,
    cat: 'Preflop',
    q: 'What does "RFI" stand for?',
    a: 'Raise First In — you are the first player to voluntarily enter the pot with a raise.',
  },
  {
    id: 3,
    cat: 'Preflop',
    q: 'Which position has the tightest opening range?',
    a: 'UTG (Under The Gun). Typically opens ~15% of hands in 6-max.',
  },
  {
    id: 4,
    cat: 'Preflop',
    q: 'What is a 3-bet?',
    a: 'A re-raise over an initial raise. The blinds count as the first "bet", the open raise is the second.',
  },
  {
    id: 5,
    cat: 'Math',
    q: 'What pot odds do you need to call a half-pot bet?',
    a: '25% equity (risk $0.50 to win $1.50 total = 0.5/2.0 = 25%).',
  },
  {
    id: 6,
    cat: 'Math',
    q: 'What is MDF (Minimum Defense Frequency)?',
    a: '1 - (bet size / (pot + bet size)). The minimum frequency you must defend to prevent villain from auto-profiting.',
  },
  {
    id: 7,
    cat: 'Math',
    q: 'What is the Rule of 2 and 4?',
    a: 'Multiply outs by 2 on the flop (1 card) or 4 (2 cards) for approximate equity percentage.',
  },
  {
    id: 8,
    cat: 'Postflop',
    q: 'What is SPR?',
    a: 'Stack-to-Pot Ratio = Effective Stack / Pot Size. Low SPR (<3) favors commitment, high SPR (>10) favors drawing hands.',
  },
  {
    id: 9,
    cat: 'Postflop',
    q: 'When should you c-bet at a high frequency?',
    a: 'On dry, disconnected boards (e.g., K-7-2 rainbow) where the preflop raiser has a range advantage.',
  },
  {
    id: 10,
    cat: 'Postflop',
    q: 'What does "range advantage" mean?',
    a: "When your range of possible hands is stronger than your opponent's on a given board texture.",
  },
  {
    id: 11,
    cat: 'Theory',
    q: 'What is a polarized range?',
    a: 'A range containing only very strong hands (value) and bluffs, with no medium-strength hands.',
  },
  {
    id: 12,
    cat: 'Theory',
    q: 'What is a merged (linear) range?',
    a: 'A range of strong to medium-strength hands betting for value, without pure bluffs.',
  },
  {
    id: 13,
    cat: 'Theory',
    q: 'What is a balanced strategy?',
    a: 'A strategy that is unexploitable — opponent cannot gain EV by adjusting their strategy against it.',
  },
  {
    id: 14,
    cat: 'Theory',
    q: 'What does GTO stand for?',
    a: 'Game Theory Optimal — a strategy based on Nash Equilibrium that cannot be exploited.',
  },
  {
    id: 15,
    cat: 'Postflop',
    q: 'What is a blocking bet?',
    a: 'A small bet designed to prevent your opponent from making a larger bet. Generally -EV in GTO play.',
  },
  {
    id: 16,
    cat: 'Math',
    q: 'How many combos of unpaired hands are there?',
    a: '16 total: 4 suited + 12 offsuit.',
  },
  {
    id: 17,
    cat: 'Math',
    q: 'How many combos of a pocket pair are there?',
    a: '6 combos (e.g., AA: AsAh, AsAd, AsAc, AhAd, AhAc, AdAc).',
  },
  {
    id: 18,
    cat: 'Preflop',
    q: 'What is the standard 3-bet size in position?',
    a: '3x the open raise size. OOP, use 3.5-4x.',
  },
  {
    id: 19,
    cat: 'Postflop',
    q: 'What are the 3 common bet sizes in GTO?',
    a: '33% pot (small), 66-75% pot (medium), 100%+ pot (large/overbet).',
  },
  {
    id: 20,
    cat: 'Theory',
    q: 'What is ICM?',
    a: 'Independent Chip Model — converts tournament chips to real-money equity based on payout structure.',
  },
  {
    id: 21,
    cat: 'Preflop',
    q: 'What is a squeeze play?',
    a: 'A 3-bet made after an open raise AND a cold call, squeezing both players.',
  },
  {
    id: 22,
    cat: 'Postflop',
    q: 'What is a donk bet?',
    a: 'A bet from the out-of-position player into the preflop aggressor. Rarely correct in GTO.',
  },
  {
    id: 23,
    cat: 'Theory',
    q: 'What is a node in a game tree?',
    a: 'A decision point where a player must choose an action (bet, check, fold, etc.).',
  },
  {
    id: 24,
    cat: 'Math',
    q: 'What equity does top pair typically have vs a flush draw on the flop?',
    a: 'Approximately 65% vs 35% (flush draw has ~9 outs = ~35% to complete by river).',
  },
  {
    id: 25,
    cat: 'Postflop',
    q: 'When should you use an overbet?',
    a: 'On turns/rivers that heavily favor your range (nut advantage), especially with polarized hands.',
  },
  {
    id: 26,
    cat: 'Theory',
    q: 'What is nodelocking?',
    a: "Fixing an opponent's strategy at a specific node to see how the GTO solution changes for the other player.",
  },
  {
    id: 27,
    cat: 'Preflop',
    q: 'What is the BTN opening range in 6-max?',
    a: 'Approximately 45-50% of hands — the widest opening range at the table.',
  },
  {
    id: 28,
    cat: 'Math',
    q: 'What is the breakeven percentage for a pot-sized bluff?',
    a: '50%. You risk the pot to win the pot: pot / (pot + pot) = 50%.',
  },
  {
    id: 29,
    cat: 'Math',
    q: 'How do you calculate EV?',
    a: 'EV = (Win% × $ Won) - (Lose% × $ Lost). Positive EV = profitable long-term.',
  },
  {
    id: 30,
    cat: 'Theory',
    q: 'What is an exploitative adjustment?',
    a: "Deviating from GTO to target a specific opponent's mistakes for higher EV.",
  },

  // New 20 Cards
  {
    id: 31,
    cat: 'Theory',
    q: 'What is the definition of a mixed frequency strategy?',
    a: 'Taking different actions (e.g., betting vs checking) with the exact same hand to remain balanced and unexploitable.',
  },
  {
    id: 32,
    cat: 'Theory',
    q: 'What is a solver?',
    a: 'A software program that computes GTO strategies by running millions of simulations to find the Nash Equilibrium for a specific scenario.',
  },
  {
    id: 33,
    cat: 'Preflop',
    q: 'How does stack size affect a 3-betting range?',
    a: 'Shallower stacks (e.g., 30BB) incentivize a more linear/value-heavy 3-bet range. Deeper stacks (100BB+) allow for more polarized 3-bets.',
  },
  {
    id: 34,
    cat: 'Postflop',
    q: 'Why is it often a mistake to lead out (donk bet) when the flop completes a flush?',
    a: 'The preflop aggressor usually still has a range advantage, and donk betting makes it harder to balance your checking range.',
  },
  {
    id: 35,
    cat: 'Math',
    q: 'What is the probability of flopping a set with a pocket pair?',
    a: 'Approximately 11.8% or roughly 1 in 8 times.',
  },
  {
    id: 36,
    cat: 'Postflop',
    q: 'What makes a flop texture "wet" vs "dry"?',
    a: 'Wet boards (e.g., Jc-Tc-9s) offer many straight/flush draws. Dry boards (e.g., K-7-2 rainbow) offer very few or no obvious draws.',
  },
  {
    id: 37,
    cat: 'Theory',
    q: 'What is a minimum defense frequency (MDF) application on the river?',
    a: 'If villain overbets the pot (e.g., 200%), MDF dictates you must defend less frequently (33.3%) compared to a 50% pot bet (66.7%).',
  },
  {
    id: 38,
    cat: 'Math',
    q: 'If you have a flush draw on the flop, what are your odds of hitting it by the river?',
    a: 'About 35% (9 outs twice).',
  },
  {
    id: 39,
    cat: 'Preflop',
    q: 'What is a 4-bet bluff typical candidate?',
    a: 'A hand like A5s that blocks Villains AA/AK value range and has decent equity when called.',
  },
  {
    id: 40,
    cat: 'Postflop',
    q: 'What does "check-raise polarized" mean?',
    a: 'Your check-raising range consists primarily of very strong value hands (sets/two pair) and high-equity semi-bluffs (draws).',
  },
  {
    id: 41,
    cat: 'Theory',
    q: 'How does position affect VPIP?',
    a: 'VPIP should increase significantly from early position to late position as positional advantage increases.',
  },
  {
    id: 42,
    cat: 'Math',
    q: 'How do you calculate pot odds as a ratio?',
    a: 'Amount to call : Current pot size + amount to call. E.g. call $10 to win $30 total pot = 10:30 or 1:3 = 25%.',
  },
  {
    id: 43,
    cat: 'Preflop',
    q: 'Why do we use a smaller opening size (e.g. 2x) in tournaments compared to cash games?',
    a: 'Shallower effective stacks in MTTs make smaller sizes mathematically superior for risk-to-reward on steals.',
  },
  {
    id: 44,
    cat: 'Postflop',
    q: 'In a 3-bet pot, why do we use smaller c-bet sizes on average?',
    a: 'The SPR is lower, so less money is needed to commit stacks by the river; smaller bets achieve the necessary leverage.',
  },
  {
    id: 45,
    cat: 'Theory',
    q: 'What is the concept of "equity realization" (EQR)?',
    a: "How much of a hand's raw equity can actually be captured in a game due to postflop playability, position, and skill.",
  },
  {
    id: 46,
    cat: 'Postflop',
    q: 'What is "floating"?',
    a: 'Calling a bet with a weak hand/draw with the intention of taking the pot away on a later street.',
  },
  {
    id: 47,
    cat: 'Theory',
    q: 'Why is A-K offsuit less valuable than A-K suited?',
    a: 'Suitedness adds about 2-3% raw equity but significantly increases EQR and playability postflop due to flush potential.',
  },
  {
    id: 48,
    cat: 'Math',
    q: 'What is the required success frequency for a 1/2 pot bluff to break even?',
    a: '33.3% (0.5 / 1.5).',
  },
  {
    id: 49,
    cat: 'Preflop',
    q: 'What is a typical defense frequency from the Big-Blind facing a BTN 2.5x open?',
    a: 'Very wide, typically 40-50%+ due to closing the action and getting good pot odds.',
  },
  {
    id: 50,
    cat: 'Postflop',
    q: 'What is a "delayed c-bet"?',
    a: 'Checking the flop as the preflop aggressor and then betting the turn when checked to.',
  },
];

const CAT_COLORS = { Preflop: 'var(--sp-accent-blue)', Postflop: 'var(--sp-accent-green)', Math: 'var(--sp-accent-amber)', Theory: 'var(--sp-accent-purple)' };

function calculateSM2(quality, prevInterval = 0, prevEase = 2.5) {
  let ease = prevEase;
  let interval = prevInterval;

  if (quality === 0) {
    // Hard / Again
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (quality === 1) {
    // Medium / Good
    interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
    // ease stays same
  } else if (quality === 2) {
    // Easy / Perfect
    interval = interval === 0 ? 2 : interval === 1 ? 4 : Math.round(interval * ease * 1.3);
    ease += 0.15;
  }
  return { interval, ease, nextReview: Date.now() + interval * 86400000 };
}

function formatInterval(days) {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

function previewInterval(quality, sm2Data, cardId) {
  const prev = sm2Data[cardId] || { interval: 0, ease: 2.5 };
  const next = calculateSM2(quality, prev.interval, prev.ease);
  return formatInterval(next.interval);
}

export default function FlashcardsPage() {
  const router = useRouter();
  useTrainingBus('flashcards');

  // state = { [id]: { interval, ease, nextReview } }
  const [sm2Data, setSm2Data] = useState({});
  const [catFilter, setCatFilter] = useState('all');

  const [sessionDeck, setSessionDeck] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Track deck generation trigger — only category filter change should regenerate
  const [deckGenKey, setDeckGenKey] = useState(0);
  const sm2LoadedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('flashcard-sm2');
      if (saved) setSm2Data(JSON.parse(saved));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    // Trigger initial deck generation after sm2Data loads
    sm2LoadedRef.current = true;
    setDeckGenKey(k => k + 1);
  }, []);

  // Regenerate deck when category changes (NOT on sm2Data changes from card ratings)
  useEffect(() => {
    if (!sm2LoadedRef.current) return; // Wait for initial sm2 load
    setDeckGenKey(k => k + 1);
  }, [catFilter]);

  // Generate today's review deck based on due date
  useEffect(() => {
    if (deckGenKey === 0) return; // Skip initial render before sm2 load
    const now = Date.now();
    const currentSm2 = sm2Data; // Read current sm2Data at generation time
    const deck = CARDS.filter((c) => {
      if (catFilter !== 'all' && c.cat !== catFilter) return false;
      const stats = currentSm2[c.id];
      if (!stats) return true; // New card
      return stats.nextReview <= now; // Due for review
    });

    // BUG-09 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setSessionDeck(deck);
    setCurrentIdx(0);
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckGenKey]);

  const stats = useMemo(() => {
    let newCount = 0,
      learning = 0,
      mastered = 0,
      dueCount = 0;
    const now = Date.now();
    CARDS.forEach((c) => {
      const s = sm2Data[c.id];
      if (!s) { newCount++; dueCount++; }
      else if (s.interval >= 21) mastered++;
      else learning++;
      if (s && s.nextReview <= now) dueCount++;
    });
    return { newCount, learning, mastered, dueCount };
  }, [sm2Data]);

  const current = sessionDeck[currentIdx];
  const progress = sessionDeck.length > 0 ? Math.round((currentIdx / sessionDeck.length) * 100) : 0;

  const manualAdvance = (quality) => {
    if (!current) return;
    const prev = sm2Data[current.id] || { interval: 0, ease: 2.5 };
    const nextStats = calculateSM2(quality, prev.interval, prev.ease);

    setSm2Data((prevData) => {
      const updated = { ...prevData, [current.id]: nextStats };
      try {
        localStorage.setItem('flashcard-sm2', JSON.stringify(updated));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      return updated;
    });

    setFlipped(false);
    if (currentIdx < sessionDeck.length) setCurrentIdx(currentIdx + 1);
  };

  return (
    <>
      <Head>
        <title>Flashcards | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
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
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>GTO Flashcards</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Spaced Repetition (SM-2)</div>
          </div>
        </div>

        {/* Stats Bar */}
        <div
          style={{
            background: 'rgba(0,0,0,0.2)',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'center',
            gap: 24,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-blue)' }}>{stats.newCount}</div>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>New</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-amber)' }}>{stats.learning}</div>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Learning
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-green)' }}>{stats.mastered}</div>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Mastered
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-orange)' }}>{stats.dueCount}</div>
            <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Due
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 500, margin: '0 auto' }}>
          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['all', 'Preflop', 'Postflop', 'Math', 'Theory'].map((c) => (
              <motion.button
                key={c}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCatFilter(c)}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: 6,
                  border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: catFilter === c ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c === 'all' ? 'All' : c}
              </motion.button>
            ))}
          </div>

          {/* Progress (TRAIN-WIRE-PROGRESS-STRIP-2: shared ProgressStrip) */}
          {sessionDeck.length > 0 && currentIdx < sessionDeck.length ? (
            <ProgressStrip
              current={currentIdx + 1}
              total={sessionDeck.length}
              difficulty="intermediate"
              compact
              style={{ marginBottom: 20 }}
            />
          ) : null}

          {/* Card */}
          {current && currentIdx < sessionDeck.length ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentIdx}-${flipped}`}
                initial={{ opacity: 0, rotateY: flipped ? 180 : 0 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: MOTION.standard }}
                onClick={() => !flipped && setFlipped(true)}
                style={{
                  minHeight: 220,
                  padding: '28px 24px',
                  borderRadius: 18,
                  cursor: flipped ? 'default' : 'pointer',
                  background: flipped
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))'
                    : 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(139,92,246,0.04))',
                  border: `1px solid ${flipped ? 'rgba(34,197,94,0.15)' : 'rgba(0,212,255,0.12)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: `${CAT_COLORS[current.cat] || 'var(--sp-fg-dim)'}15`,
                      color: CAT_COLORS[current.cat] || 'var(--sp-fg-dim)',
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {current.cat}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--sp-fg-faint)' }}>
                    {currentIdx + 1}/{sessionDeck.length} Today
                  </span>
                  {(() => {
                    const s = sm2Data[current.id];
                    let label = 'New', bg = 'rgba(59,130,246,0.1)', clr = 'var(--sp-accent-blue)';
                    if (s) {
                      if (s.interval >= 21) { label = 'Mastered'; bg = 'rgba(34,197,94,0.1)'; clr = 'var(--sp-accent-green)'; }
                      else if (s.interval >= 3) { label = 'Review'; bg = 'rgba(249,115,22,0.1)'; clr = 'var(--sp-accent-orange)'; }
                      else { label = 'Learning'; bg = 'rgba(251,191,36,0.1)'; clr = 'var(--sp-accent-amber)'; }
                    }
                    return (
                      <span style={{ padding: '2px 6px', borderRadius: 4, background: bg, color: clr, fontSize: 8, fontWeight: 700, textTransform: 'uppercase' }}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                {!flipped ? (
                  <>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--sp-fg)',
                        lineHeight: 1.5,
                        marginBottom: 16,
                      }}
                    >
                      {current.q}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sp-fg-faint)', textAlign: 'center' }}>
                      Tap to reveal answer
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', lineHeight: 1.6 }}>{current.a}</div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div>
              <TrainerEmptyState
                variant="complete"
                title="All caught up"
                message="You've reviewed all due cards for this category today."
                compact
              />
              {/* Mastery Progress */}
              <div
                style={{
                  marginTop: 24,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(74,222,128,0.1)',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-accent-green)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  Mastery Progress
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${CARDS.length > 0 ? (stats.mastered / CARDS.length) * 100 : 0}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: 'linear-gradient(90deg, #4ade80, #22c55e)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                  {stats.mastered}/{CARDS.length} cards mastered (21+ day interval)
                </div>
              </div>
            </div>
          )}

          {/* SM-2 Rating Buttons */}
          {current && flipped && currentIdx < sessionDeck.length && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => manualAdvance(0)}
                style={{
                  flex: 1,
                  padding: '14px 4px',
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,0.2)',
                  background: 'rgba(239,68,68,0.06)',
                  color: '#f87171',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Hard
                <span
                  style={{
                    fontSize: 9,
                    display: 'block',
                    color: 'rgba(248,113,113,0.6)',
                    marginTop: 2,
                  }}
                >
                  {current ? previewInterval(0, sm2Data, current.id) : 'Today'}
                </span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => manualAdvance(1)}
                style={{
                  flex: 1,
                  padding: '14px 4px',
                  borderRadius: 12,
                  border: '1px solid rgba(251,191,36,0.2)',
                  background: 'rgba(251,191,36,0.06)',
                  color: 'var(--sp-accent-amber)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Good
                <span
                  style={{
                    fontSize: 9,
                    display: 'block',
                    color: 'rgba(251,191,36,0.6)',
                    marginTop: 2,
                  }}
                >
                  {current ? previewInterval(1, sm2Data, current.id) : '1 day'}
                </span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => manualAdvance(2)}
                style={{
                  flex: 1,
                  padding: '14px 4px',
                  borderRadius: 12,
                  border: '1px solid rgba(34,197,94,0.2)',
                  background: 'rgba(34,197,94,0.06)',
                  color: 'var(--sp-accent-green)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Easy
                <span
                  style={{
                    fontSize: 9,
                    display: 'block',
                    color: 'rgba(74,222,128,0.6)',
                    marginTop: 2,
                  }}
                >
                  {current ? previewInterval(2, sm2Data, current.id) : '2 days'}
                </span>
              </motion.button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}