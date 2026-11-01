/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER WINRATE, BB/100 & HOURLY RATE VARIANCE CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive public calculator & reference hub at /tools/poker-winrate-calculator
 * (and raw Markdown at /tools/poker-winrate-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const STAKES_WINRATE_BENCHMARKS = [
  { gameFormat: 'Live $1/$2 & $1/$3 No-Limit Hold\'em', handsPerHour: '28 Hands/Hr', solidWinrate: '8.0 BB/100', crusherWinrate: '12.5 BB/100', solidBbPerHr: '2.24 BB/Hr', crusherBbPerHr: '3.50 BB/Hr' },
  { gameFormat: 'Live $2/$5 No-Limit Hold\'em (100BB - 200BB)', handsPerHour: '28 Hands/Hr', solidWinrate: '6.5 BB/100', crusherWinrate: '10.0 BB/100', solidBbPerHr: '1.82 BB/Hr', crusherBbPerHr: '2.80 BB/Hr' },
  { gameFormat: 'Live $5/$10 No-Limit Hold\'em', handsPerHour: '27 Hands/Hr', solidWinrate: '5.0 BB/100', crusherWinrate: '8.0 BB/100', solidBbPerHr: '1.35 BB/Hr', crusherBbPerHr: '2.16 BB/Hr' },
  { gameFormat: 'Online 6-Max NLH (4 Regular Tables)', handsPerHour: '320 Hands/Hr', solidWinrate: '3.5 BB/100', crusherWinrate: '6.5 BB/100', solidBbPerHr: '11.20 BB/Hr', crusherBbPerHr: '20.80 BB/Hr' },
  { gameFormat: 'Online Fast-Fold / Zoom NLH (2 Pools)', handsPerHour: '450 Hands/Hr', solidWinrate: '2.5 BB/100', crusherWinrate: '4.5 BB/100', solidBbPerHr: '11.25 BB/Hr', crusherBbPerHr: '20.25 BB/Hr' },
  { gameFormat: 'Live $2/$5 Pot-Limit Omaha (PLO4)', handsPerHour: '24 Hands/Hr', solidWinrate: '9.0 BB/100', crusherWinrate: '15.0 BB/100', solidBbPerHr: '2.16 BB/Hr', crusherBbPerHr: '3.60 BB/Hr' },
];

const SAMPLE_SIZE_CONFIDENCE = [
  { sampleHands: '10,000 Hands (~350 Live Hours)', stdError85: '±8.50 BB/100', ci95Width: '±16.66 BB/100', probLossAt4Bb: '31.9% Chance In Red', statisticalReliability: 'High Noise / Short Sample' },
  { sampleHands: '25,000 Hands (~900 Live Hours)', stdError85: '±5.38 BB/100', ci95Width: '±10.54 BB/100', probLossAt4Bb: '22.9% Chance In Red', statisticalReliability: 'Emerging Trend Indicator' },
  { sampleHands: '50,000 Hands (1.5 Years Live Full-Time)', stdError85: '±3.80 BB/100', ci95Width: '±7.45 BB/100', probLossAt4Bb: '14.6% Chance In Red', statisticalReliability: 'Moderate Confidence' },
  { sampleHands: '100,000 Hands (Online Quarterly Volume)', stdError85: '±2.69 BB/100', ci95Width: '±5.27 BB/100', probLossAt4Bb: '6.8% Chance In Red', statisticalReliability: 'Strong Winrate Proof' },
  { sampleHands: '250,000 Hands (Multi-Year / High Volume)', stdError85: '±1.70 BB/100', ci95Width: '±3.33 BB/100', probLossAt4Bb: '0.9% Chance In Red', statisticalReliability: 'Institutional Grade Certainty' },
];

export default function PokerWinrateCalculatorPage({
  initialProfitDollars = 4500,
  initialBigBlindDollars = 5,
  initialHoursPlayed = 150,
  initialHandsPerHour = 28,
}) {
  const [profitDollars, setProfitDollars] = useState(initialProfitDollars);
  const [bigBlindDollars, setBigBlindDollars] = useState(initialBigBlindDollars);
  const [hoursPlayed, setHoursPlayed] = useState(initialHoursPlayed);
  const [handsPerHour, setHandsPerHour] = useState(initialHandsPerHour);

  const metrics = useMemo(() => {
    const safeProfit = Number(profitDollars) || 0;
    const safeBb = Math.max(0.05, Number(bigBlindDollars) || 5);
    const safeHours = Math.max(1, Number(hoursPlayed) || 150);
    const safeHph = Math.max(10, Math.min(1500, Number(handsPerHour) || 28));

    const totalHands = Math.round(safeHours * safeHph);
    const totalBbWon = safeProfit / safeBb;
    const bbPer100 = (totalBbWon / totalHands) * 100;
    const hourlyDollars = safeProfit / safeHours;
    const hourlyBb = totalBbWon / safeHours;

    // 95% Confidence Interval assuming 80 BB/100 standard deviation
    const hundredHandBlocks = Math.max(1, totalHands / 100);
    const stdErrorBb100 = 80 / Math.sqrt(hundredHandBlocks);
    const ci95Margin = 1.96 * stdErrorBb100;
    const ciLow = bbPer100 - ci95Margin;
    const ciHigh = bbPer100 + ci95Margin;

    return {
      safeProfit: safeProfit.toLocaleString('en-US'),
      safeBb: safeBb.toFixed(2),
      safeHours,
      safeHph,
      totalHands: totalHands.toLocaleString('en-US'),
      totalBbWon: totalBbWon.toFixed(1),
      bbPer100: bbPer100.toFixed(2),
      hourlyDollars: hourlyDollars.toFixed(2),
      hourlyBb: hourlyBb.toFixed(2),
      ci95Margin: ci95Margin.toFixed(2),
      ciLow: ciLow.toFixed(2),
      ciHigh: ciHigh.toFixed(2),
      annualProjection2000Hrs: Math.round(hourlyDollars * 1500).toLocaleString('en-US'),
    };
  }, [profitDollars, bigBlindDollars, hoursPlayed, handsPerHour]);

  const canonicalPath = '/tools/poker-winrate-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Winrate, BB/100 & Hourly Rate Calculator';
  const pageDesc =
    'Convert Live And Online Poker Session Results Between Dollars Per Hour ($/Hr), Big Blinds Per 100 Hands (BB/100), Total Hands Played, And 95% Confidence Intervals.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Winrate, BB/100 & Hourly Rate Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Winrate Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['Poker Winrate & BB/100 Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Do You Convert Live Poker Hourly Rate Into BB/100?',
          answer:
            'Divide Your Hourly Dollar Winrate By The Big Blind Size To Find Big Blinds Won Per Hour (BB/Hr), Then Multiply By 100 And Divide By Hands Dealt Per Hour (Typically 27 To 30 Hands Per Hour In Live Cash Games). Winning $50/Hr At $2/$5 (10 BB/Hr At 28 Hands/Hr) Equals 35.7 BB/100.',
        },
        {
          question: 'What Is A Good BB/100 Winrate In Live Vs. Online Cash Games?',
          answer:
            'In Live $1/$3 And $2/$5 No-Limit Hold\'em, Strong Winning Players Achieve 7 To 12 BB/100 (2 To 3.5 Big Blinds Per Hour). In Competitive Online 6-Max Cash Games, A Sustainable Winning Rate Is 3 To 6 BB/100 Compensated By Multi-Tabling 300+ Hands Per Hour.',
        },
        {
          question: 'How Many Hands Are Needed To Prove Your True Poker Winrate?',
          answer:
            'Because Cash Game Standard Deviation Averages 75 To 85 BB/100, A 10,000-Hand Sample Carries A 95% Confidence Interval Of Plus Or Minus 16.7 BB/100. At Least 50,000 To 100,000 Hands Are Required To Narrow The Margin Of Error Below Plus Or Minus 5.3 BB/100.',
        },
      ],
      steps: [
        {
          name: 'Enter Total Net Profit And Big Blind Size',
          text: 'Input Your Net Dollar Profit Across Your Sample And The Big Blind Stake ($2, $3, $5, Or $10).',
        },
        {
          name: 'Input Total Hours Played And Hands Per Hour',
          text: 'Use 28 Hands/Hr For Live Full-Ring Dealers, 85 Hands/Hr For Single Online 6-Max Tables, Or 320+ Hands/Hr For Multi-Tabling.',
        },
        {
          name: 'Inspect BB/100 Winrate And 95% Confidence Interval',
          text: 'Review Your Exact BB/100 Winrate, Hourly Earnings ($/Hr), And Statistical Confidence Interval Bounds.',
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
          <span>Poker Winrate &amp; BB/100 Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Winrate, BB/100 &amp; Hourly Rate Variance Calculator
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          Poker Winrate Is Standardized In Big Blinds Won Per 100 Hands (BB/100) Online And Big Blinds Won Per Hour (BB/Hr) In Live Card Rooms. Enter Your Net Profit, Stake Size, Total Hours, And Table Pace Below To Convert Between $/Hour, BB/Hour, And BB/100 While Computing Your 95% Statistical Confidence Interval.
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
              1. Session Sample &amp; Stake Inputs
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="profit-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Total Net Profit ($ Won Or Lost)
              </label>
              <input
                id="profit-input"
                type="number"
                step="100"
                value={profitDollars}
                onChange={(e) => setProfitDollars(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="bb-dollars-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Big Blind Size ($ Per 1 BB)
              </label>
              <input
                id="bb-dollars-input"
                type="number"
                min="0.05"
                step="1"
                value={bigBlindDollars}
                onChange={(e) => setBigBlindDollars(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="hours-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Total Hours Played
              </label>
              <input
                id="hours-input"
                type="number"
                min="1"
                value={hoursPlayed}
                onChange={(e) => setHoursPlayed(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div>
              <label htmlFor="hph-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Hands Dealt Per Hour (Live = 28, Online 4-Tabling = 320)
              </label>
              <input
                id="hph-input"
                type="number"
                min="10"
                max="1500"
                value={handsPerHour}
                onChange={(e) => setHandsPerHour(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              2. Standardized Winrate &amp; Variance Output
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 15 }}>
              <li><strong>True Standardized Winrate:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{metrics.bbPer100} BB / 100 Hands</span></li>
              <li><strong>Hourly Winrate ($/Hr &amp; BB/Hr):</strong> <span style={{ color: '#38bdf8', fontWeight: 700 }}>${metrics.hourlyDollars} / Hr</span> ({metrics.hourlyBb} BB / Hr)</li>
              <li><strong>Estimated Total Sample Size:</strong> {metrics.totalHands} Hands ({metrics.totalBbWon} Total BB Won)</li>
              <li><strong>95% Confidence Interval (80 SD):</strong> <span style={{ color: '#f59e0b', fontWeight: 700 }}>{metrics.ciLow} To {metrics.ciHigh} BB/100</span> (±{metrics.ci95Margin} BB/100)</li>
              <li><strong>1,500-Hour Full-Time Annual Pace:</strong> ${metrics.annualProjection2000Hrs} / Year</li>
            </ul>
          </div>
        </section>

        {/* Reference Table 1: Live & Online Winrate Benchmarks */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Live &amp; Online Cash Game Winrate Benchmarks (BB/100 Vs. BB/Hour)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Comparison Of Sustainable Solid Winner And Top Crusher Winrates Across Live And Online Cash Formats
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Cash Game Format &amp; Stake</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Pace</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Solid Winner (BB/100)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Top Crusher (BB/100)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Solid Hourly (BB/Hr)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Crusher Hourly (BB/Hr)</th>
                </tr>
              </thead>
              <tbody>
                {STAKES_WINRATE_BENCHMARKS.map((row) => (
                  <tr key={row.gameFormat} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.gameFormat}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.handsPerHour}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.solidWinrate}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.crusherWinrate}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.solidBbPerHr}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.crusherBbPerHr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table 2: Sample Size & 95% Confidence Intervals */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Sample Size Variance &amp; 95% Confidence Interval Chart (85 BB/100 SD)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Standard Error, 95% Confidence Interval Widths, And Loss Probabilities For A True 4.0 BB/100 Winner
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hand Sample Volume</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>1 Standard Error (68% CI)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>95% Confidence Margin</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Loss Probability (At 4 BB/100)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Statistical Reliability</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_SIZE_CONFIDENCE.map((s) => (
                  <tr key={s.sampleHands} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{s.sampleHands}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{s.stdError85}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{s.ci95Width}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{s.probLossAt4Bb}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{s.statisticalReliability}</td>
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
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Bankroll &amp; Risk Of Ruin Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Ranges
            </Link>
            <Link href="/learn/hands" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              169 Starting Hand Guides
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title="Poker Winrate, BB/100 & Hourly Rate Calculator"
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
    const { renderPokerWinrateCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPokerWinrateCalculatorMarkdown({
      profitDollars: query?.profitDollars || 4500,
      bigBlindDollars: query?.bigBlindDollars || 5,
      hoursPlayed: query?.hoursPlayed || 150,
      handsPerHour: query?.handsPerHour || 28,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialProfitDollars: Number(query?.profitDollars) || 4500,
      initialBigBlindDollars: Number(query?.bigBlindDollars) || 5,
      initialHoursPlayed: Number(query?.hoursPlayed) || 150,
      initialHandsPerHour: Number(query?.handsPerHour) || 28,
    },
  };
}
