/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  "WHAT BEATS WHAT?" INTERACTIVE TEXAS HOLD'EM SHOWDOWN & KICKER RESOLVER (/tools/who-wins-calculator)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Evaluates exact 7-card hands for Player 1 and Player 2 using a deterministic
 * 21-combination 5-card evaluator right in the component and outputs the Winning
 * Player (or Exact Split Pot Chop), Best 5-Card Hand & Rank Name, and Plain-English
 * Floor Ruling & Kicker Explanation.
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
import { renderWhoWinsCalculatorMarkdown } from '../../src/lib/seo/markdownIngestion.mjs';

const RANK_VALS = {
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

const VAL_TO_NAME = {
  14: 'Ace',
  13: 'King',
  12: 'Queen',
  11: 'Jack',
  10: 'Ten',
  9: 'Nine',
  8: 'Eight',
  7: 'Seven',
  6: 'Six',
  5: 'Five',
  4: 'Four',
  3: 'Three',
  2: 'Deuce',
};

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

const PRESET_SCENARIOS = [
  {
    id: 'counterfeit',
    label: 'Counterfeited Two Pair On Paired Board',
    board: 'Ks Kd 9h 9c 2s',
    p1: 'As 4d',
    p2: '7h 7c',
  },
  {
    id: 'broadway_split',
    label: 'Board Plays Ace-High Straight Split',
    board: 'As Kd Qh Jc Ts',
    p1: '9s 8s',
    p2: 'Ah 2h',
  },
  {
    id: 'flush_kicker',
    label: 'Flush Kicker Tie-Breaker',
    board: 'As Js 9s 4s 2d',
    p1: 'Ks 3c',
    p2: 'Qs Ts',
  },
  {
    id: 'full_house_over',
    label: 'Full House Over Full House',
    board: 'Qs Qh 8d 8c Ks',
    p1: 'Qd 2c',
    p2: '8s 8h',
  },
  {
    id: 'wheel_straight',
    label: 'Wheel A-2-3-4-5 Straight Vs Top Pair',
    board: 'Ac 4d 3h 2s Kd',
    p1: '5s 5c',
    p2: 'As Qs',
  },
];

const SHOWDOWN_BENCHMARK_TABLE = [
  {
    scenario: 'Counterfeited Two Pair (Board: K♠ K♦ 9♥ 9♣ 2♠)',
    p1Hand: 'A♠ 4♦ (Plays K-K-9-9-A)',
    p2Hand: '7♥ 7♣ (Plays K-K-9-9-7)',
    ruling: 'Player 1 Wins: Board Pairs Counterfeit Pocket Sevens; Ace Kicker Plays',
  },
  {
    scenario: 'Board Broadway Straight (Board: A♠ K♦ Q♥ J♣ T♠)',
    p1Hand: '9♠ 8♠ (Plays A-K-Q-J-T)',
    p2Hand: 'A♥ 2♥ (Plays A-K-Q-J-T)',
    ruling: 'Exact Split Pot Chop: Only 5 Cards Play; Extra Pair Of Aces Does Not Count',
  },
  {
    scenario: 'Flush Tie-Breaker (Board: A♠ J♠ 9♠ 4♠ 2♦)',
    p1Hand: 'K♠ 3♣ (Plays A-K-J-9-4♠)',
    p2Hand: 'Q♠ T♠ (Plays A-Q-J-T-9♠)',
    ruling: 'Player 1 Wins: Flushes Compare Highest Unique Card Down From 1st To 5th',
  },
  {
    scenario: 'Full House Over Full House (Board: Q♠ Q♥ 8♦ 8♣ K♠)',
    p1Hand: 'Q♦ 2♣ (Plays Q-Q-Q-8-8)',
    p2Hand: 'K♥ K♦ (Plays K-K-K-Q-Q)',
    ruling: 'Player 2 Wins: Full Houses Compare The Three-Of-A-Kind Rank First',
  },
  {
    scenario: 'Wheel Straight Vs Aces (Board: A♣ 4♦ 3♥ 2♠ K♦)',
    p1Hand: '5♠ 5♣ (Plays 5-4-3-2-A)',
    p2Hand: 'A♠ Q♠ (Plays A-A-K-Q-4)',
    ruling: 'Player 1 Wins: Ace Plays Low To Complete A 5-High Straight Over One Pair',
  },
];

const WHO_WINS_FAQS = [
  {
    question: 'How Many Cards Play At Showdown In Texas Holdem?',
    answer:
      'In Texas Holdem, Exactly Five Cards Form Your Final Hand From Any Combination Of Your Two Hole Cards And The Five Community Board Cards (You May Use Both Hole Cards, One Hole Card, Or Zero Hole Cards And Play The Board). A Sixth Or Seventh Card Never Breaks A Tie.',
  },
  {
    question: 'What Does It Mean When Your Two Pair Gets Counterfeited?',
    answer:
      'If You Hold A Pocket Pair Or Bottom Two Pair And The Community Board Pairs A Higher Rank On The Turn Or River, Your Lower Pair Becomes A Non-Playing 6th And 7th Card. An Opponent With A Single Higher Kicker Then Wins Using The Two Higher Board Pairs Plus Their Kicker.',
  },
  {
    question: 'Do Suits Ever Break A Tie Between Identical Hands In Texas Holdem?',
    answer:
      'No. Under Official TDA And Robert Rules Of Poker, All Four Suits (Spades, Hearts, Diamonds, And Clubs) Have Equal Value At Showdown. Two Identical Straights Or Board Flushes Always Split The Pot Equally.',
  },
];

function parseCardList(str) {
  const tokens = String(str || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const cleanTok = tok.trim();
    if (cleanTok.length < 2) continue;
    const rankChar = cleanTok.slice(0, -1).toUpperCase() === '10' ? 'T' : cleanTok[0].toUpperCase();
    const suitChar = cleanTok[cleanTok.length - 1].toLowerCase();
    if (RANK_VALS[rankChar] && SUIT_SYMBOLS[suitChar]) {
      out.push({
        rank: rankChar,
        val: RANK_VALS[rankChar],
        suit: suitChar,
        display: `${rankChar}${SUIT_SYMBOLS[suitChar]}`,
      });
    }
  }
  return out;
}

function evaluate5CardHand(fiveCards) {
  const sorted = [...fiveCards].sort((a, b) => b.val - a.val);
  const vals = sorted.map((c) => c.val);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // Check Straight (including 5-4-3-2-A Wheel)
  const uniqueVals = [...new Set(vals)];
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueVals.length === 5) {
    if (vals[0] - vals[4] === 4) {
      isStraight = true;
      straightHigh = vals[0];
    } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Frequency counts
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, count]) => ({ val: Number(v), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  let category = 0;
  let categoryName = 'High Card';
  let tieBreakers = [];

  if (isFlush && isStraight) {
    category = 8;
    categoryName = straightHigh === 14 ? 'Royal Flush' : `${VAL_TO_NAME[straightHigh]}-High Straight Flush`;
    tieBreakers = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    categoryName = `Four Of A Kind, ${VAL_TO_NAME[groups[0].val]}s (${VAL_TO_NAME[groups[1].val]} Kicker)`;
    tieBreakers = [groups[0].val, groups[1].val];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    categoryName = `Full House, ${VAL_TO_NAME[groups[0].val]}s Full Of ${VAL_TO_NAME[groups[1].val]}s`;
    tieBreakers = [groups[0].val, groups[1].val];
  } else if (isFlush) {
    category = 5;
    categoryName = `${VAL_TO_NAME[vals[0]]}-High Flush (${vals.map((v) => VAL_TO_NAME[v]).join('-')})`;
    tieBreakers = vals;
  } else if (isStraight) {
    category = 4;
    categoryName = `${VAL_TO_NAME[straightHigh]}-High Straight${straightHigh === 5 ? ' (Wheel)' : ''}`;
    tieBreakers = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    categoryName = `Three Of A Kind, ${VAL_TO_NAME[groups[0].val]}s`;
    tieBreakers = [groups[0].val, groups[1].val, groups[2].val];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    categoryName = `Two Pair, ${VAL_TO_NAME[groups[0].val]}s And ${VAL_TO_NAME[groups[1].val]}s (${VAL_TO_NAME[groups[2].val]} Kicker)`;
    tieBreakers = [groups[0].val, groups[1].val, groups[2].val];
  } else if (groups[0].count === 2) {
    category = 1;
    categoryName = `One Pair Of ${VAL_TO_NAME[groups[0].val]}s (${VAL_TO_NAME[groups[1].val]} Kicker)`;
    tieBreakers = [groups[0].val, groups[1].val, groups[2].val, groups[3].val];
  } else {
    category = 0;
    categoryName = `${VAL_TO_NAME[vals[0]]} High`;
    tieBreakers = vals;
  }

  return {
    cards: sorted,
    category,
    categoryName,
    tieBreakers,
  };
}

function compareEvaluated(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tieBreakers.length, b.tieBreakers.length);
  for (let i = 0; i < len; i += 1) {
    const va = a.tieBreakers[i] || 0;
    const vb = b.tieBreakers[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function evaluateBest7CardHand(sevenCards) {
  if (sevenCards.length < 5) return null;
  let best = null;
  const n = sevenCards.length;
  for (let i = 0; i < n - 4; i += 1) {
    for (let j = i + 1; j < n - 3; j += 1) {
      for (let k = j + 1; k < n - 2; k += 1) {
        for (let l = k + 1; l < n - 1; l += 1) {
          for (let m = l + 1; m < n; m += 1) {
            const candidate = evaluate5CardHand([
              sevenCards[i],
              sevenCards[j],
              sevenCards[k],
              sevenCards[l],
              sevenCards[m],
            ]);
            if (!best || compareEvaluated(candidate, best) > 0) {
              best = candidate;
            }
          }
        }
      }
    }
  }
  return best;
}

export default function WhoWinsCalculatorPage() {
  const router = useRouter();
  const [boardInput, setBoardInput] = useState('Ks Kd 9h 9c 2s');
  const [p1Input, setP1Input] = useState('As 4d');
  const [p2Input, setP2Input] = useState('7h 7c');
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
    if (q.board) setBoardInput(String(q.board));
    if (q.p1) setP1Input(String(q.p1));
    if (q.p2) setP2Input(String(q.p2));
  }, [router.isReady, router.query]);

  const showdown = useMemo(() => {
    const boardCards = parseCardList(boardInput).slice(0, 5);
    const p1Cards = parseCardList(p1Input).slice(0, 2);
    const p2Cards = parseCardList(p2Input).slice(0, 2);

    if (boardCards.length < 5 || p1Cards.length < 2 || p2Cards.length < 2) {
      return {
        valid: false,
        winnerBanner: 'Enter 5 Valid Board Cards And 2 Hole Cards Per Player (E.G. Ks Kd 9h 9c 2s)',
      };
    }

    const best1 = evaluateBest7CardHand([...boardCards, ...p1Cards]);
    const best2 = evaluateBest7CardHand([...boardCards, ...p2Cards]);
    const cmp = compareEvaluated(best1, best2);

    const p1HandStr = best1.cards.map((c) => c.display).join(' ');
    const p2HandStr = best2.cards.map((c) => c.display).join(' ');

    let winnerBanner = 'Exact Split Pot Chop';
    let winnerColor = '#f2b84b';
    let rulingExplanation = `Both Players Play Identical 5-Card Ranks (${best1.categoryName}). Under Official TDA Rules, Only The Best 5 Cards Count And The Pot Is Split Equally.`;

    if (cmp > 0) {
      winnerBanner = 'Player 1 Wins The Pot';
      winnerColor = '#34d399';
      rulingExplanation =
        best1.category !== best2.category
          ? `Player 1 Wins With ${best1.categoryName} (${p1HandStr}), Which Ranks Higher Than Player 2's ${best2.categoryName} (${p2HandStr}).`
          : `Both Players Hold The Same Hand Category, But Player 1 Wins On Higher Rank/Kicker Tie-Breaker: ${best1.categoryName} (${p1HandStr}) Defeats ${best2.categoryName} (${p2HandStr}).`;
    } else if (cmp < 0) {
      winnerBanner = 'Player 2 Wins The Pot';
      winnerColor = '#25c8ff';
      rulingExplanation =
        best1.category !== best2.category
          ? `Player 2 Wins With ${best2.categoryName} (${p2HandStr}), Which Ranks Higher Than Player 1's ${best1.categoryName} (${p1HandStr}).`
          : `Both Players Hold The Same Hand Category, But Player 2 Wins On Higher Rank/Kicker Tie-Breaker: ${best2.categoryName} (${p2HandStr}) Defeats ${best1.categoryName} (${p1HandStr}).`;
    }

    return {
      valid: true,
      boardDisplay: boardCards.map((c) => c.display).join(' '),
      p1Display: p1Cards.map((c) => c.display).join(' '),
      p2Display: p2Cards.map((c) => c.display).join(' '),
      p1Best5: p1HandStr,
      p2Best5: p2HandStr,
      p1RankName: best1.categoryName,
      p2RankName: best2.categoryName,
      winnerBanner,
      winnerColor,
      rulingExplanation,
    };
  }, [boardInput, p1Input, p2Input]);

  const handleCopyScenarioLink = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    const shareUrl = `${window.location.origin}/tools/who-wins-calculator?board=${encodeURIComponent(boardInput)}&p1=${encodeURIComponent(p1Input)}&p2=${encodeURIComponent(p2Input)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const canonicalPath = '/tools/who-wins-calculator';
  const canonicalUrl = `https://smarter.poker${canonicalPath}`;
  const pageTitle = '"What Beats What?" Interactive Texas Hold\'em Showdown & Kicker Resolver';
  const pageDesc =
    'Resolve Any 7-Card Texas Holdem Showdown Dispute With Exact 5-Card Hand Evaluation, Kicker Tie-Breakers, Counterfeited Two-Pair Rulings, And Split Pot Checks.';

  const schema = useMemo(() => {
    return hubProductSchema({
      path: canonicalPath,
      name: pageTitle,
      description: pageDesc,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Poker Showdown & Kicker Resolver',
      trail: [
        ['Hub', '/hub'],
        ['Poker Tools', '/tools'],
        ['What Beats What Showdown Resolver', canonicalPath],
      ],
      faqs: WHO_WINS_FAQS,
      howTo: {
        name: 'How To Resolve A Texas Holdem Showdown And Kicker Tie-Breaker',
        description: pageDesc,
        steps: [
          {
            name: 'Enter The Five Community Board Cards Or Choose A Classic Dispute Preset',
            text: 'Type Five Community Cards Such As Ks Kd 9h 9c 2s Or Select One Of The Five Tricky Showdown Presets.',
          },
          {
            name: 'Input Player 1 And Player 2 Hole Cards',
            text: 'Enter Both Hole Cards For Player 1 And Player 2 Using Rank And Suit Shorthand.',
          },
          {
            name: 'Read The Exact Best 5-Card Hands And Official Floor Kicker Ruling',
            text: 'Verify Which 5 Cards Play For Each Seat And Whether One Player Wins Or The Pot Splits.',
          },
        ],
      },
    });
  }, [pageDesc]);

  const isEmbed = router.query?.embed === 'true';

  return (
    <div style={{ minHeight: isEmbed ? 'auto' : '100vh', background: '#020608', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <SEOHead
        title="What Beats What? Interactive Texas Hold'em Showdown & Kicker Resolver"
        description="Resolve Any 7-Card Texas Holdem Showdown Dispute With Exact 5-Card Hand Evaluation, Kicker Tie-Breakers, Counterfeited Two-Pair Rulings, And Split Pot Checks."
        canonical="/tools/who-wins-calculator"
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
              <span>What Beats What Showdown Resolver</span>
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
          What Beats What? Interactive Texas Holdem Showdown &amp; Kicker Resolver
        </h1>

        {!isEmbed && (
          <p style={{ fontSize: 16, lineHeight: 1.65, color: '#cbd5e1', margin: '0 0 28px 0' }}>
            <strong>Direct Answer:</strong> In Texas Holdem, Only The <strong>Best 5 Cards Out Of 7</strong> Count At Showdown. A 6th Or 7th Card Never Breaks A Tie, Suits Have Equal Rank, And Pairing The Board Higher Than Your Pocket Pair <strong>Counterfeits</strong> Your Lower Pair So The Highest Single Kicker Wins.
          </p>
        )}

        <section
          aria-label="Interactive Showdown And Kicker Resolver"
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
              Interactive 7-Card Showdown &amp; Kicker Evaluator
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

          {/* Preset Showdown Scenarios */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>
              Quick-Load Tricky Showdown Scenarios
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESET_SCENARIOS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setBoardInput(preset.board);
                    setP1Input(preset.p1);
                    setP2Input(preset.p2);
                  }}
                  style={{
                    padding: '7px 12px',
                    background: boardInput === preset.board ? '#25c8ff' : '#020608',
                    color: boardInput === preset.board ? '#020608' : '#e2e8f0',
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 22 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                5 Community Board Cards
                <input
                  type="text"
                  value={boardInput}
                  onChange={(e) => setBoardInput(e.target.value)}
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
                Player 1 Hole Cards
                <input
                  type="text"
                  value={p1Input}
                  onChange={(e) => setP1Input(e.target.value)}
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
                Player 2 Hole Cards
                <input
                  type="text"
                  value={p2Input}
                  onChange={(e) => setP2Input(e.target.value)}
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
          </div>

          {showdown.valid ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
                <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: `1px solid ${showdown.winnerColor}` }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>
                    Official Showdown Outcome
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: showdown.winnerColor, marginTop: 6 }}>
                    {showdown.winnerBanner}
                  </div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    Board: {showdown.boardDisplay}
                  </div>
                </div>

                <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 12, color: '#34d399', textTransform: 'uppercase' }}>
                    Player 1 Best 5-Card Hand ({showdown.p1Display})
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginTop: 6 }}>
                    {showdown.p1RankName}
                  </div>
                  <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                    Playing 5 Cards: {showdown.p1Best5}
                  </div>
                </div>

                <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 12, color: '#25c8ff', textTransform: 'uppercase' }}>
                    Player 2 Best 5-Card Hand ({showdown.p2Display})
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginTop: 6 }}>
                    {showdown.p2RankName}
                  </div>
                  <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>
                    Playing 5 Cards: {showdown.p2Best5}
                  </div>
                </div>
              </div>

              <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f2b84b', marginBottom: 4 }}>
                  Plain-English Floor Ruling &amp; Kicker Explanation
                </div>
                <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.55 }}>
                  {showdown.rulingExplanation}
                </div>
              </div>
            </>
          ) : (
            <div style={{ background: '#020608', padding: 16, borderRadius: '2px', border: '1px solid #f87171', color: '#f87171', fontWeight: 700 }}>
              {showdown.winnerBanner}
            </div>
          )}
        </section>

        {/* Reference Matrix */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Classic Showdown &amp; Kicker Dispute Reference Matrix
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
              <caption style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0', color: '#94a3b8' }}>
                Official 5-Card Showdown Rulings For Counterfeited Two Pairs, Board Straights, And Flush Kickers
              </caption>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#25c8ff', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '10px 14px' }}>Showdown Scenario</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Player 1 Hand</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Player 2 Hand</th>
                  <th scope="col" style={{ padding: '10px 14px' }}>Official Floor Ruling</th>
                </tr>
              </thead>
              <tbody>
                {SHOWDOWN_BENCHMARK_TABLE.map((row) => (
                  <tr key={row.scenario} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f8fafc' }}>{row.scenario}</td>
                    <td style={{ padding: '10px 14px', color: '#34d399', fontWeight: 700 }}>{row.p1Hand}</td>
                    <td style={{ padding: '10px 14px', color: '#25c8ff', fontWeight: 700 }}>{row.p2Hand}</td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{row.ruling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cross-Links */}
        <section style={{ marginBottom: 32, padding: 20, background: '#101a20', borderRadius: '2px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', margin: '0 0 12px 0' }}>
            Related Smarter.Poker Rules, Hand Rankings &amp; Equity Tools
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link href="/learn/poker-hand-rankings" style={{ padding: '8px 14px', background: '#25c8ff', color: '#020608', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Official Poker Hand Rankings Cheat Sheet
            </Link>
            <Link href="/tools/poker-odds-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#f2b84b', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              Multiway Poker Odds Calculator
            </Link>
            <Link href="/tools/side-pot-calculator" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              Multi-Way Side Pot Calculator
            </Link>
            <Link href="/rules" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              30 Official TDA Floor Rulings
            </Link>
            <Link href="/tools" style={{ padding: '8px 14px', background: '#020608', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '2px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              All 34 Poker Calculators
            </Link>
          </div>
        </section>

        {!isEmbed && (
          <>
            <FaqSection faqs={WHO_WINS_FAQS} />

            <CitationBacklinkBox
              title="What Beats What? Interactive Texas Hold'em Showdown & Kicker Resolver"
              canonicalUrl={canonicalUrl}
              badgeType="gto"
              badgeLabel="Showdown & Kicker Engine"
              badgeValue="7-Card Best-5 Evaluator"
              summary="Deterministic 7-Card Showdown Evaluator Resolving Counterfeited Two Pairs, Kicker Tie-Breakers, And Split Pot Chops."
              slug="who-wins-calculator"
            />

            <AiPromptLauncher
              title="What Beats What? Interactive Texas Hold'em Showdown & Kicker Resolver"
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
    const md = renderWhoWinsCalculatorMarkdown({
      board: query?.board,
      p1: query?.p1,
      p2: query?.p2,
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
