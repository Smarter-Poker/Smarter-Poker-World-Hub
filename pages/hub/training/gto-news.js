/**
 * GTO NEWS FEED — Strategy Tips & Articles
 * ═══════════════════════════════════════════════════════════════════════════
 * Curated GTO tips and strategy content with category filters,
 * bookmarks, read tracking, article search, and daily tip rotation.
 *
 * Route: /hub/training/gto-news
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken } from '../../../src/lib/authUtils';

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
const CAT_ICONS = { Preflop: '🃏', Postflop: '🎯', Math: '🧮', Mental: '🧠' };
const CAT_COLORS = { Preflop: '#3b82f6', Postflop: '#22c55e', Math: '#fbbf24', Mental: '#a855f7' };

export default function GtoNewsPage() {
  const router = useRouter();
  useTrainingBus('gto-news');
  const [catFilter, setCatFilter] = useState('All');
  const [bookmarks, setBookmarks] = useState(new Set());
  const [readArticles, setReadArticles] = useState(new Set());
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  // Load saved state
  useEffect(() => {
    try {
      const savedBm = localStorage.getItem('gto-news-bookmarks');
      if (savedBm) setBookmarks(new Set(JSON.parse(savedBm)));
      const savedRead = localStorage.getItem('gto-news-read');
      if (savedRead) setReadArticles(new Set(JSON.parse(savedRead)));
    } catch {}
  }, []);

  // EventBus listener for cross-page reactivity
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'GtoNews') return;
    });
    return unsub;
  }, []);

  const toggleBookmark = (id) => {
    const next = new Set(bookmarks);
    next.has(id) ? next.delete(id) : next.add(id);
    setBookmarks(next);
    try {
      localStorage.setItem('gto-news-bookmarks', JSON.stringify([...next]));
    } catch {}
  };

  const markRead = (id) => {
    if (readArticles.has(id)) return;
    const next = new Set(readArticles);
    next.add(id);
    setReadArticles(next);
    try {
      localStorage.setItem('gto-news-read', JSON.stringify([...next]));
    } catch {}

    // Save read progress to Supabase every 5 articles
    if (next.size % 5 === 0) {
      const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
      if (token) {
        fetch('/api/training/save-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            gameId: 'gto-news',
            gameName: `GTO News (${next.size} articles read)`,
            gtowScore: Math.round((next.size / ARTICLES.length) * 100),
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
        }).catch(() => {});
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

  // Filtered and searched articles
  const filtered = useMemo(() => {
    let list = ARTICLES;
    if (catFilter !== 'All') list = list.filter((a) => a.cat === catFilter);
    if (showBookmarksOnly) list = list.filter((a) => bookmarks.has(a.id));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(s) || a.body.toLowerCase().includes(s)
      );
    }
    return list;
  }, [catFilter, search, showBookmarksOnly, bookmarks]);

  // Daily tip of the day
  const dayOfYear = Math.floor((Date.now() - new Date(2026, 0, 1)) / 86400000);
  const dailyTip = ARTICLES[dayOfYear % ARTICLES.length];

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
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
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
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: '#94a3b8',
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
            ←
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>GTO News</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {readArticles.size}/{ARTICLES.length} articles read
            </div>
          </div>
          <button
            onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
            style={{
              background: showBookmarksOnly ? 'rgba(251,191,36,0.1)' : 'transparent',
              border: `1px solid ${showBookmarksOnly ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6,
              padding: '4px 10px',
              color: showBookmarksOnly ? '#fbbf24' : '#64748b',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⭐ {bookmarks.size}
          </button>
        </div>

        <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Daily Tip Banner */}
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
              <span style={{ fontSize: 14 }}>💡</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#00d4ff',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Tip of the Day
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{dailyTip.title}</div>
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
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
                whileTap={{ scale: 0.95 }}
                onClick={() => setCatFilter(c)}
                style={{
                  flex: 1,
                  padding: '6px',
                  borderRadius: 6,
                  border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: catFilter === c ? '#00d4ff' : '#64748b',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c !== 'All' && <span style={{ marginRight: 4 }}>{CAT_ICONS[c]}</span>}
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
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(90deg, #00d4ff, #a855f7)',
                width: `${(readArticles.size / ARTICLES.length) * 100}%`,
                transition: 'width 0.3s',
              }}
            />
          </div>

          {/* Articles */}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#334155', fontSize: 13 }}>
              No articles match your filters.
            </div>
          )}
          {filtered.map((a, i) => (
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
              onClick={() => handleExpand(a.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{CAT_ICONS[a.cat]}</span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 3,
                      background: `${CAT_COLORS[a.cat]}12`,
                      color: CAT_COLORS[a.cat],
                      fontSize: 8,
                      fontWeight: 700,
                    }}
                  >
                    {a.cat}
                  </span>
                  {readArticles.has(a.id) && (
                    <span style={{ fontSize: 8, color: '#22c55e' }}>✓ read</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: '#334155' }}>{a.readTime}m</span>
                  <span style={{ fontSize: 9, color: '#334155' }}>{a.date}</span>
                  <motion.button
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
                    }}
                  >
                    {bookmarks.has(a.id) ? '⭐' : '☆'}
                  </motion.button>
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: readArticles.has(a.id) ? '#94a3b8' : '#e2e8f0',
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
                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7, paddingTop: 4 }}>
                      {a.body}
                    </div>
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
