/**
 * Training Achievements Page
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * View all achievements and progress
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-1 — hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-2c — adoption: shared empty-state primitive

const RARITY_COLORS = {
  common: 'var(--sp-fg-muted)',
  uncommon: 'var(--sp-accent-green)',
  rare: 'var(--sp-accent-blue)',
  epic: 'var(--sp-accent-purple)',
  legendary: 'var(--sp-accent-amber)',
};

// BUG FIX (TRAIN-ACHIEVEMENTS-A11Y-1): replaced emoji map with SVG icon
// components — emojis are not announced consistently by screen readers
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

function MedalIcon({ size = 22 }) {
  // header medal (replaces ★)
  const props = { ...ICON_PROPS, width: size, height: size };
  return (
    <svg {...props}>
      <circle cx="12" cy="14" r="7" />
      <path d="M8.21 13.89 6 22l6-3 6 3-2.21-8.12" />
      <path d="M9 7h6" />
    </svg>
  );
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
  useTrainingBus('achievements');

  const { mutate } = useSWRConfig();
  const [user, setUser] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [sharingId, setSharingId] = useState(null);

  // Load auth user once
  useEffect(() => {
    try {
      setUser(getAuthUser());
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // SWR-backed achievements fetch — only fires when user is known
  const swrKey = user ? `/api/training/achievements?userId=${user.id}` : null;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateAchievements } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((d) => (d.success ? d.achievements || [] : []))
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

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalDiamonds = achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + (a.diamond_reward || 0), 0);

  return (
    <PageTransition>
      <SEOHead
        title="Training Achievements — Milestones Unlocked"
        description="Track Your GTO Training Achievements And Milestones On Smarter.Poker."
        canonical="/hub/training/achievements"
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          {/* TRAIN-ACHIEVEMENTS-A11Y-1: semantic h1 with SVG medal icon replaces
              the prior bare '★ Training Achievements' string. Icon has
              aria-hidden so the heading reads cleanly as 'Training Achievements'. */}
          <h1 style={styles.title}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
              <MedalIcon size={26} />
              Training Achievements
            </span>
          </h1>

          {/* Stats Overview */}
          <div style={styles.statsRow}>
            <div style={styles.statBox}>
              {/* TRAIN-ACHIEVEMENTS-A11Y-1: role=status so screen readers
                  announce unlock-count updates after SESSION_END refetch. */}
              <div style={styles.statValue} role="status" aria-label={`${unlockedCount} of ${achievements.length} achievements unlocked`}>
                {unlockedCount}/{achievements.length}
              </div>
              <div style={styles.statLabel}>Unlocked</div>
            </div>
            <div style={styles.statBox}>
              <div style={{ ...styles.statValue, color: '#00E0FF' }} role="status" aria-label={`${totalDiamonds} diamonds earned`}>{totalDiamonds}</div>
              <div style={styles.statLabel}>Diamonds Earned</div>
            </div>
          </div>

          {/* Category Filter */}
          <div style={styles.filters} role="tablist" aria-label="Filter achievements by category">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                style={activeCategory === cat ? styles.filterActive : styles.filterBtn}
                onClick={() => setActiveCategory(cat)}
                aria-label={`Filter by ${cat === 'all' ? 'all categories' : cat}`}
                aria-pressed={activeCategory === cat}
              >
                {/* TRAIN-ACHIEVEMENTS-A11Y-1: SVG CategoryIcon replaces emoji
                    map. Label remains the uppercase category name. */}
                {cat === 'all' ? 'ALL' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CategoryIcon kind={cat} size={12} />
                    {cat.toUpperCase()}
                  </span>
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
            <div style={{ padding: '20px 0' }} role="status" aria-label="Loading achievements">
              <SkeletonLoader variant="rows" rows={6} />
            </div>
          ) : (
            <div style={styles.grid}>
              {filteredAchievements.map((ach, i) => (
                <div
                  key={ach.id}
                  style={{
                    ...styles.achCard,
                    opacity: ach.unlocked ? 1 : 0.5,
                    borderColor: ach.unlocked ? RARITY_COLORS[ach.rarity] : '#333',
                  }}
                >
                  {/* TRAIN-ACHIEVEMENTS-A11Y-1: ach.icon may be an emoji string
                      from the DB. We render it inside an aria-hidden wrapper
                      so the screen reader announces the name instead, and
                      fall back to the TrophyIcon SVG when no icon is set. */}
                  <div style={styles.achIcon} aria-hidden>
                    {ach.icon ? ach.icon : <TrophyIcon size={32} />}
                  </div>
                  <div style={styles.achInfo}>
                    <div style={styles.achName}>{ach.name}</div>
                    <div style={styles.achDesc}>{ach.description}</div>
                    <div style={{ ...styles.achRarity, color: RARITY_COLORS[ach.rarity] }}>
                      {ach.rarity?.toUpperCase()}
                    </div>
                  </div>
                  <div style={styles.reward}>
                    <span style={styles.diamonds}>{ach.diamond_reward}</span>
                    {ach.unlocked ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {/* TRAIN-ACHIEVEMENTS-A11Y-1: SVG CheckIcon + aria-label
                            replaces bare '✓' text. */}
                        <span style={styles.unlocked} role="img" aria-label="Unlocked">
                          <CheckIcon size={18} />
                        </span>
                        {/* TRAIN-ACHIEVEMENTS-A11Y-1: explicit type="button" + aria-label
                            on the share button (was unlabeled, just "Share"). */}
                        <button
                          type="button"
                          aria-label={`Share '${ach.name}' achievement to your feed`}
                          disabled={sharingId === ach.id}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (sharingId) return;
                            setSharingId(ach.id);
                            try {
                              const res = await authedFetch('/api/training/share', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: user.id,
                                  shareType: 'achievement',
                                  data: { name: ach.name, description: ach.description },
                                }),
                              });
                              const d = await res.json();
                              if (d.success) alert('Achievement shared to your feed!');
                            } catch (err) {
                              console.warn('Share error:', err);
                              alert('Failed to share. Try again.');
                            } finally {
                              setSharingId(null);
                            }
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: 'none',
                            background: 'rgba(168,85,247,0.1)',
                            color: 'var(--sp-accent-purple)',
                            fontSize: 9,
                            fontWeight: 700,
                            cursor: sharingId === ach.id ? 'not-allowed' : 'pointer',
                            opacity: sharingId === ach.id ? 0.5 : 1,
                          }}
                        >
                          {sharingId === ach.id ? '...' : 'Share'}
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        width: 48,
                        height: 4,
                        borderRadius: 2,
                        background: 'rgba(255,255,255,0.08)',
                        marginTop: 6,
                        overflow: 'hidden',
                      }}
                      role="progressbar"
                      aria-label={`${ach.name} progress`}
                      aria-valuenow={Math.min(100, Math.round(ach.progress || 0))}
                      aria-valuemin={0}
                      aria-valuemax={100}>
                        <div style={{
                          width: `${Math.min(100, (ach.progress || 0))}%`,
                          height: '100%',
                          borderRadius: 2,
                          background: RARITY_COLORS[ach.rarity] || 'var(--sp-fg-muted)',
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {filteredAchievements.length === 0 && (
                <TrainerEmptyState
                  variant={user ? 'no-data' : 'locked'}
                  title={user ? 'No achievements yet' : 'Sign in required'}
                  message={user ? 'Complete training sessions to unlock achievements in this category.' : 'Sign in to track your achievements.'}
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

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: '#0a0a0a',
    color: '#FFFFFF',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '24px',
    textAlign: 'center',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  statBox: {
    padding: '16px 32px',
    background: '#1a1a1a',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--sp-accent-amber)',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
    marginTop: '4px',
  },
  filters: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  filterBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '8px',
    color: 'var(--sp-fg-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterActive: {
    padding: '8px 16px',
    background: '#00E0FF',
    border: '1px solid #00E0FF',
    borderRadius: '8px',
    color: '#000',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--sp-fg-muted)',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  achCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    background: '#1a1a1a',
    border: '2px solid #333',
    borderRadius: '12px',
  },
  achIcon: {
    fontSize: '32px',
  },
  achInfo: {
    flex: 1,
  },
  achName: {
    fontSize: '16px',
    fontWeight: 600,
  },
  achDesc: {
    fontSize: '13px',
    color: 'var(--sp-fg-muted)',
    marginTop: '4px',
  },
  achRarity: {
    fontSize: '10px',
    fontWeight: 700,
    marginTop: '4px',
  },
  reward: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  diamonds: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#00E0FF',
  },
  unlocked: {
    color: 'var(--sp-accent-green)',
    fontSize: '20px',
    marginTop: '4px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  backLink: {
    display: 'block',
    textAlign: 'center',
    marginTop: '32px',
    color: '#00E0FF',
    textDecoration: 'none',
  },
};