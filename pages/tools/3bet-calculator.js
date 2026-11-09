/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GTO PREFLOP 3-BET, 4-BET, SQUEEZE & MINIMUM DEFENSE CALCULATOR
 *  (/tools/3bet-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive In-Position (IP) and Out-Of-Position (OOP) 3-bet, squeeze, 4-bet,
 * and Minimum Defense Frequency (MDF) solver at /tools/3bet-calculator.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const THREE_BET_BENCHMARK_TABLE = [
  {
    scenario: 'In-Position (IP) 3-Bet Vs 2.5 BB Open (100 BB)',
    sizingRule: '3.0x Open Size (7.5 BB)',
    potOddsOffered: '29.4% Equity Required',
    villainMdf: '40.0% Continue (Call + 4-Bet)',
    optimal4BetSize: '2.3x - 2.5x OOP 4-Bet (17.5 - 19.0 BB)',
    valueToBluffRatio: '1 : 1.0 Polarized Or Merged Linear IP',
  },
  {
    scenario: 'Out-Of-Position (OOP) SB/BB 3-Bet Vs 2.5 BB Open',
    sizingRule: '4.0x Open Size (10.0 BB)',
    potOddsOffered: '33.3% Equity Required',
    villainMdf: '33.3% Continue',
    optimal4BetSize: '2.1x - 2.2x IP 4-Bet (21.0 - 22.0 BB)',
    valueToBluffRatio: '1.2 : 1 Value-Heavy Linear Or High-Card Blockers',
  },
  {
    scenario: 'IP Squeeze Vs 2.5 BB Open + 1 Cold-Caller',
    sizingRule: '4.0x Open (3.0x + 1.0x Caller = 10.0 BB)',
    potOddsOffered: '31.9% Equity Required',
    villainMdf: '36.4% Combined Continue',
    optimal4BetSize: '2.3x OOP 4-Bet (23.0 BB)',
    valueToBluffRatio: '1.3 : 1 Value-Weighted Due To Multiway Callers',
  },
  {
    scenario: 'OOP Squeeze From Blinds Vs 2.5 BB Open + 1 Caller',
    sizingRule: '5.0x Open (4.0x + 1.0x Caller = 12.5 BB)',
    potOddsOffered: '35.7% Equity Required',
    villainMdf: '31.0% Combined Continue',
    optimal4BetSize: '2.15x IP 4-Bet (27.0 BB)',
    valueToBluffRatio: '1.5 : 1 Value-Weighted High-Card Broadway Blockers',
  },
  {
    scenario: 'Live Cash Game IP 3-Bet Vs 4.0 BB Open + 2 Callers',
    sizingRule: '5.0x Open (3.0x + 2.0x Callers = 20.0 BB)',
    potOddsOffered: '32.3% Equity Required',
    villainMdf: '35.0% Continue',
    optimal4BetSize: 'All-In Jam At 100 BB Or 45 BB Deepstack',
    valueToBluffRatio: '2.0 : 1 Heavily Value-Driven Against Loose Live Pools',
  },
];

export default function ThreeBetCalculatorPage({
  initialOpenSizeBb = 2.5,
  initialCallersBetween = 0,
  initialEffectiveStackBb = 100,
  initialPosition = 'IP',
}) {
  const [openSizeBb, setOpenSizeBb] = useState(initialOpenSizeBb);
  const [callersBetween, setCallersBetween] = useState(initialCallersBetween);
  const [effectiveStackBb, setEffectiveStackBb] = useState(initialEffectiveStackBb);
  const [position, setPosition] = useState(initialPosition);

  const metrics = useMemo(() => {
    const safeOpen = Math.max(2.0, Math.min(15.0, Number(openSizeBb) || 2.5));
    const safeCallers = Math.max(0, Math.min(7, Math.round(Number(callersBetween) || 0)));
    const safeStack = Math.max(15, Math.min(500, Number(effectiveStackBb) || 100));
    const isIp = position === 'IP';

    // Deepstack multiplier adjustment (>130 BB adds +0.5x to deny implied odds)
    const deepBonusMultiplier = safeStack >= 140 ? 0.5 : 0;
    const baseMultiplier = (isIp ? 3.0 : 4.0) + safeCallers * 1.0 + deepBonusMultiplier;
    const rawThreeBetBb = safeOpen * baseMultiplier;
    const recommendedThreeBetBb = Math.min(safeStack, Math.round(rawThreeBetBb * 2) / 2);

    // Dead money in pot before Hero 3-bets: 1.5 BB blinds + Open + Callers * Open
    const blindsDeadBb = 1.5;
    const potBeforeThreeBet = blindsDeadBb + safeOpen * (1 + safeCallers);
    const callNeededByOpener = Math.max(0, recommendedThreeBetBb - safeOpen);
    const potAfterOpenerCalls = potBeforeThreeBet + recommendedThreeBetBb + callNeededByOpener - safeOpen;
    const potOddsOfferedPct = (callNeededByOpener / Math.max(1, potAfterOpenerCalls)) * 100;

    // Villain Minimum Defense Frequency (1 - Risk / (Risk + Reward))
    // Hero risks recommendedThreeBetBb to win potBeforeThreeBet
    const heroRiskBb = recommendedThreeBetBb;
    const villainFoldEquityBreakEvenPct = (heroRiskBb / (heroRiskBb + potBeforeThreeBet)) * 100;
    const villainMdfPct = 100 - villainFoldEquityBreakEvenPct;

    // Villain's Optimal 4-Bet Size (Villain is OOP when Hero is IP, and IP when Hero is OOP)
    const villainIsIp = !isIp;
    const fourBetMultiplier = villainIsIp ? 2.15 : 2.45;
    const rawFourBetBb = recommendedThreeBetBb * fourBetMultiplier;
    const optimalFourBetBb =
      rawFourBetBb >= safeStack * 0.36
        ? safeStack
        : Math.round(rawFourBetBb * 2) / 2;

    const flopPotIfCalled = recommendedThreeBetBb * 2 + blindsDeadBb + safeCallers * safeOpen;
    const flopSprIfCalled = Math.max(0, (safeStack - recommendedThreeBetBb) / Math.max(1, flopPotIfCalled));

    return {
      safeOpen: safeOpen.toFixed(1),
      safeCallers,
      safeStack: safeStack.toFixed(0),
      isIp,
      baseMultiplier: baseMultiplier.toFixed(1),
      recommendedThreeBetBb: recommendedThreeBetBb.toFixed(1),
      callNeededByOpener: callNeededByOpener.toFixed(1),
      potOddsOfferedPct: potOddsOfferedPct.toFixed(1),
      villainFoldEquityBreakEvenPct: villainFoldEquityBreakEvenPct.toFixed(1),
      villainMdfPct: villainMdfPct.toFixed(1),
      optimalFourBetBb: optimalFourBetBb.toFixed(1),
      isFourBetAllIn: optimalFourBetBb >= safeStack,
      flopPotIfCalled: flopPotIfCalled.toFixed(1),
      flopSprIfCalled: flopSprIfCalled.toFixed(2),
      valueToBluffRatio: isIp ? '1.0 Value : 1.0 Bluff (50% Value)' : '1.3 Value : 1.0 Bluff (56.5% Value)',
    };
  }, [openSizeBb, callersBetween, effectiveStackBb, position]);

  const canonicalPath = '/tools/3bet-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'GTO 3-Bet, 4-Bet, Squeeze & MDF Sizing Calculator';
  const pageDesc =
    'Calculate Optimal In-Position (IP) And Out-Of-Position (OOP) 3-Bet, Multiway Squeeze, And 4-Bet Sizes In Big Blinds With Minimum Defense Frequency (MDF) And Resulting Flop SPR.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker GTO 3-Bet, 4-Bet & Minimum Defense Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'GTO Preflop 3-Bet & 4-Bet Sizing Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['3-Bet & 4-Bet Sizing Calculator', canonicalPath],
      ],
      faqs: [
        {
          question: 'What Is The Standard GTO 3-Bet Size In Position Vs Out Of Position?',
          answer:
            'At 100 Big Blinds Effective Depth, Solver-Approved GTO 3-Bet Sizing Is 3.0x The Open Size When In Position (For Example, 7.5 BB Against A 2.5 BB Open) And 4.0x The Open Size When Out Of Position In The Blinds (10.0 BB Against A 2.5 BB Open).',
        },
        {
          question: 'How Much Should You Add To A 3-Bet Squeeze For Each Caller?',
          answer:
            'Add 1.0x The Original Open Raise Size For Every Cold-Caller In Between, Plus An Extra 0.5x When Out Of Position Or Deeper Than 140 Big Blinds. Against A 2.5 BB Open And 1 Caller, Squeeze To 10.0 BB In Position (4x) Or 12.5 BB From The Blinds (5x).',
        },
        {
          question: 'What Is The Optimal 4-Bet Size In 100BB No-Limit Hold\'em?',
          answer:
            'When In Position Facing An Out-Of-Position 3-Bet, Optimal 4-Bet Sizing Is 2.1x To 2.2x The 3-Bet Size. When Out Of Position Facing An In-Position 3-Bet, Size Up To 2.4x To 2.5x The 3-Bet Size, Or Commit All-In Whenever A 4-Bet Exceeds 35% Of Your Effective Stack.',
        },
      ],
      howTo: {
        name: 'How To Calculate Optimal 3-Bet, Squeeze, And 4-Bet Sizes',
        description: pageDesc,
        steps: [
          {
            name: 'Select Open Raise Size And Number Of Cold-Callers',
            text: 'Enter Villain\'s Open Size In Big Blinds (2.0 BB To 6.0 BB) And Any Callers In Between.',
          },
          {
            name: 'Toggle In-Position (IP) Or Out-Of-Position (OOP) And Stack Depth',
            text: 'Specify Whether You Will Act Last Postflop (IP) Or First From The Blinds (OOP).',
          },
          {
            name: 'Read Recommended 3-Bet, Villain MDF, And 4-Bet Counter-Size',
            text: 'Apply The Computed 3-Bet Size, Resulting Flop SPR, And Balanced Value-To-Bluff Ratio.',
          },
        ],
      },
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>3-Bet &amp; 4-Bet Sizing Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          GTO Preflop 3-Bet, Squeeze, 4-Bet &amp; Minimum Defense Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> At 100BB Stack Depth, Optimal GTO 3-Bet Sizing Is <strong>3.0x The Open Size In Position (IP)</strong> And <strong>4.0x The Open Size Out Of Position (OOP)</strong>, Adding <strong>+1.0x Per Cold-Caller</strong> For Multiway Squeezes. When Facing A 3-Bet, Optimal 4-Bet Sizing Is <strong>2.15x In Position</strong> And <strong>2.45x Out Of Position</strong>.
        </p>

        {/* Interactive 3-Bet / 4-Bet Solver */}
        <section
          aria-label="Interactive 3-Bet And 4-Bet Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Interactive 3-Bet, Squeeze &amp; 4-Bet Sizing Solver
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Original Open Raise Size (BB)
                <input
                  type="number"
                  min="2.0"
                  max="15.0"
                  step="0.5"
                  value={openSizeBb}
                  onChange={(e) => setOpenSizeBb(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Cold-Callers In Between
                <input
                  type="number"
                  min="0"
                  max="7"
                  step="1"
                  value={callersBetween}
                  onChange={(e) => setCallersBetween(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack Depth (BB)
                <input
                  type="number"
                  min="15"
                  max="500"
                  step="5"
                  value={effectiveStackBb}
                  onChange={(e) => setEffectiveStackBb(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Postflop Position
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  <option value="IP">In Position (BTN / CO / HJ)</option>
                  <option value="OOP">Out Of Position (SB / BB)</option>
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Optimal {metrics.safeCallers > 0 ? 'Squeeze' : '3-Bet'} Size ({metrics.baseMultiplier}x)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.recommendedThreeBetBb} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Flop Pot: {metrics.flopPotIfCalled} BB · Flop SPR: {metrics.flopSprIfCalled}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Pot Odds Offered To Opener
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.potOddsOfferedPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Opener Calls {metrics.callNeededByOpener} BB More
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Villain Minimum Defense (MDF)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.villainMdfPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Break-Even Bluff Fold %: {metrics.villainFoldEquityBreakEvenPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Villain Optimal 4-Bet Size
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {metrics.optimalFourBetBb} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.isFourBetAllIn ? 'All-In Commitment Threshold Reached' : metrics.valueToBluffRatio}
              </div>
            </div>
          </div>
        </section>

        {/* Reference Table */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            GTO 3-Bet, Squeeze &amp; 4-Bet Sizing Reference Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Backed Preflop 3-Bet Multipliers, Pot Odds, Minimum Defense Frequencies, And 4-Bet Counters
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Preflop Configuration</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>GTO 3-Bet Rule</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot Odds Offered</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Villain MDF</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Optimal 4-Bet Counter</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Value : Bluff Construction</th>
                </tr>
              </thead>
              <tbody>
                {THREE_BET_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.sizingRule}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.potOddsOffered}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.villainMdf}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.optimal4BetSize}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.valueToBluffRatio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Preflop Range &amp; GTO Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              13x13 GTO Preflop Range Matrix
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              SPR &amp; Geometric Bet Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Short-Stack Push/Fold Charts
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
          </div>
        </section>

        <CitationBacklinkBox
          title="GTO Preflop 3-Bet, Squeeze, 4-Bet & Minimum Defense Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Preflop GTO Solver"
          badgeValue="3-Bet, Squeeze & 4-Bet Sizing"
          summary="Interactive GTO Preflop 3-Bet, Multiway Squeeze, 4-Bet, And Minimum Defense Frequency (MDF) Calculator."
          slug="3bet-calculator"
        />

        <AiPromptLauncher
          title="GTO Preflop 3-Bet, Squeeze, 4-Bet & Minimum Defense Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
