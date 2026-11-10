/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  FINAL TABLE DEAL & ICM CHOP CALCULATOR (/tools/chop-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive Final Table Deal Calculator comparing Exact Malmuth-Harville ICM
 * Chop, Linear Chip Chop, and Hybrid Save-Amount Chop side by side with deep-link
 * scenario permalinks.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { renderChopCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const DEFAULT_STACKS = [450000, 320000, 210000, 120000, 80000, 50000];
const DEFAULT_PAYOUTS = [15000, 10000, 7000, 5000, 3500, 2500];

const CHOP_BENCHMARK_TABLE = [
  {
    scenario: '4-Handed Equal Stacks (25% Chips Each)',
    icmShare: '25.0% Prize Pool Each',
    chipChopShare: '25.0% Prize Pool Each',
    winnerBias: 'Zero Divergence ($0 Delta)',
    negotiationNote: 'Identical Stacks Produce Identical ICM And Chip Chop Numbers',
  },
  {
    scenario: '4-Handed Dominant Chip Leader (55% Of Chips In Play)',
    icmShare: '38.5% To 41.2% Of Remaining Pool',
    chipChopShare: '46.0% To 50.5% Of Remaining Pool',
    winnerBias: 'Chip Chop Overpays Leader Above 1st Place Prize',
    negotiationNote: 'Short Stacks Should Never Accept Pure Chip Chop Against A Monster Stack',
  },
  {
    scenario: '3-Handed With 10% Trophy Save Set Aside',
    icmShare: '90% ICM Locked + Play For 10% Trophy Save',
    chipChopShare: '90% Linear + Play For 10% Trophy Save',
    winnerBias: 'Preserves Competitive Endgame Integrity',
    negotiationNote: 'Required By Most Major Tours (WSOP Circuit, WPT, EPT) For Official Deals',
  },
  {
    scenario: 'Heads-Up 2:1 Chip Lead ($15,000 Vs $10,000 Prizes)',
    icmShare: '$13,333 Leader / $11,667 Second (66.7% Of Diff)',
    chipChopShare: '$13,333 Leader / $11,667 Second',
    winnerBias: 'Zero Divergence Heads-Up ($0 Delta)',
    negotiationNote: 'In Heads-Up Play, Exact Malmuth-Harville ICM Equals Linear Chip Chop',
  },
];

const CHOP_CALCULATOR_FAQS = [
  {
    question: 'What Is The Difference Between An ICM Chop And A Chip Chop?',
    answer:
      'An Independent Chip Model (ICM) Chop Uses Recursive Malmuth-Harville Probability To Value Each Stack Based On The Exact Likelihood Of Finishing 1st, 2nd, 3rd, Or Lower. A Linear Chip Chop Simply Awards Every Player The Minimum Remaining Payout Plus A Share Of The Surplus Proportional To Their Chip Count, Which Heavily Overpays The Big Stack.',
  },
  {
    question: 'How Does A Save-Amount Final Table Deal Work?',
    answer:
      'In A Save-Amount Deal, Players Agree To Set Aside A Fixed Dollar Amount (Typically 10% Of The Remaining Prize Pool) Plus The Championship Trophy For The Eventual Winner, And Distribute The Remaining 90% Immediately Using Either ICM Or Chip Chop Math.',
  },
  {
    question: 'Why Do Short Stacks Prefer ICM While Chip Leaders Ask For Chip Chop?',
    answer:
      'Because A Tournament Chip Leader Cannot Win More Than First Place Even If They Hold 75% Of The Chips In Play, Tournament Chips Have Diminishing Marginal Dollar Value. ICM Captures This Diminishing Return, Whereas Chip Chop Pretends Every Chip Has Equal Linear Cash Value.',
  },
];

function computeExactIcmEquities(stacks, payouts) {
  const n = stacks.length;
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips <= 0 || n === 0) return stacks.map(() => 0);

  const equities = new Array(n).fill(0);

  function recurse(activeMask, remainingTotal, placeIdx, probPrefix) {
    if (placeIdx >= n || probPrefix < 1e-9) return;
    const prize = payouts[placeIdx] || 0;

    for (let i = 0; i < n; i += 1) {
      if ((activeMask & (1 << i)) === 0) continue;
      const stack = stacks[i];
      if (stack <= 0) continue;
      const pWinPlace = remainingTotal > 0 ? stack / remainingTotal : 0;
      const branchProb = probPrefix * pWinPlace;
      equities[i] += branchProb * prize;

      if (placeIdx + 1 < n) {
        recurse(activeMask ^ (1 << i), remainingTotal - stack, placeIdx + 1, branchProb);
      }
    }
  }

  const fullMask = (1 << n) - 1;
  recurse(fullMask, totalChips, 0, 1);
  return equities;
}

export default function ChopCalculatorPage({
  initialPlayerCount = 4,
  initialStacks = DEFAULT_STACKS.slice(0, 6),
  initialPayouts = DEFAULT_PAYOUTS.slice(0, 6),
  initialSaveAmount = 1500,
}) {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState(initialPlayerCount);
  const [stacks, setStacks] = useState(initialStacks);
  const [payouts, setPayouts] = useState(initialPayouts);
  const [saveAmount, setSaveAmount] = useState(initialSaveAmount);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  useSolvedSpotUrlSync(
    {
      n: playerCount,
      stacks: stacks.slice(0, playerCount).join(','),
      payouts: payouts.slice(0, playerCount).join(','),
      save: saveAmount,
    },
    {}
  );

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.stacks) {
      const parsedStacks = String(q.stacks)
        .split(',')
        .map((v) => Math.max(1, Number(v) || 0))
        .filter((v) => v > 0);
      if (parsedStacks.length >= 2 && parsedStacks.length <= 6) {
        setPlayerCount(parsedStacks.length);
        const nextStacks = [...DEFAULT_STACKS];
        parsedStacks.forEach((val, idx) => {
          nextStacks[idx] = val;
        });
        setStacks(nextStacks);
      }
    }
    if (q.payouts) {
      const parsedPayouts = String(q.payouts)
        .split(',')
        .map((v) => Math.max(0, Number(v) || 0));
      if (parsedPayouts.length >= 2) {
        const nextPayouts = [...DEFAULT_PAYOUTS];
        parsedPayouts.slice(0, 6).forEach((val, idx) => {
          nextPayouts[idx] = val;
        });
        setPayouts(nextPayouts);
      }
    }
    if (q.save !== undefined) {
      setSaveAmount(Math.max(0, Math.min(50000, Number(q.save) || 0)));
    }
  }, [router.isReady, router.query]);

  const dealMetrics = useMemo(() => {
    const safeCount = Math.max(2, Math.min(6, Math.round(Number(playerCount) || 4)));
    const activeStacks = stacks.slice(0, safeCount).map((s) => Math.max(1, Number(s) || 10000));
    const activePayouts = payouts.slice(0, safeCount).map((p) => Math.max(0, Number(p) || 0));
    const totalChips = activeStacks.reduce((acc, s) => acc + s, 0);
    const totalPrizePool = activePayouts.reduce((acc, p) => acc + p, 0);
    const minPayout = activePayouts[safeCount - 1] || 0;
    const maxSaveAllowed = Math.max(0, totalPrizePool - minPayout * safeCount);
    const safeSave = Math.max(0, Math.min(50000, Math.min(maxSaveAllowed, Number(saveAmount) || 0)));

    // 1. Exact Malmuth-Harville ICM Chop (100% distributed)
    const exactIcmDollars = computeExactIcmEquities(activeStacks, activePayouts);

    // 2. Linear Chip Chop: every player locks up minPayout, surplus divided by chip share
    const guaranteedFloorTotal = minPayout * safeCount;
    const surplusPool = Math.max(0, totalPrizePool - guaranteedFloorTotal);
    const chipChopDollars = activeStacks.map(
      (s) => minPayout + (totalChips > 0 ? (s / totalChips) * surplusPool : 0)
    );

    // 3. Hybrid Save-Amount ICM Chop: scale prize jumps proportionally after removing safeSave from top
    const poolAfterSave = Math.max(0, totalPrizePool - safeSave);
    const saveScaleRatio =
      totalPrizePool - guaranteedFloorTotal > 0
        ? Math.max(0, poolAfterSave - guaranteedFloorTotal) / (totalPrizePool - guaranteedFloorTotal)
        : 0;
    const saveAdjustedPayouts = activePayouts.map(
      (p) => minPayout + (p - minPayout) * saveScaleRatio
    );
    const saveIcmDollars = computeExactIcmEquities(activeStacks, saveAdjustedPayouts);

    const rows = activeStacks.map((stack, idx) => {
      const chipPct = totalChips > 0 ? (stack / totalChips) * 100 : 0;
      const icmVal = exactIcmDollars[idx] || 0;
      const chipVal = chipChopDollars[idx] || 0;
      const saveVal = saveIcmDollars[idx] || 0;
      const deltaIcmVsChip = icmVal - chipVal;
      return {
        seat: idx + 1,
        stack,
        chipPct: chipPct.toFixed(1),
        scheduledPrize: activePayouts[idx] || 0,
        icmChop: Math.round(icmVal),
        chipChop: Math.round(chipVal),
        saveChop: Math.round(saveVal),
        deltaIcmVsChip: Math.round(deltaIcmVsChip),
      };
    });

    return {
      safeCount,
      activeStacks,
      activePayouts,
      totalChips,
      totalPrizePool,
      minPayout,
      safeSave,
      poolAfterSave,
      rows,
    };
  }, [playerCount, stacks, payouts, saveAmount]);

  const handleStackChange = (idx, value) => {
    const next = [...stacks];
    next[idx] = value;
    setStacks(next);
  };

  const handlePayoutChange = (idx, value) => {
    const next = [...payouts];
    next[idx] = value;
    setPayouts(next);
  };

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const sParam = dealMetrics.activeStacks.join(',');
    const pParam = dealMetrics.activePayouts.join(',');
    const shareUrl = `${window.location.origin}/tools/chop-calculator?stacks=${sParam}&payouts=${pParam}&save=${dealMetrics.safeSave}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyDealSummary = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const lines = [
      `Smarter.Poker Final Table Deal Summary (${dealMetrics.safeCount}-Handed | Pool: $${dealMetrics.totalPrizePool.toLocaleString('en-US')} | Save: $${dealMetrics.safeSave.toLocaleString('en-US')})`,
      ...dealMetrics.rows.map(
        (r) =>
          `Seat ${r.seat} (${r.stack.toLocaleString('en-US')} Chips / ${r.chipPct}%): ICM $${r.icmChop.toLocaleString('en-US')} | Chip Chop $${r.chipChop.toLocaleString('en-US')} | Save Deal $${r.saveChop.toLocaleString('en-US')}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const canonicalPath = '/tools/chop-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Final Table Deal & ICM Chop Calculator';
  const pageDesc =
    'Compare Exact Malmuth-Harville ICM Chop, Chip Chop, And Save-Amount Final Table Deal Payouts Side By Side With Shareable Scenario Permalinks.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Final Table Deal & ICM Chop Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Final Table ICM & Chip Chop Deal Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Final Table Chop Calculator', canonicalPath],
      ],
      faqs: CHOP_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Calculate A Fair Poker Final Table Chop',
        description: pageDesc,
        steps: [
          {
            name: 'Select Remaining Final Table Players And Enter Chip Stacks',
            text: 'Choose Between 2 And 6 Remaining Players And Input Exact Chip Counts For Every Seat.',
          },
          {
            name: 'Input Remaining Prize Pool Payouts And Optional Winner Save',
            text: 'Enter Scheduled Payouts For 1st Through Nth Place And Any Mandatory Cash Save Reserved For First Place.',
          },
          {
            name: 'Compare ICM Chop, Chip Chop, And Save-Amount Payouts',
            text: 'Review Exact Dollar Differences Between ICM And Linear Chip Chop And Copy The Shareable Deal Permalink.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Final Table Deal & ICM Chop Calculator"
        description="Compare Exact Malmuth-Harville ICM Chop, Chip Chop, And Save-Amount Final Table Deal Payouts Side By Side With Shareable Scenario Permalinks."
        canonical="/tools/chop-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Final Table Chop Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Final Table Deal &amp; ICM Chop Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> An <strong>Independent Chip Model (ICM) Chop</strong> Recursively Computes Each Seat Exact Probability Of Finishing In Every Remaining Payout Spot Using The Malmuth-Harville Theorem, Whereas A <strong>Linear Chip Chop</strong> Awards Everyone Last-Place Money And Splits The Surplus Strictly By Chip Percentage. Adding A <strong>10% Winner Save Amount</strong> Locks Up Immediate Equity While Preserving Championship Competition.
          </p>
        )}

        {/* Interactive Final Table Deal Panel */}
        <section
          aria-label="Interactive Final Table Chop Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: 0 }}>
              Interactive Final Table ICM Vs. Chip Chop Solver
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                onClick={handleCopyScenarioLink}
                style={{
                  padding: '8px 14px',
                  background: copiedLink ? '#059669' : '#25c8ff',
                  color: '#020608',
                  border: 0,
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {copiedLink ? 'Copied Scenario Link!' : 'Copy Shareable Scenario Link'}
              </button>
              <button
                type="button"
                onClick={handleCopyDealSummary}
                style={{
                  padding: '8px 14px',
                  background: copiedSummary ? '#059669' : '#020608',
                  color: '#f2b84b',
                  border: '1px solid #f2b84b',
                  borderRadius: '2px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copiedSummary ? 'Copied Deal Summary!' : 'Copy Final Table Deal Summary'}
              </button>
            </div>
          </div>

          {/* Top Controls: Remaining Players & Optional Save Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Remaining Final Table Players (2 To 6)
                <select
                  value={playerCount}
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value={2}>2 Players (Heads-Up Deal)</option>
                  <option value={3}>3 Players (3-Handed Podium)</option>
                  <option value={4}>4 Players (4-Handed Final Table)</option>
                  <option value={5}>5 Players (5-Handed Final Table)</option>
                  <option value={6}>6 Players (6-Max Final Table)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Optional Save Amount For Winner ($0 To $50,000)
                <input
                  type="number"
                  min="0"
                  max="50000"
                  step="100"
                  value={saveAmount}
                  onChange={(e) => setSaveAmount(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f2b84b',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          {/* Seat Stacks & Scheduled Payouts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, marginBottom: 22 }}>
            {Array.from({ length: dealMetrics.safeCount }).map((_, idx) => (
              <div
                key={`seat-input-${idx + 1}`}
                style={{
                  background: '#020608',
                  border: '1px solid #1e293b',
                  borderRadius: '2px',
                  padding: 14,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>
                  Seat #{idx + 1} Chip Stack
                  <input
                    type="number"
                    min="1"
                    step="5000"
                    value={stacks[idx]}
                    onChange={(e) => handleStackChange(idx, e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#101a20',
                      color: '#f8fafc',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                </label>

                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#f2b84b' }}>
                  Place #{idx + 1} Payout ($)
                  <input
                    type="number"
                    min="0"
                    step="250"
                    value={payouts[idx]}
                    onChange={(e) => handlePayoutChange(idx, e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#101a20',
                      color: '#34d399',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          {/* KPI Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Remaining Prize Pool
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${dealMetrics.totalPrizePool.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Guaranteed Floor: ${dealMetrics.minPayout.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Trophy Save Set Aside
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                ${dealMetrics.safeSave.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Chopped Immediately: ${dealMetrics.poolAfterSave.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Chips In Play
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {dealMetrics.totalChips.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Average Stack: {Math.round(dealMetrics.totalChips / dealMetrics.safeCount).toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* Side-By-Side Comparison Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', color: '#94a3b8' }}>
                Side-By-Side Final Table Deal Comparison: Exact Malmuth-Harville ICM Vs. Linear Chip Chop Vs. Save-Amount Hybrid
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Seat</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Stack (%)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Original Payout</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Exact ICM Chop ($)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Linear Chip Chop ($)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Save-Amount Chop ($)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>ICM Vs Chip Chop Delta</th>
                </tr>
              </thead>
              <tbody>
                {dealMetrics.rows.map((row) => (
                  <tr key={row.seat} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>
                      Seat #{row.seat}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                      {row.stack.toLocaleString('en-US')} ({row.chipPct}%)
                    </td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                      ${row.scheduledPrize.toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#25c8ff' }}>
                      ${row.icmChop.toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#cbd5e1' }}>
                      ${row.chipChop.toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#f2b84b' }}>
                      ${row.saveChop.toLocaleString('en-US')}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        fontWeight: 700,
                        color: row.deltaIcmVsChip >= 0 ? '#34d399' : '#f87171',
                      }}
                    >
                      {row.deltaIcmVsChip >= 0 ? '+' : '-'}${Math.abs(row.deltaIcmVsChip).toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Final Table Deal Negotiation Benchmarks: ICM Vs. Chip Chop
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How Stack Distribution Affects Malmuth-Harville ICM Equity Compared To Linear Chip Chop Formulas
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Final Table Configuration</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Exact ICM Allocation</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Linear Chip Chop Allocation</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Mathematical Bias</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Negotiation Strategy</th>
                </tr>
              </thead>
              <tbody>
                {CHOP_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.icmShare}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.chipChopShare}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.winnerBias}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.negotiationNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Tournament ICM &amp; Payout Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Full Tournament ICM &amp; Bubble Factor Solver
            </Link>
            <Link href="/tools/payout-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              TDA Tournament Payout Calculator
            </Link>
            <Link href="/tools/staking-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Staking &amp; Markup Split Calculator
            </Link>
            <Link href="/tools/poker-tax-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              US Poker Tax &amp; Form W-2G Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={CHOP_CALCULATOR_FAQS} />

            <CitationBacklinkBox
              title="Final Table Deal & ICM Chop Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Final Table ICM Deal Engine"
              badgeValue="ICM Vs. Chip Chop & Save Solver"
              summary="Interactive Final Table Deal Calculator Comparing Exact Malmuth-Harville ICM Chop, Linear Chip Chop, And Hybrid Save-Amount Payouts."
              slug="chop-calculator"
            />

            <AiPromptLauncher
              title="Final Table Deal & ICM Chop Calculator"
              canonicalUrl={canonicalUrl}
              markdownUrl={`${canonicalUrl}.md`}
            />
          </>
        )}
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = String(req?.headers?.accept || '');
  if (
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    accept.includes('text/markdown') ||
    req?.url?.includes('format=md')
  ) {
    const renderToolDocumentationMarkdown = () =>
      renderChopCalculatorMarkdown({
        stacks: query?.stacks,
        payouts: query?.payouts,
        save: query?.save,
      });
    const md = renderToolDocumentationMarkdown('chop-calculator');
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}
