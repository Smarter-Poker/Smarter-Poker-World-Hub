/**
 * ICM Calculator — Tournament Chip-to-Dollar Equity
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 21: Standalone ICM equity calculator for tournament players.
 * Converts chip stacks to dollar equity using the Malmuth-Harville model.
 *
 * Route: /hub/training/icm-calculator
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-2 — hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { authedFetch } from '../../../src/lib/authUtils';

// TRAIN-CSS-MOTION-ADOPT-4 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

function saveSession(payload) {
  authedFetch('/api/training/save-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const PLAYER_COLORS = [
  'var(--sp-accent-orange)',
  'var(--sp-accent-blue)',
  'var(--sp-accent-green)',
  'var(--sp-accent-purple)',
  'var(--sp-accent-red)',
  'var(--sp-accent-cyan)',
  'var(--sp-accent-amber)',
  '#ec4899',
  '#14b8a6',
];

const PRESETS = [
  {
    label: '9-Max Final Table',
    stacks: [45000, 38000, 32000, 28000, 22000, 18000, 14000, 8000, 5000],
    prizes: [31, 19.5, 14, 10.5, 8, 6, 4.5, 3.5, 3],
    prizePool: 10000,
  },
  {
    label: '6-Max Final Table',
    stacks: [30000, 25000, 20000, 15000, 12000, 8000],
    prizes: [35, 22, 16, 12, 9, 6],
    prizePool: 5000,
  },
  {
    label: 'Bubble (5 left, 4 paid)',
    stacks: [25000, 20000, 18000, 15000, 12000],
    prizes: [40, 27, 19, 14],
    prizePool: 5000,
  },
  {
    label: 'Heads-Up (2 left)',
    stacks: [60000, 40000],
    prizes: [60, 40],
    prizePool: 2000,
  },
  {
    label: '3-Handed',
    stacks: [50000, 30000, 20000],
    prizes: [50, 30, 20],
    prizePool: 3000,
  },
  {
    label: 'Satellite (4 seats)',
    stacks: [20000, 18000, 15000, 12000, 10000],
    prizes: [25, 25, 25, 25],
    prizePool: 4000,
  },
];


// ═══════════════════════════════════════════════════════════════════════════
// ICM PREFLOP RANGES COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const ICM_POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

// Pre-computed ICM push/fold ranges by number of BB
const ICM_PUSH_RANGES = {
  5: { UTG: 22, MP: 28, CO: 35, BTN: 48, SB: 55, BB: 100 },
  8: { UTG: 15, MP: 20, CO: 28, BTN: 38, SB: 45, BB: 80 },
  12: { UTG: 10, MP: 14, CO: 20, BTN: 28, SB: 35, BB: 55 },
  15: { UTG: 8, MP: 11, CO: 16, BTN: 22, SB: 28, BB: 45 },
  20: { UTG: 6, MP: 8, CO: 12, BTN: 18, SB: 22, BB: 35 },
  25: { UTG: 5, MP: 7, CO: 10, BTN: 14, SB: 18, BB: 28 },
};

const RISK_PREMIUM = {
  2: { UTG: 0, MP: 0, CO: 0, BTN: 1.02, SB: 1.12, BB: 1.18 },
  3: { UTG: 0, MP: 0, CO: 1.05, BTN: 1.08, SB: 1.15, BB: 1.22 },
  4: { UTG: 0, MP: 1.03, CO: 1.08, BTN: 1.12, SB: 1.2, BB: 1.28 },
  5: { UTG: 1.02, MP: 1.06, CO: 1.1, BTN: 1.15, SB: 1.25, BB: 1.35 },
  6: { UTG: 1.05, MP: 1.08, CO: 1.12, BTN: 1.18, SB: 1.28, BB: 1.38 },
  7: { UTG: 1.08, MP: 1.1, CO: 1.15, BTN: 1.22, SB: 1.32, BB: 1.42 },
  8: { UTG: 1.1, MP: 1.12, CO: 1.18, BTN: 1.25, SB: 1.35, BB: 1.48 },
  9: { UTG: 1.12, MP: 1.15, CO: 1.2, BTN: 1.28, SB: 1.38, BB: 1.52 },
};

function ICMPreflopRanges({ playerCount = 6, bountyFormat = 'Regular' }) {
  const [selectedBB, setSelectedBB] = React.useState(12);
  const [selectedPosition, setSelectedPosition] = React.useState('BTN');

  const positions = React.useMemo(() => {
    const count = Math.min(playerCount, 6);
    return ICM_POSITIONS.slice(Math.max(0, 6 - count));
  }, [playerCount]);

  const pushRange = React.useMemo(() => {
    const ranges = ICM_PUSH_RANGES[selectedBB] || ICM_PUSH_RANGES[12];
    let rangePct = ranges[selectedPosition] || 15;

    // Bounty format adjustments
    if (bountyFormat === 'KO') rangePct = Math.min(100, Math.round(rangePct * 1.15));
    if (bountyFormat === 'PKO') rangePct = Math.min(100, Math.round(rangePct * 1.1));

    return rangePct;
  }, [selectedBB, selectedPosition, bountyFormat]);

  const riskPremium = React.useMemo(() => {
    const premiums = RISK_PREMIUM[Math.min(playerCount, 9)] || RISK_PREMIUM[6];
    return premiums[selectedPosition] || 1.0;
  }, [playerCount, selectedPosition]);

  // Generate the 13x13 range grid with ICM-adjusted colors
  const gridCells = React.useMemo(() => {
    const cells = [];
    const totalCombos = 169;
    const pushCombos = Math.round((pushRange / 100) * totalCombos);

    // Simplified hand strength ordering (top left = strongest)
    let comboIndex = 0;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        comboIndex++;
        const isPush = comboIndex <= pushCombos;
        const isPair = r === c;
        const isSuited = c > r;
        const label = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
            ? `${RANKS[r]}${RANKS[c]}s`
            : `${RANKS[c]}${RANKS[r]}o`;

        cells.push({
          key: `${r}-${c}`,
          label,
          isPush,
          isPair,
          isSuited,
        });
      }
    }
    return cells;
  }, [pushRange]);

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {/* BB Selector */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          Effective Stack (BB)
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[5, 8, 12, 15, 20, 25].map((bb) => (
            <button
              key={bb}
              onClick={() => setSelectedBB(bb)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background: selectedBB === bb ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                color: selectedBB === bb ? 'var(--sp-accent-purple)' : 'var(--sp-fg-muted)',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              {bb}BB
            </button>
          ))}
        </div>
      </div>

      {/* Position Selector */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 6,
          }}
        >
          Position (Push Range: {pushRange}%)
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {positions.map((pos) => (
            <button
              key={pos}
              onClick={() => setSelectedPosition(pos)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                background:
                  selectedPosition === pos
                    ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                    : 'rgba(255,255,255,0.04)',
                color: selectedPosition === pos ? '#fff' : 'var(--sp-fg-muted)',
              }}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Premium */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(168,85,247,0.05)',
          border: '1px solid rgba(168,85,247,0.15)',
        }}
      >
        <div>
          <div
            style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Risk Premium
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: riskPremium > 1.2 ? 'var(--sp-accent-red)' : riskPremium > 1.1 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            {(Number.isFinite(Number(riskPremium)) ? Number(riskPremium) : 0).toFixed(2)}x
          </div>
        </div>
        <div>
          <div
            style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Push Range
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: 'var(--sp-accent-purple)',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            {pushRange}%
          </div>
        </div>
        <div>
          <div
            style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}
          >
            Format
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: 'var(--sp-accent-cyan)',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            {bountyFormat}
          </div>
        </div>
      </div>

      {/* 13x13 Range Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(13, 1fr)',
          gap: 1,
          maxWidth: 460,
          margin: '0 auto',
        }}
      >
        {gridCells.map((cell) => (
          <div
            key={cell.key}
            style={{
              aspectRatio: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 7,
              fontWeight: 700,
              borderRadius: 2,
              background: cell.isPush
                ? cell.isPair
                  ? 'rgba(168,85,247,0.35)'
                  : cell.isSuited
                    ? 'rgba(34,197,94,0.25)'
                    : 'rgba(59,130,246,0.2)'
                : 'rgba(255,255,255,0.03)',
              color: cell.isPush ? 'var(--sp-fg)' : '#334155',
              border: `1px solid ${cell.isPush ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.04)'}`,
            }}
          >
            {cell.label}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: 'var(--sp-fg-dim)', textAlign: 'center' }}>
        Purple = Pairs &bull; Green = Suited &bull; Blue = Offsuit &bull; Gray = Fold
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ICMCalculatorPage() {
  const router = useRouter();
  useTrainingBus('icm-calculator');
  const calcCountRef = useRef(0);

  const [stacks, setStacks] = useState([25000, 20000, 15000, 10000]);
  const [prizes, setPrizes] = useState([40, 30, 20, 10]);
  const [prizePool, setPrizePool] = useState(1000);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [icmView, setIcmView] = useState('calculator');
  const [bountyFormat, setBountyFormat] = useState('Regular');

  // Update a single stack
  const updateStack = useCallback((idx, val) => {
    setStacks((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0, parseInt(val, 10) || 0);
      return next;
    });
  }, []);

  // Update a single prize
  const updatePrize = useCallback((idx, val) => {
    setPrizes((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0, parseFloat(val) || 0);
      return next;
    });
  }, []);

  // Add/Remove players
  const addPlayer = useCallback(() => {
    if (stacks.length >= 9) return;
    setStacks((prev) => [...prev, 10000]);
  }, [stacks.length]);

  const removePlayer = useCallback(() => {
    if (stacks.length <= 2) return;
    setStacks((prev) => prev.slice(0, -1));
  }, [stacks.length]);

  // Add/Remove prize places
  const addPrize = useCallback(() => {
    if (prizes.length >= 9) return;
    setPrizes((prev) => [...prev, 5]);
  }, [prizes.length]);

  const removePrize = useCallback(() => {
    if (prizes.length <= 1) return;
    setPrizes((prev) => prev.slice(0, -1));
  }, [prizes.length]);

  // Load preset
  const loadPreset = useCallback((preset) => {
    setStacks([...preset.stacks]);
    setPrizes([...preset.prizes]);
    setPrizePool(preset.prizePool);
    setResults(null);
  }, []);

  // Calculate ICM
  const calculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/training/icm-calc', {
        method: 'POST',
        body: JSON.stringify({ stacks, prizes, prizePool }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        setResults(data);
        calcCountRef.current += 1;
        // Standard session-complete + legacy icm-calculated events
        eventBus?.emit?.('training:session-complete', {
          game_id: 'icm-calculator',
          accuracy: 100,
          hands_played: calcCountRef.current,
          correct_answers: calcCountRef.current,
          total_questions: calcCountRef.current,
        });
        busEmit?.('training:icm-calculated', {
          players: stacks.length,
          prizePool,
          bubbleFactor: data.bubbleFactor,
        });
      } else {
        setError(data.error || 'Calculation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [stacks, prizes, prizePool]);

  const totalChips = stacks.reduce((s, v) => s + v, 0);

  return (
    <>
      <Head>
        <title>ICM Calculator | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Tournament ICM equity calculator. Convert chip stacks to dollar equity using the Malmuth-Harville model."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
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
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              ICM Calculator
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-accent-purple)',
                background: 'rgba(168,85,247,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(168,85,247,0.2)',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              PHASE 21
            </span>
          </div>
        </div>

        <div style={{ padding: '16px 24px', maxWidth: 700, margin: '0 auto' }}>
          {/* Quick Presets */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Quick Presets
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => loadPreset(p)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'rgba(168,85,247,0.1)',
                    color: 'var(--sp-accent-purple)',
                    transition: 'all 0.15s',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chip Stacks Input */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                Chip Stacks ({stacks.length} Players)
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={removePlayer}
                  disabled={stacks.length <= 2}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: 'none',
                    background:
                      stacks.length <= 2 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                    color: stacks.length <= 2 ? '#334155' : 'var(--sp-accent-red)',
                    cursor: stacks.length <= 2 ? 'default' : 'pointer',
                    fontSize: 14,
                    fontWeight: 900,
                    lineHeight: '24px',
                  }}
                >
                  -
                </button>
                <button
                  onClick={addPlayer}
                  disabled={stacks.length >= 9}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: 'none',
                    background:
                      stacks.length >= 9 ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.15)',
                    color: stacks.length >= 9 ? '#334155' : 'var(--sp-accent-green)',
                    cursor: stacks.length >= 9 ? 'default' : 'pointer',
                    fontSize: 14,
                    fontWeight: 900,
                    lineHeight: '24px',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stacks.map((stack, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: PLAYER_COLORS[i],
                      width: 14,
                      textAlign: 'center',
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    {i + 1}
                  </span>
                  <input
                    type="number"
                    value={stack}
                    onChange={(e) => updateStack(i, e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${PLAYER_COLORS[i]}20`,
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--sp-fg)',
                      fontSize: 13,
                      fontWeight: 600,
                      outline: 'none',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)', fontWeight: 600, minWidth: 36 }}>
                    {totalChips > 0 ? `${Math.round((stack / totalChips) * 1000) / 10}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Prize Structure */}
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                Prize Structure ({prizes.length} Places)
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={removePrize}
                  disabled={prizes.length <= 1}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: 'none',
                    background:
                      prizes.length <= 1 ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.15)',
                    color: prizes.length <= 1 ? '#334155' : 'var(--sp-accent-red)',
                    cursor: prizes.length <= 1 ? 'default' : 'pointer',
                    fontSize: 14,
                    fontWeight: 900,
                    lineHeight: '24px',
                  }}
                >
                  -
                </button>
                <button
                  onClick={addPrize}
                  disabled={prizes.length >= 9}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: 'none',
                    background:
                      prizes.length >= 9 ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.15)',
                    color: prizes.length >= 9 ? '#334155' : 'var(--sp-accent-green)',
                    cursor: prizes.length >= 9 ? 'default' : 'pointer',
                    fontSize: 14,
                    fontWeight: 900,
                    lineHeight: '24px',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prizes.map((prize, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-accent-amber)',
                      width: 20,
                      textAlign: 'right',
                    }}
                  >
                    {i + 1}st
                  </span>
                  <input
                    type="number"
                    value={prize}
                    onChange={(e) => updatePrize(i, e.target.value)}
                    step="0.5"
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(234,179,8,0.15)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--sp-fg)',
                      fontSize: 13,
                      fontWeight: 600,
                      outline: 'none',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)', fontWeight: 600 }}>%</span>
                </div>
              ))}
            </div>

            {/* Prize Pool */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--sp-accent-amber)',
                  fontFamily: "'Orbitron', monospace",
                }}
              >
                POOL $
              </span>
              <input
                type="number"
                value={prizePool}
                onChange={(e) => setPrizePool(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(234,179,8,0.2)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: 'var(--sp-accent-amber)',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                  fontFamily: "'Inter', sans-serif",
                }}
              />
            </div>
          </div>

          {/* Calculate Button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={calculate}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 10,
                border: 'none',
                background: loading
                  ? 'rgba(168,85,247,0.3)'
                  : 'linear-gradient(135deg, #a855f7, #6366f1)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              {loading ? 'CALCULATING...' : 'Calculate ICM'}
            </motion.button>
          </div>

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
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {results && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {/* Summary */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    {
                      label: 'Prize Pool',
                      value: `$${results.totalPrizePool.toLocaleString()}`,
                      color: 'var(--sp-accent-amber)',
                    },
                    {
                      label: 'Total Chips',
                      value: results.totalChips.toLocaleString(),
                      color: 'var(--sp-fg-muted)',
                    },
                    {
                      label: 'Bubble Factor',
                      value: (Number.isFinite(Number(results.bubbleFactor)) ? Number(results.bubbleFactor) : 0).toFixed(2),
                      color: results.bubbleFactor > 1.1 ? 'var(--sp-accent-red)' : 'var(--sp-accent-green)',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        flex: '1 1 100px',
                        textAlign: 'center',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        padding: '8px 10px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: item.color,
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {item.value}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: 'var(--sp-fg-dim)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {item.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Results Table */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    marginBottom: 14,
                  }}
                >
                  {/* Table Header */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr 60px 70px 70px 60px',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.04)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 9,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    <span>#</span>
                    <span>Chips</span>
                    <span style={{ textAlign: 'right' }}>Chip%</span>
                    <span style={{ textAlign: 'right' }}>ICM $</span>
                    <span style={{ textAlign: 'right' }}>ICM%</span>
                    <span style={{ textAlign: 'right' }}>Diff $</span>
                  </div>

                  {/* Table Rows */}
                  {results.results.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 1fr 60px 70px 70px 60px',
                        padding: '8px 12px',
                        borderBottom:
                          i < results.results.length - 1
                            ? '1px solid rgba(255,255,255,0.04)'
                            : 'none',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          color: PLAYER_COLORS[i],
                          fontFamily: "'Orbitron', monospace",
                        }}
                      >
                        {r.player}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)' }}>
                        {r.chips.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--sp-fg-muted)',
                          textAlign: 'right',
                        }}
                      >
                        {r.chipPct}%
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          textAlign: 'right',
                          color: 'var(--sp-accent-amber)',
                        }}
                      >
                        ${(Number.isFinite(Number(r.icmDollars)) ? Number(r.icmDollars) : 0).toFixed(0)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textAlign: 'right',
                          color: 'var(--sp-accent-purple)',
                        }}
                      >
                        {r.icmPct}%
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textAlign: 'right',
                          color: r.difference >= 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        }}
                      >
                        {r.difference >= 0 ? '+' : ''}
                        {(Number.isFinite(Number(r.difference)) ? Number(r.difference) : 0).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Equity Bars — Chip% vs ICM% */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                      fontFamily: "'Orbitron', monospace",
                    }}
                  >
                    Chip% vs ICM% Comparison
                  </div>

                  {results.results.map((r, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 10,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ color: PLAYER_COLORS[i] }}>Player {r.player}</span>
                        <span style={{ color: 'var(--sp-fg-dim)' }}>
                          Chip {r.chipPct}% | ICM {r.icmPct}%
                        </span>
                      </div>
                      {/* Chip% bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          marginBottom: 2,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(r.chipPct, 100)}%` }}
                          transition={{ duration: MOTION.slow, delay: i * 0.05 }}
                          style={{
                            height: '100%',
                            borderRadius: 3,
                            background: `${PLAYER_COLORS[i]}60`,
                          }}
                        />
                      </div>
                      {/* ICM% bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(r.icmPct, 100)}%` }}
                          transition={{ duration: MOTION.slow, delay: i * 0.05 + 0.1 }}
                          style={{
                            height: '100%',
                            borderRadius: 3,
                            background: PLAYER_COLORS[i],
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <div
                    style={{
                      display: 'flex',
                      gap: 16,
                      marginTop: 8,
                      fontSize: 9,
                      color: 'var(--sp-fg-dim)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Top bar = Chip%</span>
                    <span>Bottom bar = ICM%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ICM Preflop Ranges Tab */}
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 12,
              }}
            >
              {[
                { key: 'calculator', label: 'ICM Calculator' },
                { key: 'ranges', label: 'ICM Push/Fold Ranges' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setIcmView(tab.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      icmView === tab.key
                        ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                        : 'rgba(255,255,255,0.06)',
                    color: icmView === tab.key ? '#fff' : 'var(--sp-fg-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}

              {/* Bounty Format Toggle */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {['Regular', 'KO', 'PKO'].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setBountyFormat(fmt)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      background:
                        bountyFormat === fmt ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                      color: bountyFormat === fmt ? 'var(--sp-accent-purple)' : 'var(--sp-fg-dim)',
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {icmView === 'ranges' && (
                <motion.div
                  key="icm-ranges"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ICMPreflopRanges playerCount={stacks.length || 6} bountyFormat={bountyFormat} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* About */}
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
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "'Orbitron', monospace",
              }}
            >
              About ICM
            </div>
            <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
              The Independent Chip Model (ICM) converts tournament chip stacks into real dollar
              equity based on the prize structure. Unlike chip EV (where each chip is worth the
              same), ICM accounts for the diminishing value of chips — the chip leader's stack is
              worth less per chip than a short stack's. The bubble factor measures this effect:
              values above 1.0 mean survival is more important than accumulation.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
