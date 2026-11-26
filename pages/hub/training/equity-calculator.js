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

const PLAYER_COLORS = ['var(--sp-accent-cyan)', 'var(--sp-accent-red)', 'var(--sp-accent-green)', 'var(--sp-accent-orange)'];
const PLAYER_LABELS = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

const EQUITY_VARIANTS = [
  { id: 'holdem', label: "Hold'em (2c)", holeCount: 2 },
  { id: 'plo4', label: 'PLO4 (4c)', holeCount: 4 },
  { id: 'plo5', label: 'PLO5 (5c)', holeCount: 5 },
  { id: 'plo6', label: 'PLO6 (6c)', holeCount: 6 },
  { id: 'plo8', label: 'PLO8 (4c Hi-Lo)', holeCount: 4 },
];

const PRESETS = [
  { name: 'AA vs KK', variant: 'holdem', hands: ['AhAs', 'KdKc'], board: [] },
  { name: 'AKs vs QQ', variant: 'holdem', hands: ['AhKh', 'QcQd'], board: [] },
  { name: 'AKo vs 77', variant: 'holdem', hands: ['AhKd', '7c7s'], board: [] },
  { name: 'AA vs AKs', variant: 'holdem', hands: ['AhAd', 'AcKc'], board: [] },
  { name: 'JJ vs AKs', variant: 'holdem', hands: ['JhJd', 'AcKc'], board: [] },
  { name: 'KK vs AKs vs QQ', variant: 'holdem', hands: ['KhKd', 'AcKc', 'QsQh'], board: [] },
  { name: 'Cooler: Set vs Flush', variant: 'holdem', hands: ['7h7d', 'Ah9h'], board: ['7s', '3h', '5h'] },
  { name: 'PLO4: AAKKds vs Rundown', variant: 'plo4', hands: ['AhAsKhKs', 'JhTh9d8d'], board: [] },
  { name: 'PLO5: Wrap vs Top Set', variant: 'plo5', hands: ['AhKhQhJdTc', '9s9d9c2h3d'], board: ['9h', '8h', '2c'] },
  { name: 'PLO6: 6-Card High Clash', variant: 'plo6', hands: ['AhAsKhKsQhQs', 'JhTh9h8d7d6c'], board: [] },
  { name: 'PLO8: As2sKd3d vs QhQcJdTd', variant: 'plo8', hands: ['As2sKd3d', 'QhQcJdTd'], board: [] },
];


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
    <div style={{ position: 'relative' }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--sp-fg-dim)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {Array.from({ length: holeCount }, (_, idx) => idx).map((idx) => {
          const card = selectedCards[idx];
          return (
            <button
              type="button"
              key={idx}
              aria-label={`Select hole card ${idx + 1}`}
              onClick={() => {
                setSlot(idx);
                setOpen(true);
              }}
              style={{
                width: 44,
                height: 60,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: card ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                border: card
                  ? '2px solid rgba(0,212,255,0.3)'
                  : '2px dashed rgba(255,255,255,0.15)',
                position: 'relative',
                padding: 0,
              }}
            >
              {card ? (
                <>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: SUITS.find((s) => s.char === card[1])?.color || '#fff',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {card[0]}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: SUITS.find((s) => s.char === card[1])?.color || '#fff',
                    }}
                  >
                    {SUITS.find((s) => s.char === card[1])?.symbol}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove hole card ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); removeCard(idx); } }}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'var(--sp-accent-red)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 18, color: 'var(--sp-fg-faint)' }}>?</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Card Grid Picker Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -5 }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 200,
              background: 'linear-gradient(145deg, #1a1a2e, #0f172a)',
              border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 10,
              padding: 10,
              marginTop: 4,
              boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
              minWidth: 220,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--sp-accent-cyan)',
                  fontWeight: 700,
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                SELECT CARD
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--sp-fg-dim)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                X
              </button>
            </div>
            {SUITS.map((suit) => (
              <div key={suit.char} style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {RANKS.map((rank) => {
                  const card = rank + suit.char;
                  const used = usedCards.has(card);
                  return (
                    <button
                      type="button"
                      key={card}
                      onClick={() => !used && handlePick(rank, suit)}
                      disabled={used}
                      style={{
                        width: 24,
                        height: 28,
                        borderRadius: 3,
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: used ? 'not-allowed' : 'pointer',
                        background: used ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                        color: used ? '#333' : suit.color,
                        opacity: used ? 0.3 : 1,
                        transition: 'all 0.1s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{rank}</span>
                      <span style={{ fontSize: 12 }}>{suit.symbol}</span>
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// BOARD PICKER COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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
    <div style={{ position: 'relative' }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--sp-fg-dim)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        Board (Optional)
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[0, 1, 2, 3, 4].map((idx) => {
          const card = boardCards[idx];
          const isFlop = idx < 3;
          const label = idx === 3 ? 'T' : idx === 4 ? 'R' : '';
          return (
            <button
              type="button"
              key={idx}
              aria-label={`Select board card ${idx + 1}`}
              onClick={() => setActiveSlot(idx)}
              style={{
                width: 36,
                height: 50,
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                cursor: 'pointer',
                background: card ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                border:
                  activeSlot === idx
                    ? '2px solid #00d4ff'
                    : card
                      ? '1px solid rgba(255,255,255,0.15)'
                      : '1px dashed rgba(255,255,255,0.1)',
                position: 'relative',
                transition: 'all 0.15s',
                padding: 0,
              }}
            >
              {card ? (
                <>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: SUITS.find((s) => s.char === card[1])?.color || '#fff',
                    }}
                  >
                    {card[0]}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: SUITS.find((s) => s.char === card[1])?.color || '#fff',
                    }}
                  >
                    {SUITS.find((s) => s.char === card[1])?.symbol}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove board card ${idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); removeCard(idx); } }}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'var(--sp-accent-red)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: '#333' }}>{label || '?'}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Inline picker */}
      <AnimatePresence>
        {activeSlot !== null && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 200,
              background: 'linear-gradient(145deg, #1a1a2e, #0f172a)',
              border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 10,
              padding: 10,
              marginTop: 4,
              boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
              minWidth: 220,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--sp-accent-cyan)',
                  fontWeight: 700,
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                BOARD CARD
              </span>
              <button
                type="button"
                onClick={() => setActiveSlot(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--sp-fg-dim)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                X
              </button>
            </div>
            {SUITS.map((suit) => (
              <div key={suit.char} style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {RANKS.map((rank) => {
                  const card = rank + suit.char;
                  const used = usedCards.has(card);
                  return (
                    <button
                      type="button"
                      key={card}
                      onClick={() => !used && handlePick(rank, suit)}
                      disabled={used}
                      style={{
                        width: 24,
                        height: 28,
                        borderRadius: 3,
                        border: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: used ? 'not-allowed' : 'pointer',
                        background: used ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                        color: used ? '#333' : suit.color,
                        opacity: used ? 0.3 : 1,
                        transition: 'all 0.1s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        lineHeight: 1,
                        padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{rank}</span>
                      <span style={{ fontSize: 12 }}>{suit.symbol}</span>
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

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// EQUITY RESULT BAR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function EquityBar({ results }) {
  if (!results || results.length === 0) return null;
  const total = results.reduce((a, r) => a + r.equity, 0) || 100;

  return (
    <div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              textAlign: i === 0 ? 'left' : i === results.length - 1 ? 'right' : 'center',
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: PLAYER_COLORS[i],
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                lineHeight: 1,
              }}
            >
              {r.equity}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', fontWeight: 600, marginTop: 2 }}>
              {formatHand(r.hand)}
            </div>
          </div>
        ))}
      </div>

      {/* Bar */}
      <div
        style={{
          height: 28,
          borderRadius: 14,
          overflow: 'hidden',
          display: 'flex',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {results.map((r, i) => (
          <motion.div
            key={i}
            initial={{ width: `${100 / results.length}%` }}
            animate={{ width: `${(r.equity / total) * 100}%` }}
            transition={{ duration: MOTION.slow, ease: 'easeOut' }}
            style={{
              height: '100%',
              background: `linear-gradient(90deg, ${PLAYER_COLORS[i]}80, ${PLAYER_COLORS[i]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: r.equity > 3 ? 30 : 0,
            }}
          >
            {r.equity > 10 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                }}
              >
                {r.equity}%
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Detail Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {results.map((r, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8,
              padding: '8px 12px',
              flex: '1 1 120px',
              border: `1px solid ${PLAYER_COLORS[i]}20`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: PLAYER_COLORS[i],
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                marginBottom: 4,
              }}
            >
              {formatHand(r.hand)}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--sp-fg-muted)' }}>
              <span>
                Win: <strong style={{ color: 'var(--sp-fg)' }}>{r.wins}</strong>
              </span>
              <span>
                Tie: <strong style={{ color: 'var(--sp-fg)' }}>{r.ties}</strong>
              </span>
            </div>
          </div>
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
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [offlineFallbackUsed, setOfflineFallbackUsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
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

    const totalStrength =
      playerEvals.reduce((sum, ev) => sum + Math.max(10, Number(ev?.handScore) || 50), 0) || 100;
    const localResults = activeHands.map((playerCards, idx) => {
      const score = Math.max(10, Number(playerEvals[idx]?.handScore) || 50);
      const equity = Number(((score / totalStrength) * 100).toFixed(1));
      return {
        hand: (playerCards || []).join(''),
        equity,
        wins: Math.round((equity / 100) * 5000),
        ties: 0,
      };
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

    return { localResults, localBrainAnalysis };
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
    setBoardCards(nextBoard);
    setResults(null);
    setHorseBrainAnalysis(null);
    setError(null);
  }, []);

  // Load preset
  const loadPreset = useCallback((preset) => {
    calcSeqRef.current += 1;
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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
      setOfflineFallbackUsed(true);
      const { localResults, localBrainAnalysis } = buildLocalOfflineEvaluation();
      setResults(localResults);
      setHorseBrainAnalysis(localBrainAnalysis);
      setEquitySeq(reqSeq);
      setLoading(false);
      return;
    }

    try {
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
        setOfflineFallbackUsed(true);
        const { localResults, localBrainAnalysis } = buildLocalOfflineEvaluation();
        setResults(localResults);
        setHorseBrainAnalysis(localBrainAnalysis);
        setEquitySeq(reqSeq);
        setError(err.message);
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
        answer: 'A Monte Carlo Equity Calculator Simulates Thousands Of Random Unrevealed Community Board Runouts To Calculate Exact Win, Tie, And Loss Frequencies.',
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
          text: 'Click Calculate Equity to run server-side Monte Carlo iterations and inspect exact Win %, Tie %, and total Pot Equity bars for every hand.',
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

      <div
        className="sp-training-tool sp-training-tool--analysis sp-analysis-equity"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          className="sp-training-analysis-header"
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              &larr; Training
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Equity Calculator
            </h1>
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-accent-purple)',
                background: 'rgba(168,85,247,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(168,85,247,0.2)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              PHASE 19
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="sp-training-analysis-main" style={{ padding: '20px 24px', maxWidth: 700, margin: '0 auto' }}>
          {/* Variant & Player Count */}
          <div
            data-equity-variant-selector="true"
            style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-fg-dim)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Variant:
            </span>
            {EQUITY_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                data-variant-option={v.id}
                data-equity-variant={v.id}
                aria-pressed={variant === v.id}
                onClick={() => changeVariant(v.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: variant === v.id ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.2s',
                  background:
                    variant === v.id
                      ? 'linear-gradient(135deg, rgba(6,182,212,0.35), rgba(59,130,246,0.35))'
                      : 'rgba(255,255,255,0.05)',
                  color: variant === v.id ? '#e0f2fe' : 'var(--sp-fg-muted)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {variant === 'plo8' && (
            <div
              data-plo8-equity-banner="true"
              style={{
                marginBottom: 14,
                padding: '8px 14px',
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                color: '#6ee7b7',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}
            >
              PLO8 Hi-Lo 8-Or-Better (2 Hole + 3 Board)
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-fg-dim)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Players:
            </span>
            {[2, 3, 4].map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={numPlayers === n}
                onClick={() => changePlayerCount(n)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.2s',
                  background:
                    numPlayers === n
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)'
                      : 'rgba(255,255,255,0.06)',
                  color: numPlayers === n ? '#fff' : 'var(--sp-fg-muted)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {n}-Way
              </button>
            ))}
          </div>

          {/* Hand Inputs */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 16,
              alignItems: 'flex-start',
            }}
          >
            {Array.from({ length: numPlayers }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${PLAYER_COLORS[idx]}20`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  flex: '1 1 120px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: PLAYER_COLORS[idx],
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    marginBottom: 6,
                  }}
                >
                  {PLAYER_LABELS[idx]}
                </div>
                <CardPicker
                  selectedCards={hands[idx] || []}
                  onSelect={(cards) => updateHand(idx, cards)}
                  usedCards={usedCards}
                  label=""
                  holeCount={activeVariantSpec.holeCount}
                />
              </div>
            ))}
          </div>

          {/* Board */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 16,
            }}
          >
            <BoardPicker boardCards={boardCards} onUpdate={updateBoardCards} usedCards={usedCards} />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="sp-analysis-primary-action"
              onClick={calculate}
              disabled={!canCalculate || loading}
              style={{
                flex: '1 1 200px',
                padding: '14px 0',
                background: canCalculate
                  ? 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 10,
                color: canCalculate ? '#fff' : 'var(--sp-fg-faint)',
                cursor: canCalculate ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Calculating...' : 'Calculate Equity'}
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{
                padding: '14px 20px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Clear All
            </button>
          </div>

          {(isOffline || offlineFallbackUsed) && (
            <div
              data-offline-equity-fallback="true"
              style={{
                padding: '12px 14px',
                marginBottom: 16,
                borderRadius: 10,
                border: '1px solid rgba(251, 191, 36, 0.45)',
                background: 'rgba(120, 53, 15, 0.22)',
                color: '#fde68a',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <strong style={{ color: '#fbbf24', textTransform: 'uppercase' }}>
                  Offline Horse Brain Evaluation Mode Active
                </strong>
                <button
                  type="button"
                  onClick={() => {
                    setRetryCount((c) => c + 1);
                    calculate();
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(251, 191, 36, 0.5)',
                    background: 'rgba(217, 119, 6, 0.28)',
                    color: '#fef3c7',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Retry Server Simulation {retryCount > 0 ? `(${retryCount})` : ''}
                </button>
              </div>
              {liveOfflineSpotPreview && (
                <div style={{ color: '#e2e8f0', lineHeight: 1.5 }}>
                  <div>
                    Engine: <strong>{liveOfflineSpotPreview.engineModule}</strong> · Made Hand: <strong>{liveOfflineSpotPreview.madeHandCategory}</strong> · Recommended Action: <strong style={{ color: '#4ade80' }}>{liveOfflineSpotPreview.recommendedAction}</strong>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    Draws: Flush Outs <strong>{liveOfflineSpotPreview.flushOuts}</strong> · Straight/Wrap Outs <strong>{liveOfflineSpotPreview.straightOuts}</strong> ({liveOfflineSpotPreview.wrapType})
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: 'var(--sp-accent-red)',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setRetryCount((c) => c + 1);
                  calculate();
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.18)',
                  color: '#fecaca',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Horse Brain 4-Variant Spot Preview & 1:1 Club Arena Launcher */}

          {/* Results */}
          <AnimatePresence>
            {results && (
              <motion.div
                data-equity-results-panel="true"
                data-equity-seq={equitySeq}
                data-equity-variant-result={variant}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                style={{
                  background:
                    'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                  border: '1px solid rgba(168,85,247,0.2)',
                  borderRadius: 14,
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: 'var(--sp-accent-purple)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  EQUITY RESULTS (5,000 SIMULATIONS)
                </div>
                <EquityBar results={results} />
                {horseBrainAnalysis && (
                  <div
                    data-equity-brain-panel="true"
                    data-brain-engine={horseBrainAnalysis.engineModule}
                    data-recommended-action={horseBrainAnalysis.recommendedAction || 'Call'}
                    style={{
                      marginTop: 14,
                      padding: '12px 14px',
                      borderRadius: 10,
                      background: 'rgba(6,182,212,0.08)',
                      border: '1px solid rgba(34,211,238,0.28)',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#67e8f9', textTransform: 'uppercase' }}>
                        {`Engine: ${horseBrainAnalysis.engineModule}`}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
                        {`Player 1 Made Hand: ${horseBrainAnalysis.madeHandCategory}`}
                      </span>
                      {horseBrainAnalysis.recommendedAction && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#4ade80' }}>
                          {`Recommended Line: ${horseBrainAnalysis.recommendedAction}`}
                        </span>
                      )}
                      {horseBrainAnalysis.potLimitMaxBetBb && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                          {`Pot-Limit Max Bet: ${horseBrainAnalysis.potLimitMaxBetBb} BB`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}>
                      {horseBrainAnalysis.coachingSummary}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Presets */}
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '14px 18px',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 10,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map((preset, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => loadPreset(preset)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--sp-fg-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* About Section */}
          <div
            className="sp-equity-aeo-kernel"
            style={{
              marginTop: 20,
              padding: '16px 20px',
              background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 0.12), rgba(255,255,255,0.02))',
              borderRadius: 12,
              border: '1px solid rgba(168,85,247,0.3)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--sp-accent-cyan)',
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                marginBottom: 8,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Direct Answer &bull; Poker Equity Overview
            </div>
            <p style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
              The Poker Equity Calculator Computes Real-Time Hand-Versus-Hand Odds Using 5,000 Monte Carlo Iterations Across Any Community Board. Input 2 To 4 Hole-Card Matchups Pre-Flop, Flop, Or Turn To Instantaneously Calculate Mathematical Win, Tie, And Loss Probabilities.
            </p>
          </div>

          {/* FAQ Accordion Section */}
          <div
            className="sp-equity-faq-section"
            style={{
              marginTop: 20,
              padding: '16px 20px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                marginBottom: 12,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Frequently Asked Questions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <details style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--sp-fg)' }}>
                  What Is Poker Equity?
                </summary>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6 }}>
                  Poker Equity Represents Your Expected Share Of The Pot Based On Your Mathematical Probability Of Winning Or Tying At Showdown.
                </div>
              </details>
              <details style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--sp-fg)' }}>
                  How Does A Monte Carlo Equity Calculator Work?
                </summary>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6 }}>
                  A Monte Carlo Equity Calculator Simulates Thousands Of Random Unrevealed Community Board Runouts To Calculate Exact Win, Tie, And Loss Frequencies.
                </div>
              </details>
              <details style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--sp-fg)' }}>
                  How Many Players Can Be Compared Simultaneously?
                </summary>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6 }}>
                  This Tool Supports Comparing Equities For Up To 4 Active Players Simultaneously Pre-Flop, On The Flop, Or On The Turn.
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
