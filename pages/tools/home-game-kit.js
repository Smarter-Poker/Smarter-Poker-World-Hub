/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  HOME GAME CHIP SET & SETUP CALCULATOR (/tools/home-game-kit)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Interactive home game chip set denomination breakdown calculator for 300, 500,
 * and 1,000 piece sets with starting tube distributions, color-up schedules,
 * and a print-ready House Rules & Official Hand Rankings reference card.
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
import { renderHomeGameKitMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const STAKE_PRESETS = {
  'cash-25-50': {
    id: 'cash-25-50',
    format: 'cash',
    label: '$0.25/$0.50 Cash ($50 Buy-In)',
    stackValue: '$50.00 (100 BB)',
    denoms: [
      { color: 'White ($0.25)', unit: 0.25, tubeQty: 12, colorUp: 'Remains In Play All Night (Fractional Blind)' },
      { color: 'Red ($1.00)', unit: 1.0, tubeQty: 17, colorUp: 'Primary Workhorse Betting Chip' },
      { color: 'Green ($5.00)', unit: 5.0, tubeQty: 4, colorUp: 'Value & Rebuy Chip ($20 Stack)' },
      { color: 'Black ($25.00)', unit: 25.0, tubeQty: 0, colorUp: 'Bank Reserve For Late-Night Rebuys' },
    ],
  },
  'cash-1-2': {
    id: 'cash-1-2',
    format: 'cash',
    label: '$1/$2 Cash ($200 Buy-In)',
    stackValue: '$200.00 (100 BB)',
    denoms: [
      { color: 'White ($1.00)', unit: 1, tubeQty: 15, colorUp: 'Remains In Play All Night (Blind & Antes)' },
      { color: 'Red ($5.00)', unit: 5, tubeQty: 17, colorUp: 'Primary Workhorse Postflop Chip ($85)' },
      { color: 'Green ($25.00)', unit: 25, tubeQty: 4, colorUp: 'Big Bet & Rebuy Stack ($100)' },
      { color: 'Black ($100.00)', unit: 100, tubeQty: 0, colorUp: 'Cage Reserve For Deepstack Rebuys' },
    ],
  },
  't10000': {
    id: 't10000',
    format: 'tournament',
    label: 'T10,000 Tournament (100 BB)',
    stackValue: '10,000 Points',
    denoms: [
      { color: 'Green (T25)', unit: 25, tubeQty: 12, colorUp: 'Color Up At End Of Level 4 (Before 100/200)' },
      { color: 'Black (T100)', unit: 100, tubeQty: 12, colorUp: 'Color Up At End Of Level 8 (Before 500/1,000)' },
      { color: 'Purple (T500)', unit: 500, tubeQty: 5, colorUp: 'Color Up At End Of Level 12 (Before 2,000/4,000)' },
      { color: 'Yellow (T1,000)', unit: 1000, tubeQty: 6, colorUp: 'Remains In Play Until Final Hand (+ Reserve)' },
    ],
  },
  't25000': {
    id: 't25000',
    format: 'tournament',
    label: 'T25,000 Deepstack (250 BB)',
    stackValue: '25,000 Points',
    denoms: [
      { color: 'Black (T100)', unit: 100, tubeQty: 10, colorUp: 'Color Up At End Of Level 6 (Before 500/1,000)' },
      { color: 'Purple (T500)', unit: 500, tubeQty: 8, colorUp: 'Color Up At End Of Level 10 (Before 1,500/3,000)' },
      { color: 'Yellow (T1,000)', unit: 1000, tubeQty: 10, colorUp: 'Color Up At End Of Level 14 (Before 5,000/10,000)' },
      { color: 'Orange (T5,000)', unit: 5000, tubeQty: 2, colorUp: 'Remains In Play Through Championship Heads-Up' },
    ],
  },
};

const PRINTABLE_HAND_RANKINGS = [
  { rank: '1. Royal Flush', example: 'A-K-Q-J-10 All Same Suit', odds: '1 In 649,740 (7-Card)' },
  { rank: '2. Straight Flush', example: '9-8-7-6-5 All Same Suit', odds: '1 In 3,590' },
  { rank: '3. Four Of A Kind (Quads)', example: 'Q-Q-Q-Q-4', odds: '1 In 595' },
  { rank: '4. Full House (Boat)', example: 'J-J-J-8-8', odds: '1 In 38.5' },
  { rank: '5. Flush', example: 'Any Five Cards Same Suit', odds: '1 In 33.0' },
  { rank: '6. Straight', example: '10-9-8-7-6 Mixed Suits', odds: '1 In 21.7' },
  { rank: '7. Three Of A Kind (Trips/Set)', example: '7-7-7-K-2', odds: '1 In 20.7' },
  { rank: '8. Two Pair', example: 'A-A-9-9-K', odds: '1 In 4.26' },
  { rank: '9. One Pair', example: '10-10-A-Q-5', odds: '1 In 2.28' },
  { rank: '10. High Card', example: 'A-K-J-8-4 Unpaired Rainbow', odds: '1 In 5.74' },
];

const HOME_GAME_KIT_FAQS = [
  {
    question: 'What Size Poker Chip Set Do You Need For An 8-Player Home Game?',
    answer:
      'A 500-Piece Poker Chip Set Is The Gold Standard For A Single-Table 6-To-10 Player Home Game. Issuing 30 To 35 Physical Chips Per Player Requires Roughly 280 Starting Chips For 8 Players, Leaving Over 200 High-Denomination Chips In The Bank For Rebuys, Add-Ons, And Tournament Color-Ups.',
  },
  {
    question: 'How Many Denominations Should You Put On A Cash Game Table?',
    answer:
      'Never Put More Than 3 Active Chip Denominations On A Cash Game Table At Once, With A 4x Or 5x Ratio Between Denominations (For Example: $0.25, $1.00, And $5.00 For Micro-Stakes, Or $1, $5, And $25 For $1/$2 Cash). Intermediate Denominations Like $2 Or $10 Slow Down Pot Counting And Create Unnecessary Change-Making.',
  },
  {
    question: 'What Are The Most Important House Rules To Post Before Dealing A Home Game?',
    answer:
      'Every Home Game Should Clearly State: (1) Table Stakes Only (No Reaching Into Pockets Mid-Hand), (2) Verbal Declarations Of Call, Raise, Or All-In Are Binding, (3) One-Chip Call Rule (A Single Oversized Chip Thrown In Without Saying Raise Is Always A Call), And (4) Exact Rebuy Cutoff Time Or Cash Game Notice Before Cashing Out.',
  },
];

export default function HomeGameKitPage({
  initialFormat = 'cash',
  initialPlayers = 8,
  initialChipSetSize = 500,
  initialPreset = 'cash-1-2',
}) {
  const router = useRouter();
  const [gameFormat, setGameFormat] = useState(initialFormat);
  const [players, setPlayers] = useState(initialPlayers);
  const [chipSetSize, setChipSetSize] = useState(initialChipSetSize);
  const [presetKey, setPresetKey] = useState(initialPreset);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.format !== undefined) {
      const f = String(q.format).toLowerCase() === 'tournament' ? 'tournament' : 'cash';
      setGameFormat(f);
    }
    if (q.players !== undefined) setPlayers(Math.max(4, Math.min(10, Math.round(Number(q.players) || 8))));
    if (q.set !== undefined) {
      const s = Number(q.set);
      if ([300, 500, 1000].includes(s)) setChipSetSize(s);
    }
    if (q.preset !== undefined && STAKE_PRESETS[String(q.preset)]) {
      setPresetKey(String(q.preset));
      setGameFormat(STAKE_PRESETS[String(q.preset)].format);
    }
  }, [router.isReady, router.query]);

  const handleFormatChange = (newFormat) => {
    setGameFormat(newFormat);
    if (newFormat === 'cash' && STAKE_PRESETS[presetKey]?.format !== 'cash') {
      setPresetKey('cash-1-2');
    } else if (newFormat === 'tournament' && STAKE_PRESETS[presetKey]?.format !== 'tournament') {
      setPresetKey('t10000');
    }
  };

  const kitMetrics = useMemo(() => {
    const safePlayers = Math.max(4, Math.min(10, Math.round(Number(players) || 8)));
    const safeSetSize = [300, 500, 1000].includes(Number(chipSetSize)) ? Number(chipSetSize) : 500;
    const activePreset = STAKE_PRESETS[presetKey] || STAKE_PRESETS['cash-1-2'];

    const chipsPerPlayer = activePreset.denoms.reduce((acc, d) => acc + d.tubeQty, 0);
    const totalStartingChipsIssued = chipsPerPlayer * safePlayers;
    const remainingBankReserveChips = Math.max(0, safeSetSize - totalStartingChipsIssued);

    // Recommended total set purchase breakdown across 4 colors (40% / 30% / 20% / 10% scaled to safeSetSize)
    const setAllocationPercentages = [0.35, 0.35, 0.20, 0.10];
    const rows = activePreset.denoms.map((d, idx) => {
      const issuedTotal = d.tubeQty * safePlayers;
      const recommendedSetCount = Math.max(issuedTotal, Math.round((safeSetSize * setAllocationPercentages[idx]) / 25) * 25);
      const reserveCount = Math.max(0, recommendedSetCount - issuedTotal);
      const playerSubValue = d.tubeQty * d.unit;
      return {
        ...d,
        issuedTotal,
        recommendedSetCount,
        reserveCount,
        playerSubValue: activePreset.format === 'cash' ? `$${playerSubValue.toFixed(2)}` : `T${playerSubValue.toLocaleString('en-US')}`,
      };
    });

    return {
      safePlayers,
      safeSetSize,
      activePreset,
      chipsPerPlayer,
      totalStartingChipsIssued,
      remainingBankReserveChips,
      rows,
    };
  }, [players, chipSetSize, presetKey]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/home-game-kit?format=${gameFormat}&players=${kitMetrics.safePlayers}&set=${kitMetrics.safeSetSize}&preset=${kitMetrics.activePreset.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/home-game-kit';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageDesc =
    'Calculate Optimal Poker Chip Set Denomination Breakdowns For 300, 500, And 1000 Piece Sets With Printable Home Game Rules And Hand Rankings.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: 'Smarter.Poker Home Game Chip Set & Setup Calculator',
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Home Game Chip Distribution & Setup Calculator',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Home Game Chip Set Calculator', canonicalPath],
      ],
      faqs: HOME_GAME_KIT_FAQS,
      howTo: {
        name: 'How To Set Up A Poker Home Game Chip Set And Starting Stacks',
        description: pageDesc,
        steps: [
          {
            name: 'Choose Cash Game Or Single-Table Tournament Format',
            text: 'Select Your Preferred Format And Starting Stake Preset ($0.25/$0.50 Cash, $1/$2 Cash, T10,000, Or T25,000 Deepstack).',
          },
          {
            name: 'Input Total Players (4 To 10) And Chip Case Size (300, 500, Or 1,000)',
            text: 'Calculate Exact Per-Player Starting Chip Tube Counts And Bank Rebuy Reserves.',
          },
          {
            name: 'Print Or Share The House Rules And Hand Rankings Reference Card',
            text: 'Copy Your Shareable Home Game Setup Link For Your Group Chat And Display The Official Hand Rankings Card.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Home Game Chip Set & Setup Calculator"
        description="Calculate Optimal Poker Chip Set Denomination Breakdowns For 300, 500, And 1000 Piece Sets With Printable Home Game Rules And Hand Rankings."
        canonical="/tools/home-game-kit"
        jsonLd={schema}
      />

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: isEmbed ? '16px 14px 24px' : '40px 20px 80px' }}>
        {!isEmbed && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#94a3b8', marginBottom: 18 }}>
            <Link href="/" style={{ color: '#25c8ff', textDecoration: 'none' }}>Smarter.Poker</Link>
            {' / '}
            <Link href="/tools" style={{ color: '#25c8ff', textDecoration: 'none' }}>Poker Tools</Link>
            {' / '}
            <span>Home Game Chip Set &amp; Setup Calculator</span>
          </nav>
        )}

        <h1 style={{ fontSize: isEmbed ? 22 : 32, fontWeight: 800, color: '#f8fafc', margin: '0 0 14px 0', lineHeight: 1.2 }}>
          Home Game Chip Set &amp; Setup Calculator
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> For An 8-To-10 Player Home Game, A <strong>500-Piece Poker Chip Set</strong> Configured With <strong>30 To 36 Physical Chips Per Player Across 3 Active Denominations</strong> Ensures Fast Dealing Without Change-Making Bottlenecks While Reserving Over 200 High-Value Chips In The Bank For Rebuys And Color-Ups.
          </p>
        )}

        {/* Interactive Chip Set Builder */}
        <section
          aria-label="Interactive Home Game Chip Set Calculator"
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
              Interactive Per-Player Starting Tube &amp; Case Allocation Solver
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 16, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Game Format
                <select
                  value={gameFormat}
                  onChange={(e) => handleFormatChange(e.target.value)}
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
                  <option value="cash">Cash Game</option>
                  <option value="tournament">Single-Table Tournament</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Total Players (4 To 10)
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
                    color: '#f8fafc',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {[4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} Players
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Chip Set Size
                <select
                  value={chipSetSize}
                  onChange={(e) => setChipSetSize(Number(e.target.value))}
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
                >
                  <option value={300}>300 Chips</option>
                  <option value={500}>500 Chips</option>
                  <option value={1000}>1,000 Chips</option>
                </select>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                Stakes / Starting Stack Preset
                <select
                  value={presetKey}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setPresetKey(nextKey);
                    if (STAKE_PRESETS[nextKey]) {
                      setGameFormat(STAKE_PRESETS[nextKey].format);
                    }
                  }}
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
                >
                  <option value="cash-25-50">$0.25/$0.50 Cash</option>
                  <option value="cash-1-2">$1/$2 Cash</option>
                  <option value="t10000">T10,000 Tournament</option>
                  <option value="t25000">T25,000 Deepstack</option>
                </select>
              </label>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Per-Player Starting Stack
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#25c8ff', marginTop: 4 }}>
                {kitMetrics.activePreset.stackValue}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {kitMetrics.chipsPerPlayer} Physical Chips Per Player Tube
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Starting Chips On Table ({kitMetrics.safePlayers} Seats)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2b84b', marginTop: 4 }}>
                {kitMetrics.totalStartingChipsIssued} Chips Issued
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Out Of {kitMetrics.safeSetSize.toLocaleString('en-US')} Total Set Pieces
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Bank Reserve For Rebuys &amp; Color-Up
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                {kitMetrics.remainingBankReserveChips} Reserve Chips
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Supports Reloads &amp; Late Entrants
              </div>
            </div>
          </div>

          {/* Starting Chip Tube Breakdown Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#020608', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 12px', color: '#94a3b8' }}>
                Per-Player Starting Chip Tube Breakdown, Total Set Allocation ({kitMetrics.safeSetSize} Chips), And Color-Up Schedule
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chip Color &amp; Denomination</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Chips Per Player Tube</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Stack Sub-Value</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Total Issued ({kitMetrics.safePlayers} Players)</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended Set Count</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Color-Up &amp; Bank Usage</th>
                </tr>
              </thead>
              <tbody>
                {kitMetrics.rows.map((row) => (
                  <tr key={row.color} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.color}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 800 }}>{row.tubeQty}x Chips</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.playerSubValue}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.issuedTotal} Chips</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.recommendedSetCount} Chips</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.colorUp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Print-Ready Home Game House Rules & Official Hand Rankings Card */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Print-Ready Home Game House Rules &amp; Official Hand Rankings Reference Card
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            <div style={{ background: '#101a20', border: '1px solid #1e293b', borderRadius: '2px', padding: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#25c8ff', margin: '0 0 12px 0' }}>
                Core RROP &amp; TDA Home Game Floor Rules
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 14, lineHeight: 1.75 }}>
                <li><strong>Table Stakes Only:</strong> Only Chips On The Table At The Start Of A Hand May Be Bet. Reload Between Hands Only.</li>
                <li><strong>One-Chip Call Rule:</strong> Tossing A Single Oversized Chip Into The Pot Without Verbally Declaring &quot;Raise&quot; Is Always A Call.</li>
                <li><strong>No String Bets:</strong> Announce Your Raise Size Verbally Or Push All Chips Forward In One Continuous Motion.</li>
                <li><strong>Cards Speak At Showdown:</strong> Reading Your Hand Misleadingly Does Not Void The Actual Best Five-Card Hand Shown Face Up.</li>
                <li><strong>30-Minute Cash-Out Notice:</strong> In Friendly Cash Games, Announce Your Departure 30 Minutes Before Racking Up A Big Stack.</li>
              </ul>
            </div>

            <div style={{ background: '#101a20', border: '1px solid #1e293b', borderRadius: '2px', padding: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f2b84b', margin: '0 0 12px 0' }}>
                Official 10-Tier Poker Hand Rankings (High To Low)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                      <th scope="col" style={{ padding: '6px 8px' }}>Hand Rank</th>
                      <th scope="col" style={{ padding: '6px 8px' }}>5-Card Example</th>
                      <th scope="col" style={{ padding: '6px 8px' }}>7-Card Odds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRINTABLE_HAND_RANKINGS.map((h) => (
                      <tr key={h.rank} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#f8fafc' }}>{h.rank}</td>
                        <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{h.example}</td>
                        <td style={{ padding: '6px 8px', color: '#34d399', fontWeight: 600 }}>{h.odds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Home Game &amp; Tournament Director Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/blind-structure-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Tournament Blind Structure Generator
            </Link>
            <Link href="/tools/payout-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Prize Pool &amp; Payout Calculator
            </Link>
            <Link href="/tools/side-pot-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multi-Way Side Pot Calculator
            </Link>
            <Link href="/learn/poker-hand-rankings" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Full Poker Hand Rankings Cheat Sheet
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 24 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={HOME_GAME_KIT_FAQS} />

            <CitationBacklinkBox
              title="Home Game Chip Set & Setup Calculator"
              canonicalUrl={canonicalUrl}
              badgeType="commander"
              badgeLabel="Home Game Setup Kit"
              badgeValue="Chip Breakdowns & House Rules"
              summary="Interactive Home Game Poker Chip Set Denomination Calculator For 300, 500, And 1,000 Piece Sets With Printable Rules."
              slug="home-game-kit"
            />

            <AiPromptLauncher
              title="Home Game Chip Set & Setup Calculator"
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
    const renderToolDocumentationMarkdown = () => renderHomeGameKitMarkdown();
    const md = renderToolDocumentationMarkdown('home-game-kit');
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
