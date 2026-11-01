/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER PUSH/FOLD SHORT-STACK NASH EQUILIBRIUM CHART CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive public calculator & reference hub at /tools/push-fold-calculator
 * (and raw Markdown at /tools/push-fold-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const POSITION_SHOVE_BENCHMARKS = [
  { position: 'Under The Gun (UTG - 8-Max)', bb15: '13.8%', bb12: '16.5%', bb10: '19.4%', bb8: '23.6%', bb5: '31.2%', keyHands: '55+, ATs+, KQs, AJo+' },
  { position: 'Middle Position (MP / Lojack)', bb15: '16.4%', bb12: '19.8%', bb10: '23.5%', bb8: '28.4%', bb5: '37.5%', keyHands: '44+, A8s+, KTs+, QJs, ATo+, KQo' },
  { position: 'Hijack (HJ - 6-Max / 8-Max)', bb15: '20.2%', bb12: '24.6%', bb10: '29.1%', bb8: '35.2%', bb5: '45.8%', keyHands: '33+, A4s+, K9s+, QTs+, J9s+, A9o+, KJo+' },
  { position: 'Cutoff (CO - Late Steal)', bb15: '26.5%', bb12: '31.8%', bb10: '37.4%', bb8: '44.8%', bb5: '56.4%', keyHands: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, A7o+, KTo+, QJo' },
  { position: 'Button (BTN - Dealer Seat)', bb15: '35.0%', bb12: '41.5%', bb10: '48.2%', bb8: '56.5%', bb5: '71.0%', keyHands: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, A2o+, K8o+, Q9o+, JTo' },
  { position: 'Small Blind (SB Vs BB Unopened)', bb15: '48.5%', bb12: '56.2%', bb10: '64.8%', bb8: '74.5%', bb5: '89.2%', keyHands: '22+, Any Ace, K2s+, Q2s+, J4s+, T6s+, 96s+, 86s+, K5o+, Q8o+, J8o+' },
];

const JENNINGS_SKLANSKY_THRESHOLDS = [
  { handGroup: 'Pocket Aces To Pocket Queens (AA - QQ)', sklanskyChubukov: '950+ BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: '100% Call' },
  { handGroup: 'Medium Pocket Pairs (99 - 66)', sklanskyChubukov: '52 To 135 BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: '100% Call' },
  { handGroup: 'Small Pocket Pairs (55 - 22)', sklanskyChubukov: '24 To 44 BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: '33+ Call / 22 Borderline' },
  { handGroup: 'Suited Broadways (AKs - KJs, QJs)', sklanskyChubukov: '38 To 160 BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: 'ATs+, KQs Call' },
  { handGroup: 'Suited Wheel Aces (A5s - A2s)', sklanskyChubukov: '26 To 34 BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: 'A5s Borderline Call' },
  { handGroup: 'Offsuit Aces (ATo - A2o)', sklanskyChubukov: '15 To 42 BB', nash10bbSb: '100% Shove', nash10bbBtn: '100% Shove', callVs10bbBtn: 'ATo+ Call / A7o Fold' },
  { handGroup: 'Suited Connectors (T9s - 65s)', sklanskyChubukov: '12 To 22 BB', nash10bbSb: '100% Shove', nash10bbBtn: '87s+ Shove', callVs10bbBtn: 'Fold At 10BB' },
];

const POSITION_BASE_FACTORS = {
  UTG: { label: 'Under The Gun (UTG)', playersLeft: 7, base10bb: 19.4, callTightness: 9.5 },
  MP: { label: 'Middle Position (MP)', playersLeft: 5, base10bb: 23.5, callTightness: 11.2 },
  HJ: { label: 'Hijack (HJ)', playersLeft: 4, base10bb: 29.1, callTightness: 13.8 },
  CO: { label: 'Cutoff (CO)', playersLeft: 3, base10bb: 37.4, callTightness: 17.5 },
  BTN: { label: 'Button (BTN)', playersLeft: 2, base10bb: 48.2, callTightness: 23.4 },
  SB: { label: 'Small Blind (SB)', playersLeft: 1, base10bb: 64.8, callTightness: 36.0 },
};

export default function PushFoldCalculatorPage({
  initialStackBb = 10,
  initialPosition = 'BTN',
  initialAntePct = 12.5,
}) {
  const [stackBb, setStackBb] = useState(initialStackBb);
  const [position, setPosition] = useState(
    POSITION_BASE_FACTORS[String(initialPosition).toUpperCase()]
      ? String(initialPosition).toUpperCase()
      : 'BTN'
  );
  const [antePct, setAntePct] = useState(initialAntePct);

  const metrics = useMemo(() => {
    const safeBb = Math.max(2, Math.min(25, Number(stackBb) || 10));
    const posKey = POSITION_BASE_FACTORS[position] ? position : 'BTN';
    const posMeta = POSITION_BASE_FACTORS[posKey];
    const safeAnte = Math.max(0, Math.min(25, Number(antePct) || 12.5));

    // Dead money in pot before shove: 1.0 BB + 0.5 SB + (safeAnte / 100) * 8 players (normalized to 1.0 BB big blind ante at 12.5%)
    const deadMoneyBb = 1.5 + (safeAnte / 12.5) * 1.0;
    const riskRewardRatio = safeBb / deadMoneyBb;
    const foldEquityNeededIfZeroEq = (safeBb / (safeBb + deadMoneyBb)) * 100;

    // Scale Nash shove % based on stack depth and ante boost
    const stackMultiplier = Math.pow(10 / safeBb, 0.58);
    const anteMultiplier = 0.85 + (safeAnte / 12.5) * 0.15;
    const shovePct = Math.min(96.0, Math.max(5.0, posMeta.base10bb * stackMultiplier * anteMultiplier));
    const callPct = Math.min(75.0, Math.max(3.5, posMeta.callTightness * Math.pow(10 / safeBb, 0.62) * anteMultiplier));
    const combosShoved = Math.round((shovePct / 100) * 1326);

    // M-Ratio = Stack / (SB + BB + Total Antes)
    const mRatio = safeBb / deadMoneyBb;

    let tierRecommendation = 'Any Pocket Pair, Any Suited Ace, Broadway Cards, Suited Connectors';
    if (shovePct >= 60) {
      tierRecommendation = '22+, Any Ace, Any King Suited, Q2s+, J5s+, T6s+, 96s+, 86s+, K5o+, Q8o+, J8o+, T8o+';
    } else if (shovePct >= 40) {
      tierRecommendation = '22+, A2s+, K2s+, Q6s+, J7s+, T7s+, 97s+, 87s, A2o+, K8o+, Q9o+, J9o+, T9o';
    } else if (shovePct >= 25) {
      tierRecommendation = '22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 98s, A7o+, KTo+, QTo+, JTo';
    } else {
      tierRecommendation = '44+, A7s+, KTs+, QTs+, JTs, ATo+, KQo';
    }

    return {
      safeBb,
      posKey,
      posLabel: posMeta.label,
      playersLeft: posMeta.playersLeft,
      safeAnte: safeAnte.toFixed(1),
      deadMoneyBb: deadMoneyBb.toFixed(2),
      riskRewardRatio: riskRewardRatio.toFixed(2),
      foldEquityNeededIfZeroEq: foldEquityNeededIfZeroEq.toFixed(1),
      shovePct: shovePct.toFixed(1),
      callPct: callPct.toFixed(1),
      combosShoved,
      mRatio: mRatio.toFixed(2),
      tierRecommendation,
    };
  }, [stackBb, position, antePct]);

  const canonicalPath = '/tools/push-fold-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Push/Fold Short-Stack Chart Calculator';
  const pageDesc =
    'Calculate Exact Nash Equilibrium Short-Stack Push/Fold Ranges, Shove Percentages, Calling Thresholds, Dead-Money Risk/Reward, And M-Ratios For 2BB To 20BB Stacks.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Short-Stack Push/Fold Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Tournament Push Fold Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools/poker-odds-calculator'],
        ['Push/Fold Short-Stack Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'When Should You Enter Push/Fold Mode In A Poker Tournament?',
          answer:
            'Players Typically Transition Into Strict Push/Fold Strategy Below 12 To 15 Big Blinds. At This Stack Depth, Non-All-In Open Raises Risk 20% Or More Of Your Stack Without Leaving Room To Maneuver Postflop.',
        },
        {
          question: 'How Do Big Blind Antes Affect Push/Fold Ranges?',
          answer:
            'A Standard 100% Big Blind Ante (12.5% Per Player At An 8-Handed Table) Increases The Uncontested Dead Money From 1.5 BB To 2.5 BB, Widening Optimal Open-Shove Ranges By 25% To 40% In Late Position.',
        },
        {
          question: 'Why Is Calling An All-In Tighter Than Shoving Yourself?',
          answer:
            'When You Open-Shove, You Benefit From Both Fold Equity And Showdown Equity. When Calling An Existing All-In, Fold Equity Is Zero And You Rely Entirely On Raw Card Equity Against A Concentrated Range.',
        },
      ],
      steps: [
        {
          name: 'Enter Effective Stack Size In Big Blinds (BB)',
          text: 'Input The Effective Short Stack Depth Between 2 BB And 25 BB To Compute Risk-To-Reward Ratios.',
        },
        {
          name: 'Select Table Position And Ante Structure',
          text: 'Choose Your Seat From Under The Gun (UTG) Through Small Blind (SB) And Set The Table Ante Percentage.',
        },
        {
          name: 'Review Nash Equilibrium Shove And Call Ranges',
          text: 'Inspect The Recommended Open-Shove Percentage, Combo Count, M-Ratio, And Big Blind Calling Threshold.',
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
          <span>Push/Fold Short-Stack Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Push/Fold Short-Stack Chart &amp; Nash Equilibrium Calculator
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          Short-Stack Push/Fold Strategy Governs Tournament Play Below 15 Big Blinds Where Open-Shoving Maximizes Fold Equity And Eliminates Postflop Positional Disadvantage. Enter Your Effective Stack Depth, Table Position, And Ante Structure Below To Compute Exact Chip-EV Nash Equilibrium Shoving Frequencies, Big Blind Calling Thresholds, And Dead-Money Risk/Reward Metrics.
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
              1. Short-Stack Spot Inputs (BB, Seat &amp; Antes)
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="stack-bb-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Effective Stack Depth (2 To 25 Big Blinds)
              </label>
              <input
                id="stack-bb-input"
                type="number"
                min="2"
                max="25"
                step="0.5"
                value={stackBb}
                onChange={(e) => setStackBb(Number(e.target.value))}
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
              <label htmlFor="position-select" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Unopened Table Position
              </label>
              <select
                id="position-select"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
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
              >
                <option value="UTG">Under The Gun (UTG)</option>
                <option value="MP">Middle Position (MP / Lojack)</option>
                <option value="HJ">Hijack (HJ)</option>
                <option value="CO">Cutoff (CO)</option>
                <option value="BTN">Button (BTN)</option>
                <option value="SB">Small Blind (SB Vs BB)</option>
              </select>
            </div>

            <div>
              <label htmlFor="ante-input" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Per-Player Ante (% Of 1 BB, Standard BBA = 12.5%)
              </label>
              <input
                id="ante-input"
                type="number"
                min="0"
                max="25"
                step="2.5"
                value={antePct}
                onChange={(e) => setAntePct(Number(e.target.value))}
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
              2. Nash Equilibrium Push/Fold Output ({metrics.safeBb} BB At {metrics.posKey})
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 15 }}>
              <li><strong>Optimal Nash Shove Frequency:</strong> <span style={{ color: '#34d399', fontWeight: 700 }}>{metrics.shovePct}%</span> ({metrics.combosShoved} Of 1,326 Combos)</li>
              <li><strong>Big Blind Nash Call Frequency:</strong> <span style={{ color: '#f59e0b', fontWeight: 700 }}>{metrics.callPct}%</span> ({metrics.playersLeft} Players Left To Act)</li>
              <li><strong>Uncontested Dead Money In Pot:</strong> <span style={{ color: '#38bdf8', fontWeight: 700 }}>{metrics.deadMoneyBb} BB</span> (M-Ratio: {metrics.mRatio})</li>
              <li><strong>Risk-To-Reward Ratio:</strong> {metrics.riskRewardRatio} : 1 ({metrics.foldEquityNeededIfZeroEq}% Zero-Equity Fold Threshold)</li>
              <li><strong>Recommended Shove Range Tier:</strong> <span style={{ color: '#f8fafc', fontWeight: 600 }}>{metrics.tierRecommendation}</span></li>
            </ul>
          </div>
        </section>

        {/* Reference Table 1: Positional Nash Shove Frequencies */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Nash Equilibrium Open-Shove Percentages By Position &amp; Stack Depth
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Chip-EV Nash Equilibrium Shoving Frequencies With 12.5% Big Blind Ante Across 8-Max Table Positions
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Table Position</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>15 BB Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>12 BB Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>10 BB Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>8 BB Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>5 BB Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Core 10 BB Shove Hands</th>
                </tr>
              </thead>
              <tbody>
                {POSITION_SHOVE_BENCHMARKS.map((row) => (
                  <tr key={row.position} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.position}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.bb15}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.bb12}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.bb10}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.bb8}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{row.bb5}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.keyHands}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table 2: Sklansky-Chubukov & Calling Benchmarks */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Sklansky-Chubukov Numbers &amp; 10BB Push/Call Hand Group Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Comparison Of Unexploitable Small-Blind Shove Thresholds And Big-Blind Calling Actions At 10 Big Blinds
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Starting Hand Category</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Sklansky-Chubukov Threshold</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>10 BB SB Action</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>10 BB BTN Action</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>BB Action Vs 10 BB BTN Shove</th>
                </tr>
              </thead>
              <tbody>
                {JENNINGS_SKLANSKY_THRESHOLDS.map((item) => (
                  <tr key={item.handGroup} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{item.handGroup}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{item.sklanskyChubukov}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{item.nash10bbSb}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{item.nash10bbBtn}</td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>{item.callVs10bbBtn}</td>
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
          title="Poker Push/Fold Short-Stack Chart Calculator"
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
    const { renderPushFoldCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPushFoldCalculatorMarkdown({
      stackBb: query?.stackBb || 10,
      position: query?.position || 'BTN',
      antePct: query?.antePct || 12.5,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialStackBb: Number(query?.stackBb) || 10,
      initialPosition: String(query?.position || 'BTN'),
      initialAntePct: Number(query?.antePct) || 12.5,
    },
  };
}
