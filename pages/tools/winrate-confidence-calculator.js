/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER WINRATE CONFIDENCE-INTERVAL & SAMPLE SIZE CALCULATOR (/tools/winrate-confidence-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes 70%, 95%, and 99% Confidence Interval bounds ([Low, High]),
 * Probability of Being a True Losing Player (P(Winrate < 0) via normal CDF),
 * and Required Hands/Hours to prove winrate within +/- 2 bb/100.
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
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';

// Abramowitz & Stegun normal CDF approximation
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const prob =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - prob : prob;
}

const CONFIDENCE_PRESETS = [
  {
    id: 'preset_online_nlh_50k',
    label: 'Online NLH Grinder (5.5 BB/100 Over 50,000 Hands)',
    unitMode: 'bb100',
    observedWinrate: 5.5,
    stdDev: 85,
    sampleHands: 50000,
    handsPerHour: 250,
  },
  {
    id: 'preset_live_2_5_500hr',
    label: 'Live $2/$5 Pro (9.0 BB/100 Over 15,000 Hands / 500 Hrs)',
    unitMode: 'bb100',
    observedWinrate: 9.0,
    stdDev: 95,
    sampleHands: 15000,
    handsPerHour: 30,
  },
  {
    id: 'preset_plo_high_var',
    label: 'Online PLO4 Grinder (6.0 BB/100, 130 SD Over 40,000 Hands)',
    unitMode: 'bb100',
    observedWinrate: 6.0,
    stdDev: 130,
    sampleHands: 40000,
    handsPerHour: 220,
  },
  {
    id: 'preset_live_hourly_dollars',
    label: 'Live Cash Tracker ($45/Hr Winrate, $450/Hr SD Over 300 Hrs)',
    unitMode: 'hourly',
    observedWinrate: 45,
    stdDev: 450,
    sampleHands: 9000,
    handsPerHour: 30,
  },
];

const SAMPLE_BENCHMARK_TABLE = [
  {
    sampleSize: '10,000 Hands (Approx 333 Live Hours)',
    nlhMargin95: '+/- 16.7 BB/100',
    ploMargin95: '+/- 25.5 BB/100',
    reliability: 'High Noise: A True +6 BB/100 Winner Can Easily Run At -4 BB/100',
  },
  {
    sampleSize: '25,000 Hands (Approx 833 Live Hours)',
    nlhMargin95: '+/- 10.5 BB/100',
    ploMargin95: '+/- 16.1 BB/100',
    reliability: 'Directional Signal For Strong Live Crushers (+10 BB/100)',
  },
  {
    sampleSize: '50,000 Hands (200 Online Hours / 1,667 Live Hours)',
    nlhMargin95: '+/- 7.5 BB/100',
    ploMargin95: '+/- 11.4 BB/100',
    reliability: 'Proves Positive Expectation (>95% Confidence) For +7.5 BB/100 NLH Winners',
  },
  {
    sampleSize: '100,000 Hands (400 Online Hours)',
    nlhMargin95: '+/- 5.3 BB/100',
    ploMargin95: '+/- 8.1 BB/100',
    reliability: 'Standard Online Benchmark For Separating +5 BB/100 Regs From Breakeven',
  },
  {
    sampleSize: '694,000 Hands (Full Career NLH Proof)',
    nlhMargin95: '+/- 2.0 BB/100',
    ploMargin95: '+/- 3.1 BB/100',
    reliability: 'Exact Sample Required To Lock NLH True Winrate Within +/- 2.0 BB/100 At 95% Confidence',
  },
];

const WINRATE_CONF_FAQS = [
  {
    question: 'How Do You Calculate The 95% Confidence Interval Around Your Poker Winrate?',
    answer:
      'Divide Your Standard Deviation Per 100 Hands By The Square Root Of (Total Hands / 100) To Find Your Standard Error (SE). Multiply SE By 1.96 To Get Your 95% Confidence Margin: True Winrate Lies Within Observed Winrate +/- (1.96 * SE) With 95% Probability.',
  },
  {
    question: 'Why Do Live Cash Game Players Need Hundreds Of Hours To Prove Their True Hourly Winrate?',
    answer:
      'Live Cash Tables Deal Roughly 27 To 32 Hands Per Hour. A Full Year Of 1,000 Live Hours Equals Only 30,000 Hands, Where A Standard Deviation Of 90 BB/100 Still Produces A 95% Margin Of Error Of +/- 10.2 BB/100.',
  },
  {
    question: 'How Many Hands Are Needed To Prove Your Winrate Within +/- 2 BB/100?',
    answer:
      'Using The Formula N_100 = (1.96 * SD / 2.0)^2, A Standard 6-Max NLH Grinder With An 85 BB/100 Standard Deviation Needs Exactly 6,943 Blocks Of 100 Hands (694,300 Total Hands) To Pin Down Their True Winrate Within +/- 2.0 BB/100 At 95% Confidence.',
  },
];

