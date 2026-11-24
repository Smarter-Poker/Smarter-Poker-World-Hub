/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  MTT SESSION SCHEDULE & AVERAGE BUY-IN (ABI) PLANNER (/tools/mtt-grind-planner)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Total Session Capital Exposure ($), Effective ABI Ratio (Bankroll in ABIs),
 * Risk of Session Brick % (0 ITMs across schedule), Expected Session EV ($), and
 * Required Bankroll for Schedule (Conservative 200 ABI vs Aggressive 100 ABI).
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

const MTT_GRIND_PRESETS = [
  {
    id: 'preset_sunday_online_14',
    label: 'Sunday Online 14-MTT Major Slate ($55 ABI)',
    numTournaments: 14,
    abiDollars: 55,
    bulletAllowancePct: 30,
    avgFieldSize: 800,
    expectedRoiPct: 22,
    totalBankroll: 12000,
  },
  {
    id: 'preset_weekday_low_abi',
    label: 'Weekday 10-Table Low-Stakes Grind ($22 ABI)',
    numTournaments: 10,
    abiDollars: 22,
    bulletAllowancePct: 25,
    avgFieldSize: 450,
    expectedRoiPct: 28,
    totalBankroll: 4500,
  },
  {
    id: 'preset_high_stakes_sunday',
    label: 'High-Stakes Sunday 12-MTT Schedule ($250 ABI)',
    numTournaments: 12,
    abiDollars: 250,
    bulletAllowancePct: 35,
    avgFieldSize: 600,
    expectedRoiPct: 16,
    totalBankroll: 65000,
  },
  {
    id: 'preset_live_series_week',
    label: 'Live Series 6-Event Weekly Slate ($600 ABI)',
    numTournaments: 6,
    abiDollars: 600,
    bulletAllowancePct: 40,
    avgFieldSize: 500,
    expectedRoiPct: 25,
    totalBankroll: 90000,
  },
];

const MTT_GRIND_FAQS = [
  {
    question: 'How Many Average Buy-Ins (ABIs) Do You Need In Your MTT Bankroll?',
    answer:
      'For Modern Large-Field Multi-Table Tournaments (500+ Average Entrants) With Re-Entries, Aggressive Full-Time Grinders Maintain At Least 100 To 150 Effective ABIs, While Conservative Professionals Maintain 200 To 300 ABIs To Keep Risk Of Ruin Under 5%.',
  },
  {
    question: 'What Is The Probability Of Bricking An Entire 10-Tournament Session With Zero Cashes?',
    answer:
      'In Standard 15% In-The-Money (ITM) Tournaments, A Winning Player Who Cashes 18% Of The Time Has A (1 - 0.18)^10 = 13.7% Chance Of Bricking All 10 Tournaments Completely With Zero Cashes In A Single Session.',
  },
  {
    question: 'Why Must You Include Re-Entry Bullet Allowance When Computing Your Effective ABI?',
    answer:
      'If Your Nominal Average Buy-In Is $50 Across 12 Tournaments ($600 Nominal), Adding A 35% Re-Entry Allowance Raises Your True Capital Exposure To $810 Per Session, Meaning Your Effective Per-Event Commitment Is $67.50 Rather Than $50.',
  },
];

