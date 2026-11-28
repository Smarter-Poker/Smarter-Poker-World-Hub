/**
 * Training Achievements Page - #SmarterCasinoRealism Vault
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * View all achievements and progress
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-1 - hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR, { useSWRConfig } from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import TrainingPageHead, { TrainingDailyNav } from '../../../src/components/training/TrainingPageHead';
// TRAIN-WIRE-EMPTY-2c - adoption: shared empty-state primitive



// Rarity is a label, not a colour: ice for every tier, muted for common.
const RARITY_TONE = {
  common: 'muted',
  uncommon: 'ice',
  rare: 'ice',
  epic: 'ice',
  legendary: 'ice',
};

// BUG FIX (TRAIN-ACHIEVEMENTS-A11Y-1): replaced emoji map with SVG icon
// components - emojis are not announced consistently by screen readers
// and don't theme via currentColor. Same surface-specific a11y pattern
// as PR #320 (skill-tree), #322 (progress), #324 (leaderboard), #327
// (daily-challenge). Categories remain: accuracy / streak / volume / mastery.
const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function CategoryIcon({ kind, size = 14 }) {
  const props = { ...ICON_PROPS, width: size, height: size };
  if (kind === 'accuracy') {
    // target rings (replaces ◆)
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    );
  }
  if (kind === 'streak') {
    // flame (replaces ▲)
    return (
      <svg {...props}>
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z" />
      </svg>
    );
  }
  if (kind === 'volume') {
    // book (replaces □)
    return (
      <svg {...props}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (kind === 'mastery') {
    // crown (replaces ★)
    return (
      <svg {...props}>
        <path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z" />
        <path d="M4 19h16" />
      </svg>
    );
  }
  return null;
}


function TrophyIcon({ size = 32 }) {
  // ach card fallback icon (replaces ★)
  const props = { ...ICON_PROPS, width: size, height: size };
  return (
    <svg {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}

function CheckIcon({ size = 18 }) {
  // unlocked checkmark (replaces inline '✓' text)
  const props = { ...ICON_PROPS, width: size, height: size };
  return (
    <svg {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function TrainingAchievements() {
  const router = useRouter();
  useTrainingBus('achievements');

  const { mutate } = useSWRConfig();
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
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



  // Load auth user once
  useEffect(() => {
    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // SWR-backed achievements fetch - only fires when user is known
  const swrKey = user ? `/api/training/achievements?userId=${user.id}` : null;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateAchievements } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true || !Array.isArray(body.achievements)) {
          throw new Error(body?.error || 'Unable to load achievements');
        }
        return body.achievements;
      })
  );
  const achievements = swrData || [];

  // Auto-refresh achievements when a training session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      mutate((key) => typeof key === 'string' && key.startsWith('/api/training/achievements'));
    });
    return unsub;
  }, [mutate]);

  const categories = ['all', 'accuracy', 'streak', 'volume', 'mastery'];

  const filteredAchievements =
    activeCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === activeCategory);

  const historicalUnlockedCount = achievements.filter((a) => a.historicallyUnlocked).length;

  return (
    <PageTransition>
      <SEOHead
        title="Training Achievements - Milestones Unlocked"
        description="Track Your GTO Training Achievements And Milestones On Smarter.Poker."
        canonical="/hub/training/achievements"
      />

      <div className={`sp-training-journey sp-training-journey--achievements ${sd.root}`}>
        <UniversalHeader pageDepth={2} />

        <TrainingPageHead slug="training-achievements" nav={<TrainingDailyNav current="/hub/training/achievements" />} />

        <div className={`sp-journey-main ${sd.main}`}>
          {!isOnline && (
            <div role="status" data-offline-banner="true" className={sd.notice}>
              Offline. Achievement Ledger Sync Will Resume After Reconnection.
            </div>
          )}

          {/* Stats Overview */}
          <div className={`sp-journey-stat-grid sp-journey-stat-grid--compact ${sd.metrics}`}>
            <div className={`sp-journey-stat-card ${sd.metric}`}>
              {/* TRAIN-ACHIEVEMENTS-A11Y-1: role=status so screen readers
                  announce unlock-count updates after SESSION_END refetch. */}
              <div className={sd.metricValue} role="status" aria-label={`${historicalUnlockedCount} historical achievement snapshots`}>
                {historicalUnlockedCount}/{achievements.length}
              </div>
              <div className={sd.metricLabel}>Historical Snapshots</div>
            </div>
            <div className={`sp-journey-stat-card ${sd.metric}`}>
              <div className={`${sd.metricValue} ${sd.ice}`} role="status">Paused</div>
              <div className={sd.metricLabel}>New Achievement Awards</div>
            </div>
          </div>

          {/* Category Filter */}
          <div className={`sp-journey-filter-rail ${sd.chips}`} role="group" aria-label="Filter Achievements By Category">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={sd.chip}
                onClick={() => setActiveCategory(cat)}
                aria-label={`Filter by ${cat === 'all' ? 'all categories' : cat}`}
                aria-pressed={activeCategory === cat}
              >
                {/* TRAIN-ACHIEVEMENTS-A11Y-1: SVG CategoryIcon replaces emoji
                    map. Label remains the title-case category name. */}
                {cat === 'all' ? 'All' : (
                  <>
                    <CategoryIcon kind={cat} size={14} />
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </>
                )}
              </button>
            ))}
          </div>

          <ErrorBanner
            message={swrError ? 'Unable to load achievements.' : null}
            onRetry={() => mutateAchievements()}
          />

          {/* Achievement List */}
          {loading ? (
            <TrainingConsoleSkeleton label="Loading Achievements" panels={3} rows={2} />
          ) : (
            <div className={`sp-journey-achievement-grid ${sd.list}`}>
              {filteredAchievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`sp-journey-achievement-card ${sd.card} ${sd.achievement}`}
                  data-tone={ach.historicallyUnlocked ? 'good' : 'muted'}
                >
                  {/* TRAIN-ACHIEVEMENTS-A11Y-1: ach.icon may be an emoji string
                      from the DB. We render it inside an aria-hidden wrapper
                      so the screen reader announces the name instead, and
                      fall back to the TrophyIcon SVG when no icon is set. */}
                  <div className={sd.achievementIcon} aria-hidden>
                    {ach.icon ? ach.icon : <TrophyIcon size={30} />}
                  </div>
                  <div className={sd.achievementInfo}>
                    <div className={sd.title}>{ach.name}</div>
                    <div className={sd.copy}>{ach.description}</div>
                    {ach.rarity && (
                      <div className={`${sd.eyebrow} ${RARITY_TONE[ach.rarity] === 'muted' ? sd.muted : ''}`}>
                        {ach.rarity.charAt(0).toUpperCase() + ach.rarity.slice(1)}
                      </div>
                    )}
                  </div>
                  <div className={sd.achievementState}>
                    {ach.historicallyUnlocked ? (
                      <>
                        {/* TRAIN-ACHIEVEMENTS-A11Y-1: SVG CheckIcon + aria-label
                            replaces bare check text. */}
                        <span className={sd.good} role="img" aria-label="Historical achievement snapshot">
                          <CheckIcon size={18} />
                        </span>
                        <span>Historical Snapshot</span>
                      </>
                    ) : (
                      <span>Earning Paused</span>
                    )}
                  </div>
                </div>
              ))}

              {filteredAchievements.length === 0 && (
                <TrainerEmptyState
                  variant={user ? 'no-data' : 'locked'}
                  title={user ? 'No Achievements Yet' : 'Sign In Required'}
                  message={user ? 'No Historical Achievement Definitions Are Available In This Category.' : 'Sign In To View Historical Achievement Snapshots.'}
                  compact
                />
              )}
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

