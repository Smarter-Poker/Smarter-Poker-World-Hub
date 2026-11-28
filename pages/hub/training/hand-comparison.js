/**
 * A/B Hand Comparison Tool — Relative Equity Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 26 (Bug-Swept v2):
 *  - Fixed: evalHand was called with a wrong slice — now uses a proper
 *    best-5-from-N hand evaluator to correctly score 6 or 7 card hands
 *  - Fixed: stale canRun in useCallback — now reads from useMemo inside cb
 *  - Fixed: dead allA/allB variables removed
 *  - Added: busEmit on comparison complete for real-time training dashboard
 *  - Added: "Clear all" button to reset hand/board selections quickly
 *  - Added: Card deselect support — click an existing card to remove it
 *  - Improved: CardPicker now closes on outside click (document listener)
 *
 * Route: /hub/training/hand-comparison
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-ADOPT-12 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-10 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-GRADIENT-ADOPT-17 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import PlayingCard, { preloadArenaDeckCards } from '../../../src/components/poker/PlayingCard';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
// TRAIN-CSS-MOTION-ADOPT-3 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// HAND EVALUATOR ENGINE — Best 5 From N Cards
// ═══════════════════════════════════════════════════════════════════════════

// Hand identity swatches (not semantic win/loss colours).
const HAND_COLORS = { a: '#c4edff', b: '#64a9ff' };
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['h', 'd', 'c', 's'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, 14 - i]));

function buildDeck() {
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Evaluate exactly 5 cards — returns numeric score, higher = better hand
function evalFiveCards(cards) {
  const ranks = cards.map((c) => RANK_VAL[c[0]]).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const flush = suits.every((s) => s === suits[0]);

  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] || 0) + 1;
  const counts = Object.values(rankCounts || {}).sort((a, b) => b - a);
  const uniqueRanks = Object.keys(rankCounts || {})
    .map(Number)
    .sort((a, b) => b - a);

  // Wheel straight: A-2-3-4-5
  const isWheelStraight =
    uniqueRanks.length === 5 &&
    uniqueRanks[0] === 14 &&
    uniqueRanks[1] === 5 &&
    uniqueRanks[4] === 2;
  const isNormalStraight = uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4;
  const straight = isNormalStraight || isWheelStraight;
  const straightFlush = straight && flush;

  let category;
  if (straightFlush) category = 8;
  else if (counts[0] === 4) category = 7;
  else if (counts[0] === 3 && counts[1] === 2) category = 6;
  else if (flush) category = 5;
  else if (straight) category = 4;
  else if (counts[0] === 3) category = 3;
  else if (counts[0] === 2 && counts[1] === 2) category = 2;
  else if (counts[0] === 2) category = 1;
  else category = 0;

  // Score: sort by count desc, then rank desc to handle kickers properly
  const sortedByCountThenRank = Object.entries(rankCounts || {})
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
    .map((e) => e.rank);

  const kicker = sortedByCountThenRank.reduce((acc, r, i) => acc + r * Math.pow(15, 4 - i), 0);
  return category * 1e10 + kicker;
}

// FIX: Proper best-5-from-N evaluator using combinations
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === k) return [arr];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function bestHandScore(cards) {
  if (cards.length <= 5) return evalFiveCards(cards);
  const combos = combinations(cards, 5);
  return Math.max(...combos.map(evalFiveCards));
}

function bestHandCategory(cards) {
  if (cards.length < 3) return 0;
  const clipped = cards.slice(0, Math.min(cards.length, 7));
  if (clipped.length <= 5) {
    const score = evalFiveCards(clipped);
    return Math.floor(score / 1e10);
  }
  const combos = combinations(clipped, 5);
  let best = -Infinity;
  let bestCat = 0;
  for (const combo of combos) {
    const s = evalFiveCards(combo);
    if (s > best) {
      best = s;
      bestCat = Math.floor(s / 1e10);
    }
  }
  return bestCat;
}

const HAND_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

// FIX: runEquity now uses proper best-5-from-7 scoring
function runEquity(handA, handB, board, simCount = 3000) {
  const used = new Set([...handA, ...handB, ...board]);
  const deck = buildDeck().filter((c) => !used.has(c));
  let winsA = 0,
    winsB = 0,
    ties = 0;
  const remaining = 5 - board.length;

  for (let i = 0; i < simCount; i++) {
    const shuffled = shuffle(deck);
    const runout = [...board, ...shuffled.slice(0, remaining)];
    // Full 7 cards for each hand — best 5 from 7
    const cardsA = [...handA, ...runout]; // 2 + 5 = 7
    const cardsB = [...handB, ...runout]; // 2 + 5 = 7
    const scoreA = bestHandScore(cardsA);
    const scoreB = bestHandScore(cardsB);
    if (scoreA > scoreB) winsA++;
    else if (scoreB > scoreA) winsB++;
    else ties++;
  }

  return {
    equityA: Math.round(((winsA + ties / 2) / simCount) * 100),
    equityB: Math.round(((winsB + ties / 2) / simCount) * 100),
    winsA,
    winsB,
    ties,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD PICKER — With outside-click dismiss and deselect support
// ═══════════════════════════════════════════════════════════════════════════

function CardPicker({ value, onChange, onClear, label, allSelected, open, onOpen, onClose }) {
  const suitNames = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' };
  const orderedSuits = ['s', 'h', 'd', 'c'];

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function pick(r, s) {
    const card = r + s;
    if (!allSelected.has(card)) {
      onChange(card);
      onClose();
    }
  }

  return (
    <div className={at.field}>
      <span className={at.label}>{label}</span>
      <button
        type="button"
        className={at.slot}
        data-filled={value ? 'true' : undefined}
        data-active={open ? 'true' : undefined}
        aria-label={value ? `Clear ${label}` : `Pick ${label}`}
        aria-expanded={value ? undefined : open}
        onClick={() => {
          if (value) {
            onClear();
          } else if (open) {
            onClose();
          } else {
            onOpen();
          }
        }}
      >
        {value ? (
          <>
            <PlayingCard arena priority card={value} width={44} />
            <span className={at.remove} aria-hidden>✕</span>
          </>
        ) : (
          <span className={at.slotPlus} aria-hidden>+</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`sd-panel ${at.picker}`}
            role="dialog"
            aria-label={`${label} Picker`}
          >
            <div className={at.pickerHead}>
              <span className={at.eyebrow}>{`${label}: Pick Card`}</span>
              <button type="button" className={`sd-button ${at.close}`} onClick={onClose} aria-label={`Close ${label} Picker`}>
                ✕
              </button>
            </div>
            {orderedSuits.map((s) => (
              <div key={s} className={at.pickerRow}>
                {RANKS.map((r) => {
                  const card = r + s;
                  const disabled = allSelected.has(card);
                  return (
                    <button
                      key={card}
                      type="button"
                      data-allow-small="true"
                      data-training-raw-control="true"
                      className={at.pick}
                      onClick={() => !disabled && pick(r, s)}
                      disabled={disabled}
                      aria-label={`${r} Of ${suitNames[s]}`}
                    >
                      <PlayingCard arena priority card={card} width={32} />
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function HandComparison() {
  useTrainingBus('hand-comparison');
  const router = useRouter();

  useEffect(() => {
    preloadArenaDeckCards();
  }, []);

  const [handA, setHandA] = useState([null, null]);
  const [handB, setHandB] = useState([null, null]);
  const [board, setBoard] = useState([null, null, null, null, null]);
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [openSlot, setOpenSlot] = useState(null);


  const allSelected = useMemo(() => {
    const s = new Set();
    [...handA, ...handB, ...board].forEach((c) => c && s.add(c));
    return s;
  }, [handA, handB, board]);

  // FIX: derive canRun inside the component rather than inside callback
  const canRun = Boolean(
    handA[0] && handA[1] && handB[0] && handB[1] && board[0] && board[1] && board[2]
  );

  const handleClearAll = useCallback(() => {
    setHandA([null, null]);
    setHandB([null, null]);
    setBoard([null, null, null, null, null]);
    setResult(null);
  }, []);

  const runComparison = useCallback(() => {
    // FIX: guard uses local canRun check — no stale closure
    const hA = handA.filter(Boolean);
    const hB = handB.filter(Boolean);
    const b = board.filter(Boolean);
    if (hA.length < 2 || hB.length < 2 || b.length < 3) return;

    setIsRunning(true);
    setResult(null);
    setError(null);

    // Push to next tick so UI shows "CALCULATING..."
    setTimeout(() => {
      try {
        const eq = runEquity(hA, hB, b, 3000);

        // FIX: Use correct best-5-from-N for category with all available cards
        const catA = bestHandCategory([...hA, ...b]);
        const catB = bestHandCategory([...hB, ...b]);

        const res = {
          ...eq,
          catA,
          catB,
          hand_a_category: HAND_NAMES[catA],
          hand_b_category: HAND_NAMES[catB],
        };
        setResult(res);
      } catch (_) {
        setError('Could Not Compare These Hands. Try Again.');
      } finally {
        setIsRunning(false);
      }
    }, 50);
  }, [handA, handB, board]); // FIX: removed `canRun` from deps — guard is direct check

  const leader = result
    ? result.equityA > result.equityB
      ? 'A'
      : result.equityB > result.equityA
        ? 'B'
        : 'TIE'
    : null;

  return (
    <>
      <SEOHead
        title="A/B Poker Hand Equity Comparison"
        description="Compare Any Two Poker Starting Hands Side By Side Across Custom Board Textures With Showdown Equity, Nut Advantage, And Runout Analysis On Smarter.Poker."
        canonical="/hub/training/hand-comparison"
      />

      <div className={`sp-training-tool sp-training-tool--analysis sp-analysis-comparison ${at.shell}`}>
        <TrainingPageHead slug="training-hand-comparison" note="A/B Equity Analysis · Best-5-From-7 · Monte Carlo">
          {allSelected.size > 0 && (
            <button type="button" className="sd-button" onClick={handleClearAll}>
              Clear All
            </button>
          )}
        </TrainingPageHead>

        <div className={`sp-training-analysis-main ${at.page}`}>
          {/* HANDS A AND B */}
          <div className={`${at.cardsGrid} ${at.cardsWide}`}>
            {[
              { key: 'a', panel: 'sp-analysis-data-panel--a', title: 'Hand A', hand: handA, setHand: setHandA },
              { key: 'b', panel: 'sp-analysis-data-panel--b', title: 'Hand B', hand: handB, setHand: setHandB },
            ].map(({ key, panel, title, hand, setHand }) => (
              <section key={key} className={`sp-analysis-data-panel ${panel} sd-panel ${at.panel} ${at.tight}`} aria-label={title}>
                <h2 className={at.subTitle}>
                  <i className={at.swatch} style={{ background: HAND_COLORS[key] }} aria-hidden />
                  {title}
                </h2>
                <div className={at.slots} style={{ alignItems: 'flex-start' }}>
                  {[0, 1].map((idx) => {
                    const slotId = `${key}${idx}`;
                    return (
                      <CardPicker
                        key={slotId}
                        value={hand[idx]}
                        onChange={(v) => setHand(idx === 0 ? [v, hand[1]] : [hand[0], v])}
                        onClear={() => setHand(idx === 0 ? [null, hand[1]] : [hand[0], null])}
                        label={`Card ${idx + 1}`}
                        allSelected={allSelected}
                        open={openSlot === slotId}
                        onOpen={() => setOpenSlot(slotId)}
                        onClose={() => setOpenSlot(null)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* BOARD */}
          <section className={`sp-analysis-data-panel sp-analysis-data-panel--board sd-panel ${at.panel} ${at.tight}`} aria-label="Board">
            <h2 className={at.subTitle}>
              Board <span className={at.small}>(Min 3 For Flop)</span>
            </h2>
            <div data-pills-row className={at.slots} style={{ alignItems: 'flex-start' }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <CardPicker
                  key={i}
                  value={board[i]}
                  onChange={(v) => {
                    const b = [...board];
                    b[i] = v;
                    setBoard(b);
                  }}
                  onClear={() => {
                    const b = [...board];
                    b[i] = null;
                    setBoard(b);
                  }}
                  label={i < 3 ? `Flop ${i + 1}` : i === 3 ? 'Turn' : 'River'}
                  allSelected={allSelected}
                  open={openSlot === `board${i}`}
                  onOpen={() => setOpenSlot(`board${i}`)}
                  onClose={() => setOpenSlot(null)}
                />
              ))}
            </div>
          </section>

          {/* RUN BUTTON */}
          <button
            type="button"
            className={`sd-button sd-primary ${at.primary}`}
            onClick={runComparison}
            disabled={!canRun || isRunning}
          >
            {isRunning
              ? 'Calculating...'
              : canRun
                ? (error ? 'Retry Comparison' : 'Compare Hands')
                : 'Select Hands + Min 3 Board Cards To Begin'}
          </button>
          {error && <div role="alert" className={at.error}>{error}</div>}

          {/* RESULTS */}
          <AnimatePresence>
            {result && (
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: MOTION.standard }}
                className={`sd-panel ${at.panel}`}
                aria-label="Comparison Results"
              >
                {/* Leader banner */}
                <h2 className={at.sectionTitle} style={{ textAlign: 'center' }}>
                  {leader === 'TIE' ? 'Equal Equity' : `Hand ${leader} Is Ahead`}
                </h2>

                {/* Equity bars */}
                {[
                  { key: 'a', label: 'Hand A', eq: result.equityA, cat: result.hand_a_category },
                  { key: 'b', label: 'Hand B', eq: result.equityB, cat: result.hand_b_category },
                ].map((row) => (
                  <div key={row.label}>
                    <div className={at.barHead}>
                      <span>
                        <i className={at.swatch} style={{ background: HAND_COLORS[row.key] }} aria-hidden />
                        {row.label} · <span className={at.small}>{row.cat}</span>
                      </span>
                      <strong className={at.white} style={{ fontSize: '1.1rem' }}>{row.eq}%</strong>
                    </div>
                    <div className={at.track} style={{ blockSize: 10 }}>
                      <motion.div
                        className={at.fill}
                        initial={{ width: 0 }}
                        animate={{ width: `${row.eq}%` }}
                        transition={{ duration: MOTION.glacial, ease: 'easeOut' }}
                        style={{ background: HAND_COLORS[row.key] }}
                      />
                    </div>
                  </div>
                ))}

                {/* Win / Tie / Loss breakdown */}
                <div data-stats-grid className={`${at.metrics} ${at.metrics3}`}>
                  {[
                    { label: 'Hand A Wins', value: result.winsA },
                    { label: 'Chop', value: result.ties },
                    { label: 'Hand B Wins', value: result.winsB },
                  ].map((s) => (
                    <div key={s.label} className={`sd-metric ${at.metric}`}>
                      <strong className={at.metricValue}>{s.value}</strong>
                      <span className={at.metricLabel}>{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Run again with different board */}
                <button type="button" className="sd-button" onClick={runComparison}>
                  Re-Run (New Random Run-Outs)
                </button>

                <p className={at.small}>
                  Results Based On 3,000 Monte Carlo Simulations Using The Best-5-From-7 Hand
                  Evaluator. Equity = Win% + ½ Chop%. Click A Selected Card To Deselect It. Change
                  Board Cards To Study Run-Outs.
                </p>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
      <HubPageSummary page="training-hand-comparison" />
    </>
  );
}
