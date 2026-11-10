/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER OUTS & DRAW PROBABILITY CALCULATOR (/tools/outs-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive postflop poker outs calculator computing exact hypergeometric
 * turn, river, and combined flop-to-river draw equity, Rule of 4 and 2 error,
 * required break-even pot odds, and minimum implied odds.
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
import { renderOutsCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const DRAW_PRESETS = [
  { id: 'gutshot', label: 'Gutshot (4 Outs)', outs: 4 },
  { id: 'overcards', label: 'Two Overcards (6 Outs)', outs: 6 },
  { id: 'set-boat', label: 'Set To Full House (7 Outs)', outs: 7 },
  { id: 'oesd', label: 'Open-Ended Straight Draw (8 Outs)', outs: 8 },
  { id: 'flush', label: 'Flush Draw (9 Outs)', outs: 9 },
  { id: 'pair-flush', label: 'Pair + Flush Draw (14 Outs)', outs: 14 },
  { id: 'combo-draw', label: 'Combo Flush + OESD (15 Outs)', outs: 15 },
];

const OUTS_REFERENCE_TABLE = [
  {
    drawType: 'Pocket Pair To Set (2 Outs)',
    outs: 2,
    turnHitPct: '4.26% (22.5 : 1)',
    riverHitPct: '4.35% (22.0 : 1)',
    flopToRiverPct: '8.42% (10.9 : 1)',
    ruleOf4Error: '-0.42% (Rule Gives 8.0%)',
  },
  {
    drawType: 'Gutshot Straight Draw (4 Outs)',
    outs: 4,
    turnHitPct: '8.51% (10.8 : 1)',
    riverHitPct: '8.70% (10.5 : 1)',
    flopToRiverPct: '16.47% (5.1 : 1)',
    ruleOf4Error: '-0.47% (Rule Gives 16.0%)',
  },
  {
    drawType: 'Two Overcards To Top Pair (6 Outs)',
    outs: 6,
    turnHitPct: '12.77% (6.8 : 1)',
    riverHitPct: '13.04% (6.7 : 1)',
    flopToRiverPct: '24.14% (3.1 : 1)',
    ruleOf4Error: '-0.14% (Rule Gives 24.0%)',
  },
  {
    drawType: 'Open-Ended Straight Draw (8 Outs)',
    outs: 8,
    turnHitPct: '17.02% (4.9 : 1)',
    riverHitPct: '17.39% (4.8 : 1)',
    flopToRiverPct: '31.45% (2.2 : 1)',
    ruleOf4Error: '+0.55% (Rule Gives 32.0%)',
  },
  {
    drawType: 'Standard Flush Draw (9 Outs)',
    outs: 9,
    turnHitPct: '19.15% (4.2 : 1)',
    riverHitPct: '19.57% (4.1 : 1)',
    flopToRiverPct: '34.97% (1.86 : 1)',
    ruleOf4Error: '+1.03% (Rule Gives 36.0%)',
  },
  {
    drawType: 'Flush Draw + Gutshot (12 Outs)',
    outs: 12,
    turnHitPct: '25.53% (2.9 : 1)',
    riverHitPct: '26.09% (2.8 : 1)',
    flopToRiverPct: '44.96% (1.22 : 1)',
    ruleOf4Error: '+3.04% (Rule Gives 48.0%)',
  },
  {
    drawType: 'Combo Flush + Open-Ended Straight (15 Outs)',
    outs: 15,
    turnHitPct: '31.91% (2.1 : 1)',
    riverHitPct: '32.61% (2.1 : 1)',
    flopToRiverPct: '54.12% (0.85 : 1 Favorite)',
    ruleOf4Error: '+5.88% Overestimate (Rule Gives 60.0%)',
  },
];

const OUTS_CALCULATOR_FAQS = [
  {
    question: 'How Do You Calculate Exact Flop-To-River Draw Probability?',
    answer:
      'On The Flop, 5 Cards Are Known (2 Hole Cards + 3 Flop Cards), Leaving 47 Unseen Cards. The Exact Probability Of Hitting At Least One Out Across Both The Turn And River Is 1 - ((47 - Outs) / 47) * ((46 - Outs) / 46). For A 9-Out Flush Draw, That Equals 1 - (38/47)*(37/46) = 34.97%.',
  },
  {
    question: 'When Does The Rule Of 4 And 2 Break Down In Poker?',
    answer:
      'Multiplying Outs By 4 On The Flop Works Accurately Between 1 And 8 Outs, Where The Approximation Error Stays Below 0.6%. However, For Big Combo Draws With 12 To 17 Outs, The Rule Of 4 Overestimates Your True Equity By 3.0% To 8.5% Because It Double-Counts Runouts Where Both The Turn And River Hit.',
  },
  {
    question: 'How Do You Calculate Minimum Implied Odds Needed When Pot Odds Are Too Small?',
    answer:
      'Divide Your Call Amount By Your Exact Hit Probability (In Decimal Form) To Find The Total Final Pot Required To Break Even, Then Subtract The Current Pot Plus Your Call. The Remainder Is The Exact Minimum Extra Dollars You Must Win On Future Streets When You Hit.',
  },
];

export default function OutsCalculatorPage({
  initialOuts = 9,
  initialStreet = 'flop',
  initialPotSize = 100,
  initialCallSize = 50,
}) {
  const router = useRouter();
  const [outs, setOuts] = useState(initialOuts);
  const [street, setStreet] = useState(initialStreet);
  const [potSize, setPotSize] = useState(initialPotSize);
  const [callSize, setCallSize] = useState(initialCallSize);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.outs !== undefined) setOuts(Math.max(1, Math.min(21, Math.round(Number(q.outs) || 9))));
    if (q.street !== undefined) setStreet(String(q.street).toLowerCase() === 'turn' ? 'turn' : 'flop');
    if (q.pot !== undefined) setPotSize(Math.max(1, Number(q.pot) || 100));
    if (q.call !== undefined) setCallSize(Math.max(0, Number(q.call) || 50));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safeOuts = Math.max(1, Math.min(21, Math.round(Number(outs) || 9)));
    const isTurn = street === 'turn';
    const safePot = Math.max(1, Number(potSize) || 100);
    const safeCall = Math.max(0, Number(callSize) || 0);

    const turnHitProb = safeOuts / 47;
    const riverHitProb = safeOuts / 46;
    const flopToRiverHitProb = 1 - ((47 - safeOuts) / 47) * ((46 - safeOuts) / 46);

    const activeExactProb = isTurn ? riverHitProb : flopToRiverHitProb;
    const activeExactPct = activeExactProb * 100;

    const ruleApproxPct = isTurn ? safeOuts * 2 : safeOuts * 4;
    const approxErrorPct = ruleApproxPct - activeExactPct;

    const oddsAgainstRatio = activeExactProb > 0 ? (1 - activeExactProb) / activeExactProb : 0;

    // Pot odds math (assuming safePot is the pot AFTER villain's bet, or total pot before hero calls)
    const totalPotAfterCall = safePot + safeCall;
    const requiredBreakEvenPct = totalPotAfterCall > 0 ? (safeCall / totalPotAfterCall) * 100 : 0;
    const isDirectCallProfitable = activeExactPct >= requiredBreakEvenPct;

    // Minimum implied odds needed when direct equity < requiredBreakEvenPct
    const breakEvenTotalPotNeeded = activeExactProb > 0 ? safeCall / activeExactProb : 0;
    const minImpliedOddsDollars = Math.max(0, breakEvenTotalPotNeeded - totalPotAfterCall);

    return {
      safeOuts,
      isTurn,
      safePot,
      safeCall,
      turnHitPct: (turnHitProb * 100).toFixed(2),
      riverHitPct: (riverHitProb * 100).toFixed(2),
      flopToRiverPct: (flopToRiverHitProb * 100).toFixed(2),
      activeExactPct: activeExactPct.toFixed(2),
      ruleApproxPct: ruleApproxPct.toFixed(1),
      approxErrorPct: (approxErrorPct >= 0 ? `+${approxErrorPct.toFixed(2)}` : approxErrorPct.toFixed(2)),
      oddsAgainstRatio: oddsAgainstRatio.toFixed(2),
      requiredBreakEvenPct: requiredBreakEvenPct.toFixed(2),
      isDirectCallProfitable,
      minImpliedOddsDollars: Math.round(minImpliedOddsDollars),
    };
  }, [outs, street, potSize, callSize]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/outs-calculator?outs=${metrics.safeOuts}&street=${metrics.isTurn ? 'turn' : 'flop'}&pot=${metrics.safePot}&call=${metrics.safeCall}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/outs-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Interactive Postflop Poker Outs Calculator With Exact Turn, River, And Flop-To-River Draw Equity, Rule Of 4 And 2 Comparison, And Pot Odds.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Outs & Draw Probability Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Postflop Outs & Draw Probability Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Outs Calculator', canonicalPath],
      ],
      faqs: OUTS_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Calculate Exact Poker Outs And Draw Equity',
        description: pageDesc,
        steps: [
          {
            name: 'Select A Draw Preset Or Drag The Outs Slider (1 To 21 Outs)',
            text: 'Choose Flush Draw (9 Outs), Open-Ended Straight Draw (8 Outs), Gutshot (4 Outs), Or Any Combo Draw.',
          },
          {
            name: 'Toggle Flop (47 Unseen Cards) Or Turn (46 Unseen Cards)',
            text: 'Specify Whether You Have Two Cards To Come (Flop-To-River) Or One Card To Come (Turn-To-River).',
          },
          {
            name: 'Compare Exact Hypergeometric Equity Against Pot Odds And Implied Odds',
            text: 'Enter Current Pot Size And Call Amount To See Whether A Direct Call Is Profitable Or How Much Implied Value You Need.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Outs & Draw Probability Calculator"
        description="Interactive Postflop Poker Outs Calculator With Exact Turn, River, And Flop-To-River Draw Equity, Rule Of 4 And 2 Comparison, And Pot Odds."
        canonical="/tools/outs-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Poker Outs &amp; Draw Probability Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Outs &amp; Draw Probability Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> With <strong>47 Unseen Cards On The Flop</strong> And <strong>46 On The Turn</strong>, A 9-Out Flush Draw Hits On The Turn <strong>19.15% Of The Time</strong>, On The River <strong>19.57% Of The Time</strong>, And Across Both Streets Combined <strong>34.97% Of The Time</strong> (Versus 36.0% Using The Rule Of 4).
          </p>
        )}

        {/* Interactive Outs Panel */}
        <section
          aria-label="Interactive Poker Outs Calculator"
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
              Interactive Hypergeometric Outs &amp; Implied Odds Solver
            </h2>
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
          </div>

          {/* Draw Preset Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {DRAW_PRESETS.map((preset) => {
              const active = Number(outs) === preset.outs;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setOuts(preset.outs)}
                  style={{
                    padding: '8px 14px',
                    background: active ? '#25c8ff' : '#020608',
                    border: active ? '1px solid #25c8ff' : '1px solid #334155',
                    borderRadius: '2px',
                    color: active ? '#020608' : '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Controls Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Clean Outs ({metrics.safeOuts} Outs: Slider 1 To 21)
                <input
                  type="range"
                  min="1"
                  max="21"
                  step="1"
                  value={outs}
                  onChange={(e) => setOuts(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 12, accentColor: '#25c8ff', cursor: 'pointer' }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Active Street &amp; Unseen Deck
                <select
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
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
                  <option value="flop">Flop (47 Unseen Cards)</option>
                  <option value="turn">Turn (46 Unseen Cards)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Pot Size Before Call ($)
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={potSize}
                  onChange={(e) => setPotSize(e.target.value)}
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
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Call Size Required ($)
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={callSize}
                  onChange={(e) => setCallSize(e.target.value)}
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

          {/* KPI Output Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Turn Hit % (1 Card) / River Hit %
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.turnHitPct}% / {metrics.riverHitPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeOuts}/47 On Turn | {metrics.safeOuts}/46 On River
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Combined Flop-To-River Hit %
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.flopToRiverPct}% ({metrics.oddsAgainstRatio} : 1)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Exact Hypergeometric 2-Card Equity
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Rule Of {metrics.isTurn ? '2' : '4'} Approximation Error
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {metrics.ruleApproxPct}% ({metrics.approxErrorPct}%)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Active Exact Equity: {metrics.activeExactPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Break-Even Pot Odds &amp; Implied Odds
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: metrics.isDirectCallProfitable ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                Need {metrics.requiredBreakEvenPct}% ({metrics.isDirectCallProfitable ? '+EV Direct Call' : `Need $${metrics.minImpliedOddsDollars} Implied`})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Calling ${metrics.safeCall} Into ${metrics.safePot} Pot
              </div>
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Exact Hypergeometric Poker Outs &amp; Rule Of 4 And 2 Reference Chart
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Comparison Of Exact Turn, River, And Combined Flop-To-River Probabilities Against The Rule Of 4 And 2
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Postflop Draw Type</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Clean Outs</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Turn Hit % (47 Cards)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>River Hit % (46 Cards)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flop-To-River Hit %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Rule Of 4 Divergence</th>
                </tr>
              </thead>
              <tbody>
                {OUTS_REFERENCE_TABLE.map((row) => (
                  <tr key={row.drawType} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.drawType}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.outs} Outs</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.turnHitPct}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.riverHitPct}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.flopToRiverPct}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b' }}>{row.ruleOf4Error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Postflop Equity &amp; Pot Odds Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Multiway Hand-Vs-Hand Equity Calculator
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              SPR &amp; Geometric Bet Sizing Calculator
            </Link>
            <Link href="/tools/plo-bet-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              PLO Max Bet &amp; Bomb Pot Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={OUTS_CALCULATOR_FAQS} />

            <CitationBacklinkBox
              title="Poker Outs & Draw Probability Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Hypergeometric Draw Engine"
              badgeValue="Exact Turn, River & Implied Odds"
              summary="Interactive Postflop Poker Outs Calculator Computing Exact Turn, River, And Flop-To-River Draw Probabilities And Implied Odds."
              slug="outs-calculator"
            />

            <AiPromptLauncher
              title="Poker Outs & Draw Probability Calculator"
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
      renderOutsCalculatorMarkdown({
        outs: query?.outs,
      });
    const md = renderToolDocumentationMarkdown('outs-calculator');
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
