/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE FLOP BOARD TEXTURE & GTO C-BET FREQUENCY ANALYZER (/tools/board-texture-analyzer)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Analyzes any 3-card flop texture (Suit Distribution, Pairing, Connectedness
 * Score 0-100, Dynamic vs Static Rating, Range Advantage, Nut Advantage, and
 * Optimal GTO C-Bet Strategy) across 4 canonical preflop scenarios.
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
import { renderBoardTextureAnalyzerMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_VALUES = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
};

const SUITS = [
  { code: 's', label: 'Spades (♠)', symbol: '♠', color: '#38bdf8' },
  { code: 'h', label: 'Hearts (♥)', symbol: '♥', color: '#f87171' },
  { code: 'd', label: 'Diamonds (♦)', symbol: '♦', color: '#60a5fa' },
  { code: 'c', label: 'Clubs (♣)', symbol: '♣', color: '#34d399' },
];

const PRESET_BOARDS = [
  {
    id: 'AsKh7d',
    label: 'As Kh 7d - Dry Ace-High Rainbow',
    cards: [
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 'h' },
      { rank: '7', suit: 'd' },
    ],
  },
  {
    id: 'JhTs9s',
    label: 'Jh Ts 9s - Wet Connected Two-Tone',
    cards: [
      { rank: 'J', suit: 'h' },
      { rank: 'T', suit: 's' },
      { rank: '9', suit: 's' },
    ],
  },
  {
    id: 'KsQsJs',
    label: 'Ks Qs Js - Broadway Monotone',
    cards: [
      { rank: 'K', suit: 's' },
      { rank: 'Q', suit: 's' },
      { rank: 'J', suit: 's' },
    ],
  },
  {
    id: '8c8d3h',
    label: '8c 8d 3h - Paired Dry Low',
    cards: [
      { rank: '8', suit: 'c' },
      { rank: '8', suit: 'd' },
      { rank: '3', suit: 'h' },
    ],
  },
  {
    id: '7h6h5c',
    label: '7h 6h 5c - Low Dynamic Connected',
    cards: [
      { rank: '7', suit: 'h' },
      { rank: '6', suit: 'h' },
      { rank: '5', suit: 'c' },
    ],
  },
];

const PREFLOP_SCENARIOS = [
  {
    id: 'BTN_VS_BB_SRP',
    label: 'BTN Vs BB Single Raised Pot',
    pfrLabel: 'Button (IP)',
    callerLabel: 'Big Blind (OOP)',
  },
  {
    id: 'CO_VS_BTN_3BP',
    label: 'CO Vs BTN 3-Bet Pot',
    pfrLabel: 'Button 3-Bettor (IP)',
    callerLabel: 'Cutoff Caller (OOP)',
  },
  {
    id: 'UTG_VS_BB_SRP',
    label: 'UTG Vs BB Single Raised Pot',
    pfrLabel: 'Under The Gun (IP)',
    callerLabel: 'Big Blind (OOP)',
  },
  {
    id: 'SB_VS_BB_BVB',
    label: 'SB Vs BB Blind Vs Blind',
    pfrLabel: 'Small Blind (OOP)',
    callerLabel: 'Big Blind (IP)',
  },
];

