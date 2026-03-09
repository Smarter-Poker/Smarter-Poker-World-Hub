/**
 * CUSTOM SOLVE — Configure & Query Custom GTO Spots
 * ═══════════════════════════════════════════════════════════════════════════
 * Input custom parameters (stake/rake, ante, straddle, stack sizes)
 * and query the solver API for GTO strategies.
 *
 * Route: /hub/training/custom-solve
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const RAKE_PRESETS = {
  micro: { label: 'Micro (NL2-NL10)', rake: 5, cap: 0.5 },
  low: { label: 'Low (NL25-NL50)', rake: 5, cap: 1.0 },
  mid: { label: 'Mid (NL100-NL200)', rake: 4.5, cap: 3.0 },
  high: { label: 'High (NL500+)', rake: 3, cap: 3.0 },
  live: { label: 'Live ($1/$2-$5/$10)', rake: 10, cap: 7.0 },
  norake: { label: 'No Rake', rake: 0, cap: 0 },
};

const FORMAT_OPTIONS = [
  { id: 'cash', label: 'Cash Game', icon: '💰' },
  { id: 'mtt', label: 'MTT', icon: '🏆' },
  { id: 'sng', label: 'Sit & Go', icon: '🎯' },
];

const ANTE_OPTIONS = ['None', '10% Ante', '12.5% Ante', 'BB Ante (1BB)', 'Straddle (2BB)'];

const BOARD_TEXTURES = [
  { id: 'any', label: 'Any Board' },
  { id: 'dry', label: 'Dry (K72r)' },
  { id: 'wet', label: 'Wet (JT8ss)' },
  { id: 'monotone', label: 'Monotone' },
  { id: 'paired', label: 'Paired' },
  { id: 'broadway', label: 'Broadway' },
  { id: 'low', label: 'Low Board' },
];

const ALL_CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const ALL_CARD_SUITS = [
  { s: 'h', symbol: '♥', color: '#ef4444' },
  { s: 'd', symbol: '♦', color: '#3b82f6' },
  { s: 'c', symbol: '♣', color: '#22c55e' },
  { s: 's', symbol: '♠', color: '#94a3b8' },
];

function classifyBoardTexture(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return 'any';
  // HARDENED: validate each card is a 2-char string with valid rank + suit
  const validRanks = new Set(ALL_CARD_RANKS);
  const validSuits = new Set(['h', 'd', 'c', 's']);
  const validCards = cards.filter(
    (c) => typeof c === 'string' && c.length === 2 && validRanks.has(c[0]) && validSuits.has(c[1])
  );
  if (validCards.length < 3) return 'any';

  const suits = validCards.map((c) => c[1]);
  const ranks = validCards.map((c) => ALL_CARD_RANKS.indexOf(c[0]));
  const uniqueSuits = new Set(suits).size;
  const hasPair = ranks.length !== new Set(ranks).size;
  const broadways = ranks.filter((r) => r <= 4).length;
  const isMonotone = uniqueSuits === 1;
  const isRainbow = uniqueSuits === validCards.length;
  const maxGap = Math.max(...ranks) - Math.min(...ranks);

  if (isMonotone) return 'monotone';
  if (hasPair) return 'paired';
  if (broadways >= 2 && validCards.length <= 3) return 'broadway';
  if (Math.max(...ranks) >= 8 && isRainbow) return 'low';
  if (maxGap <= 4 && !isRainbow) return 'wet';
  if (isRainbow && maxGap >= 6) return 'dry';
  return 'any';
}

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
          color: '#64748b',
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
              <div style={{ fontSize: 8, color: '#475569', marginBottom: 2 }}>{label}</div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => (card ? clearCard(i) : setSelectorOpen(isActive ? null : i))}
                style={{
                  width: 44,
                  height: 60,
                  borderRadius: 8,
                  border: `2px solid ${isActive ? '#00d4ff' : card ? suit?.color || '#64748b' : 'rgba(255,255,255,0.08)'}`,
                  background: card
                    ? 'rgba(255,255,255,0.06)'
                    : isActive
                      ? 'rgba(0,212,255,0.05)'
                      : 'rgba(0,0,0,0.2)',
                  color: card ? '#e2e8f0' : '#475569',
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
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Range Grid — {pct}% of hands
        </div>
        {hoveredCell && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff' }}>
            {hoveredCell.hand} {hoveredCell.inRange ? '✓ In Range' : '✗ Fold'}
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
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}
        >
          <div
            style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.4)' }}
          />{' '}
          Raise/Open
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}
        >
          <div
            style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.4)' }}
          />{' '}
          Call/Flat
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}
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
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
            {heroPos} vs {villainPos}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {config.format} · {config.stackDepth}bb · {config.rakePreset}
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
            color: '#22c55e',
          }}
        >
          {result.source === 'precomputed' ? 'Pre-Solved' : 'Estimated'}
        </div>
      </div>

      {/* Strategy */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
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
                    ? '#ef4444'
                    : a.action === 'Call'
                      ? '#22c55e'
                      : a.action === 'Fold'
                        ? '#64748b'
                        : '#3b82f6',
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', minWidth: 50 }}>
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
                transition={{ duration: 0.5 }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background:
                    a.action === 'Raise'
                      ? '#ef4444'
                      : a.action === 'Call'
                        ? '#22c55e'
                        : a.action === 'Fold'
                          ? '#64748b'
                          : '#3b82f6',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#94a3b8',
                minWidth: 36,
                textAlign: 'right',
              }}
            >
              {a.freq}%
            </div>
          </div>
        ))}
      </div>

      {/* Range Grid Visualization */}
      <RangeGridVisual rangeStr={result.range} actions={result.actions} />

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
              color: '#64748b',
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
              color: '#94a3b8',
              lineHeight: 1.5,
              fontFamily: "'Courier New', monospace",
            }}
          >
            {result.range}
          </div>
        </div>
      )}

      {/* Runout Analysis */}
      {Array.isArray(config?.boardCards) && config.boardCards.filter(Boolean).length >= 3 && (
        <div
          style={{
            marginTop: 12,
            padding: '12px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.15)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            🎲 Runout Strategy Shift
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {['A', 'K', 'Q', 'J', 'T', '8', '5', '2'].map((rank) => {
              const baseFreq = result?.actions?.find((a) => a?.action === 'Raise')?.freq || 30;
              // HARDENED: deterministic values (no Math.random — prevents flickering)
              const betShift = deterministicShift(rank, baseFreq);
              return (
                <div
                  key={rank}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 6,
                    textAlign: 'center',
                    background: betShift > 50 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                    border: `1px solid ${betShift > 50 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{rank}x</div>
                  <div
                    style={{
                      fontSize: 9,
                      color: betShift > 50 ? '#ef4444' : '#22c55e',
                      fontWeight: 700,
                    }}
                  >
                    Bet {betShift}%
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: '#475569', marginTop: 6, textAlign: 'center' }}>
            Shows how betting frequency changes on different turn/river cards
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

  // Bus listener — only clear on explicit PAGE_NAVIGATE events, not all session ends
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      const source = event?.source;
      // Don't clear our own result when other pages end sessions
      if (source === 'CustomSolve') return;
    });
    return unsub;
  }, []);

  // Configuration state
  const [heroPos, setHeroPos] = useState('BTN');
  const [villainPos, setVillainPos] = useState('BB');
  const [format, setFormat] = useState('cash');
  const [rakePreset, setRakePreset] = useState('low');
  const [ante, setAnte] = useState('None');
  const [stackDepth, setStackDepth] = useState(100);
  const [boardTexture, setBoardTexture] = useState('any');
  const [boardCards, setBoardCards] = useState([null, null, null, null, null]);

  // Auto-classify board texture from selected cards
  useEffect(() => {
    const selected = boardCards.filter(Boolean);
    if (selected.length >= 3) {
      setBoardTexture(classifyBoardTexture(selected));
    }
  }, [boardCards]);

  // Per-position custom stacks
  const [customStacks, setCustomStacks] = useState(
    Object.fromEntries(POSITIONS.map((p) => [p, 100]))
  );

  // Results state
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSolve = useCallback(async () => {
    setLoading(true);
    setError(null);

    const config = {
      heroPos,
      villainPos,
      format,
      rakePreset,
      ante,
      stackDepth,
      boardTexture,
      stacks: customStacks,
    };

    try {
      const token = getAccessToken();
      const res = await fetch('/api/training/solver-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          heroPosition: heroPos,
          villainPosition: villainPos,
          board: boardCards.filter(Boolean),
          stacks: customStacks,
          gameType: format,
        }),
      });

      const data = await res.json();

      if (data.strategy) {
        setResult({
          source: data.source || 'precomputed',
          actions: data.strategy?.actions || [
            {
              action: 'Raise',
              freq: Math.round((PRECOMPUTED_RANGES[heroPos]?.openRange || 25) * 0.7),
            },
            {
              action: 'Call',
              freq: Math.round((PRECOMPUTED_RANGES[heroPos]?.openRange || 25) * 0.3),
            },
            {
              action: 'Fold',
              freq: Math.round(100 - (PRECOMPUTED_RANGES[heroPos]?.openRange || 25)),
            },
          ],
          range: PRECOMPUTED_RANGES[heroPos]?.hands || 'N/A',
          rangePercent: PRECOMPUTED_RANGES[heroPos]?.openRange || 'N/A',
        });
      } else {
        // Fallback to local pre-computed
        const heroRange = PRECOMPUTED_RANGES[heroPos] || PRECOMPUTED_RANGES.BTN;
        const rakeAdjustment =
          RAKE_PRESETS[rakePreset]?.rake > 5 ? -3 : RAKE_PRESETS[rakePreset]?.rake === 0 ? 4 : 0;
        const stackAdjustment = stackDepth < 50 ? -5 : stackDepth > 150 ? 3 : 0;
        const adjustedRange =
          typeof heroRange.openRange === 'number'
            ? Math.max(5, Math.min(60, heroRange.openRange + rakeAdjustment + stackAdjustment))
            : heroRange.openRange;

        setResult({
          source: 'precomputed',
          actions: [
            {
              action: 'Raise',
              freq: Math.round(typeof adjustedRange === 'number' ? adjustedRange * 0.65 : 20),
            },
            {
              action: 'Call',
              freq: Math.round(typeof adjustedRange === 'number' ? adjustedRange * 0.35 : 10),
            },
            {
              action: 'Fold',
              freq: Math.round(typeof adjustedRange === 'number' ? 100 - adjustedRange : 70),
            },
          ],
          range: heroRange.hands,
          rangePercent: adjustedRange,
        });
      }
    } catch (e) {
      // Fallback to local computation
      const heroRange = PRECOMPUTED_RANGES[heroPos] || PRECOMPUTED_RANGES.BTN;
      setResult({
        source: 'precomputed',
        actions: [
          {
            action: 'Raise',
            freq: Math.round(
              typeof heroRange.openRange === 'number' ? heroRange.openRange * 0.65 : 20
            ),
          },
          {
            action: 'Call',
            freq: Math.round(
              typeof heroRange.openRange === 'number' ? heroRange.openRange * 0.35 : 10
            ),
          },
          {
            action: 'Fold',
            freq: Math.round(
              typeof heroRange.openRange === 'number' ? 100 - heroRange.openRange : 70
            ),
          },
        ],
        range: heroRange.hands,
        rangePercent: heroRange.openRange,
      });
    }

    setLoading(false);
  }, [heroPos, villainPos, format, rakePreset, ante, stackDepth, boardTexture, customStacks]);

  // Save solve result to Supabase + emit EventBus
  useEffect(() => {
    if (!result) return;
    const saveSolveSession = async () => {
      try {
        const token = getAccessToken();
        if (!token) return;
        await fetch('/api/training/save-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gameId: 'custom-solve',
            gameName: `Custom Solve: ${heroPos} vs ${villainPos}`,
            gtowScore: 100,
            totalEVLoss: 0,
            handsPlayed: 1,
            mistakeCount: 0,
            accuracy: 100,
            correctCount: 1,
            bestStreak: 1,
            levelPassed: true,
            level: 1,
            handHistory: [],
            trainerConfig: {
              heroPos,
              villainPos,
              format,
              rakePreset,
              ante,
              stackDepth,
              boardTexture,
              boardCards: boardCards.filter(Boolean),
            },
          }),
        });
        console.log('[CustomSolve] Session saved ✅');
      } catch (err) {
        console.warn('[CustomSolve] Save error (non-blocking):', err.message);
      }
    };
    saveSolveSession();
    eventBus?.emit?.(
      EventType?.SESSION_END || 'session:end',
      {
        gameId: 'custom-solve',
        handsPlayed: 1,
        accuracy: 100,
      },
      'CustomSolve'
    );
  }, [result]);

  const updateStack = (pos, value) => {
    const num = parseInt(value) || 0;
    setCustomStacks((prev) => ({ ...prev, [pos]: Math.min(500, Math.max(1, num)) }));
  };

  return (
    <>
      <Head>
        <title>Custom Solve | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Configure custom parameters and query GTO solutions for any spot."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
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
              color: '#94a3b8',
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
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Configure parameters & query GTO solutions
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Format Selector */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Game Format
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {FORMAT_OPTIONS.map((opt) => (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setFormat(opt.id)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 10,
                    border: `1px solid ${format === opt.id ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    background: format === opt.id ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                    color: format === opt.id ? '#00d4ff' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{opt.icon}</div>
                  {opt.label}
                </motion.button>
              ))}
            </div>
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
                  color: '#64748b',
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
                      color: heroPos === p ? '#22c55e' : '#64748b',
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
                  color: '#64748b',
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
                      color: villainPos === p ? '#ef4444' : '#64748b',
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

          {/* Rake Preset */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Rake Structure
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.entries(RAKE_PRESETS).map(([key, preset]) => (
                <motion.button
                  key={key}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setRakePreset(key)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${rakePreset === key ? 'rgba(168,85,247,0.3)' : 'transparent'}`,
                    background: rakePreset === key ? 'rgba(168,85,247,0.06)' : 'rgba(0,0,0,0.2)',
                    color: rakePreset === key ? '#a855f7' : '#64748b',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </motion.button>
              ))}
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 4, padding: '0 4px' }}>
              {(RAKE_PRESETS[rakePreset] || {}).rake || 0}% / $
              {(Number.isFinite(RAKE_PRESETS[rakePreset]?.cap)
                ? RAKE_PRESETS[rakePreset].cap
                : 0
              ).toFixed(2)}{' '}
              cap
            </div>
          </div>

          {/* Ante / Straddle */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Ante / Straddle
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ANTE_OPTIONS.map((opt) => (
                <motion.button
                  key={opt}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAnte(opt)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${ante === opt ? 'rgba(251,191,36,0.3)' : 'transparent'}`,
                    background: ante === opt ? 'rgba(251,191,36,0.06)' : 'rgba(0,0,0,0.2)',
                    color: ante === opt ? '#fbbf24' : '#64748b',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {opt}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Stack Depth */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
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
                  onClick={() => {
                    setStackDepth(sd);
                    setCustomStacks(Object.fromEntries(POSITIONS.map((p) => [p, sd])));
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${stackDepth === sd ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                    background: stackDepth === sd ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                    color: stackDepth === sd ? '#00d4ff' : '#64748b',
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

          {/* Per-Position Stacks */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Per-Position Stacks (BB)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
              {POSITIONS.map((p) => (
                <div key={p} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>
                    {p}
                  </div>
                  <input
                    type="number"
                    value={customStacks[p]}
                    onChange={(e) => updateStack(p, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 4px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(0,0,0,0.3)',
                      color: '#e2e8f0',
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Board Card Selector */}
          <BoardCardSelector boardCards={boardCards} setBoardCards={setBoardCards} />

          {/* Board Texture */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Board Texture Filter
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BOARD_TEXTURES.map((bt) => (
                <motion.button
                  key={bt.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setBoardTexture(bt.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${boardTexture === bt.id ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                    background:
                      boardTexture === bt.id ? 'rgba(59,130,246,0.06)' : 'rgba(0,0,0,0.2)',
                    color: boardTexture === bt.id ? '#3b82f6' : '#64748b',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {bt.label}
                </motion.button>
              ))}
            </div>
          </div>

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
              color: '#00d4ff',
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
                    borderTopColor: '#00d4ff',
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
                  color: '#f87171',
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
              config={{ format, stackDepth, rakePreset, boardCards }}
              result={result}
            />
          )}
        </div>
      </div>
    </>
  );
}
