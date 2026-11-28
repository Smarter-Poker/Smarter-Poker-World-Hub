import PlayingCard from '../../../src/components/poker/PlayingCard';
import { runLocalTrainingEquity } from '../../../src/lib/poker/runLocalTrainingEquity';
/**
 * Equity Calculator — Monte Carlo Hand vs Hand Equity Tool
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 19: Interactive equity calculator for comparing hands pre-flop and
 * on specific boards. Uses server-side Monte Carlo simulation.
 *
 * Route: /hub/training/equity-calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-11 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-8 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import BankrollImageHeader from '../../../src/components/bankroll/BankrollImageHeader';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import at from '../../../src/styles/training/analysis-tools.module.css';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';

// TRAIN-CSS-MOTION-ADOPT-12 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { char: 'h', symbol: '\u2665', color: 'var(--sp-accent-red)', name: 'Hearts' },
  { char: 'd', symbol: '\u2666', color: 'var(--sp-accent-blue)', name: 'Diamonds' },
  { char: 'c', symbol: '\u2663', color: 'var(--sp-accent-green)', name: 'Clubs' },
  { char: 's', symbol: '\u2660', color: 'var(--sp-fg-muted)', name: 'Spades' },
];

const PLAYER_COLORS = ['#c4edff', '#64a9ff', '#b7c8d7', '#59c9d4'];
const PLAYER_LABELS = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

const EQUITY_VARIANTS = [
  { id: 'holdem', label: "Hold'em (2c)", holeCount: 2 },
  { id: 'plo4', label: 'PLO4 (4c)', holeCount: 4 },
  { id: 'plo5', label: 'PLO5 (5c)', holeCount: 5 },
  { id: 'plo6', label: 'PLO6 (6c)', holeCount: 6 },
  { id: 'plo8', label: 'PLO8 (4c Hi-Lo)', holeCount: 4 },
];

const PRESETS = [
  { name: 'AA Vs KK', variant: 'holdem', hands: ['AhAs', 'KdKc'], board: [] },
  { name: 'AKs Vs QQ', variant: 'holdem', hands: ['AhKh', 'QcQd'], board: [] },
  { name: 'AKo Vs 77', variant: 'holdem', hands: ['AhKd', '7c7s'], board: [] },
  { name: 'AA Vs AKs', variant: 'holdem', hands: ['AhAd', 'AcKc'], board: [] },
  { name: 'JJ Vs AKs', variant: 'holdem', hands: ['JhJd', 'AcKc'], board: [] },
  { name: 'KK Vs AKs Vs QQ', variant: 'holdem', hands: ['KhKd', 'AcKc', 'QsQh'], board: [] },
  { name: 'Cooler: Set Vs Flush', variant: 'holdem', hands: ['7h7d', 'Ah9h'], board: ['7s', '3h', '5h'] },
  { name: 'PLO4: AAKKds Vs Rundown', variant: 'plo4', hands: ['AhAsKhKs', 'JhTh9d8d'], board: [] },
  { name: 'PLO5: Wrap Vs Top Set', variant: 'plo5', hands: ['AhKhQhJdTc', '9s9d9c2h3d'], board: ['9h', '8h', '2c'] },
  { name: 'PLO6: 6-Card High Clash', variant: 'plo6', hands: ['AhAsKhKsQhQs', 'JhTh9h8d7d6c'], board: [] },
  { name: 'PLO8: As2sKd3d Vs QhQcJdTd', variant: 'plo8', hands: ['As2sKd3d', 'QhQcJdTd'], board: [] },
];


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CARD GRID (shared by the hole-card and board pickers)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function CardGrid({ title, usedCards, onPick, onClose }) {
  return (
    <motion.div
      className={`sd-panel ${at.picker}`}
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
    >
      <div className={at.pickerHead}>
        <span className={at.eyebrow}>{title}</span>
        <button type="button" className={`sd-button ${at.close}`} onClick={onClose} aria-label={`Close ${title}`}>
          <X size={18} aria-hidden />
        </button>
      </div>
      {SUITS.map((suit) => (
        <div key={suit.char} className={at.pickerRow}>
          {RANKS.map((rank) => {
            const card = rank + suit.char;
            const used = usedCards.has(card);
            return (
              <button
                type="button"
                key={card}
                data-allow-small="true"
                data-training-raw-control="true"
                className={at.pick}
                onClick={() => !used && onPick(rank, suit)}
                disabled={used}
                aria-label={`${rank} Of ${suit.name}`}
              >
                <PlayingCard arena card={card} width={32} />
              </button>
            );
          })}
        </div>
      ))}
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CARD PICKER COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function CardPicker({ selectedCards, onSelect, usedCards, label, holeCount = 2 }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(0); // Which card slot we're picking for

  const handlePick = (rank, suit) => {
    const card = rank + suit.char;
    if (usedCards.has(card)) return;
    const newCards = [...selectedCards];
    newCards[slot] = card;
    onSelect(newCards.filter(Boolean));
    if (slot < holeCount - 1) {
      setSlot((prev) => Math.min(prev + 1, holeCount - 1));
    }
    setOpen(false);
  };

  const removeCard = (idx) => {
    const newCards = [...selectedCards];
    newCards.splice(idx, 1);
    onSelect(newCards);
  };

  return (
    <div>
      {label ? <div className={at.label}>{label}</div> : null}
      <div className={at.slots}>
        {Array.from({ length: holeCount }, (_, idx) => idx).map((idx) => {
          const card = selectedCards[idx];
          return (
            <button
              type="button"
              key={idx}
              className={at.slot}
              data-filled={card ? 'true' : undefined}
              data-active={open && slot === idx ? 'true' : undefined}
              aria-label={`Select hole card ${idx + 1}`}
              onClick={() => {
                setSlot(idx);
                setOpen(true);
              }}
            >
              {card ? (
                <>
                  <PlayingCard arena card={card} width={40} />
                  <span
                    role="button"
                    tabIndex={0}
                    className={at.remove}
                    aria-label={`Remove hole card ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); removeCard(idx); } }}
                  >
                    X
                  </span>
                </>
              ) : (
                <span className={at.slotPlus} aria-hidden>+</span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <CardGrid title="Select Card" usedCards={usedCards} onPick={handlePick} onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BOARD PICKER COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const BOARD_SLOT_LABELS = ['Flop', 'Flop', 'Flop', 'Turn', 'River'];

function BoardPicker({ boardCards, onUpdate, usedCards }) {
  const [activeSlot, setActiveSlot] = useState(null);

  const handlePick = (rank, suit) => {
    const card = rank + suit.char;
    if (usedCards.has(card) || activeSlot === null) return;
    const newBoard = [...boardCards];
    newBoard[activeSlot] = card;
    onUpdate(newBoard.filter(Boolean));
    setActiveSlot(null);
  };

  const removeCard = (idx) => {
    const newBoard = [...boardCards];
    newBoard.splice(idx, 1);
    onUpdate(newBoard);
  };

  return (
    <div className={at.panel}>
      <h2 className={at.subTitle}>Board (Optional)</h2>
      <div className={at.slots}>
        {[0, 1, 2, 3, 4].map((idx) => {
          const card = boardCards[idx];
          return (
            <button
              type="button"
              key={idx}
              className={`${at.slot} ${at.slotSmall}`}
              data-filled={card ? 'true' : undefined}
              data-active={activeSlot === idx ? 'true' : undefined}
              aria-label={`Select board card ${idx + 1}`}
              onClick={() => setActiveSlot(idx)}
            >
              {card ? (
                <>
                  <PlayingCard arena card={card} width={34} />
                  <span
                    role="button"
                    tabIndex={0}
                    className={at.remove}
                    aria-label={`Remove board card ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); removeCard(idx); } }}
                  >
                    X
                  </span>
                </>
              ) : (
                <span>{BOARD_SLOT_LABELS[idx]}</span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {activeSlot !== null && (
          <CardGrid title="Board Card" usedCards={usedCards} onPick={handlePick} onClose={() => setActiveSlot(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// EQUITY RESULT BAR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function EquityBar({ results }) {
  if (!results || results.length === 0) return null;
  const total = results.reduce((a, r) => a + r.equity, 0) || 100;

  return (
    <div className={at.panel}>
      <div className={`${at.metrics} ${results.length === 2 ? at.metrics2 : ''}`}>
        {results.map((r, i) => (
          <div key={i} className={`sd-metric ${at.metric}`}>
            <span className={at.metricLabel}><i className={at.swatch} style={{ background: PLAYER_COLORS[i] }} aria-hidden />{`${PLAYER_LABELS[i]} · ${formatHand(r.hand)}`}</span>
            <strong className={at.metricValue}>{r.equity}%</strong>
            <span className={at.small}>
              Win <strong className={at.white}>{r.wins}</strong> · Tie <strong className={at.white}>{r.ties}</strong>
            </span>
          </div>
        ))}
      </div>

      <div className={at.equityBar} role="img" aria-label={results.map((r, i) => `${PLAYER_LABELS[i]} ${r.equity}%`).join(', ')}>
        {results.map((r, i) => (
          <motion.div
            key={i}
            className={at.equitySeg}
            initial={{ width: `${100 / results.length}%` }}
            animate={{ width: `${(r.equity / total) * 100}%` }}
            transition={{ duration: MOTION.slow, ease: 'easeOut' }}
            style={{ background: `linear-gradient(180deg, ${PLAYER_COLORS[i]}, ${PLAYER_COLORS[i]}99)`, minWidth: r.equity > 3 ? 30 : 0 }}
          >
            {r.equity > 10 && <span>{r.equity}%</span>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function formatHand(handStr) {
  if (!handStr || handStr.length < 4) return handStr || '';
  const tokens = [];
  for (let i = 0; i < handStr.length; i += 2) {
    const c = handStr.substring(i, i + 2);
    const s = SUITS.find((suit) => suit.char === c[1]);
    tokens.push(`${c[0]}${s?.symbol || c[1]}`);
  }
  return tokens.join(' ');
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function EquityCalculatorPage() {
  const router = useRouter();
  useTrainingBus('equity-calculator');
  const calcCountRef = useRef(0);
  const calcSeqRef = useRef(0);

  // State
  const [variant, setVariant] = useState('holdem');
  const [numPlayers, setNumPlayers] = useState(2);
  const [hands, setHands] = useState([[], []]);
  const [boardCards, setBoardCards] = useState([]);
  const [results, setResults] = useState(null);
  const [horseBrainAnalysis, setHorseBrainAnalysis] = useState(null);
  const [equitySeq, setEquitySeq] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineFallbackUsed, setOfflineFallbackUsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    setIsOffline(navigator.onLine === false);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const activeVariantSpec = useMemo(
    () => EQUITY_VARIANTS.find((v) => v.id === variant) || EQUITY_VARIANTS[0],
    [variant]
  );

  const buildLocalOfflineEvaluation = useCallback(() => {
    const adapterVariant = variant === 'holdem' ? 'nlh' : variant;
    const resolvedStreet =
      boardCards.length >= 5
        ? 'river'
        : boardCards.length === 4
          ? 'turn'
          : boardCards.length >= 3
            ? 'flop'
            : 'preflop';
    const cleanBoard =
      resolvedStreet === 'preflop'
        ? []
        : resolvedStreet === 'flop'
          ? boardCards.slice(0, 3)
          : resolvedStreet === 'turn'
            ? boardCards.slice(0, 4)
            : boardCards.slice(0, 5);

    const activeHands = hands.slice(0, numPlayers);
    const fallbackHeroByVariant = {
      nlh: ['As', 'Kd'],
      plo4: ['As', 'Ks', 'Qh', 'Jh'],
      plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
      plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
      plo8: ['As', '2s', 'Kd', '3d'],
    };
    const playerEvals = activeHands.map((playerCards, idx) => {
      const heroCards =
        Array.isArray(playerCards) && playerCards.length === activeVariantSpec.holeCount
          ? playerCards
          : fallbackHeroByVariant[adapterVariant] || fallbackHeroByVariant.nlh;
      try {
        return evaluateTrainingSpotWithHorseBrain({
          variant: adapterVariant,
          street: resolvedStreet,
          heroCards,
          boardCards: cleanBoard,
          heroPosition: idx === 0 ? 'BTN' : 'BB',
          villainPosition: idx === 0 ? 'BB' : 'BTN',
          pot: 6.5,
          toCall: 2.2,
          effectiveStackBb: 100,
        });
      } catch (_) {
        return evaluateTrainingSpotWithHorseBrain({
          variant: adapterVariant,
          street: 'preflop',
          heroCards: fallbackHeroByVariant[adapterVariant] || fallbackHeroByVariant.nlh,
          boardCards: [],
          heroPosition: 'BTN',
          villainPosition: 'BB',
          pot: 1.5,
          toCall: 1,
          effectiveStackBb: 100,
        });
      }
    });

    const p1Eval = playerEvals[0];
    const localBrainAnalysis = p1Eval
      ? {
          engineModule: p1Eval.engineModule,
          madeHandCategory: p1Eval.madeHandCategory,
          recommendedAction: p1Eval.recommendedAction || p1Eval.correctAnswerText,
          potLimitMaxBetBb: p1Eval.brainEvaluation?.potLimitMaxBetBb || null,
          flushOuts: p1Eval.brainEvaluation?.flushOuts || 0,
          straightOuts: p1Eval.brainEvaluation?.straightOuts || 0,
          wrapType: p1Eval.brainEvaluation?.wrapType || 'none',
          coachingSummary: p1Eval.coachingSummary || p1Eval.explanation,
        }
      : null;

    return { localBrainAnalysis };
  }, [variant, boardCards, hands, numPlayers, activeVariantSpec.holeCount]);

  const liveOfflineSpotPreview = useMemo(() => {
    if (!isOffline && !offlineFallbackUsed) return null;
    const { localBrainAnalysis } = buildLocalOfflineEvaluation();
    return localBrainAnalysis;
  }, [isOffline, offlineFallbackUsed, buildLocalOfflineEvaluation]);



  // All used cards (deduplication)
  const usedCards = useMemo(() => {
    const set = new Set();
    hands.forEach((h) =>
      h.forEach((c) => {
        if (c) set.add(c);
      })
    );
    boardCards.forEach((c) => {
      if (c) set.add(c);
    });
    return set;
  }, [hands, boardCards]);

  // Can calculate?
  const canCalculate = useMemo(() => {
    return hands.slice(0, numPlayers).every((h) => h.length === activeVariantSpec.holeCount);
  }, [hands, numPlayers, activeVariantSpec.holeCount]);

  // Switch variant
  const changeVariant = useCallback((nextVariant) => {
    calcSeqRef.current += 1;
    setLoading(false);
    const nextSpec = EQUITY_VARIANTS.find((v) => v.id === nextVariant) || EQUITY_VARIANTS[0];
    setVariant(nextSpec.id);
    setHands((prev) => prev.map((h) => h.slice(0, nextSpec.holeCount)));
    setResults(null);
    setHorseBrainAnalysis(null);
    setError(null);
  }, []);

  // Update hand for player
  const updateHand = useCallback((playerIdx, cards) => {
    calcSeqRef.current += 1;
    setLoading(false);
    setHands((prev) => {
      const next = [...prev];
      next[playerIdx] = cards;
      return next;
    });
    setResults(null);
    setHorseBrainAnalysis(null);
  }, []);

  // Add/remove player
  const changePlayerCount = useCallback((count) => {
    calcSeqRef.current += 1;
    setLoading(false);
    setNumPlayers(count);
    setHands((prev) => {
      const next = [...prev];
      while (next.length < count) next.push([]);
      return next;
    });
    setResults(null);
    setHorseBrainAnalysis(null);
  }, []);

  // Update board cards
  const updateBoardCards = useCallback((nextBoard) => {
    calcSeqRef.current += 1;
    setLoading(false);
    setBoardCards(nextBoard);
    setResults(null);
    setHorseBrainAnalysis(null);
    setError(null);
  }, []);

  // Load preset
  const loadPreset = useCallback((preset) => {
    calcSeqRef.current += 1;
    setLoading(false);
    const presetVariant = preset.variant || 'holdem';
    setVariant(presetVariant);
    const newHands = preset.hands.map((h) => {
      const cards = [];
      for (let i = 0; i < h.length; i += 2) {
        cards.push(h.substring(i, i + 2));
      }
      return cards;
    });
    while (newHands.length < 4) newHands.push([]);
    setHands(newHands);
    setBoardCards(preset.board || []);
    setNumPlayers(preset.hands.length);
    setResults(null);
    setHorseBrainAnalysis(null);
    setError(null);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    calcSeqRef.current += 1;
    setLoading(false);
    setHands([[], [], [], []]);
    setBoardCards([]);
    setResults(null);
    setHorseBrainAnalysis(null);
    setError(null);
  }, []);

  // Calculate equity
  const calculate = useCallback(async () => {
    if (!canCalculate) return;
    calcSeqRef.current += 1;
    const reqSeq = calcSeqRef.current;
    setLoading(true);
    setError(null);

    async function showLocalResults() {
      const data = await runLocalTrainingEquity({ hands: hands.slice(0, numPlayers), board: boardCards, variant, iterations: 5000 });
      if (reqSeq !== calcSeqRef.current) return;
      setOfflineFallbackUsed(true);
      setResults(data.results);
      setHorseBrainAnalysis(buildLocalOfflineEvaluation().localBrainAnalysis);
      setEquitySeq(reqSeq);
    }
    try {
      if (navigator.onLine === false) {
        await showLocalResults();
        return;
      }
      const handStrings = hands.slice(0, numPlayers).map((h) => h.join(''));
      const res = await authedFetch('/api/training/equity', {
        method: 'POST',
        body: JSON.stringify({
          hands: handStrings,
          board: boardCards,
          variant,
          iterations: 5000,
        }),
      });
      if (reqSeq !== calcSeqRef.current) return;
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (reqSeq !== calcSeqRef.current) return;
      if (data.success) {
        setOfflineFallbackUsed(false);
        setResults(data.results);
        setHorseBrainAnalysis(data.horseBrainAnalysis || null);
        setEquitySeq(reqSeq);
        calcCountRef.current += 1;
        busEmit.sessionEnd('equity-calculator');
      } else {
        setError(data.error || 'Calculation failed');
      }
    } catch (err) {
      if (reqSeq === calcSeqRef.current) {
        try {
          if (navigator.onLine === false) throw err;
          await showLocalResults();
        } catch (localError) {
          if (reqSeq === calcSeqRef.current) setError(localError.message);
        }
      }
    } finally {
      if (reqSeq === calcSeqRef.current) {
        setLoading(false);
      }
    }
  }, [canCalculate, hands, numPlayers, boardCards, variant, buildLocalOfflineEvaluation]);

  const pageUrl = 'https://smarter.poker/hub/training/equity-calculator';
  const equityJsonLd = hubProductSchema({
    path: '/hub/training/equity-calculator',
    name: 'Smarter.Poker Monte Carlo Poker Equity Calculator',
    description: 'Free Texas Hold\'em And Omaha Monte Carlo Equity Calculator. Compare Pre-Flop And Post-Flop Hand Equities Across Multi-Way Pots.',
    applicationCategory: 'GameApplication',
    applicationSubCategory: 'Poker',
    trail: [
      ['Hub', '/hub'],
      ['GTO Training', '/hub/training'],
      ['Equity Calculator', '/hub/training/equity-calculator'],
    ],
    faqs: [
      {
        question: 'What Is Poker Equity?',
        answer: 'Poker Equity Represents Your Expected Share Of The Pot Based On Your Mathematical Probability Of Winning Or Tying At Showdown.',
      },
      {
        question: 'How Does A Monte Carlo Equity Calculator Work?',
        answer: 'A Monte Carlo Equity Calculator Simulates Thousands Of Random Unrevealed Community Board Runouts To Calculate Estimated Win, Tie, And Loss Frequencies.',
      },
      {
        question: 'How Many Players Can Be Compared Simultaneously?',
        answer: 'This Tool Supports Comparing Equities For Up To 4 Active Players Simultaneously Pre-Flop, On The Flop, Or On The Turn.',
      },
    ],
    howTo: {
      name: 'How To Calculate Hand-Vs-Hand Poker Equity With Monte Carlo Simulation',
      description: 'Step-by-step instructions for comparing multi-way hole card equities across preflop, flop, and turn board textures.',
      steps: [
        {
          name: 'Select Active Player Count Or Matchup Preset',
          text: 'Choose between 2, 3, or 4 active players, or pick a classic preflop/postflop cooler preset such as AA vs KK or Set vs Flush Draw.',
        },
        {
          name: 'Assign Hole Cards To Each Player',
          text: 'Click each player card slot and pick exact rank and suit combinations from the 52-card selector.',
        },
        {
          name: 'Configure Optional Flop Or Turn Board Cards',
          text: 'Add 3 flop cards or 4 turn cards to evaluate postflop equity shifts, or leave the board empty for preflop all-in equity.',
        },
        {
          name: 'Run Monte Carlo Equity Simulation',
          text: 'Click Calculate Equity to run server-side Monte Carlo iterations and inspect Win %, Tie %, and total Pot Equity bars for every hand.',
        },
      ],
    },
  });

  return (
    <>
      <SEOHead
        title="Poker Equity Calculator"
        description="Calculate hand vs hand equity with Monte Carlo simulation. Compare up to 4 hands pre-flop or on specific boards."
        canonical={pageUrl}
        jsonLd={equityJsonLd}
      />

      <div className={`sp-training-tool sp-training-tool--analysis sp-analysis-equity ${at.shell}`}>
        <div className={`sp-training-head ${at.head}`}>
          <div className="sd-back-row">
            <Link href="/hub/training" className="sd-button">
              <ArrowLeft size={16} aria-hidden /> Training
            </Link>
          </div>
          <BankrollImageHeader
            art="training-equity-calculator"
            title="Equity Calculator"
            helpContent={(
              <>
                <p>Choose A Game And Enter Each Hand. Add Community Cards To Compare Win, Tie And Pot Equity. PLO8 Splits The Pot When A Low Qualifies.</p>
                <div className={`sp-equity-aeo-kernel ${at.helpBlock}`}>
                  <h3>Direct Answer: Poker Equity Overview</h3>
                  <p>
                    The Poker Equity Calculator Computes Real-Time Hand-Versus-Hand Odds Using 5,000 Monte Carlo Iterations Across Any Community Board. Input 2 To 4 Hole-Card Matchups Pre-Flop, Flop, Or Turn To Instantaneously Calculate Mathematical Win, Tie, And Loss Probabilities.
                  </p>
                </div>
                <div className={`sp-equity-faq-section ${at.helpBlock}`}>
                  <h3>Frequently Asked Questions</h3>
                  <details className={at.faq}>
                    <summary>What Is Poker Equity?</summary>
                    <p>Poker Equity Represents Your Expected Share Of The Pot Based On Your Mathematical Probability Of Winning Or Tying At Showdown.</p>
                  </details>
                  <details className={at.faq}>
                    <summary>How Does A Monte Carlo Equity Calculator Work?</summary>
                    <p>A Monte Carlo Equity Calculator Simulates Thousands Of Random Unrevealed Community Board Runouts To Calculate Estimated Win, Tie, And Loss Frequencies.</p>
                  </details>
                  <details className={at.faq}>
                    <summary>How Many Players Can Be Compared Simultaneously?</summary>
                    <p>This Tool Supports Comparing Equities For Up To 4 Active Players Simultaneously Pre-Flop, On The Flop, Or On The Turn.</p>
                  </details>
                </div>
              </>
            )}
          />
        </div>

        {/* Main Content */}
        <div className={`sp-training-analysis-main ${at.page}`}>
          {/* Variant & Player Count */}
          <section className={`sd-panel ${at.panel}`} aria-label="Game And Players">
            <div className={at.field} data-equity-variant-selector="true">
              <span className={at.label}>Variant</span>
              <div className={at.chips}>
                {EQUITY_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="sd-button"
                    data-variant-option={v.id}
                    data-equity-variant={v.id}
                    aria-pressed={variant === v.id}
                    onClick={() => changeVariant(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {variant === 'plo8' && (
              <p data-plo8-equity-banner="true" className={at.note}>
                PLO8 Hi-Lo 8-Or-Better (2 Hole + 3 Board)
              </p>
            )}

            <div className={at.field}>
              <span className={at.label}>Players</span>
              <div className={at.segmented}>
                {[2, 3, 4].map((n) => (
                  <button
                    type="button"
                    key={n}
                    className="sd-button"
                    aria-pressed={numPlayers === n}
                    onClick={() => changePlayerCount(n)}
                  >
                    {n}-Way
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Hand Inputs */}
          <div className={`${at.cardsGrid} ${at.cardsWide}`}>
            {Array.from({ length: numPlayers }).map((_, idx) => (
              <section key={idx} className={`sd-panel ${at.panel} ${at.tight}`} aria-label={PLAYER_LABELS[idx]}>
                <h2 className={at.subTitle}>
                  <i className={at.swatch} style={{ background: PLAYER_COLORS[idx] }} aria-hidden />
                  {PLAYER_LABELS[idx]}
                </h2>
                <CardPicker
                  selectedCards={hands[idx] || []}
                  onSelect={(cards) => updateHand(idx, cards)}
                  usedCards={usedCards}
                  label=""
                  holeCount={activeVariantSpec.holeCount}
                />
              </section>
            ))}
          </div>

          {/* Board */}
          <section className="sd-panel" aria-label="Board">
            <BoardPicker boardCards={boardCards} onUpdate={updateBoardCards} usedCards={usedCards} />
          </section>

          {/* Action Buttons */}
          <div className={at.actions}>
            <button
              type="button"
              className={`sp-analysis-primary-action sd-button sd-primary ${at.primary}`}
              onClick={calculate}
              disabled={!canCalculate || loading}
            >
              {loading ? 'Calculating...' : 'Calculate Equity'}
            </button>
            <button type="button" className="sd-button" onClick={clearAll} style={{ minWidth: 120 }}>
              Clear All
            </button>
          </div>

          {(isOffline || offlineFallbackUsed) && (
            <section data-offline-equity-fallback="true" className={`sd-panel ${at.panel} ${at.tight}`}>
              <div className={at.panelHead}>
                <strong className={at.eyebrow}>Offline Horse Brain Evaluation Mode Active</strong>
                <button
                  type="button"
                  className={`sd-button ${at.compact}`}
                  onClick={() => {
                    setRetryCount((c) => c + 1);
                    calculate();
                  }}
                >
                  Retry Server Simulation {retryCount > 0 ? `(${retryCount})` : ''}
                </button>
              </div>
              {liveOfflineSpotPreview && (
                <div className={at.copy}>
                  <div>
                    Engine: <strong className={at.white}>{liveOfflineSpotPreview.engineModule}</strong> · Made Hand: <strong className={at.white}>{liveOfflineSpotPreview.madeHandCategory}</strong> · Recommended Action: <strong className={at.ice}>{liveOfflineSpotPreview.recommendedAction}</strong>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Draws: Flush Outs <strong className={at.white}>{liveOfflineSpotPreview.flushOuts}</strong> · Straight/Wrap Outs <strong className={at.white}>{liveOfflineSpotPreview.straightOuts}</strong> ({liveOfflineSpotPreview.wrapType})
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Error */}
          {error && (
            <div className={`${at.error} ${at.errorRow}`} role="alert">
              <span>{error}</span>
              <button
                type="button"
                className={`sd-button ${at.compact}`}
                onClick={() => {
                  setRetryCount((c) => c + 1);
                  calculate();
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {results && (
              <motion.section
                data-equity-results-panel="true"
                data-equity-seq={equitySeq}
                data-equity-variant-result={variant}
                className={`sd-panel ${at.panel}`}
                aria-label="Equity Results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <h2 className={at.sectionTitle}>
                  {boardCards.length === 5 ? 'Exact Showdown Equity' : 'Estimated Equity · 5,000 Runouts'}
                </h2>
                <EquityBar results={results} />
                {horseBrainAnalysis && (
                  <div
                    data-equity-brain-panel="true"
                    data-brain-engine={horseBrainAnalysis.engineModule}
                    data-recommended-action={horseBrainAnalysis.recommendedAction || 'Call'}
                    className={at.helpBlock}
                  >
                    <div className={at.row}>
                      <span className={at.eyebrow}>{`Engine: ${horseBrainAnalysis.engineModule}`}</span>
                      <span className={at.label}>{`Player 1 Made Hand: ${horseBrainAnalysis.madeHandCategory}`}</span>
                      {horseBrainAnalysis.recommendedAction && (
                        <span className={at.label}>
                          Recommended Line: <strong className={at.ice}>{horseBrainAnalysis.recommendedAction}</strong>
                        </span>
                      )}
                      {horseBrainAnalysis.potLimitMaxBetBb && (
                        <span className={at.label}>
                          Pot-Limit Max Bet: <strong className={at.ice}>{`${horseBrainAnalysis.potLimitMaxBetBb} BB`}</strong>
                        </span>
                      )}
                    </div>
                    <p className={at.copy}>{horseBrainAnalysis.coachingSummary}</p>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* Presets */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="equity-presets-title">
            <h2 id="equity-presets-title" className={at.sectionTitle}>Quick Presets</h2>
            <div className={at.chips}>
              {PRESETS.map((preset, i) => (
                <button type="button" key={i} className="sd-button" onClick={() => loadPreset(preset)}>
                  {preset.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
