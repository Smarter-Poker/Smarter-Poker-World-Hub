/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PRE-FLOP ISOLATION RAISE SIZING CALCULATOR (/tools/iso-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive pre-flop isolation raise sizing solver against live and online
 * limpers based on Hero position, number of limpers, effective stack depth,
 * and game environment.
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

const ISO_BENCHMARK_TABLE = [
  {
    scenario: '1 Limper, Hero In Position (Online 3BB Base)',
    isoFormula: '3.0 BB Base + 1.0 BB Limper = 4.0 BB',
    headsUpFlopPot: '9.5 BB',
    flopSprAt100Bb: '10.11 SPR',
    recommendedRange: 'Top 18% Merged Linear (77+, A8s+, KTs+, QTs+, J9s+, ATo+, KJo+)',
  },
  {
    scenario: '1 Limper, Hero Out Of Position In SB/BB (Online)',
    isoFormula: '3.0 BB Base + 1.0 BB Limper + 1.0 BB OOP = 5.0 BB',
    headsUpFlopPot: '10.5 BB',
    flopSprAt100Bb: '9.05 SPR',
    recommendedRange: 'Top 12% Value Heavy (88+, A9s+, KJs+, QJs, AJo+, KQo)',
  },
  {
    scenario: '2 Limpers, Hero In Position (Live Low-Stakes 4BB Base)',
    isoFormula: '4.0 BB Base + 2.0 BB Limpers = 6.0 BB',
    headsUpFlopPot: '14.5 BB',
    flopSprAt100Bb: '6.48 SPR',
    recommendedRange: 'Top 15% Linear Value + Suited Broadways',
  },
  {
    scenario: '3 Limpers, Hero Out Of Position In Blinds (Live Cash)',
    isoFormula: '4.0 BB Base + 3.0 BB Limpers + 1.5 BB OOP = 8.5 BB',
    headsUpFlopPot: '20.5 BB',
    flopSprAt100Bb: '4.46 SPR (Low-SPR Top-Pair Commitment Zone)',
    recommendedRange: 'Top 12% Value Heavy (99+, ATs+, KQs, AQo+)',
  },
  {
    scenario: '4+ Family Pot Limpers (Deep Live $1/$3 Or $2/$5)',
    isoFormula: '4.0 BB Base + 4.0 BB Limpers + 0.5 BB Deep = 8.5 - 10.0 BB',
    headsUpFlopPot: '22.5 - 25.5 BB',
    flopSprAt100Bb: '3.50 - 4.00 SPR',
    recommendedRange: 'Strict High-Equity Linear Value (TT+, AJs+, KQs, AKo)',
  },
];

const ISO_CALCULATOR_FAQS = [
  {
    question: 'What Is The Standard Pre-Flop Isolation Raise Sizing Formula Against Limpers?',
    answer:
      'The Classic Solver-Approved Isolation Formula Is Base Open (3 BB Online Or 4 BB In Live Low-Stakes Cash) Plus 1 BB For Every Limper, Plus An Additional 1.0 BB To 1.5 BB When Isolating Out Of Position From The Small Blind Or Big Blind.',
  },
  {
    question: 'Why Do You Size Larger When Isolating Limpers From The Blinds?',
    answer:
      'When You Raise Over Limpers From The Small Blind Or Big Blind, You Will Act First On All Three Postflop Streets (Out Of Position). Sizing Up By An Extra 1.0 BB To 1.5 BB Maximizes Pre-Flop Fold Equity Against Weak Limping Ranges And Lowers The Postflop Stack-To-Pot Ratio (SPR), Which Reduces Positional Disadvantage.',
  },
  {
    question: 'Should Your Isolation Range Be Polarized Or Merged Linear?',
    answer:
      'Because Limpers Rarely Back-Raise 3-Bet And Frequently Call Too Wide With Dominated Offsuit Broadways And Weak Aces, Your Isolation Range Should Always Be A Merged Linear Value Range (Top 12% Value Heavy Out Of Position Or Top 18% Merged Linear In Position) Rather Than A Polarized Bluff Range.',
  },
];

export default function IsoCalculatorPage({
  initialBigBlind = 5,
  initialLimpers = 2,
  initialPosition = 'IP',
  initialStackBb = 100,
  initialEnvironment = 'live',
}) {
  const router = useRouter();
  const [bigBlind, setBigBlind] = useState(initialBigBlind);
  const [limpers, setLimpers] = useState(initialLimpers);
  const [position, setPosition] = useState(initialPosition);
  const [stackBb, setStackBb] = useState(initialStackBb);
  const [environment, setEnvironment] = useState(initialEnvironment);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.bb !== undefined) setBigBlind(Math.max(0.1, Number(q.bb) || 5));
    if (q.limpers !== undefined) setLimpers(Math.max(1, Math.min(6, Math.round(Number(q.limpers) || 2))));
    if (q.pos !== undefined) setPosition(String(q.pos).toUpperCase() === 'OOP' ? 'OOP' : 'IP');
    if (q.stack !== undefined) setStackBb(Math.max(20, Math.min(500, Number(q.stack) || 100)));
    if (q.env !== undefined) setEnvironment(String(q.env).toLowerCase() === 'online' ? 'online' : 'live');
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safeBb = Math.max(0.1, Number(bigBlind) || 5);
    const safeLimpers = Math.max(1, Math.min(6, Math.round(Number(limpers) || 2)));
    const isIp = position === 'IP';
    const safeStackBb = Math.max(20, Math.min(500, Number(stackBb) || 100));
    const isLive = environment !== 'online';

    const baseBb = isLive ? 4.0 : 3.0;
    const oopPenaltyBb = isIp ? 0 : isLive ? 1.5 : 1.0;
    const deepBonusBb = safeStackBb >= 150 ? 0.5 : 0;

    const rawIsoBb = baseBb + safeLimpers * 1.0 + oopPenaltyBb + deepBonusBb;
    const optimalIsoBb = Math.min(safeStackBb, Math.round(rawIsoBb * 2) / 2);
    const optimalIsoDollars = optimalIsoBb * safeBb;

    // Dead money before ISO: 1.5 BB blinds + safeLimpers * 1.0 BB
    const deadMoneyBb = 1.5 + safeLimpers * 1.0;
    const deadMoneyDollars = deadMoneyBb * safeBb;

    // Resulting Heads-Up Flop Pot Size (assuming 1 limper calls and others fold, plus blinds dead money)
    // Wait: if Hero is in BB/SB, one of the blinds is Hero, but standard approximation: 2 * optimalIsoBb + (safeLimpers - 1) * 1.0 + (isIp ? 1.5 : 0.5)
    const deadUncontestedBb = isIp ? 1.5 + (safeLimpers - 1) * 1.0 : 0.5 + (safeLimpers - 1) * 1.0;
    const headsUpFlopPotBb = optimalIsoBb * 2 + deadUncontestedBb;
    const headsUpFlopPotDollars = headsUpFlopPotBb * safeBb;

    const remainingEffectiveStackBb = Math.max(0, safeStackBb - optimalIsoBb);
    const flopSpr = headsUpFlopPotBb > 0 ? remainingEffectiveStackBb / headsUpFlopPotBb : 0;

    const rangeTier =
      !isIp || safeLimpers >= 3
        ? 'Top 12% Value Heavy (88+, ATs+, KJs+, QJs, AJo+, KQo)'
        : 'Top 18% Merged Linear (66+, A7s+, K9s+, Q9s+, J9s+, T9s, ATo+, KJo+)';

    return {
      safeBb,
      safeLimpers,
      isIp,
      safeStackBb,
      isLive,
      optimalIsoBb: optimalIsoBb.toFixed(1),
      optimalIsoDollars: Math.round(optimalIsoDollars),
      deadMoneyBb: deadMoneyBb.toFixed(1),
      deadMoneyDollars: Math.round(deadMoneyDollars),
      headsUpFlopPotBb: headsUpFlopPotBb.toFixed(1),
      headsUpFlopPotDollars: Math.round(headsUpFlopPotDollars),
      flopSpr: flopSpr.toFixed(2),
      rangeTier,
    };
  }, [bigBlind, limpers, position, stackBb, environment]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/iso-calculator?bb=${metrics.safeBb}&limpers=${metrics.safeLimpers}&pos=${metrics.isIp ? 'IP' : 'OOP'}&stack=${metrics.safeStackBb}&env=${metrics.isLive ? 'live' : 'online'}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/iso-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Optimal Pre-Flop Isolation Raise Sizing Against Live And Online Limpers Based On Position, Effective Stack Depth, And Rake Structure.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Pre-Flop Isolation Raise Sizing Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Pre-Flop Isolation Raise Sizing Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Pre-Flop Isolation Calculator', canonicalPath],
      ],
      faqs: ISO_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Size Pre-Flop Isolation Raises Against Limpers',
        description: pageDesc,
        steps: [
          {
            name: 'Select Game Environment And Big Blind Dollar Size',
            text: 'Choose Between Live Low-Stakes (4BB Base) Or Online / Tight (3BB Base) And Input Your Big Blind Stake.',
          },
          {
            name: 'Enter Number Of Limpers (1 To 6) And Hero Position (IP Vs OOP)',
            text: 'Specify How Many Players Limped Ahead Of You And Whether You Are In Position (BTN/CO) Or Out Of Position (SB/BB).',
          },
          {
            name: 'Apply Optimal ISO Sizing, Flop SPR, And Recommended Range Tier',
            text: 'Use The Computed Big Blind And Dollar Raise Size Along With The Recommended Merged Linear Hand Range.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Pre-Flop Isolation Raise Sizing Calculator"
        description="Calculate Optimal Pre-Flop Isolation Raise Sizing Against Live And Online Limpers Based On Position, Effective Stack Depth, And Rake Structure."
        canonical="/tools/iso-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Pre-Flop Isolation Raise Sizing Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Pre-Flop Isolation Raise Sizing Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> To Isolate Open-Limpers Profitably And Force Heads-Up Postflop Pots, Raise To <strong>3 BB (Online) Or 4 BB (Live) Plus 1 BB Per Limper</strong> When In Position, And Add An Extra <strong>+1.0 To +1.5 BB When Out Of Position</strong> In The Blinds.
          </p>
        )}

        {/* Interactive ISO Solver */}
        <section
          aria-label="Interactive Pre-Flop Isolation Raise Calculator"
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
              Interactive ISO Raise Sizing &amp; Flop SPR Solver
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Big Blind ($)
                <input
                  type="number"
                  min="0.1"
                  step="1"
                  value={bigBlind}
                  onChange={(e) => setBigBlind(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#34d399',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Number Of Limpers (1 To 6)
                <select
                  value={limpers}
                  onChange={(e) => setLimpers(Number(e.target.value))}
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
                  <option value={1}>1 Limper</option>
                  <option value={2}>2 Limpers</option>
                  <option value={3}>3 Limpers</option>
                  <option value={4}>4 Limpers</option>
                  <option value={5}>5 Limpers</option>
                  <option value={6}>6 Limpers (Family Pot)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Hero Position
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
                    color: '#25c8ff',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value="IP">In Position (BTN/CO)</option>
                  <option value="OOP">Out Of Position (SB/BB)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack (BB)
                <input
                  type="number"
                  min="20"
                  max="500"
                  step="10"
                  value={stackBb}
                  onChange={(e) => setStackBb(e.target.value)}
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
                Game Environment
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
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
                >
                  <option value="live">Live Low-Stakes (4BB Base)</option>
                  <option value="online">Online / Tight (3BB Base)</option>
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Optimal ISO Raise Size
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.optimalIsoBb} BB (${metrics.optimalIsoDollars})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.isIp ? 'In-Position Isolation' : 'Out-Of-Position Blind Isolation'}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Resulting Heads-Up Flop Pot
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.headsUpFlopPotBb} BB (${metrics.headsUpFlopPotDollars})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Dead Money Captured: {metrics.deadMoneyBb} BB (${metrics.deadMoneyDollars})
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Resulting Flop Stack-To-Pot Ratio
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.flopSpr} SPR
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                At {metrics.safeStackBb} BB Effective Starting Depth
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Recommended ISO Range Tier
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', marginTop: 6, lineHeight: 1.45 }}>
                {metrics.rangeTier}
              </div>
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Pre-Flop Isolation Raise Sizing &amp; Range Construction Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Standard Pre-Flop Isolation Raise Formulas, Flop Pot Sizes, Resulting SPR, And Recommended Hand Ranges
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Limper Scenario</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>ISO Sizing Formula</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Heads-Up Flop Pot</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flop SPR (100BB)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended ISO Range Tier</th>
                </tr>
              </thead>
              <tbody>
                {ISO_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.isoFormula}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.headsUpFlopPot}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.flopSprAt100Bb}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.recommendedRange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Preflop &amp; Postflop Sizing Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/3bet-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              GTO 3-Bet, Squeeze &amp; 4-Bet Calculator
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              SPR &amp; Geometric Bet Sizing Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Range Matrix
            </Link>
            <Link href="/tools/rake-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Live Cash Game Rake Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={ISO_CALCULATOR_FAQS} />

            <CitationBacklinkBox
              title="Pre-Flop Isolation Raise Sizing Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Pre-Flop ISO Sizing Solver"
              badgeValue="Limper Isolation & Flop SPR"
              summary="Interactive Pre-Flop Isolation Raise Sizing Calculator Against Live And Online Limpers With Resulting Flop SPR And Range Tiers."
              slug="iso-calculator"
            />

            <AiPromptLauncher
              title="Pre-Flop Isolation Raise Sizing Calculator"
              canonicalUrl={canonicalUrl}
              markdownUrl={`${canonicalUrl}.md`}
            />
          </>
        )}
      </main>
    </div>
  );
}
