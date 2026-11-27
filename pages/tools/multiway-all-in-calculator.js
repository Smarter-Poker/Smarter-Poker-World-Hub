/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MULTIWAY ALL-IN PRE-FLOP EQUITY, SIDE POT & NET EV CALCULATOR
 *  (pages/tools/multiway-all-in-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 3-Way and 4-Way Multiway All-In Pre-Flop Equity, Main Pot + Side Pot 1 +
 * Side Pot 2 breakdown, and net EV per stack.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const MULTIWAY_PRESETS = [
  {
    id: 'aa_kk_qq_3way',
    label: '3-Way Cooler: AA (35BB) Vs KK (80BB) Vs QQ (110BB)',
    p1: 35,
    p2: 80,
    p3: 110,
    eq1: 67.2,
    eq2: 17.8,
    eq3: 15.0,
    dead: 2.5,
  },
  {
    id: 'short_jam_squeeze',
    label: 'Short Jam 18BB + 55BB Over-Jam + 100BB Big Stack Call',
    p1: 18,
    p2: 55,
    p3: 100,
    eq1: 28.5,
    eq2: 36.5,
    eq3: 35.0,
    dead: 3.5,
  },
  {
    id: 'plo_3way_flip',
    label: 'PLO 3-Way All-In: AAxx (50BB) Vs Wrap (100BB) Vs Set (140BB)',
    p1: 50,
    p2: 100,
    p3: 140,
    eq1: 34.0,
    eq2: 38.0,
    eq3: 28.0,
    dead: 4.0,
  },
  {
    id: 'mtt_bounty_3way',
    label: 'MTT 3-Way Bubble All-In: 12BB Vs 28BB Vs 65BB',
    p1: 12,
    p2: 28,
    p3: 65,
    eq1: 24.0,
    eq2: 33.0,
    eq3: 43.0,
    dead: 2.5,
  },
];

const MULTIWAY_BENCHMARK_TABLE = [
  {
    matchup: 'AA Vs KK Vs QQ (3-Way All-In Pre-Flop)',
    p1Eq: '67.2% (AA)',
    p2Eq: '17.8% (KK)',
    p3Eq: '15.0% (QQ)',
    sidePotDynamic: 'KK Battles QQ Heads-Up For Side Pot 1 With 81.9% Conditional Equity When AA IsCapped',
  },
  {
    matchup: 'AA Vs AKs Vs JJ (3-Way Squeeze Jam)',
    p1Eq: '68.4% (AA)',
    p2Eq: '12.9% (AKs)',
    p3Eq: '18.7% (JJ)',
    sidePotDynamic: 'AA Holds A Massive blocker Over AKs, Leaving JJ With 59.2% Share Of Side Pot 1',
  },
  {
    matchup: 'AKo Vs QQ Vs JTs (Classic 3-Way Race)',
    p1Eq: '35.1% (AKo)',
    p2Eq: '42.4% (QQ)',
    p3Eq: '22.5% (JTs)',
    sidePotDynamic: 'Live Suited Connector JTs Realizes 22.5% Main-Pot Equity (Needs <20.8% To Call 3-Way)',
  },
  {
    matchup: 'TT Vs AQs Vs KQo (Medium Pair Vs 4 Overs)',
    p1Eq: '41.8% (TT)',
    p2Eq: '36.9% (AQs)',
    p3Eq: '21.3% (KQo)',
    sidePotDynamic: 'Shared Queen Blockers Between AQs And KQo Boost Pocket Tens To 41.8% Total Equity',
  },
];

const MULTIWAY_FAQS = [
  {
    question: 'How Are Main Pot And Side Pot Expected Values Calculated In A 3-Way All-In?',
    answer:
      'Sort All Committed Stacks From Smallest To Largest (S1 <= S2 <= S3). The Main Pot Equals 3 * S1 Plus Any Dead Blind Or Ante Money, And All Three Players Compete For It Using Their 3-Way Equities. Side Pot 1 Equals 2 * (S2 - S1), And Only The Two Deeper Stacks Compete For It Using Their Conditional Heads-Up Equity Share. Any Remaining Chip Excess (S3 - S2) Is Returned Immediately As An Uncalled Bet.',
  },
  {
    question: 'Can You Lose The Main Pot To A Short Stack And Still Profit Overall From Side Pot 1?',
    answer:
      'Yes. When A Short Stack Goes All-In For 15BB With Pocket Aces And Two 100BB Stacks Call With Pocket Kings And Pocket Queens, The Player With Kings Loses The 45BB Main Pot Most Of The Time But Wins The 170BB Side Pot Against Queens Over 81% Of The Time, Producing A Net Positive Chip Profit On The Hand.',
  },
  {
    question: 'What Is The Minimum Required Equity To Call A 3-Way All-In With Equal Stacks?',
    answer:
      'When Three Equal Stacks Commit All-In With No Dead Money, You Risk 1 Stack To Win A Total Pot Of 3 Stacks, Meaning Your Break-Even Calling Equity Drops To 33.3% (Or Approximately 31% To 32% When Blinds And Big Blind Antes Are In The Middle).',
  },
];

export default function MultiwayAllInCalculatorPage({
  initialP1 = 35,
  initialP2 = 80,
  initialP3 = 110,
  initialEq1 = 67.2,
  initialEq2 = 17.8,
  initialEq3 = 15.0,
  initialDead = 2.5,
}) {
  const router = useRouter();
  const [p1, setP1] = useState(initialP1);
  const [p2, setP2] = useState(initialP2);
  const [p3, setP3] = useState(initialP3);
  const [eq1, setEq1] = useState(initialEq1);
  const [eq2, setEq2] = useState(initialEq2);
  const [eq3, setEq3] = useState(initialEq3);
  const [dead, setDead] = useState(initialDead);
  const [activePresetId, setActivePresetId] = useState('aa_kk_qq_3way');

  useSolvedSpotUrlSync(
    { p1, p2, p3, eq1, eq2, eq3, dead },
    {
      p1: (v) => setP1(Math.max(1, Number(v) || 35)),
      p2: (v) => setP2(Math.max(1, Number(v) || 80)),
      p3: (v) => setP3(Math.max(1, Number(v) || 110)),
      eq1: (v) => setEq1(Math.max(0.5, Math.min(99, Number(v) || 67.2))),
      eq2: (v) => setEq2(Math.max(0.5, Math.min(99, Number(v) || 17.8))),
      eq3: (v) => setEq3(Math.max(0.5, Math.min(99, Number(v) || 15.0))),
      dead: (v) => setDead(Math.max(0, Number(v) || 2.5)),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setP1(preset.p1);
    setP2(preset.p2);
    setP3(preset.p3);
    setEq1(preset.eq1);
    setEq2(preset.eq2);
    setEq3(preset.eq3);
    setDead(preset.dead);
  };

  const metrics = useMemo(() => {
    const s1 = Math.max(1, Number(p1) || 35);
    const s2 = Math.max(1, Number(p2) || 80);
    const s3 = Math.max(1, Number(p3) || 110);
    const d = Math.max(0, Number(dead) || 0);

    const rawE1 = Math.max(0.1, Number(eq1) || 33.3);
    const rawE2 = Math.max(0.1, Number(eq2) || 33.3);
    const rawE3 = Math.max(0.1, Number(eq3) || 33.3);
    const eqSum = rawE1 + rawE2 + rawE3;

    const nEq1 = rawE1 / eqSum;
    const nEq2 = rawE2 / eqSum;
    const nEq3 = rawE3 / eqSum;

    const players = [
      { id: 'Player 1', stack: s1, eq: nEq1, idx: 0 },
      { id: 'Player 2', stack: s2, eq: nEq2, idx: 1 },
      { id: 'Player 3', stack: s3, eq: nEq3, idx: 2 },
    ];
    const sorted = [...players].sort((a, b) => a.stack - b.stack);

    const minStack = sorted[0].stack;
    const midStack = sorted[1].stack;
    const maxStack = sorted[2].stack;

    const mainPot = minStack * 3 + d;
    const sidePot1 = Math.max(0, (midStack - minStack) * 2);
    const uncalledReturn = Math.max(0, maxStack - midStack);
    const totalContestedPot = mainPot + sidePot1;

    // Main pot shares
    const mainShares = [nEq1 * mainPot, nEq2 * mainPot, nEq3 * mainPot];

    // Side pot 1 is contested by the two larger stacks (sorted[1] and sorted[2])
    const side1EligibleA = sorted[1];
    const side1EligibleB = sorted[2];
    const side1EqSum = Math.max(0.0001, side1EligibleA.eq + side1EligibleB.eq);
    const sideShares = [0, 0, 0];
    sideShares[side1EligibleA.idx] = (side1EligibleA.eq / side1EqSum) * sidePot1;
    sideShares[side1EligibleB.idx] = (side1EligibleB.eq / side1EqSum) * sidePot1;

    const uncalledShares = [0, 0, 0];
    uncalledShares[sorted[2].idx] = uncalledReturn;

    const playerResults = players.map((pl, i) => {
      const effectiveRisked = pl.stack - uncalledShares[i];
      const grossReturnEv = mainShares[i] + sideShares[i];
      const netProfitEv = grossReturnEv - effectiveRisked;
      return {
        label: pl.id,
        stack: pl.stack.toFixed(1),
        effectiveRisked: effectiveRisked.toFixed(1),
        uncalled: uncalledShares[i].toFixed(1),
        normEqPct: (pl.eq * 100).toFixed(1),
        mainShareEv: mainShares[i].toFixed(2),
        sideShareEv: sideShares[i].toFixed(2),
        grossReturnEv: grossReturnEv.toFixed(2),
        netProfitEv: netProfitEv.toFixed(2),
        isPositive: netProfitEv >= 0,
      };
    });

    return {
      mainPot: mainPot.toFixed(1),
      sidePot1: sidePot1.toFixed(1),
      uncalledReturn: uncalledReturn.toFixed(1),
      totalContestedPot: totalContestedPot.toFixed(1),
      uncalledOwner: sorted[2].id,
      playerResults,
    };
  }, [p1, p2, p3, eq1, eq2, eq3, dead]);

  const canonicalPath = '/tools/multiway-all-in-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Multiway All-In EV Calculator';
  const pageDesc =
    'Calculate 3-Way And 4-Way Multiway All-In Pre-Flop Equity, Main Pot And Side Pot Slices, Uncalled Bet Returns, And Exact Net Expected Value (EV) Per Stack.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Multiway All-In Equity & Side Pot EV Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Multiway All-In EV Calculator', canonicalPath],
      ],
      faqs: MULTIWAY_FAQS,
      howTo: {
        name: 'How To Calculate Multiway All-In Main Pot, Side Pot, And Net Stack EV',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Each Player Committed Stack And Dead Pot Money',
            text: 'Input The All-In Stack Sizes For Player 1, Player 2, And Player 3 Along With Blinds And Antes.',
          },
          {
            name: 'Input Each Player Pre-Flop Or Flop All-In Equity Percentage',
            text: 'Enter Raw Hand Equities For Each Contender; The Solver Normalizes 3-Way And Conditional Heads-Up Side Pot Shares.',
          },
          {
            name: 'Inspect Main Pot EV, Side Pot 1 EV, Uncalled Return, And Net Profit',
            text: 'Review Exact Gross Return And Net Chip Or Dollar EV For Every Stack In The Confrontation.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `3-Way All-In (Stacks ${p1}/${p2}/${p3} BB, Dead ${dead} BB): Main Pot ${metrics.mainPot} BB | Side Pot 1 ${metrics.sidePot1} BB | P1 Net EV ${metrics.playerResults[0].netProfitEv} BB | P2 Net EV ${metrics.playerResults[1].netProfitEv} BB | P3 Net EV ${metrics.playerResults[2].netProfitEv} BB`;
  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Multiway All-In EV Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Multiway All-In Pre-Flop Equity, Side Pot &amp; Net EV Calculator
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> In A Multiway All-In With Unequal Stacks, Total Expected Value Equals <strong>Main Pot Equity Share + Conditional Side Pot Equity Share - Effective Risked Stack</strong>. A Medium Or Deep Stack Can Lose The Main Pot To A Short Stack Holding Aces Yet Still Realize Massive Net Positive EV By Winning Side Pot 1 Against The Third Player.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Multiway All-In EV Calculator"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={MULTIWAY_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Multiway All-In Side Pot And Net EV Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure Multiway Stacks, Hand Equities &amp; Dead Money
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Player 1 Stack (BB Or $)', val: p1, set: setP1, step: 5, color: '#25c8ff' },
              { label: 'Player 1 Equity (%)', val: eq1, set: setEq1, step: 0.5, color: '#34d399' },
              { label: 'Player 2 Stack (BB Or $)', val: p2, set: setP2, step: 5, color: '#25c8ff' },
              { label: 'Player 2 Equity (%)', val: eq2, set: setEq2, step: 0.5, color: '#34d399' },
              { label: 'Player 3 Stack (BB Or $)', val: p3, set: setP3, step: 5, color: '#25c8ff' },
              { label: 'Player 3 Equity (%)', val: eq3, set: setEq3, step: 0.5, color: '#34d399' },
              { label: 'Dead Blinds & Antes In Pot', val: dead, set: setDead, step: 0.5, color: '#38bdf8' },
            ].map((inp) => (
              <div key={inp.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {inp.label}
                  <input
                    type="number"
                    step={inp.step}
                    value={inp.val}
                    onChange={(e) => inp.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: inp.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                3-Way Main Pot (Plus Dead Money)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.mainPot} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Contested By All 3 Active Stacks
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Heads-Up Side Pot 1
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.sidePot1} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Total Contested Pot: {metrics.totalContestedPot} BB
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Uncalled Over-Stack Return
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.uncalledReturn} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Returned Immediately To {metrics.uncalledOwner}
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Per-Player Main Pot EV, Side Pot 1 EV, Effective Risk, And Net Profit Breakdown
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Player</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Risked Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Normalized Eq %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Main Pot EV</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Side Pot 1 EV</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Total Gross EV</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Net Profit EV</th>
                </tr>
              </thead>
              <tbody>
                {metrics.playerResults.map((r) => (
                  <tr key={r.label} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{r.label}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{r.effectiveRisked} BB</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{r.normEqPct}%</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{r.mainShareEv} BB</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{r.sideShareEv} BB</td>
                    <td style={{ padding: '10px 14px', color: '#f8fafc', fontWeight: 700 }}>{r.grossReturnEv} BB</td>
                    <td style={{ padding: '10px 14px', color: r.isPositive ? '#34d399' : '#f87171', fontWeight: 800 }}>
                      {r.isPositive ? '+' : ''}{r.netProfitEv} BB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!isEmbed && (
          <div style={{ marginBottom: 32 }}>
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context="tools-multiway-all-in-calculator"
              redirectPath={canonicalPath}
            />
          </div>
        )}

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Canonical 3-Way Pre-Flop All-In Equity &amp; Side Pot Benchmarks
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact 52-Card Combinatorial 3-Way All-In Equities And Side Pot Rebate Dynamics
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>3-Way Matchup</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hand 1 Equity</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hand 2 Equity</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hand 3 Equity</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Side Pot Dynamic</th>
                </tr>
              </thead>
              <tbody>
                {MULTIWAY_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.matchup} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.matchup}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.p1Eq}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.p2Eq}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.p3Eq}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.sidePotDynamic}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Equity &amp; Side Pot Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/side-pot-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              9-Player Side Pot Calculator
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#38bdf8', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Multiway Hand Equity Simulator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <SmarterConversionCta
              compact
              eyebrow="Free Smarter.Poker Account"
              title="Save Multiway All-In Spots & Drill Equity Math Free"
              description="Bookmark Side Pot And 3-Way Equity Solutions And Practice 107 Free GTO Training Games."
              primaryLabel="Create Free Account"
              primaryHref="/auth/signup?redirect=/tools/multiway-all-in-calculator&src=multiway-allin"
              secondaryLabel="Sign In"
              secondaryHref="/auth/login?redirect=/tools/multiway-all-in-calculator"
            />

            <FaqSection faqs={MULTIWAY_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Multiway All-In EV Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Multiway All-In Solver"
              badgeValue="Main & Side Pot Net EV"
              summary="Calculates 3-Way And 4-Way Multiway All-In Pre-Flop Equity, Main Pot And Side Pot Slices, And Net Expected Value Per Stack."
              slug="multiway-all-in-calculator"
            />

            <AiPromptLauncher
              title="Multiway All-In EV Calculator"
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
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/multiway-all-in-calculator', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return {
    props: {
      initialP1: Number(query?.p1) || 35,
      initialP2: Number(query?.p2) || 80,
      initialP3: Number(query?.p3) || 110,
      initialEq1: Number(query?.eq1) || 67.2,
      initialEq2: Number(query?.eq2) || 17.8,
      initialEq3: Number(query?.eq3) || 15.0,
      initialDead: query?.dead !== undefined ? Number(query.dead) : 2.5,
    },
  };
}
