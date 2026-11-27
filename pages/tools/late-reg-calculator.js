/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT LATE-REGISTRATION & RE-ENTRY ICM EV CALCULATOR (/tools/late-reg-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes ICM chip appreciation and dollar EV of entering a tournament at
 * Level 1 vs late-registering at 15BB, 20BB, 25BB, or 30BB based on buy-in,
 * rake/fee %, total entries, % field remaining at close of registration, and
 * estimated skill edge (ROI %).
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
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const LATE_REG_PRESETS = [
  {
    id: 'preset_max_late_15bb',
    label: 'Max Late-Reg At 15BB (50% Field Eliminated)',
    buyIn: 500,
    rakePct: 10,
    totalEntries: 400,
    fieldRemainingPct: 50,
    lateRegBb: 15,
    playerRoiPct: 18,
  },
  {
    id: 'preset_25bb_circuit',
    label: 'Circuit Event At 25BB (65% Field Remaining)',
    buyIn: 1100,
    rakePct: 11,
    totalEntries: 650,
    fieldRemainingPct: 65,
    lateRegBb: 25,
    playerRoiPct: 22,
  },
  {
    id: 'preset_wsop_freeze',
    label: 'WSOP $1,500 Late Entry At 20BB (55% Left)',
    buyIn: 1500,
    rakePct: 11,
    totalEntries: 2200,
    fieldRemainingPct: 55,
    lateRegBb: 20,
    playerRoiPct: 25,
  },
  {
    id: 'preset_online_high_rake',
    label: 'Online $109 MTT Max Late-Reg At 15BB (45% Left)',
    buyIn: 109,
    rakePct: 8.3,
    totalEntries: 1000,
    fieldRemainingPct: 45,
    lateRegBb: 15,
    playerRoiPct: 12,
  },
];

const LATE_REG_BENCHMARK_TABLE = [
  {
    fieldLeft: '100% Remaining (Level 1 Entry)',
    icmBoost: '+0.0% ICM Boost',
    startingChipValue: '$90.00 (On $100+$10)',
    breakevenRoi: '+10.0% Skill ROI Required',
    verdict: 'Enter Level 1 When Your Postflop Deep-Stack Skill Edge Exceeds 15% To 25% ROI',
  },
  {
    fieldLeft: '75% Of Field Remaining (30BB Entry)',
    icmBoost: '+7.2% ICM Boost',
    startingChipValue: '$96.48',
    breakevenRoi: '+3.6% Skill ROI Required',
    verdict: 'Sweet Spot For Balanced MTT Grinders: Cuts 3 Hours Of Play While Offsetting 65% Of Rake',
  },
  {
    fieldLeft: '60% Of Field Remaining (20BB Entry)',
    icmBoost: '+12.8% ICM Boost',
    startingChipValue: '$101.52',
    breakevenRoi: '0.0% (Instant +$1.52 ICM Profit)',
    verdict: 'Late-Reg Stack Already Worth More Than Full Buy-In + Rake Due To Early Eliminations',
  },
  {
    fieldLeft: '50% Of Field Remaining (15BB Max Late-Reg)',
    icmBoost: '+17.5% ICM Boost',
    startingChipValue: '$105.75',
    breakevenRoi: '0.0% (Instant +$5.75 ICM Profit)',
    verdict: 'Highest Hourly $/Hr For Short-Stack Push/Fold Specialists And Multi-Tablers',
  },
  {
    fieldLeft: '40% Of Field Remaining (12BB Near Money Bubble)',
    icmBoost: '+23.4% ICM Boost',
    startingChipValue: '$111.06',
    breakevenRoi: '0.0% (Instant +$11.06 ICM Profit)',
    verdict: 'Mandatory Max Late-Reg Spot Even For Zero-Edge Players Facing Top Regs',
  },
];

const LATE_REG_FAQS = [
  {
    question: 'Why Does Late-Registering A Poker Tournament Increase Your Starting Stack ICM Dollar Value?',
    answer:
      'Every Player Who Busts Before Registration Closes Forfeits Their Claim On The Prize Pool While Leaving 100% Of Their Entry Fee Inside The Net Prize Pool. When You Late-Register With Half The Field Already Eliminated, Your Fresh Starting Stack Captures An Immediate Share Of Those Eliminated Players Equity.',
  },
  {
    question: 'When Is Entering At Level 1 More Profitable Than Max Late-Registration?',
    answer:
      'Entering At Level 1 Is More Profitable When You Have A Large Deep-Stack Skill Edge Against Weak Recreational Opponents Who Bust Early. If Your Deep-Stack Skill ROI Exceeds The ICM Appreciation Gained By Waiting, Playing From Hand 1 Maximizes Total Dollar EV.',
  },
  {
    question: 'How Does Late-Registration Affect Your Tournament Hourly Winrate ($/Hr)?',
    answer:
      'Even If Entering At Level 1 Produces Slightly Higher Total Dollar EV Per Tournament, Late-Registering Shaves 2 To 4 Hours Off Your Time Investment Per Bullet, Which Often Doubles Your Realized Hourly Winrate ($/Hr).',
  },
];

export default function LateRegCalculatorPage() {
  const router = useRouter();
  const [buyIn, setBuyIn] = useState(500);
  const [rakePct, setRakePct] = useState(10);
  const [totalEntries, setTotalEntries] = useState(400);
  const [fieldRemainingPct, setFieldRemainingPct] = useState(50);
  const [lateRegBb, setLateRegBb] = useState(15);
  const [playerRoiPct, setPlayerRoiPct] = useState(18);
  const [activePresetId, setActivePresetId] = useState('preset_max_late_15bb');

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
    if (q.buyin !== undefined) setBuyIn(Math.max(5, Number(q.buyin) || 500));
    if (q.rake !== undefined) setRakePct(Math.max(0, Math.min(30, Number(q.rake) || 10)));
    if (q.entries !== undefined) setTotalEntries(Math.max(20, Number(q.entries) || 400));
    if (q.rem !== undefined) setFieldRemainingPct(Math.max(20, Math.min(100, Number(q.rem) || 50)));
    if (q.bb !== undefined) setLateRegBb(Number(q.bb) || 15);
    if (q.roi !== undefined) setPlayerRoiPct(Number(q.roi) || 18);
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    buyin: buyIn,
    rake: rakePct,
    entries: totalEntries,
    rem: fieldRemainingPct,
    bb: lateRegBb,
    roi: playerRoiPct,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setBuyIn(preset.buyIn);
    setRakePct(preset.rakePct);
    setTotalEntries(preset.totalEntries);
    setFieldRemainingPct(preset.fieldRemainingPct);
    setLateRegBb(preset.lateRegBb);
    setPlayerRoiPct(preset.playerRoiPct);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/late-reg-calculator',
          query: {
            buyin: preset.buyIn,
            rake: preset.rakePct,
            entries: preset.totalEntries,
            rem: preset.fieldRemainingPct,
            bb: preset.lateRegBb,
            roi: preset.playerRoiPct,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const safeBuyIn = Math.max(5, Number(buyIn) || 500);
    const safeRake = Math.max(0, Math.min(30, Number(rakePct) ?? 10));
    const safeEntries = Math.max(20, Math.round(Number(totalEntries) || 400));
    const safeRemainingPct = Math.max(20, Math.min(100, Number(fieldRemainingPct) || 50));
    const safeBb = Math.max(10, Math.min(100, Number(lateRegBb) || 15));
    const safeRoi = Math.max(-50, Math.min(200, Number(playerRoiPct) ?? 18));

    const netBuyInToPool = safeBuyIn * (1 - safeRake / 100);
    const rakeDollar = safeBuyIn - netBuyInToPool;

    // Empirical Malmuth-Harville ICM power-law appreciation for a 1x starting stack
    // entering when fraction f = (fieldRemainingPct / 100) of field remains:
    // ICM multiplier approx f^(-0.235) for standard 15% ITM top-heavy payout curve
    const remFrac = safeRemainingPct / 100;
    const icmMultiplier = Math.pow(remFrac, -0.235);
    const lateRegIcmEntryValue = netBuyInToPool * icmMultiplier;
    const freeIcmDollarGained = lateRegIcmEntryValue - netBuyInToPool;
    const freeIcmPctGained = (icmMultiplier - 1) * 100;

    // Skill edge retention at short stack depth relative to 100BB Level 1
    const depthEdgeRetention = Math.min(1, Math.pow(safeBb / 100, 0.35));
    const level1ExpectedTotalVal = safeBuyIn * (1 + safeRoi / 100);
    const level1NetEv = level1ExpectedTotalVal - safeBuyIn;

    const lateRegSkillBonus = netBuyInToPool * (safeRoi / 100) * depthEdgeRetention;
    const lateRegExpectedTotalVal = lateRegIcmEntryValue + lateRegSkillBonus;
    const lateRegNetEv = lateRegExpectedTotalVal - safeBuyIn;

    const requiredRoiAtLevel1 = (rakeDollar / netBuyInToPool) * 100;
    const requiredRoiAtLateReg = Math.max(0, ((safeBuyIn - lateRegIcmEntryValue) / netBuyInToPool) * 100);

    return {
      safeBuyIn,
      safeRake,
      safeEntries,
      safeRemainingPct,
      safeBb,
      safeRoi,
      netBuyInToPool: netBuyInToPool.toFixed(2),
      lateRegIcmEntryValue: lateRegIcmEntryValue.toFixed(2),
      freeIcmDollarGained: freeIcmDollarGained.toFixed(2),
      freeIcmPctGained: freeIcmPctGained.toFixed(1),
      level1NetEv: level1NetEv.toFixed(2),
      lateRegNetEv: lateRegNetEv.toFixed(2),
      requiredRoiAtLevel1: requiredRoiAtLevel1.toFixed(1),
      requiredRoiAtLateReg: requiredRoiAtLateReg.toFixed(1),
    };
  }, [buyIn, rakePct, totalEntries, fieldRemainingPct, lateRegBb, playerRoiPct]);

  const canonicalPath = '/tools/late-reg-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Tournament Late-Registration ICM Chip Appreciation, Free ICM Dollar Equity Gained At 15BB To 30BB, And Level 1 Vs Max Late-Reg Expected Value.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Tournament Late-Reg ICM EV Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Tournament Late-Registration & Re-Entry ICM Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Tournament Late-Reg ICM Calculator', canonicalPath],
      ],
      faqs: LATE_REG_FAQS,
      howTo: {
        name: 'How To Calculate Tournament Late-Registration ICM Equity Gain',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Tournament Buy-In, Rake Percentage, And Total Entries',
            text: 'Input The Gross Buy-In, House Rake Fee Percentage, And Projected Total Field Size.',
          },
          {
            name: 'Set Remaining Field Percentage And Late-Reg Stack Depth',
            text: 'Enter The Percentage Of Entrants Still Alive At Max Late-Reg And Your Starting Big Blind Stack.',
          },
          {
            name: 'Compare Level 1 Vs Max Late-Reg ICM Entry Value And Net EV',
            text: 'Inspect The Free ICM Dollar Equity Gained And Minimum Required Player ROI To Enter Profitably.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `$${metrics.safeBuyIn} MTT (${metrics.safeRake}% Rake, ${metrics.safeRemainingPct}% Field Remaining At ${metrics.safeBb}BB): Level 1 Stack Value = $${metrics.netBuyInToPool} | Late-Reg ICM Stack Value = $${metrics.lateRegIcmEntryValue} (+$${metrics.freeIcmDollarGained} / +${metrics.freeIcmPctGained}% Free ICM Equity)`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Tournament Late-Reg ICM EV Calculator"
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
            <span>Tournament Late-Reg ICM EV Calculator</span>
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
          Tournament Late-Registration &amp; Re-Entry ICM EV Calculator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> When You Late-Register A Tournament After <strong>40% To 55% Of The Field Has Already Eliminated</strong>, Your Starting Stack Gains <strong>+12% To +20% Free ICM Equity</strong> Automatically, Often Making Your Fresh Stack Worth More Than The Full Buy-In Plus Rake Before A Single Card Is Dealt To You.
        </p>

        <CalculatorShareAndPresets
          toolTitle="Tournament Late-Reg ICM EV Calculator"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={LATE_REG_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive Late-Registration ICM Calculator"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Configure Buy-In, Rake, Field Attrition &amp; Late-Reg Stack Depth
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Tournament Buy-In ($)
                <input
                  type="number"
                  min="5"
                  step="50"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
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
                Rake &amp; Staff Fee (% Of Buy-In)
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  value={rakePct}
                  onChange={(e) => setRakePct(e.target.value)}
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
                Total Tournament Entries
                <input
                  type="number"
                  min="20"
                  step="50"
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
                % Field Remaining At Late-Reg
                <input
                  type="number"
                  min="20"
                  max="100"
                  step="5"
                  value={fieldRemainingPct}
                  onChange={(e) => setFieldRemainingPct(e.target.value)}
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
                Late-Reg Starting Depth (BB)
                <select
                  value={lateRegBb}
                  onChange={(e) => setLateRegBb(Number(e.target.value))}
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
                  {[15, 20, 25, 30].map((bbVal) => (
                    <option key={bbVal} value={bbVal}>
                      {bbVal} Big Blinds At Entry
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Your Full-Tournament ROI (%)
                <input
                  type="number"
                  min="-30"
                  max="150"
                  step="1"
                  value={playerRoiPct}
                  onChange={(e) => setPlayerRoiPct(e.target.value)}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Level 1 Starting Stack Value
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                ${metrics.netBuyInToPool}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Level 1 Net EV (With {metrics.safeRoi}% ROI): ${metrics.level1NetEv}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Late-Reg ICM Entry Value
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                ${metrics.lateRegIcmEntryValue}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Late-Reg Net EV (At {metrics.safeBb}BB): ${metrics.lateRegNetEv}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Free ICM Equity Gained
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                +${metrics.freeIcmDollarGained} (+{metrics.freeIcmPctGained}%)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Captured From {100 - metrics.safeRemainingPct}% Eliminated Field
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Required Break-Even Skill ROI
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.requiredRoiAtLateReg}% ROI
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Vs {metrics.requiredRoiAtLevel1}% Needed At Level 1
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Tournament Field Attrition &amp; Late-Registration ICM Boost Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Malmuth-Harville Starting Stack ICM Appreciation By Percentage Of Field Remaining At Registration Close
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Field Remaining</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>ICM Equity Boost</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Stack Value ($100+$10)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Break-Even ROI</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Strategic Verdict</th>
                </tr>
              </thead>
              <tbody>
                {LATE_REG_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.fieldLeft} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.fieldLeft}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.icmBoost}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.startingChipValue}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.breakevenRoi}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <FaqSection faqs={LATE_REG_FAQS} />

        <CitationBacklinkBox
          title="Tournament Late-Reg ICM EV Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Late-Reg ICM Engine"
          badgeValue="Field Attrition $EV Solver"
          summary="Calculates Tournament Late-Registration ICM Chip Appreciation, Free ICM Equity Gained, And Break-Even ROI Thresholds."
          slug="late-reg-calculator"
        />

        <AiPromptLauncher
          title="Tournament Late-Reg ICM EV Calculator"
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
    const md = renderHubToolMarkdown('/tools/late-reg-calculator', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return { props: {} };
}
