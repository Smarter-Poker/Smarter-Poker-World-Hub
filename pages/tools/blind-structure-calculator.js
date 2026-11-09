/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  POKER TOURNAMENT BLIND STRUCTURE & CHIP DISTRIBUTION GENERATOR
 *  (/tools/blind-structure-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive home game and club tournament blind schedule & chip count generator
 * at /tools/blind-structure-calculator (and raw Markdown at /tools/blind-structure-calculator.md).
 *
 * House style: Title Case, zero em dashes.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import SEOHead from '../../src/components/seo/SEOHead';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';

const TDA_CHIP_DISTRIBUTION = [
  { denom: '100 Chip', color: 'Black', qty20k: '10 Chips', value20k: '1,000', colorUp: 'End Of Level 6 (Before 500/1,000)' },
  { denom: '500 Chip', color: 'Purple', qty20k: '8 Chips', value20k: '4,000', colorUp: 'End Of Level 10 (Before 1,500/3,000)' },
  { denom: '1,000 Chip', color: 'Yellow / Gold', qty20k: '10 Chips', value20k: '10,000', colorUp: 'End Of Level 15 (Before 8,000/16,000)' },
  { denom: '5,000 Chip', color: 'Orange / Grey', qty20k: '1 Chip (+ Rebuy/Color-Up Reserve)', value20k: '5,000', colorUp: 'Remains In Play Until Final Hand' },
];

const BASE_BLIND_PROGRESSION = [
  { level: 1, sb: 100, bb: 100 },
  { level: 2, sb: 100, bb: 200 },
  { level: 3, sb: 200, bb: 300 },
  { level: 4, sb: 200, bb: 400 },
  { level: 5, sb: 300, bb: 600 },
  { level: 6, sb: 400, bb: 800, breakAfter: '10-Min Color-Up Break (Remove 100 Chips)' },
  { level: 7, sb: 500, bb: 1000 },
  { level: 8, sb: 600, bb: 1200 },
  { level: 9, sb: 800, bb: 1600 },
  { level: 10, sb: 1000, bb: 2000, breakAfter: '10-Min Color-Up Break (Remove 500 Chips)' },
  { level: 11, sb: 1500, bb: 3000 },
  { level: 12, sb: 2000, bb: 4000 },
  { level: 13, sb: 3000, bb: 6000 },
  { level: 14, sb: 4000, bb: 8000 },
  { level: 15, sb: 5000, bb: 10000, breakAfter: '10-Min Break' },
  { level: 16, sb: 8000, bb: 16000 },
  { level: 17, sb: 10000, bb: 20000 },
  { level: 18, sb: 15000, bb: 30000 },
];

const BLIND_STRUCTURE_CALCULATOR_FAQS = [
  {
    question: 'How Do You Calculate When A Poker Tournament Will End?',
    answer:
      'A No-Limit Hold\'em Tournament Almost Always Concludes When Total Chips In Play Equal Between 20 And 30 Big Blinds. Multiply Total Entries By The Starting Stack And Divide By 25 To Find The Approximate Final Big Blind Level.',
  },
  {
    question: 'How Many Poker Chips Should Each Player Start With In A Home Game?',
    answer:
      'Under Standard Tournament Directors Association (TDA) Guidelines, Each Player Should Receive 28 To 32 Physical Chips Across 3 To 4 Denominations (For Example: Ten 100s, Eight 500s, Ten 1,000s, And One 5,000 Chip For A 20,000 Starting Stack).',
  },
  {
    question: 'Should Home Poker Tournaments Use A Big Blind Ante?',
    answer:
      'Yes. Posting A Single Big Blind Ante Equal To The Big Blind Size Dramatically Speeds Up Dealing Pace By 15% To 20%, Eliminates Small-Chip Making-Change Delays, And Enforces Proper Short-Stack Action.',
  },
];

export default function BlindStructureCalculatorPage({
  initialPlayers = 18,
  initialHours = 4,
  initialStartingStack = 20000,
  initialLevelMinutes = 20,
  initialAnteFormat = 'bb-ante',
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [targetHours, setTargetHours] = useState(initialHours);
  const [startingStack, setStartingStack] = useState(initialStartingStack);
  const [levelMinutes, setLevelMinutes] = useState(initialLevelMinutes);
  const [anteFormat, setAnteFormat] = useState(initialAnteFormat);

  const metrics = useMemo(() => {
    const safePlayers = Math.max(2, Math.min(500, Math.round(Number(players) || 18)));
    const safeHours = Math.max(1, Math.min(14, Number(targetHours) || 4));
    const safeStack = Math.max(1000, Math.round(Number(startingStack) || 20000));
    const safeMins = Math.max(5, Math.min(60, Math.round(Number(levelMinutes) || 20)));
    const useBbAnte = anteFormat !== 'no-ante';

    const scaleFactor = safeStack / 20000;
    const totalChipsInPlay = safePlayers * safeStack;
    const estimatedEndBigBlind = Math.max(200, Math.round(totalChipsInPlay / 25));

    const schedule = BASE_BLIND_PROGRESSION.map((row) => {
      const sb = Math.max(25, Math.round((row.sb * scaleFactor) / 25) * 25);
      const bb = Math.max(50, Math.round((row.bb * scaleFactor) / 25) * 25);
      const ante = useBbAnte ? bb : 0;
      const orbitCost = sb + bb + ante;
      const startStackBbs = (safeStack / bb).toFixed(1);
      const totalBbsInPlay = (totalChipsInPlay / bb).toFixed(0);
      const elapsedMinutes = (row.level - 1) * safeMins;
      return {
        level: row.level,
        sb,
        bb,
        ante,
        orbitCost,
        startStackBbs,
        totalBbsInPlay,
        elapsedMinutes,
        breakAfter: row.breakAfter || null,
        isEstimatedFinishLevel: Number(totalBbsInPlay) <= 30 && Number(totalBbsInPlay) >= 15,
      };
    });

    const finishRow = schedule.find((r) => Number(r.totalBbsInPlay) <= 25) || schedule[schedule.length - 1];

    return {
      safePlayers,
      safeHours,
      safeStack,
      safeMins,
      useBbAnte,
      totalChipsInPlay,
      estimatedEndBigBlind,
      finishLevel: finishRow.level,
      estimatedDurationMinutes: finishRow.level * safeMins,
      schedule,
    };
  }, [players, targetHours, startingStack, levelMinutes, anteFormat]);

  const canonicalPath = '/tools/blind-structure-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Poker Tournament Blind Structure & Chip Calculator';
  const pageDesc =
    'Generate Balanced Poker Tournament Blind Structures, Big Blind Ante Schedules, TDA Chip Color Distributions, And Target Duration Clocks For Home Games And Clubs.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Tournament Blind Structure & Chip Generator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Tournament Clock & Blind Structure Generator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Blind Structure Calculator', canonicalPath],
      ],
      faqs: BLIND_STRUCTURE_CALCULATOR_FAQS,
      steps: [
        {
          name: 'Configure Entrants, Starting Stack, And Level Length',
          text: 'Select Expected Players, Starting Chip Stack, And Blind Level Duration In Minutes.',
        },
        {
          name: 'Choose Big Blind Ante Or Classic No-Ante Format',
          text: 'Toggle Big Blind Ante To Compute Exact Orbit Cost And Estimated Finish Level.',
        },
        {
          name: 'Review Blind Progression And TDA Chip Distribution',
          text: 'Use The Generated Level-By-Level Schedule And Starting Chip Breakdown To Run Your Home Game Or Club Tournament.',
        },
      ],
    });
  }, [pageDesc]);

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title={pageTitle}
        description={pageDesc}
        canonical={canonicalUrl}
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
          <Link href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Smarter.Poker</Link>
          {' / '}
          <Link href="/tools" style={{ color: '#38bdf8', textDecoration: 'none' }}>Poker Tools</Link>
          {' / '}
          <span>Blind Structure Calculator</span>
        </nav>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Poker Tournament Blind Structure &amp; Chip Distribution Generator
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
          <strong>Direct Answer:</strong> A No-Limit Hold&apos;Em Tournament Reaches Heads-Up Completion When <strong>Total Chips In Play Equal 20 To 30 Big Blinds</strong>. By Scaling Level Increases Between <strong>25% And 50% Per Level</strong> And Issuing <strong>29 Physical Chips Per Player</strong> Across Four Standard TDA Denominations, Tournament Directors Guarantee A Smooth Clock Without Abrupt Shove-Fest Jumps.
        </p>

        {/* Interactive Blind Generator Panel */}
        <section
          aria-label="Interactive Blind Structure Generator"
          style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: 24,
            marginBottom: 36,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', margin: '0 0 18px 0' }}>
            Interactive Tournament Clock &amp; Blind Schedule Builder
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Players / Entries
                <input
                  type="number"
                  min="2"
                  max="500"
                  value={players}
                  onChange={(e) => setPlayers(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Starting Chip Stack
                <select
                  value={startingStack}
                  onChange={(e) => setStartingStack(Number(e.target.value))}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value={10000}>10,000 Chips (100 BB)</option>
                  <option value={20000}>20,000 Chips (200 BB Deep)</option>
                  <option value={30000}>30,000 Chips (300 BB Championship)</option>
                  <option value={50000}>50,000 Chips (500 BB Monster)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Level Duration (Minutes)
                <select
                  value={levelMinutes}
                  onChange={(e) => setLevelMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value={10}>10 Minutes (Turbo)</option>
                  <option value={15}>15 Minutes (Fast Home Game)</option>
                  <option value={20}>20 Minutes (Standard Club)</option>
                  <option value={30}>30 Minutes (Deepstack Series)</option>
                  <option value={40}>40 Minutes (Championship)</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Ante Format
                <select
                  value={anteFormat}
                  onChange={(e) => setAnteFormat(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#070b14',
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  <option value="bb-ante">Big Blind Ante (1x BB)</option>
                  <option value="no-ante">No Ante (Blinds Only)</option>
                </select>
              </label>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Chips In Play
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                {metrics.totalChipsInPlay.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {metrics.safePlayers} Entries By {metrics.safeStack.toLocaleString('en-US')} Chips
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Projected Final Big Blind
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {metrics.estimatedEndBigBlind.toLocaleString('en-US')} BB
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                25 Big Blinds Total Remaining In Play
              </div>
            </div>

            <div style={{ background: '#070b14', padding: 16, borderRadius: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Estimated Finish Level
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
                Level {metrics.finishLevel} (~{(metrics.estimatedDurationMinutes / 60).toFixed(1)} Hrs)
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                At {metrics.safeMins} Minutes Per Blind Level
              </div>
            </div>
          </div>

          {/* Generated Blind Schedule Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#070b14', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Complete 18-Level Tournament Blind Progression With Orbit Costs And Total Big Blinds In Play
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Level</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Small Blind</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Big Blind</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>BB Ante</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Orbit Cost</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Start Stack (BBs)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Total BBs In Play</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Elapsed Clock</th>
                </tr>
              </thead>
              <tbody>
                {metrics.schedule.map((row) => (
                  <React.Fragment key={row.level}>
                    <tr
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: row.isEstimatedFinishLevel ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>
                        Level {row.level}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                        {row.sb.toLocaleString('en-US')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>
                        {row.bb.toLocaleString('en-US')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                        {row.ante.toLocaleString('en-US')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                        {row.orbitCost.toLocaleString('en-US')}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>
                        {row.startStackBbs} BB
                      </td>
                      <td style={{ padding: '10px 14px', color: '#f59e0b', fontWeight: 700 }}>
                        {row.totalBbsInPlay} BB
                      </td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                        {row.elapsedMinutes} Mins
                      </td>
                    </tr>
                    {row.breakAfter && (
                      <tr style={{ borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
                        <td colSpan={8} style={{ padding: '8px 14px', color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>
                          Scheduled Tournament Break: {row.breakAfter}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reference Table: Standard TDA Chip Colors & Starting Stack Breakdown */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Standard TDA Chip Color &amp; Starting Stack Distribution (20,000 Stack)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#0f172a', borderRadius: 10 }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Official Tournament Directors Association (TDA) Chip Denominations, Colors, And Color-Up Schedule
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#38bdf8', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Denomination</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Standard TDA Color</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chips Per Player</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Stack Value</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Color-Up Removal Timing</th>
                </tr>
              </thead>
              <tbody>
                {TDA_CHIP_DISTRIBUTION.map((chip) => (
                  <tr key={chip.denom} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{chip.denom}</td>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>{chip.color}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{chip.qty20k}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{chip.value20k}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{chip.colorUp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Link Navigation */}
        <section style={{ marginBottom: 32, padding: 20, background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Run Your Tournament On Smarter.Poker Or Explore Related Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/hub/commander/home-games" style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Host A Home Game On Smarter.Poker
            </Link>
            <Link href="/hub/commander/tournaments" style={{ padding: '8px 14px', background: '#1e293b', color: '#38bdf8', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Club Commander Tournament Software
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All Poker Calculators
            </Link>
            <Link href="/tools/icm-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Tournament ICM Calculator
            </Link>
            <Link href="/tools/push-fold-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Push/Fold Nash Charts
            </Link>
            <Link href="/tools/side-pot-calculator" style={{ padding: '8px 14px', background: '#1e293b', color: '#e2e8f0', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Side Pot Calculator
            </Link>
          </div>
        </section>

        <FaqSection faqs={BLIND_STRUCTURE_CALCULATOR_FAQS} />

        <CitationBacklinkBox
          title="Poker Tournament Blind Structure & Chip Distribution Generator"
          canonicalUrl={canonicalUrl}
          badgeType="commander"
          badgeLabel="Tournament Clock Engine"
          badgeValue="TDA Blind & Chip Generator"
          summary="Interactive Poker Tournament Blind Structure Generator With Big Blind Ante Progressions, Color-Up Levels, And Starting Stack Chip Breakdowns."
          slug="blind-structure-calculator"
        />

        <AiPromptLauncher
          title="Poker Tournament Blind Structure & Chip Distribution Generator"
          canonicalUrl={canonicalUrl}
          markdownUrl={`${canonicalUrl}.md`}
        />
      </main>
    </div>
  );
}

export async function getServerSideProps({ req, res, query }) {
  const acceptHeader = String(req?.headers?.accept || '');
  const isMarkdownRequested =
    acceptHeader.includes('text/markdown') ||
    query?.format === 'md' ||
    req?.url?.includes('format=md');

  if (isMarkdownRequested) {
    const { renderBlindStructureCalculatorMarkdown } = await import('../../src/lib/seo/markdownIngestion.mjs');
    const mdContent = renderBlindStructureCalculatorMarkdown({
      players: query?.players || 18,
      targetHours: query?.hours || 4,
      startingStack: query?.stack || 20000,
      levelMinutes: query?.mins || 20,
      anteFormat: query?.ante || 'bb-ante',
    });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Vary', 'Accept');
    res.write(mdContent);
    res.end();
    return { props: {} };
  }

  return {
    props: {
      initialPlayers: Number(query?.players) || 18,
      initialHours: Number(query?.hours) || 4,
      initialStartingStack: Number(query?.stack) || 20000,
      initialLevelMinutes: Number(query?.mins) || 20,
      initialAnteFormat: query?.ante === 'no-ante' ? 'no-ante' : 'bb-ante',
    },
  };
}
