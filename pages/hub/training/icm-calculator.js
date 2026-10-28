/**
 * ICM Calculator — Tournament Chip-to-Dollar Equity
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 21: Standalone ICM equity calculator for tournament players.
 * Converts chip stacks to dollar equity using the Malmuth-Harville model.
 *
 * Route: /hub/training/icm-calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH4-2 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH5-23 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-20 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import { authedFetch } from '../../../src/lib/authUtils';
import VerifiedToolGateway from '../../../src/components/training/VerifiedToolGateway';

const ICM_CALCULATOR_FAQS = [
  {
    question: 'What Is ICM In Tournament Poker?',
    answer:
      'ICM (Independent Chip Model) Is A Mathematical Model That Translates Tournament Chip Stacks Into Their Actual Expected Dollar Equity Based On The Remaining Prize Pool Distribution.',
  },
  {
    question: 'Why Do Chip Values Decrease As Stacks Grow Larger In Tournaments?',
    answer:
      'Because Tournament Payout Structures Award Fixed Prizes To Top Finishes Rather Than Exchanging Chips Directly For Cash. Your First Chip Is Worth The Most (Qualifying For Min-Cashes), While Chips That Exceed First-Place Prize Equity Have Diminishing Marginal Dollar Value.',
  },
  {
    question: 'How Does ICM Affect Calling Ranges On The Bubble?',
    answer:
      'ICM Creates Risk Asymmetry Where Losing Chips Hurts Significantly More Than Gaining The Same Number Of Chips Helps. This Forces Players To Tighten Calling Ranges Drastically Against All-In Bets Near Pay Jumps And Bubbles.',
  },
  {
    question: 'Which Algorithm Does This ICM Calculator Use?',
    answer:
      'This Calculator Runs The Canonical Malmuth-Harville Multi-Place Probability Model To Calculate Exact Finish-Distribution Odds For Every Seat At Final Tables Up To 9 Players.',
  },
  {
    question: 'How Do I Use ICM Calculations For Final Table Chop Negotiations?',
    answer:
      'Input Each Player Stack And Remaining Cash Payout Ranks. The Resulting Dollar Values Represent Mathematically Fair Equity Allocations Before Considering Skill Edge Adjustments.',
  },
];

const ICM_CALCULATOR_SCHEMA = hubProductSchema({
  path: '/hub/training/icm-calculator',
  name: 'Smarter.Poker Tournament ICM Calculator',
  description: 'Free Tournament ICM Equity Calculator. Convert Chip Stacks To Real Dollar Values Using The Malmuth-Harville Model For Final Table And Bubble Decisions.',
  applicationCategory: 'GameApplication',
  applicationSubCategory: 'Poker',
  trail: [['Hub', '/hub'], ['GTO Training', '/hub/training'], ['ICM Calculator', '/hub/training/icm-calculator']],
  faqs: ICM_CALCULATOR_FAQS,
  howTo: {
    name: 'How To Calculate Tournament Independent Chip Model (ICM) Payouts',
    description: 'Step-by-step instructions for converting tournament chip stacks into exact cash dollar equity using the Malmuth-Harville model.',
    steps: [
      {
        name: 'Enter Player Chip Stacks',
        text: 'Input the current chip counts for each remaining player at the final table or tournament bubble.',
      },
      {
        name: 'Configure Prize Structure',
        text: 'Set the total prize pool and percentage payouts or dollar prizes awarded to each finishing place rank.',
      },
      {
        name: 'Run The Malmuth-Harville Probability Solver',
        text: 'Click Calculate to execute the multi-place probability solver and generate exact finish distributions for every seat.',
      },
      {
        name: 'Analyze Bubble Factors And Equity Differences',
        text: 'Review the resulting ICM dollar values, bubble factor risk multipliers, and differences from raw chip EV to negotiate chops or refine push-fold ranges.',
      },
    ],
  },
});

// TRAIN-CSS-MOTION-ADOPT-4 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ICM PREFLOP RANGES COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function ICMCalculatorPage({ canonical = 'https://smarter.poker/hub/training/icm-calculator' } = {}) {
  const router = useRouter();
  const effectiveCanonical = router.pathname === '/tools/icm-calculator' ? 'https://smarter.poker/tools/icm-calculator' : canonical;
  useTrainingBus('icm-calculator');
  const [stacks, setStacks] = useState([25000, 20000, 15000, 10000]);
  const [prizes, setPrizes] = useState([40, 30, 20, 10]);
  const [prizePool, setPrizePool] = useState(1000);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [icmView, setIcmView] = useState('calculator');

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
        // Calculator use is analytics, not a graded training completion.
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

  const schema = useMemo(() => {
    const canonicalPath = router.pathname === '/tools/icm-calculator' ? '/tools/icm-calculator' : '/hub/training/icm-calculator';
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Tournament ICM Calculator',
      description: 'Free Tournament ICM Equity Calculator. Convert Chip Stacks To Real Dollar Values Using The Malmuth-Harville Model For Final Table And Bubble Decisions.',
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker',
      trail: [['Hub', '/hub'], ['GTO Training', '/hub/training'], ['ICM Calculator', canonicalPath]],
      faqs: [
        {
          question: 'What is ICM in tournament poker?',
          answer:
            'ICM (Independent Chip Model) is a mathematical model that translates tournament chip stacks into their actual expected dollar equity based on the remaining prize pool distribution.',
        },
        {
          question: 'Why do chip values decrease as stacks grow larger in tournaments?',
          answer:
            'Because tournament payout structures award fixed prizes to top finishes rather than exchanging chips directly for cash. Your first chip is worth the most (qualifying for min-cashes), while chips that exceed first-place prize equity have diminishing marginal dollar value.',
        },
        {
          question: 'How does ICM affect calling ranges on the bubble?',
          answer:
            'ICM creates risk asymmetry where losing chips hurts significantly more than gaining the same number of chips helps. This forces players to tighten calling ranges drastically against all-in bets near pay jumps and bubbles.',
        },
        {
          question: 'Which algorithm does this ICM calculator use?',
          answer:
            'This calculator runs the canonical Malmuth-Harville multi-place probability model to calculate exact finish-distribution odds for every seat at final tables up to 9 players.',
        },
        {
          question: 'How do I use ICM calculations for final table chop negotiations?',
          answer:
            'Input each player stack and remaining cash payout ranks. The resulting dollar values represent mathematically fair equity allocations before considering skill edge adjustments.',
        },
      ],
    });
  }, [router.pathname]);

  return (
    <>
      <SEOHead
        title="Tournament ICM Calculator"
        description="Free Tournament ICM Calculator. Convert Chip Stacks To Real Dollar Values Using The Malmuth-Harville Model For Final Table And Bubble Decisions."
        canonical={effectiveCanonical}
        jsonLd={schema}
        ogImage="/api/og/tool-card?tool=icm&title=Tournament+ICM+Calculator&subtitle=Malmuth-Harville+Final+Table+Chop+And+Bubble+Equity&statLabel=PRECISION&statValue=EXACT+MODEL"
        markdownUrl="https://smarter.poker/tools/icm-calculator.md"
      />

      <div
        className="sp-training-tool sp-training-tool--analysis sp-analysis-icm"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          className="sp-training-analysis-header"
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
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              ICM Calculator
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
              PHASE 21
            </span>
          </div>
        </div>

        <div className="sp-training-analysis-main" style={{ padding: '16px 24px', maxWidth: 700, margin: '0 auto' }}>
          {/* Quick Presets */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                    fontSize: 12,
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                    color: stacks.length <= 2 ? 'var(--sp-fg-faint)' : 'var(--sp-accent-red)',
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
                    color: stacks.length >= 9 ? 'var(--sp-fg-faint)' : 'var(--sp-accent-green)',
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
                      fontSize: 12,
                      fontWeight: 800,
                      color: PLAYER_COLORS[i],
                      width: 14,
                      textAlign: 'center',
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    {i + 1}
                  </span>
                  <input
                    aria-label={`Player ${i + 1} Stack`}
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
                  <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 600, minWidth: 36 }}>
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                    color: prizes.length <= 1 ? 'var(--sp-fg-faint)' : 'var(--sp-accent-red)',
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
                    color: prizes.length >= 9 ? 'var(--sp-fg-faint)' : 'var(--sp-accent-green)',
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
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--sp-accent-amber)',
                      width: 20,
                      textAlign: 'right',
                    }}
                  >
                    {i + 1}st
                  </span>
                  <input
                    aria-label={`Place ${i + 1} Prize Percentage`}
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
                  <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 600 }}>%</span>
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
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-accent-amber)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                POOL $
              </span>
              <input
                aria-label="Total Prize Pool"
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
              className="sp-analysis-primary-action"
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
                  : 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
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
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}
                      >
                        {item.value}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
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
                      fontSize: 12,
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
                          fontSize: 12,
                          fontWeight: 900,
                          color: PLAYER_COLORS[i],
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}
                      >
                        {r.player}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)' }}>
                        {r.chips.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
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
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: 'right',
                          color: 'var(--sp-accent-purple)',
                        }}
                      >
                        {r.icmPct}%
                      </span>
                      <span
                        style={{
                          fontSize: 12,
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
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    Chip% Vs ICM% Comparison
                  </div>

                  {results.results.map((r, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
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
                      fontSize: 12,
                      color: 'var(--sp-fg-dim)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Top Bar = Chip%</span>
                    <span>Bottom Bar = ICM%</span>
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
                        ? 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)'
                        : 'rgba(255,255,255,0.06)',
                    color: icmView === tab.key ? '#fff' : 'var(--sp-fg-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}

            </div>

            <AnimatePresence mode="wait">
              {icmView === 'ranges' && (
                <motion.div
                  key="icm-ranges"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <VerifiedToolGateway
                    eyebrow="Graded Tournament Training"
                    title="Practice ICM Push Or Fold"
                    description="Open the Club Arena drill for authored tournament decisions, explicit feedback, and manual Next controls. The calculator does not manufacture a push range from a percentage threshold."
                    href="/hub/training/arena/mtt-002?level=1"
                    action="Open Push Or Fold Training"
                    source="Versioned Tournament Corpus"
                  />
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
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              About ICM
            </div>
            <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
              The Independent Chip Model (ICM) Converts Tournament Chip Stacks Into Real Dollar
              Equity Based On The Prize Structure. Unlike Chip EV (Where Each Chip Is Worth The
              Same), ICM Accounts For The Diminishing Value Of Chips - The Chip Leader's Stack Is
              Worth Less Per Chip Than A Short Stack's. The Bubble Factor Measures This Effect:
              Values Above 1.0 Mean Survival Is More Important Than Accumulation.
            </p>
          </div>

          {/* Frequently Asked Questions */}
          <section
            aria-label="Frequently Asked Questions"
            style={{
              marginTop: 20,
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <h2
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--sp-fg)',
                letterSpacing: 0.5,
                margin: '0 0 12px 0',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ICM_CALCULATOR_FAQS.map((faq, idx) => (
                <details
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: 'var(--sp-fg)',
                  }}
                >
                  <summary
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      color: 'var(--sp-accent-amber)',
                      outline: 'none',
                    }}
                  >
                    {faq.question}
                  </summary>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--sp-fg-muted)',
                    }}
                  >
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
