/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HOME GAME TOURNAMENT DIRECTOR BLIND CLOCK, REBUY & PAYOUT CONSOLE
 *  (pages/tools/home-game-director.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Live Home Game Tournament Director Blind Clock, Rebuy/Add-On Prize Pool
 * Counter, Table Average M-Ratio Monitor, and Payout Splitter Console.
 *
 * House style: Title Case, zero em dashes, #SmarterCasinoRealism theme.
 */

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import HubPageSummary from '../../src/components/seo/HubPageSummary';
import AiPromptLauncher from '../../src/components/seo/AiPromptLauncher';
import CitationBacklinkBox from '../../src/components/seo/CitationBacklinkBox';
import FaqSection from '../../src/components/seo/FaqSection';
import CalculatorShareAndPresets from '../../src/components/tools/CalculatorShareAndPresets';
import { hubProductSchema } from '../../src/lib/seo/hubPageSchema';
import { useSolvedSpotUrlSync } from '../../src/lib/seo/solvedSpotEngine';
import { setPublicSeoHtmlCache } from '../../src/lib/seo/edgeCacheHeaders.mjs';

const BLIND_LEVELS = [
  { level: 1, sb: 100, bb: 200, ante: 200 },
  { level: 2, sb: 200, bb: 400, ante: 400 },
  { level: 3, sb: 300, bb: 600, ante: 600 },
  { level: 4, sb: 400, bb: 800, ante: 800 },
  { level: 5, sb: 500, bb: 1000, ante: 1000 },
  { level: 6, sb: 600, bb: 1200, ante: 1200 },
  { level: 7, sb: 800, bb: 1600, ante: 1600 },
  { level: 8, sb: 1000, bb: 2000, ante: 2000 },
  { level: 9, sb: 1500, bb: 3000, ante: 3000 },
  { level: 10, sb: 2000, bb: 4000, ante: 4000 },
  { level: 11, sb: 3000, bb: 6000, ante: 6000 },
  { level: 12, sb: 5000, bb: 10000, ante: 10000 },
];

const DIRECTOR_PRESETS = [
  {
    id: 'single_table_9p_50',
    label: '9-Player Friday Night Home MTT ($50 Buy-In + 3 Rebuys + 4 Add-Ons)',
    players: 9,
    buyin: 50,
    rebuys: 3,
    addons: 4,
    stack: 20000,
    levelMins: 20,
  },
  {
    id: 'two_table_18p_100',
    label: '18-Player 2-Table Championship ($100 Buy-In + 6 Rebuys + 8 Add-Ons)',
    players: 18,
    buyin: 100,
    rebuys: 6,
    addons: 8,
    stack: 30000,
    levelMins: 20,
  },
  {
    id: 'turbo_6max_shootout',
    label: '6-Max Turbo Shootout ($40 Buy-In / 15-Minute Levels / Freezeout)',
    players: 6,
    buyin: 40,
    rebuys: 0,
    addons: 0,
    stack: 15000,
    levelMins: 15,
  },
  {
    id: 'deepstack_league_24p',
    label: '24-Player Monthly League Major ($150 Buy-In / 40,000 Starting Stack)',
    players: 24,
    buyin: 150,
    rebuys: 8,
    addons: 10,
    stack: 40000,
    levelMins: 25,
  },
];

const DIRECTOR_FAQS = [
  {
    question: 'How Do You Pace A Home Game Tournament So It Finishes In Exactly 4 Hours?',
    answer:
      'A No-Limit Holdem Tournament Almost Always Concludes When The Total Chips In Play Equal 20 To 25 Big Blinds. With 10 Players Starting With 20,000 Chips (200,000 Total Chips), The Tournament Will End Around The 4,000/8,000 Or 5,000/10,000 Blind Level (Level 11 Or 12, Which Reaches Completion At 3.5 To 4 Hours Using 20-Minute Levels).',
  },
  {
    question: 'How Should A Home Game Split The Prize Pool For 8 To 12 Players?',
    answer:
      'For A Single-Table 8 To 10 Player Home Game, The Standard TDA Payout Split Pays The Top 3 Finishers At 50% For 1st Place, 30% For 2nd Place, And 20% For 3rd Place. For 15 To 20 Players Across Two Tables, Pay The Top 4 Finishers At 45% / 27% / 16% / 12%.',
  },
  {
    question: 'Why Should Home Game Directors Use Big Blind Antes (BBA) Instead Of Individual Antes?',
    answer:
      'With A Big Blind Ante, Only The Player In The Big Blind Posts A Single Ante Chip Equal To The Big Blind Size For The Entire Table. That Eliminates Small-Denomination Change-Making And Speeds Up Home-Dealt Hands By 25% To 30%.',
  },
];

export default function HomeGameDirectorPage({
  initialPlayers = 9,
  initialBuyin = 50,
  initialRebuys = 3,
  initialAddons = 4,
  initialStack = 20000,
  initialLevelMins = 20,
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialPlayers);
  const [buyin, setBuyin] = useState(initialBuyin);
  const [rebuys, setRebuys] = useState(initialRebuys);
  const [addons, setAddons] = useState(initialAddons);
  const [stack, setStack] = useState(initialStack);
  const [levelMins, setLevelMins] = useState(initialLevelMins);
  const [currentLevelIdx, setCurrentLevelIdx] = useState(2);
  const [playersRemaining, setPlayersRemaining] = useState(7);
  const [clockSecLeft, setClockSecLeft] = useState(initialLevelMins * 60);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [activePresetId, setActivePresetId] = useState('single_table_9p_50');

  useSolvedSpotUrlSync(
    { players, buyin, rebuys, addons, stack, levelMins },
    {
      players: (v) => setPlayers(Math.max(2, Math.min(200, Math.round(Number(v) || 9)))),
      buyin: (v) => setBuyin(Math.max(5, Number(v) || 50)),
      rebuys: (v) => setRebuys(Math.max(0, Math.round(Number(v) || 3))),
      addons: (v) => setAddons(Math.max(0, Math.round(Number(v) || 4))),
      stack: (v) => setStack(Math.max(1000, Math.round(Number(v) || 20000))),
      levelMins: (v) => setLevelMins(Math.max(5, Math.min(90, Math.round(Number(v) || 20)))),
    }
  );

  useEffect(() => {
    if (!isClockRunning) return undefined;
    const t = setInterval(() => {
      setClockSecLeft((prev) => {
        if (prev <= 1) {
          setCurrentLevelIdx((idx) => Math.min(BLIND_LEVELS.length - 1, idx + 1));
          return Math.max(5, Number(levelMins) || 20) * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isClockRunning, levelMins]);

  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setPlayers(preset.players);
    setBuyin(preset.buyin);
    setRebuys(preset.rebuys);
    setAddons(preset.addons);
    setStack(preset.stack);
    setLevelMins(preset.levelMins);
    setPlayersRemaining(Math.max(2, preset.players - 2));
    setClockSecLeft(preset.levelMins * 60);
    setIsClockRunning(false);
  };

  const metrics = useMemo(() => {
    const safePlayers = Math.max(2, Math.min(200, Math.round(Number(players) || 9)));
    const safeBuyin = Math.max(5, Number(buyin) || 50);
    const safeRebuys = Math.max(0, Math.round(Number(rebuys) ?? 3));
    const safeAddons = Math.max(0, Math.round(Number(addons) ?? 4));
    const safeStack = Math.max(1000, Math.round(Number(stack) || 20000));
    const safeLevelMins = Math.max(5, Math.min(90, Math.round(Number(levelMins) || 20)));
    const safeRem = Math.max(1, Math.min(safePlayers, Math.round(Number(playersRemaining) || safePlayers)));

    const totalEntriesUnits = safePlayers + safeRebuys + safeAddons;
    const totalPrizePool = totalEntriesUnits * safeBuyin;
    const totalChipsInPlay = totalEntriesUnits * safeStack;
    const avgStackChips = Math.round(totalChipsInPlay / safeRem);

    const activeBlind = BLIND_LEVELS[currentLevelIdx] || BLIND_LEVELS[2];
    const nextBlind = BLIND_LEVELS[Math.min(BLIND_LEVELS.length - 1, currentLevelIdx + 1)];
    const avgStackBb = (avgStackChips / activeBlind.bb).toFixed(1);
    const orbitCost = activeBlind.sb + activeBlind.bb + activeBlind.ante;
    const avgMRatio = (avgStackChips / orbitCost).toFixed(1);

    const payouts =
      safePlayers >= 15
        ? [
            { place: '1st Place (45%)', amount: Math.round(totalPrizePool * 0.45) },
            { place: '2nd Place (27%)', amount: Math.round(totalPrizePool * 0.27) },
            { place: '3rd Place (16%)', amount: Math.round(totalPrizePool * 0.16) },
            { place: '4th Place (12%)', amount: Math.round(totalPrizePool * 0.12) },
          ]
        : [
            { place: '1st Place (50%)', amount: Math.round(totalPrizePool * 0.5) },
            { place: '2nd Place (30%)', amount: Math.round(totalPrizePool * 0.3) },
            { place: '3rd Place (20%)', amount: Math.round(totalPrizePool * 0.2) },
          ];

    const mm = String(Math.floor(clockSecLeft / 60)).padStart(2, '0');
    const ss = String(clockSecLeft % 60).padStart(2, '0');

    return {
      safePlayers,
      safeBuyin,
      safeRebuys,
      safeAddons,
      safeStack,
      safeLevelMins,
      safeRem,
      totalPrizePool: Math.round(totalPrizePool),
      totalChipsInPlay,
      avgStackChips,
      avgStackBb,
      avgMRatio,
      activeBlind,
      nextBlind,
      payouts,
      clockFormatted: `${mm}:${ss}`,
    };
  }, [players, buyin, rebuys, addons, stack, levelMins, playersRemaining, currentLevelIdx, clockSecLeft]);

  const canonicalPath = '/tools/home-game-director';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Home Game Tournament Director';
  const pageDesc =
    'Run Your Live Home Game Poker Tournament With A Full-Screen Blind Clock, Rebuy And Add-On Prize Pool Counter, Table Average M-Ratio Monitor, And Payout Splitter.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Home Game Tournament Director Blind Clock & Payout Console',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Home Game Tournament Director', canonicalPath],
      ],
      faqs: DIRECTOR_FAQS,
      howTo: {
        name: 'How To Run A Home Game Poker Tournament With The Live Director Console',
        description: pageDesc,
        steps: [
          {
            name: 'Enter Players, Buy-In Amount, Starting Stack, And Level Duration',
            text: 'Configure Initial Entrants, Starting Chip Stack, And Blind Level Minutes.',
          },
          {
            name: 'Start The Live Blind Timer And Log Rebuys, Add-Ons, And Bustouts',
            text: 'Increment Rebuys And Add-Ons During Late Registration And Track Remaining Players.',
          },
          {
            name: 'Display Live Average Stack In Big Blinds, M-Ratio, And Payout Splits',
            text: 'Broadcast Current And Next Blinds Along With 1st-Through-4th Place Prize Pool Payouts.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const summaryText = `Home Game Tournament Director (${metrics.safePlayers} Players + ${metrics.safeRebuys} Rebuys + ${metrics.safeAddons} Add-Ons @ $${metrics.safeBuyin}): Prize Pool = $${metrics.totalPrizePool.toLocaleString('en-US')} | Level ${metrics.activeBlind.level} (${metrics.activeBlind.sb}/${metrics.activeBlind.bb}/${metrics.activeBlind.ante}) | Avg Stack = ${metrics.avgStackChips.toLocaleString('en-US')} (${metrics.avgStackBb} BB / M=${metrics.avgMRatio})`;
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
            <span>Home Game Tournament Director</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Live Home Game Tournament Director Blind Clock, Rebuy &amp; Payout Console
        </h1>

        {!isEmbed && (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 24px 0' }}>
              <strong>Direct Answer:</strong> Cast This <strong>Home Game Tournament Director Console</strong> To Any TV Or Tablet To Run A TDA-Compliant <strong>Big Blind Ante Level Clock</strong> While Tracking Live <strong>Rebuys, Add-Ons, Average M-Ratio, And Automatic Top-3 / Top-4 Payout Splits</strong>.
            </p>

            <CalculatorShareAndPresets
              toolTitle="Home Game Tournament Director"
              toolPath={canonicalPath}
              summaryText={summaryText}
              presets={DIRECTOR_PRESETS}
              onSelectPreset={handleSelectPreset}
              activePresetId={activePresetId}
            />
          </>
        )}

        <section
          aria-label="Interactive Home Game Tournament Director Console"
          style={{
            background: '#101a20',
            border: '1px solid #1e293b',
            borderRadius: '2px',
            padding: 24,
            marginBottom: 36,
          }}
        >
          {/* High-Visibility TV Blind Clock */}
          <div
            style={{
              background: '#020608',
              border: '2px solid #25c8ff',
              borderRadius: '2px',
              padding: '22px 18px',
              textAlign: 'center',
              marginBottom: 22,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: '#25c8ff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Level {metrics.activeBlind.level} ({metrics.safeLevelMins}-Min Levels) • {metrics.safeRem} Of {metrics.safePlayers} Players Remaining
            </div>
            <div style={{ fontSize: 64, fontWeight: 900, color: '#f8fafc', lineHeight: 1.05, margin: '8px 0' }}>
              {metrics.clockFormatted}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginBottom: 6 }}>
              Blinds: {metrics.activeBlind.sb.toLocaleString('en-US')} / {metrics.activeBlind.bb.toLocaleString('en-US')} (BBA {metrics.activeBlind.ante.toLocaleString('en-US')})
            </div>
            <div style={{ fontSize: 13.5, color: '#94a3b8', marginBottom: 16 }}>
              Next Level {metrics.nextBlind.level}: {metrics.nextBlind.sb.toLocaleString('en-US')} / {metrics.nextBlind.bb.toLocaleString('en-US')} (BBA {metrics.nextBlind.ante.toLocaleString('en-US')})
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => setIsClockRunning((r) => !r)}
                style={{
                  padding: '10px 20px',
                  background: isClockRunning ? '#f2b84b' : '#34d399',
                  color: '#020608',
                  border: 0,
                  borderRadius: '2px',
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {isClockRunning ? 'Pause Level Clock' : 'Start Level Clock'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentLevelIdx((i) => Math.max(0, i - 1));
                  setClockSecLeft(metrics.safeLevelMins * 60);
                }}
                style={{
                  padding: '10px 16px',
                  background: '#101a20',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '2px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Prev Level
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentLevelIdx((i) => Math.min(BLIND_LEVELS.length - 1, i + 1));
                  setClockSecLeft(metrics.safeLevelMins * 60);
                }}
                style={{
                  padding: '10px 16px',
                  background: '#101a20',
                  color: '#25c8ff',
                  border: '1px solid #25c8ff',
                  borderRadius: '2px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Next Level
              </button>
              <button
                type="button"
                onClick={() => setPlayersRemaining((p) => Math.max(1, p - 1))}
                style={{
                  padding: '10px 16px',
                  background: '#101a20',
                  color: '#f87171',
                  border: '1px solid #f87171',
                  borderRadius: '2px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Player Eliminated (-1)
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Initial Players Seated', val: players, set: setPlayers, step: 1, color: '#25c8ff' },
              { label: 'Buy-In / Rebuy Amount ($)', val: buyin, set: setBuyin, step: 5, color: '#34d399' },
              { label: 'Total Rebuys Logged', val: rebuys, set: setRebuys, step: 1, color: '#f2b84b' },
              { label: 'Total Add-Ons Logged', val: addons, set: setAddons, step: 1, color: '#f2b84b' },
              { label: 'Starting Chip Stack', val: stack, set: setStack, step: 5000, color: '#f8fafc' },
              { label: 'Blind Level Duration (Mins)', val: levelMins, set: setLevelMins, step: 5, color: '#25c8ff' },
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Live Total Prize Pool
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.totalPrizePool.toLocaleString('en-US')}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.safePlayers} Entries + {metrics.safeRebuys} Rebuys + {metrics.safeAddons} Add-Ons
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Average Stack &amp; M-Ratio
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.avgStackBb} BB (M = {metrics.avgMRatio})
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.avgStackChips.toLocaleString('en-US')} Avg Chips ({metrics.totalChipsInPlay.toLocaleString('en-US')} Total)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Live Payout Ladder Split
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f2b84b', marginTop: 6, lineHeight: 1.55 }}>
                {metrics.payouts.map((p) => (
                  <div key={p.place}>
                    {p.place}: <strong>${p.amount.toLocaleString('en-US')}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Home Game &amp; Tournament Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/home-game-kit" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Home Game Chip Set Kit
            </Link>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Blind Schedule Generator
            </Link>
            <Link href="/tools/shot-clock" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              30s Action Shot Clock
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#34d399', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Explore All 52 Free Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={DIRECTOR_FAQS} />

            <HubPageSummary page="poker-tools" path={canonicalPath} />

            <CitationBacklinkBox
              title="Home Game Tournament Director"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Tournament Director Console"
              badgeValue="Live Blind Clock & Payout Splitter"
              summary="Live Home Game Tournament Director Blind Clock, Rebuy And Add-On Prize Pool Counter, And Payout Splitter Console."
              slug="home-game-director"
            />

            <AiPromptLauncher
              title="Home Game Tournament Director"
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
    const md = renderHubToolMarkdown('/tools/home-game-director', query);
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
      initialPlayers: Number(query?.players) || 9,
      initialBuyin: Number(query?.buyin) || 50,
      initialRebuys: query?.rebuys !== undefined ? Number(query.rebuys) : 3,
      initialAddons: query?.addons !== undefined ? Number(query.addons) : 4,
      initialStack: Number(query?.stack) || 20000,
      initialLevelMins: Number(query?.levelMins) || 20,
    },
  };
}