export default function WinrateConfidenceCalculatorPage() {
  const router = useRouter();
  const [unitMode, setUnitMode] = useState('bb100');
  const [observedWinrate, setObservedWinrate] = useState(5.5);
  const [stdDev, setStdDev] = useState(85);
  const [sampleHands, setSampleHands] = useState(50000);
  const [handsPerHour, setHandsPerHour] = useState(250);
  const [activePresetId, setActivePresetId] = useState('preset_online_nlh_50k');

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
    if (q.mode === 'bb100' || q.mode === 'hourly') setUnitMode(q.mode);
    if (q.wr !== undefined) setObservedWinrate(Number(q.wr) || 5.5);
    if (q.sd !== undefined) setStdDev(Math.max(5, Number(q.sd) || 85));
    if (q.hands !== undefined) setSampleHands(Math.max(100, Number(q.hands) || 50000));
    if (q.hph !== undefined) setHandsPerHour(Math.max(15, Number(q.hph) || 250));
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    mode: unitMode,
    wr: observedWinrate,
    sd: stdDev,
    hands: sampleHands,
    hph: handsPerHour,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setUnitMode(preset.unitMode);
    setObservedWinrate(preset.observedWinrate);
    setStdDev(preset.stdDev);
    setSampleHands(preset.sampleHands);
    setHandsPerHour(preset.handsPerHour);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/winrate-confidence-calculator',
          query: {
            mode: preset.unitMode,
            wr: preset.observedWinrate,
            sd: preset.stdDev,
            hands: preset.sampleHands,
            hph: preset.handsPerHour,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const safeWr = Number(observedWinrate) || 0;
    const safeSd = Math.max(5, Number(stdDev) || 85);
    const safeHands = Math.max(100, Math.round(Number(sampleHands) || 50000));
    const safeHph = Math.max(15, Math.round(Number(handsPerHour) || 250));
    const hoursPlayed = safeHands / safeHph;

    const nUnits = unitMode === 'bb100' ? safeHands / 100 : Math.max(1, hoursPlayed);
    const standardError = safeSd / Math.sqrt(nUnits);

    const ci70Low = safeWr - 1.036 * standardError;
    const ci70High = safeWr + 1.036 * standardError;
    const ci95Low = safeWr - 1.96 * standardError;
    const ci95High = safeWr + 1.96 * standardError;
    const ci99Low = safeWr - 2.576 * standardError;
    const ci99High = safeWr + 2.576 * standardError;

    // Probability true winrate < 0 given observed mean and SE
    const zZero = (0 - safeWr) / Math.max(0.0001, standardError);
    const probTrueLosingPct = normalCdf(zZero) * 100;

    // Hands required to lock winrate within +/- 2.0 bb/100 at 95% confidence
    const sdBb100 = unitMode === 'bb100' ? safeSd : 85;
    const requiredBlocksForPlusMinus2 = Math.pow((1.96 * sdBb100) / 2.0, 2);
    const requiredHandsPlusMinus2 = Math.round(requiredBlocksForPlusMinus2 * 100);
    const requiredHoursPlusMinus2 = Math.round(requiredHandsPlusMinus2 / safeHph);

    const unitLabel = unitMode === 'bb100' ? 'BB/100' : '$/Hr';

    return {
      safeWr,
      safeSd,
      safeHands,
      safeHph,
      hoursPlayed: Math.round(hoursPlayed),
      standardError: standardError.toFixed(2),
      ci70Low: ci70Low.toFixed(2),
      ci70High: ci70High.toFixed(2),
      ci95Low: ci95Low.toFixed(2),
      ci95High: ci95High.toFixed(2),
      ci99Low: ci99Low.toFixed(2),
      ci99High: ci99High.toFixed(2),
      probTrueLosingPct: probTrueLosingPct.toFixed(1),
      requiredHandsPlusMinus2,
      requiredHoursPlusMinus2,
      unitLabel,
    };
  }, [unitMode, observedWinrate, stdDev, sampleHands, handsPerHour]);

  const canonicalPath = '/tools/winrate-confidence-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate 70%, 95%, And 99% Poker Winrate Confidence Intervals, Probability Of Being A True Losing Player, And Required Sample Size In Hands And Live Hours.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Poker Winrate Confidence Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Winrate Confidence Interval & Sample Size Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Winrate Confidence Calculator', canonicalPath],
      ],
      faqs: WINRATE_CONF_FAQS,
      howTo: {
        name: 'How To Calculate Your Poker Winrate Confidence Interval And Loss Probability',
        description: pageDesc,
        steps: [
          {
            name: 'Choose Online (BB/100) Or Live Cash (BB/Hr) Winrate Mode',
            text: 'Toggle Between Online Big Blinds Per 100 Hands And Live Cash Game Hourly Winrate.',
          },
          {
            name: 'Enter Observed Winrate, Standard Deviation, And Sample Size',
            text: 'Input Your Measured Winrate, Format Standard Deviation, And Total Hands Or Live Hours Logged.',
          },
          {
            name: 'Inspect 70%, 95%, And 99% Confidence Bounds And True-Loser Probability',
            text: 'Review Your True Winrate Confidence Intervals And The Exact Sample Size Needed For +-2 BB/100 Precision.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Observed Winrate: ${metrics.safeWr} ${metrics.unitLabel} (SD ${metrics.safeSd} Over ${metrics.safeHands.toLocaleString('en-US')} Hands / ${metrics.hoursPlayed} Hrs) | 95% CI: [${metrics.ci95Low}, ${metrics.ci95High}] ${metrics.unitLabel} | P(True Winrate < 0): ${metrics.probTrueLosingPct}%`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Poker Winrate Confidence Calculator"
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
            <span>Winrate Confidence Calculator</span>
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
          Poker Winrate Confidence-Interval &amp; Sample Size Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> Because Texas Holdem Carries An Average Standard Deviation Of <strong>85 To 100 BB/100</strong> (And Pot-Limit Omaha <strong>125 To 145 BB/100</strong>), Even A <strong>50,000-Hand Sample</strong> Still Has A 95% Confidence Margin Of <strong>+/- 7.5 BB/100</strong>. Use This Solver To Compute Your Exact 70%, 95%, And 99% Winrate Bounds.
        </p>

        <CalculatorShareAndPresets
          toolTitle="Poker Winrate Confidence Calculator"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={CONFIDENCE_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive Winrate Confidence Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Enter Observed Winrate, Standard Deviation &amp; Hand Sample
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Measurement Mode
                <select
                  value={unitMode}
                  onChange={(e) => setUnitMode(e.target.value)}
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
                  <option value="bb100">BB/100 Hands Mode</option>
                  <option value="hourly">Live Hourly ($/Hr) Mode</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Observed Winrate ({metrics.unitLabel})
                <input
                  type="number"
                  step="0.5"
                  value={observedWinrate}
                  onChange={(e) => setObservedWinrate(e.target.value)}
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
                Standard Deviation ({metrics.unitLabel})
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={stdDev}
                  onChange={(e) => setStdDev(e.target.value)}
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
                Total Hands Played
                <input
                  type="number"
                  min="100"
                  step="1000"
                  value={sampleHands}
                  onChange={(e) => setSampleHands(e.target.value)}
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
                Hands Per Hour (30 Live / 250 Online)
                <input
                  type="number"
                  min="15"
                  max="1000"
                  step="5"
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                70% Confidence Interval (1 SD)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                [{metrics.ci70Low}, {metrics.ci70High}] {metrics.unitLabel}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Standard Error: +/- {metrics.standardError} {metrics.unitLabel}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                95% Confidence Interval (1.96 SD)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                [{metrics.ci95Low}, {metrics.ci95High}] {metrics.unitLabel}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                99% CI Bounds: [{metrics.ci99Low}, {metrics.ci99High}]
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                P(True Winrate &lt; 0) Losing Risk
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.probTrueLosingPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Normal CDF Probability You Are Actually Under 0
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Sample To Prove +/- 2 BB/100
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {metrics.requiredHandsPlusMinus2.toLocaleString('en-US')} Hands
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Approx {metrics.requiredHoursPlusMinus2.toLocaleString('en-US')} Hours At {metrics.safeHph} Hands/Hr
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            95% Winrate Margin Of Error By Sample Size (NLH Vs PLO)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Comparison Of 95% Confidence Margins Between NLH (85 BB/100 SD) And PLO4 (130 BB/100 SD)
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Hand Sample Size</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>NLH 95% Margin</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>PLO4 95% Margin</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Statistical Reliability</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.sampleSize} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.sampleSize}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.nlhMargin95}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.ploMargin95}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.reliability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <FaqSection faqs={WINRATE_CONF_FAQS} />

        <CitationBacklinkBox
          title="Poker Winrate Confidence Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Winrate CI Engine"
          badgeValue="70% / 95% / 99% Interval Solver"
          summary="Calculates Poker Winrate Confidence Intervals, True Losing Probability, And Sample Size Requirements."
          slug="winrate-confidence-calculator"
        />

        <AiPromptLauncher
          title="Poker Winrate Confidence Calculator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
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
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/winrate-confidence-calculator', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}
