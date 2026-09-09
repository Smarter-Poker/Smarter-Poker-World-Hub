/**
 * MULTIWAY PREFLOP — Authored 3+ Player Reference Viewer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * These hand sets are authored teaching references. They are not sealed solver
 * exports and must not be used for scored grading, GTO claims, or EV claims.
 * TRAIN-WIRE-FEEDBACK-HOOK-2 and TRAIN-WIRE-QUIZ-ANSWER-5 are intentionally
 * superseded on this ungraded reference surface; signed Arena questions own
 * answer submission and persistent feedback instead of browser-authored truth.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-MOBILE-ADOPT-14 — mobile data-attr long-tail adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH5-33 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-26 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomSheet from '../../../src/components/ui/BottomSheet';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MULTIWAY RANGES DATA — Authored examples for common spots
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const MULTIWAY_SCENARIOS = {
  btn_open_sb_3bet_bb_cold: {
    name: 'BTN Open → SB 3-Bet → BB Cold-Call',
    positions: ['BTN', 'SB', 'BB'],
    desc: 'Action Folds To The Button, Who Raises. The Small Blind 3-Bets, Then The Big Blind Decides Whether To Cold-Call, Raise, Or Fold.',
    tip: 'BB should cold-call with pocket pairs and suited broadway that play well multiway.',
    ranges: {
      BTN: {
        open: 'AA-22, AKs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s-75s, 65s-64s, 54s, AKo-ATo, KQo-KJo, QJo',
      },
      SB: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo' },
      BB: { coldCall: 'JJ-88, AQs-ATs, KQs-KJs, QJs, JTs, T9s, 98s, AQo-AJo, KQo' },
    },
  },
  utg_open_mp_3bet_co_cold: {
    name: 'UTG Open → MP 3-Bet → CO Decision',
    positions: ['UTG', 'MP', 'CO'],
    desc: 'Action Folds To Under The Gun, Who Raises. Middle Position 3-Bets, Then The Cutoff Must Respond With A Tight Continuing Range.',
    tip: 'CO should mostly fold here - only continue with hands that dominate MP\u2019s 3-bet range.',
    ranges: {
      UTG: { open: 'AA-66, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo, KQo' },
      MP: { threeBet: 'AA-QQ, AKs, AKo' },
      CO: { coldCall: 'JJ-99, AQs-AJs, KQs' },
    },
  },
  co_open_btn_flat_bb_squeeze: {
    name: 'CO Open → BTN Flat → BB Squeeze',
    positions: ['CO', 'BTN', 'BB'],
    desc: 'BTN flats CO open, BB has a squeeze opportunity with a polarized range.',
    tip: 'BB squeeze range should be polarized - premiums + suited bluffs (A5s/A4s type hands).',
    ranges: {
      CO: {
        open: 'AA-22, AKs-A2s, KQs-K8s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, 54s, AKo-ATo, KQo-KJo, QJo',
      },
      BTN: { flat: 'JJ-66, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo-AJo, KQo' },
      BB: { squeeze: 'AA-TT, AKs-AJs, AKo-AQo, A5s-A4s, K9s, Q9s, J8s' },
    },
  },
  limp_iso_bb: {
    name: 'UTG Limp → SB Complete → BB Iso-Raise',
    positions: ['UTG', 'SB', 'BB'],
    desc: 'Under The Gun Limps. Action Folds To The Small Blind, Who Completes. The Big Blind Then Raises Over Both Limpers.',
    tip: 'This Authored Example Uses A Value-Heavy Big-Blind Isolation Range Against Two Limpers.',
    ranges: {
      UTG: { call: 'JJ-55, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo-AJo' },
      SB: {
        limp: 'AA-22, AKs-A2s, KQs-K6s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s-86s, 76s, 65s, 54s, AKo-A8o, KQo-KTo, QJo-QTo, JTo',
      },
      BB: { isoRaise: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
    },
  },
  ep_open_btn_sb_bb_4way: {
    name: 'EP Open → BTN/SB/BB All Call → 4-Way',
    positions: ['UTG', 'BTN', 'SB', 'BB'],
    desc: 'EP opens, BTN and both blinds all flat. 4-way pot with wide ranges.',
    tip: 'In 4-way pots, play tighter postflop - your equity realization drops significantly.',
    ranges: {
      UTG: { open: 'AA-66, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo, KQo' },
      BTN: { flat: 'TT-55, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo-AJo, KQo' },
      SB: { coldCall: '99-66, AJs-ATs, KQs-KJs, QJs, JTs, T9s, AJo' },
      BB: {
        call: 'TT-33, AQs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, AQo-A9o, KQo-KTo, QJo',
      },
    },
  },
  btn_3bet_sb_4bet_bb_cold_5bet: {
    name: 'CO Open → BTN 3-Bet → SB 4-Bet → BB Decision',
    positions: ['CO', 'BTN', 'SB', 'BB'],
    desc: 'The Cutoff Raises, The Button 3-Bets, And The Small Blind Cold 4-Bets. The Big Blind Then Chooses Whether To Enter The Pot.',
    tip: 'This Authored Example Keeps The Big Blind Range Extremely Narrow After A Raise, 3-Bet, And Cold 4-Bet.',
    ranges: {
      CO: { open: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
      BTN: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo, A5s-A4s' },
      SB: { fourBet: 'AA-QQ, AKs, AKo' },
      BB: { fiveBet: 'AA-KK, AKs' },
    },
  },
  co_mp_utg_limp_chain: {
    name: 'UTG Limp → MP Limp → CO Iso-Raise',
    positions: ['UTG', 'MP', 'CO'],
    desc: 'Double limp from early positions. CO has a prime iso-raise opportunity.',
    tip: 'CO should iso-raise aggressively - limpers have weak/passive ranges.',
    ranges: {
      UTG: {
        limp: 'AA-22, AKs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, AKo-ATo, KQo-KJo, QJo',
      },
      MP: { limp: 'TT-22, AQs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, AJo-A9o, KQo-KJo' },
      CO: { isoRaise: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
    },
  },
};

// Proper range parser — matches hands against range strings accurately
function parseRangeToSet(rangeStr) {
  if (!rangeStr) return new Set();
  const inRange = new Set();
  const cleaned = rangeStr.replace(/(Call|3-Bet|Raise|Open|Fold):\s*/gi, ', ');
  const parts = cleaned
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((s) => s.trim());
      if (!start || !end) {
        inRange.add(start || end);
        continue;
      }
      if (start.length === 2 && start[0] === start[1]) {
        const si = RANKS.indexOf(start[0]);
        const ei = RANKS.indexOf(end[0]);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++)
            inRange.add(RANKS[i] + RANKS[i]);
        }
      } else {
        const suffix = start.endsWith('s') ? 's' : start.endsWith('o') ? 'o' : '';
        const high = start[0],
          startLow = start[1];
        const cleanEnd = end.replace(/[so]/g, '');
        const endLow = cleanEnd.length >= 2 ? cleanEnd[1] : cleanEnd[0];
        if (!endLow) {
          inRange.add(start);
          inRange.add(end);
          continue;
        }
        const si = RANKS.indexOf(startLow),
          ei = RANKS.indexOf(endLow);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++)
            inRange.add(high + RANKS[i] + suffix);
        }
      }
    } else {
      inRange.add(part);
    }
  }
  return inRange;
}

