/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  RIVER BLUFF-CATCHING, BLOCKERS & OVERBET POLARIZATION SOLVER
 *  (pages/tools/bluff-catching-calculator.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * River Bluff-Catching, Card-Removal Blockers & Overbet Polarization Solver
 * calculating MDF, required bluff frequency, actual villain bluff share after
 * Hero's blocker removal, and exact call EV.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import SmarterConversionCta from '../../src/components/seo/SmarterConversionCta';
import SmarterAccountUnlockGate from '../../src/components/seo/SmarterAccountUnlockGate';
import SmarterCalculatorSaveBar from '../../src/components/seo/SmarterCalculatorSaveBar';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const BLUFF_CATCH_PRESETS = [
  {
    id: 'river_75pct_nut_blocker',
    label: '75% Pot River Bet (18 Value Combos / 14 Bluffs + 25% Value Blocker)',
    pot: 100,
    bet: 75,
    valueCombos: 18,
    bluffCombos: 14,
    blockerPct: 25,
  },
  {
    id: 'river_150pct_overbet_polar',
    label: '150% Polarized River Overbet (12 Nut Combos / 10 Bluffs + 33% Blocker)',
    pot: 100,
    bet: 150,
    valueCombos: 12,
    bluffCombos: 10,
    blockerPct: 33,
  },
  {
    id: 'live_underbluffed_river',
    label: 'Under-Bluffed Live River Jam (20 Value Combos / 4 Bluffs / 0% Blocker)',
    pot: 120,
    bet: 120,
    valueCombos: 20,
    bluffCombos: 4,
    blockerPct: 0,
  },
  {
    id: 'block_bet_33pct_overbluffed',
    label: '33% River Probe Over-Bluffed (15 Value Combos / 10 Bluffs + 15% Blocker)',
    pot: 90,
    bet: 30,
    valueCombos: 15,
    bluffCombos: 10,
    blockerPct: 15,
  },
];

const BLUFF_CATCH_BENCHMARK_TABLE = [
  {
    betSizing: '33% Pot River Block Bet',
    reqBluffFreq: '20.0% Bluffs Required',
    mdfPct: '75.0% MDF',
    valueToBluffRatio: '4.0 Value : 1.0 Bluff',
    blockerGuidance: 'Unblock Missed Low Draws; Call Wide Unless Villain Never Bluffs Thin Sizings',
  },
  {
    betSizing: '75% Pot Standard River Barrel',
    reqBluffFreq: '30.0% Bluffs Required',
    mdfPct: '57.1% MDF',
    valueToBluffRatio: '2.33 Value : 1.0 Bluff',
    blockerGuidance: 'Prioritize Calling With Nut Flush Or Straight Blockers That Remove 25%+ Of Value Combos',
  },
  {
    betSizing: '100% Full-Pot River Polarized Bet',
    reqBluffFreq: '33.3% Bluffs Required',
    mdfPct: '50.0% MDF',
    valueToBluffRatio: '2.0 Value : 1.0 Bluff',
    blockerGuidance: 'Never Call Holding Cards From Villain Primary Busted Flush Draw (Reverse Blockers)',
  },
  {
    betSizing: '150% To 200% River Overbet Jam',
    reqBluffFreq: '37.5% To 40.0% Bluffs Required',
    mdfPct: '40.0% To 33.3% MDF',
    valueToBluffRatio: '1.50 To 1.67 Value : 1.0 Bluff',
    blockerGuidance: 'Mandatory Nut-Value Card Removal Required; Fold Pure Unblocking Bluff-Catchers Vs Under-Bluffers',
  },
];

const BLUFF_CATCH_FAQS = [
  {
    question: 'Why Do All Pure Bluff-Catchers Have Identical Raw Equity Against A Polarized River Range?',
    answer:
      'When An Opponent Bets A Strictly Polarized River Range Consisting Only Of Nutted Value Hands And Total Air Bluffs, Second Pair And Top Pair Both Lose 100% Of The Time To The Value Hands And Win 100% Of The Time Against The Bluffs. Their True Expected Value Difference Comes Entirely From Card-Removal Blockers.',
  },
  {
    question: 'How Do Value Blockers And Anti-Bluff Blockers Shift River Calling EV?',
    answer:
      'Holding The Ace Of The Flush Suit On A Three-Flush River Removes Up To 35% To 45% Of Villain Nut Flush Value Combinations While Removing Zero Missed Offsuit Bluffs, Boosting Your Realized Bluff-Catching Equity By +6% To +12%. Conversely, Holding Two Cards From A Busted Flush Draw Blocks Villain Bluffs And Turns A Break-Even Call Into A Losing Call.',
  },
  {
    question: 'What Percentage Of Villain River Betting Range Must Be Bluffs To Call A Pot-Sized Bet?',
    answer:
      'Facing A 100% Pot-Sized River Bet, You Risk 1 Pot Unit To Win A Final Pot Of 3 Pot Units, Meaning Villain Range Must Contain At Least 33.3% Bluffs (A 2:1 Value-To-Bluff Ratio) For Your Bluff-Catcher To Break Even.',
  },
];

export default function BluffCatchingCalculatorPage({
  initialPot = 100,
  initialBet = 75,
  initialValueCombos = 18,
  initialBluffCombos = 14,
  initialBlockerPct = 25,
}) {
  const router = useRouter();
  const [pot, setPot] = useState(initialPot);
  const [bet, setBet] = useState(initialBet);
  const [valueCombos, setValueCombos] = useState(initialValueCombos);
  const [bluffCombos, setBluffCombos] = useState(initialBluffCombos);
  const [blockerPct, setBlockerPct] = useState(initialBlockerPct);
  const [activePresetId, setActivePresetId] = useState('river_75pct_nut_blocker');

  useSolvedSpotUrlSync(
    { pot, bet, valueCombos, bluffCombos, blockerPct },
    {
      pot: (v) => setPot(Math.max(1, Number(v) || 100)),
      bet: (v) => setBet(Math.max(1, Number(v) || 75)),
      valueCombos: (v) => setValueCombos(Math.max(1, Number(v) || 18)),
      bluffCombos: (v) => setBluffCombos(Math.max(0, Number(v) || 14)),
      blockerPct: (v) => setBlockerPct(Math.max(-50, Math.min(75, Number(v) || 25))),
    }
  );

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPot(preset.pot);
    setBet(preset.bet);
    setValueCombos(preset.valueCombos);
    setBluffCombos(preset.bluffCombos);
    setBlockerPct(preset.blockerPct);
  };

  const metrics = useMemo(() => {
    const safePot = Math.max(1, Number(pot) || 100);
    const safeBet = Math.max(1, Number(bet) || 75);
    const safeVal = Math.max(1, Number(valueCombos) || 18);
    const safeBluff = Math.max(0, Number(bluffCombos) ?? 14);
    const safeBlocker = Math.max(-50, Math.min(75, Number(blockerPct) ?? 25));

    const reqBluffFreqPct = (safeBet / (safePot + 2 * safeBet)) * 100;
    const mdfPct = (safePot / (safePot + safeBet)) * 100;

    // Effective value combos remaining after Hero's card removal blocker %
    const effValueCombos = Math.max(0.5, safeVal * (1 - safeBlocker / 100));
    const unblockedBluffSharePct = (safeBluff / (safeVal + safeBluff)) * 100;
    const blockerAdjBluffSharePct = (safeBluff / (effValueCombos + safeBluff)) * 100;
    const winProbDec = blockerAdjBluffSharePct / 100;

    // EV of Calling = P(Villain Bluffs) * (Pot + Bet) - P(Villain Has Value) * Bet
    const callEv = winProbDec * (safePot + safeBet) - (1 - winProbDec) * safeBet;
    const unblockedWinDec = unblockedBluffSharePct / 100;
    const unblockedCallEv = unblockedWinDec * (safePot + safeBet) - (1 - unblockedWinDec) * safeBet;
    const blockerEvGain = callEv - unblockedCallEv;

    return {
      safePot,
      safeBet,
      safeVal,
      safeBluff,
      safeBlocker,
      effValueCombos: effValueCombos.toFixed(1),
      reqBluffFreqPct: reqBluffFreqPct.toFixed(1),
      mdfPct: mdfPct.toFixed(1),
      unblockedBluffSharePct: unblockedBluffSharePct.toFixed(1),
      blockerAdjBluffSharePct: blockerAdjBluffSharePct.toFixed(1),
      callEv: callEv.toFixed(2),
      unblockedCallEv: unblockedCallEv.toFixed(2),
      blockerEvGain: blockerEvGain.toFixed(2),
      isProfitableCall: callEv >= 0,
    };
  }, [pot, bet, valueCombos, bluffCombos, blockerPct]);

  const canonicalPath = '/tools/bluff-catching-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'River Bluff-Catching Solver';
  const pageDesc =
    'Solve Polarized River Bluff-Catching Decisions With Card-Removal Blockers: Calculate Required Bluff Frequency, Blocker-Adjusted Combo Ratios, MDF, And Exact Call EV.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'GTO River Bluff-Catching & Card Removal Blocker Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['River Bluff-Catching Solver', canonicalPath],
      ],
      faqs: BLUFF_CATCH_FAQS,
      howTo: {
        name: 'How To Solve Polarized River Bluff-Catching Decisions With Card-Removal Blockers',
        description: pageDesc,
        steps: [
          {
            name: 'Enter River Pot Size And Villain Bet Or Overbet Sizing',
            text: 'Input The River Pot Before Villain Bets And Villain Bet Size In Big Blinds Or Dollars.',
          },
          {
            name: 'Assign Villain Value Combos, Bluff Combos, And Hero Blocker Removal %',
            text: 'Estimate Villain Unblocked Value And Bluff Combinations And Your Card-Removal Percentage Against Value.',
          },
          {
            name: 'Compare Blocker-Adjusted Bluff Share Against Required Equity',
            text: 'Inspect Your Exact River Call EV And How Many Big Blinds Your Blockers Add To The Decision.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `River Pot ${metrics.safePot} Facing ${metrics.safeBet} Bet (${metrics.reqBluffFreqPct}% Req Bluffs, ${metrics.mdfPct}% MDF): Villain ${metrics.safeVal} Value / ${metrics.safeBluff} Bluffs With ${metrics.safeBlocker}% Value Blocker -> ${metrics.blockerAdjBluffSharePct}% Bluff Share | Call EV = ${metrics.isProfitableCall ? '+' : ''}${metrics.callEv} BB`;
  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>River Bluff-Catching Solver</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          River Bluff-Catching, Card-Removal Blockers &amp; Overbet Polarization Solver
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Against A Polarized River Bet Of Size <strong>B</strong> Into Pot <strong>P</strong>, Your Bluff-Catcher Requires Villain Range To Contain At Least <strong>B / (P + 2B) Bluffs</strong>. When Your Hole Cards Block <strong>25% To 35% Of Villain Nut Value Combinations</strong> While Unblocking Missed Draws, A Marginally -EV Call Turns Into A Clear <strong>+EV Hero Call</strong>.
            </p>

            <CalculatorShareAndPresets
              toolTitle="River Bluff-Catching Solver"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={BLUFF_CATCH_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive River Bluff-Catching And Blocker Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 18px 0' }}>
            Configure River Pot, Villain Polarized Combos &amp; Hero Card-Removal Blockers
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'River Pot Before Bet (BB Or $)', val: pot, set: setPot, step: 10, color: '#25c8ff' },
              { label: 'Villain River Bet Size (BB Or $)', val: bet, set: setBet, step: 10, color: '#38bdf8' },
              { label: 'Villain Unblocked Value Combos', val: valueCombos, set: setValueCombos, step: 1, color: '#f87171' },
              { label: 'Villain Bluff Combos', val: bluffCombos, set: setBluffCombos, step: 1, color: '#34d399' },
              { label: 'Hero Value Blocker Removal (%)', val: blockerPct, set: setBlockerPct, step: 5, color: '#25c8ff' },
            ].map((inp) => (
              <div key={inp.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {inp.label}
                  <input
                    type="number"
                    step={inp.step}
                    value={inp.val}
                    onChange={(e) => inp.set(e.target.value)}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      border: '1px solid #334155',
                      background: '#020608',
                      color: inp.color,
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
                Required Break-Even Bluff %
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.reqBluffFreqPct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Hero Minimum Defense (MDF): {metrics.mdfPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Blocker-Adjusted Bluff Share
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.blockerAdjBluffSharePct}%
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Unblocked Share: {metrics.unblockedBluffSharePct}% ({metrics.effValueCombos} Eff Value Combos)
              </div>
            </div>

            <div
              style={{
                background: '#020608',
                padding: 16,
                borderRadius: '2px',
                border: `1px solid ${metrics.isProfitableCall ? '#34d399' : '#f87171'}`,
              }}
            >
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Net River Bluff-Catch Call EV
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: metrics.isProfitableCall ? '#34d399' : '#f87171',
                  marginTop: 4,
                }}
              >
                {metrics.isProfitableCall ? '+' : ''}{metrics.callEv} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.isProfitableCall ? 'Solver Verdict: Profitable Hero Call' : 'Solver Verdict: Disciplined Fold'}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                EV Gained From Hero Blockers
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {Number(metrics.blockerEvGain) >= 0 ? '+' : ''}{metrics.blockerEvGain} BB
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Unblocked Call EV: {Number(metrics.unblockedCallEv) >= 0 ? '+' : ''}{metrics.unblockedCallEv} BB
              </div>
            </div>
          </div>
        </section>

        {!isEmbed && (
          <div style={{ marginBottom: 32 }}>
            <SmarterCalculatorSaveBar
              toolSlug="bluff-catching-calculator"
              toolName="River Bluff-Catching Solver"
              eyebrow="Free River Math Cloud Sync"
              title="Save This River Bluff-Catching Spot Free"
              description="Sync Break-Even Calling Thresholds, Blocker Effects & MDF River Spots Across Phone & Desktop."
              ctaLabel="Save Bluff-Catch Spot Free"
              summaryText={summaryText}
              redirectPath={canonicalPath}
            />
            <SmarterAccountUnlockGate
              variant="calculator-pro"
              context="tools-bluff-catching-calculator"
              redirectPath={canonicalPath}
            />
          </div>
        )}

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Polarized River Bet Sizing, MDF &amp; Blocker Selection Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Required Villain Bluff Thresholds And Card-Removal Priorities Across River Bet Sizings
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>River Bet Sizing</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Required Bluff %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Defender MDF</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Balanced Value : Bluff</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Card-Removal Blocker Rule</th>
                </tr>
              </thead>
              <tbody>
                {BLUFF_CATCH_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.betSizing} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.betSizing}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.reqBluffFreq}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.mdfPct}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{row.valueToBluffRatio}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.blockerGuidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Postflop &amp; GTO Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/multi-street-ev-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#38bdf8', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Multi-Street Barrel EV Solver
            </Link>
            <Link href="/tools/geometric-bet-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Geometric Overbet Calculator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <SmarterConversionCta
              compact
              eyebrow="Free Smarter.Poker Account"
              title="Save River Bluff-Catching Spots & Drill GTO Free"
              description="Bookmark Blocker-Adjusted MDF Calculations And Practice River Call-Down Decisions In 107 Free GTO Games."
              primaryLabel="Create Free Account"
              primaryHref="/auth/signup?redirect=/tools/bluff-catching-calculator&src=bluff-catch"
              secondaryLabel="Sign In"
              secondaryHref="/auth/login?redirect=/tools/bluff-catching-calculator"
            />

            <FaqSection faqs={BLUFF_CATCH_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="River Bluff-Catching Solver"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="River Blocker Engine"
              badgeValue="Card-Removal & Call EV Solver"
              summary="Calculates Polarized River Bluff-Catching Call EV, Card-Removal Blocker Shifts, Required Bluff Frequency, And MDF."
              slug="bluff-catching-calculator"
            />

            <AiPromptLauncher
              title="River Bluff-Catching Solver"
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
    const { renderHubToolMarkdown } = await import('../api/hub-tool-markdown');
    const md = renderHubToolMarkdown('/tools/bluff-catching-calculator', query);
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  setPublicSeoHtmlCache(res);
  return {
    props: {
      initialPot: Number(query?.pot) || 100,
      initialBet: Number(query?.bet) || 75,
      initialValueCombos: Number(query?.valueCombos) || 18,
      initialBluffCombos: query?.bluffCombos !== undefined ? Number(query.bluffCombos) : 14,
      initialBlockerPct: query?.blockerPct !== undefined ? Number(query.blockerPct) : 25,
    },
  };
}
