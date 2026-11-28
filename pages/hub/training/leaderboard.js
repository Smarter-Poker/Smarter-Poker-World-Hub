/**
 * Training Leaderboard Page
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Global and friend leaderboards for training performance
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-27 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-10 — hex sweep batch 6: extended palette literals routed
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-4a — adoption: shared empty-state primitive
import { useSWRConfig } from 'swr';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import sd from '../../../src/styles/training/training-smarterdesign.module.css';
import {
  TRAINING_LEADERBOARD_DEFAULT_KEY,
  fetchPublicTrainingLeaderboardSeed,
  requestOrigin,
} from '../../../src/lib/training/publicLeaderboardSeed.mjs';


// A Googlebot crawl measured this page at 130 words because the rankings
// loaded only in the browser. The server now reads the same anonymous API a
// signed-out visitor's browser reads, keeps only the public fields, and the
// page renders the default board from it. The browser still owns refresh,
// timeframes and categories.
export async function getServerSideProps({ req, res }) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  const seed = await fetchPublicTrainingLeaderboardSeed(requestOrigin(req));
  return { props: { seed } };
}

const TIMEFRAMES = [
  { id: 'daily', label: 'Daily', aria: 'Show daily rankings' },
  { id: 'weekly', label: 'Weekly', aria: 'Show weekly rankings' },
  { id: 'all-time', label: 'All Time', aria: 'Show all-time rankings' },
];

const CATEGORIES = [
  { id: 'global', label: 'All Games' },
  { id: 'mtt', label: 'MTT' },
  { id: 'cash', label: 'Cash' },
  { id: 'spins', label: 'Spins' },
  { id: 'psychology', label: 'Mental Game' },
  { id: 'advanced', label: 'Poker Strategy' },
];

const LEADERBOARD_HELP = (
  <>
    <p>Rankings Come From Verified Training Answers. Choose Daily, Weekly Or All Time, Then Pick A Game Category To Narrow The Board.</p>
    <p>Each Row Shows The Questions Answered, The Accuracy Across Them And The Number Answered Correctly. The Board Refreshes When You Finish A Training Session.</p>
  </>
);

export default function TrainingLeaderboard({ seed = null }) {
  const router = useRouter();
  useTrainingBus('training-leaderboard');
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const { filters, setFilter } = usePersistedFilters('training-leaderboard', {
    timeframe: 'all-time',
    view: 'global',
  });
  const timeframe = filters.timeframe;
  const view = filters.view;
  const setTimeframe = (val) => setFilter('timeframe', val);
  const setView = (val) => setFilter('view', val);

  // Load auth user once
  useEffect(() => {
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

  // Map timeframe to API period format
  const periodMap = { daily: 'daily', weekly: 'weekly', 'all-time': 'alltime' };
  const period = periodMap[timeframe] || 'alltime';

  // SWR-backed leaderboard fetch — cached 60s, instant on timeframe/category switch
  const categoryParam = view && view !== 'global' ? `&category=${view}` : '';
  const swrKey = `/api/training/leaderboard?period=${period}&limit=100${categoryParam}`;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateLeaderboard } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed to load leaderboard');
        return {
          leaderboard: data.leaderboard,
          myRank: data.myRank,
          myEntry: data.myEntry,
        };
      }),
    // Handed straight to the hook, and only for the key the server fetched.
    swrKey === TRAINING_LEADERBOARD_DEFAULT_KEY && seed ? { fallbackData: seed } : undefined
  );
  const leaderboard = swrData?.leaderboard || [];
  const userRank = user ? swrData?.myRank ?? null : null;

  return (
    <PageTransition disableInitialAnimation>
      <SEOHead
        title="Training Leaderboard - Top Students"
        description="The GTO Training Leaderboard On Smarter.Poker, Ranked On Decision Accuracy Against The Solver Baseline Rather Than On Volume, With The Sample Each Score Was Measured Over. Free To Appear On."
        canonical="/hub/training/leaderboard"
      />

      <div className={sd.shell}>
        <UniversalHeader pageDepth={2} />

        <div className={sd.page}>
          <TrainingPageHead
            slug="training-leaderboard"
            title="Training Leaderboard"
            helpContent={LEADERBOARD_HELP}
          />

          {!isOnline && (
            <p role="status" data-offline-banner="true" className={sd.offline}>
              Offline Mode Detected: Local Horse Brain Spot Evaluation Remains Active While Verified Leaderboard Sync Waits For Reconnection.
            </p>
          )}

          {/* Filters */}
          <section className={`sd-panel ${sd.panel}`} aria-label="Leaderboard Filters">
            <div className={sd.segmented} role="group" aria-label="Timeframe">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="sd-button"
                  onClick={() => setTimeframe(t.id)}
                  aria-label={t.aria}
                  aria-pressed={timeframe === t.id}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <hr className={sd.rule} />
            {/* Category filter */}
            <div className={sd.chips} role="group" aria-label="Game Category">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className="sd-button"
                  onClick={() => setView(cat.id)}
                  aria-label={`Show ${cat.label} category`}
                  aria-pressed={view === cat.id}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </section>

          <ErrorBanner
            message={swrError ? 'Unable to load leaderboard data.' : null}
            onRetry={() => mutateLeaderboard()}
          />

          {/* User Rank */}
          {user && userRank && (
            <div className={sd.metrics} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <div className={`sd-metric ${sd.metric}`}>
                <span className={sd.metricLabel}>Your Rank</span>
                <strong className={sd.metricValue} data-tone="ice">#{userRank}</strong>
              </div>
              <div className={`sd-metric ${sd.metric}`}>
                <span className={sd.metricLabel}>Players Ranked</span>
                <strong className={sd.metricValue}>{leaderboard.length}</strong>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {loading && !swrData ? (
            <SkeletonLoader variant="leaderboard" rows={8} style={{ padding: '0 8px' }} />
          ) : leaderboard.length === 0 ? (
            // A failed load says so in the banner above; it is not an empty board.
            swrError ? null : (
              <TrainerEmptyState
                variant="no-data"
                title="No Data Yet For This Timeframe"
                message="Be The First To Put Up A Score In This Window."
                cta={{ label: 'Start Training', onClick: () => { try { window.location.href = '/hub/training'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[leaderboard] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
              />
            )
          ) : (
            <section className={`sd-panel ${sd.panel}`} aria-labelledby="training-board-title">
              <div className={sd.panelHead}>
                <h2 id="training-board-title" className={sd.sectionTitle}>
                  {(TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[2]).label} · {(CATEGORIES.find((c) => c.id === view) || CATEGORIES[0]).label}
                </h2>
                <span className={sd.metricLabel}>Ranked By Accuracy</span>
              </div>
              <div className={sd.board}>
                {leaderboard.map((entry) => (
                  <LeaderboardEntry
                    key={entry.userId || `rank-${entry.rank}`}
                    rank={entry.rank}
                    {...entry}
                    isCurrentUser={Boolean(user?.id) && user.id === entry.userId}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <ConnectionToast />
      {/* Server rendered: measured on production this page returned
          only chrome to a crawler (AEO phase 3, 2026-09-17). */}
      <HubPageSummary page="training-leaderboard" />
    </PageTransition>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// COMPONENTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function LeaderboardEntry({
  rank,
  username,
  avatarUrl,
  questionsAnswered,
  questionsCorrect,
  accuracy,
  isCurrentUser,
}) {
  // TRAIN-LEADERBOARD-A11Y-1: ranks 1-3 once rendered empty strings where the
  // stripped medal emoji had been. Every rank, podium included, now shows its
  // number in a labelled steel badge (podium ranks get the cobalt rim), and the
  // page title is the plain "Training Leaderboard" in the image header.
  const podium = rank >= 1 && rank <= 3 ? String(rank) : undefined;
  const initial = String(username || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={`${sd.boardRow} ${isCurrentUser ? sd.boardRowYou : ''}`}>
      <span className={sd.rankBadge} data-podium={podium} aria-label={`Rank ${rank}`}>{rank}</span>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className={sd.avatar} loading="lazy" />
      ) : (
        <span className={sd.avatarFallback} aria-hidden="true">{initial}</span>
      )}
      <div className={sd.who}>
        <div className={`${sd.name} no-capitalize`}>
          {username}
          {isCurrentUser && <span className={sd.you}>You</span>}
        </div>
        <div className={sd.sub}>
          {Number(questionsAnswered || 0).toLocaleString()} Questions · {accuracy}% Accuracy
        </div>
      </div>
      <div className={sd.score}>
        <div className={sd.scoreValue}>{Number(questionsCorrect || 0).toLocaleString()}</div>
        <div className={sd.scoreLabel}>Correct</div>
      </div>
    </div>
  );
}
