/**
 * BOUNTY TOURNAMENT TRAINER — PKO/KO/TKO Strategy
 * ═══════════════════════════════════════════════════════════════════════════
 * Train bounty-adjusted ICM calculations. Understand when knocking out
 * a player changes your equity enough to widen calling ranges.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-18 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-MOBILE-ADOPT-17 — mobile data-attr long-tail adoption from TRAIN-CSS-MOBILE-1
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
// TRAIN-WIRE-FX-6a — adoption: feedback hook

// ═══════════════════════════════════════════════════════════════════════════
// BOUNTY FORMAT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const BOUNTY_FORMATS = {
  ko: {
    id: 'ko',
    name: 'Knockout (KO)',
    color: 'var(--sp-accent-red)',
    desc: 'Fixed bounty per elimination. Win $X for every player you knock out.',
    example: '$100+$50 KO — win $50 for each elimination',
    splitRatio: 'Fixed: you win 100% of the bounty',
  },
  pko: {
    id: 'pko',
    name: 'Progressive KO (PKO)',
    color: 'var(--sp-accent-amber)',
    desc: 'Bounty grows as you collect. Half goes to your prize pool, half to your bounty.',
    example: '$100+$50 PKO — collect 50% bounty, 50% added to your own head',
    splitRatio: '50/50 split: half to you, half increases your bounty',
  },
  tko: {
    id: 'tko',
    name: 'Total Knockout (TKO)',
    color: 'var(--sp-accent-purple)',
    desc: '100% of pool paid as bounties. No traditional prize pool.',
    example: '$100 TKO — entire buy-in is the bounty',
    splitRatio: '100% bounty: all prize money via knockouts',
  },
  mystery: {
    id: 'mystery',
    name: 'Mystery Bounty',
    color: 'var(--sp-accent-cyan)',
    desc: 'Random bounty revealed upon elimination. Can be massive or minimal.',
    example: '$500 Mystery — bounties range from $50 to $50,000',
    splitRatio: 'Random: each elimination reveals a hidden bounty prize',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BOUNTY EQUITY CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

function calculateBountyEquity(
  format,
  stacks,
  bounties,
  heroStack,
  heroBounty,
  villainStack,
  villainBounty,
  pot
) {
  const safeStacks = (stacks || []).map((s) => Math.max(0, Number(s) || 0));
  const totalChips = safeStacks.reduce((s, v) => s + v, 0) || 1; // prevent div/0
  const heroChipEV = heroStack / totalChips;

  let bountyEV = 0;
  const safeBounty = Math.max(0, Number(villainBounty) || 0);
  if (format === 'ko') {
    bountyEV = safeBounty;
  } else if (format === 'pko') {
    bountyEV = safeBounty * 0.5;
  } else if (format === 'tko') {
    bountyEV = safeBounty;
  } else if (format === 'mystery') {
    bountyEV = safeBounty * 1.2;
  }

  const safeHeroStack = Math.max(0, Number(heroStack) || 0);
  const safeVillainStack = Math.max(0, Number(villainStack) || 0);
  const safePot = Math.max(0, Number(pot) || 0);
  const totalPot = safePot + safeHeroStack + safeVillainStack || 1; // prevent div/0
  const chipEquity = (safeHeroStack + safePot * 0.5) / totalPot;
  const denominator = safeHeroStack + (Number(heroBounty) || 0) + 100;
  const bountyAdjEq = chipEquity + bountyEV / (denominator || 1);

  return {
    chipEquity: (Number.isFinite(Number(chipEquity * 100)) ? Number(chipEquity * 100) : 0).toFixed(1),
    bountyValue: (Number.isFinite(Number(bountyEV)) ? Number(bountyEV) : 0).toFixed(0),
    adjustedEquity: Math.min(99, Number.isFinite(bountyAdjEq * 100) ? bountyAdjEq * 100 : 0).toFixed(1),
    callingThreshold: Math.max(25, Number.isFinite(50 - bountyEV / 2) ? 50 - bountyEV / 2 : 0).toFixed(1),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DRILL SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

const DRILL_SCENARIOS = [
  {
    id: 1,
    title: 'Short Stack Shove vs Big Bounty',
    situation: 'Villain (5BB) shoves. Their bounty is worth 30% of your stack. You have A9o.',
    format: 'pko',
    heroStack: 25,
    villainStack: 5,
    bounty: 7.5,
    pot: 1.5,
    correctAction: 'call',
    gtoExplanation: 'Bounty equity widens your calling range significantly. A9o is a clear call.',
  },
  {
    id: 2,
    title: 'Bubble with Bounty Consideration',
    situation: 'ICM bubble. Villain (12BB) shoves. Bounty = $100. You have KQs (20BB).',
    format: 'ko',
    heroStack: 20,
    villainStack: 12,
    bounty: 100,
    pot: 1.5,
    correctAction: 'call',
    gtoExplanation: 'The bounty overcomes ICM pressure. KQs has enough equity + bounty value.',
  },
  {
    id: 3,
    title: 'Deep Stack PKO — Marginal Spot',
    situation: 'Effective 40BB. Villain 3-bet shoves with growing bounty. You have JTs.',
    format: 'pko',
    heroStack: 40,
    villainStack: 40,
    bounty: 20,
    pot: 6.5,
    correctAction: 'fold',
    gtoExplanation:
      "Despite the bounty, risking 40BB with JTs is -EV. Bounty doesn't overcome the risk.",
  },
  {
    id: 4,
    title: 'Mystery Bounty — High Variance Call',
    situation: 'Medium stack. Villain shoves 8BB with a mystery bounty. You have 55.',
    format: 'mystery',
    heroStack: 30,
    villainStack: 8,
    bounty: 15,
    pot: 1.5,
    correctAction: 'call',
    gtoExplanation:
      'Mystery bounty EV makes this a call. 55 has ~43% equity and the bounty adds significant value.',
  },
  {
    id: 5,
    title: 'TKO — Everyone is a Bounty',
    situation: 'All prize money is bounties. Villain (15BB) shoves. You have A5s (22BB).',
    format: 'tko',
    heroStack: 22,
    villainStack: 15,
    bounty: 15,
    pot: 1.5,
    correctAction: 'call',
    gtoExplanation:
      'In TKO format, every knockout IS the prize pool. A5s is profitable against typical shoving range.',
  },
  {
    id: 6,
    title: "Mini Bounty — Don't Overpay",
    situation: 'KO tournament. Villain bounty is only $5. You have 87o facing a 3-bet shove.',
    format: 'ko',
    heroStack: 30,
    villainStack: 25,
    bounty: 5,
    pot: 7,
    correctAction: 'fold',
    gtoExplanation: "A $5 bounty does not justify calling with 87o. Don't chase micro-bounties.",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function BountyTrainerPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeFormat, setActiveFormat] = useState('pko');
  const [activeTab, setActiveTab] = useState('learn'); // 'learn' | 'drill' | 'calculator'
  const [drillIndex, setDrillIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Calculator state
  const [calcHeroStack, setCalcHeroStack] = useState(25);
  const [calcVillainStack, setCalcVillainStack] = useState(12);
  const [calcBounty, setCalcBounty] = useState(50);
  const [calcPot, setCalcPot] = useState(1.5);

  useTrainingBus('bounty-trainer');
  const fb = useTrainingFeedback();

  useEffect(() => {
    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  const format = BOUNTY_FORMATS[activeFormat] || BOUNTY_FORMATS.pko;
  const safeIdx = DRILL_SCENARIOS.length > 0 ? drillIndex % DRILL_SCENARIOS.length : 0;
  const scenario = DRILL_SCENARIOS[safeIdx] || DRILL_SCENARIOS[0];

  const calcResult = useMemo(
    () =>
      calculateBountyEquity(
        activeFormat,
        [calcHeroStack, calcVillainStack],
        [],
        calcHeroStack,
        0,
        calcVillainStack,
        calcBounty,
        calcPot
      ),
    [activeFormat, calcHeroStack, calcVillainStack, calcBounty, calcPot]
  );

  const handleAnswer = useCallback(
    (action) => {
      setSelectedAnswer(action);
      setShowResult(true);
      setTotalAnswered((prev) => prev + 1);
      if (action === scenario.correctAction) {
        fb.correct();
        setScore((prev) => prev + 1);
      } else {
        fb.incorrect();
      }
    },
    [scenario, fb]
  );

  const nextScenario = useCallback(() => {
    setDrillIndex((prev) => prev + 1);
    setSelectedAnswer(null);
    setShowResult(false);
  }, []);

  const handleComplete = useCallback(() => {
    // HARDENED: safe eventBus access
    try {
      eventBus?.emit?.(
        EventType?.SESSION_END || 'session:end',
        {
          source: 'BountyTrainer',
          score,
          totalAnswered,
          format: activeFormat,
        },
        'BountyTrainer'
      );
      eventBus?.emit?.('training:session-complete', {
        game_id: 'bounty-trainer',
        accuracy: totalAnswered ? Math.round((score / Math.max(totalAnswered, 1)) * 100) : 0,
        correct_answers: score,
        total_questions: totalAnswered,
        hands_played: totalAnswered,
      });
    } catch (e) {
      console.warn('[BountyTrainer] EventBus error:', e);
    }
  }, [score, totalAnswered, activeFormat]);

  return (
    <>
      <Head>
        <title>Bounty Tournament Trainer | Smarter.Poker</title>
        <meta
          name="description"
          content="Master KO, PKO, TKO, and Mystery Bounty tournament strategy"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: '#0a0a1a',
          color: '#e4e6eb',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #3a3b3c' }}>
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              color: '#b0b3b8',
              fontSize: 14,
              cursor: 'pointer',
              marginBottom: 4,
            }}
          >
            Back to Training
          </button>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            Bounty Tournament Trainer
          </h1>
          <p style={{ fontSize: 14, color: '#b0b3b8', margin: '2px 0 0' }}>
            Master KO, PKO, TKO, and Mystery Bounty strategy adjustments
          </p>
        </div>

        <div style={{ padding: '16px 20px', maxWidth: 900, margin: '0 auto' }}>
          {/* Format Selector */}
          <div data-pills-row style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.values(BOUNTY_FORMATS || {}).map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFormat(f.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: activeFormat === f.id ? `${f.color}15` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${activeFormat === f.id ? f.color : 'rgba(255,255,255,0.08)'}`,
                  color: activeFormat === f.id ? f.color : '#b0b3b8',
                }}
              >
                {f.name}
              </button>
            ))}
          </div>

          {/* Tab Selector */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 16,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              padding: 3,
            }}
          >
            {[
              { id: 'learn', label: 'Learn' },
              { id: 'drill', label: 'Drill' },
              { id: 'calculator', label: 'Calculator' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeTab === t.id ? format.color : 'transparent',
                  border: 'none',
                  color: activeTab === t.id ? '#000' : '#b0b3b8',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Learn Tab */}
          {activeTab === 'learn' && (
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${format.color}30`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: format.color,
                  margin: '0 0 12px',
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                {format.name}
              </h2>
              <p style={{ fontSize: 14, color: '#e4e6eb', lineHeight: 1.6, marginBottom: 16 }}>
                {format.desc}
              </p>
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  marginBottom: 12,
                  borderLeft: `3px solid ${format.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: format.color,
                    letterSpacing: '0.1em',
                    marginBottom: 4,
                  }}
                >
                  EXAMPLE
                </div>
                <div style={{ fontSize: 13, color: '#e4e6eb' }}>{format.example}</div>
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 8,
                  borderLeft: `3px solid ${format.color}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: format.color,
                    letterSpacing: '0.1em',
                    marginBottom: 4,
                  }}
                >
                  BOUNTY SPLIT
                </div>
                <div style={{ fontSize: 13, color: '#e4e6eb' }}>{format.splitRatio}</div>
              </div>
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e4e6eb', marginBottom: 10 }}>
                  Key Strategy Adjustments
                </h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(34,197,94,0.06)',
                      borderRadius: 8,
                      borderLeft: '3px solid #4ade80',
                    }}
                  >
                    <div
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-green)', marginBottom: 2 }}
                    >
                      CALL WIDER
                    </div>
                    <div style={{ fontSize: 13, color: '#e4e6eb' }}>
                      Bounty equity expands your calling range, especially vs short stacks.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(245,158,11,0.06)',
                      borderRadius: 8,
                      borderLeft: '3px solid #f59e0b',
                    }}
                  >
                    <div
                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-amber)', marginBottom: 2 }}
                    >
                      COVER OPPONENTS
                    </div>
                    <div style={{ fontSize: 13, color: '#e4e6eb' }}>
                      Having the biggest stack means you can collect bounties from everyone.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(99,102,241,0.06)',
                      borderRadius: 8,
                      borderLeft: '3px solid #818cf8',
                    }}
                  >
                    <div
                      style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 2 }}
                    >
                      ADJUST ICM
                    </div>
                    <div style={{ fontSize: 13, color: '#e4e6eb' }}>
                      Traditional ICM undervalues chips in bounty events. Factor in knockout equity.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Drill Tab */}
          {activeTab === 'drill' && (
            <div>
              {/* Score Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, color: '#b0b3b8' }}>
                  Scenario {(drillIndex % DRILL_SCENARIOS.length) + 1}/{DRILL_SCENARIOS.length}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: score > 0 ? 'var(--sp-accent-green)' : '#b0b3b8',
                  }}
                >
                  Score: {score}/{totalAnswered}
                </span>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 6,
                    marginBottom: 12,
                    background: `${(BOUNTY_FORMATS[scenario.format] || format).color}15`,
                    border: `1px solid ${(BOUNTY_FORMATS[scenario.format] || format).color}40`,
                    fontSize: 11,
                    fontWeight: 700,
                    color: (BOUNTY_FORMATS[scenario.format] || format).color,
                    letterSpacing: '0.08em',
                  }}
                >
                  {(BOUNTY_FORMATS[scenario.format] || format).name?.toUpperCase() || 'BOUNTY'}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e4e6eb', margin: '0 0 8px' }}>
                  {scenario.title}
                </h3>
                <p style={{ fontSize: 14, color: '#b0b3b8', lineHeight: 1.5, marginBottom: 16 }}>
                  {scenario.situation}
                </p>

                {/* Stack Info */}
                <div data-pills-row style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Hero Stack', value: `${scenario.heroStack}BB` },
                    { label: 'Villain Stack', value: `${scenario.villainStack}BB` },
                    { label: 'Bounty', value: `$${scenario.bounty}` },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#b0b3b8', fontWeight: 600 }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e6eb' }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                {!showResult && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer('call')}
                      style={{
                        flex: 1,
                        padding: '14px',
                        borderRadius: 10,
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background:
                          'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
                        border: '2px solid rgba(34,197,94,0.3)',
                        color: 'var(--sp-accent-green)',
                        fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.08em',
                      }}
                    >
                      CALL
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer('fold')}
                      style={{
                        flex: 1,
                        padding: '14px',
                        borderRadius: 10,
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background:
                          'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))',
                        border: '2px solid rgba(239,68,68,0.3)',
                        color: 'var(--sp-accent-red)',
                        fontFamily: "'Rajdhani', sans-serif",
                        letterSpacing: '0.08em',
                      }}
                    >
                      FOLD
                    </motion.button>
                  </div>
                )}

                {/* Result */}
                <AnimatePresence>
                  {showResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: 10,
                          marginTop: 12,
                          background:
                            selectedAnswer === scenario.correctAction
                              ? 'rgba(34,197,94,0.08)'
                              : 'rgba(239,68,68,0.08)',
                          border: `1px solid ${selectedAnswer === scenario.correctAction ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            marginBottom: 6,
                            color:
                              selectedAnswer === scenario.correctAction ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                          }}
                        >
                          {selectedAnswer === scenario.correctAction
                            ? 'CORRECT'
                            : `INCORRECT — Correct: ${scenario.correctAction.toUpperCase()}`}
                        </div>
                        <div style={{ fontSize: 13, color: '#e4e6eb', lineHeight: 1.5 }}>
                          {scenario.gtoExplanation}
                        </div>
                      </div>
                      <button
                        onClick={nextScenario}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: 8,
                          marginTop: 10,
                          fontSize: 14,
                          fontWeight: 700,
                          background: format.color,
                          border: 'none',
                          color: '#000',
                          cursor: 'pointer',
                          fontFamily: "'Rajdhani', sans-serif",
                          letterSpacing: '0.08em',
                        }}
                      >
                        NEXT SCENARIO
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {totalAnswered >= DRILL_SCENARIOS.length && (
                <button
                  onClick={handleComplete}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 10,
                    marginTop: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #10b981)',
                    border: 'none',
                    color: '#000',
                    cursor: 'pointer',
                  }}
                >
                  SAVE SESSION ({score}/{totalAnswered})
                </button>
              )}
            </div>
          )}

          {/* Calculator Tab */}
          {activeTab === 'calculator' && (
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#e4e6eb',
                  margin: '0 0 16px',
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                Bounty Equity Calculator
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {[
                  { label: 'Hero Stack (BB)', value: calcHeroStack, setter: setCalcHeroStack },
                  {
                    label: 'Villain Stack (BB)',
                    value: calcVillainStack,
                    setter: setCalcVillainStack,
                  },
                  { label: 'Bounty Value ($)', value: calcBounty, setter: setCalcBounty },
                  { label: 'Pot Size (BB)', value: calcPot, setter: setCalcPot },
                ].map((f) => (
                  <div key={f.label}>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#b0b3b8',
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      {f.label}
                    </label>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        f.setter(Number.isFinite(v) ? Math.max(0, Math.min(v, 99999)) : 0);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e4e6eb',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Results */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'Chip Equity', value: `${calcResult.chipEquity}%`, color: 'var(--sp-accent-blue)' },
                  { label: 'Bounty Value', value: `$${calcResult.bountyValue}`, color: 'var(--sp-accent-amber)' },
                  {
                    label: 'Adjusted Equity',
                    value: `${calcResult.adjustedEquity}%`,
                    color: 'var(--sp-accent-green)',
                  },
                  {
                    label: 'Calling Threshold',
                    value: `${calcResult.callingThreshold}%`,
                    color: 'var(--sp-accent-purple)',
                  },
                ].map((r) => (
                  <div
                    key={r.label}
                    style={{
                      padding: '12px 14px',
                      background: `${r.color}08`,
                      borderRadius: 8,
                      border: `1px solid ${r.color}25`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: r.color,
                        letterSpacing: '0.08em',
                        marginBottom: 4,
                      }}
                    >
                      {r.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e6eb' }}>{r.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
