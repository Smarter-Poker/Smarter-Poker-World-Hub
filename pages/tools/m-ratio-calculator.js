/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENT M-RATIO, EFFECTIVE M & Q-RATIO SURVIVAL CALCULATOR (/tools/m-ratio-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Cost Per Orbit, Dan Harrington's M-Ratio, Short-Handed Effective M,
 * Q-Ratio (Stack / Average Stack), Harrington Zone Classification, and Estimated
 * Orbits & Minutes Before Blinding Out.
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
import { renderMRatioCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const M_RATIO_BENCHMARK_TABLE = [
  {
    zone: 'Green Zone (M > 20)',
    approxBb: '50+ Big Blinds (With BBA)',
    orbitWindow: '20+ Full Orbits Remaining',
    tacticalPosture: 'Full Postflop Flexibility: Play Suited Connectors, Set-Mine, And Multi-Street Bluff',
  },
  {
    zone: 'Yellow Zone (M 10 To 20)',
    approxBb: '25 To 50 Big Blinds',
    orbitWindow: '10 To 20 Orbits Remaining',
    tacticalPosture: 'Aggressive Steal & 3-Bet Re-Steal Phase: Avoid Passive Speculative Calls Out Of Position',
  },
  {
    zone: 'Orange Zone (M 6 To 10)',
    approxBb: '15 To 25 Big Blinds',
    orbitWindow: '6 To 10 Orbits Remaining',
    tacticalPosture: 'First-In Fold Equity Focus: Prioritize 3-Bet Shoves Over Flatting Raises',
  },
  {
    zone: 'Red Zone (M 1 To 5)',
    approxBb: '2.5 To 12.5 Big Blinds',
    orbitWindow: '1 To 5 Orbits Remaining',
    tacticalPosture: 'Strict Push-Or-Fold Mode: Open-Shove Before The Big Blind And Ante Consume Your Stack',
  },
  {
    zone: 'Dead Zone (M < 1)',
    approxBb: 'Under 2.5 Big Blinds',
    orbitWindow: 'Less Than 1 Orbit Left',
    tacticalPosture: 'Zero Fold Equity: Commit With Any Two Live High Cards In First-In Spots',
  },
];

const M_RATIO_FAQS = [
  {
    question: 'How Do You Calculate Dan Harrington M-Ratio In A Poker Tournament?',
    answer:
      'M-Ratio Equals Your Current Chip Stack Divided By The Total Cost Of One Full Orbit (Small Blind + Big Blind + Total Antes Paid Per Orbit). In Modern Big Blind Ante (BBA) Events, You Pay The Big Blind Ante Once Per Orbit, So Orbit Cost Equals Small Blind + Big Blind + Big Blind Ante.',
  },
  {
    question: 'Why Must You Adjust M-Ratio To Effective M When Playing Short-Handed?',
    answer:
      'When A Table Breaks From 9 Or 10 Players Down To 5 Or 6 Players, The Blinds And Big Blind Ante Hit Your Seat Nearly Twice As Fast. Effective M Multiplies Your Raw M-Ratio By (Players At Table / 10) To Reflect Your True Survival Runway.',
  },
  {
    question: 'What Is The Q-Ratio In Tournament Poker?',
    answer:
      'Q-Ratio Divides Your Current Stack By The Tournament Average Stack (Q = Stack / Average Stack). Combining Effective M With Q-Ratio Shows Whether You Are Short Relative To The Blinds, Short Relative To Your Opponents, Or Both.',
  },
];

export default function MRatioCalculatorPage({
  initialStack = 24000,
  initialSb = 400,
  initialBb = 800,
  initialAnte = 800,
  initialPlayers = 9,
  initialAvgStack = 35000,
  initialLevelMins = 30,
  initialHandsPerHour = 28,
}) {
  const router = useRouter();
  const [stack, setStack] = useState(initialStack);
  const [sb, setSb] = useState(initialSb);
  const [bb, setBb] = useState(initialBb);
  const [ante, setAnte] = useState(initialAnte);
  const [players, setPlayers] = useState(initialPlayers);
  const [avgStack, setAvgStack] = useState(initialAvgStack);
  const [levelMins, setLevelMins] = useState(initialLevelMins);
  const [handsPerHour, setHandsPerHour] = useState(initialHandsPerHour);
  const [copiedLink, setCopiedLink] = useState(false);

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
    if (q.stack !== undefined) setStack(Math.max(100, Number(q.stack) || 24000));
    if (q.sb !== undefined) setSb(Math.max(1, Number(q.sb) || 400));
    if (q.bb !== undefined) setBb(Math.max(2, Number(q.bb) || 800));
    if (q.ante !== undefined) setAnte(Math.max(0, Number(q.ante) || 800));
    if (q.players !== undefined) setPlayers(Math.max(2, Math.min(10, Math.round(Number(q.players) || 9))));
    if (q.avg !== undefined) setAvgStack(Math.max(100, Number(q.avg) || 35000));
    if (q.level !== undefined) setLevelMins(Math.max(5, Math.min(120, Number(q.level) || 30)));
    if (q.hph !== undefined) setHandsPerHour(Math.max(10, Math.min(90, Number(q.hph) || 28)));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const safeStack = Math.max(1, Number(stack) || 24000);
    const safeSb = Math.max(1, Number(sb) || 400);
    const safeBb = Math.max(1, Number(bb) || 800);
    const safeAnte = Math.max(0, Number(ante) || 800);
    const safePlayers = Math.max(2, Math.min(10, Math.round(Number(players) || 9)));
    const safeAvg = Math.max(1, Number(avgStack) || 35000);
    const safeLevel = Math.max(5, Math.min(120, Number(levelMins) || 30));
    const safeHph = Math.max(10, Math.min(90, Number(handsPerHour) || 28));

    const orbitCost = safeSb + safeBb + safeAnte;
    const mRatio = orbitCost > 0 ? safeStack / orbitCost : 0;
    const effectiveM = mRatio * (safePlayers / 10);
    const qRatio = safeStack / safeAvg;
    const stackBb = safeStack / safeBb;

    const totalHandsBeforeBlindOut = mRatio * safePlayers;
    const minutesBeforeBlindOut = Math.round((totalHandsBeforeBlindOut / safeHph) * 60);
    const levelsBeforeBlindOut = (minutesBeforeBlindOut / safeLevel).toFixed(1);

    let zoneLabel = 'Green Zone M > 20';
    let zoneColor = '#34d399';
    let zoneStrategy =
      'Full Postflop Playability: Open Standard GTO Ranges, Defend Big Blind Widely, And Execute Multi-Street Plans.';

    if (effectiveM < 1) {
      zoneLabel = 'Dead Zone M < 1';
      zoneColor = '#ef4444';
      zoneStrategy =
        'Critical Emergency: Zero Fold Equity Remains. Commit Immediately With Any Two Live High Cards Before Paying The Next Big Blind.';
    } else if (effectiveM < 6) {
      zoneLabel = 'Red Zone M 1-5';
      zoneColor = '#f87171';
      zoneStrategy =
        'Strict Push-Or-Fold Mode: Open-Shove All Profitable Nash Hands Directly To Maximize First-In Fold Equity.';
    } else if (effectiveM <= 10) {
      zoneLabel = 'Orange Zone M 6-10';
      zoneColor = '#fb923c';
      zoneStrategy =
        'Re-Steal & Stop-And-Go Zone: Tighten Speculative Calls And Look For 15BB-22BB 3-Bet All-In Re-Steal Spots Over Late-Position Opens.';
    } else if (effectiveM <= 20) {
      zoneLabel = 'Yellow Zone M 10-20';
      zoneColor = '#f2b84b';
      zoneStrategy =
        'Active Steal Zone: Attack Medium Stacks On Bubbles, Fold Small Pairs To 3-Bets, And Preserve 3-Bet Jam Leverage.';
    }

    return {
      safeStack,
      safeSb,
      safeBb,
      safeAnte,
      safePlayers,
      safeAvg,
      safeLevel,
      safeHph,
      orbitCost,
      mRatio: mRatio.toFixed(2),
      effectiveM: effectiveM.toFixed(2),
      qRatio: qRatio.toFixed(2),
      stackBb: stackBb.toFixed(1),
      orbitsLeft: mRatio.toFixed(1),
      minutesBeforeBlindOut,
      levelsBeforeBlindOut,
      zoneLabel,
      zoneColor,
      zoneStrategy,
    };
  }, [stack, sb, bb, ante, players, avgStack, levelMins, handsPerHour]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/m-ratio-calculator?stack=${metrics.safeStack}&sb=${metrics.safeSb}&bb=${metrics.safeBb}&ante=${metrics.safeAnte}&players=${metrics.safePlayers}&avg=${metrics.safeAvg}&level=${metrics.safeLevel}&hph=${metrics.safeHph}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/m-ratio-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Tournament M-Ratio, Effective M & Q-Ratio Survival Calculator';
  const pageDesc =
    'Calculate Dan Harrington M-Ratio, Short-Handed Effective M, Q-Ratio, Cost Per Orbit, And Harrington Zone Survival Strategy For Live And Online Tournaments.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Tournament M-Ratio & Survival Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Tournament M-Ratio Calculator', canonicalPath],
      ],
      faqs: M_RATIO_FAQS,
      howTo: {
        name: 'How To Calculate Tournament M-Ratio, Effective M, And Q-Ratio',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Current Chip Stack, Blinds, And Big Blind Ante',
            text: 'Input Your Current Tournament Chip Count, Small Blind, Big Blind, And Big Blind Ante (Or Total Orbit Ante).',
          },
          {
            name: 'Specify Active Players At Your Table And Average Tournament Stack',
            text: 'Select Between 2 And 10 Players At Your Table And Enter The Overall Tournament Average Stack.',
          },
          {
            name: 'Review Effective M, Q-Ratio, And Harrington Zone Strategy',
            text: 'Check Your Harrington Zone Classification And Exact Minutes Remaining Before Blinding Out.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Tournament M-Ratio And Q-Ratio Calculator"
        description="Calculate Dan Harrington M-Ratio, Short-Handed Effective M, Q-Ratio, Cost Per Orbit, And Harrington Zone Survival Strategy For Live And Online Tournaments."
        canonical="/tools/m-ratio-calculator"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8' }}>
              <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
              {' / '}
              <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
              {' / '}
              <span>Tournament M-Ratio Calculator</span>
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
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Tournament M-Ratio, Effective M &amp; Q-Ratio Survival Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Dan Harrington <strong>M-Ratio</strong> Divides Your Chip Stack By The Cost Of One Full Orbit (<strong>Small Blind + Big Blind + Orbit Antes</strong>). Multiply M By <strong>(Players At Table / 10)</strong> To Compute <strong>Effective M</strong> For Short-Handed Tables, And Divide Your Stack By The Tournament Average To Track Your <strong>Q-Ratio</strong>.
          </p>
        )}

        <section
          aria-label="Interactive Tournament M-Ratio Calculator"
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
              Interactive Harrington M-Ratio, Effective M &amp; Q-Ratio Solver
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Hero Chip Stack', val: stack, set: setStack, step: 1000, color: '#34d399' },
              { label: 'Small Blind', val: sb, set: setSb, step: 100, color: '#f8fafc' },
              { label: 'Big Blind', val: bb, set: setBb, step: 100, color: '#f8fafc' },
              { label: 'Big Blind Ante (Orbit Ante)', val: ante, set: setAnte, step: 100, color: '#f2b84b' },
              { label: 'Average Stack At Table', val: avgStack, set: setAvgStack, step: 1000, color: '#25c8ff' },
              { label: 'Level Duration (Minutes)', val: levelMins, set: setLevelMins, step: 5, color: '#f8fafc' },
              { label: 'Hands Dealt Per Hour', val: handsPerHour, set: setHandsPerHour, step: 2, color: '#f8fafc' },
            ].map((input) => (
              <div key={input.label}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  {input.label}
                  <input
                    type="number"
                    min="0"
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

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Players At Table (2 To 10)
                <select
                  value={players}
                  onChange={(e) => setPlayers(Number(e.target.value))}
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
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} Players At Table
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Harrington M-Ratio &amp; Orbit Cost
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                M = {metrics.mRatio}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Cost Per Orbit: {metrics.orbitCost.toLocaleString('en-US')} Chips ({metrics.stackBb} BB)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: `1px solid ${metrics.zoneColor}` }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Short-Handed Effective M
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: metrics.zoneColor, marginTop: 4 }}>
                Eff M = {metrics.effectiveM}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.zoneLabel} ({metrics.safePlayers}-Handed Table)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Q-Ratio (Vs Average Stack)
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                Q = {metrics.qRatio}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {Number(metrics.qRatio) >= 1 ? 'Above Average Field Stack' : 'Below Average Field Stack'}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Survival Runway Before Blind-Out
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.orbitsLeft} Orbits ({metrics.minutesBeforeBlindOut} Mins)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Approx {metrics.levelsBeforeBlindOut} Blind Levels At Current Pace
              </div>
            </div>
          </div>

          <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: metrics.zoneColor, marginBottom: 4 }}>
              Recommended Harrington Zone Tactical Plan ({metrics.zoneLabel})
            </div>
            <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
              {metrics.zoneStrategy}
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Dan Harrington M-Ratio Zone Classification &amp; Strategy Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Harrington On Holdem M-Ratio Zones, Approximate Big Blind Equivalents, And Optimal Tournament Adjustments
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Harrington Zone</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Approx Big Blinds</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Survival Orbits</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended Tournament Strategy</th>
                </tr>
              </thead>
              <tbody>
                {M_RATIO_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.zone} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.zone}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.approxBb}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.orbitWindow}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.tacticalPosture}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Short-Stack &amp; Tournament Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Short-Stack Push/Fold Nash Chart
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Tournament ICM &amp; Bubble Solver
            </Link>
            <Link href="/tools/satellite-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Satellite Seat-Bubble Calculator
            </Link>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament Blind Structure Generator
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={M_RATIO_FAQS} />

            <CitationBacklinkBox
              title="Tournament M-Ratio And Q-Ratio Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Harrington M-Ratio Engine"
              badgeValue="Effective M & Q-Ratio Solver"
              summary="Interactive Tournament M-Ratio, Short-Handed Effective M, And Q-Ratio Calculator With Harrington Zone Strategy And Blind-Out Timer."
              slug="m-ratio-calculator"
            />

            <AiPromptLauncher
              title="Tournament M-Ratio And Q-Ratio Calculator"
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
    const md = renderMRatioCalculatorMarkdown({
      stack: query?.stack,
      sb: query?.sb,
      bb: query?.bb,
      ante: query?.ante,
      players: query?.players,
      avgStack: query?.avg,
    });
    if (md) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Vary', 'Accept');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      res.write(md);
      res.end();
      return { props: {} };
    }
  }
  return { props: {} };
}
