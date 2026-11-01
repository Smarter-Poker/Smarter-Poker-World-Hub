/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POT ODDS, REQUIRED EQUITY & MINIMUM DEFENSE FREQUENCY (MDF) CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive public calculator & reference hub at /tools/pot-odds-calculator
 * (and raw Markdown at /tools/pot-odds-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const STANDARD_BET_SIZES = [
  { label: '20% Pot (Block Bet)', pct: 20, ratio: '6.0 : 1', reqEquity: '14.3%', mdf: '83.3%', bluffRatio: '16.7% Bluffs / 83.3% Value' },
  { label: '25% Pot (Quarter Pot)', pct: 25, ratio: '5.0 : 1', reqEquity: '16.7%', mdf: '80.0%', bluffRatio: '20.0% Bluffs / 80.0% Value' },
  { label: '33% Pot (Third Pot)', pct: 33.33, ratio: '4.0 : 1', reqEquity: '20.0%', mdf: '75.0%', bluffRatio: '25.0% Bluffs / 75.0% Value' },
  { label: '50% Pot (Half Pot)', pct: 50, ratio: '3.0 : 1', reqEquity: '25.0%', mdf: '66.7%', bluffRatio: '33.3% Bluffs / 66.7% Value' },
  { label: '66% Pot (Two-Thirds Pot)', pct: 66.67, ratio: '2.5 : 1', reqEquity: '28.6%', mdf: '60.0%', bluffRatio: '40.0% Bluffs / 60.0% Value' },
  { label: '75% Pot (Three-Quarters Pot)', pct: 75, ratio: '2.33 : 1', reqEquity: '30.0%', mdf: '57.1%', bluffRatio: '42.9% Bluffs / 57.1% Value' },
  { label: '100% Pot (Full Pot)', pct: 100, ratio: '2.0 : 1', reqEquity: '33.3%', mdf: '50.0%', bluffRatio: '50.0% Bluffs / 50.0% Value' },
  { label: '150% Pot (1.5x Overbet)', pct: 150, ratio: '1.67 : 1', reqEquity: '37.5%', mdf: '40.0%', bluffRatio: '60.0% Bluffs / 40.0% Value' },
  { label: '200% Pot (2x Overbet)', pct: 200, ratio: '1.5 : 1', reqEquity: '40.0%', mdf: '33.3%', bluffRatio: '66.7% Bluffs / 33.3% Value' },
];

const COMMON_DRAWS = [
  { draw: 'Open-Ended Straight + Flush Draw (Combo)', outs: 15, flopTurn: '31.9%', flopRiver: '54.1%', rule42: '60% / 30%' },
  { draw: 'Flush Draw + Gutshot Straight Draw', outs: 12, flopTurn: '25.5%', flopRiver: '45.0%', rule42: '48% / 24%' },
  { draw: 'Standard Nut Flush Draw', outs: 9, flopTurn: '19.1%', flopRiver: '35.0%', rule42: '36% / 18%' },
  { draw: 'Open-Ended Straight Draw (OESD)', outs: 8, flopTurn: '17.0%', flopRiver: '31.5%', rule42: '32% / 16%' },
  { draw: 'Two Overcards To Top Pair', outs: 6, flopTurn: '12.8%', flopRiver: '24.1%', rule42: '24% / 12%' },
  { draw: 'Two Pair Drawing To Full House Or Trips To Quads', outs: 4, flopTurn: '8.5%', flopRiver: '16.5%', rule42: '16% / 8%' },
  { draw: 'Gutshot Straight Draw (Inside Straight)', outs: 4, flopTurn: '8.5%', flopRiver: '16.5%', rule42: '16% / 8%' },
  { draw: 'Pocket Pair Drawing To Set', outs: 2, flopTurn: '4.3%', flopRiver: '8.4%', rule42: '8% / 4%' },
];

export default function PotOddsCalculatorPage({
  initialPot = 100,
  initialBet = 50,
  initialOuts = 9,
}) {
  const [potSize, setPotSize] = useState(initialPot);
  const [betSize, setBetSize] = useState(initialBet);
  const [outs, setOuts] = useState(initialOuts);

  const metrics = useMemo(() => {
    const safePot = Math.max(1, Number(potSize) || 100);
    const safeBet = Math.max(1, Number(betSize) || 50);
    const safeOuts = Math.max(0, Math.min(25, Number(outs) || 9));

    const totalPotBeforeCall = safePot + safeBet;
    const finalPotAfterCall = safePot + safeBet * 2;
    const reqEquity = (safeBet / finalPotAfterCall) * 100;
    const potOddsRatio = totalPotBeforeCall / safeBet;
    const mdf = (safePot / totalPotBeforeCall) * 100;
    const maxFoldPct = 100 - mdf;
    const bluffFreqOnRiver = (safeBet / finalPotAfterCall) * 100;
    const betPctOfPot = (safeBet / safePot) * 100;

    const turnHitExact = (safeOuts / 47) * 100;
    const riverHitExact = (safeOuts / 46) * 100;
    const twoCardMiss = ((47 - safeOuts) / 47) * ((46 - safeOuts) / 46);
    const flopToRiverExact = (1 - twoCardMiss) * 100;

    return {
      safePot,
      safeBet,
      safeOuts,
      totalPotBeforeCall,
      finalPotAfterCall,
      reqEquity: reqEquity.toFixed(1),
      potOddsRatio: potOddsRatio.toFixed(2),
      mdf: mdf.toFixed(1),
      maxFoldPct: maxFoldPct.toFixed(1),
      bluffFreqOnRiver: bluffFreqOnRiver.toFixed(1),
      betPctOfPot: betPctOfPot.toFixed(0),
      turnHitExact: turnHitExact.toFixed(1),
      riverHitExact: riverHitExact.toFixed(1),
      flopToRiverExact: flopToRiverExact.toFixed(1),
      profitableTurnCall: Number(turnHitExact) >= Number(reqEquity),
      profitableAllInFlopCall: Number(flopToRiverExact) >= Number(reqEquity),
    };
  }, [potSize, betSize, outs]);

  const canonicalPath = '/tools/pot-odds-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Pot Odds, Required Equity & MDF Calculator';
  const pageDesc =
    'Calculate Exact Poker Pot Odds, Break-Even Calling Equity, Minimum Defense Frequency (MDF), Optimal Bluff-To-Value Ratios, And Rule Of 4 And 2 Draw Outs Instantly.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Pot Odds, Equity & MDF Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Math Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['Pot Odds & MDF Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Do You Calculate Pot Odds And Break-Even Equity In Poker?',
          answer:
            'Divide The Call Amount By The Final Pot Size After Your Call: Required Equity = Call / (Current Pot + Opponent Bet + Your Call). A Half-Pot Bet (50% Pot) Offers 3:1 Pot Odds And Requires 25.0% Equity To Break Even.',
        },
        {
          question: 'What Is Minimum Defense Frequency (MDF) In GTO Poker?',
          answer:
            'Minimum Defense Frequency Is The Percentage Of Your Range You Must Continue With (Call Or Raise) To Prevent An Opponent From Profitably Bluffing Any Two Cards: MDF = Pot / (Pot + Bet). Against A 50% Pot Bet, MDF Is 66.7%.',
        },
        {
          question: 'How Does The Rule Of 4 And 2 Work For Poker Outs?',
          answer:
            'Multiply Your Unseen Outs By 4 On The Flop (When Going All-In With Two Cards To Come) Or By 2 On The Turn (With One Card To Come) To Estimate Your Percentage Chance Of Completing Your Draw.',
        },
      ],
      steps: [
        {
          name: 'Enter Current Pot And Facing Bet Size',
          text: 'Input The Pot Size Before The Bet And The Bet Amount You Are Facing To Compute Exact Pot Odds And Break-Even Equity.',
        },
        {
          name: 'Review Minimum Defense Frequency (MDF) And Bluff Ratio',
          text: 'Inspect The Exact MDF Percentage And Optimal Polarized River Bluff-To-Value Ratio For That Bet Sizing.',
        },
        {
          name: 'Compare Against Your Draw Outs',
          text: 'Select Your Number Of Unseen Outs To Verify Whether Calling One Street Or All-In On The Flop Is Positive Expected Value (+EV).',
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
          <Link href="/tools/poker-odds-calculator" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>Pot Odds &amp; MDF Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Pot Odds, Required Equity &amp; Minimum Defense Frequency (MDF) Calculator
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          Pot Odds Measure The Ratio Of The Current Pot To The Cost Of A Call, Determining The Exact Break-Even Equity Required To Continue Profitably. Enter Any Pot Size, Facing Bet, And Draw Outs Below To Calculate Required Calling Equity, Minimum Defense Frequency (MDF), Polarized Bluff Ratios, And Exact Hypergeometric Draw Probabilities.
        </p>

        {/* Interactive Calculator Grid */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
          marginBottom: 36,
        }}>
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              1. Spot Inputs (Pot, Bet &amp; Outs)
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="pot-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Pot Size Before Bet ($ Or BB)
              </label>
              <input
                id="pot-input"
                type="number"
                min="1"
                value={potSize}
                onChange={(e) => setPotSize(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#070b14',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f8fafc',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="bet-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Opponent Bet / Call Amount ($ Or BB)
              </label>
              <input
                id="bet-input"
                type="number"
                min="1"
                value={betSize}
                onChange={(e) => setBetSize(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#070b14',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f8fafc',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              />
            </div>

            <div>
              <label htmlFor="outs-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Your Unseen Draw Outs (0 To 20)
              </label>
              <input
                id="outs-input"
                type="number"
                min="0"
                max="20"
                value={outs}
                onChange={(e) => setOuts(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#070b14',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#f8fafc',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              />
            </div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              2. Exact Solver Math Output ({metrics.betPctOfPot}% Pot Bet)
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 15 }}>
              <li><strong>Pot Odds Ratio:</strong> <span style={{ color: '#38bdf8', fontWeight: 700 }}>{metrics.potOddsRatio} : 1</span></li>
              <li><strong>Break-Even Required Equity:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{metrics.reqEquity}%</span></li>
              <li><strong>Minimum Defense Frequency (MDF):</strong> <span style={{ color: '#f59e0b', fontWeight: 700 }}>{metrics.mdf}%</span> (Max Fold: {metrics.maxFoldPct}%)</li>
              <li><strong>Optimal Polarized River Bluff Frequency:</strong> {metrics.bluffFreqOnRiver}% Of Betting Range</li>
              <li><strong>1-Card Draw Equity ({metrics.safeOuts} Outs):</strong> {metrics.turnHitExact}% ({metrics.profitableTurnCall ? 'Direct +EV Call' : 'Requires Implied Odds'})</li>
              <li><strong>2-Card All-In Equity ({metrics.safeOuts} Outs):</strong> {metrics.flopToRiverExact}% ({metrics.profitableAllInFlopCall ? 'Direct +EV All-In Call' : 'Below Break-Even Threshold'})</li>
            </ul>
          </div>
        </section>

        {/* Reference Table 1: Standard Bet Sizes */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            GTO Bet Sizing Cheat Sheet: Pot Odds, Required Equity &amp; MDF
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact Break-Even Equity, Minimum Defense Frequency, And Polarized Bluff Ratios Across Standard Solver Bet Sizings
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Bet Size (% Of Pot)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot Odds Ratio</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Calling Equity</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Minimum Defense Frequency (MDF)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Polarized River Bluff / Value Split</th>
                </tr>
              </thead>
              <tbody>
                {STANDARD_BET_SIZES.map((row) => (
                  <tr key={row.label} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.label}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.ratio}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.reqEquity}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.mdf}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.bluffRatio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table 2: Common Poker Draws */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Poker Outs &amp; Rule Of 4 And 2 Probability Chart
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact Hypergeometric Draw Completion Probabilities Vs. Rule Of 4 And 2 Mental Shortcuts
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Drawing Hand Type</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Clean Outs</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>1 Card (Flop To Turn)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>2 Cards (Flop To River All-In)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Rule Of 4 / Rule Of 2</th>
                </tr>
              </thead>
              <tbody>
                {COMMON_DRAWS.map((d) => (
                  <tr key={d.draw} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{d.draw}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{d.outs} Outs</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{d.flopTurn}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{d.flopRiver}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{d.rule42}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Calculators &amp; Strategy Guides
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multiway Equity Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/learn/pot-odds-and-required-equity" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Lesson: Pot Odds &amp; Required Equity
            </Link>
            <Link href="/learn/minimum-defense-frequency-explained" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Lesson: Minimum Defense Frequency
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title="Poker Pot Odds, Required Equity & MDF Calculator"
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
    const { renderPotOddsCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPotOddsCalculatorMarkdown({
      pot: query?.pot || 100,
      bet: query?.bet || 50,
      outs: query?.outs || 9,
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
      initialBet: Number(query?.bet) || 50,
      initialOuts: Number(query?.outs) || 9,
    },
  };
}