export default function MttGrindPlannerPage() {
  const router = useRouter();
  const [numTournaments, setNumTournaments] = useState(14);
  const [abiDollars, setAbiDollars] = useState(55);
  const [bulletAllowancePct, setBulletAllowancePct] = useState(30);
  const [avgFieldSize, setAvgFieldSize] = useState(800);
  const [expectedRoiPct, setExpectedRoiPct] = useState(22);
  const [totalBankroll, setTotalBankroll] = useState(12000);
  const [activePresetId, setActivePresetId] = useState('preset_sunday_online_14');

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
    if (q.mtts !== undefined) setNumTournaments(Math.max(1, Number(q.mtts) || 14));
    if (q.abi !== undefined) setAbiDollars(Math.max(1, Number(q.abi) || 55));
    if (q.bullets !== undefined) setBulletAllowancePct(Math.max(0, Math.min(200, Number(q.bullets) || 30)));
    if (q.field !== undefined) setAvgFieldSize(Math.max(20, Number(q.field) || 800));
    if (q.roi !== undefined) setExpectedRoiPct(Number(q.roi) || 22);
    if (q.br !== undefined) setTotalBankroll(Math.max(50, Number(q.br) || 12000));
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    mtts: numTournaments,
    abi: abiDollars,
    bullets: bulletAllowancePct,
    field: avgFieldSize,
    roi: expectedRoiPct,
    br: totalBankroll,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setNumTournaments(preset.numTournaments);
    setAbiDollars(preset.abiDollars);
    setBulletAllowancePct(preset.bulletAllowancePct);
    setAvgFieldSize(preset.avgFieldSize);
    setExpectedRoiPct(preset.expectedRoiPct);
    setTotalBankroll(preset.totalBankroll);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/mtt-grind-planner',
          query: {
            mtts: preset.numTournaments,
            abi: preset.abiDollars,
            bullets: preset.bulletAllowancePct,
            field: preset.avgFieldSize,
            roi: preset.expectedRoiPct,
            br: preset.totalBankroll,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const safeMtts = Math.max(1, Math.min(60, Math.round(Number(numTournaments) || 14)));
    const safeAbi = Math.max(1, Number(abiDollars) || 55);
    const safeBulletPct = Math.max(0, Math.min(200, Number(bulletAllowancePct) ?? 30));
    const safeField = Math.max(20, Math.round(Number(avgFieldSize) || 800));
    const safeRoi = Number(expectedRoiPct) || 0;
    const safeBr = Math.max(50, Number(totalBankroll) || 12000);

    const baseCost = safeMtts * safeAbi;
    const totalSessionExposure = baseCost * (1 + safeBulletPct / 100);
    const effectiveAbiWithBullets = safeAbi * (1 + safeBulletPct / 100);
    const bankrollInAbis = safeBr / safeAbi;
    const bankrollInEffectiveAbis = safeBr / Math.max(1, effectiveAbiWithBullets);

    // ITM probability scaled gently by player ROI
    const estItmProb = Math.min(0.32, Math.max(0.11, 0.15 * (1 + safeRoi / 120)));
    const sessionBrickProbPct = Math.pow(1 - estItmProb, safeMtts) * 100;
    const expectedSessionEv = totalSessionExposure * (safeRoi / 100);

    // Field size variance multiplier (larger fields >500 require higher ABI multiple)
    const fieldMult = safeField > 1000 ? 1.25 : safeField > 400 ? 1.0 : 0.85;
    const aggressive100AbiBr = Math.round(100 * effectiveAbiWithBullets * fieldMult);
    const conservative200AbiBr = Math.round(200 * effectiveAbiWithBullets * fieldMult);

    return {
      safeMtts,
      safeAbi,
      safeBulletPct,
      safeField,
      safeRoi,
      safeBr,
      totalSessionExposure: Math.round(totalSessionExposure),
      bankrollInAbis: Math.round(bankrollInAbis),
      bankrollInEffectiveAbis: Math.round(bankrollInEffectiveAbis),
      sessionBrickProbPct: sessionBrickProbPct.toFixed(1),
      expectedSessionEv: expectedSessionEv.toFixed(2),
      aggressive100AbiBr,
      conservative200AbiBr,
    };
  }, [numTournaments, abiDollars, bulletAllowancePct, avgFieldSize, expectedRoiPct, totalBankroll]);

  const canonicalPath = '/tools/mtt-grind-planner';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Plan Your Multi-Table Tournament (MTT) Session Schedule And Average Buy-In (ABI): Calculate Capital Exposure, Session Brick Risk %, Expected Session EV, And 100-200 ABI Bankroll Requirements.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'MTT Schedule And ABI Grind Planner',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'MTT Session Schedule & Average Buy-In Bankroll Planner',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['MTT Schedule & ABI Planner', canonicalPath],
      ],
      faqs: MTT_GRIND_FAQS,
      howTo: {
        name: 'How To Plan An MTT Session Schedule And ABI Bankroll',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Planned Tournaments, Average Buy-In (ABI), And Re-Entry Allowance',
            text: 'Set The Number Of MTTs In Your Session, Your Average Buy-In, And Expected Re-Entry Bullet Percentage.',
          },
          {
            name: 'Input Average Field Size, Expected ROI, And Total Bankroll',
            text: 'Specify Your Average Tournament Field Size, Projected ROI Percentage, And Dedicated MTT Bankroll.',
          },
          {
            name: 'Evaluate Total Session Exposure, Zero-Cash Brick Risk, And ABI Cushion',
            text: 'Review Your Effective ABI Bankroll Multiple, Session Brick Probability, And Expected Net Session EV.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `${metrics.safeMtts}-MTT Session ($${metrics.safeAbi} ABI + ${metrics.safeBulletPct}% Bullets): Total Session Exposure = $${metrics.totalSessionExposure.toLocaleString('en-US')} | Expected Session EV = +$${metrics.expectedSessionEv} | Bankroll Cushion = ${metrics.bankrollInAbis} Nominal ABIs (${metrics.bankrollInEffectiveAbis} Eff ABIs) | 0-ITM Brick Risk = ${metrics.sessionBrickProbPct}%`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="MTT Schedule And ABI Grind Planner"
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
            <span>MTT Schedule &amp; ABI Grind Planner</span>
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
          MTT Session Schedule &amp; Average Buy-In (ABI) Planner
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> A Sustainable Tournament Schedule Keeps Single-Session Capital Exposure (Including Re-Entry Bullets) Below <strong>5% To 10% Of Your Liquid Bankroll</strong> While Maintaining <strong>100 To 200 Effective ABIs</strong> Dependent On Average Field Size.
        </p>

        <CalculatorShareAndPresets
          toolTitle="MTT Schedule And ABI Grind Planner"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={MTT_GRIND_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive MTT Session Schedule & ABI Planner"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Configure Session Tournament Count, ABI, Bullet Allowance &amp; Bankroll
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Tournaments In Session', val: numTournaments, set: setNumTournaments, step: 1, color: '#25c8ff' },
              { label: 'Average Buy-In ($ ABI)', val: abiDollars, set: setAbiDollars, step: 5, color: '#34d399' },
              { label: 'Re-Entry Bullet Allowance (%)', val: bulletAllowancePct, set: setBulletAllowancePct, step: 5, color: '#f2b84b' },
              { label: 'Average Field Size (Entrants)', val: avgFieldSize, set: setAvgFieldSize, step: 50, color: '#f8fafc' },
              { label: 'Player Expected ROI (%)', val: expectedRoiPct, set: setExpectedRoiPct, step: 1, color: '#34d399' },
              { label: 'Total Available Bankroll ($)', val: totalBankroll, set: setTotalBankroll, step: 500, color: '#25c8ff' },
            ].map((input) => (
              <div key={input.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {input.label}
                  <input
                    type="number"
                    step={input.step}
                    value={input.val}
                    onChange={(e) => input.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: input.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Total Session Capital Exposure
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${metrics.totalSessionExposure.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeMtts} Events At ${metrics.safeAbi} + {metrics.safeBulletPct}% Bullets
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Effective ABI Bankroll Depth
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.bankrollInAbis} ABIs ({metrics.bankrollInEffectiveAbis} Eff)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Expected Session EV: +${metrics.expectedSessionEv}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Risk Of Session Brick (0 ITMs)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                {metrics.sessionBrickProbPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Probability Of Zero Cashes Across {metrics.safeMtts} MTTs
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Recommended Bankroll (100 / 200 ABI)
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                ${metrics.aggressive100AbiBr.toLocaleString('en-US')} / ${metrics.conservative200AbiBr.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Aggressive 100 ABI Vs Conservative 200 ABI
              </div>
            </div>
          </div>
        </section>

        <FaqSection faqs={MTT_GRIND_FAQS} />

        <CitationBacklinkBox
          title="MTT Schedule And ABI Grind Planner"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="MTT ABI Engine"
          badgeValue="Session Exposure & Brick Risk Solver"
          summary="Calculates MTT Session Capital Exposure, Effective ABI Bankroll Ratios, Session Brick Probability, And Expected EV."
          slug="mtt-grind-planner"
        />

        <AiPromptLauncher
          title="MTT Schedule And ABI Grind Planner"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}
