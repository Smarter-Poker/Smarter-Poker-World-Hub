/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER VARIANCE & DOWNSWING SIMULATOR (/tools/variance-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive poker winrate confidence interval, standard deviation swing,
 * probability of loss, and expected downswing threshold simulator.
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

const SD_FORMAT_PRESETS = [
  { id: 'nlhe-6max', label: 'NLHE 6-Max (85 BB/100)', sd: 85 },
  { id: 'nlhe-fr', label: 'NLHE Full Ring (65 BB/100)', sd: 65 },
  { id: 'live-cash', label: 'Live Cash (75 BB/100)', sd: 75 },
  { id: 'plo-6max', label: 'PLO 6-Max (135 BB/100)', sd: 135 },
  { id: 'plo5', label: 'PLO5 (165 BB/100)', sd: 165 },
];

const VARIANCE_BENCHMARK_TABLE = [
  {
    format: 'NLHE Full Ring Online (9-Max)',
    stdDevBb100: '60 To 70 BB/100',
    handsFor95ConfAt4Bb: '101,000 Hands',
    typicalDownswing: '8 To 14 Buy-Ins (800 - 1,400 BB)',
    recommendedBankroll: '25 To 35 Buy-Ins (2,500 - 3,500 BB)',
  },
  {
    format: 'Live Casino $1/$3 & $2/$5 NLHE',
    stdDevBb100: '70 To 85 BB/100 (At 8-12 BB/100 Winrate)',
    handsFor95ConfAt4Bb: '28,000 To 45,000 Hands (~1,100 Hrs)',
    typicalDownswing: '5 To 9 Buy-Ins (500 - 900 BB)',
    recommendedBankroll: '20 To 30 Buy-Ins ($6,000 - $15,000)',
  },
  {
    format: 'NLHE 6-Max Online Cash',
    stdDevBb100: '80 To 100 BB/100',
    handsFor95ConfAt4Bb: '138,000 Hands',
    typicalDownswing: '12 To 22 Buy-Ins (1,200 - 2,200 BB)',
    recommendedBankroll: '40 To 55 Buy-Ins (4,000 - 5,500 BB)',
  },
  {
    format: '4-Card Pot-Limit Omaha (PLO4 6-Max)',
    stdDevBb100: '125 To 145 BB/100',
    handsFor95ConfAt4Bb: '346,000 Hands',
    typicalDownswing: '25 To 45 Buy-Ins (2,500 - 4,500 BB)',
    recommendedBankroll: '75 To 100 Buy-Ins (7,500 - 10,000 BB)',
  },
  {
    format: '5-Card Pot-Limit Omaha (PLO5 / Bomb Pots)',
    stdDevBb100: '155 To 180 BB/100',
    handsFor95ConfAt4Bb: '522,000 Hands',
    typicalDownswing: '35 To 65 Buy-Ins (3,500 - 6,500 BB)',
    recommendedBankroll: '100 To 150 Buy-Ins (10,000 - 15,000 BB)',
  },
];

const VARIANCE_CALCULATOR_FAQS = [
  {
    question: 'How Do You Calculate Poker Variance And Confidence Intervals?',
    answer:
      'Over N Hundred-Hand Blocks (N = Total Hands / 100), Expected Value Scales Linearly As N * Winrate, While Standard Deviation Scales With The Square Root Of Volume As Sqrt(N) * SD_100. Your 95.4% Confidence Interval Is Expected EV Plus Or Minus 2.0 Standard Deviations.',
  },
  {
    question: 'How Many Hands Are Needed To Prove A Winning Poker Winrate With 95% Confidence?',
    answer:
      'The Minimum Sample Size For 95% Statistical Confidence That Your True Winrate Exceeds Zero Is N_Hands = ((1.96 * SD_100) / Winrate)^2 * 100. A 4.5 BB/100 Winner With An 85 BB/100 Standard Deviation Needs At Least 137,088 Hands Before Zero Falls Outside The 95% Confidence Interval.',
  },
  {
    question: 'Why Do PLO Players Experience Much Larger Downswings Than Hold\'em Players?',
    answer:
      'Because Pot-Limit Omaha Equities Run Much Closer Together Preflop And Postflop (Often 55% Vs 45%), Standard Deviation Jumps From 85 BB/100 In NLHE To 135-165 BB/100 In PLO. Since Downswing Depth Scales With Variance Squared Divided By Winrate, PLO Swings Are Roughly 2.5x To 3.5x Deeper.',
  },
];

// Abramowitz & Stegun normal cumulative distribution approximation
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014337 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return x > 0 ? 1 - prob : prob;
}

