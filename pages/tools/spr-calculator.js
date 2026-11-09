/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER STACK-TO-POT RATIO (SPR) & GEOMETRIC BET SIZING CALCULATOR
 *  (/tools/spr-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive postflop SPR and multi-street geometric bet sizing calculator at
 * /tools/spr-calculator (and raw Markdown at /tools/spr-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const SPR_BENCHMARK_TABLE = [
  {
    spr: '1.0 SPR',
    preflopSpot: '4-Bet Pot (22BB Committed, 45BB Flop Pot)',
    geo1: '100.0% Pot',
    geo2: '36.6% Pot',
    geo3: '22.1% Pot',
    commitmentRule: 'Any Top Pair, Overpair, Or 8+ Out Draw Is Automatically Committed',
  },
  {
    spr: '2.0 SPR',
    preflopSpot: 'Large 3-Bet Or Short-Stack Cash Flop',
    geo1: '200.0% Pot',
    geo2: '61.8% Pot',
    geo3: '35.5% Pot',
    commitmentRule: 'Overpairs And Top Pair Top Kicker Stack Off Profitably',
  },
  {
    spr: '4.0 SPR',
    preflopSpot: 'Standard 100BB 3-Bet Pot (10BB 3-Bet Called)',
    geo1: '400.0% Pot',
    geo2: '100.0% Pot',
    geo3: '54.0% Pot',
    commitmentRule: '54% Pot On Flop, Turn, And River Puts All 100BB In Smoothly',
  },
  {
    spr: '6.5 SPR',
    preflopSpot: 'Multiway Single-Raised Pot Or Squeeze Pot',
    geo1: '650.0% Pot',
    geo2: '137.1% Pot',
    geo3: '70.1% Pot',
    commitmentRule: 'Two Pair Or Better Required For Three Full Value Streets',
  },
  {
    spr: '13.0 SPR',
    preflopSpot: 'Heads-Up Single-Raised 100BB Cash Pot (3BB Open)',
    geo1: '1300.0% Pot',
    geo2: '209.8% Pot',
    geo3: '99.3% Pot',
    commitmentRule: 'Three Pot-Sized Bets Required To Reach All-In By The River',
  },
  {
    spr: '20.0 SPR',
    preflopSpot: 'Deepstack 150BB To 200BB Cash Game',
    geo1: '2000.0% Pot',
    geo2: '270.2% Pot',
    geo3: '121.0% Pot',
    commitmentRule: 'Nut Flushes, Sets, And Straights Dominate; One-Pair Hands Exercise Pot Control',
  },
];

const SPR_CALCULATOR_FAQS = [
  {
    question: 'How Do You Calculate Stack-To-Pot Ratio (SPR) In Poker?',
    answer:
      'Divide The Effective Remaining Chip Stack (The Smaller Stack Between The Active Contenders) By The Current Pot Size At The Start Of The Street: SPR = Effective Stack / Pot Size. A 400 Stack Into A 100 Flop Pot Equals An SPR Of 4.0.',
  },
  {
    question: 'What Is The Geometric Bet Sizing Formula In GTO Poker?',
    answer:
      'Geometric Bet Sizing Computes The Exact Constant Pot Percentage Bet (s) Required To Put All Remaining Chips Into The Pot Across N Streets: s = 0.5 * ((1 + 2 * SPR)^(1 / N) - 1). At SPR 4.0 Over 3 Streets, Geometric Sizing Is 54.0% Pot On Flop, Turn, And River.',
  },
  {
    question: 'What SPR Is Considered Stack-Committed For Top Pair Or Overpairs?',
    answer:
      'When Flop SPR Is 3.0 Or Lower (Typical In 3-Bet And 4-Bet Pots), Overpairs And Top Pair Top Kicker Are Generally Stack-Committed Against Balanced Ranges. Above SPR 8.0, One-Pair Hands Must Exercise Pot Control.',
  },
];

export default function SprCalculatorPage({
  initialPot = 100,
  initialEffectiveStack = 400,
}) {
  const [potSize, setPotSize] = useState(initialPot);
  const [effectiveStack, setEffectiveStack] = useState(initialEffectiveStack);

  const metrics = useMemo(() => {
    const safePot = Math.max(1, Number(potSize) || 100);
    const safeStack = Math.max(1, Number(effectiveStack) || 400);
    const spr = safeStack / safePot;

    const s1 = (Math.pow(1 + 2 * spr, 1) - 1) / 2;
    const s2 = (Math.pow(1 + 2 * spr, 1 / 2) - 1) / 2;
    const s3 = (Math.pow(1 + 2 * spr, 1 / 3) - 1) / 2;

    // 2-Street Progression (e.g., Flop + Turn all-in, or Turn + River all-in)
    const twoStreetBet1 = safePot * s2;
    const twoStreetPotAfter1 = safePot + 2 * twoStreetBet1;
    const twoStreetBet2 = twoStreetPotAfter1 * s2;

    // 3-Street Progression (Flop + Turn + River all-in)
    const threeStreetFlopBet = safePot * s3;
    const potOnTurn = safePot + 2 * threeStreetFlopBet;
    const threeStreetTurnBet = potOnTurn * s3;
    const potOnRiver = potOnTurn + 2 * threeStreetTurnBet;
    const threeStreetRiverBet = potOnRiver * s3;

    const zoneTitle =
      spr <= 2.5
        ? 'Low SPR Commitment Zone (SPR <= 2.5)'
        : spr <= 6.5
        ? 'Medium SPR Tactical Zone (SPR 2.5 To 6.5)'
        : 'Deep SPR Implied Odds Zone (SPR > 6.5)';

    const zoneAdvice =
      spr <= 2.5
        ? 'Top Pair Top Kicker, Overpairs, And Strong Combo Draws Are Mathematically Committed. Favor Small Geometric Bets Or Two-Street Shoves.'
        : spr <= 6.5
        ? 'Standard 3-Bet Pot Depth. Overpairs And Strong Top Pairs Play For Stacks Across Three ~50% To 70% Geometric Streets, While Speculative Draws Require Direct Equity.'
        : 'Single-Raised Deepstack Depth. Avoid Stacking Off With One-Pair Hands; Prioritize Sets, Nut Flush Draws, And Polarized Overbets Across Multiple Streets.';

    return {
      safePot,
      safeStack,
      spr: spr.toFixed(2),
      geo1Pct: (s1 * 100).toFixed(1),
      geo2Pct: (s2 * 100).toFixed(1),
      geo3Pct: (s3 * 100).toFixed(1),
      twoStreetBet1: Math.round(twoStreetBet1),
      twoStreetPotAfter1: Math.round(twoStreetPotAfter1),
      twoStreetBet2: Math.round(twoStreetBet2),
      threeStreetFlopBet: Math.round(threeStreetFlopBet),
      potOnTurn: Math.round(potOnTurn),
      threeStreetTurnBet: Math.round(threeStreetTurnBet),
      potOnRiver: Math.round(potOnRiver),
      threeStreetRiverBet: Math.round(threeStreetRiverBet),
      zoneTitle,
      zoneAdvice,
    };
  }, [potSize, effectiveStack]);

  const canonicalPath = '/tools/spr-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker SPR & Geometric Bet Sizing Calculator';
  const pageDesc =
    'Calculate Exact Poker Stack-To-Pot Ratio (SPR), Postflop Commitment Thresholds, And 1-Street, 2-Street, And 3-Street Geometric Bet Sizing Percentages Instantly.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker SPR & Geometric Bet Sizing Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Math & GTO Bet Sizing Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['SPR & Geometric Calculator', canonicalPath],
      ],
      faqs: SPR_CALCULATOR_FAQS,
      steps: [
        {
          name: 'Enter Current Pot Size And Effective Remaining Stack',
          text: 'Input The Pot At The Start Of The Flop Or Turn And The Smaller Remaining Chip Stack.',
        },
        {
          name: 'Inspect Exact SPR And Strategic Commitment Zone',
          text: 'Review Whether The Hand Falls In A Low, Medium, Or Deep SPR Commitment Zone.',
        },
        {
          name: 'Apply 2-Street Or 3-Street Geometric Bet Sizing',
          text: 'Use The Exact Street-By-Street Chip Bet Amounts To Build The Pot Smoothly To All-In.',
        },
      ],
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>SPR &amp; Geometric Sizing Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Stack-To-Pot Ratio (SPR) &amp; Geometric Bet Sizing Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Stack-To-Pot Ratio Is Calculated By Dividing The <strong>Effective Remaining Stack By The Current Pot Size</strong> (<code>SPR = Effective Stack / Pot</code>). To Put All Remaining Chips In Smoothly Using Equal Percentage Bets Across <code>N</code> Streets, GTO Solvers Use The <strong>Geometric Bet Sizing Formula</strong>: <code>S = 0.5 * ((1 + 2 * SPR)^(1 / N) - 1)</code>.
        </p>

        {/* Interactive SPR & Geometric Calculator */}
        <section
          aria-label="Interactive SPR & Geometric Bet Sizing Calculator"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', margin: '0 0 18px 0' }}>
            Interactive SPR &amp; Multi-Street Geometric Sizing Solver
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Pot Size (Chips Or BB)
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={potSize}
                  onChange={(e) => setPotSize(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Remaining Stack (Smaller Stack)
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={effectiveStack}
                  onChange={(e) => setEffectiveStack(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          {/* KPI Output Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Stack-To-Pot Ratio (SPR)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.spr} SPR
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {metrics.safeStack.toLocaleString('en-US')} Stack / {metrics.safePot.toLocaleString('en-US')} Pot
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3-Street Geometric Bet %
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.geo3Pct}% Pot
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Equal % On Flop, Turn &amp; River
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                2-Street Geometric Bet %
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
                {metrics.geo2Pct}% Pot
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Equal % Across Two Streets (Turn + River)
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1-Street All-In Shove %
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0', marginTop: 4 }}>
                {metrics.geo1Pct}% Pot
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Immediate Single-Street All-In
              </div>
            </div>
          </div>

          {/* Strategic Zone Banner */}
          <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', marginBottom: 6 }}>
              {metrics.zoneTitle}
            </div>
            <p style={{ fontSize: 14, color: '#cbd5e1', margin: 0, lineHeight: 1.55 }}>
              {metrics.zoneAdvice}
            </p>
          </div>

          {/* Exact Chip Progression Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399', marginBottom: 8 }}>
                3-Street Geometric Progression ({metrics.geo3Pct}% Pot Per Street)
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: '#cbd5e1' }}>
                <li><strong>Flop Bet ({metrics.geo3Pct}%):</strong> {metrics.threeStreetFlopBet.toLocaleString('en-US')} Into {metrics.safePot.toLocaleString('en-US')}</li>
                <li><strong>Turn Bet ({metrics.geo3Pct}%):</strong> {metrics.threeStreetTurnBet.toLocaleString('en-US')} Into {metrics.potOnTurn.toLocaleString('en-US')}</li>
                <li><strong>River All-In ({metrics.geo3Pct}%):</strong> {metrics.threeStreetRiverBet.toLocaleString('en-US')} Into {metrics.potOnRiver.toLocaleString('en-US')}</li>
              </ul>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                2-Street Geometric Progression ({metrics.geo2Pct}% Pot Per Street)
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.75, color: '#cbd5e1' }}>
                <li><strong>Street 1 Bet ({metrics.geo2Pct}%):</strong> {metrics.twoStreetBet1.toLocaleString('en-US')} Into {metrics.safePot.toLocaleString('en-US')}</li>
                <li><strong>Street 2 All-In ({metrics.geo2Pct}%):</strong> {metrics.twoStreetBet2.toLocaleString('en-US')} Into {metrics.twoStreetPotAfter1.toLocaleString('en-US')}</li>
                <li><strong>Final All-In Pot Size:</strong> {(metrics.safePot + 2 * metrics.safeStack).toLocaleString('en-US')} Total Chips</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Reference Table: Geometric Bet Sizing By SPR */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            GTO Geometric Bet Sizing Reference Chart Across Common SPRs
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact 1-Street, 2-Street, And 3-Street Geometric Bet Percentages And Stack Commitment Thresholds
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flop SPR</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Common Preflop Configuration</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>1-Street Jam %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>2-Street Geo %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>3-Street Geo %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>GTO Commitment Guideline</th>
                </tr>
              </thead>
              <tbody>
                {SPR_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.spr} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.spr}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.preflopSpot}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.geo1}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.geo2}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.geo3}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.commitmentRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Calculators &amp; GTO Strategy Guides
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multiway Equity Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/learn/stack-to-pot-ratio-explained" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Lesson: SPR Strategy Guide
            </Link>
            <Link href="/research/river-overbet-polarization-mdf-efficiency" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Study: River Overbet Polarization
            </Link>
          </div>
        </section>

        <FaqSection faqs={SPR_CALCULATOR_FAQS} />

        <CitationBacklinkBox
          title="Poker Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Postflop Geometric Solver"
          badgeValue="SPR & Multi-Street Bet Sizing"
          summary="Interactive Stack-To-Pot Ratio (SPR) And Multi-Street Geometric Bet Sizing Calculator For 1-Street, 2-Street, And 3-Street All-In Progressions."
          slug="spr-calculator"
        />

        <AiPromptLauncher
          title="Poker Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderSprCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderSprCalculatorMarkdown({
      pot: query?.pot || 100,
      effectiveStack: query?.stack || query?.effectiveStack || 400,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialPot: Number(query?.pot) || 100,
      initialEffectiveStack: Number(query?.stack || query?.effectiveStack) || 400,
    },
  };
}
