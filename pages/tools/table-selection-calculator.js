/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE CASH GAME TABLE-SELECTION & PROFITABILITY SCORECARD (/tools/table-selection-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Composite Table Profitability Grade (S-Tier Whale Table, A+ Must Stay,
 * B Solid Grind, C Marginal Rake Trap, F Immediate Table Change), Projected
 * Hourly Winrate Multiplier (bb/hr and $/hr), and Rake Burden % of Winrate.
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
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const STAKES_OPTIONS = [
  { id: '1_2', label: '$1/$2 No-Limit Holdem', bb: 2 },
  { id: '1_3', label: '$1/$3 No-Limit Holdem', bb: 3 },
  { id: '2_5', label: '$2/$5 No-Limit Holdem', bb: 5 },
  { id: '5_10', label: '$5/$10 No-Limit Holdem', bb: 10 },
];

const TABLE_PRESETS = [
  {
    id: 'preset_friday_whale',
    label: 'Friday Night $2/$5 Texas Whale & Straddle Table',
    stakeId: '2_5',
    recPlayers: 5,
    avgStackBb: 220,
    straddleFreqPct: 65,
    bombPotsPerOrbit: 1,
    rakeCapDollars: 6,
  },
  {
    id: 'preset_vegas_1_3_solid',
    label: 'Las Vegas Strip $1/$3 Tourist Table',
    stakeId: '1_3',
    recPlayers: 4,
    avgStackBb: 110,
    straddleFreqPct: 20,
    bombPotsPerOrbit: 0,
    rakeCapDollars: 6,
  },
  {
    id: 'preset_tuesday_reg_trap',
    label: 'Tuesday Morning $1/$2 Short-Stack Rake Trap',
    stakeId: '1_2',
    recPlayers: 1,
    avgStackBb: 55,
    straddleFreqPct: 0,
    bombPotsPerOrbit: 0,
    rakeCapDollars: 8,
  },
  {
    id: 'preset_5_10_deep',
    label: 'High-Action $5/$10 Deep Stack With Bomb Pots',
    stakeId: '5_10',
    recPlayers: 3,
    avgStackBb: 180,
    straddleFreqPct: 40,
    bombPotsPerOrbit: 1,
    rakeCapDollars: 7,
  },
];

const TABLE_SELECTION_FAQS = [
  {
    question: 'Why Is Table Selection More Important Than Minor Postflop GTO Adjustments In Live Cash Games?',
    answer:
      'In Live No-Limit Holdem, A Table With Four 45%+ VPIP Recreational Players And 180BB Effective Stacks Can Yield 12 To 18 BB/Hr, Whereas A Table Full Of 60BB Tight Regs Paying A $7+2 Drop Often Has A Negative Maximum Achievable Winrate For Every Seat At The Table.',
  },
  {
    question: 'When Should You Request An Immediate Table Change In A Live Card Room?',
    answer:
      'Request A Table Change Whenever There Are Fewer Than 2 Recreational Players With VPIP Above 35%, When Average Stack Depth Falls Below 75 Big Blinds, Or When Hourly Casino Rake Exceeds 45% Of Your Expected Pre-Rake Winrate.',
  },
  {
    question: 'How Do Straddles And Once-Per-Orbit Bomb Pots Boost Table Profitability?',
    answer:
      'Active Button Or UTG Straddles Double The Effective Stakes While Compressing SPR, And Once-Per-Orbit Double-Board Bomb Pots Inject 25BB To 45BB Of Dead Pre-Flop Money Per Orbit Where Discipline Around Nut-Lock Equity Creates Massive Hourly Winrate Boosts.',
  },
];

export default function TableSelectionCalculatorPage() {
  const router = useRouter();
  const [stakeId, setStakeId] = useState('2_5');
  const [recPlayers, setRecPlayers] = useState(5);
  const [avgStackBb, setAvgStackBb] = useState(220);
  const [straddleFreqPct, setStraddleFreqPct] = useState(65);
  const [bombPotsPerOrbit, setBombPotsPerOrbit] = useState(1);
  const [rakeCapDollars, setRakeCapDollars] = useState(6);
  const [activePresetId, setActivePresetId] = useState('preset_friday_whale');

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
    if (q.stake && STAKES_OPTIONS.some((s) => s.id === q.stake)) setStakeId(q.stake);
    if (q.recs !== undefined) setRecPlayers(Math.max(0, Math.min(8, Number(q.recs) || 5)));
    if (q.depth !== undefined) setAvgStackBb(Math.max(30, Number(q.depth) || 220));
    if (q.straddle !== undefined) setStraddleFreqPct(Math.max(0, Math.min(100, Number(q.straddle) || 65)));
    if (q.bomb !== undefined) setBombPotsPerOrbit(Math.max(0, Math.min(3, Number(q.bomb) || 1)));
    if (q.rake !== undefined) setRakeCapDollars(Math.max(1, Number(q.rake) || 6));
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    stake: stakeId,
    recs: recPlayers,
    depth: avgStackBb,
    straddle: straddleFreqPct,
    bomb: bombPotsPerOrbit,
    rake: rakeCapDollars,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setStakeId(preset.stakeId);
    setRecPlayers(preset.recPlayers);
    setAvgStackBb(preset.avgStackBb);
    setStraddleFreqPct(preset.straddleFreqPct);
    setBombPotsPerOrbit(preset.bombPotsPerOrbit);
    setRakeCapDollars(preset.rakeCapDollars);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/table-selection-calculator',
          query: {
            stake: preset.stakeId,
            recs: preset.recPlayers,
            depth: preset.avgStackBb,
            straddle: preset.straddleFreqPct,
            bomb: preset.bombPotsPerOrbit,
            rake: preset.rakeCapDollars,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const stakeObj = STAKES_OPTIONS.find((s) => s.id === stakeId) || STAKES_OPTIONS[2];
    const bb = stakeObj.bb;
    const safeRecs = Math.max(0, Math.min(8, Math.round(Number(recPlayers) ?? 5)));
    const safeDepth = Math.max(30, Math.min(500, Number(avgStackBb) || 150));
    const safeStraddle = Math.max(0, Math.min(100, Number(straddleFreqPct) || 0));
    const safeBomb = Math.max(0, Math.min(3, Number(bombPotsPerOrbit) || 0));
    const safeRakeCap = Math.max(1, Number(rakeCapDollars) || 6);

    // Gross bb/hr model: base + rec bonus * depth multiplier + straddle + bomb pot
    const depthMult = Math.min(1.55, Math.max(0.55, Math.pow(safeDepth / 100, 0.42)));
    const grossBbPerHr =
      (1.8 + safeRecs * 2.15) * depthMult + (safeStraddle / 100) * 2.8 + safeBomb * 2.4;

    // Personal hourly rake cost in BB/hr (assuming ~3.3 raked pots won per hour)
    const hourlyRakeDollars = 3.3 * safeRakeCap;
    const hourlyRakeBb = hourlyRakeDollars / bb;
    const netBbPerHr = grossBbPerHr - hourlyRakeBb;
    const netDollarsPerHr = netBbPerHr * bb;
    const rakeBurdenPct = grossBbPerHr > 0 ? Math.min(100, (hourlyRakeBb / grossBbPerHr) * 100) : 100;

    let grade = 'B Solid Grind';
    let gradeColor = '#25c8ff';
    if (netBbPerHr >= 13) {
      grade = 'S-Tier Whale Table';
      gradeColor = '#34d399';
    } else if (netBbPerHr >= 9) {
      grade = 'A+ Must Stay';
      gradeColor = '#34d399';
    } else if (netBbPerHr >= 5.5) {
      grade = 'B Solid Grind';
      gradeColor = '#25c8ff';
    } else if (netBbPerHr >= 2.5) {
      grade = 'C Marginal Rake Trap';
      gradeColor = '#38bdf8';
    } else {
      grade = 'F Immediate Table Change';
      gradeColor = '#ef4444';
    }

    return {
      stakeObj,
      safeRecs,
      safeDepth,
      safeStraddle,
      safeBomb,
      safeRakeCap,
      grossBbPerHr: grossBbPerHr.toFixed(1),
      netBbPerHr: netBbPerHr.toFixed(1),
      netDollarsPerHr: netDollarsPerHr.toFixed(0),
      hourlyRakeDollars: hourlyRakeDollars.toFixed(0),
      rakeBurdenPct: rakeBurdenPct.toFixed(1),
      grade,
      gradeColor,
    };
  }, [stakeId, recPlayers, avgStackBb, straddleFreqPct, bombPotsPerOrbit, rakeCapDollars]);

  const canonicalPath = '/tools/table-selection-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Grade Any Live Cash Game Poker Table From S-Tier Whale Table To F Immediate Table Change Based On VPIP>40% Players, Stack Depth, Straddles, Bomb Pots, And Rake Cap.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Live Poker Table Selection Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Live Cash Game Table Selection & Hourly Winrate Scorecard',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Live Table Selection Calculator', canonicalPath],
      ],
      faqs: TABLE_SELECTION_FAQS,
      howTo: {
        name: 'How To Grade A Live Cash Game Poker Table And Project Hourly Winrate',
        description: pageDesc,
        steps: [
          {
            name: 'Select Stake Level And Count Recreational VPIP>40% Players',
            text: 'Choose Your Live Cash Game Stake And Enter How Many Loose Action Players Are Seated.',
          },
          {
            name: 'Input Average Table Stack Depth, Straddle Frequency, And Bomb Pots',
            text: 'Set Average Effective Stack In Big Blinds, Orbit Straddle Percentage, And Bomb Pots Per Hour.',
          },
          {
            name: 'Read Your Table Tier Grade (S To F) And Net Hourly Winrate After Rake',
            text: 'Inspect Your Projected BB/Hr, Net Dollars Per Hour After Rake Cap, And Table-Change Recommendation.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `${metrics.stakeObj.label} (${metrics.safeRecs} VPIP>40% Players, ${metrics.safeDepth}BB Avg Stack, ${metrics.safeStraddle}% Straddle): Grade = ${metrics.grade} | Projected Winrate = ${metrics.netBbPerHr} BB/Hr ($${metrics.netDollarsPerHr}/Hr) | Rake Burden = ${metrics.rakeBurdenPct}%`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Live Poker Table Selection Calculator"
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
            <span>Live Table Selection Calculator</span>
          </nav>
          <Link
            href="/search"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#38bdf8',
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
          Live Cash Game Table-Selection &amp; Profitability Scorecard
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> Live Cash Game Winrates Depend Overwhelmingly On <strong>Recreational Player Density (VPIP &gt; 40%)</strong>, <strong>Effective Table Stack Depth</strong>, And <strong>Rake Cap Burden</strong>. Use This Scorecard To Grade Your Table From <strong>S-Tier Whale Table</strong> Down To <strong>F Immediate Table Change</strong>.
        </p>

        <CalculatorShareAndPresets
          toolTitle="Live Poker Table Selection Calculator"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={TABLE_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive Live Table Selection Scorecard"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Score Your Current Live Cash Table Conditions
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Cash Game Stakes
                <select
                  value={stakeId}
                  onChange={(e) => setStakeId(e.target.value)}
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
                  {STAKES_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                VPIP &gt; 40% Loose Players (0-8)
                <input
                  type="number"
                  min="0"
                  max="8"
                  value={recPlayers}
                  onChange={(e) => setRecPlayers(e.target.value)}
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
                Average Table Stack Depth (BB)
                <input
                  type="number"
                  min="30"
                  max="500"
                  step="10"
                  value={avgStackBb}
                  onChange={(e) => setAvgStackBb(e.target.value)}
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
                Straddle Frequency (% Of Hands)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={straddleFreqPct}
                  onChange={(e) => setStraddleFreqPct(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#38bdf8',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Bomb Pots Per Orbit (0 To 3)
                <input
                  type="number"
                  min="0"
                  max="3"
                  value={bombPotsPerOrbit}
                  onChange={(e) => setBombPotsPerOrbit(e.target.value)}
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
                Max Pot Rake + Promo Drop ($/Hand)
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="1"
                  value={rakeCapDollars}
                  onChange={(e) => setRakeCapDollars(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f87171',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: `1px solid ${metrics.gradeColor}` }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Composite Table Profitability Grade
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: metrics.gradeColor, marginTop: 4 }}>
                {metrics.grade}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safeRecs} VPIP&gt;40% Seats At {metrics.safeDepth}BB Depth
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Projected Net Hourly Winrate
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.netDollarsPerHr}/Hr ({metrics.netBbPerHr} BB/Hr)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Pre-Rake Gross Winrate: {metrics.grossBbPerHr} BB/Hr
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Rake Burden % Of Gross Winrate
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.rakeBurdenPct}% Rake Drag
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Est Personal Rake Paid: ${metrics.hourlyRakeDollars}/Hr
              </div>
            </div>
          </div>
        </section>

        <div style={{ marginBottom: 32 }}>
          <SmarterAccountUnlockGate
            variant="calculator-pro"
            context="tools-table-selection-calculator"
            redirectPath={canonicalPath}
          />
        </div>

        <SmarterConversionCta
          compact
          eyebrow="Free Smarter.Poker Account"
          title="Score Live Tables & Find Softest Poker Rooms Free"
          description="Compare Live Room Traffic Across 715+ Venues, Log Session Winrates, And Unlock 107 Free GTO Games."
          primaryLabel="Create Free Account"
          primaryHref="/auth/signup?redirect=/tools/table-selection-calculator&src=table-selection"
          secondaryLabel="Sign In"
          secondaryHref="/auth/login?redirect=/tools/table-selection-calculator"
        />

        <FaqSection faqs={TABLE_SELECTION_FAQS} />

        <CitationBacklinkBox
          title="Live Poker Table Selection Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Table Selection Engine"
          badgeValue="Live Cash Profitability Grader"
          summary="Evaluates Live Cash Game Poker Tables Across Recreational Density, Stack Depth, Straddles, And Rake Drag."
          slug="table-selection-calculator"
        />

        <AiPromptLauncher
          title="Live Poker Table Selection Calculator"
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
    const md = renderHubToolMarkdown('/tools/table-selection-calculator', query);
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
