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
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
const BottomSheet = dynamic(() => import('../../../src/components/ui/BottomSheet'), { ssr: false });

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/training-play.module.css';
const CALIBRATION_HERO_CARDS_BY_VARIANT = Object.freeze({
  nlh: ['As', 'Ks'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
});

const CALIBRATION_VARIANTS = Object.freeze(['nlh', 'plo4', 'plo5', 'plo6', 'plo8']);
const CALIBRATION_POSITIONS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const CALIBRATION_STACKS = Object.freeze([20, 40, 100]);

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

const toTitleAction = (action) => {
  const spaced = String(action || '').replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RANGE GRID COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function RangeGrid({ rangeStr, label }) {
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
    <div className={`sd-metric ${s.rangeCard}`}>
      <div className={s.rangeHead}>
        <span className={s.rangeLabel}>{label}</span>
        <span className={s.small}>{pct}% Of Hands</span>
      </div>
      <div data-allow-small="true" className={s.rangeGrid} role="img" aria-label={`${label}: ${pct}% Of Hands`}>
        {grid.map((cell, i) => (
          <div
            key={i}
            title={cell.hand}
            className={s.rangeCell}
            data-in={cell.inRange ? 'true' : undefined}
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

  // Horse Brain Calibration Panel state


  const scenario = MULTIWAY_SCENARIOS[selectedScenario];

  return (
    <>
      <SEOHead
        title="Multiway 3+ Player Preflop Ranges"
        description="Explore How Optimal Poker Cold-Calling, Squeezing, And Over-Calling Ranges Contract In 3-Way And 4-Way Multiway Preflop Pots On Smarter.Poker."
        canonical="/hub/training/multiway-preflop"
      />

      <BottomSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How Multiway Preflop Works"
        subtitle="Authored 3+ Player Preflop Examples"
      >
        <div className={s.sheetCopy}>
          <p>
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

      <div className={s.shell}>
        <main className={s.page}>
          <TrainingPageHead slug="training-multiway-preflop" note="Authored 3+ Player Preflop Examples">
            <button type="button" className="sd-button" onClick={() => setInfoOpen(true)}>
              How It Works
            </button>
          </TrainingPageHead>

          <p
            role="note"
            data-training-authority="authored-reference-ungraded"
            className={s.note}
          >
            <span>
              <strong className={s.ice}>Authored Reference · Ungraded.</strong>{' '}
              These Hand Sets Have No Solver Artifact, Tree Identity, Or Payout Model. Use Them To
              Explore A Teaching Example; They Never Affect Accuracy, Streaks, Progress, Or Rewards.
            </span>
          </p>

          {/* Scenario Selector */}
          <section className={`sd-panel ${s.panel}`} aria-labelledby="multiway-scenarios">
            <h2 id="multiway-scenarios" className={s.sectionTitle}>Choose A Scenario</h2>
            <div className={s.scenarioGrid}>
              {Object.entries(MULTIWAY_SCENARIOS || {}).map(([key, sc]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selectedScenario === key}
                  onClick={() => setSelectedScenario(key)}
                  className={`sd-button ${s.destination}`}
                >
                  <span className={s.destinationLabel}>{sc.name}</span>
                  <span className={s.destinationCopy}>{sc.positions.join(' → ')}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={`sd-panel ${s.panel}`} aria-labelledby="multiway-scenario-title">
            {/* Scenario Description */}
            <h2 id="multiway-scenario-title" className={s.sectionTitle}>{scenario.name}</h2>
            <p className={s.copy}>{scenario.desc}</p>

            {/* Range Grids for Each Position */}
            <div className={s.rangeGrids} data-count={scenario.positions.length}>
              {scenario.positions.map((pos) => {
                const rangeData = scenario.ranges[pos] || {};
                const action = Object.keys(rangeData || {})[0] || 'range';
                const rangeStr = Object.values(rangeData || {})[0] || '';
                return (
                  <RangeGrid
                    key={pos}
                    rangeStr={rangeStr}
                    label={`${pos} - ${toTitleAction(action)}`}
                  />
                );
              })}
            </div>

            {/* Interaction Legend */}
            <h3 className={s.subTitle}>Action Flow</h3>
            <div className={s.pills}>
              {scenario.positions.map((pos, i) => {
                const rangeData = scenario.ranges[pos] || {};
                const action = Object.keys(rangeData || {})[0] || '';
                return (
                  <React.Fragment key={pos}>
                    <span className={s.pill}>
                      {pos}: {toTitleAction(action)}
                    </span>
                    {i < scenario.positions.length - 1 && (
                      <span className={s.ice} aria-hidden>→</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Authored teaching note */}
            {scenario.tip && (
              <p className={s.note}>
                <span><strong className={s.ice}>Authored Note: </strong>{scenario.tip}</span>
              </p>
            )}
          </section>

          {/* Authority boundary */}
          <section className={`sd-panel ${s.panel}`} aria-labelledby="multiway-ungraded">
            <h2 id="multiway-ungraded" className={s.subTitle}>Why This Page Is Ungraded</h2>
            <p className={s.copy}>
              A Multiway Decision Depends On Exact Stacks, Raise Sizes, Antes, Payouts, Players,
              And Prior Action. Those Inputs Are Not Proven For These Authored Examples, So A
              Correct/Incorrect Quiz Would Create False Authority. Open A Verified Training Game
              From The Hub When You Want Scored Practice.
            </p>
          </section>
        </main>
      </div>
      <HubPageSummary page="training-multiway-preflop" />
    </>
  );
}
