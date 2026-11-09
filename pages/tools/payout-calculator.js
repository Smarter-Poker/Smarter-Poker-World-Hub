/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER TOURNAMENT PAYOUT & PRIZE POOL DISTRIBUTION CALCULATOR
 *  (/tools/payout-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive TDA-standard tournament prize pool and payout structure calculator
 * at /tools/payout-calculator.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const PAYOUT_STRUCTURE_PRESETS = [
  {
    id: 'top-15-tda',
    label: 'Top 15% Standard TDA',
    itmRatio: 0.15,
    exponent: 1.42,
    description: 'Official Tournament Directors Association Standard Paying 15% Of Field With ~1.8x Min-Cash',
  },
  {
    id: 'top-10-heavy',
    label: 'Top 10% Heavy Top',
    itmRatio: 0.10,
    exponent: 1.65,
    description: 'Old-School Top-Heavy Championship Structure Concentrating 30% To 40% At 1st Place',
  },
  {
    id: 'top-20-flat',
    label: 'Top 20% Flat Club/Home Game',
    itmRatio: 0.20,
    exponent: 1.18,
    description: 'Player-Friendly Social Club And Home Game Structure Rewarding 1 In 5 Entries',
  },
  {
    id: 'wta-hu',
    label: 'Winner-Take-All / Heads-Up',
    itmRatio: 0.01,
    exponent: 2.0,
    description: '100% Prize Pool Awarded To 1st Place (Heads-Up Shootout Or Bounty Sit-And-Go)',
  },
];

const TDA_FIELD_BENCHMARK_TABLE = [
  {
    fieldSize: '8 To 10 Entries (Single Table SNG)',
    standardPlacesPaid: '2 Or 3 Places',
    firstPlaceShare: '50.0% (3 Paid) Or 65.0% (2 Paid)',
    minCashMultiple: '2.0x Buy-In (20.0% Of Pool)',
    bubbleFactorNote: 'Extreme Bubble Factor (~1.75x) At 4-Handed Play',
  },
  {
    fieldSize: '18 To 27 Entries (2 To 3 Tables)',
    standardPlacesPaid: '3 To 4 Places',
    firstPlaceShare: '42.0% To 45.0%',
    minCashMultiple: '1.8x To 2.2x Buy-In',
    bubbleFactorNote: 'Final Table Simultaneous Money Bubble Dynamics',
  },
  {
    fieldSize: '40 To 60 Entries (Club Nightly MTT)',
    standardPlacesPaid: '6 To 9 Places (15%)',
    firstPlaceShare: '31.0% To 34.0%',
    minCashMultiple: '1.75x To 1.90x Buy-In',
    bubbleFactorNote: 'Entire Final Table Reaches The Money',
  },
  {
    fieldSize: '100 Entries (Weekend Deepstack)',
    standardPlacesPaid: '15 Places (15%)',
    firstPlaceShare: '26.5%',
    minCashMultiple: '1.70x Buy-In',
    bubbleFactorNote: 'Pay Jumps Accelerate Rapidly From 9th To 1st',
  },
  {
    fieldSize: '250 Entries (Regional Series Event)',
    standardPlacesPaid: '38 Places (15%)',
    firstPlaceShare: '22.0%',
    minCashMultiple: '1.65x Buy-In',
    bubbleFactorNote: 'Two Full Pay-Tier Steps Before Final Table',
  },
  {
    fieldSize: '1,000+ Entries (Major Championship)',
    standardPlacesPaid: '150 Places (15%)',
    firstPlaceShare: '16.5% To 18.5%',
    minCashMultiple: '1.60x To 2.00x Buy-In',
    bubbleFactorNote: 'Flat Early Tiers Followed By Exponential Final Table Escalation',
  },
];

const PAYOUT_CALCULATOR_FAQS = [
  {
    question: 'What Percentage Of The Field Should Get Paid In A Poker Tournament?',
    answer:
      'Under Modern Tournament Directors Association (TDA) Standards, Between 12% And 15% Of Total Tournament Entries Receive A Cash Payout, With A Minimum Cash Equal To Roughly 1.6x To 2.0x The Initial Buy-In.',
  },
  {
    question: 'How Much Should First Place Win In A Poker Tournament?',
    answer:
      'First Place Typically Receives 50% Of The Prize Pool In A 9-Player Single-Table Sit-And-Go, 30% To 35% In A 50-Entry Club Tournament, 25% In A 100-Entry Event, And 16% To 20% In Large 500+ Entry Multi-Table Tournaments.',
  },
  {
    question: 'How Does The Payout Structure Affect ICM Bubble Factor?',
    answer:
      'Flatter Payout Structures (Top 20% Paid) Increase Money-Bubble Survival Pressure Because Min-Cashes Are Easier To Lock Up, Whereas Top-Heavy Structures (Top 10% Paid) Reduce Early ICM Distortion And Reward Aggressive Chip Accumulation For First Place.',
  },
];

export default function PayoutCalculatorPage({
  initialEntries = 45,
  initialRebuysAddOns = 15,
  initialBuyIn = 100,
  initialHouseFee = 15,
  initialAddedMoney = 500,
  initialPresetId = 'top-15-tda',
}) {
  const [totalEntries, setTotalEntries] = useState(initialEntries);
  const [rebuysAddOns, setRebuysAddOns] = useState(initialRebuysAddOns);
  const [buyIn, setBuyIn] = useState(initialBuyIn);
  const [houseFee, setHouseFee] = useState(initialHouseFee);
  const [addedMoney, setAddedMoney] = useState(initialAddedMoney);
  const [presetId, setPresetId] = useState(initialPresetId);

  const payoutData = useMemo(() => {
    const safeEntries = Math.max(2, Math.min(5000, Math.round(Number(totalEntries) || 45)));
    const safeRebuys = Math.max(0, Math.min(5000, Math.round(Number(rebuysAddOns) || 0)));
    const safeBuyIn = Math.max(1, Number(buyIn) || 100);
    const safeFee = Math.max(0, Math.min(safeBuyIn * 0.5, Number(houseFee) || 0));
    const safeAdded = Math.max(0, Number(addedMoney) || 0);

    const netContributionPerBuyIn = Math.max(1, safeBuyIn - safeFee);
    const totalBuyInUnits = safeEntries + safeRebuys;
    const grossCollected = totalBuyInUnits * safeBuyIn;
    const totalHouseRake = safeEntries * safeFee;
    const netPrizePool = safeEntries * netContributionPerBuyIn + safeRebuys * safeBuyIn + safeAdded;

    const activePreset =
      PAYOUT_STRUCTURE_PRESETS.find((p) => p.id === presetId) || PAYOUT_STRUCTURE_PRESETS[0];

    const placesPaid =
      activePreset.id === 'wta-hu'
        ? 1
        : Math.max(2, Math.min(safeEntries, Math.round(safeEntries * activePreset.itmRatio)));

    // Power-law inverse rank weight distribution
    const weights = [];
    let weightSum = 0;
    for (let rank = 1; rank <= placesPaid; rank += 1) {
      const w = 1 / Math.pow(rank, activePreset.exponent * 0.72);
      weights.push(w);
      weightSum += w;
    }

    const rawRows = weights.map((w, idx) => {
      const share = w / weightSum;
      const rawDollars = netPrizePool * share;
      const roundedDollars = placesPaid === 1 ? netPrizePool : Math.max(safeBuyIn, Math.round(rawDollars / 5) * 5);
      return {
        place: idx + 1,
        sharePct: (share * 100).toFixed(2),
        payoutDollars: roundedDollars,
        buyInMultiple: (roundedDollars / safeBuyIn).toFixed(2),
      };
    });

    // Adjust 1st place so sum equals exact netPrizePool
    if (rawRows.length > 1) {
      const sumOthers = rawRows.slice(1).reduce((acc, r) => acc + r.payoutDollars, 0);
      const exactFirst = Math.max(rawRows[1].payoutDollars + 5, netPrizePool - sumOthers);
      rawRows[0].payoutDollars = exactFirst;
      rawRows[0].sharePct = ((exactFirst / netPrizePool) * 100).toFixed(2);
      rawRows[0].buyInMultiple = (exactFirst / safeBuyIn).toFixed(2);
    }

    const firstPrize = rawRows[0]?.payoutDollars || netPrizePool;
    const minCashPrize = rawRows[rawRows.length - 1]?.payoutDollars || netPrizePool;
    const bubbleFactorEstimate =
      placesPaid === 1 ? 1.0 : Number((1 + (minCashPrize / Math.max(1, netPrizePool)) * 2.4).toFixed(2));

    return {
      safeEntries,
      safeRebuys,
      safeBuyIn,
      safeFee,
      safeAdded,
      grossCollected,
      totalHouseRake,
      netPrizePool,
      placesPaid,
      activePreset,
      firstPrize,
      minCashPrize,
      bubbleFactorEstimate,
      rows: rawRows,
    };
  }, [totalEntries, rebuysAddOns, buyIn, houseFee, addedMoney, presetId]);

  const canonicalPath = '/tools/payout-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Tournament Payout & Prize Pool Calculator';
  const pageDesc =
    'Calculate TDA-Standard Poker Tournament Prize Pool Distributions, Places Paid, Rebuy And Add-On Pools, Min-Cash Multiples, And Final Table Payouts Instantly.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Tournament Payout & Prize Pool Distribution Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Tournament Prize Pool & Payout Structure Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Tournament Payout Calculator', canonicalPath],
      ],
      faqs: PAYOUT_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Generate A TDA Poker Tournament Payout Structure',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Total Entries, Rebuys/Add-Ons, And Buy-In Breakdown',
            text: 'Input Your Player Count, Rebuys, Buy-In Dollar Amount, House Staff Fee, And Any Added Guarantee Money.',
          },
          {
            name: 'Select Your Payout Structure Curve Preset',
            text: 'Choose Between Top 10% Heavy Top, Top 15% Standard TDA, Top 20% Flat Club/Home Game, Or Winner-Take-All.',
          },
          {
            name: 'Publish Exact Place-By-Place Dollar Payouts',
            text: 'Copy The Rounded Dollar And Percentage Payout Schedule For Your Tournament Clock.',
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
          <span>Tournament Payout Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Tournament Payout &amp; Prize Pool Distribution Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Standard Tournament Directors Association (TDA) Payout Schedules Reward <strong>15% Of Total Entrants</strong> With A Minimum Cash Between <strong>1.6x And 2.0x The Initial Buy-In</strong>, Scaling Smoothly Via A Power-Law Curve So Every Elimination Jump Increases Net Dollar Equity.
        </p>

        {/* Interactive Payout Structure Generator */}
        <section
          aria-label="Interactive Tournament Payout Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Interactive TDA Prize Pool &amp; Payout Schedule Builder
          </h2>

          {/* Structure Preset Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {PAYOUT_STRUCTURE_PRESETS.map((preset) => {
              const active = preset.id === presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetId(preset.id)}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Initial Entries
                <input
                  type="number"
                  min="2"
                  max="5000"
                  value={totalEntries}
                  onChange={(e) => setTotalEntries(e.target.value)}
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
                Rebuys &amp; Add-Ons
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={rebuysAddOns}
                  onChange={(e) => setRebuysAddOns(e.target.value)}
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
                Gross Buy-In ($)
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
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
                House / Staff Fee ($)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={houseFee}
                  onChange={(e) => setHouseFee(e.target.value)}
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
                Added Money / Overlay ($)
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={addedMoney}
                  onChange={(e) => setAddedMoney(e.target.value)}
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

          {/* Summary KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Net Tournament Prize Pool
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${payoutData.netPrizePool.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                House Fee Retained: ${payoutData.totalHouseRake.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                1st Place Championship Prize
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                ${payoutData.firstPrize.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {payoutData.rows[0]?.sharePct}% Of Total Prize Pool
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Places Paid (ITM)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {payoutData.placesPaid} Places
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Min-Cash: ${payoutData.minCashPrize.toLocaleString('en-US')}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Money Bubble ICM Factor
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {payoutData.bubbleFactorEstimate}x
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Required Risk Premium On Bubble
              </div>
            </div>
          </div>

          {/* Generated Payout Schedule Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', color: '#94a3b8' }}>
                Generated Payout Distribution ({payoutData.activePreset.label} - {payoutData.activePreset.description})
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Finishing Position</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Prize Pool Share (%)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Payout Amount ($)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Buy-In Multiple</th>
                </tr>
              </thead>
              <tbody>
                {payoutData.rows.map((row) => (
                  <tr key={row.place} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: row.place === 1 ? '#f2b84b' : '#f8fafc' }}>
                      Place #{row.place}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.sharePct}%</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#34d399' }}>
                      ${row.payoutDollars.toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 600 }}>{row.buyInMultiple}x Buy-In</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table: TDA Field Size Payout Benchmarks */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            TDA Tournament Payout Structure Benchmarks By Field Size
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Standard Places Paid, First-Place Shares, And ICM Bubble Characteristics Across Tournament Field Sizes
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Tournament Field Size</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Places Paid</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>1st Place Share</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Min-Cash Multiple</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>ICM &amp; Bubble Dynamics</th>
                </tr>
              </thead>
              <tbody>
                {TDA_FIELD_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.fieldSize} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.fieldSize}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.standardPlacesPaid}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.firstPlaceShare}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.minCashMultiple}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.bubbleFactorNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Tournament Director &amp; ICM Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Malmuth-Harville ICM Calculator
            </Link>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Blind Structure &amp; Clock Generator
            </Link>
            <Link href="/tools/bounty-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              PKO &amp; Mystery Bounty Calculator
            </Link>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Short-Stack Push/Fold Charts
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
          </div>
        </section>

        <FaqSection faqs={PAYOUT_CALCULATOR_FAQS} />

        <CitationBacklinkBox
          title="Poker Tournament Payout & Prize Pool Distribution Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="TDA Payout Solver"
          badgeValue="Tournament Prize Pool Distribution"
          summary="Interactive TDA-Standard Poker Tournament Prize Pool And Payout Structure Calculator With ICM Bubble Factor Estimates."
          slug="payout-calculator"
        />

        <AiPromptLauncher
          title="Poker Tournament Payout & Prize Pool Distribution Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const accept = req?.headers?.accept || '';
  const isMarkdownRequested =
    accept.includes('text/markdown') ||
    query?.format === 'md' ||
    query?.format === 'markdown' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderPayoutCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderPayoutCalculatorMarkdown({
      entries: query?.entries || query?.totalEntries || 100,
      buyIn: query?.buyIn || 100,
      paidPct: query?.paidPct || 15,
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialEntries: Number(query?.entries || query?.totalEntries) || 45,
      initialRebuysAddOns: query?.rebuys !== undefined ? Number(query.rebuys) : 15,
      initialBuyIn: Number(query?.buyIn) || 100,
      initialHouseFee: query?.houseFee !== undefined ? Number(query.houseFee) : 15,
      initialAddedMoney: query?.addedMoney !== undefined ? Number(query.addedMoney) : 500,
      initialPresetId: String(query?.preset || 'top-15-tda'),
    },
  };
}