const TEXTURE_BENCHMARK_TABLE = [
  {
    archetype: 'Dry Ace-High Rainbow (A♠ K♥ 7♦)',
    connectedness: '18 / 100 (Static)',
    advantage: 'PFR Massive Range & Nut Advantage',
    strategy: '33% Small Range Bet (85% Small / 10% Big / 5% Check)',
    turnPlan: 'Barrel Big (75%-125% Pot) On Broadway & Blank Turn Cards',
  },
  {
    archetype: 'Paired Dry Low (8♣ 8♦ 3♥)',
    connectedness: '12 / 100 (Static)',
    advantage: 'PFR Overpair Advantage / Shared Trips',
    strategy: '33% Small Range Bet (88% Small / 0% Big / 12% Check)',
    turnPlan: 'Double Barrel Overcards (A, K, Q); Slow Down On 8 Or 3',
  },
  {
    archetype: 'Wet Connected Two-Tone (J♥ T♠ 9♠)',
    connectedness: '92 / 100 (Dynamic)',
    advantage: 'Symmetrical Equity / Shared Straights',
    strategy: '66%-75% Polarized Bet (45% Check / 15% Small / 40% Big)',
    turnPlan: 'Check Most Turn Flush/Straight Completions Without Redraws',
  },
  {
    archetype: 'Broadway Monotone (K♠ Q♠ J♠)',
    connectedness: '96 / 100 (Dynamic)',
    advantage: 'PFR High-Flush Blocker Advantage',
    strategy: '33% Small Range Bet Or Check (52% Check / 48% Small / 0% Big)',
    turnPlan: 'Check 4th Spade Without Ace Or King Of Spades',
  },
  {
    archetype: 'Low Dynamic Connected (7♥ 6♥ 5♣)',
    connectedness: '88 / 100 (Dynamic)',
    advantage: 'BB Condensed 2-Pair/Set/Straight Advantage',
    strategy: 'High Check Frequency (68% Check / 22% Small / 10% Big)',
    turnPlan: 'Protect Overpairs With Check-Calls; Attack High Offsuit Bricks',
  },
];

const BOARD_TEXTURE_FAQS = [
  {
    question: 'What Is The Difference Between Range Advantage And Nut Advantage On The Flop?',
    answer:
      'Range Advantage Measures Which Player Has Higher Overall Equity Across Every Hand Combination In Their Entire Range (Common On High-Card Boards Like A-K-7). Nut Advantage Measures Which Player Holds A Higher Concentration Of Unbeatable Sets, Two Pairs, And Straights (Often The Big Blind Caller On Low Connected Flops Like 7-6-5).',
  },
  {
    question: 'When Should You Use A 33% Small Range C-Bet Versus A 75% Polarized C-Bet?',
    answer:
      'Use A 33% Small Range Bet At High Frequency When You Hold A Strong Range Advantage On Static, Dry, Or Paired Boards Where Turn Cards Rarely Change The Nuts. Use A 66% To 75% Polarized Bet At Lower Frequency On Dynamic Two-Tone Boards Where Strong Value Hands Need Protection Against High-Equity Draws.',
  },
  {
    question: 'Why Does The Pre-Flop Raiser Check So Often On Low Connected Boards Like 7-6-5?',
    answer:
      'Because The Big Blind Defends All Pocket Pairs (55, 66, 77), Suited Connectors (98s, 87s, 76s, 65s, 54s), And Suited Gaps While The Pre-Flop Raiser Holds Mostly Unpaired Overcards, The Defender Owns The Nut Advantage And Can Check-Raise Relentlessly Against Auto-C-Bets.',
  },
];

