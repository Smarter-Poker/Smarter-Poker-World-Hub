/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MULTI-STREET BARREL EV & CUMULATIVE FOLD-EQUITY SOLVER
 *  (pages/tools/multi-street-ev-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Flop-Turn-River Double & Triple-Barrel Cumulative Fold-Equity, Pot-Growth
 * Geometry, and Multi-Street Bluff Breakeven Solver.
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

const MULTI_STREET_PRESETS = [
  {
    id: 'std_triple_barrel_33_75_100',
    label: 'GTO Triple Barrel: 33% Flop -> 75% Turn -> 100% River (12% Draw Eq)',
    pot: 6.5,
    fBet: 33,
    fFold: 32,
    tBet: 75,
    tFold: 42,
    rBet: 100,
    rFold: 48,
    eq: 12,
  },
  {
    id: 'overbet_scare_card_line',
    label: 'Turn Scare Card + River 150% Overbet Jam (33% -> 66% -> 150%)',
    pot: 8.5,
    fBet: 33,
    fFold: 28,
    tBet: 66,
    tFold: 40,
    rBet: 150,
    rFold: 58,
    eq: 8,
  },
  {
    id: 'three_bet_pot_barrels',
    label: '3-Bet Pot Double Barrel + River All-In (25% -> 50% -> 85%)',
    pot: 21.5,
    fBet: 25,
    fFold: 24,
    tBet: 50,
    tFold: 38,
    rBet: 85,
    rFold: 46,
    eq: 15,
  },
  {
    id: 'sticky_station_warning',
    label: 'Vs Calling Station: High Bet Sizes With Low River Folds (22% River Fold)',
    pot: 10.0,
    fBet: 50,
    fFold: 25,
    tBet: 75,
    tFold: 30,
    rBet: 100,
    rFold: 22,
    eq: 6,
  },
];

const BARREL_BENCHMARK_TABLE = [
  {
    line: '33% Flop -> 66% Turn -> 75% River',
    potGrowth: '1.0x -> 1.66x -> 3.85x -> 9.63x Initial Pot',
    perStreetMdf: '75.0% -> 60.2% -> 57.1% MDF',
    cumulativeContinue: '25.8% Of Flop Range Reaches Showdown',
    cumulativeFold: '74.2% Cumulative Fold Equity',
  },
  {
    line: '33% Flop -> 75% Turn -> 100% River',
    potGrowth: '1.0x -> 1.66x -> 4.15x -> 12.45x Initial Pot',
    perStreetMdf: '75.0% -> 57.1% -> 50.0% MDF',
    cumulativeContinue: '21.4% Of Flop Range Reaches Showdown',
    cumulativeFold: '78.6% Cumulative Fold Equity',
  },
  {
    line: '50% Flop -> 75% Turn -> 125% River Overbet',
    potGrowth: '1.0x -> 2.00x -> 5.00x -> 16.25x Initial Pot',
    perStreetMdf: '66.7% -> 57.1% -> 44.4% MDF',
    cumulativeContinue: '16.9% Of Flop Range Reaches Showdown',
    cumulativeFold: '83.1% Cumulative Fold Equity',
  },
];

const MULTI_STREET_FAQS = [
  {
    question: 'How Do You Calculate Cumulative Fold Equity Across A 3-Street Triple Barrel?',
    answer:
      'Multiply Villain Continuing Frequencies Across All Three Streets: Reach_Showdown = (1 - Flop_Fold) * (1 - Turn_Fold) * (1 - River_Fold). Cumulative Fold Equity Equals 1 - Reach_Showdown. Even If An Opponent Only Folds 30% On The Flop, 40% On The Turn, And 48% On The River, They Fold 78.2% Cumulatively Across All Three Barrels.',
  },
  {
    question: 'Why Does A Failed River Barrel Cost So Much More Than A Failed Flop C-Bet?',
    answer:
      'Because Each Called Street Multiplies The Pot By (1 + 2 * Bet_Fraction), The River Bet Is Fired Into A Pot That Is 4x To 6x Larger Than The Flop Pot. Even If Cumulative Fold Equity Exceeds 75%, A Low River Fold Frequency Against A Calling Station Destroys The Entire Multi-Street Line EV.',
  },
  {
    question: 'What Is The Exact GTO Compound Minimum Defense Frequency From Flop To River?',
    answer:
      'Against A Standard 33% Flop, 75% Turn, And 100% River Triple Barrel, A Defender Adhering Strictly To Per-Street MDF (75.0% * 57.1% * 50.0%) Can Only Bring 21.4% Of Their Initial Flop Range To River Showdown.',
  },
];

export default function MultiStreetEvCalculatorPage({
  initialPot = 6.5,
  initialFBet = 33,
  initialFFold = 32,
  initialTBet = 75,
  initialTFold = 42,
  initialRBet = 100,
  initialRFold = 48,
  initialEq = 12,
}) {
  const router = useRouter();
  const [pot, setPot] = useState(initialPot);
  const [fBet, setFBet] = useState(initialFBet);
  const [fFold, setFFold] = useState(initialFFold);
  const [tBet, setTBet] = useState(initialTBet);
  const [tFold, setTFold] = useState(initialTFold);
  const [rBet, setRBet] = useState(initialRBet);
  const [rFold, setRFold] = useState(initialRFold);
  const [eq, setEq] = useState(initialEq);
  const [activePresetId, setActivePresetId] = useState('std_triple_barrel_33_75_100');

  useSolvedSpotUrlSync(
    { pot, fBet, fFold, tBet, tFold, rBet, rFold, eq },
    {
      pot: (v) => setPot(Math.max(0.5, Number(v) || 6.5)),
      fBet: (v) => setFBet(Math.max(10, Math.min(300, Number(v) || 33))),
      fFold: (v) => setFFold(Math.max(0, Math.min(95, Number(v) || 32))),
      tBet: (v) => setTBet(Math.max(10, Math.min(300, Number(v) || 75))),
      tFold: (v) => setTFold(Math.max(0, Math.min(95, Number(v) || 42))),
      rBet: (v) => setRBet(Math.max(10, Math.min(300, Number(v) || 100))),
      rFold: (v) => setRFold(Math.max(0, Math.min(95, Number(v) || 48))),
      eq: (v) => setEq(Math.max(0, Math.min(100, Number(v) || 12))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPot(preset.pot);
    setFBet(preset.fBet);
    setFFold(preset.fFold);
    setTBet(preset.tBet);
    setTFold(preset.tFold);
    setRBet(preset.rBet);
    setRFold(preset.rFold);
    setEq(preset.eq);
  };

  const metrics = useMemo(() => {
    const P0 = Math.max(0.5, Number(pot) || 6.5);
    const fbPct = Math.max(10, Math.min(300, Number(fBet) || 33)) / 100;
    const ffDec = Math.max(0, Math.min(95, Number(fFold) ?? 32)) / 100;
    const tbPct = Math.max(10, Math.min(300, Number(tBet) || 75)) / 100;
    const tfDec = Math.max(0, Math.min(95, Number(tFold) ?? 42)) / 100;
    const rbPct = Math.max(10, Math.min(300, Number(rBet) || 100)) / 100;
    const rfDec = Math.max(0, Math.min(95, Number(rFold) ?? 48)) / 100;
    const eqDec = Math.max(0, Math.min(100, Number(eq) ?? 12)) / 100;

    // Street 1: Flop
    const B1 = P0 * fbPct;
    const P1 = P0 + 2 * B1;
    const B2 = P1 * tbPct;
    const P2 = P1 + 2 * B2;
    const B3 = P2 * rbPct;
    const P3 = P2 + 2 * B3;

    const pFlopFold = ffDec;
    const pTurnReach = 1 - ffDec;
    const pTurnFold = pTurnReach * tfDec;
    const pRiverReach = pTurnReach * (1 - tfDec);
    const pRiverFold = pRiverReach * rfDec;
    const pShowdown = pRiverReach * (1 - rfDec);
    const cumulativeFoldPct = (1 - pShowdown) * 100;

    // Net profit in each branch relative to P0 start:
    // 1. Villain folds on Flop: Hero wins +P0
    // 2. Villain calls Flop (+B1), folds on Turn: Hero wins +(P0 + B1)
    // 3. Villain calls Flop (+B1) & Turn (+B2), folds on River: Hero wins +(P0 + B1 + B2)
    // 4. Villain calls all 3 streets: Hero wins eqDec * P3 - (B1 + B2 + B3)
    const totalHeroInvestedAll3 = B1 + B2 + B3;
    const evBranch1 = pFlopFold * P0;
    const evBranch2 = pTurnFold * (P0 + B1);
    const evBranch3 = pRiverFold * (P0 + B1 + B2);
    const evBranch4 = pShowdown * (eqDec * P3 - totalHeroInvestedAll3);
    const totalLineEv = evBranch1 + evBranch2 + evBranch3 + evBranch4;

    return {
      P0: P0.toFixed(1),
      B1: B1.toFixed(1),
      P1: P1.toFixed(1),
      B2: B2.toFixed(1),
      P2: P2.toFixed(1),
      B3: B3.toFixed(1),
      P3: P3.toFixed(1),
      totalHeroInvestedAll3: totalHeroInvestedAll3.toFixed(1),
      cumulativeFoldPct: cumulativeFoldPct.toFixed(1),
      showdownReachPct: (pShowdown * 100).toFixed(1),
      totalLineEv: totalLineEv.toFixed(2),
      isPositiveEv: totalLineEv >= 0,
    };
  }, [pot, fBet, fFold, tBet, tFold, rBet, rFold, eq]);

  const canonicalPath = '/tools/multi-street-ev-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Multi-Street Barrel EV Solver';
  const pageDesc =
    'Calculate Flop-Turn-River Double And Triple-Barrel Cumulative Fold Equity, Street-By-Street Pot Growth Geometry, And Total Multi-Street Bluff Expected Value.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Multi-Street Triple-Barrel Fold Equity & EV Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Multi-Street Barrel EV Solver', canonicalPath],
      ],
      faqs: MULTI_STREET_FAQS,
      howTo: {
        name: 'How To Calculate Cumulative Fold Equity And Triple-Barrel Expected Value',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Starting Flop Pot And Street-By-Street Bet Percentages',
            text: 'Set The Flop Pot Size And Your Planned Flop, Turn, And River Bet Percentages Of Pot.',
          },
          {
            name: 'Input Villain Street Fold Percentages And Hero Showdown Equity',
            text: 'Estimate Villain Fold Frequencies On Each Street And Your Residual Draw Equity When Called.',
          },
          {
            name: 'Evaluate Cumulative Fold Equity, Final River Pot, And Net Line EV',
            text: 'Inspect Whether Cumulative Fold Equity And Draw Realization Produce A +EV Multi-Street Barrel.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Triple Barrel Into ${metrics.P0} BB Pot (${fBet}%/${tBet}%/${rBet}% Sizing, ${fFold}%/${tFold}%/${rFold}% Folds, ${eq}% Eq): Cumulative Fold Equity = ${metrics.cumulativeFoldPct}% | Final River Pot = ${metrics.P3} BB | Total Line EV = ${metrics.isPositiveEv ? '+' : ''}${metrics.totalLineEv} BB`;
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
            <span>Multi-Street Barrel EV Solver</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Multi-Street Double &amp; Triple-Barrel Cumulative Fold-Equity &amp; EV Solver
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Cumulative Fold Equity Across Three Streets Equals <strong>1 - ((1 - F<sub>Flop</sub>) &times; (1 - F<sub>Turn</sub>) &times; (1 - F<sub>River</sub>))</strong>. While Three Modest Street Fold Rates (32%, 42%, And 48%) Combine For <strong>79.5% Cumulative Fold Equity</strong>, The Exponentially Growing River Bet Demands Sufficient River Fold Frequency To Remain +EV.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Multi-Street Barrel EV Solver"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={MULTI_STREET_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Multi-Street Barrel EV Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure Flop, Turn &amp; River Bet Percentages And Fold Frequencies
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Starting Flop Pot (BB Or $)', val: pot, set: setPot, step: 0.5, color: '#25c8ff' },
              { label: 'Flop Bet Sizing (% Of Pot)', val: fBet, set: setFBet, step: 5, color: '#25c8ff' },
              { label: 'Villain Flop Fold (%)', val: fFold, set: setFFold, step: 2, color: '#34d399' },
              { label: 'Turn Bet Sizing (% Of Pot)', val: tBet, set: setTBet, step: 5, color: '#25c8ff' },
              { label: 'Villain Turn Fold (%)', val: tFold, set: setTFold, step: 2, color: '#34d399' },
              { label: 'River Bet Sizing (% Of Pot)', val: rBet, set: setRBet, step: 5, color: '#25c8ff' },
              { label: 'Villain River Fold (%)', val: rFold, set: setRFold, step: 2, color: '#34d399' },
              { label: 'Hero Equity When Called (%)', val: eq, set: setEq, step: 1, color: '#38bdf8' },
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                3-Street Cumulative Fold Equity
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.cumulativeFoldPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Only {metrics.showdownReachPct}% Reaches River Showdown
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Street Bet Progression
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.B1} -&gt; {metrics.B2} -&gt; {metrics.B3} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Total Risked Across 3 Barrels: {metrics.totalHeroInvestedAll3} BB
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Final Called River Pot
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {metrics.P3} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Turn Pot: {metrics.P1} BB | River Start Pot: {metrics.P2} BB
              </div>
            </div>

            <div
              style={{
                background: '#020608',
                padding: 16,
                borderRadius: '2px',
                border: `1px solid ${metrics.isPositiveEv ? '#34d399' : '#f87171'}`,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Multi-Street Line EV
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: metrics.isPositiveEv ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                {metrics.isPositiveEv ? '+' : ''}{metrics.totalLineEv} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.isPositiveEv ? '+EV Multi-Street Barrel Line' : '-EV Barrel: Abort Early Or Check'}
              </div>
            </div>
          </div>
        </section>

        {!isEmbed && (
          <div style={{ marginBottom: 32 }}>
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context="tools-multi-street-ev-calculator"
              redirectPath={canonicalPath}
            />
          </div>
        )}

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            GTO Multi-Street Pot-Growth &amp; Compound MDF Reference Table
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exponential Pot Growth And Cumulative Fold Equity Under Equilibrium Per-Street MDF
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>3-Street Sizing Line</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot-Growth Multipliers</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Per-Street MDF</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Showdown Reach</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Cumulative Fold %</th>
                </tr>
              </thead>
              <tbody>
                {BARREL_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.line} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.line}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.potGrowth}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.perStreetMdf}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.cumulativeContinue}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.cumulativeFold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Postflop &amp; Geometric Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/geometric-bet-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Geometric 2e/3e Overbet Planner
            </Link>
            <Link href="/tools/bluff-catching-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#38bdf8', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              River Bluff-Catching Solver
            </Link>
            <Link href="/tools/board-texture-analyzer" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Flop Board Texture Analyzer
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
              title="Save Triple-Barrel EV Lines & Drill Postflop GTO Free"
              description="Bookmark Multi-Street Fold-Equity Calculations And Practice Bluff Lines In 107 Free GTO Games."
              primaryLabel="Create Free Account"
              primaryHref="/auth/signup?redirect=/tools/multi-street-ev-calculator&src=multi-street-ev"
              secondaryLabel="Sign In"
              secondaryHref="/auth/login?redirect=/tools/multi-street-ev-calculator"
            />

            <FaqSection faqs={MULTI_STREET_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Multi-Street Barrel EV Solver"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Triple-Barrel Engine"
              badgeValue="Cumulative Fold Equity & EV"
              summary="Calculates Flop-Turn-River Double And Triple-Barrel Cumulative Fold Equity, Pot Growth Geometry, And Total Line EV."
              slug="multi-street-ev-calculator"
            />

            <AiPromptLauncher
              title="Multi-Street Barrel EV Solver"
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
    const md = renderHubToolMarkdown('/tools/multi-street-ev-calculator', query);
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
      initialPot: Number(query?.pot) || 6.5,
      initialFBet: Number(query?.fBet) || 33,
      initialFFold: query?.fFold !== undefined ? Number(query.fFold) : 32,
      initialTBet: Number(query?.tBet) || 75,
      initialTFold: query?.tFold !== undefined ? Number(query.tFold) : 42,
      initialRBet: Number(query?.rBet) || 100,
      initialRFold: query?.rFold !== undefined ? Number(query.rFold) : 48,
      initialEq: query?.eq !== undefined ? Number(query.eq) : 12,
    },
  };
}
