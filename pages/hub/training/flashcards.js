/**
 * GTO FLASHCARDS — Spaced Repetition Review
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Swipeable card deck with GTO concepts. SM-2 Spaced Repetition logic.
 *
 * Route: /hub/training/flashcards
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-ADOPT-6 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-TOKENS-BATCH5-15 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-12 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ProgressStrip from '../../../src/components/poker/ProgressStrip';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
const DEFAULT_MISTAKE_QUEUE = [
  {
    questionId: 'cash-002-flop-btn-bb-ak',
    gameId: 'cash-002',
    variant: 'nlh',
    level: 1,
    prompt: 'BTN Single-Raised Pot On Kc-8d-3s Flop With Top Pair Top Kicker',
    correctAction: 'b33',
    explanation: 'Small range continuation bet leverages range advantage on a dry king-high texture.',
    evLossBb: 1.35,
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
  {
    questionId: 'cash-004-turn-bb-btn-xr',
    gameId: 'cash-004',
    variant: 'nlh',
    level: 1,
    prompt: 'BB Check-Raise Defense On Turn 5h After Calling Dry Flop C-Bet',
    correctAction: 'c',
    explanation: 'Protect checking range with medium-strength showdown hands against second barrel.',
    evLossBb: 0.92,
    intervalDays: 2,
    easeFactor: 2.4,
    repetitions: 1,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
  {
    questionId: 'mtt-001-preflop-sb-bb-icm',
    gameId: 'mtt-001',
    variant: 'nlh',
    level: 2,
    prompt: '20BB Bubble Blind Battle From Small-Blind Under Heavy ICM Pressure',
    correctAction: 'f',
    explanation: 'Elevated bubble factor penalizes marginal offsuit shoves into covering Big-Blind stack.',
    evLossBb: 1.78,
    intervalDays: 1,
    easeFactor: 2.3,
    repetitions: 0,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
  {
    questionId: 'plo8-scoop-thresholds-flop-bb',
    gameId: 'cash-005',
    variant: 'plo8',
    level: 2,
    prompt: 'Nut Low + Redraw Scoop Thresholds On 7s-5d-2c Flop Holding As-2s-Kd-3d',
    correctAction: 'b100',
    explanation: 'Pot-raising nut low with emergency 3-low backup and nut spade flush redraw freerolls one-way lows for the entire pot.',
    evLossBb: 1.64,
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
  {
    questionId: 'plo8-quartering-avoidance-multiway',
    gameId: 'cash-005',
    variant: 'plo8',
    level: 2,
    prompt: 'Quartering Avoidance In Multiway PLO8 Pots With Naked A-2 On Paired Low Board',
    correctAction: 'f',
    explanation: 'Calling pot-sized raises in 3-way pots with bare nut low and zero high equity risks losing 25% of your investment when quartered.',
    evLossBb: 1.48,
    intervalDays: 1,
    easeFactor: 2.4,
    repetitions: 0,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
  {
    questionId: 'plo8-fixed-limit-4-raise-cap-turn',
    gameId: 'cash-005',
    variant: 'plo8',
    level: 3,
    prompt: 'Fixed-Limit 4-Raise Cap & Big-Bet Turn Defense In Split-Pot Hi-Lo',
    correctAction: 'c',
    explanation: 'When the turn doubles to a full Big-Bet under a 4-raise cap, preserve call frequency with two-way draws rather than capping one-way.',
    evLossBb: 1.12,
    intervalDays: 2,
    easeFactor: 2.5,
    repetitions: 1,
    nextReviewAt: '2026-11-24T00:00:00.000Z',
  },
];

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
    a: 'Raise First In - you are the first player to voluntarily enter the pot with a raise.',
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
    a: 'A strategy that is unexploitable - opponent cannot gain EV by adjusting their strategy against it.',
  },
  {
    id: 14,
    cat: 'Theory',
    q: 'What does GTO stand for?',
    a: 'Game Theory Optimal - a strategy based on Nash Equilibrium that cannot be exploited.',
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
    a: 'Independent Chip Model - converts tournament chips to real-money equity based on payout structure.',
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
    a: 'Approximately 45-50% of hands - the widest opening range at the table.',
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
  {
    id: 51,
    cat: 'PLO8',
    variant: 'plo8',
    q: 'Nut Low + Redraw Scoop Thresholds: When should you pot-raise a made nut low in PLO8?',
    a: 'Pot-raise when your nut A-2 low is backed by an emergency low redraw (A-2-3) or high equity (nut flush draw or set) to freeroll one-way lows.',
  },
  {
    id: 52,
    cat: 'PLO8',
    variant: 'plo8',
    q: 'Quartering Avoidance In Multiway PLO8 Pots: Why is calling big bets with a naked A-2 dangerous?',
    a: 'In multiway pots, bare A-2 with zero high equity frequently gets quartered (winning only 25% of the pot while contributing 33% to 50%).',
  },
  {
    id: 53,
    cat: 'PLO8',
    variant: 'plo8',
    q: 'Fixed-Limit 4-Raise Cap & Big-Bet Turn Defense: How does the turn bet doubling affect Hi-Lo defense?',
    a: 'Because the turn escalates to a full Big-Bet under a 4-raise cap, you must defend two-way draws via calling and reserve 4-bet caps for 58%+ scoop equity.',
  },
];

const CAT_COLORS = { Preflop: 'var(--sp-accent-blue)', Postflop: 'var(--sp-accent-green)', Math: '#86daff', Theory: '#7dd3fc', PLO8: 'var(--sp-accent-cyan)' };

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
  const userInteractedRef = useRef(false);
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');
  const [mistakeCards, setMistakeCards] = useState(DEFAULT_MISTAKE_QUEUE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('flashcard-sm2');
      if (saved) setSm2Data(JSON.parse(saved));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    // Trigger initial deck generation after sm2Data loads
    sm2LoadedRef.current = true;
    setDeckGenKey(k => k + 1);
    authedFetch('/api/training/tool-records?tool_id=flashcards&limit=50')
      .then((res) => (res && res.ok ? res.json() : null))
      .then((json) => {
        const rows = Array.isArray(json?.records) ? json.records : Array.isArray(json?.data) ? json.data : [];
        const remoteSm2 = rows[0]?.payload?.sm2Data || rows[0]?.payload?.sm2Snapshot || rows[0]?.data?.sm2Data || rows[0]?.data?.sm2Snapshot;
        if (remoteSm2 && typeof remoteSm2 === 'object') {
          setSm2Data((prev) => {
            const merged = { ...remoteSm2 };
            Object.entries(prev || {}).forEach(([cardId, localEntry]) => {
              const remoteEntry = merged[cardId];
              if (!remoteEntry) {
                merged[cardId] = localEntry;
              } else {
                const localNext = Number(localEntry?.nextReview || 0);
                const remoteNext = Number(remoteEntry?.nextReview || 0);
                const localReps = Number(localEntry?.reps || localEntry?.interval || 0);
                const remoteReps = Number(remoteEntry?.reps || remoteEntry?.interval || 0);
                if (localNext > remoteNext || (localNext === remoteNext && localReps > remoteReps)) {
                  merged[cardId] = localEntry;
                }
              }
            });
            try {
              localStorage.setItem('flashcard-sm2', JSON.stringify(merged));
            } catch (_e) {}
            return merged;
          });
          if (!userInteractedRef.current) {
            setDeckGenKey((k) => k + 1);
          }
        }
      })
      .catch(() => {});
    authedFetch('/api/training/tool-records?tool_id=flashcard-srs&limit=25')
      .then((res) => (res && res.ok ? res.json() : null))
      .then((json) => {
        const rows = Array.isArray(json?.records) ? json.records : Array.isArray(json?.data) ? json.data : [];
        const parsedMistakes = rows
          .map((row) => row?.payload || row?.data || null)
          .filter((item) => item && (item.questionId || item.prompt))
          .map((item, idx) => ({
            questionId: String(item.questionId || `mistake-card-${idx + 1}`),
            gameId: String(item.gameId || 'cash-002'),
            level: Number(item.level) || 1,
            prompt: String(item.prompt || 'GTO Training Spot'),
            correctAction: String(item.correctAction || 'Check / Call'),
            explanation: String(item.explanation || ''),
            evLossBb: Number(Number(item.evLossBb ?? 0.75).toFixed(2)),
            intervalDays: Number(item.intervalDays) || 1,
            easeFactor: Number(item.easeFactor) || 2.5,
            repetitions: Number(item.repetitions) || 0,
            nextReviewAt: String(item.nextReviewAt || '2026-11-24T00:00:00.000Z'),
          }));
        if (parsedMistakes.length > 0) {
          setMistakeCards(parsedMistakes);
        }
      })
      .catch(() => {});
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
    userInteractedRef.current = true;
    const prev = sm2Data[current.id] || { interval: 0, ease: 2.5 };
    const nextStats = calculateSM2(quality, prev.interval, prev.ease);

    setSm2Data((prevData) => {
      const updated = { ...prevData, [current.id]: nextStats };
      try {
        localStorage.setItem('flashcard-sm2', JSON.stringify(updated));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      authedFetch('/api/training/tool-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: 'flashcards',
          record_key: 'sm2_state',
          record_type: 'sm2_review',
          title: `Card #${current.id} (${current.cat})`,
          summary: `Quality ${quality} · Interval ${nextStats.interval}d`,
          payload: {
            cardId: current.id,
            category: current.cat,
            quality,
            nextStats,
            sm2Data: updated,
            sm2Snapshot: updated,
          },
        }),
      }).catch(() => {});
      return updated;
    });

    setFlipped(false);
    if (currentIdx < sessionDeck.length) setCurrentIdx(currentIdx + 1);
  };

  return (
    <>
      <SEOHead
        title="Spaced-Repetition GTO Flashcards"
        description="Memorize GTO Preflop Ranges, Pot Odds Math, And Postflop Strategy Using SuperMemo SM-2 Spaced-Repetition Poker Flashcards On Smarter.Poker."
        canonical="/hub/training/flashcards"
      />
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <TrainingPageHead slug="training-flashcards" note="Spaced Repetition (SM-2)" />

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
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>New</div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#86daff' }}>{stats.learning}</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Learning
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-green)' }}>{stats.mastered}</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Mastered
            </div>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#86daff' }}>{stats.dueCount}</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
              Due
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 500, margin: '0 auto' }}>
          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {['all', 'Preflop', 'Postflop', 'Math', 'Theory', 'PLO8'].map((c) => (
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
                  fontSize: 12,
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
                onClick={() => {
                  if (!flipped) {
                    userInteractedRef.current = true;
                    setFlipped(true);
                  }
                }}
                style={{
                  minHeight: 220,
                  padding: '28px 24px',
                  borderRadius: 18,
                  cursor: flipped ? 'default' : 'pointer',
                  background: flipped
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))'
                    : 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(134, 218, 255, 0.04))',
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
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    {current.cat}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--sp-fg-faint)' }}>
                    {currentIdx + 1}/{sessionDeck.length} Today
                  </span>
                  {(() => {
                    const s = sm2Data[current.id];
                    let label = 'New', bg = 'rgba(59,130,246,0.1)', clr = 'var(--sp-accent-blue)';
                    if (s) {
                      if (s.interval >= 21) { label = 'Mastered'; bg = 'rgba(34,197,94,0.1)'; clr = 'var(--sp-accent-green)'; }
                      else if (s.interval >= 3) { label = 'Review'; bg = 'rgba(134,218,255,0.12)'; clr = '#86daff'; }
                      else { label = 'Learning'; bg = 'rgba(134,218,255,0.12)'; clr = '#86daff'; }
                    }
                    return (
                      <span style={{ padding: '2px 6px', borderRadius: 4, background: bg, color: clr, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
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
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', textAlign: 'center' }}>
                      Tap To Reveal Answer
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
                title="All Caught Up"
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
                    fontSize: 12,
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
                      background: 'linear-gradient(90deg, rgba(var(--sp-accent-green-rgb), 1), rgba(var(--sp-accent-green-rgb), 1))',
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>
                  {stats.mastered}/{CARDS.length} Cards Mastered (21+ Day Interval)
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
                  color: 'var(--sp-accent-red)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Hard
                <span
                  style={{
                    fontSize: 12,
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
                  border: '1px solid rgba(134, 218, 255, 0.2)',
                  background: 'rgba(134, 218, 255, 0.06)',
                  color: '#86daff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Good
                <span
                  style={{
                    fontSize: 12,
                    display: 'block',
                    color: '#86daff',
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
                    fontSize: 12,
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

          {/* My Live Session Mistake Flashcards (SM-2 Queue) */}
          <div
            data-mistake-srs-queue="true"
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 14,
              border: '1px solid rgba(248, 113, 113, 0.3)',
              background: 'rgba(15, 23, 42, 0.75)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fca5a5' }}>
                  My Live Session Mistake Flashcards (SM-2 Queue)
                </div>
                <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
                  Auto-Enqueued Hands With 0.50+ BB EV Loss From Live Training Sessions
                </div>
              </div>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {mistakeCards.length} Queued Cards
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mistakeCards
                .filter((card) => (catFilter === 'PLO8' || activeVariant === 'plo8' ? (card.variant === 'plo8' || String(card.questionId || '').startsWith('plo8')) : true))
                .map((card) => {
                const cardVariant = card.variant || activeVariant;
                const drillHref = buildCustomTrainingArenaHref(
                  {
                    gameId: card.gameId || 'cash-002',
                    variant: cardVariant,
                    street: activeStreet,
                    position: heroPosition,
                  },
                  'flashcards-mistake-srs',
                );
                return (
                  <div
                    key={card.questionId}
                    data-mistake-srs-card={card.questionId}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: 'rgba(2, 6, 23, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#7dd3fc' }}>
                        {String(card.gameId || 'cash-002').toUpperCase()} · Level {card.level || 1}
                      </span>
                      <span
                        data-mistake-ev-loss-bb={card.evLossBb}
                        style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'rgba(239, 68, 68, 0.16)',
                          color: '#f87171',
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        -{Number(card.evLossBb || 0).toFixed(2)} BB EV Loss
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 4 }}>
                      {card.prompt}
                    </div>
                    <div style={{ fontSize: 12, color: '#86efac', fontWeight: 700, marginBottom: 4 }}>
                      Optimal Action: {String(card.correctAction || '').toUpperCase()} · Interval: {card.intervalDays}d · Ease: {Number(card.easeFactor || 2.5).toFixed(1)}
                    </div>
                    {card.explanation ? (
                      <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginBottom: 10, lineHeight: 1.45 }}>
                        {card.explanation}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      data-drill-mistake-card-cta="true"
                      onClick={() => router.push(drillHref)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(56, 189, 248, 0.45)',
                        background: 'rgba(56, 189, 248, 0.16)',
                        color: '#e0f2fe',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Drill This Mistake On Club Arena Felt →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4-Variant Horse Brain Spot Preview & 1-Click Club Arena Launcher */}
        </div>
      </div>
      <HubPageSummary page="training-flashcards" />
    </>
  );
}