export default function VarianceCalculatorPage({
  initialWinrate = 4.5,
  initialSd = 85,
  initialHands = 50000,
  initialHandsPerHour = 85,
  initialBigBlind = 5,
}) {
  const router = useRouter();
  const [winrate, setWinrate] = useState(initialWinrate);
  const [sd, setSd] = useState(initialSd);
  const [hands, setHands] = useState(initialHands);
  const [handsPerHour, setHandsPerHour] = useState(initialHandsPerHour);
  const [bigBlind, setBigBlind] = useState(initialBigBlind);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.wr !== undefined) setWinrate(Number(q.wr) || 4.5);
    if (q.sd !== undefined) setSd(Math.max(20, Math.min(300, Number(q.sd) || 85)));
    if (q.hands !== undefined) setHands(Math.max(1000, Math.min(1000000, Number(q.hands) || 50000)));
    if (q.hph !== undefined) setHandsPerHour(Math.max(20, Math.min(500, Number(q.hph) || 85)));
    if (q.bb !== undefined) setBigBlind(Math.max(0.1, Number(q.bb) || 5));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safeWr = Number.isFinite(Number(winrate)) ? Number(winrate) : 4.5;
    const safeSd = Math.max(20, Math.min(300, Number(sd) || 85));
    const safeHands = Math.max(1000, Math.min(1000000, Math.round(Number(hands) || 50000)));
    const safeHph = Math.max(15, Math.min(1000, Math.round(Number(handsPerHour) || 85)));
    const safeBb = Math.max(0.05, Number(bigBlind) || 5);

    const nBlocks = safeHands / 100;
    const expectedEvBb = nBlocks * safeWr;
    const expectedEvDollars = expectedEvBb * safeBb;

    const totalStdDevBb = Math.sqrt(nBlocks) * safeSd;
    const totalStdDevDollars = totalStdDevBb * safeBb;

    const zZero = totalStdDevBb > 0 ? (0 - expectedEvBb) / totalStdDevBb : 0;
    const probLossPct = normalCDF(zZero) * 100;

    const minHands95Conf =
      safeWr > 0 ? Math.round(Math.pow((1.96 * safeSd) / safeWr, 2) * 100) : null;

    // Brownian Motion Downswing Thresholds: P(Max Drawdown >= D) = exp(-2 * wr * D / sd^2)
    // => D(p) = -ln(p) * sd^2 / (2 * wr) in 100-hand blocks (so multiply by 1 for BB since wr & sd are per 100 hands)
    const variancePer100 = safeSd * safeSd;
    const downswing50PctBi =
      safeWr > 0
        ? ((Math.log(2) * variancePer100) / (2 * safeWr) / 100).toFixed(1)
        : 'Infinite';
    const downswing10PctBi =
      safeWr > 0
        ? ((Math.log(10) * variancePer100) / (2 * safeWr) / 100).toFixed(1)
        : 'Infinite';
    const downswing5PctBi =
      safeWr > 0
        ? ((Math.log(20) * variancePer100) / (2 * safeWr) / 100).toFixed(1)
        : 'Infinite';

    const bands = [
      {
        label: '1-SD Confidence Band (68.2% Probability)',
        sdMult: 1,
        lowBb: Math.round(expectedEvBb - totalStdDevBb),
        highBb: Math.round(expectedEvBb + totalStdDevBb),
        lowDollars: Math.round((expectedEvBb - totalStdDevBb) * safeBb),
        highDollars: Math.round((expectedEvBb + totalStdDevBb) * safeBb),
        lowWr: ((expectedEvBb - totalStdDevBb) / nBlocks).toFixed(2),
        highWr: ((expectedEvBb + totalStdDevBb) / nBlocks).toFixed(2),
      },
      {
        label: '2-SD Confidence Band (95.4% Probability)',
        sdMult: 2,
        lowBb: Math.round(expectedEvBb - 2 * totalStdDevBb),
        highBb: Math.round(expectedEvBb + 2 * totalStdDevBb),
        lowDollars: Math.round((expectedEvBb - 2 * totalStdDevBb) * safeBb),
        highDollars: Math.round((expectedEvBb + 2 * totalStdDevBb) * safeBb),
        lowWr: ((expectedEvBb - 2 * totalStdDevBb) / nBlocks).toFixed(2),
        highWr: ((expectedEvBb + 2 * totalStdDevBb) / nBlocks).toFixed(2),
      },
      {
        label: '3-SD Confidence Band (99.7% Probability)',
        sdMult: 3,
        lowBb: Math.round(expectedEvBb - 3 * totalStdDevBb),
        highBb: Math.round(expectedEvBb + 3 * totalStdDevBb),
        lowDollars: Math.round((expectedEvBb - 3 * totalStdDevBb) * safeBb),
        highDollars: Math.round((expectedEvBb + 3 * totalStdDevBb) * safeBb),
        lowWr: ((expectedEvBb - 3 * totalStdDevBb) / nBlocks).toFixed(2),
        highWr: ((expectedEvBb + 3 * totalStdDevBb) / nBlocks).toFixed(2),
      },
    ];

    return {
      safeWr,
      safeSd,
      safeHands,
      safeHph,
      safeBb,
      totalHours: (safeHands / safeHph).toFixed(0),
      expectedEvBb: Math.round(expectedEvBb),
      expectedEvDollars: Math.round(expectedEvDollars),
      totalStdDevBb: Math.round(totalStdDevBb),
      totalStdDevDollars: Math.round(totalStdDevDollars),
      probLossPct: probLossPct.toFixed(2),
      minHands95Conf,
      downswing50PctBi,
      downswing10PctBi,
      downswing5PctBi,
      bands,
    };
  }, [winrate, sd, hands, handsPerHour, bigBlind]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/variance-calculator?wr=${metrics.safeWr}&sd=${metrics.safeSd}&hands=${metrics.safeHands}&hph=${metrics.safeHph}&bb=${metrics.safeBb}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/variance-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Poker Winrate Confidence Intervals, Probability Of Loss, Standard Deviation Swings, And Expected Downswings Across Any Hand Sample.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Variance & Downswing Simulator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Variance & Standard Deviation Confidence Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Poker Variance & Downswing Simulator', canonicalPath],
      ],
      faqs: VARIANCE_CALCULATOR_FAQS,
      howTo: {
        name: 'How To Simulate Poker Variance And Confidence Intervals',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Your True Winrate And Format Standard Deviation',
            text: 'Input Your Expected True Winrate In BB/100 And Select A Format Standard Deviation Preset (NLHE 6-Max 85, PLO 135, Or Live Cash 75).',
          },
          {
            name: 'Set Total Hands Played, Hands Per Hour, And Big Blind Size',
            text: 'Specify Your Sample Volume From 1,000 To 1,000,000 Hands And Your Stake Big Blind Dollar Value.',
          },
          {
            name: 'Inspect 1-SD, 2-SD, And 3-SD Confidence Intervals And Loss Probability',
            text: 'Review Your Probability Of Running Below Zero And Severe Downswing Thresholds In 100BB Buy-Ins.',
          },
        ],
      },
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Variance & Downswing Simulator"
        description="Calculate Poker Winrate Confidence Intervals, Probability Of Loss, Standard Deviation Swings, And Expected Downswings Across Any Hand Sample."
        canonical="/tools/variance-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>Poker Variance &amp; Downswing Simulator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Variance &amp; Downswing Simulator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> Poker Variance Scales With The <strong>Square Root Of Hand Volume</strong> While Expected Value Grows Linearly. Even A Strong <strong>4.5 BB/100 Winner In 6-Max NLHE (85 BB/100 SD)</strong> Faces A <strong>12.0% Probability Of Being A Net Loser Over 50,000 Hands</strong> And Requires <strong>137,088 Hands</strong> To Prove A Positive Winrate With 95% Statistical Confidence.
        </p>

        {/* Interactive Simulator */}
        <section
          aria-label="Interactive Poker Variance Simulator"
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
              Interactive Confidence Interval &amp; Downswing Calculator
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

          {/* Standard Deviation Format Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {SD_FORMAT_PRESETS.map((preset) => {
              const active = Number(sd) === preset.sd;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSd(preset.sd)}
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

          {/* Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                True Winrate (BB/100)
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="40"
                  value={winrate}
                  onChange={(e) => setWinrate(e.target.value)}
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
                Std Deviation (BB/100)
                <input
                  type="number"
                  step="5"
                  min="20"
                  max="300"
                  value={sd}
                  onChange={(e) => setSd(e.target.value)}
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
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Hands Played
                <input
                  type="number"
                  step="5000"
                  min="1000"
                  max="1000000"
                  value={hands}
                  onChange={(e) => setHands(e.target.value)}
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
                Hands Per Hour (30-250)
                <input
                  type="number"
                  step="5"
                  min="20"
                  max="500"
                  value={handsPerHour}
                  onChange={(e) => setHandsPerHour(e.target.value)}
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
                Big Blind Size ($)
                <input
                  type="number"
                  step="1"
                  min="0.1"
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
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Expected Net EV (Mean)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.expectedEvBb.toLocaleString('en-US')} BB (${metrics.expectedEvDollars.toLocaleString('en-US')})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Sample Duration: ~{metrics.totalHours} Playing Hours
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Probability Of Running Below Zero
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.probLossPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                1-SD Sample Swing: +/-{metrics.totalStdDevBb.toLocaleString('en-US')} BB
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Minimum Hands For 95% Confidence
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.minHands95Conf ? `${metrics.minHands95Conf.toLocaleString('en-US')} Hands` : 'N/A (Non-Positive WR)'}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Formula: (1.96 * SD / WR)^2 * 100
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Severe Downswing Thresholds (100BB BI)
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginTop: 6 }}>
                50% Chance: {metrics.downswing50PctBi} BI | 5% Chance: {metrics.downswing5PctBi} BI
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                10% Career Downswing Risk: {metrics.downswing10PctBi} Buy-Ins
              </div>
            </div>
          </div>

          {/* Confidence Intervals Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', color: '#94a3b8' }}>
                Winrate Confidence Intervals Across {metrics.safeHands.toLocaleString('en-US')} Hands ({metrics.safeWr} BB/100 Mean, {metrics.safeSd} BB/100 SD)
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Confidence Interval Band</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Worst-Case Bound (BB)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Best-Case Bound (BB)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Dollar Swing Range ($)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Observed Winrate Range (BB/100)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.bands.map((b) => (
                  <tr key={b.label} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{b.label}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: b.lowBb >= 0 ? '#34d399' : '#f87171' }}>
                      {b.lowBb.toLocaleString('en-US')} BB
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#34d399' }}>
                      +{b.highBb.toLocaleString('en-US')} BB
                    </td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>
                      ${b.lowDollars.toLocaleString('en-US')} To ${b.highDollars.toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 600 }}>
                      {b.lowWr} To +{b.highWr} BB/100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Standard Deviation &amp; Downswing Benchmarks By Poker Format
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Empirical Standard Deviation (BB/100), Sample Size Requirements, And Buy-In Cushions Across Poker Formats
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Poker Format</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Std Dev (BB/100)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>95% Confidence Sample</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Expected Downswing Depth</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended Bankroll</th>
                </tr>
              </thead>
              <tbody>
                {VARIANCE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.format} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.format}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.stdDevBb100}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.handsFor95ConfAt4Bb}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.typicalDownswing}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.recommendedBankroll}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Bankroll, Winrate &amp; Staking Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/bankroll-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Risk Of Ruin &amp; Bankroll Calculator
            </Link>
            <Link href="/tools/poker-winrate-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              BB/100 To $/Hr Winrate Converter
            </Link>
            <Link href="/tools/staking-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament Staking &amp; Markup Calculator
            </Link>
            <Link href="/tools/format-quiz" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Poker Format Selector Quiz
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        <FaqSection faqs={VARIANCE_CALCULATOR_FAQS} />

        <CitationBacklinkBox
          title="Poker Variance & Downswing Simulator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Variance & Confidence Solver"
          badgeValue="1-SD / 2-SD / 3-SD & Downswing Math"
          summary="Interactive Poker Variance Simulator Computing Confidence Intervals, Probability Of Loss, And Expected Downswing Thresholds."
          slug="variance-calculator"
        />

        <AiPromptLauncher
          title="Poker Variance & Downswing Simulator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