function isInRange(hand, rangeStr) {
  const rangeSet = parseRangeToSet(rangeStr);
  // Check exact match, suited/offsuit stripped match, and base pair match
  return (
    rangeSet.has(hand) ||
    rangeSet.has(hand.replace(/[so]/, '')) ||
    rangeSet.has(hand.substring(0, 2))
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RANGE GRID COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function RangeGrid({ rangeStr, color, label }) {
  const grid = useMemo(() => {
    const cells = [];
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const isSuited = c > r;
        const isPair = r === c;
        const hand = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
            ? `${RANKS[r]}${RANKS[c]}s`
            : `${RANKS[c]}${RANKS[r]}o`;
        const inRange = isInRange(hand, rangeStr);
        cells.push({ hand, inRange, r, c, isSuited, isPair });
      }
    }
    return cells;
  }, [rangeStr]);

  const handsInRange = grid.filter((c) => c.inRange).length;
  const pct = ((handsInRange / 169) * 100).toFixed(1);

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
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
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>{pct}% Of Hands</span>
      </div>
      <div data-stats-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
        {grid.map((cell, i) => (
          <div
            key={i}
            title={cell.hand}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 6,
              fontWeight: 600,
              background: cell.inRange ? `${color}50` : 'rgba(255,255,255,0.02)',
              color: cell.inRange ? '#fff' : '#333',
              border: `1px solid ${cell.inRange ? `${color}40` : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {cell.hand.length <= 3 ? cell.hand : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function MultiwayPreflopPage() {
  // TRAIN-WIRE-BOTTOMSHEET-8 — info sheet state
  const [infoOpen, setInfoOpen] = useState(false);

  const router = useRouter();
  useTrainingBus('multiway-preflop');

  const [selectedScenario, setSelectedScenario] = useState('btn_open_sb_3bet_bb_cold');

  const scenario = MULTIWAY_SCENARIOS[selectedScenario];
  const posColors = {
    UTG: 'var(--sp-accent-red)',
    MP: 'var(--sp-accent-orange)',
    CO: 'var(--sp-accent-amber)',
    BTN: 'var(--sp-accent-green)',
    SB: 'var(--sp-accent-blue)',
    BB: 'var(--sp-accent-purple)',
    Caller: 'var(--sp-fg-muted)',
  };

  return (
    <>
      <Head>
        <title>Multiway Preflop Reference | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Explore authored examples of 3+ player preflop range interactions without solver or scoring claims."
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
        <BottomSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          title="How Multiway Preflop Works"
          subtitle="Authored 3+ player preflop examples"
        >
          <div style={{ padding: '0 4px', color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              In Multiway Pots (3 Or More Players To A Flop), Opening And
              Defending Ranges <strong>Tighten Significantly</strong> Compared
              To Heads-Up. More Opponents Means More Hands Beat Top Pair, So
              Speculative Hands Lose Value And Premium Pairs/Big Aces Gain It.
            </p>
            <p>
              These Examples Are Authored Teaching References, Not
              Provenance-Sealed Solver Exports. They Are Provided For Pattern
              Study Only And Do Not Produce A Grade, EV Result, Progress, Or
              Reward.
            </p>
          </div>
        </BottomSheet>

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
            ← Training
          </button>
          <button
            onClick={() => setInfoOpen(true)}
            aria-label="How Multiway Preflop works"
            style={{
              background: 'rgba(var(--sp-accent-purple-rgb), 0.08)',
              border: '1px solid rgba(var(--sp-accent-purple-rgb), 0.25)',
              color: 'var(--sp-accent-purple)',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 12,
              cursor: 'pointer',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            How It Works
          </button>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            }}
          >
            Multiway Preflop Reference
          </h1>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 800, margin: '0 auto' }}>
          <div
            role="note"
            data-training-authority="authored-reference-ungraded"
            style={{
              marginBottom: 18,
              padding: '12px 15px',
              border: '1px solid rgba(251,191,36,0.35)',
              background: 'rgba(251,191,36,0.07)',
              color: 'var(--sp-fg-muted)',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: 'var(--sp-accent-amber)' }}>Authored Reference · Ungraded.</strong>{' '}
            These Hand Sets Have No Solver Artifact, Tree Identity, Or Payout Model. Use Them To
            Explore A Teaching Example; They Never Affect Accuracy, Streaks, Progress, Or Rewards.
          </div>
          {/* Scenario Selector */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {Object.entries(MULTIWAY_SCENARIOS || {}).map(([key, s]) => (
              <motion.button
                key={key}
                onClick={() => setSelectedScenario(key)}
                whileHover={{ scale: 1.02 }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background:
                    selectedScenario === key ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedScenario === key ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: selectedScenario === key ? 'var(--sp-accent-purple)' : 'var(--sp-fg)',
                    marginBottom: 4,
                  }}
                >
                  {s.name}
                </div>
                <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>{s.positions.join(' → ')}</div>
              </motion.button>
            ))}
          </div>

          {/* Scenario Description */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 20,
              background: 'rgba(168,85,247,0.05)',
              border: '1px solid rgba(168,85,247,0.15)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-accent-purple)', marginBottom: 4 }}>
              {scenario.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>{scenario.desc}</div>
          </div>

          {/* Range Grids for Each Position */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                scenario.positions.length <= 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {scenario.positions.map((pos) => {
              const rangeData = scenario.ranges[pos] || {};
              const action = Object.keys(rangeData || {})[0] || 'range';
              const rangeStr = Object.values(rangeData || {})[0] || '';
              return (
                <RangeGrid
                  key={pos}
                  rangeStr={rangeStr}
                  color={posColors[pos] || 'var(--sp-fg-muted)'}
                  label={`${pos} - ${action.replace(/([A-Z])/g, ' $1').trim()}`}
                />
              );
            })}
          </div>

          {/* Interaction Legend */}
          <div
            style={{
              marginTop: 20,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 8 }}>
              Action Flow
            </div>
            <div data-pills-row style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {scenario.positions.map((pos, i) => {
                const rangeData = scenario.ranges[pos] || {};
                const action = Object.keys(rangeData || {})[0] || '';
                return (
                  <React.Fragment key={pos}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        background: `${posColors[pos] || 'var(--sp-fg-muted)'}20`,
                        color: posColors[pos] || 'var(--sp-fg-muted)',
                        border: `1px solid ${posColors[pos] || 'var(--sp-fg-muted)'}40`,
                      }}
                    >
                      {pos}: {action.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    {i < scenario.positions.length - 1 && (
                      <span style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>→</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Authored teaching note */}
          {scenario.tip && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.15)',
                fontSize: 11,
                color: 'var(--sp-fg-muted)',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--sp-accent-cyan)', marginRight: 6 }}>AUTHORED NOTE:</span>
              {scenario.tip}
            </div>
          )}

          {/* Authority boundary */}
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-fg)', marginBottom: 8 }}>
              Why This Page Is Ungraded
            </div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', lineHeight: 1.65 }}>
              A Multiway Decision Depends On Exact Stacks, Raise Sizes, Antes, Payouts, Players,
              And Prior Action. Those Inputs Are Not Proven For These Authored Examples, So A
              Correct/Incorrect Quiz Would Create False Authority. Open A Verified Training Game
              From The Hub When You Want Scored Practice.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
