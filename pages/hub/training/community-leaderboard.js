/**
 * COMMUNITY LEADERBOARD — Global Training Rankings
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Global leaderboard with accuracy, sessions, streaks. Weekly and all-time.
 * Category-specific rankings with player profile previews.
 *
 * Route: /hub/training/community-leaderboard
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-7 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import useSWR, { useSWRConfig } from 'swr';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CATEGORIES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●


// BUG FIX (TRAIN-COMMUNITY-A11Y-1): SVG icon components replacing the
// community-leaderboard emojis. CATEGORIES gain iconKind discriminator;
// CategoryIcon renders by kind. Medal podium emojis (●●●) → SVG
// MedalIcon with rank-tinted color. ← back arrow → SVG. Same surface-
// specific a11y pattern as PR #320/#322/#324/#327-#355.
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
function TrophyIcon({ size=14 })  { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function CardsIcon({ size=14 })   { return <_Svg size={size}><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M8 5V3a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14"/></_Svg>; }
function TargetIcon({ size=14 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function FlameIcon({ size=14 })   { return <_Svg size={size}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z"/></_Svg>; }
function MedalIcon({ size=18 })   {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="14" r="7"/>
      <path d="M8.21 13.89 6 22l6-3 6 3-2.21-8.12"/>
      <path d="M9 7h6"/>
    </svg>
  );
}
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function CategoryIcon({ kind, size=14 }) {
  switch (kind) {
    case 'trophy': return <TrophyIcon size={size}/>;
    case 'cards':  return <CardsIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'flame':  return <FlameIcon size={size}/>;
    default:       return null;
  }
}

const CATEGORIES = [
  { id: 'overall', label: 'Overall', iconKind: 'trophy', icon: '★' },
  { id: 'preflop', label: 'Preflop', iconKind: 'cards', icon: '◇' },
  { id: 'postflop', label: 'Postflop', iconKind: 'target', icon: '◆' },
  { id: 'streaks', label: 'Streaks', iconKind: 'flame', icon: '▲' },
];

function getAvatarColor(str) {
  if (!str) return 'var(--sp-accent-cyan)';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function CommunityLeaderboardPage() {
  const router = useRouter();
  useTrainingBus('community-leaderboard');
  const [user, setUser] = useState(null);
  const [category, setCategory] = useState('overall');
  const [period, setPeriod] = useState('weekly');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getAuthUser();
    if (u) setUser(u);
  }, []);

  // Bus listener: auto-refresh leaderboard when a training session completes
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      mutate((key) => typeof key === 'string' && key.startsWith('/api/training/leaderboard'));
    });
    return unsub;
  }, [mutate]);

  // Fetch real leaderboard data
  const swrKey = `/api/training/leaderboard?period=${period === 'weekly' ? 'weekly' : 'alltime'}&limit=50`;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateLeaderboard } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error('Failed to load leaderboard');
        return data.leaderboard.map((entry) => ({
          id: entry.userId,
          name: entry.username || 'Anonymous',
          accuracy: entry.accuracy || 0,
          sessions: entry.sessionsCompleted || 0,
          hands: entry.questionsCorrect || 0, // Approx
          streak: entry.bestStreak || 0,
          avatarColor: getAvatarColor(entry.userId),
        }));
      })
  );

  // Sort and rank entries — score computed at render-time so it reflects the current category tab
  const entries = (swrData || [])
    .map((e) => ({ ...e, score: category === 'streaks' ? e.streak : e.accuracy }))
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ ...e, rank: i + 1, isYou: user?.id === e.id }));

  const userEntry = entries.find((e) => e.isYou);
  const topThree = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  if (!mounted) return null;

  return (
    <>
      <Head>
        <title>Leaderboard | Smarter.Poker GTO Training</title>
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
            {/* TRAIN-COMMUNITY-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-COMMUNITY-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Community Leaderboard</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Global GTO rankings</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Period Toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {['weekly', 'alltime'].map((p) => (
              <motion.button
                key={p}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setPeriod(p)}
                aria-label={p === 'weekly' ? 'Show weekly rankings' : 'Show all-time rankings'}
                aria-pressed={period === p}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: `1px solid ${period === p ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: period === p ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: period === p ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p === 'weekly' ? 'This Week' : 'All Time'}
              </motion.button>
            ))}
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto' }}>
            {CATEGORIES.map((c) => (
              <motion.button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                aria-label={`Filter by ${c.label}`}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCategory(c.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  flexShrink: 0,
                  border: `1px solid ${category === c.id ? 'rgba(251,191,36,0.2)' : 'transparent'}`,
                  background: category === c.id ? 'rgba(251,191,36,0.06)' : 'transparent',
                  color: category === c.id ? 'var(--sp-accent-amber)' : 'var(--sp-fg-dim)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {/* TRAIN-COMMUNITY-A11Y-1: SVG CategoryIcon */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }} aria-hidden>
                  <CategoryIcon kind={c.iconKind} size={12} /> {c.label}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Error State */}
          <ErrorBanner
            message={swrError ? 'Unable to load leaderboard data.' : null}
            onRetry={() => mutateLeaderboard()}
          />

          {/* Top 3 Podium */}
          {!loading && topThree.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 6,
                marginBottom: 20,
              }}
            >
              {[topThree[1], topThree[0], topThree[2]].map((p, i) => {
                const heights = [80, 100, 65];
                // TRAIN-COMMUNITY-A11Y-1: rank ordering for podium slots 0,1,2 = 2nd, 1st, 3rd
                const medalColors = ['#C0C0C0', '#FFD700', '#CD7F32'];
                const medalLabels = ['Second place', 'First place', 'Third place'];

                if (!p) return <div key={`empty-podium-${i}`} style={{ flex: 1 }} />;

                return (
                  <motion.div
                    key={p.id || `podium-slot-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '12px 6px',
                      borderRadius: 12,
                      height: heights[i],
                      background: p.isYou ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${p.isYou ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {/* TRAIN-COMMUNITY-A11Y-1: SVG medal replaces ●/●/● */}
                    <div style={{ fontSize: 18, marginBottom: 4, display: 'inline-flex', justifyContent: 'center', color: medalColors[i] }} role="img" aria-label={medalLabels[i]}>
                      <MedalIcon size={18} />
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        marginBottom: 2,
                        color: p.isYou ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-amber)' }}>{p.score}</div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Your Position */}
          {userEntry && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 16,
                background: 'rgba(0,212,255,0.04)',
                border: '1px solid rgba(0,212,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: 'rgba(0,212,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    color: 'var(--sp-accent-cyan)',
                  }}
                >
                  #{userEntry.rank}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-cyan)' }}>Your Rank</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sp-accent-cyan)' }}>
                {userEntry.score}
                {category !== 'streaks' ? '%' : 'd'}
              </div>
            </div>
          )}

          {/* Remaining Entries */}
          {!loading &&
            restEntries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  marginBottom: 4,
                  background: entry.isYou ? 'rgba(0,212,255,0.04)' : 'transparent',
                  border: `1px solid ${entry.isYou ? 'rgba(0,212,255,0.1)' : 'transparent'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 24,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--sp-fg-faint)',
                      textAlign: 'center',
                    }}
                  >
                    {entry.rank}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: entry.avatarColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#fff',
                    }}
                  >
                    {entry.name.charAt(0)}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: entry.isYou ? 800 : 600,
                        color: entry.isYou ? 'var(--sp-accent-cyan)' : 'var(--sp-fg)',
                      }}
                    >
                      {entry.name}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)' }}>
                      {entry.hands} hands · {entry.sessions} sessions
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color:
                      entry.score >= 80 ? 'var(--sp-accent-green)' : entry.score >= 65 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                  }}
                >
                  {entry.score}
                  {category !== 'streaks' ? '%' : 'd'}
                </div>
              </motion.div>
            ))}

          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="leaderboard" />
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}