export default function BoardTextureAnalyzerPage() {
  const router = useRouter();
  const [card1, setCard1] = useState({ rank: 'A', suit: 's' });
  const [card2, setCard2] = useState({ rank: 'K', suit: 'h' });
  const [card3, setCard3] = useState({ rank: '7', suit: 'd' });
  const [scenario, setScenario] = useState('BTN_VS_BB_SRP');
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
    if (q.flop && typeof q.flop === 'string' && q.flop.length === 6) {
      const r1 = q.flop[0].toUpperCase();
      const s1 = q.flop[1].toLowerCase();
      const r2 = q.flop[2].toUpperCase();
      const s2 = q.flop[3].toLowerCase();
      const r3 = q.flop[4].toUpperCase();
      const s3 = q.flop[5].toLowerCase();
      if (RANKS.includes(r1) && RANKS.includes(r2) && RANKS.includes(r3)) {
        setCard1({ rank: r1, suit: ['s', 'h', 'd', 'c'].includes(s1) ? s1 : 's' });
        setCard2({ rank: r2, suit: ['s', 'h', 'd', 'c'].includes(s2) ? s2 : 'h' });
        setCard3({ rank: r3, suit: ['s', 'h', 'd', 'c'].includes(s3) ? s3 : 'd' });
      }
    }
    if (q.scenario && PREFLOP_SCENARIOS.some((s) => s.id === q.scenario)) {
      setScenario(String(q.scenario));
    }
  }, [router.isReady, router.query]);

  const analysis = useMemo(() => {
    const cards = [card1, card2, card3];
    const vals = cards.map((c) => RANK_VALUES[c.rank] || 10).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);
    const uniqueSuits = new Set(suits).size;
    const uniqueRanks = new Set(vals).size;

    const suitTexture =
      uniqueSuits === 1
        ? 'Monotone (3 Of One Suit)'
        : uniqueSuits === 2
        ? 'Two-Tone (Flush Draw Possible)'
        : 'Rainbow (3 Distinct Suits)';

    const pairTexture =
      uniqueRanks === 1
        ? 'Trips On Board (3 Of A Kind)'
        : uniqueRanks === 2
        ? 'Paired Board'
        : 'Unpaired Board';

    // Gap connectedness calculation (also considering Ace-low wheel proximity)
    const spanHigh = vals[0] - vals[2];
    const valsWheel = cards
      .map((c) => (c.rank === 'A' ? 1 : RANK_VALUES[c.rank] || 10))
      .sort((a, b) => b - a);
    const spanLow = valsWheel[0] - valsWheel[2];
    const minSpan = uniqueRanks < 3 ? Math.max(4, Math.min(spanHigh, spanLow)) : Math.min(spanHigh, spanLow);

    let connectedness = 20;
    if (uniqueRanks === 1) {
      connectedness = 8;
    } else if (uniqueRanks === 2) {
      connectedness = uniqueSuits === 2 ? 28 : 14;
    } else {
      const gapScore = Math.max(0, 65 - (minSpan - 2) * 14);
      const suitBonus = uniqueSuits === 1 ? 30 : uniqueSuits === 2 ? 18 : 0;
      const broadwayBonus = vals[2] >= 10 ? 8 : 0;
      connectedness = Math.min(98, Math.max(10, Math.round(gapScore + suitBonus + broadwayBonus)));
    }

    const dynamicRating =
      connectedness >= 70
        ? 'Highly Dynamic (Turn Frequently Shifts Nut Hand)'
        : connectedness >= 42
        ? 'Semi-Dynamic (Moderate Draw & Overcard Shifts)'
        : 'Static Board (Flop Leader Rarely Outdrawn On Turn)';

    const avgRank = (vals[0] + vals[1] + vals[2]) / 3;
    const highCard = vals[0];
    const lowBoard = highCard <= 9 && uniqueRanks === 3;
    const is3BetPot = scenario === 'CO_VS_BTN_3BP';
    const isBvb = scenario === 'SB_VS_BB_BVB';
    const isUtg = scenario === 'UTG_VS_BB_SRP';

    let rangeAdvantage = 'PFR Moderate Range Advantage (53% To 55% Equity)';
    let nutAdvantage = 'Shared Nut Distribution Across Both Ranges';
    let strategyLabel = '33% Small Range Bet';
    let checkPct = 25;
    let smallBetPct = 55;
    let bigBetPct = 20;

    if (uniqueSuits === 1) {
      rangeAdvantage = 'PFR High-Flush Blocker Advantage (54% Equity)';
      nutAdvantage = 'Symmetrical Flushes (PFR Holds More A/K Flush Blockers)';
      strategyLabel = '33% Small Range Bet (Or High Check Mix)';
      checkPct = 48;
      smallBetPct = 52;
      bigBetPct = 0;
    } else if (uniqueRanks < 3) {
      rangeAdvantage = 'PFR Strong Overpair & High-Card Advantage (57% Equity)';
      nutAdvantage = highCard >= 11 ? 'PFR Trips & Full House Advantage' : 'PFR Overpair Advantage vs BB Low Trips';
      strategyLabel = '33% Small Range Bet';
      checkPct = isBvb ? 28 : 12;
      smallBetPct = isBvb ? 64 : 84;
      bigBetPct = isBvb ? 8 : 4;
    } else if (lowBoard && minSpan <= 4) {
      rangeAdvantage = is3BetPot
        ? '3-Bettor Overpair Advantage (55% Equity)'
        : 'BB Condensed Range Parity (49% To 51% Equity)';
      nutAdvantage = is3BetPot
        ? 'Caller Holds Low Sets; 3-Bettor Holds AA-TT Overpairs'
        : 'BB Caller Strong Nut Advantage (Sets, 2-Pair, Straights)';
      strategyLabel = 'High Check Frequency';
      checkPct = is3BetPot ? 45 : 68;
      smallBetPct = is3BetPot ? 20 : 22;
      bigBetPct = is3BetPot ? 35 : 10;
    } else if (highCard >= 13 && connectedness <= 45) {
      rangeAdvantage = isUtg
        ? 'UTG Extreme Range Advantage (60%+ Equity)'
        : 'PFR Massive Range Advantage (58% To 61% Equity)';
      nutAdvantage = 'PFR Dominant Nut Advantage (AA, KK, AK, Top Sets)';
      strategyLabel = '33% Small Range Bet';
      checkPct = isBvb ? 20 : 10;
      smallBetPct = isBvb ? 65 : 80;
      bigBetPct = isBvb ? 15 : 10;
    } else if (connectedness >= 68) {
      rangeAdvantage = 'Slight PFR Range Advantage (52% To 54% Equity)';
      nutAdvantage = 'Dynamic Shared Nuts (Top Sets vs Straight/Flush Draws)';
      strategyLabel = '66%-75% Polarized Bet';
      checkPct = 42;
      smallBetPct = 16;
      bigBetPct = 42;
    } else {
      rangeAdvantage = 'PFR Solid Range Advantage (55% Equity)';
      nutAdvantage = 'PFR Top-Pair & Overpair Advantage';
      strategyLabel = '66%-75% Polarized Bet';
      checkPct = 34;
      smallBetPct = 26;
      bigBetPct = 40;
    }

    const bestTurnCards =
      highCard >= 13
        ? 'Offsuit Low Bricks (2, 3, 4) And Non-Flush Broadway Cards (A, K, Q) That Reinforce PFR Overpair/Top-Pair Equity'
        : 'Offsuit Broadway Overcards (A, K, Q) That Shift Range Advantage Toward The Pre-Flop Aggressor And Counterfeit Low Pairs';

    const worstTurnCards =
      uniqueSuits === 2
        ? 'Flush-Completing Middle Cards (6, 7, 8, 9 Of Flush Suit) That Complete Both Straights And Flushes Simultaneously'
        : 'Middle Connected Cards (6, 7, 8, 9) That Complete Four-To-A-Straight Boards And Favor Condensed Defending Ranges';

    return {
      suitTexture,
      pairTexture,
      connectedness,
      dynamicRating,
      rangeAdvantage,
      nutAdvantage,
      strategyLabel,
      checkPct,
      smallBetPct,
      bigBetPct,
      bestTurnCards,
      worstTurnCards,
      flopString: `${card1.rank}${card1.suit}${card2.rank}${card2.suit}${card3.rank}${card3.suit}`,
    };
  }, [card1, card2, card3, scenario]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/board-texture-analyzer?flop=${analysis.flopString}&scenario=${scenario}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const applyPreset = (preset) => {
    setCard1(preset.cards[0]);
    setCard2(preset.cards[1]);
    setCard3(preset.cards[2]);
  };

  const canonicalPath = '/tools/board-texture-analyzer';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = 'Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer';
  const pageDesc =
    'Analyze Any 3-Card Flop Texture For Connectedness Score, Dynamic Vs Static Rating, Range And Nut Advantage, And Optimal GTO C-Bet Sizing Frequencies.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Flop Board Texture & GTO C-Bet Solver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['Flop Board Texture Analyzer', canonicalPath],
      ],
      faqs: BOARD_TEXTURE_FAQS,
      howTo: {
        name: 'How To Analyze Poker Flop Board Texture And GTO C-Bet Strategy',
        description: pageDesc,
        steps: [
          {
            name: 'Select Three Flop Cards Or Choose A Classic Board Archetype',
            text: 'Pick The Rank And Suit For All Three Flop Cards Or Click One Of The Five Canonical Flop Presets.',
          },
          {
            name: 'Choose The Pre-Flop Positional Scenario',
            text: 'Select BTN Vs BB Single Raised Pot, CO Vs BTN 3-Bet Pot, UTG Vs BB Single Raised Pot, Or SB Vs BB Blind Vs Blind.',
          },
          {
            name: 'Review Connectedness, Range/Nut Advantage, And C-Bet Frequencies',
            text: 'Apply The Recommended 33% Small Range Bet, 66%-75% Polarized Bet, Or High Check Frequency Strategy And Turn Barrel Plan.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  const getSuitObj = (code) => SUITS.find((s) => s.code === code) || SUITS[0];

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer"
        description="Analyze Any 3-Card Flop Texture For Connectedness Score, Dynamic Vs Static Rating, Range And Nut Advantage, And Optimal GTO C-Bet Sizing Frequencies."
        canonical="/tools/board-texture-analyzer"
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
              <span>Flop Board Texture Analyzer</span>
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
          Interactive Flop Board Texture &amp; GTO C-Bet Frequency Analyzer
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> Optimal Flop Continuation Betting Is Dictated By <strong>Range Advantage</strong> (Overall Equity Across All Combos) And <strong>Nut Advantage</strong> (Concentration Of Top Sets, Two Pairs, And Straights). Static High-Card Boards Favor High-Frequency <strong>33% Small Range Bets</strong>, While Dynamic Connected Two-Tone Boards Demand <strong>66%-75% Polarized Bets</strong> Or High Check Frequencies.
          </p>
        )}

        <section
          aria-label="Interactive Flop Board Texture Analyzer"
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
              Interactive 3-Card Flop Texture &amp; GTO C-Bet Solver
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

          {/* Preset Flop Archetypes */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>
              Quick-Load Canonical Flop Archetypes
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESET_BOARDS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    padding: '7px 12px',
                    background: analysis.flopString.toLowerCase() === preset.id.toLowerCase() ? '#25c8ff' : '#020608',
                    color: analysis.flopString.toLowerCase() === preset.id.toLowerCase() ? '#020608' : '#e2e8f0',
                    border: '1px solid #334155',
                    borderRadius: '2px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Card Selectors + Scenario Selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 14, marginBottom: 22 }}>
            {[
              { label: 'Flop Card 1', state: card1, setter: setCard1 },
              { label: 'Flop Card 2', state: card2, setter: setCard2 },
              { label: 'Flop Card 3', state: card3, setter: setCard3 },
            ].map((slot) => (
              <div
                key={slot.label}
                style={{
                  background: '#020608',
                  border: '1px solid #1e293b',
                  borderRadius: '2px',
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#25c8ff', marginBottom: 8 }}>
                  {slot.label}: {slot.state.rank}{getSuitObj(slot.state.suit).symbol}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    Rank
                    <select
                      value={slot.state.rank}
                      onChange={(e) => slot.setter({ ...slot.state, rank: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: 4,
                        padding: '8px',
                        background: '#101a20',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '2px',
                        fontWeight: 700,
                      }}
                    >
                      {RANKS.map((r) => (
                        <option key={r} value={r}>
                          Rank {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    Suit
                    <select
                      value={slot.state.suit}
                      onChange={(e) => slot.setter({ ...slot.state, suit: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: 4,
                        padding: '8px',
                        background: '#101a20',
                        color: getSuitObj(slot.state.suit).color,
                        border: '1px solid #334155',
                        borderRadius: '2px',
                        fontWeight: 700,
                      }}
                    >
                      {SUITS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}

            <div
              style={{
                background: '#020608',
                border: '1px solid #1e293b',
                borderRadius: '2px',
                padding: 12,
              }}
            >
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#f2b84b', marginBottom: 8 }}>
                Pre-Flop Scenario
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '10px',
                    background: '#101a20',
                    color: '#f8fafc',
                    border: '1px solid #334155',
                    borderRadius: '2px',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {PREFLOP_SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* KPI Output Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #25c8ff' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Texture Classification
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#25c8ff', marginTop: 6 }}>
                {analysis.suitTexture}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                {analysis.pairTexture} | Connectedness: {analysis.connectedness}/100
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f2b84b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Recommended GTO C-Bet Strategy
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f2b84b', marginTop: 6 }}>
                {analysis.strategyLabel}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                Check {analysis.checkPct}% | Small 33% Bet {analysis.smallBetPct}% | Big 75% Bet {analysis.bigBetPct}%
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Range Advantage Vs Nut Advantage
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399', marginTop: 6 }}>
                {analysis.rangeAdvantage}
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                {analysis.nutAdvantage}
              </div>
            </div>

            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                Dynamic Vs Static Rating
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginTop: 6, lineHeight: 1.45 }}>
                {analysis.dynamicRating}
              </div>
            </div>
          </div>

          {/* Turn Barrel Guidance */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: '#020608', padding: 14, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 4 }}>
                Best Turn Barrel Cards For Pre-Flop Raiser
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                {analysis.bestTurnCards}
              </div>
            </div>
            <div style={{ background: '#020608', padding: 14, borderRadius: '2px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
                Worst Turn Cards (Slow Down / Check-Protect)
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                {analysis.worstTurnCards}
              </div>
            </div>
          </div>
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            GTO Flop Board Texture Archetypes &amp; C-Bet Frequency Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Solver-Approved Flop Continuation Bet Sizing And Frequencies Across Five Canonical Flop Archetypes
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Flop Archetype</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Connectedness</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Range &amp; Nut Advantage</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Recommended GTO C-Bet Strategy</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Turn Barrel Plan</th>
                </tr>
              </thead>
              <tbody>
                {TEXTURE_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.archetype} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.archetype}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.connectedness}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.advantage}</td>
                    <td style={{ padding: '10px 14px', color: '#f2b84b', fontWeight: 700 }}>{row.strategy}</td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{row.turnPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Postflop &amp; GTO Calculators
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/tools/spr-calculator" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              SPR &amp; Geometric Bet Sizing Calculator
            </Link>
            <Link href="/tools/pot-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Pot Odds &amp; MDF Calculator
            </Link>
            <Link href="/tools/outs-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Postflop Outs &amp; Rule Of 4 And 2 Calculator
            </Link>
            <Link href="/tools/preflop-ranges" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              13x13 GTO Preflop Range Matrix
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={BOARD_TEXTURE_FAQS} />

            <CitationBacklinkBox
              title="Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Flop C-Bet Texture Solver"
              badgeValue="Range Advantage & C-Bet Mix"
              summary="Interactive Flop Board Texture Analyzer Computing Connectedness, Dynamic Rating, Range/Nut Advantage, And GTO C-Bet Frequencies."
              slug="board-texture-analyzer"
            />

            <AiPromptLauncher
              title="Interactive Flop Board Texture & GTO C-Bet Frequency Analyzer"
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
    const md = renderBoardTextureAnalyzerMarkdown({
      flop: query?.flop,
      scenario: query?.scenario,
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
