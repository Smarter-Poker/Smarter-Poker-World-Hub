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
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import useSWR, { useSWRConfig } from 'swr';



import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
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
function DiamondIcon({ size=14 }) { return <_Svg size={size}><path d="m12 2 8 7-8 13L4 9l8-7Z"/><path d="m4 9 8 4 8-4"/></_Svg>; }
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
function CategoryIcon({ kind, size=14 }) {
  switch (kind) {
    case 'trophy': return <TrophyIcon size={size}/>;
    case 'cards':  return <CardsIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'flame':  return <FlameIcon size={size}/>;
    case 'diamond': return <DiamondIcon size={size}/>;
    default:       return null;
  }
}

const CATEGORIES = [
  { id: 'overall', label: 'Overall', iconKind: 'trophy', icon: '★' },
  { id: 'cash', label: 'Cash', iconKind: 'cards', icon: '◇' },
  { id: 'mtt', label: 'MTT', iconKind: 'trophy', icon: '◆' },
  { id: 'spins', label: 'Spins', iconKind: 'target', icon: '▲' },
  { id: 'psychology', label: 'Psychology', iconKind: 'flame', icon: '▲' },
  { id: 'advanced', label: 'Advanced', iconKind: 'diamond', icon: '◆' },
];

function getAvatarColor(str) {
  if (!str) return 'var(--sp-accent-cyan)';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  // Steel-blue family only (#SMARTERDESIGN): identity by lightness, never a rainbow hue.
  return `hsl(${200 + (Math.abs(hash) % 25)}, ${40 + (Math.abs(hash) % 20)}%, ${28 + (Math.abs(hash) % 18)}%)`;
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
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    const u = getAuthUser();
    if (u) setUser(u);
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine !== false);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
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
  const categoryParam = category === 'overall' ? '' : `&category=${category}`;
  const swrKey = `/api/training/leaderboard?period=${period === 'weekly' ? 'weekly' : 'alltime'}&limit=50${categoryParam}`;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateLeaderboard } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error('Failed to load leaderboard');
        return {
          entries: data.leaderboard.map((entry) => ({
            id: entry.userId,
            rank: entry.rank,
            name: entry.username || 'Anonymous',
            accuracy: entry.accuracy || 0,
            sessions: entry.sessionsCompleted || 0,
            correctAnswers: entry.questionsCorrect || 0,
            avatarColor: getAvatarColor(entry.userId),
          })),
          myRank: data.myRank ?? null,
          myEntry: data.myEntry || null,
        };
      })
  );

  // Ranking and category membership are server-owned. The browser must not
  // re-rank a truncated page or pretend that one overall data set represents
  // several different leaderboards.
  const entries = (swrData?.entries || []).map((entry) => ({
    ...entry,
    score: entry.accuracy,
    isYou: user?.id === entry.id,
  }));

  const listedUserEntry = entries.find((entry) => entry.isYou);
  const userEntry = listedUserEntry || (swrData?.myEntry && swrData?.myRank
    ? {
        id: swrData.myEntry.userId,
        rank: swrData.myRank,
        score: swrData.myEntry.accuracy || 0,
      }
    : null);
  const topThree = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  // AEO phase 3 (2026-09-18): the head used to sit below this guard. The
  // guard is true on the server, so the branch a crawler always takes
  // returned nothing and the page served a 200 with no title and zero
  // words. The head is hoisted above it and returned from it, so the page
  // says what it is before it says it is still loading.
  // It also only had a bare <title>. The shared wrapper adds the
  // description, the canonical and the robots line every other page has.
  const pageHead = (
    <SEOHead
      title="GTO Training Community Leaderboard"
      description="Where You Stand Against Everyone Else Training On Smarter.Poker: Accuracy, Volume And Streaks Across The Whole Community, Updated As Sessions Are Graded."
      canonical="/hub/training/community-leaderboard"
    />
  );

  if (!mounted) {
    return (
      <>
        {pageHead}
        <HubPageSummary page="training-community-leaderboard" />
      </>
    );
  }

  return (
    <>
      {pageHead}
      <div className={`sp-training-intelligence sp-training-intelligence--community ${sd.root}`}>
        <TrainingPageHead slug="training-community-leaderboard" note="Global GTO Rankings" />

        <div className={`sp-intelligence-main ${sd.main}`}>
          {!isOnline && (
            <div role="status" data-offline-banner="true" className={sd.notice}>
              Offline. Community Leaderboard Rankings Will Resume After Reconnection.
            </div>
          )}

          {/* Period Toggle */}
          <div className={`${sd.chips} ${sd.chipsEven}`} role="group" aria-label="Ranking Period">
            {['weekly', 'alltime'].map((p) => (
              <motion.button
                key={p}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setPeriod(p)}
                aria-label={p === 'weekly' ? 'Show weekly rankings' : 'Show all-time rankings'}
                aria-pressed={period === p}
                className={sd.chip}
              >
                {p === 'weekly' ? 'This Week' : 'All Time'}
              </motion.button>
            ))}
          </div>

          {/* Category Tabs: a wrapping row so every category stays visible. */}
          <div className={`${sd.chips} ${sd.chipsThree}`} role="group" aria-label="Leaderboard Category">
            {CATEGORIES.map((c) => (
              <motion.button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                aria-label={`Filter by ${c.label}`}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCategory(c.id)}
                className={sd.chip}
              >
                {/* TRAIN-COMMUNITY-A11Y-1: SVG CategoryIcon */}
                <CategoryIcon kind={c.iconKind} size={14} />
                <span>{c.label}</span>
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
            <div className={sd.podium}>
              {[topThree[1], topThree[0], topThree[2]].map((p, i) => {
                // TRAIN-COMMUNITY-A11Y-1: rank ordering for podium slots 0,1,2 = 2nd, 1st, 3rd
                const medalLabels = ['Second place', 'First place', 'Third place'];
                const podiumPlace = ['second', 'first', 'third'][i];

                if (!p) return <div key={`empty-podium-${i}`} />;

                return (
                  <motion.div
                    key={p.id || `podium-slot-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`${sd.card} ${sd.podiumSlot}`}
                    data-place={podiumPlace}
                    data-tone={p.isYou ? 'ice' : undefined}
                  >
                    {/* TRAIN-COMMUNITY-A11Y-1: SVG medal */}
                    <span className={sd.podiumMedal} role="img" aria-label={medalLabels[i]}>
                      <MedalIcon size={20} />
                    </span>
                    <span className={`${sd.podiumName} ${p.isYou ? sd.ice : ''}`}>{p.name}</span>
                    <span className={sd.value}>{p.score}</span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Your Position */}
          {userEntry && (
            <div className={`${sd.card} ${sd.row}`} data-tone="ice">
              <div className={sd.inline}>
                <span className={sd.rankChip}>#{userEntry.rank}</span>
                <span className={`${sd.title} ${sd.ice}`}>Your Rank</span>
              </div>
              <span className={sd.value}>
                {userEntry.score}
                %
              </span>
            </div>
          )}

          {/* Remaining Entries */}
          {!loading && restEntries.length > 0 && (
            <div className={sd.list}>
              {restEntries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`${sd.card} ${sd.rankRow}`}
                  data-tone={entry.isYou ? 'ice' : undefined}
                >
                  <span className={sd.rankNumber}>{entry.rank}</span>
                  <span className={sd.avatar} style={{ background: entry.avatarColor }} aria-hidden>
                    {entry.name.charAt(0)}
                  </span>
                  <span className={sd.rankIdentity}>
                    <span className={`${sd.title} ${entry.isYou ? sd.ice : ''}`}>{entry.name}</span>
                    <span className={sd.skillNodeHint}>
                      {entry.correctAnswers} Correct Answers · {entry.sessions} Sessions
                    </span>
                  </span>
                  <span className={`${sd.value} ${entry.score >= 80 ? sd.good : entry.score >= 65 ? sd.ice : sd.muted}`}>
                    {entry.score}
                    %
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {loading && (
            <TrainingConsoleSkeleton label="Loading Rankings" panels={4} rows={1} />
          )}
        </div>
      </div>
      <HubPageSummary page="training-community-leaderboard" />
      <ConnectionToast />
    </>
  );
}
