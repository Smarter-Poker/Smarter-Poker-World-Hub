/**
 * GTO NEWS FEED — Strategy Tips & Articles
 * ═══════════════════════════════════════════════════════════════════════════
 * Curated GTO tips and strategy content with category filters,
 * bookmarks, read tracking, article search, and daily tip rotation.
 *
 * Route: /hub/training/gto-news
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-18 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-13 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-3d — adoption: shared empty-state primitive

// SAMPLE FALLBACK ONLY — these twenty tips are fixed editorial examples, not
// news. They are rendered (behind an explicit "Sample content" banner and a
// per-card SAMPLE badge) only when /api/news/articles returns no live strategy
// articles, so the page degrades to something useful instead of a blank list.
const ARTICLES = [
  {
    id: 1,
    cat: 'Preflop',
    title: 'Why 2.5x Is the Standard Open Size',
    body: 'Using a consistent 2.5x open raise prevents opponents from exploiting sizing tells. Larger opens from EP are outdated — they risk more for the same result. A 2.5x open gives you better pot odds on steals and keeps your range disguised.',
    date: '2026-03-09',
    readTime: 2,
  },
  {
    id: 2,
    cat: 'Postflop',
    title: 'Small C-Bet Strategy on Dry Boards',
    body: 'On boards like K♣7♦2♠, betting 33% pot at high frequency is optimal. Your range advantage as the preflop raiser means you can bet often with a small size. Villain must fold many hands that missed, and calling with marginal hands is unprofitable.',
    date: '2026-03-08',
    readTime: 2,
  },
  {
    id: 3,
    cat: 'Math',
    title: 'Understanding MDF in Practice',
    body: "If villain bets 75% pot, MDF = 1 - (0.75/1.75) = 57%. You must continue with 57% of your range. Folding more lets villain auto-profit with any two cards. Continuing less means you're exploitable.",
    date: '2026-03-07',
    readTime: 3,
  },
  {
    id: 4,
    cat: 'Mental',
    title: 'The 3-Second Rule for Tilt Prevention',
    body: 'After a bad beat, pause for 3 seconds before acting on the next hand. This microreset prevents impulsive plays driven by frustration. Professional players use breathing pauses between every decision — not just after losses.',
    date: '2026-03-06',
    readTime: 2,
  },
  {
    id: 5,
    cat: 'Preflop',
    title: '3-Betting Polarized vs Linear',
    body: 'Polarized 3-bet ranges (AA-QQ, AKs + bluffs like A5s-A2s) work best against tight openers. Linear ranges (AA down to JTs, AQo) work better against loose openers where you want to play for value with medium-strong hands.',
    date: '2026-03-05',
    readTime: 3,
  },
  {
    id: 6,
    cat: 'Postflop',
    title: 'Turn Overbets: When and Why',
    body: 'Overbet the turn when the card significantly favors your range. Example: You raised preflop, c-bet a K♠8♦3♥ flop, then an A♣ hits the turn. The Ace heavily favors your range. A 125-150% pot overbet extracts max value and puts pressure on capped ranges.',
    date: '2026-03-04',
    readTime: 3,
  },
  {
    id: 7,
    cat: 'Math',
    title: 'Breakeven Bluff Math Made Simple',
    body: 'For any bluff: Breakeven% = Risk / (Risk + Reward). Pot is $100, you bet $50: Breakeven = 50/150 = 33%. Villain only needs to fold 33% of the time for your bluff to profit. The larger you bet, the more folds you need.',
    date: '2026-03-03',
    readTime: 2,
  },
  {
    id: 8,
    cat: 'Mental',
    title: 'Pre-Session Warmup Routines',
    body: 'Top players spend 5-10 minutes reviewing their weakest spots before each session. Review 3 hands from your last session, do 10 flashcards, or run a quick warmup drill. This primes your brain for pattern recognition and reduces autopilot play.',
    date: '2026-03-02',
    readTime: 2,
  },
  {
    id: 9,
    cat: 'Postflop',
    title: 'Check-Raising the Flop as the BB',
    body: 'The BB should check-raise on flops that favor their range (low connected boards like 7♠6♥5♣). Use a mix of strong hands (sets, two pair) and draws (open-enders, flush draws) to stay balanced.',
    date: '2026-03-01',
    readTime: 2,
  },
  {
    id: 10,
    cat: 'Preflop',
    title: 'BTN vs Blinds: The Most Common Spot',
    body: 'The BTN should open ~45% of hands. SB should 3-bet ~12% and fold the rest (no flatting in many strategies). BB should defend wide — calling ~35% and 3-betting ~10%. This is the most fought-over pot in poker.',
    date: '2026-02-28',
    readTime: 3,
  },
  {
    id: 11,
    cat: 'Math',
    title: 'Combo Counting: Your Secret Weapon',
    body: 'There are 1,326 total starting hand combos. Pocket pairs: 6 combos each. Suited hands: 4 each. Offsuit: 12 each. When villain 4-bets, they might have AA(6)+KK(6)+AKs(4) = 16 combos. Knowing exact combos helps you calculate equity accurately.',
    date: '2026-02-27',
    readTime: 3,
  },
  {
    id: 12,
    cat: 'Mental',
    title: 'Bankroll Management for Training',
    body: 'Set a daily training time limit, not just a hand target. Quality degrades after 45-60 minutes for most players. Two 30-minute focused sessions beat one 90-minute unfocused grind. Track your accuracy by session to find your optimal duration.',
    date: '2026-02-26',
    readTime: 2,
  },
  {
    id: 13,
    cat: 'Postflop',
    title: 'River Bluff Selection: Use Blockers',
    body: "The best river bluffs block your opponent's calling range. Holding A♠ on a spade board blocks nut flushes (they can't have the nut flush if you hold the A♠). This means more of villain's range is medium-strength hands that can fold.",
    date: '2026-02-25',
    readTime: 3,
  },
  {
    id: 14,
    cat: 'Preflop',
    title: 'Defending Your Big-Blind Profitably',
    body: 'The BB gets the best pot odds to call preflop. Against a 2.5x open, you only need 28% equity to call. This means defending with a wide range of suited hands, connectors, and even hands like K4s, Q7s from the BB is often correct.',
    date: '2026-02-24',
    readTime: 2,
  },
  {
    id: 15,
    cat: 'Math',
    title: 'SPR Guide: Stack-to-Pot Ratio',
    body: 'SPR < 3: Commit with top pair+. SPR 3-7: Top pair is a call, not a raise. SPR > 10: Deep stack play — sets and draws become premium, top pair is a thin value hand. Always calculate SPR after the flop to guide your commitment decisions.',
    date: '2026-02-23',
    readTime: 3,
  },
  {
    id: 16,
    cat: 'Preflop',
    title: 'Squeeze Play Fundamentals',
    body: 'A squeeze play is a 3-bet after an open and one or more callers. Ideal spots: you are in the SB/BB, the open was from a loose position, and calls indicate capped ranges. Use a large sizing (4-5x the open) to deny pot odds to the field.',
    date: '2026-02-22',
    readTime: 3,
  },
  {
    id: 17,
    cat: 'Postflop',
    title: 'Donk Betting: When to Lead Into the Raiser',
    body: "Donk betting works on boards that heavily favor the caller's range. On 7♠6♠5♣ as the BB caller, you have more sets, two pairs, and straights than the raiser. Leading for 50-75% pot with your strongest hands and draws can be GTO-correct.",
    date: '2026-02-21',
    readTime: 3,
  },
  {
    id: 18,
    cat: 'Math',
    title: 'Pot Odds vs Implied Odds',
    body: 'Pot odds: current pot / cost to call. Implied odds: (current pot + expected future bets) / cost to call. With a set mine needing to hit 1 in 8 times, you need 7:1 implied odds. If effective stacks are 100BB and the open is 3BB, set mining is always profitable.',
    date: '2026-02-20',
    readTime: 3,
  },
  {
    id: 19,
    cat: 'Mental',
    title: 'Avoiding Results-Oriented Thinking',
    body: 'A correct fold that would have hit is NOT a mistake. A bad call that happens to win is NOT good play. Judge every decision by its expected value, not its outcome. Track your decisions separately from your results for true improvement.',
    date: '2026-02-19',
    readTime: 2,
  },
  {
    id: 20,
    cat: 'Preflop',
    title: 'Cold 4-Betting: The Nuclear Option',
    body: 'Cold 4-betting (4-betting without being the original 3-bettor) requires an ultra-premium range: AA, KK, and sometimes QQ/AKs. This move represents enormous strength and should be used sparingly — villain will fold everything except their strongest hands.',
    date: '2026-02-18',
    readTime: 2,
  },
];

const CATS = ['All', 'Preflop', 'Postflop', 'Math', 'Mental'];

// ── Live feed ───────────────────────────────────────────────────────────────
// /api/news/articles filters on poker_news.category. The category values used
// across the news hub are: tournament | news | strategy | industry. 'strategy'
// is the closest real category to this page's subject, so that is what we ask
// for — the API does not expose Preflop/Postflop/Math/Mental as categories.
const FEED_URL = '/api/news/articles?category=strategy&limit=50';
const jsonFetch = (url) => fetch(url).then((r) => r.json());

// The API stores ONE coarse category per row, so the four training topics that
// power the filter bar are derived client-side from keywords in the headline and
// body. This is a display-only tag: nothing is written back, and an article that
// matches no topic is left untagged (no pill, reachable only under "All") rather
// than being guessed into a bucket.
const TOPIC_KEYWORDS = {
  Preflop: ['preflop', 'pre-flop', 'open raise', 'opening range', 'rfi', '3-bet', '3bet', 'three-bet', '4-bet', '4bet', 'squeeze', 'limp', 'button', 'big blind', 'small blind', 'cold call', 'cutoff'],
  Postflop: ['postflop', 'post-flop', 'flop', 'turn', 'river', 'c-bet', 'cbet', 'continuation bet', 'check-raise', 'check raise', 'donk', 'overbet', 'board texture', 'blocker'],
  Math: ['equity', 'pot odds', 'implied odds', 'expected value', 'combo', 'combinatoric', 'mdf', 'minimum defense', 'spr', 'stack-to-pot', 'variance', 'frequency', 'solver', 'range advantage'],
  Mental: ['tilt', 'mental game', 'mindset', 'bankroll', 'discipline', 'routine', 'confidence', 'emotion', 'burnout', 'focus', 'motivation'],
};

// Each keyword must start on a word boundary but may carry any suffix, so
// "3-betting"/"overbets"/"blockers" still match while "return" does NOT count
// as "turn" and "combination" does not count as "combo".
const TOPIC_MATCHERS = Object.keys(TOPIC_KEYWORDS).map((topic) => ({
  topic,
  patterns: TOPIC_KEYWORDS[topic].map(
    (word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
  ),
}));

function deriveTopic(title, body) {
  const hay = `${title || ''} ${body || ''}`.toLowerCase();
  if (!hay.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const { topic, patterns } of TOPIC_MATCHERS) {
    const score = patterns.reduce((n, re) => (re.test(hay) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return bestScore > 0 ? best : null;
}

// Map a poker_news row onto the card shape this page has always rendered.
// Dates stay as a plain YYYY-MM-DD slice (no locale formatting) so they match
// the sample rows and can never differ between server and client.
function toCardArticle(row) {
  const body = (row?.content || '').replace(/\s+/g, ' ').trim();
  const words = body ? body.split(' ').length : 0;
  return {
    id: row.id,
    cat: deriveTopic(row?.title, body),
    title: row?.title || 'Untitled',
    body,
    date: row?.published_at ? String(row.published_at).slice(0, 10) : '',
    readTime: row?.read_time || Math.max(1, Math.round(words / 200)) || 1,
    source: row?.source_name || null,
    isSample: false,
  };
}

const SAMPLE_ITEMS = ARTICLES.map((a) => ({ ...a, source: null, isSample: true }));

// BUG FIX (TRAIN-NEWS-A11Y-1): SVG icon components replacing the GTO news
// emoji set (🃏 Preflop / 🎯 Postflop / 🧮 Math / 🧠 Mental category icons,
// 💡 tip banner, ⭐/☆ bookmark toggle, ✓ read indicator, ← back). Same
// surface-specific a11y pattern as PR #320/#322/#324/#327/#328/#329/#330/
// #331/#332/#333/#334/#335/#336/#337/#338.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=14, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function CardsIcon({ size=14 })   { return <_Svg size={size}><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M8 5V3a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14"/></_Svg>; }
function TargetIcon({ size=14 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function AbacusIcon({ size=14 })  { return <_Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="7" cy="6" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="9" cy="18" r="1"/></_Svg>; }
function BrainIcon({ size=14 })   { return <_Svg size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_Svg>; }
function LightbulbIcon({ size=14 }) { return <_Svg size={size}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z"/></_Svg>; }
function CheckIcon({ size=12 })   { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size=18 }) { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function StarToggleIcon({ filled=false, size=14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
         fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function CategoryIcon({ cat, size=14 }) {
  switch (cat) {
    case 'Preflop':  return <CardsIcon size={size}/>;
    case 'Postflop': return <TargetIcon size={size}/>;
    case 'Math':     return <AbacusIcon size={size}/>;
    case 'Mental':   return <BrainIcon size={size}/>;
    default:         return null;
  }
}

const CAT_COLORS = { Preflop: 'var(--sp-accent-blue)', Postflop: 'var(--sp-accent-green)', Math: 'var(--sp-accent-amber)', Mental: 'var(--sp-accent-purple)' };
// Tinted pill backgrounds. The old `${CAT_COLORS[cat]}12` hex-alpha concat broke
// when CAT_COLORS moved to var() tokens (produced invalid `var(...)12`), so the
// tint is derived from the same tokens via color-mix instead.
const CAT_COLORS_BG = {
  Preflop: 'color-mix(in srgb, var(--sp-accent-blue) 8%, transparent)',
  Postflop: 'color-mix(in srgb, var(--sp-accent-green) 8%, transparent)',
  Math: 'color-mix(in srgb, var(--sp-accent-amber) 8%, transparent)',
  Mental: 'color-mix(in srgb, var(--sp-accent-purple) 8%, transparent)',
};

export default function GtoNewsPage() {
  const router = useRouter();
  useTrainingBus('gto-news');
  const [catFilter, setCatFilter] = useState('All');
  const [bookmarks, setBookmarks] = useState(new Set());
  const [readArticles, setReadArticles] = useState(new Set());
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // Live strategy articles. SWR keeps the request cached across navigation and
  // revalidates on focus, so the page is no longer a frozen hardcoded list.
  const { data: feedData, error: feedError, isLoading: feedLoading } = useSWR(FEED_URL, jsonFetch);
  const liveItems = useMemo(() => {
    const rows = feedData?.success && Array.isArray(feedData.data) ? feedData.data : [];
    return rows.filter((r) => r && r.id && r.title).map(toCardArticle);
  }, [feedData]);

  // Sample content is shown ONLY once the request has settled with nothing to
  // show (empty result or a failed fetch) — never while the first load is in
  // flight, and never mixed in alongside real articles.
  const settled = !feedLoading && (feedData !== undefined || feedError !== undefined);
  const usingSample = settled && liveItems.length === 0;
  const items = usingSample ? SAMPLE_ITEMS : liveItems;
  const showLoading = !settled && liveItems.length === 0;

  // Load saved state
  useEffect(() => {
    try {
      const savedBm = localStorage.getItem('gto-news-bookmarks');
      if (savedBm) setBookmarks(new Set(JSON.parse(savedBm)));
      const savedRead = localStorage.getItem('gto-news-read');
      if (savedRead) setReadArticles(new Set(JSON.parse(savedRead)));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  const toggleBookmark = (id) => {
    const next = new Set(bookmarks);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setBookmarks(next);
    try {
      localStorage.setItem('gto-news-bookmarks', JSON.stringify([...next]));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  const markRead = (id) => {
    if (readArticles.has(id)) return;
    const next = new Set(readArticles);
    next.add(id);
    setReadArticles(next);
    try {
      localStorage.setItem('gto-news-read', JSON.stringify([...next]));
    } catch (e) { console.warn('[App] Handled exception:', e); }

    // Save read progress to Supabase every 5 articles
    if (next.size % 5 === 0) {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (token) {
        authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({
            gameId: 'gto-news',
            gameName: `GTO News (${next.size} articles read)`,
            // Tag so stats aggregators can exclude reading progress from
            // real training accuracy/leaderboard numbers.
            sessionType: 'reading',
            // Denominator is the list actually on screen (live feed, or the
            // sample set when the feed is empty); guarded so an empty list
            // can never divide by zero, and capped because `next.size` counts
            // every article ever read, including ones since rotated out.
            gtowScore: Math.min(100, Math.round((next.size / (items.length || ARTICLES.length)) * 100)),
            totalEVLoss: 0,
            handsPlayed: next.size,
            mistakeCount: 0,
            accuracy: 100,
            correctCount: next.size,
            bestStreak: 0,
            levelPassed: true,
            level: 1,
            handHistory: [],
          }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
        eventBus?.emit?.(
          EventType?.SESSION_END || 'session:end',
          { gameId: 'gto-news', articlesRead: next.size },
          'GtoNews'
        );
      }
    }
  };

  const handleExpand = (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    markRead(id);
  };

  // TRAIN-NEWS-A11Y: keyboard activation for the clickable article cards
  const handleCardKeyDown = (e, id) => {
    // Ignore keys bubbling up from nested controls (e.g. the bookmark button),
    // otherwise preventDefault() here cancels their own keyboard activation.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handleExpand(id);
    }
  };

  // Filtered and searched articles
  const filtered = useMemo(() => {
    let list = items;
    if (catFilter !== 'All') list = list.filter((a) => a.cat === catFilter);
    if (showBookmarksOnly) list = list.filter((a) => bookmarks.has(a.id));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (a) => (a.title || '').toLowerCase().includes(s) || (a.body || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [items, catFilter, search, showBookmarksOnly, bookmarks]);

  // Progress is measured against the articles currently on screen, so a
  // long-lived read history can never push the bar past 100%.
  const readCount = useMemo(() => items.filter((a) => readArticles.has(a.id)).length, [items, readArticles]);
  const readPct = items.length ? Math.round((readCount / items.length) * 100) : 0;

  // Daily tip of the day. The day index is computed client-side after mount so
  // SSR and hydration never disagree across midnight/timezone boundaries, with
  // a safe modulo so a skewed clock (before the epoch) can't index negatively.
  // Until it resolves (and before the feed lands) the first item is used.
  const [dayIndex, setDayIndex] = useState(null);
  useEffect(() => {
    setDayIndex(Math.floor((Date.now() - new Date(2026, 0, 1).getTime()) / 86400000));
  }, []);
  const dailyTip = useMemo(() => {
    if (items.length === 0) return null;
    if (dayIndex === null) return items[0];
    return items[((dayIndex % items.length) + items.length) % items.length];
  }, [items, dayIndex]);

  return (
    <>
      <Head>
        <title>GTO News | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Stay sharp with daily GTO strategy tips covering preflop ranges, postflop play, poker math, and mental game."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* TRAIN-NEWS-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div style={{ flex: 1 }}>
            {/* TRAIN-NEWS-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>GTO News</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }} role="status" aria-label={`${readCount} of ${items.length} articles read`}>
              {readCount}/{items.length} articles read
            </div>
          </div>
          <button
            type="button"
            aria-label={showBookmarksOnly ? 'Show all articles' : 'Show only bookmarked articles'}
            aria-pressed={showBookmarksOnly}
            onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
            style={{
              background: showBookmarksOnly ? 'rgba(251,191,36,0.1)' : 'transparent',
              border: `1px solid ${showBookmarksOnly ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6,
              padding: '4px 10px',
              color: showBookmarksOnly ? 'var(--sp-accent-amber)' : 'var(--sp-fg-dim)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {/* TRAIN-NEWS-A11Y-1: SVG star filled */}
              <StarToggleIcon filled size={12} /> {bookmarks.size}
            </span>
          </button>
        </div>

        <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Sample-content notice — only when the live feed came back empty.
              The list below is fixed example material, so say so plainly
              instead of letting it read as current news. */}
          {usingSample && (
            <div
              role="note"
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                marginBottom: 16,
                background: 'rgba(251,191,36,0.06)',
                border: '1px solid rgba(251,191,36,0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'var(--sp-accent-amber)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Sample content
              </div>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, marginTop: 4 }}>
                {feedError
                  ? 'Live strategy articles could not be loaded right now.'
                  : 'No live strategy articles are available right now.'}{' '}
                The tips below are fixed examples for reference — not current news.
              </div>
            </div>
          )}

          {/* Daily Tip Banner */}
          {dailyTip && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(0,212,255,0.04), rgba(168,85,247,0.04))',
                border: '1px solid rgba(0,212,255,0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {/* TRAIN-NEWS-A11Y-1: SVG lightbulb */}
                <span style={{ display: 'inline-flex', color: 'var(--sp-accent-amber)' }} aria-hidden><LightbulbIcon size={14} /></span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--sp-accent-cyan)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {usingSample ? 'Sample Tip' : 'Tip of the Day'}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>{dailyTip.title}</div>
            </div>
          )}

          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search GTO news articles"
            placeholder="Search articles..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 13,
              outline: 'none',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />

          {/* Category Filters */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {CATS.map((c) => (
              <motion.button
                key={c}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setCatFilter(c)}
                aria-pressed={catFilter === c}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: 6,
                  border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: catFilter === c ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {/* TRAIN-NEWS-A11Y-1: SVG CategoryIcon replaces emoji */}
                {c !== 'All' && <span style={{ marginRight: 4, display: 'inline-flex', verticalAlign: 'middle' }} aria-hidden><CategoryIcon cat={c} size={12} /></span>}
                {c}
              </motion.button>
            ))}
          </div>

          {/* Progress */}
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.05)',
              marginBottom: 16,
            }}
            role="progressbar"
            aria-label="Reading progress"
            aria-valuenow={readPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(90deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-purple-rgb), 1))',
                width: `${readPct}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>

          {/* Articles */}
          {showLoading && (
            <div
              role="status"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--sp-fg-dim)',
              }}
            >
              Loading strategy articles...
            </div>
          )}
          {!showLoading && filtered.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No articles match"
              message="Try a different filter combination."
              compact
            />
          )}
          {!showLoading && filtered.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                marginBottom: 8,
                background: readArticles.has(a.id) ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.25)',
                border: `1px solid ${readArticles.has(a.id) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer',
              }}
              role="button"
              tabIndex={0}
              aria-expanded={expanded === a.id}
              aria-label={`${a.title}${a.isSample ? ' (sample content)' : ''}${readArticles.has(a.id) ? ' (read)' : ''}`}
              onKeyDown={(e) => handleCardKeyDown(e, a.id)}
              onClick={() => handleExpand(a.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Topic tag is derived, so it is shown only when one was
                      actually matched — never invented for an untagged item. */}
                  {a.cat && (
                    <>
                      {/* TRAIN-NEWS-A11Y-1: SVG CategoryIcon */}
                      <span style={{ display: 'inline-flex', color: 'var(--sp-fg-muted)' }} aria-hidden><CategoryIcon cat={a.cat} size={14} /></span>
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 3,
                          background: CAT_COLORS_BG[a.cat] || 'rgba(255,255,255,0.06)',
                          color: CAT_COLORS[a.cat],
                          fontSize: 8,
                          fontWeight: 700,
                        }}
                      >
                        {a.cat}
                      </span>
                    </>
                  )}
                  {a.isSample && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: 'rgba(251,191,36,0.1)',
                        color: 'var(--sp-accent-amber)',
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      SAMPLE
                    </span>
                  )}
                  {readArticles.has(a.id) && (
                    <span style={{ fontSize: 8, color: 'var(--sp-accent-green)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      {/* TRAIN-NEWS-A11Y-1: SVG check */}
                      <CheckIcon size={8} /> read
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>{a.readTime}m</span>
                  <span style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>{a.date}</span>
                  <motion.button
                    type="button"
                    aria-label={bookmarks.has(a.id) ? `Remove bookmark: ${a.title}` : `Bookmark article: ${a.title}`}
                    aria-pressed={bookmarks.has(a.id)}
                    whileTap={{ scale: 0.8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBookmark(a.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 0,
                      display: 'inline-flex',
                      color: bookmarks.has(a.id) ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)',
                    }}
                  >
                    {/* TRAIN-NEWS-A11Y-1: SVG bookmark star */}
                    <StarToggleIcon filled={bookmarks.has(a.id)} size={14} />
                  </motion.button>
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: readArticles.has(a.id) ? 'var(--sp-fg-muted)' : 'var(--sp-fg)',
                  marginBottom: expanded === a.id ? 8 : 0,
                }}
              >
                {a.title}
              </div>
              <AnimatePresence>
                {expanded === a.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.7, paddingTop: 4 }}>
                      {a.body || 'No preview text was published for this article.'}
                    </div>
                    {/* Attribution + deep link for real feed items. stopPropagation
                        keeps the link from also toggling the card. */}
                    {!a.isSample && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10,
                          marginTop: 8,
                          fontSize: 10,
                          color: 'var(--sp-fg-faint)',
                        }}
                      >
                        {a.source && <span>Source: {a.source}</span>}
                        <a
                          href={`/hub/article?id=${encodeURIComponent(a.id)}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'var(--sp-accent-cyan)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          Read full article
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </>
  );
}
