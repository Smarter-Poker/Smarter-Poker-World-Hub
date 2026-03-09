/**
 * Equity Calculator — Monte Carlo Hand vs Hand Equity Tool
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 19: Interactive equity calculator for comparing hands pre-flop and
 * on specific boards. Uses server-side Monte Carlo simulation.
 *
 * Route: /hub/training/equity-calculator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
  { char: 'h', symbol: '\u2665', color: '#ef4444', name: 'Hearts' },
  { char: 'd', symbol: '\u2666', color: '#3b82f6', name: 'Diamonds' },
  { char: 'c', symbol: '\u2663', color: '#22c55e', name: 'Clubs' },
  { char: 's', symbol: '\u2660', color: '#94a3b8', name: 'Spades' },
];

const PLAYER_COLORS = ['#00d4ff', '#ef4444', '#22c55e', '#f97316'];
const PLAYER_LABELS = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

const PRESETS = [
  { name: 'AA vs KK', hands: ['AhAs', 'KdKc'], board: [] },
  { name: 'AKs vs QQ', hands: ['AhKh', 'QcQd'], board: [] },
  { name: 'AKo vs 77', hands: ['AhKd', '7c7s'], board: [] },
  { name: 'AA vs AKs', hands: ['AhAd', 'AcKc'], board: [] },
  { name: 'JJ vs AKs', hands: ['JhJd', 'AcKc'], board: [] },
  { name: 'KK vs AKs vs QQ', hands: ['KhKd', 'AcKc', 'QsQh'], board: [] },
  { name: 'Cooler: Set vs Flush', hands: ['7h7d', 'Ah9h'], board: ['7s', '3h', '5h'] },
  { name: 'Pair vs Overcards', hands: ['6d6c', 'AhKs'], board: [] },
];

// Auth helper
function getAuthHeaders() {
  try {
    const raw =
      localStorage.getItem('sb-auth-token') || localStorage.getItem('supabase.auth.token');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token || parsed?.currentSession?.access_token;
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch (e) {
    /* ignore */
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD PICKER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CardPicker({ selectedCards, onSelect, usedCards, label }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState(0); // Which card slot we're picking for

  const handlePick = (rank, suit) => {
    const card = rank + suit.char;
    if (usedCards.has(card)) return;
    const newCards = [...selectedCards];
    newCards[slot] = card;
    onSelect(newCards.filter(Boolean));
    if (slot < selectedCards.length) {
      setSlot((prev) => Math.min(prev + 1, 1));
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
          fontSize: 9,
          color: '#64748b',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[0, 1].map((idx) => {
          const card = selectedCards[idx];
          return (
            <div
              key={idx}
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
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    x
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 18, color: '#475569' }}>?</span>
              )}
            </div>
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
                  fontSize: 10,
                  color: '#00d4ff',
                  fontWeight: 700,
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                SELECT CARD
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                x
              </button>
            </div>
            {SUITS.map((suit) => (
              <div key={suit.char} style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {RANKS.map((rank) => {
                  const card = rank + suit.char;
                  const used = usedCards.has(card);
                  return (
                    <button
                      key={card}
                      onClick={() => !used && handlePick(rank, suit)}
                      disabled={used}
                      style={{
                        width: 24,
                        height: 28,
                        borderRadius: 3,
                        border: 'none',
                        fontSize: 10,
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
                      <span style={{ fontSize: 10 }}>{rank}</span>
                      <span style={{ fontSize: 8 }}>{suit.symbol}</span>
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
// BOARD PICKER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

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
          fontSize: 9,
          color: '#64748b',
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
            <div
              key={idx}
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
                      fontSize: 11,
                      color: SUITS.find((s) => s.char === card[1])?.color || '#fff',
                    }}
                  >
                    {SUITS.find((s) => s.char === card[1])?.symbol}
                  </span>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCard(idx);
                    }}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 8,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    x
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 10, color: '#333' }}>{label || '?'}</span>
              )}
            </div>
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
                  fontSize: 10,
                  color: '#00d4ff',
                  fontWeight: 700,
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                BOARD CARD
              </span>
              <button
                onClick={() => setActiveSlot(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                x
              </button>
            </div>
            {SUITS.map((suit) => (
              <div key={suit.char} style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {RANKS.map((rank) => {
                  const card = rank + suit.char;
                  const used = usedCards.has(card);
                  return (
                    <button
                      key={card}
                      onClick={() => !used && handlePick(rank, suit)}
                      disabled={used}
                      style={{
                        width: 24,
                        height: 28,
                        borderRadius: 3,
                        border: 'none',
                        fontSize: 10,
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
                      <span style={{ fontSize: 10 }}>{rank}</span>
                      <span style={{ fontSize: 8 }}>{suit.symbol}</span>
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
// EQUITY RESULT BAR
// ═══════════════════════════════════════════════════════════════════════════

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
                fontFamily: "'Orbitron', monospace",
                lineHeight: 1,
              }}
            >
              {r.equity}%
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>
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
            transition={{ duration: 0.6, ease: 'easeOut' }}
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
                  fontSize: 10,
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
                fontSize: 10,
                fontWeight: 700,
                color: PLAYER_COLORS[i],
                fontFamily: "'Orbitron', monospace",
                marginBottom: 4,
              }}
            >
              {formatHand(r.hand)}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#94a3b8' }}>
              <span>
                Win: <strong style={{ color: '#e2e8f0' }}>{r.wins}</strong>
              </span>
              <span>
                Tie: <strong style={{ color: '#e2e8f0' }}>{r.ties}</strong>
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
  const c1 = handStr.substring(0, 2);
  const c2 = handStr.substring(2, 4);
  const s1 = SUITS.find((s) => s.char === c1[1]);
  const s2 = SUITS.find((s) => s.char === c2[1]);
  return `${c1[0]}${s1?.symbol || c1[1]} ${c2[0]}${s2?.symbol || c2[1]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function EquityCalculatorPage() {
  const router = useRouter();
  useTrainingBus('equity-calculator');
  const calcCountRef = useRef(0);

  // State
  const [numPlayers, setNumPlayers] = useState(2);
  const [hands, setHands] = useState([[], []]);
  const [boardCards, setBoardCards] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    return hands.slice(0, numPlayers).every((h) => h.length === 2);
  }, [hands, numPlayers]);

  // Update hand for player
  const updateHand = useCallback((playerIdx, cards) => {
    setHands((prev) => {
      const next = [...prev];
      next[playerIdx] = cards;
      return next;
    });
    setResults(null);
  }, []);

  // Add/remove player
  const changePlayerCount = useCallback((count) => {
    setNumPlayers(count);
    setHands((prev) => {
      const next = [...prev];
      while (next.length < count) next.push([]);
      return next;
    });
    setResults(null);
  }, []);

  // Load preset
  const loadPreset = useCallback((preset) => {
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
    setError(null);
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setHands([[], [], [], []]);
    setBoardCards([]);
    setResults(null);
    setError(null);
  }, []);

  // Calculate equity
  const calculate = useCallback(async () => {
    if (!canCalculate) return;
    setLoading(true);
    setError(null);
    try {
      const handStrings = hands.slice(0, numPlayers).map((h) => h.join(''));
      const res = await fetch('/api/training/equity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          hands: handStrings,
          board: boardCards,
          variant: 'holdem',
          iterations: 5000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        calcCountRef.current += 1;
        busEmit.sessionEnd('equity-calculator');
      } else {
        setError(data.error || 'Calculation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [canCalculate, hands, numPlayers, boardCards]);

  return (
    <>
      <Head>
        <title>Equity Calculator | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Calculate hand vs hand equity with Monte Carlo simulation. Compare up to 4 hands pre-flop or on specific boards."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: '#94a3b8',
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
                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Equity Calculator
            </h1>
            <span
              style={{
                fontSize: 10,
                color: '#a855f7',
                background: 'rgba(168,85,247,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(168,85,247,0.2)',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              PHASE 19
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: '20px 24px', maxWidth: 700, margin: '0 auto' }}>
          {/* Player Count */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <span
              style={{
                fontSize: 10,
                color: '#64748b',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Players:
            </span>
            {[2, 3, 4].map((n) => (
              <button
                key={n}
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
                      ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                      : 'rgba(255,255,255,0.06)',
                  color: numPlayers === n ? '#fff' : '#94a3b8',
                  fontFamily: "'Orbitron', monospace",
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
                    fontSize: 10,
                    fontWeight: 800,
                    color: PLAYER_COLORS[idx],
                    fontFamily: "'Orbitron', monospace",
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
            <BoardPicker boardCards={boardCards} onUpdate={setBoardCards} usedCards={usedCards} />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              onClick={calculate}
              disabled={!canCalculate || loading}
              style={{
                flex: '1 1 200px',
                padding: '14px 0',
                background: canCalculate
                  ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                  : 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: 10,
                color: canCalculate ? '#fff' : '#475569',
                cursor: canCalculate ? 'pointer' : 'default',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "'Orbitron', monospace",
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Calculating...' : 'Calculate Equity'}
            </button>
            <button
              onClick={clearAll}
              style={{
                padding: '14px 20px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Clear All
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: '#ef4444',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {results && (
              <motion.div
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
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#a855f7',
                    fontFamily: "'Orbitron', monospace",
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  EQUITY RESULTS (5,000 SIMULATIONS)
                </div>
                <EquityBar results={results} />
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
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 10,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Quick Presets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => loadPreset(preset)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: '#94a3b8',
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
            style={{
              marginTop: 20,
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              About This Tool
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
              The Equity Calculator uses Monte Carlo simulation (5,000 iterations) to determine
              win/tie percentages for each hand. Enter specific hole cards for up to 4 players and
              optionally add board cards to see how equity changes on different textures. This is a
              core study tool for understanding pre-flop hand strength and post-flop equity shifts.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
