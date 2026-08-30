/**
 * CUSTOM SOLVE — Configure & Query Custom GTO Spots
 * ═══════════════════════════════════════════════════════════════════════════
 * Configure positions, stack depth, and board cards, then query the verified
 * preflop range service or exact-board solver corpus.
 *
 * Route: /hub/training/custom-solve
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-3 — hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';

// TRAIN-CSS-MOTION-ADOPT-11 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const ALL_CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const ALL_CARD_SUITS = [
  { s: 'h', symbol: '♥', color: 'var(--sp-accent-red)' },
  { s: 'd', symbol: '♦', color: 'var(--sp-accent-blue)' },
  { s: 'c', symbol: '♣', color: 'var(--sp-accent-green)' },
  { s: 's', symbol: '♠', color: 'var(--sp-fg-muted)' },
];

// HARDENED: Deterministic hash for stable runout values (no flickering)
function deterministicShift(rank, baseFreq) {
  const RANK_OFFSETS = { A: 12, K: 8, Q: 5, J: 2, T: -1, 8: -5, 5: -8, 2: -10 };
  const offset = RANK_OFFSETS[rank] || 0;
  return Math.max(5, Math.min(95, Math.round(baseFreq + offset)));
}

function BoardCardSelector({ boardCards, setBoardCards }) {
  const [selectorOpen, setSelectorOpen] = useState(null); // index to fill (0-4)
  const usedCards = new Set(boardCards.filter(Boolean));

  const pickCard = (card) => {
    if (selectorOpen === null) return;
    const updated = [...boardCards];
    updated[selectorOpen] = card;
    setBoardCards(updated);
    // Auto-advance to next empty slot
    const next = updated.findIndex((c, i) => i > selectorOpen && !c);
    setSelectorOpen(next >= 0 ? next : null);
  };

  const clearCard = (idx) => {
    const updated = [...boardCards];
    updated[idx] = null;
    // Clear downstream cards
    for (let i = idx; i < 5; i++) updated[i] = null;
    setBoardCards(updated);
  };

  const slotLabels = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--sp-fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
          padding: '0 4px',
        }}
      >
        Board Cards (optional)
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {slotLabels.map((label, i) => {
          const card = boardCards[i];
          const isActive = selectorOpen === i;
          const suit = card ? ALL_CARD_SUITS.find((s) => s.s === card[1]) : null;
          return (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: 'var(--sp-fg-faint)', marginBottom: 2 }}>{label}</div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => (card ? clearCard(i) : setSelectorOpen(isActive ? null : i))}
                style={{
                  width: 44,
                  height: 60,
                  borderRadius: 8,
                  border: `2px solid ${isActive ? 'var(--sp-accent-cyan)' : card ? suit?.color || 'var(--sp-fg-dim)' : 'rgba(255,255,255,0.08)'}`,
                  background: card
                    ? 'rgba(255,255,255,0.06)'
                    : isActive
                      ? 'rgba(0,212,255,0.05)'
                      : 'rgba(0,0,0,0.2)',
                  color: card ? 'var(--sp-fg)' : 'var(--sp-fg-faint)',
                  fontSize: card ? 14 : 20,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0,
                }}
              >
                {card ? (
                  <>
                    <span>{card[0]}</span>
                    <span style={{ color: suit?.color, fontSize: 12 }}>{suit?.symbol}</span>
                  </>
                ) : (
                  '+'
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Card Picker */}
      <AnimatePresence>
        {selectorOpen !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: 'hidden',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 10,
            }}
          >
            {ALL_CARD_SUITS.map((suit) => (
              <div key={suit.s} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                {ALL_CARD_RANKS.map((rank) => {
                  const card = rank + suit.s;
                  const used = usedCards.has(card);
                  return (
                    <button
                      key={card}
                      disabled={used}
                      onClick={() => pickCard(card)}
                      style={{
                        flex: '1 1 auto',
                        padding: '4px 2px',
                        borderRadius: 4,
                        border: 'none',
                        cursor: used ? 'not-allowed' : 'pointer',
                        background: used ? 'rgba(255,255,255,0.02)' : `${suit.color}15`,
                        color: used ? '#333' : suit.color,
                        fontSize: 10,
                        fontWeight: 700,
                        opacity: used ? 0.3 : 1,
                      }}
                    >
                      {rank}
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

// Pre-computed GTO ranges for custom solve results
const PRECOMPUTED_RANGES = {
  UTG: { openRange: 15.6, hands: 'AA-22, AKs-A9s, AKo-AJo, KQs-KTs, QJs-QTs, JTs, T9s' },
  MP: { openRange: 19.2, hands: 'AA-22, AKs-A5s, AKo-ATo, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s' },
  CO: {
    openRange: 26.3,
    hands:
      'AA-22, AKs-A2s, AKo-A8o, KQs-K7s, KQo-KTo, QJs-Q8s, QJo, JTs-J8s, T9s-T8s, 98s-97s, 87s, 76s',
  },
  BTN: {
    openRange: 42.1,
    hands:
      'AA-22, AKs-A2s, AKo-A2o, KQs-K2s, KQo-K7o, QJs-Q2s, QJo-Q8o, JTs-J6s, JTo-J8o, T9s-T6s, T9o, 98s-96s, 87s-86s, 76s-75s, 65s-64s, 54s',
  },
  SB: {
    openRange: 31.5,
    hands:
      'AA-22, AKs-A2s, AKo-A5o, KQs-K4s, KQo-K9o, QJs-Q7s, QJo-QTo, JTs-J7s, JTo, T9s-T7s, 98s-97s, 87s-86s, 76s, 65s',
  },
  BB: {
    openRange: 'Defend',
    hands: 'Call: ATo-A2o, KQo-K8o, QJo-Q9o, JTo-J9o, T9o. 3-Bet: AA-TT, AKs-AJs, AKo-AQo, KQs',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RANGE GRID VISUAL — Interactive 13×13 Grid for Solver Results
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function parseRangeToSet(rangeStr) {
  if (!rangeStr) return new Set();
  const inRange = new Set();
  // Remove action prefixes like "Call: ...", "3-Bet: ..."
  const cleaned = rangeStr.replace(/(Call|3-Bet|Raise|Open|Fold):\s*/gi, ', ');
  const parts = cleaned
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      // Range expansion: AA-22, AKs-ATs, etc.
      const [start, end] = part.split('-').map((s) => s.trim());
      if (!start || !end) {
        inRange.add(start || end);
        continue;
      }
      if (start.length === 2 && start[0] === start[1]) {
        // Pair range: AA-TT
        const si = RANKS.indexOf(start[0]);
        const ei = RANKS.indexOf(end[0]);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++) {
            inRange.add(RANKS[i] + RANKS[i]);
          }
        }
      } else {
        // Suited/offsuit range: AKs-ATs
        const suffix = start.endsWith('s') ? 's' : start.endsWith('o') ? 'o' : '';
        const high = start[0];
        const startLow = start[1];
        const cleanEnd = end.replace(/[so]/g, '');
        const endLow = cleanEnd.length >= 2 ? cleanEnd[1] : cleanEnd[0];
        if (!endLow) {
          inRange.add(start);
          inRange.add(end);
          continue;
        }
        const si = RANKS.indexOf(startLow);
        const ei = RANKS.indexOf(endLow);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++) {
            inRange.add(high + RANKS[i] + suffix);
          }
        }
      }
    } else {
      inRange.add(part);
    }
  }
  return inRange;
}

function RangeGridVisual({ rangeStr, actions }) {
  const rangeSet = React.useMemo(() => parseRangeToSet(rangeStr), [rangeStr]);
  const [hoveredCell, setHoveredCell] = React.useState(null);

  const raiseFreq = actions?.find((a) => a.action === 'Raise')?.freq || 0;
  const callFreq = actions?.find((a) => a.action === 'Call')?.freq || 0;

  const grid = React.useMemo(() => {
    const cells = [];
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const isPair = r === c;
        const isSuited = c > r;
        const hand = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
            ? `${RANKS[r]}${RANKS[c]}s`
            : `${RANKS[c]}${RANKS[r]}o`;
        const inRange = rangeSet.has(hand) || rangeSet.has(hand.replace(/[so]/, ''));
        cells.push({ hand, inRange, isPair, isSuited, r, c });
      }
    }
    return cells;
  }, [rangeSet]);

  const handsInRange = grid.filter((c) => c.inRange).length;
  const pct = ((handsInRange / 169) * 100).toFixed(1);

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.15)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Range Grid — {pct}% of hands
        </div>
        {hoveredCell && (
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-accent-cyan)' }}>
            {hoveredCell.hand} {hoveredCell.inRange ? '✓ In Range': '✕ Fold'}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
        {grid.map((cell, i) => {
          let bg = 'rgba(255,255,255,0.02)';
          let textColor = '#333';
          if (cell.inRange) {
            // Color by dominant action
            if (raiseFreq > callFreq) {
              bg = cell.isPair
                ? 'rgba(239,68,68,0.5)'
                : cell.isSuited
                  ? 'rgba(239,68,68,0.35)'
                  : 'rgba(239,68,68,0.25)';
            } else {
              bg = cell.isPair
                ? 'rgba(34,197,94,0.5)'
                : cell.isSuited
                  ? 'rgba(34,197,94,0.35)'
                  : 'rgba(34,197,94,0.25)';
            }
            textColor = '#fff';
          }
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                fontSize: 6,
                fontWeight: 600,
                background: bg,
                color: textColor,
                cursor: 'pointer',
                border:
                  hoveredCell?.hand === cell.hand ? '1px solid #00d4ff' : '1px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              {cell.hand.length <= 3 ? cell.hand : ''}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--sp-fg-muted)' }}
        >
          <div
            style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.4)' }}
          />{' '}
          Raise/Open
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--sp-fg-muted)' }}
        >
          <div
            style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.4)' }}
          />{' '}
          Call/Flat
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--sp-fg-muted)' }}
        >
          <div
            style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.04)' }}
          />{' '}
          Fold
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function SolveResult({ heroPos, villainPos, config, result }) {
  if (!result) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '16px',
        borderRadius: 14,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(0,212,255,0.12)',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)' }}>
            {heroPos} vs {villainPos}
          </div>
          <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
            6-Max Cash · {config.stackDepth}BB · {config.boardCards?.filter(Boolean).length ? 'Exact Board Query' : 'Preflop Range Query'}
          </div>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--sp-accent-green)',
          }}
        >
          {result.isEstimate ? 'Modeled Baseline' : 'Solved Corpus'}
        </div>
      </div>

      {result.message && (
        <div style={{ fontSize: 10, color: 'var(--sp-fg-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {result.message}
        </div>
      )}

      {/* Strategy */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          Optimal Strategy
        </div>
        {(Array.isArray(result?.actions) ? result.actions : []).map((a) => (
          <div
            key={a.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background:
                  a.action === 'Raise'
                    ? 'var(--sp-accent-red)'
                    : a.action === 'Call'
                      ? 'var(--sp-accent-green)'
                      : a.action === 'Fold'
                        ? 'var(--sp-fg-dim)'
                        : 'var(--sp-accent-blue)',
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)', minWidth: 50 }}>
              {a.action}
            </div>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${a.freq}%` }}
                transition={{ duration: MOTION.slow }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background:
                    a.action === 'Raise'
                      ? 'var(--sp-accent-red)'
                      : a.action === 'Call'
                        ? 'var(--sp-accent-green)'
                        : a.action === 'Fold'
                          ? 'var(--sp-fg-dim)'
                          : 'var(--sp-accent-blue)',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--sp-fg-muted)',
                minWidth: 36,
                textAlign: 'right',
              }}
            >
              {a.freq}%
            </div>
          </div>
        ))}
      </div>

      {/* Range Text */}
      {result.range && (
        <div
          style={{
            padding: '10px',
            borderRadius: 8,
            marginTop: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Hands ({result.rangePercent || 0}% of combos)
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--sp-fg-muted)',
              lineHeight: 1.5,
              fontFamily: "'Courier New', monospace",
            }}
          >
            {result.range}
          </div>
        </div>
      )}

    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CustomSolvePage() {
  const router = useRouter();
  useTrainingBus('custom-solve');

  // Configuration state
  const [heroPos, setHeroPos] = useState('BTN');
  const [villainPos, setVillainPos] = useState('BB');
  const [stackDepth, setStackDepth] = useState(100);
  const [boardCards, setBoardCards] = useState([null, null, null, null, null]);

  // Results state
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSolve = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const selectedBoard = boardCards.filter(Boolean);
      if (selectedBoard.length < 3) {
        const res = await authedFetch(
          `/api/training/preflop-ranges?gameType=cash_6max&stackDepth=${stackDepth}&position=${heroPos}&scenario=rfi`,
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.range) throw new Error(data?.error || `Request failed (${res.status})`);

        const totals = {};
        let populatedHands = 0;
        Object.values(data.range.gridData || {}).forEach((entry) => {
          if (!entry) return;
          populatedHands += 1;
          Object.entries(entry).forEach(([actionName, frequency]) => {
            totals[actionName] = (totals[actionName] || 0) + (Number(frequency) || 0);
          });
        });
        setResult({
          source: data.range.source,
          isEstimate: data.range.source === 'derived_from_rfi',
          message: `${data.range.spotLabel}. Frequencies are aggregated from the returned 169-hand range grid.`,
          actions: Object.entries(totals).map(([actionName, total]) => ({
            action: actionName,
            freq: Math.round(total / Math.max(1, populatedHands)),
          })),
          range: null,
          rangePercent: data.range.stats?.rfiPct || 0,
        });
      } else {
        const res = await authedFetch('/api/training/solver-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heroPosition: heroPos,
            villainPosition: villainPos,
            board: selectedBoard,
            stackDepth,
            gameType: 'cash',
            street: selectedBoard.length === 3 ? 'flop' : selectedBoard.length === 4 ? 'turn' : 'river',
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.solution?.actions) throw new Error(data?.error || `Request failed (${res.status})`);
        setResult({
          source: data.source,
          isEstimate: Boolean(data.solution.isEstimate),
          message: data.message,
          actions: Object.entries(data.solution.actions).map(([actionName, frequency]) => ({
            action: actionName.charAt(0).toUpperCase() + actionName.slice(1),
            freq: Math.round(Number(frequency) || 0),
          })),
          range: null,
          rangePercent: 0,
        });
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
      setError(e?.message || 'Solve failed. Please try again.');
    }

    setLoading(false);
  }, [heroPos, villainPos, stackDepth, boardCards]);

  return (
    <>
      <Head>
        <title>Custom Solve | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Configure custom parameters and query GTO solutions for any spot."
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
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
            &larr;
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Custom Solve</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              Query Verified Preflop And Exact-Board Data
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Supported corpus — variants are not offered as no-op controls. */}
          <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid rgba(0,212,255,.16)', background: 'rgba(0,212,255,.04)' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Supported Corpus
            </div>
            <div style={{ color: 'var(--sp-fg)', fontSize: 13, fontWeight: 800 }}>6-Max Cash</div>
            <div style={{ color: 'var(--sp-fg-dim)', fontSize: 10, marginTop: 3 }}>Position, effective stack, and concrete board cards are applied to every request.</div>
          </div>

          {/* Positions */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                  padding: '0 4px',
                }}
              >
                Hero Position
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {POSITIONS.map((p) => (
                  <motion.button
                    key={p}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setHeroPos(p)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      flex: '1 1 auto',
                      minWidth: 36,
                      border: `1px solid ${heroPos === p ? 'rgba(34,197,94,0.3)' : 'transparent'}`,
                      background: heroPos === p ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.2)',
                      color: heroPos === p ? 'var(--sp-accent-green)' : 'var(--sp-fg-dim)',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {p}
                  </motion.button>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                  padding: '0 4px',
                }}
              >
                Villain Position
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {POSITIONS.filter((p) => p !== heroPos).map((p) => (
                  <motion.button
                    key={p}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setVillainPos(p)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      flex: '1 1 auto',
                      minWidth: 36,
                      border: `1px solid ${villainPos === p ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                      background: villainPos === p ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.2)',
                      color: villainPos === p ? 'var(--sp-accent-red)' : 'var(--sp-fg-dim)',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {p}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Stack Depth */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Effective Stack Depth
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[20, 40, 60, 100, 150, 200].map((sd) => (
                <motion.button
                  key={sd}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setStackDepth(sd)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${stackDepth === sd ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                    background: stackDepth === sd ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                    color: stackDepth === sd ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {sd}bb
                </motion.button>
              ))}
            </div>
          </div>

          {/* Board Card Selector */}
          <BoardCardSelector boardCards={boardCards} setBoardCards={setBoardCards} />

          {/* Solve Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSolve}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              border: '1px solid rgba(0,212,255,0.3)',
              background: loading
                ? 'rgba(0,212,255,0.03)'
                : 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(139,92,246,0.08) 100%)',
              color: 'var(--sp-accent-cyan)',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 20,
            }}
          >
            {loading ? (
              <span
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid transparent',
                    borderTopColor: 'var(--sp-accent-cyan)',
                    borderRadius: '50%',
                  }}
                />
                Solving...
              </span>
            ) : (
              'Solve This Spot'
            )}
          </motion.button>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  marginBottom: 16,
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: 'var(--sp-accent-red)',
                  fontSize: 12,
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          {result && (
            <SolveResult
              heroPos={heroPos}
              villainPos={villainPos}
              config={{ stackDepth, boardCards }}
              result={result}
            />
          )}
        </div>
      </div>
    </>
  );
}
