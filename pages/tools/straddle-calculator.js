/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LIVE POKER STRADDLE, MISSISSIPPI BUTTON STRADDLE & BOMB POT EV CALCULATOR (/tools/straddle-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Computes Effective Blind Multiplier & Reduced Effective Stack (in Straddled BBs),
 * Breakeven Steal / Defend Frequency for Straddler, Total Bomb Pot Dead Money Pool
 * & SPR, and Minimum Equity Needed to Commit on Flop in Single-Board vs Double-Board
 * Bomb Pots (Quartering & Scoop Math).
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
import { renderStraddleCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const BASE_BLINDS = [
  { id: '1/3', label: '$1/$3 Base Blinds ($6 Straddle)', sb: 1, bb: 3, straddle: 6 },
  { id: '2/5', label: '$2/$5 Base Blinds ($10 Straddle)', sb: 2, bb: 5, straddle: 10 },
  { id: '5/10', label: '$5/$10 Base Blinds ($20 Straddle)', sb: 5, bb: 10, straddle: 20 },
];

const STRADDLE_TYPES = [
  { id: 'UTG_2X', label: 'UTG 2x Straddle' },
  { id: 'MISSISSIPPI_BTN', label: 'Mississippi Button 2x Straddle' },
  { id: 'SLEEPER', label: 'Sleeper Straddle' },
];

const BOMB_FORMATS = [
  { id: 'SINGLE_NLH', label: 'Single-Board NLH' },
  { id: 'DOUBLE_NLH', label: 'Double-Board NLH' },
  { id: 'DOUBLE_PLO4', label: 'Double-Board PLO4' },
  { id: 'DOUBLE_PLO5', label: 'Double-Board PLO5' },
];

const STRADDLE_BENCHMARK_TABLE = [
  {
    format: 'UTG 2x Straddle ($2/$5/$10 On $1,000 Stack)',
    effectiveStack: '100 Straddled BBs (Down From 200 BB)',
    preFlopPot: '$17 Dead Money ($2 SB + $5 BB + $10 UTG)',
    flopSpr: '5.5 To 6.5 SPR',
    tacticalAdjustment: 'Treat UTG Straddle As The New Big Blind; Tighten Speculative Calls',
  },
  {
    format: 'Mississippi Button 2x Straddle ($10 On BTN)',
    effectiveStack: '100 Straddled BBs',
    preFlopPot: '$17 Dead Money (SB Acts First Pre-Flop)',
    flopSpr: '5.0 To 6.0 SPR',
    tacticalAdjustment: 'Blinds Act First On All 4 Streets; Button Holds Ultimate Positional Leverage',
  },
  {
    format: 'Single-Board NLH Bomb Pot ($15 Ante x 8)',
    effectiveStack: '$985 Behind Over $120 Flop Pot',
    preFlopPot: '$120 Uncontested Dead Money',
    flopSpr: '8.21 SPR',
    tacticalAdjustment: 'Fast-Play Sets And Two Pair; Fold One-Pair Hands To Multiway Action',
  },
  {
    format: 'Double-Board PLO4/PLO5 Bomb Pot ($25 Ante x 8)',
    effectiveStack: '$975 Behind Over $200 Flop Pot',
    preFlopPot: '$200 Uncontested Dead Money',
    flopSpr: '4.88 SPR',
    tacticalAdjustment: 'Never Stack Off Drawing To Only One Board (Avoid Getting Quartered For 25% Equity)',
  },
];

const STRADDLE_FAQS = [
  {
    question: 'Is Posting A Live 2x UTG Straddle Mathematically +EV Or -EV?',
    answer:
      'In Isolation, Posting A Blind 2x UTG Straddle Is Mathematically Negative EV Because You Put In 2 Big Blinds With A Random 100% Hand Range. However, If The Entire Table Agrees To A Mandatory Straddle Orbit Or If Your Straddle Induces Loose Action And Halves Effective Stacks Against Deep-Stack Mistakes, You Can Recover The EV Through Postflop Skill.',
  },
  {
    question: 'How Does A Mississippi Button Straddle Change Pre-Flop Strategy?',
    answer:
      'In A Mississippi Button Straddle, Pre-Flop Action Starts With The Small Blind And Big Blind Acting First While The Button Acts Last Both Pre-Flop And Postflop. Because The Blinds Are Sandwiched Before The Entire Table, They Must Tighten Their Pre-Flop Continuing Ranges Dramatically.',
  },
  {
    question: 'What Is Quartering Risk In A Double-Board PLO Bomb Pot?',
    answer:
      'In A Double-Board Bomb Pot, Half The Pot Is Awarded To Each Board. If You Commit Your Entire Stack Holding The Nuts On Board A Only To Tie Another Player With The Same Nut Straight while Losing Board B Completely, You Win Only 25% Of The Total Pot (Getting Quartered) Despite Risking 50% Of The Money.',
  },
];

export default function StraddleCalculatorPage({
  initialBlinds = '2/5',
  initialStraddleType = 'MISSISSIPPI_BTN',
  initialStack = 1000,
  initialTableVpip = 38,
  initialBombAnte = 15,
  initialBombPlayers = 8,
  initialBombFormat = 'DOUBLE_PLO4',
}) {
  const router = useRouter();
  const [blinds, setBlinds] = useState(initialBlinds);
  const [straddleType, setStraddleType] = useState(initialStraddleType);
  const [stack, setStack] = useState(initialStack);
  const [tableVpip, setTableVpip] = useState(initialTableVpip);
  const [bombAnte, setBombAnte] = useState(initialBombAnte);
  const [bombPlayers, setBombPlayers] = useState(initialBombPlayers);
  const [bombFormat, setBombFormat] = useState(initialBombFormat);
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
    if (q.blinds && BASE_BLINDS.some((b) => b.id === q.blinds)) setBlinds(String(q.blinds));
    if (q.type && STRADDLE_TYPES.some((t) => t.id === q.type)) setStraddleType(String(q.type));
    if (q.stack !== undefined) setStack(Math.max(100, Number(q.stack) || 1000));
    if (q.vpip !== undefined) setTableVpip(Math.max(10, Math.min(85, Number(q.vpip) || 38)));
    if (q.ante !== undefined) setBombAnte(Math.max(5, Math.min(100, Number(q.ante) || 15)));
    if (q.players !== undefined) setBombPlayers(Math.max(6, Math.min(9, Math.round(Number(q.players) || 8))));
    if (q.format && BOMB_FORMATS.some((f) => f.id === q.format)) setBombFormat(String(q.format));
  }, [router.isReady, router.query]);

  const metrics = useMemo(() => {
    const blindObj = BASE_BLINDS.find((b) => b.id === blinds) || BASE_BLINDS[1];
    const safeStack = Math.max(50, Number(stack) || 1000);
    const safeVpip = Math.max(10, Math.min(85, Number(tableVpip) || 38));
    const safeAnte = Math.max(5, Math.min(100, Number(bombAnte) || 15));
    const safePlayers = Math.max(6, Math.min(9, Math.round(Number(bombPlayers) || 8)));

    const unstraddledBbs = safeStack / blindObj.bb;
    const straddledBbs = safeStack / blindObj.straddle;
    const deadStraddlePot = blindObj.sb + blindObj.bb + blindObj.straddle;

    // Breakeven steal/re-steal frequency when straddler raises to 3.5x straddle
    const raiseTotal = blindObj.straddle * 3.5;
    const additionalRisk = raiseTotal - blindObj.straddle;
    const potBeforeSteal = deadStraddlePot + (safeVpip / 100) * 2 * blindObj.straddle;
    const breakevenStealPct = (additionalRisk / (additionalRisk + potBeforeSteal)) * 100;

    // Bomb Pot calculations
    const bombPool = safeAnte * safePlayers;
    const remainingBombStack = Math.max(0, safeStack - safeAnte);
    const bombSpr = bombPool > 0 ? remainingBombStack / bombPool : 0;

    // Required all-in flop equity if facing a pot-sized bet or stack-off
    const commitCall = Math.min(remainingBombStack, bombPool);
    const minEquitySingleBoard = (commitCall / (bombPool + commitCall * 2)) * 100;
    const isDoubleBoard = bombFormat !== 'SINGLE_NLH';

    const scoopGuidance = isDoubleBoard
      ? 'Double-Board Split Rule: Winning 100% Of Board A + 0% Of Board B Yields Only 50% Total Equity (0% Net Profit Without Dead Money). Require At Least 35%+ Equity On The Second Board Before Stacking Off.'
      : 'Single-Board Winner-Take-All: High-Card Flushes And Top Sets Realize Full Pot Equity; Avoid Slowplaying Vulnerable Overpairs Multiway.';

    return {
      blindObj,
      safeStack,
      safeVpip,
      safeAnte,
      safePlayers,
      unstraddledBbs: unstraddledBbs.toFixed(1),
      straddledBbs: straddledBbs.toFixed(1),
      deadStraddlePot,
      breakevenStealPct: breakevenStealPct.toFixed(1),
      bombPool,
      remainingBombStack,
      bombSpr: bombSpr.toFixed(2),
      minEquitySingleBoard: minEquitySingleBoard.toFixed(1),
      isDoubleBoard,
      scoopGuidance,
    };
  }, [blinds, straddleType, stack, tableVpip, bombAnte, bombPlayers, bombFormat]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/straddle-calculator?blinds=${encodeURIComponent(blinds)}&type=${straddleType}&stack=${metrics.safeStack}&vpip=${metrics.safeVpip}&ante=${metrics.safeAnte}&players=${metrics.safePlayers}&format=${bombFormat}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/straddle-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Live Poker Straddle, Mississippi Button Straddle & Bomb Pot EV Calculator';
  const pageDesc =
    'Calculate Effective Stack Depth In Straddled Big Blinds, Straddler Steal Breakeven Frequency, Bomb Pot Dead Money SPR, And Double-Board Quartering Equity.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Straddle & Bomb Pot EV Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Straddle & Bomb Pot Calculator', canonicalPath],
      ],
      faqs: STRADDLE_FAQS,
      howTo: {
        name: 'How To Calculate Live Poker Straddle And Bomb Pot EV',
        description: pageDesc,
        steps: [
          {
            name: 'Select Base Blinds, Straddle Type, And Effective Dollar Stack',
            text: 'Choose Between $1/$3, $2/$5, Or $5/$10 Base Blinds And Select UTG, Mississippi Button, Or Sleeper Straddle.',
          },
          {
            name: 'Configure Bomb Pot Ante, Player Count, And Board Format',
            text: 'Enter Per-Player Bomb Pot Ante ($5 To $50), Active Players (6 To 9), And Single-Board Vs Double-Board Format.',
          },
          {
            name: 'Apply Reduced Straddled BBs, Flop SPR, And Scoop Equity Thresholds',
            text: 'Use The Computed Straddled Stack Depth, Steal Breakeven Percentage, And Bomb Pot Commitment Math.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Live Poker Straddle, Mississippi Button Straddle & Bomb Pot EV Calculator"
        description="Calculate Effective Stack Depth In Straddled Big Blinds, Straddler Steal Breakeven Frequency, Bomb Pot Dead Money SPR, And Double-Board Quartering Equity."
        canonical="/tools/straddle-calculator"
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
              <span>Straddle &amp; Bomb Pot Calculator</span>
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
          Live Poker Straddle, Mississippi Button Straddle &amp; Bomb Pot EV Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> A <strong>2x Live Straddle</strong> Cuts Effective Stack Depth In Half And Turns The Straddle Into The Effective Third Blind, While An 8-Handed <strong>Double-Board Bomb Pot</strong> Creates An Instant Low-SPR Flop Pot Where Committing On Only One Board Risks Getting <strong>Quartered For 25% Equity</strong>.
          </p>
        )}

        <section
          aria-label="Interactive Straddle And Bomb Pot EV Calculator"
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
              Interactive Straddle Compression &amp; Bomb Pot SPR Solver
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Base Blinds
                <select
                  value={blinds}
                  onChange={(e) => setBlinds(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {BASE_BLINDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Straddle Type
                <select
                  value={straddleType}
                  onChange={(e) => setStraddleType(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f2b84b',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {STRADDLE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Effective Stack ($)
                <input
                  type="number"
                  min="50"
                  step="100"
                  value={stack}
                  onChange={(e) => setStack(e.target.value)}
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
                Table VPIP / Call Frequency (%)
                <input
                  type="number"
                  min="10"
                  max="85"
                  step="2"
                  value={tableVpip}
                  onChange={(e) => setTableVpip(e.target.value)}
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
                Bomb Pot Ante Per Player ($)
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={bombAnte}
                  onChange={(e) => setBombAnte(e.target.value)}
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
                Bomb Pot Players (6 To 9)
                <select
                  value={bombPlayers}
                  onChange={(e) => setBombPlayers(Number(e.target.value))}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#f8fafc',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {[6, 7, 8, 9].map((p) => (
                    <option key={p} value={p}>
                      {p} Players In Bomb Pot
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Bomb Pot Format
                <select
                  value={bombFormat}
                  onChange={(e) => setBombFormat(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '10px 12px',
                    borderRadius: '2px',
                    border: '1px solid #334155',
                    background: '#020608',
                    color: '#25c8ff',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {BOMB_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Reduced Straddled Stack Depth
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {metrics.straddledBbs} Straddled BBs
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                2x Blind Multiplier (Down From {metrics.unstraddledBbs} BBs)
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Straddler Steal Breakeven %
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {metrics.breakevenStealPct}% Fold Eq
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Dead Straddle Pot: ${metrics.deadStraddlePot}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #34d399' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Bomb Pot Dead Pool &amp; Flop SPR
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                ${metrics.bombPool} ({metrics.bombSpr} SPR)
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Remaining Stack: ${metrics.remainingBombStack}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Min Flop Commit Equity
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>
                {metrics.minEquitySingleBoard}% Total Eq
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {metrics.isDoubleBoard ? 'Requires Scoop Or 2-Board Equity' : 'Single-Board Pot Commitment'}
              </div>
            </div>
          </div>

          <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f2b84b', marginBottom: 4 }}>
              Bomb Pot Quartering &amp; Scoop Strategy Guidance
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55 }}>
              {metrics.scoopGuidance}
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Live Straddle &amp; Bomb Pot Structural Comparison Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                How UTG Straddles, Mississippi Button Straddles, And Bomb Pots Compress Effective Stacks And Postflop SPR
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Live Format</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Effective Stack</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Forced Dead Money</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Typical Flop SPR</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Strategic Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {STRADDLE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.format} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.format}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.effectiveStack}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.preFlopPot}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.flopSpr}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.tacticalAdjustment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker PLO, Bomb Pot &amp; Sizing Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/plo-bet-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              PLO Max Bet &amp; Bomb Pot Calculator
            </Link>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              SPR &amp; Geometric Sizing Calculator
            </Link>
            <Link href="/tools/iso-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Pre-Flop Isolation Raise Calculator
            </Link>
            <Link href="/games/double-board-bomb-pot" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Double-Board Bomb Pot Strategy Guide
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={STRADDLE_FAQS} />

            <CitationBacklinkBox
              title="Live Poker Straddle, Mississippi Button Straddle & Bomb Pot EV Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Straddle & Bomb Pot Solver"
              badgeValue="Straddled SPR & Quartering Math"
              summary="Interactive Live Poker Straddle, Mississippi Button Straddle, And Bomb Pot EV Calculator With Flop SPR And Scoop Equity."
              slug="straddle-calculator"
            />

            <AiPromptLauncher
              title="Live Poker Straddle, Mississippi Button Straddle & Bomb Pot EV Calculator"
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
    const md = renderStraddleCalculatorMarkdown({
      blinds: query?.blinds,
      straddleType: query?.type,
      stack: query?.stack,
      bombAnte: query?.ante,
      bombPlayers: query?.players,
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
