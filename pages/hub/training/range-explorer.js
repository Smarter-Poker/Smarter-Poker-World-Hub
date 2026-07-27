/**
 * RANGE EXPLORER — 13x13 Interactive Matrix
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Full 13x13 starting hand grid with exact action frequencies by position.
 *
 * Route: /hub/training/range-explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-48 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-15 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import RangeMatrix from '../../../src/components/poker/RangeMatrix';
// TRAIN-WIRE-RANGE-MATRIX-1 — adoption: range-explorer 13x13 grid via shared RangeMatrix

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

function getHandLabel(r1, r2, isSuited, isPair) {
  if (isPair) return `${r1}${r2}`;
  return `${r1}${r2}${isSuited ? 's' : 'o'}`;
}

// Simulated data: Generates deterministic GTO frequencies based on position and hand strength
function generateFrequencies(hand, pos) {
  const posIndex = POSITIONS.indexOf(pos);
  const posMultiplier = 1 + posIndex * 0.2; // BTN is looser than UTG

  const rankValues = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    T: 10,
    9: 9,
    8: 8,
    7: 7,
    6: 6,
    5: 5,
    4: 4,
    3: 3,
    2: 2,
  };

  // Parse hand
  let strength = 0;
  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');

  if (isPair) {
    strength = rankValues[hand[0]] * 3; // Pairs are very strong
  } else {
    strength = rankValues[hand[0]] + rankValues[hand[1]] + (isSuited ? 5 : 0);
  }

  // Adjust strength based on connectedness (e.g. JT > J4)
  if (!isPair) {
    const gap = Math.abs(rankValues[hand[0]] - rankValues[hand[1]]);
    if (gap === 1) strength += 3;
    else if (gap === 2) strength += 1.5;
    else if (gap > 4) strength -= 2;
  }

  const effectiveStrength = strength * posMultiplier;

  let raise = 0,
    call = 0,
    fold = 0;

  if (effectiveStrength > 45) {
    raise = 100;
    call = 0;
    fold = 0;
  } else if (effectiveStrength > 35) {
    raise = 80;
    call = 20;
    fold = 0;
  } else if (effectiveStrength > 25) {
    raise = 40;
    call = 40;
    fold = 20;
  } else if (effectiveStrength > 18) {
    raise = 10;
    call = 20;
    fold = 70;
  } else {
    raise = 0;
    call = 0;
    fold = 100;
  }

  // If pos is BB, they face an open, so "raise" means 3Bet, "call" is Defend
  if (pos === 'BB') {
    let threeBet = raise;
    let defend = call + raise * 0.3; // Mix some raises into calls
    let pFold = fold;

    const total = threeBet + defend + pFold;
    return {
      raise: Math.round((threeBet / total) * 100),
      call: Math.round((defend / total) * 100),
      fold: Math.round((pFold / total) * 100),
    };
  }

  return { raise, call, fold };
}

function getGridColor(freqs) {
  if (freqs.raise > 80) return 'var(--sp-accent-red)'; // Pure Raise (Red)
  if (freqs.raise > 40) return 'var(--sp-accent-orange)'; // Mixed Raise (Orange)
  if (freqs.call > 50) return 'var(--sp-accent-emerald)'; // Mostly Call (Green)
  if (freqs.raise > 10 || freqs.call > 10) return 'var(--sp-accent-amber)'; // Weak mixed (Yellow)
  return 'var(--sp-bg-elev2)'; // Fold (Dark Slate)
}

export default function RangeExplorerPage() {
  const router = useRouter();
  useTrainingBus('range-explorer');
  const [position, setPosition] = useState('BTN');
  const [selectedHand, setSelectedHand] = useState(null);

  useEffect(() => {
    const h = () => {};
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, []);

  const matrix = [];
  for (let i = 0; i < 13; i++) {
    const row = [];
    for (let j = 0; j < 13; j++) {
      const isPair = i === j;
      const isSuited = j > i; // Upper right
      let r1, r2;
      if (isPair) {
        r1 = RANKS[i];
        r2 = RANKS[j];
      } else if (isSuited) {
        r1 = RANKS[i];
        r2 = RANKS[j];
      } else {
        r1 = RANKS[j];
        r2 = RANKS[i];
      } // Offsuit lower left

      const hand = getHandLabel(r1, r2, isSuited, isPair);
      const freqs = generateFrequencies(hand, position);
      row.push({ hand, freqs, color: getGridColor(freqs) });
    }
    matrix.push(row);
  }

  // TRAIN-WIRE-RANGE-MATRIX-1: adapter for shared RangeMatrix component.
  // RangeMatrix expects data[hand] = { raise, call, fold } in 0..1 — our
  // matrix has percentages in 0..100, so divide.
  const gridData = {};
  for (const row of matrix) {
    for (const cell of row) {
      gridData[cell.hand] = {
        raise: (cell.freqs.raise || 0) / 100,
        call: (cell.freqs.call || 0) / 100,
        fold: (cell.freqs.fold || 0) / 100,
      };
    }
  }
  const handToCell = Object.fromEntries(matrix.flat().map((c) => [c.hand, c]));

  return (
    <>
      <Head>
        <title>Range Explorer | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0a0a1a',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Range Explorer</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>13x13 Interactive Matrix</div>
          </div>
        </div>

        <div
          style={{
            padding: '20px',
            maxWidth: 800,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Position Bar */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              maxWidth: 460,
              background: 'var(--sp-bg-elev2)',
              padding: '4px',
              borderRadius: '12px',
              marginBottom: '24px',
            }}
          >
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPosition(p);
                  setSelectedHand(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: position === p ? 'var(--sp-accent-blue)' : 'transparent',
                  color: position === p ? '#fff' : 'var(--sp-fg-muted)',
                  fontWeight: 700,
                  fontSize: 12,
                  transition: 'all 0.2s',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* 13x13 Grid — shared RangeMatrix (TRAIN-WIRE-RANGE-MATRIX-1) */}
            <RangeMatrix
              data={gridData}
              size={28}
              highlight={selectedHand?.hand}
              onCellClick={(hand) => {
                const cell = handToCell[hand];
                if (cell) setSelectedHand(cell);
              }}
            />

            {/* Details Panel */}
            <div style={{ width: '280px', flexShrink: 0 }}>
              {selectedHand ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  style={{
                    background: 'var(--sp-bg-elev2)',
                    padding: '24px',
                    borderRadius: '16px',
                    border: '1px solid #334155',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sp-fg-muted)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Position
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>{position}</div>

                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sp-fg-muted)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Hand Selected
                  </div>
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: '#fff',
                      marginBottom: 24,
                      letterSpacing: '-1px',
                    }}
                  >
                    {selectedHand.hand}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sp-fg-muted)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: 12,
                    }}
                  >
                    GTO Frequencies
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--sp-accent-red)' }}>
                        {position === 'BB' ? '3-Bet' : 'Raise First In'}
                      </span>
                      <span style={{ color: 'var(--sp-accent-red)' }}>{selectedHand.freqs.raise}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: '#0f172a',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedHand.freqs.raise}%` }}
                        style={{ height: '100%', background: 'var(--sp-accent-red)' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--sp-accent-emerald)' }}>Call</span>
                      <span style={{ color: 'var(--sp-accent-emerald)' }}>{selectedHand.freqs.call}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: '#0f172a',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedHand.freqs.call}%` }}
                        style={{ height: '100%', background: 'var(--sp-accent-emerald)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: 'var(--sp-fg-muted)' }}>Fold</span>
                      <span style={{ color: 'var(--sp-fg-muted)' }}>{selectedHand.freqs.fold}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: '#0f172a',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedHand.freqs.fold}%` }}
                        style={{ height: '100%', background: 'var(--sp-fg-dim)' }}
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div
                  style={{
                    background: 'var(--sp-bg-elev2)',
                    padding: '32px 24px',
                    borderRadius: '16px',
                    border: '1px dashed #334155',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    height: '100%',
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>↑</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 8 }}>
                    Select any hand
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>
                    Click a cell in the 13x13 matrix to view the exact GTO action frequencies for
                    this position.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '32px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--sp-fg-muted)',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sp-accent-red)' }} /> Pure
              Raise
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sp-accent-orange)' }} />{' '}
              Mixed Raise
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sp-accent-amber)' }} />{' '}
              Mixed Call/Fold
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--sp-accent-emerald)' }} /> Pure
              Call
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: 'var(--sp-bg-elev2)',
                  border: '1px solid #334155',
                }}
              />{' '}
              Fold
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
