/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PLO WRAP, REDRAW & NUT-OUT ANALYZER (/tools/plo-outs-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive Pot-Limit Omaha wrap, flush redraw, and nut-out analyzer computing
 * exact Turn-only, River-only, and Flop-to-River combined equity percentages,
 * Nut Outs vs Non-Nut/Dirty Outs breakdown, and Pot-Limit max-call threshold.
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
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const PLO_WRAP_TYPES = [
  {
    id: 'wrap13',
    label: '13-Out Classic Straight Wrap',
    defaultTotalOuts: 13,
    defaultNutOuts: 13,
    defaultDirtyOuts: 0,
    exampleHand: 'J♠ T♥ 9♦ 4♣ On 8♠ 7♣ 2♦ Rainbow',
    tacticalNote: 'Classic 3-Card Around 2-Card Wrap: All 13 Straight Outs Make The Unbeatable Nut Straight.',
  },
  {
    id: 'wrap16',
    label: '16-Out Inside + Outside Wrap',
    defaultTotalOuts: 16,
    defaultNutOuts: 12,
    defaultDirtyOuts: 4,
    exampleHand: 'Q♠ J♥ 8♦ 6♣ On T♠ 9♣ 2♦ Rainbow',
    tacticalNote: '16-Out Wrap Where Bottom 4 Outs Can Be Dominated By Higher Broadway Straight Redraws.',
  },
  {
    id: 'wrap17',
    label: '17-Out Monster Broadway Wrap',
    defaultTotalOuts: 17,
    defaultNutOuts: 14,
    defaultDirtyOuts: 3,
    exampleHand: 'A♠ K♥ J♦ T♣ On Q♠ 9♣ 3♦ Rainbow',
    tacticalNote: '17-Out Wrap Plus Overcard Pair Blockers: Statistical Favorite Over Bare Top Set On Rainbow Flops.',
  },
  {
    id: 'wrap20',
    label: '20-Out Mega Wrap (4-Card Wrap)',
    defaultTotalOuts: 20,
    defaultNutOuts: 17,
    defaultDirtyOuts: 3,
    exampleHand: 'Q♠ J♥ 8♦ 7♣ On T♠ 9♣ 2♦ Rainbow',
    tacticalNote: 'Maximum 20-Out Straight Wrap: Any 6, 7, 8, J, Q, Or K Completes A Straight Across 20 Unseen Cards.',
  },
  {
    id: 'dsFlushWrap',
    label: 'Double-Suited Wrap + Nut Flush Redraw',
    defaultTotalOuts: 24,
    defaultNutOuts: 21,
    defaultDirtyOuts: 3,
    exampleHand: 'A♠ J♠ T♥ 9♥ On 8♠ 7♠ 2♥ Two-Tone',
    tacticalNote: 'Monster Combo Draw: 9 Nut Flush Outs Plus 12 Non-Overlapping Straight Wrap Outs Dominates All Made Hands.',
  },
  {
    id: 'topSetVsWrap',
    label: 'Top Set Redraw (Board Pair + Quads)',
    defaultTotalOuts: 10,
    defaultNutOuts: 10,
    defaultDirtyOuts: 0,
    exampleHand: 'Q♠ Q♥ A♦ K♣ On Q♦ 9♠ 8♣ Facing Made Straight',
    tacticalNote: '7 Flop-Pairing Turn Outs Plus 3 Backdoor Runner-Runner Full House Or Quad Equivalents.',
  },
  {
    id: 'overpairFlushVsSet',
    label: 'Overpair Aces + Nut Flush Draw Vs Set',
    defaultTotalOuts: 11,
    defaultNutOuts: 9,
    defaultDirtyOuts: 2,
    exampleHand: 'A♠ A♥ K♠ 4♦ On J♠ 8♠ 5♣ Vs Pocket Jacks',
    tacticalNote: '9 Clean Spade Outs (Minus Paired Board Outs) Plus 2 Remaining Aces For Higher Top Set.',
  },
];

const PLO_PRESETS = [
  {
    id: 'preset_20wrap',
    label: '20-Out Mega Wrap On Rainbow Flop',
    wrapType: 'wrap20',
    totalOuts: 20,
    nutOuts: 17,
    potSize: 120,
    betFacing: 120,
  },
  {
    id: 'preset_ds_monster',
    label: '24-Out Double-Suited Wrap + Flush Draw',
    wrapType: 'dsFlushWrap',
    totalOuts: 24,
    nutOuts: 21,
    potSize: 180,
    betFacing: 180,
  },
  {
    id: 'preset_13nut',
    label: '13-Out Pure Nut Wrap Facing Pot Bet',
    wrapType: 'wrap13',
    totalOuts: 13,
    nutOuts: 13,
    potSize: 90,
    betFacing: 90,
  },
  {
    id: 'preset_set_redraw',
    label: '10-Out Top Set Boat Redraw On Turn',
    wrapType: 'topSetVsWrap',
    totalOuts: 10,
    nutOuts: 10,
    potSize: 250,
    betFacing: 150,
  },
];

const PLO_WRAP_BENCHMARK_TABLE = [
  {
    drawName: '9-Out Bare Nut Flush Draw',
    totalOuts: '9 Outs (9 Nut)',
    turnHit: '20.0%',
    flopToRiver: '36.4%',
    vsTopSetAction: 'Check-Call Flop Pot Bet With Implied Odds Or Fold Without Redraws',
  },
  {
    drawName: '13-Out Classic Straight Wrap',
    totalOuts: '13 Outs (13 Nut)',
    turnHit: '28.9%',
    flopToRiver: '50.1%',
    vsTopSetAction: 'Coin-Flip Equity (49% Vs Set Redraws): Commit On Rainbow Boards',
  },
  {
    drawName: '16-Out Inside + Outside Wrap',
    totalOuts: '16 Outs (12 Nut / 4 Dirty)',
    turnHit: '35.6%',
    flopToRiver: '59.1%',
    vsTopSetAction: 'High-Equity Semi-Bluff Raise On Rainbow Boards; Discount Dirty Outs Multiway',
  },
  {
    drawName: '17-Out Monster Broadway Wrap',
    totalOuts: '17 Outs (14 Nut / 3 Dirty)',
    turnHit: '37.8%',
    flopToRiver: '61.9%',
    vsTopSetAction: 'Clear Favorite Over Naked Top Set On Rainbow Flops',
  },
  {
    drawName: '20-Out Mega 4-Card Wrap',
    totalOuts: '20 Outs (17 Nut / 3 Dirty)',
    turnHit: '44.4%',
    flopToRiver: '69.7%',
    vsTopSetAction: 'Max Pot-Raise Commitment Every Time On Rainbow Flops',
  },
  {
    drawName: '24-Out Wrap + Nut Flush Redraw',
    totalOuts: '24 Outs (21 Nut / 3 Dirty)',
    turnHit: '53.3%',
    flopToRiver: '78.9%',
    vsTopSetAction: 'Crushing 65%+ Equity Favorite Even Against Top Set Full-House Redraws',
  },
];

const PLO_OUTS_FAQS = [
  {
    question: 'Why Do You Divide By 45 Unseen Cards On The Flop In Pot-Limit Omaha Instead Of 47?',
    answer:
      'In Pot-Limit Omaha You Hold 4 Hole Cards Plus 3 Flop Cards (7 Known Cards Out Of 52), Leaving Exactly 45 Unseen Cards On The Turn And 44 Unseen Cards On The River. That Slightly Increases The Per-Out Hit Percentage Compared To Texas Holdem.',
  },
  {
    question: 'What Is The Difference Between Nut Outs And Dirty Outs In A PLO Straight Wrap?',
    answer:
      'Nut Outs Give You The Unbeatable Highest Possible Straight Or Nut Flush. Dirty Outs Complete A Lower End Of A Straight Or Flush when A Two-Tone Flop Pairs Or Brings The Third Flush Card, Potentially Getting You Freerolled Or Quartered By A Higher Redraw.',
  },
  {
    question: 'How Many Outs Do You Need To Profitably Stack Off On The Flop Against A Pot-Sized Bet In PLO?',
    answer:
      'Facing A Full Pot-Sized Flop Commitment Where You Need 33.3% Raw Equity, A 13-Out Pure Nut Wrap Plus Backdoor Flush Equity Or Any 16-Out To 20-Out Wrap Clears The Equity Threshold Against Most Single-Pair And Two-Pair Made Hands.',
  },
];

export default function PloOutsCalculatorPage() {
  const router = useRouter();
  const [wrapType, setWrapType] = useState('wrap20');
  const [totalOuts, setTotalOuts] = useState(20);
  const [nutOuts, setNutOuts] = useState(17);
  const [potSize, setPotSize] = useState(120);
  const [betFacing, setBetFacing] = useState(120);
  const [activePresetId, setActivePresetId] = useState('preset_20wrap');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.wrap && PLO_WRAP_TYPES.some((w) => w.id === q.wrap)) {
      setWrapType(q.wrap);
    }
    if (q.outs !== undefined) setTotalOuts(Math.max(1, Math.min(30, Number(q.outs) || 20)));
    if (q.nut !== undefined) setNutOuts(Math.max(0, Math.min(30, Number(q.nut) || 17)));
    if (q.pot !== undefined) setPotSize(Math.max(1, Number(q.pot) || 120));
    if (q.bet !== undefined) setBetFacing(Math.max(0, Number(q.bet) || 120));
  }, [router.isReady, router.query]);

  const handleSelectWrapType = (nextId) => {
    setWrapType(nextId);
    const found = PLO_WRAP_TYPES.find((w) => w.id === nextId);
    if (found) {
      setTotalOuts(found.defaultTotalOuts);
      setNutOuts(found.defaultNutOuts);
    }
  };

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setWrapType(preset.wrapType);
    setTotalOuts(preset.totalOuts);
    setNutOuts(preset.nutOuts);
    setPotSize(preset.potSize);
    setBetFacing(preset.betFacing);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/plo-outs-calculator',
          query: {
            wrap: preset.wrapType,
            outs: preset.totalOuts,
            nut: preset.nutOuts,
            pot: preset.potSize,
            bet: preset.betFacing,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const safeTotal = Math.max(1, Math.min(30, Math.round(Number(totalOuts) || 20)));
    const safeNut = Math.max(0, Math.min(safeTotal, Math.round(Number(nutOuts) ?? 17)));
    const dirtyOuts = Math.max(0, safeTotal - safeNut);
    const safePot = Math.max(1, Number(potSize) || 120);
    const safeBet = Math.max(0, Number(betFacing) || 120);

    // 45 unseen cards on flop in 4-card PLO, 44 on turn
    const turnOnlyPct = (safeTotal / 45) * 100;
    const riverOnlyPct = (safeTotal / 44) * 100;
    const missBoth = ((45 - safeTotal) / 45) * ((44 - safeTotal) / 44);
    const flopToRiverPct = (1 - missBoth) * 100;

    // Effective Nut-Weighted Equity (Dirty outs discounted at 50% realize rate)
    const effectiveOuts = safeNut + dirtyOuts * 0.5;
    const missEffectiveBoth = ((45 - effectiveOuts) / 45) * ((44 - effectiveOuts) / 44);
    const nutAdjustedFlopToRiverPct = (1 - missEffectiveBoth) * 100;

    const requiredCallEquityPct = safeBet > 0 ? (safeBet / (safePot + safeBet + safeBet)) * 100 : 0;
    // Pot-limit max profitable call size C where C / (Pot + 2C) = Equity => C = (Equity * Pot) / (1 - 2 * Equity)
    const eqDec = nutAdjustedFlopToRiverPct / 100;
    const maxCallThreshold =
      eqDec >= 0.495 ? safePot * 10 : Math.max(0, (eqDec * safePot) / Math.max(0.01, 1 - 2 * eqDec));

    const currentWrapObj = PLO_WRAP_TYPES.find((w) => w.id === wrapType) || PLO_WRAP_TYPES[0];
    const isProfitableFlopCall = nutAdjustedFlopToRiverPct >= requiredCallEquityPct;

    return {
      safeTotal,
      safeNut,
      dirtyOuts,
      safePot,
      safeBet,
      turnOnlyPct: turnOnlyPct.toFixed(1),
      riverOnlyPct: riverOnlyPct.toFixed(1),
      flopToRiverPct: flopToRiverPct.toFixed(1),
      nutAdjustedFlopToRiverPct: nutAdjustedFlopToRiverPct.toFixed(1),
      requiredCallEquityPct: requiredCallEquityPct.toFixed(1),
      maxCallThreshold: maxCallThreshold.toFixed(0),
      isProfitableFlopCall,
      currentWrapObj,
    };
  }, [wrapType, totalOuts, nutOuts, potSize, betFacing]);

  const canonicalPath = '/tools/plo-outs-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Exact Pot-Limit Omaha (PLO) 13-Out, 16-Out, 17-Out, And 20-Out Straight Wrap Hit Probabilities, Nut Outs Vs Dirty Outs Breakdown, And Pot-Limit Max-Call Thresholds.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'PLO Wrap And Nut-Out Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Pot-Limit Omaha Wrap & Draw Equity Analyzer',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['PLO Wrap & Nut-Out Calculator', canonicalPath],
      ],
      faqs: PLO_OUTS_FAQS,
    });
  }, [pageDesc]);

  const summaryText = `${metrics.currentWrapObj.label}: ${metrics.safeTotal} Total Outs (${metrics.safeNut} Nut Outs / ${metrics.dirtyOuts} Dirty Outs) | Turn Hit: ${metrics.turnOnlyPct}% | Flop-To-River Combined: ${metrics.flopToRiverPct}% (Nut-Adjusted ${metrics.nutAdjustedFlopToRiverPct}%) | Required Call Equity: ${metrics.requiredCallEquityPct}%`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="PLO Wrap And Nut-Out Calculator"
        description={pageDesc}
        canonical={canonicalPath}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>PLO Wrap &amp; Nut-Out Calculator</span>
          </nav>
          <Link
            href="/search"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#f2b84b',
              background: '#101a20',
              border: '1px solid #334155',
              borderRadius: '2px',
              padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            Press Cmd+K To Search All 400+ Tools &amp; Guides
          </Link>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          PLO Wrap, Redraw &amp; Nut-Out Probability Analyzer
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> In 4-Card Pot-Limit Omaha (PLO), You Hold 4 Hole Cards Plus 3 Flop Cards, Leaving Exactly <strong>45 Unseen Turn Cards</strong> And <strong>44 Unseen River Cards</strong>. A <strong>13-Out Classic Straight Wrap</strong> Hits By The River <strong>50.1%</strong> Of The Time, A <strong>17-Out Monster Wrap</strong> Hits <strong>61.9%</strong>, And A <strong>20-Out Mega Wrap</strong> Hits <strong>69.7%</strong>.
        </p>

        <CalculatorShareAndPresets
          toolTitle="PLO Wrap And Nut-Out Calculator"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={PLO_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive PLO Wrap & Nut-Out Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Configure PLO Wrap Archetype, Nut Outs &amp; Pot Commitment
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                PLO Wrap Or Draw Archetype
                <select
                  value={wrapType}
                  onChange={(e) => handleSelectWrapType(e.target.value)}
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
                  {PLO_WRAP_TYPES.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Draw Outs (1 To 30)
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={totalOuts}
                  onChange={(e) => setTotalOuts(e.target.value)}
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
                Clean Nut Outs (0 To Total)
                <input
                  type="number"
                  min="0"
                  max={totalOuts}
                  value={nutOuts}
                  onChange={(e) => setNutOuts(e.target.value)}
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

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Pot Before Bet ($)
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
                Opponent Bet Facing ($)
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={betFacing}
                  onChange={(e) => setBetFacing(e.target.value)}
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Turn-Only &amp; River-Only Hit %
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.turnOnlyPct}% / {metrics.riverOnlyPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeTotal} Outs Out Of 45 Turn / 44 River Cards
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Flop-To-River Combined Equity
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.flopToRiverPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Nut-Adjusted Realizable Equity: {metrics.nutAdjustedFlopToRiverPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Nut Outs Vs Non-Nut Dirty Outs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.safeNut} Nut / {metrics.dirtyOuts} Dirty
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Example: {metrics.currentWrapObj.exampleHand}
              </div>
            </div>

            <div
              style={{
                background: '#020608',
                padding: 16,
                borderRadius: '2px',
                border: `1px solid ${metrics.isProfitableFlopCall ? '#34d399' : '#f87171'}`,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Pot-Limit Max-Call Threshold
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: metrics.isProfitableFlopCall ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                Up To ${metrics.maxCallThreshold}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Req Equity: {metrics.requiredCallEquityPct}% ({metrics.isProfitableFlopCall ? '+EV Commit / Call' : 'Needs Implied Odds'})
              </div>
            </div>
          </div>

          <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#25c8ff', marginBottom: 4 }}>
              GTO Omaha Tactical Verdict ({metrics.currentWrapObj.label})
            </div>
            <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
              {metrics.currentWrapObj.tacticalNote}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Pot-Limit Omaha Wrap &amp; Combo Draw Equity Reference Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Exact 4-Card PLO Turn And Flop-To-River Hit Probabilities Across Canonical Straight Wraps And Combo Draws
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>PLO Draw Archetype</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Out Breakdown</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Turn Hit %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flop-To-River %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Action Vs Made Top Set</th>
                </tr>
              </thead>
              <tbody>
                {PLO_WRAP_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.drawName} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.drawName}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.totalOuts}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.turnHit}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.flopToRiver}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.vsTopSetAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <FaqSection faqs={PLO_OUTS_FAQS} />

        <CitationBacklinkBox
          title="PLO Wrap And Nut-Out Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="PLO Wrap Engine"
          badgeValue="45-Card Omaha Draw Solver"
          summary="Interactive Pot-Limit Omaha Wrap, Flush Redraw, And Nut-Out Equity Analyzer."
          slug="plo-outs-calculator"
        />

        <AiPromptLauncher
          title="PLO Wrap And Nut-Out Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
