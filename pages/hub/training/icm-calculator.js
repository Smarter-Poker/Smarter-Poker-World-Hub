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
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import sd from '../../../src/styles/training/training-smarterdesign.module.css';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import { tournamentEquity } from '../../../src/lib/poker/tournamentEquity.js';
import { useOnlineStatus } from '../../../src/hooks/useOnlineStatus';
import { hubProductSchema } from '../../../src/lib/seo/hubPageSchema';
import CitationBacklinkBox from '../../../src/components/seo/CitationBacklinkBox';
import AiPromptLauncher from '../../../src/components/seo/AiPromptLauncher';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
import VerifiedToolGateway from '../../../src/components/training/VerifiedToolGateway';

// FAQ reference: What is ICM in tournament poker?
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

const ICM_CALCULATOR_HOW_TO = {
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
};

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
    description: ICM_CALCULATOR_HOW_TO.description,
    steps: ICM_CALCULATOR_HOW_TO.steps,
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

const ordinal = (n) => {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};


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
    label: 'Bubble (5 Left, 4 Paid)',
    stacks: [25000, 20000, 18000, 15000, 12000],
    prizes: [40, 27, 19, 14],
    prizePool: 5000,
  },
  {
    label: 'Heads-Up (2 Left)',
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
    label: 'Satellite (4 Seats)',
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
  const online = useOnlineStatus();
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

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query || {};
    if (typeof q.stacks === 'string') {
      const parsedStacks = q.stacks
        .split(',')
        .map((s) => Math.max(0, parseInt(s.trim(), 10) || 0))
        .filter((n) => n > 0)
        .slice(0, 9);
      if (parsedStacks.length >= 2) {
        setStacks(parsedStacks);
      }
    }
    const rawPayouts = typeof q.payouts === 'string' ? q.payouts : typeof q.prizes === 'string' ? q.prizes : null;
    if (rawPayouts) {
      const parsedPrizes = rawPayouts
        .split(',')
        .map((p) => Math.max(0, parseFloat(p.trim()) || 0))
        .filter((n) => n > 0)
        .slice(0, 9);
      if (parsedPrizes.length >= 1) {
        const sum = parsedPrizes.reduce((acc, v) => acc + v, 0);
        if (sum > 105 && !q.prizePool) {
          setPrizePool(Math.round(sum));
          setPrizes(parsedPrizes.map((v) => Math.round((v / sum) * 1000) / 10));
        } else {
          setPrizes(parsedPrizes);
        }
      }
    }
    if (q.prizePool !== undefined && Number(q.prizePool) > 0) {
      setPrizePool(Math.round(Number(q.prizePool)));
    }
  }, [router.isReady]);

  useEffect(() => { setResults(null); setError(null); }, [stacks, prizes, prizePool]);

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
      const data = tournamentEquity({ stacks, prizes, prizePool });
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
      faqs: ICM_CALCULATOR_FAQS,
      howTo: ICM_CALCULATOR_HOW_TO,
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

      <div className="sp-training-tool sp-training-tool--analysis sp-analysis-icm">
        <div className={sd.page}>
          <TrainingPageHead
            slug="icm"
            title="ICM Calculator"
            helpContent={
              <>
                <p>Enter Each Remaining Stack, The Prize Pool And The Payout Percentages. Calculate To See Each Seat’s Tournament Equity. You Can Use The Calculator Without Having To Sign In.</p>
                <div className={sd.helpBlock}>
                  <h3>About ICM</h3>
                  <p>
                    The Independent Chip Model (ICM) Converts Tournament Chip Stacks Into Real Dollar
                    Equity Based On The Prize Structure. Unlike Chip EV (Where Each Chip Is Worth The
                    Same), ICM Accounts For The Diminishing Value Of Chips - The Chip Leader&apos;s Stack Is
                    Worth Less Per Chip Than A Short Stack&apos;s. The Bubble Factor Measures This Effect:
                    Values Above 1.0 Mean Survival Is More Important Than Accumulation.
                  </p>
                </div>
                {/* Related Tournament Action: Freerolls */}
                <div className={sd.helpBlock}>
                  <h3>Test Your ICM Skills In Daily Freerolls</h3>
                  <p>Put Tournament Equity Strategy Into Action With Zero Entry Fee And Real Guaranteed Prizes.</p>
                  <button type="button" className="sd-button sd-primary" onClick={() => router.push('/freerolls')}>
                    View Freeroll Schedule
                  </button>
                </div>
                {/* Related Poker Tools & Comparisons */}
                <section className={sd.helpBlock} aria-label="Related Poker Tools And Software Comparisons">
                  <h3>Related Poker Tools And Software Comparisons</h3>
                  <div className={sd.chips}>
                    <Link href="/compare" className="sd-button">Compare ICM Calculator Vs. ICMIZER</Link>
                    <Link href="/freerolls" className="sd-button">Play Daily Freerolls</Link>
                    <Link href="/tools/poker-odds-calculator" className="sd-button">Poker Odds Calculator</Link>
                    <Link href="/tools/preflop-ranges" className="sd-button">13x13 GTO Preflop Ranges</Link>
                  </div>
                </section>
                <CitationBacklinkBox
                  title="Malmuth-Harville Tournament ICM & Bubble Factor Calculator"
                  canonicalUrl="https://smarter.poker/tools/icm-calculator"
                  badgeType="gto"
                  badgeLabel="GTO Math Verified"
                  badgeValue="Smarter.Poker ICM Solver"
                  summary="Free Tournament Independent Chip Model (ICM) Calculator Converting Chip Stacks To Real Dollar Equity And Bubble Factors."
                  slug="icm-calculator"
                />
                <AiPromptLauncher
                  title="Malmuth-Harville Tournament ICM & Bubble Factor Calculator"
                  canonicalUrl="https://smarter.poker/tools/icm-calculator"
                  markdownUrl="https://smarter.poker/tools/icm-calculator.md"
                />
              </>
            }
          />

          <div className="sp-training-analysis-main" style={{ display: 'grid', gap: 14, minWidth: 0 }}>
            {!online && <p role="status" className={sd.offline}>The Calculator Works Offline While This Page Is Open.</p>}

            {/* Calculator / Push-Fold view switch */}
            <div className={sd.segmented} role="group" aria-label="ICM Views">
              {[
                { key: 'calculator', label: 'ICM Calculator' },
                { key: 'ranges', label: 'ICM Push/Fold Ranges' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className="sd-button"
                  aria-pressed={icmView === tab.key}
                  onClick={() => setIcmView(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {icmView === 'ranges' && (
              <VerifiedToolGateway
                eyebrow="Graded Tournament Training"
                title="Practice ICM Push Or Fold"
                description="Open the Club Arena drill for authored tournament decisions, explicit feedback, and manual Next controls. The calculator does not manufacture a push range from a percentage threshold."
                href="/hub/training/arena/mtt-002?level=1"
                action="Open Push Or Fold Training"
                source="Versioned Tournament Corpus"
              />
            )}

            {icmView === 'calculator' && (
              <>
                {/* Quick Presets */}
                <section className={`sd-panel ${sd.panel}`} aria-labelledby="icm-presets-title">
                  <h2 id="icm-presets-title" className={sd.sectionTitle}>Quick Presets</h2>
                  <div className={sd.chips}>
                    {PRESETS.map((p, i) => (
                      <button key={i} type="button" className="sd-button" onClick={() => loadPreset(p)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Chip Stacks Input */}
                <section className={`sd-panel ${sd.panel}`} aria-labelledby="icm-stacks-title">
                  <div className={sd.panelHead}>
                    <h2 id="icm-stacks-title" className={sd.sectionTitle}>Chip Stacks ({stacks.length} Players)</h2>
                    <div className={sd.stepper}>
                      <button type="button" className="sd-button" onClick={removePlayer} disabled={stacks.length <= 2} aria-label="Remove A Player">-</button>
                      <button type="button" className="sd-button" onClick={addPlayer} disabled={stacks.length >= 9} aria-label="Add A Player">+</button>
                    </div>
                  </div>
                  <div className={sd.fieldList}>
                    {stacks.map((stack, i) => (
                      <div key={i} className={sd.fieldRow}>
                        <span className={sd.seatTag} aria-hidden="true">{i + 1}</span>
                        <input
                          className={sd.input}
                          aria-label={`Player ${i + 1} Stack`}
                          type="number"
                          inputMode="numeric"
                          value={stack}
                          onChange={(e) => updateStack(i, e.target.value)}
                        />
                        <span className={sd.unit}>
                          {totalChips > 0 ? `${Math.round((stack / totalChips) * 1000) / 10}%` : '0%'}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Prize Structure */}
                <section className={`sd-panel ${sd.panel}`} aria-labelledby="icm-prizes-title">
                  <div className={sd.panelHead}>
                    <h2 id="icm-prizes-title" className={sd.sectionTitle}>Prize Structure ({prizes.length} Places)</h2>
                    <div className={sd.stepper}>
                      <button type="button" className="sd-button" onClick={removePrize} disabled={prizes.length <= 1} aria-label="Remove A Paid Place">-</button>
                      <button type="button" className="sd-button" onClick={addPrize} disabled={prizes.length >= 9} aria-label="Add A Paid Place">+</button>
                    </div>
                  </div>
                  <div className={sd.fieldList}>
                    {prizes.map((prize, i) => (
                      <div key={i} className={sd.fieldRow}>
                        <span className={`${sd.seatTag} no-capitalize`} aria-hidden="true">{ordinal(i + 1)}</span>
                        <input
                          className={sd.input}
                          aria-label={`Place ${i + 1} Prize Percentage`}
                          type="number"
                          inputMode="decimal"
                          value={prize}
                          onChange={(e) => updatePrize(i, e.target.value)}
                          step="0.5"
                        />
                        <span className={sd.unit}>%</span>
                      </div>
                    ))}
                  </div>
                  <hr className={sd.rule} />
                  {/* Prize Pool */}
                  <label className={sd.poolRow}>
                    <span className={sd.poolLabel}>Prize Pool ($)</span>
                    <input
                      className={sd.input}
                      aria-label="Total Prize Pool"
                      type="number"
                      inputMode="numeric"
                      value={prizePool}
                      onChange={(e) => setPrizePool(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    />
                  </label>
                </section>

                {/* Calculate Button */}
                <motion.button
                  type="button"
                  className={`sp-analysis-primary-action sd-button sd-primary ${sd.primaryAction}`}
                  whileTap={{ scale: 0.98 }}
                  onClick={calculate}
                  disabled={loading}
                >
                  {loading ? 'Calculating...' : error ? 'Retry Calculation' : 'Calculate ICM'}
                </motion.button>

                {/* Error */}
                {error && <p role="alert" className={sd.error}>{error}</p>}

                {/* Results */}
                <AnimatePresence>
                  {results && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gap: 14 }}>
                      {/* Summary */}
                      <div className={sd.metrics}>
                        {[
                          { label: 'Prize Pool', value: `$${results.totalPrizePool.toLocaleString()}`, tone: 'ice' },
                          { label: 'Total Chips', value: results.totalChips.toLocaleString() },
                          {
                            label: 'Bubble Factor · Seat 1 Vs 2',
                            value: results.bubbleFactor == null ? 'N/A' : results.bubbleFactor.toFixed(2),
                            tone: results.bubbleFactor == null ? undefined : results.bubbleFactor > 1.1 ? 'down' : 'up',
                          },
                        ].map((item) => (
                          <div key={item.label} className={`sd-metric ${sd.metric}`}>
                            <span className={sd.metricLabel}>{item.label}</span>
                            <strong className={sd.metricValue} data-tone={item.tone}>{item.value}</strong>
                          </div>
                        ))}
                      </div>

                      {/* Results Table */}
                      <section className={`sd-panel ${sd.panel}`} aria-labelledby="icm-results-title">
                        <h2 id="icm-results-title" className={sd.sectionTitle}>Tournament Equity By Seat</h2>
                        <div className={sd.table} role="table" aria-label="ICM Results">
                          <div className={`${sd.tableRow} ${sd.tableHead}`} role="row">
                            <span role="columnheader">Seat</span>
                            <span role="columnheader">Chips</span>
                            <span role="columnheader">Chip %</span>
                            <span role="columnheader">ICM $</span>
                            <span role="columnheader">ICM %</span>
                            <span role="columnheader">Diff $</span>
                          </div>
                          {results.results.map((r, i) => {
                            const diff = Number.isFinite(Number(r.difference)) ? Number(r.difference) : 0;
                            return (
                              <div key={i} className={sd.tableRow} role="row">
                                <span role="cell"><span className={`${sd.seatTag} ${sd.seatSmall}`}>{r.player}</span></span>
                                <span role="cell" className={sd.cell}>{r.chips.toLocaleString()}</span>
                                <span role="cell" className={`${sd.cell} ${sd.cellMuted}`}>{r.chipPct}%</span>
                                <span role="cell" className={`${sd.cell} ${sd.cellIce}`}>
                                  ${(Number.isFinite(Number(r.icmDollars)) ? Number(r.icmDollars) : 0).toFixed(0)}
                                </span>
                                <span role="cell" className={sd.cell}>{r.icmPct}%</span>
                                <span role="cell" className={`${sd.cell} ${diff >= 0 ? sd.cellUp : sd.cellDown}`}>
                                  {diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(0)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      {/* Equity Bars — Chip% vs ICM% */}
                      <section className={`sd-panel ${sd.panel}`} aria-labelledby="icm-bars-title">
                        <h2 id="icm-bars-title" className={sd.sectionTitle}>Chip % Vs ICM % Comparison</h2>
                        <div className={sd.bars}>
                          {results.results.map((r, i) => (
                            <div key={i}>
                              <div className={sd.barHead}>
                                <span>Player {r.player}</span>
                                <span>Chip {r.chipPct}% · ICM {r.icmPct}%</span>
                              </div>
                              <div className={sd.track}>
                                <motion.div
                                  className={sd.fill}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(r.chipPct, 100)}%` }}
                                  transition={{ duration: MOTION.slow, delay: i * 0.05 }}
                                />
                              </div>
                              <div className={sd.track}>
                                <motion.div
                                  className={`${sd.fill} ${sd.fillIcm}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(r.icmPct, 100)}%` }}
                                  transition={{ duration: MOTION.slow, delay: i * 0.05 + 0.1 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={sd.legend}>
                          <span><i className={sd.swatch} aria-hidden="true" />Top Bar = Chip %</span>
                          <span><i className={`${sd.swatch} ${sd.swatchIcm}`} aria-hidden="true" />Bottom Bar = ICM %</span>
                        </div>
                      </section>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {/* Frequently Asked Questions (also published as the FAQPage schema) */}
            <section className={`sd-panel ${sd.panel}`} aria-label="Frequently Asked Questions">
              <h2 className={sd.sectionTitle}>Frequently Asked Questions</h2>
              <div className={sd.faqList}>
                {ICM_CALCULATOR_FAQS.map((faq) => (
                  <details key={faq.question} className={sd.faq}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
