/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GTO GEOMETRIC BET-SIZING & OVERBET PLANNER (/tools/geometric-bet-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes exact mathematical geometric pot-fraction g = (((2S + P)/P)^(1/n) - 1) / 2
 * so the exact same % of the pot is bet on every street to put the last chip
 * all-in on the river. Displays street-by-street table plus comparison vs
 * standard 33% / 75% / Jam line.
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

const GEOMETRIC_PRESETS = [
  {
    id: 'preset_srp_100bb_3e',
    label: '100BB Single-Raised Pot (Pot 6.5BB, Stack 97BB, 3 Streets)',
    potSize: 6.5,
    effectiveStack: 97,
    streetMode: '3e',
  },
  {
    id: 'preset_3bp_100bb_3e',
    label: '100BB 3-Bet Pot (Pot 20.5BB, Stack 90BB, 3 Streets)',
    potSize: 20.5,
    effectiveStack: 90,
    streetMode: '3e',
  },
  {
    id: 'preset_turn_2e_overbet',
    label: 'Flop Check-Through -> Turn/River 2e Polarized Overbet',
    potSize: 6.5,
    effectiveStack: 97,
    streetMode: 'check_2e',
  },
  {
    id: 'preset_deep_200bb_3e',
    label: '200BB Deep Cash Pot (Pot 10BB, Stack 195BB, 3 Streets)',
    potSize: 10,
    effectiveStack: 195,
    streetMode: '3e',
  },
];

const GEOMETRIC_FAQS = [
  {
    question: 'What Is The Exact Mathematical Formula For GTO Geometric Bet Sizing?',
    answer:
      'Given Current Pot P, Effective Remaining Stack S, And Number Of Betting Streets n, The Constant Pot-Fraction Bet Size g Equals (((2S + P) / P)^(1 / n) - 1) / 2. Because Each Called Bet Multiplies The Pot By (1 + 2g), Betting g On All n Streets Grows The Final River Pot To Exactly P + 2S.',
  },
  {
    question: 'When Do GTO Solvers Prefer A 2-Street Geometric Overbet (2e) Over A 3-Street Barrel (3e)?',
    answer:
      'When The Flop Checks Through Or When You Hold A Small Flop C-Bet Followed By A Blank Turn That Locks In Your Nut Advantage, Switching To A 2-Street Geometric Overbet (Often 115% To 160% Of The Pot On Both Turn And River) Maximizes Value Extraction And Forces Maximum Indifference.',
  },
  {
    question: 'Why Is Geometric Sizing Superior To Betting 50% On The Flop And Shoving 250% On The River?',
    answer:
      'If You Bet Too Small On Early Streets And Are Forced To Jam 2.5x Pot On The River, Your Opponent Minimum Defense Frequency (MDF) Drops Below 30% On The River, Allowing Them To Call Cheaply On Early Streets And Fold Effortlessly On The River.',
  },
];

export default function GeometricBetCalculatorPage() {
  const router = useRouter();
  const [potSize, setPotSize] = useState(6.5);
  const [effectiveStack, setEffectiveStack] = useState(97);
  const [streetMode, setStreetMode] = useState('3e');
  const [activePresetId, setActivePresetId] = useState('preset_srp_100bb_3e');

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
    if (q.pot !== undefined) setPotSize(Math.max(0.5, Number(q.pot) || 6.5));
    if (q.stack !== undefined) setEffectiveStack(Math.max(1, Number(q.stack) || 97));
    if (q.mode === '3e' || q.mode === '2e' || q.mode === 'check_2e') setStreetMode(q.mode);
  }, [router.isReady, router.query]);

  useSolvedSpotUrlSync({
    pot: potSize,
    stack: effectiveStack,
    mode: streetMode,
  });

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPotSize(preset.potSize);
    setEffectiveStack(preset.effectiveStack);
    setStreetMode(preset.streetMode);
    if (router.isReady) {
      router.replace(
        {
          pathname: '/tools/geometric-bet-calculator',
          query: {
            pot: preset.potSize,
            stack: preset.effectiveStack,
            mode: preset.streetMode,
          },
        },
        undefined,
        { shallow: true }
      );
    }
  };

  const metrics = useMemo(() => {
    const P = Math.max(0.5, Number(potSize) || 6.5);
    const S = Math.max(1, Number(effectiveStack) || 97);
    const spr = S / P;
    const n = streetMode === '3e' ? 3 : 2;

    const targetFinalPot = P + 2 * S;
    const g = (Math.pow(targetFinalPot / P, 1 / n) - 1) / 2;
    const gPct = g * 100;
    const mdfPerStreetPct = (1 / (1 + g)) * 100;
    const alphaBluffFreqPct = (g / (1 + g)) * 100;

    const streetNames =
      streetMode === '3e'
        ? ['Flop (1st Barrel)', 'Turn (2nd Barrel)', 'River (All-In Barrel)']
        : streetMode === 'check_2e'
        ? ['Flop Check (0% Bet)', 'Turn (1st Geometric Barrel)', 'River (All-In Geometric Barrel)']
        : ['Turn (1st Geometric Barrel)', 'River (All-In Geometric Barrel)'];

    const rows = [];
    let curPot = P;
    let curStack = S;

    streetNames.forEach((name, idx) => {
      if (streetMode === 'check_2e' && idx === 0) {
        rows.push({
          street: name,
          potBefore: curPot.toFixed(1),
          betPct: '0.0%',
          betAmt: '0.0',
          potAfterCall: curPot.toFixed(1),
          remainingStack: curStack.toFixed(1),
        });
        return;
      }
      const isLast = idx === streetNames.length - 1;
      const rawBet = isLast ? curStack : curPot * g;
      const betAmt = Math.min(curStack, rawBet);
      const nextPot = curPot + 2 * betAmt;
      const nextStack = Math.max(0, curStack - betAmt);
      rows.push({
        street: name,
        potBefore: curPot.toFixed(1),
        betPct: `${gPct.toFixed(1)}%`,
        betAmt: betAmt.toFixed(1),
        potAfterCall: nextPot.toFixed(1),
        remainingStack: nextStack.toFixed(1),
      });
      curPot = nextPot;
      curStack = nextStack;
    });

    // Comparison against standard 33% Flop / 75% Turn / River Jam
    const stdFlopBet = Math.min(S, P * 0.33);
    const potTurn = P + 2 * stdFlopBet;
    const remTurn = Math.max(0, S - stdFlopBet);
    const stdTurnBet = Math.min(remTurn, potTurn * 0.75);
    const potRiver = potTurn + 2 * stdTurnBet;
    const remRiver = Math.max(0, remTurn - stdTurnBet);
    const stdRiverPct = potRiver > 0 ? (remRiver / potRiver) * 100 : 0;

    return {
      P,
      S,
      n,
      spr: spr.toFixed(2),
      gPct: gPct.toFixed(1),
      mdfPerStreetPct: mdfPerStreetPct.toFixed(1),
      alphaBluffFreqPct: alphaBluffFreqPct.toFixed(1),
      rows,
      stdFlopBet: stdFlopBet.toFixed(1),
      stdTurnBet: stdTurnBet.toFixed(1),
      stdRiverBet: remRiver.toFixed(1),
      stdRiverPct: stdRiverPct.toFixed(0),
    };
  }, [potSize, effectiveStack, streetMode]);

  const canonicalPath = '/tools/geometric-bet-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Exact 2-Street (2e) And 3-Street (3e) GTO Geometric Bet Sizing Percentages, Street-By-Street Pot Growth, And Overbet Commitment Plans.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'GTO Geometric Bet Sizing Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'GTO Geometric Bet Sizing & Overbet Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['GTO Geometric Bet Sizing Calculator', canonicalPath],
      ],
      faqs: GEOMETRIC_FAQS,
      howTo: {
        name: 'How To Calculate 2-Street And 3-Street Geometric Bet Sizing',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Current Pot Size And Remaining Effective Stack',
            text: 'Input The Starting Pot Size And Effective Stack In Big Blinds Or Dollars.',
          },
          {
            name: 'Choose 2-Street (2e) Or 3-Street (3e) Geometric Commitment',
            text: 'Select Whether You Want To Put The Remaining Stack All-In Across Two Streets Or Three Streets.',
          },
          {
            name: 'Review Exact Geometric Percentage And Street-By-Street Bet Plan',
            text: 'Apply The Constant Pot Percentage G, Required Villain MDF, And Balanced Bluff Frequency On Each Street.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Pot ${metrics.P}BB, Stack ${metrics.S}BB (SPR ${metrics.spr}): ${metrics.n}-Street Geometric Sizing = ${metrics.gPct}% Of Pot Per Street | Villain MDF Per Street = ${metrics.mdfPerStreetPct}% | Balanced Bluff Ratio = ${metrics.alphaBluffFreqPct}%`;

  return (
    <div style={{ minHeight: '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="GTO Geometric Bet Sizing Calculator"
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
            <span>GTO Geometric Bet Sizing Calculator</span>
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
          GTO Geometric Bet-Sizing &amp; Overbet Planner (2e / 3e)
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
          <strong>Direct Answer:</strong> The Exact Geometric Pot Fraction <strong>G = (((2S + P) / P)<sup>1/N</sup> - 1) / 2</strong> Computes The Constant Percentage Of The Pot You Must Bet Across <strong>N Streets</strong> So Your Final Chip Goes All-In On The River Without An Awkward Over-Shove Or Under-Bet.
        </p>

        <CalculatorShareAndPresets
          toolTitle="GTO Geometric Bet Sizing Calculator"
          toolPath={canonicalPath}
          summaryText={summaryText}
          presets={GEOMETRIC_PRESETS}
          onSelectPreset={handleSelectPreset}
          activePresetId={activePresetId}
        />

        <section
          aria-label="Interactive GTO Geometric Bet Sizing Solver"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#25c8ff', margin: '0 0 16px 0' }}>
            Enter Current Pot, Remaining Effective Stack &amp; Street Plan
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Current Pot Size (BB Or $)
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={potSize}
                  onChange={(e) => setPotSize(e.target.value)}
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
                Effective Remaining Stack (BB Or $)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={effectiveStack}
                  onChange={(e) => setEffectiveStack(e.target.value)}
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
                Streets Remaining To Get All-In
                <select
                  value={streetMode}
                  onChange={(e) => setStreetMode(e.target.value)}
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
                >
                  <option value="3e">3 Streets: Flop-Turn-River (3e)</option>
                  <option value="2e">2 Streets: Turn-River (2e)</option>
                  <option value="check_2e">Flop Check -&gt; Turn/River 2e Overbet</option>
                </select>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Constant Geometric Sizing (G)
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.gPct}% Of Pot
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Bet {metrics.gPct}% Across {metrics.n} Streets (SPR = {metrics.spr})
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Villain MDF Per Street
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.mdfPerStreetPct}% MDF
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Balanced Bluff Frequency (Alpha): {metrics.alphaBluffFreqPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #38bdf8' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Vs Standard 33% / 75% / Jam Line
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                River Jam = {metrics.stdRiverPct}% Pot
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                33% ({metrics.stdFlopBet}) -&gt; 75% ({metrics.stdTurnBet}) -&gt; Jam ({metrics.stdRiverBet})
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Street-By-Street Geometric Pot Growth And Remaining Stack Progression
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Betting Street</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot Before Bet</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Geometric %</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Exact Bet Size</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Pot After Call</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Remaining Stack</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rows.map((r) => (
                  <tr key={r.street} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{r.street}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{r.potBefore}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{r.betPct}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 800 }}>{r.betAmt}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{r.potAfterCall}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{r.remainingStack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div style={{ marginBottom: 32 }}>
          <SmarterAccountUnlockGate
            variant="calculator-pro"
            context="tools-geometric-bet-calculator"
            redirectPath={canonicalPath}
          />
        </div>

        <SmarterConversionCta
          compact
          eyebrow="Free Smarter.Poker Account"
          title="Save Geometric Bet Trees & Drill Turn & River GTO Free"
          description="Bookmark 2e And 3e Overbet Sizing Plans And Practice Multi-Street Sizing In 107 Free GTO Games."
          primaryLabel="Create Free Account"
          primaryHref="/auth/signup?redirect=/tools/geometric-bet-calculator&src=geo-bet"
          secondaryLabel="Sign In"
          secondaryHref="/auth/login?redirect=/tools/geometric-bet-calculator"
        />

        <FaqSection faqs={GEOMETRIC_FAQS} />

        <CitationBacklinkBox
          title="GTO Geometric Bet Sizing Calculator"
          canonicalUrl={canonicalUrl}
          badgeType="gto"
          badgeLabel="Geometric 2e/3e Engine"
          badgeValue="Multi-Street Overbet Planner"
          summary="Calculates Exact 2-Street And 3-Street Geometric Bet Sizing Percentages And Street-By-Street Pot Progression."
          slug="geometric-bet-calculator"
        />

        <AiPromptLauncher
          title="GTO Geometric Bet Sizing Calculator"
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
    const md = renderHubToolMarkdown('/tools/geometric-bet-calculator', query);
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
