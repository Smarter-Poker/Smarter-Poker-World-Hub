/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER BANKROLL MANAGEMENT & RISK OF RUIN CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive public calculator & reference hub at /tools/bankroll-calculator
 * (and raw Markdown at /tools/bankroll-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const VARIANCE_BENCHMARKS = [
  { format: '6-Max Online No-Limit Hold\'em (100BB)', stdDev: '85 BB/100', winrate: '4.0 BB/100', conservativeBr: '45 Buy-Ins', aggressiveBr: '25 Buy-Ins' },
  { format: 'Full-Ring Live $1/$3 & $2/$5 NLH (100BB)', stdDev: '70 BB/100', winrate: '8.0 BB/100', conservativeBr: '25 Buy-Ins', aggressiveBr: '15 Buy-Ins' },
  { format: '6-Max Pot-Limit Omaha (PLO4 100BB)', stdDev: '135 BB/100', winrate: '4.5 BB/100', conservativeBr: '90 Buy-Ins', aggressiveBr: '50 Buy-Ins' },
  { format: '5-Card Pot-Limit Omaha (PLO5 Deep)', stdDev: '165 BB/100', winrate: '5.0 BB/100', conservativeBr: '120 Buy-Ins', aggressiveBr: '70 Buy-Ins' },
  { format: 'Large-Field Multi-Table Tournaments (MTT)', stdDev: '180% ROI SD', winrate: '20% ROI', conservativeBr: '150 Buy-Ins', aggressiveBr: '100 Buy-Ins' },
  { format: 'Small-Field Daily Live Tournaments (<150 Entries)', stdDev: '110% ROI SD', winrate: '30% ROI', conservativeBr: '75 Buy-Ins', aggressiveBr: '50 Buy-Ins' },
];

export default function BankrollCalculatorPage({
  initialWinrate = 5,
  initialStdDev = 85,
  initialBuyIns = 30,
  initialBuyInDollars = 300,
}) {
  const [winrate, setWinrate] = useState(initialWinrate);
  const [stdDev, setStdDev] = useState(initialStdDev);
  const [buyIns, setBuyIns] = useState(initialBuyIns);
  const [buyInDollars, setBuyInDollars] = useState(initialBuyInDollars);

  const stats = useMemo(() => {
    const wr = Math.max(0.5, Number(winrate) || 5);
    const sd = Math.max(20, Number(stdDev) || 85);
    const bi = Math.max(5, Number(buyIns) || 30);
    const dollars = Math.max(10, Number(buyInDollars) || 300);

    const bankrollBb = bi * 100;
    const totalBankrollDollars = bi * dollars;

    // Classical Brownian motion Risk of Ruin: RoR = exp(-2 * mu * B / sigma^2)
    // where mu and sigma are per 100 hands and B is expressed in 100-hand units (or mu, sigma, B all in BB per 100 hands: B_units = bankrollBb)
    // Specifically, per 100 hands: drift = wr (BB), variance = sd^2 (BB^2). So exponent = -2 * wr * bankrollBb / (sd * sd)
    const exponent = (-2 * wr * bankrollBb) / (sd * sd);
    const rorPct = Math.min(100, Math.max(0.01, Math.exp(exponent) * 100));

    // Required buy-ins for 1% Risk of Ruin: exp(-2 * wr * B / sd^2) = 0.01 => B = -ln(0.01) * sd^2 / (2 * wr)
    const buyInsForOnePctRor = Math.ceil((4.60517 * sd * sd) / (2 * wr * 100));
    const buyInsForFivePctRor = Math.ceil((2.99573 * sd * sd) / (2 * wr * 100));

    return {
      wr: wr.toFixed(1),
      sd: sd.toFixed(0),
      bi,
      dollars,
      totalBankrollDollars: totalBankrollDollars.toLocaleString('en-US'),
      rorPct: rorPct < 0.05 ? '< 0.05' : rorPct.toFixed(2),
      buyInsForOnePctRor,
      buyInsForFivePctRor,
      onePctDollars: (buyInsForOnePctRor * dollars).toLocaleString('en-US'),
      fivePctDollars: (buyInsForFivePctRor * dollars).toLocaleString('en-US'),
    };
  }, [winrate, stdDev, buyIns, buyInDollars]);

  const canonicalPath = '/tools/bankroll-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Bankroll & Risk Of Ruin Calculator';
  const pageDesc =
    'Calculate Exact Poker Bankroll Requirements, Risk Of Ruin (RoR) Probabilities, And Buy-In Buffers Across NLH, PLO, And MTTs Using Winrate And Standard Deviation.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Bankroll & Risk Of Ruin Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Bankroll Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['Bankroll & Risk Of Ruin Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'How Do You Calculate Risk Of Ruin In Poker?',
          answer:
            'Risk Of Ruin (RoR) Is Computed Using The Brownian Motion Formula RoR = exp(-2 * Winrate * Bankroll / Variance), Where Winrate And Standard Deviation Are Measured In Big Blinds Per 100 Hands (BB/100) And Bankroll Is Measured In Total Big Blinds.',
        },
        {
          question: 'How Many Buy-Ins Do You Need For Cash Games Vs. PLO?',
          answer:
            'A Winning 6-Max No-Limit Hold\'em Player Typically Requires 25 To 45 Buy-Ins To Keep Risk Of Ruin Below 1%, Whereas Pot-Limit Omaha (PLO4 And PLO5) Players Require 60 To 120 Buy-Ins Due To Significantly Higher All-In Equity Variance.',
        },
        {
          question: 'Why Do Multi-Table Tournaments Require Larger Bankrolls Than Cash Games?',
          answer:
            'Top-Heavy Tournament Payout Structures Concentrate Most Of The Prize Pool In The Top 3 Finishes, Requiring 100 To 150 Buy-Ins To Weather Standard Downswings Even With A 20% Return On Investment (ROI).',
        },
      ],
      steps: [
        {
          name: 'Enter True Winrate (BB/100)',
          text: 'Input Your Expected True Winrate In Big Blinds Per 100 Hands After Rake.',
        },
        {
          name: 'Select Game Standard Deviation (BB/100)',
          text: 'Use 70 BB/100 For Live Full-Ring NLH, 85 BB/100 For Online 6-Max NLH, Or 135+ BB/100 For Pot-Limit Omaha.',
        },
        {
          name: 'Evaluate Risk Of Ruin And Required Buy-Ins',
          text: 'Review Your Exact Risk Of Ruin Percentage And The Buy-In Thresholds Required For 5% And 1% Risk Of Ruin.',
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
          <span>Bankroll &amp; Risk Of Ruin Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Bankroll Management &amp; Risk Of Ruin (RoR) Calculator
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          Risk Of Ruin Measures The Mathematical Probability Of Depleting Your Entire Poker Bankroll Given Your True Winrate (BB/100), Standard Deviation (SD), And Total Buy-Ins. Use The Interactive Calculator Below To Compute Your Exact Downswing Survival Odds And Required Buy-In Buffer Across Cash Games, Pot-Limit Omaha, And Tournaments.
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
              1. Bankroll &amp; Variance Parameters
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="wr-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                True Winrate (BB / 100 Hands)
              </label>
              <input
                id="wr-input"
                type="number"
                step="0.5"
                min="0.5"
                value={winrate}
                onChange={(e) => setWinrate(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="sd-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Standard Deviation (BB / 100 Hands)
              </label>
              <input
                id="sd-input"
                type="number"
                min="30"
                max="250"
                value={stdDev}
                onChange={(e) => setStdDev(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="bi-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Current Bankroll (Number Of 100BB Buy-Ins)
              </label>
              <input
                id="bi-input"
                type="number"
                min="5"
                max="500"
                value={buyIns}
                onChange={(e) => setBuyIns(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>

            <div>
              <label htmlFor="dollars-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Single 100BB Buy-In Amount ($)
              </label>
              <input
                id="dollars-input"
                type="number"
                min="10"
                value={buyInDollars}
                onChange={(e) => setBuyInDollars(Number(e.target.value))}
                style={{ width: '100%', padding: '10px 12px', background: '#070b14', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}
              />
            </div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 16px 0' }}>
              2. Risk Of Ruin &amp; Capital Output
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 15 }}>
              <li><strong>Total Bankroll Capital:</strong> <span style={{ color: '#38bdf8', fontWeight: 700 }}>${stats.totalBankrollDollars}</span> ({stats.bi} Buy-Ins)</li>
              <li><strong>Risk Of Ruin (RoR) At Fixed Stakes:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{stats.rorPct}%</span></li>
              <li><strong>5% Risk Of Ruin Threshold:</strong> <span style={{ color: '#f59e0b', fontWeight: 700 }}>{stats.buyInsForFivePctRor} Buy-Ins</span> (${stats.fivePctDollars})</li>
              <li><strong>1% Professional Bankroll Threshold:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{stats.buyInsForOnePctRor} Buy-Ins</span> (${stats.onePctDollars})</li>
              <li><strong>Assumed Winrate &amp; Volatility:</strong> {stats.wr} BB/100 Winrate At {stats.sd} BB/100 Standard Deviation</li>
            </ul>
          </div>
        </section>

        {/* Reference Table */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Standard Deviation &amp; Buy-In Requirements By Poker Format
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Empirical Variance Benchmarks And Recommended Bankroll Depths Across Major Poker Formats
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Poker Format &amp; Structure</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Standard Deviation</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Benchmark Winrate / ROI</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Conservative (&lt;1% RoR)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Shot-Taking (5% RoR)</th>
                </tr>
              </thead>
              <tbody>
                {VARIANCE_BENCHMARKS.map((row) => (
                  <tr key={row.format} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.format}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.stdDev}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.winrate}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.conservativeBr}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.aggressiveBr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Calculators &amp; Research Studies
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/hub/bankroll-manager" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Open Full Bankroll &amp; Tax Tracker
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/research/bankroll-risk-of-ruin-and-kelly-criterion-empirical-model" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Research: Risk Of Ruin &amp; Kelly Criterion Study
            </Link>
            <Link href="/learn/bankroll-management-and-risk-of-ruin" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Lesson: Bankroll Management &amp; Risk Of Ruin
            </Link>
          </div>
        </section>

        <AiPromptLauncher
          title="Poker Bankroll Management & Risk Of Ruin Calculator"
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
    const { renderBankrollCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderBankrollCalculatorMarkdown({
      winrate: query?.winrate || 5,
      stdDev: query?.stdDev || 85,
      buyIns: query?.buyIns || 30,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialWinrate: Number(query?.winrate) || 5,
      initialStdDev: Number(query?.stdDev) || 85,
      initialBuyIns: Number(query?.buyIns) || 30,
      initialBuyInDollars: Number(query?.buyInDollars) || 300,
    },
  };
}
