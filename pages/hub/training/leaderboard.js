/**
 * Training Leaderboard Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Global and friend leaderboards for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-27 — hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
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

// ═══════════════════════════════════════════════════════════════════════════
// ICON COMPONENTS — TRAIN-LEADERBOARD-A11Y-1
// SVG replacements for the cleaned-emoji gaps in this file. Original file
// had 🥇🥈🥉 medals + a 🏆 in the page title; they were stripped to empty
// strings + the literal word 'Trophy' but never replaced. Lucide-style
// SVGs with currentColor inheritance restore the visual + a11y semantics.
// ═══════════════════════════════════════════════════════════════════════════

function TrophyIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M5 4H2v3a3 3 0 0 0 3 3" />
      <path d="M19 4h3v3a3 3 0 0 1-3 3" />
    </svg>
  );
}

function MedalIcon({ rank, size = 22, color = 'currentColor' }) {
  // rank 1/2/3 each get a distinct medal silhouette via different ribbon
  // angles; colour comes from the parent (gold/silver/bronze).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      role="img" aria-label={`Rank ${rank} medal`} focusable="false">
      <path d="M7 2l3 5" />
      <path d="M17 2l-3 5" />
      <circle cx="12" cy="14" r="7" />
      <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="700"
        fill={color} stroke="none">{rank}</text>
    </svg>
  );
}

export default function TrainingLeaderboard() {
  useTrainingBus('training-leaderboard');
  const [user, setUser] = useState(null);
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
  }, []);

  // Friends list for "Friends" tab
  const [friendIds, setFriendIds] = useState(null);
  useEffect(() => {
    if (!user) return;
    authedFetch('/api/friends?action=list')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.data?.friends) {
          setFriendIds(data.data.friends.map(f => f.id));
        } else {
          setFriendIds([]);
        }
      })
      .catch(() => setFriendIds([]));
  }, [user]);

  // 🔌 Bus listener: auto-refresh leaderboard when a training session completes
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
  const categoryParam = view && view !== 'global' && view !== 'friends' ? `&category=${view}` : '';
  const swrKey = `/api/training/leaderboard?period=${period}&limit=100${categoryParam}`;
  const { data: swrData, isLoading: loading, error: swrError, mutate: mutateLeaderboard } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || 'Failed to load leaderboard');
        return data.leaderboard.map((entry) => ({
          userId: entry.userId,
          username: entry.username,
          avatarUrl: entry.avatarUrl,
          totalQuestions: entry.questionsCorrect || 0,
          correctAnswers: entry.questionsCorrect || 0,
          accuracy: entry.accuracy || 0,
          score: (entry.questionsCorrect || 0) * (1 + (entry.accuracy || 0) / 100),
        }));
      })
  );
  const leaderboard = swrData || [];
  const userRank = user
    ? (() => {
        const r = leaderboard.findIndex((s) => s.userId === user.id);
        return r >= 0 ? r + 1 : null;
      })()
    : null;

  return (
    <PageTransition>
      <SEOHead
        title="Training Leaderboard — Top Students"
        description="See Who Leads The GTO Training Leaderboard On Smarter.Poker."
        canonical="/hub/training/leaderboard"
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          {/* TRAIN-LEADERBOARD-A11Y-1: was 'Trophy Training Leaderboard' (a
              cleaned-emoji artifact — original title was '🏆 Training
              Leaderboard'). Restore the icon as proper SVG. */}
          <h1 style={{ ...styles.title, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <TrophyIcon size={24} color="#FFD700" />
            Training Leaderboard
          </h1>

          {/* Filters */}
          <div style={styles.filters}>
            <div style={styles.filterGroup}>
              <button
                style={timeframe === 'daily' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('daily')}
                aria-label="Show daily rankings"
                aria-pressed={timeframe === 'daily'}
              >
                Daily
              </button>
              <button
                style={timeframe === 'weekly' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('weekly')}
                aria-label="Show weekly rankings"
                aria-pressed={timeframe === 'weekly'}
              >
                Weekly
              </button>
              <button
                style={timeframe === 'all-time' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('all-time')}
                aria-label="Show all-time rankings"
                aria-pressed={timeframe === 'all-time'}
              >
                All Time
              </button>
            </div>

            {/* Category filter */}
            <div style={{ ...styles.filterGroup, marginTop: 8 }}>
            {[
                { id: 'global', label: 'All Games' },
                { id: 'friends', label: 'Friends' },
                { id: 'mtt', label: 'MTT' },
                { id: 'cash', label: 'Cash' },
                { id: 'spins', label: 'Spins' },
                { id: 'psychology', label: 'Psychology' },
                { id: 'advanced', label: 'Advanced' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  style={view === cat.id ? styles.categoryButtonActive : styles.categoryButton}
                  onClick={() => setView(cat.id)}
                  aria-label={`Show ${cat.label} category`}
                  aria-pressed={view === cat.id}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <ErrorBanner
            message={swrError ? 'Unable to load leaderboard data.' : null}
            onRetry={() => mutateLeaderboard()}
          />

          {/* User Rank */}
          {user && userRank && (
            <div style={styles.userRankCard}>
              <span style={styles.userRankLabel}>Your Rank:</span>
              <span style={styles.userRankValue}>#{userRank}</span>
            </div>
          )}

          {/* Leaderboard */}
          {loading ? (
            <SkeletonLoader variant="leaderboard" rows={8} style={{ padding: '0 8px' }} />
          ) : (
            <div style={styles.leaderboardList}>
              {(() => {
                const displayList = view === 'friends' && friendIds
                  ? leaderboard.filter(e => friendIds.includes(e.userId))
                  : leaderboard;
                if (displayList.length === 0 && view === 'friends') {
                  return (
                    <TrainerEmptyState
                      variant="no-data"
                      title="No friends on the leaderboard yet"
                      message="Invite friends to train together and compete!"
                      cta={{ label: 'Find Friends', onClick: () => { try { window.location.href = '/hub/friends'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[leaderboard] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ } } }}
                    />
                  );
                }
                if (displayList.length === 0) {
                  return (
                    <TrainerEmptyState
                      variant="no-data"
                      title="No data yet for this timeframe"
                      message="Be the first to put up a score in this window."
                      cta={{ label: 'Start Training', onClick: () => { try { window.location.href = '/hub/training'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[leaderboard] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ } } }}
                    />
                  );
                }
                return displayList.map((entry, index) => (
                  <LeaderboardEntry
                    key={entry.userId}
                    rank={index + 1}
                    {...entry}
                    isCurrentUser={user?.id === entry.userId}
                  />
                ));
              })()}
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function LeaderboardEntry({
  rank,
  username,
  avatarUrl,
  totalQuestions,
  correctAnswers,
  accuracy,
  score,
  isCurrentUser,
}) {
  const getRankColor = () => {
    if (rank === 1) return '#FFD700'; // Gold
    if (rank === 2) return '#C0C0C0'; // Silver
    if (rank === 3) return '#CD7F32'; // Bronze
    return '#00E0FF';
  };

  // TRAIN-LEADERBOARD-A11Y-1: previously returned empty strings (emojis
  // 🥇🥈🥉 were stripped but never replaced). Return a SVG MedalIcon for
  // top-3 ranks; rank colour from getRankColor() flows via currentColor.
  const getRankIcon = () => {
    if (rank === 1) return <MedalIcon rank={1} size={26} color="#FFD700" />;
    if (rank === 2) return <MedalIcon rank={2} size={24} color="#C0C0C0" />;
    if (rank === 3) return <MedalIcon rank={3} size={24} color="#CD7F32" />;
    return null;
  };

  return (
    <div
      style={{
        ...styles.leaderboardEntry,
        ...(isCurrentUser ? styles.currentUserEntry : {}),
      }}
    >
      <div style={styles.rankSection}>
        {/* TRAIN-LEADERBOARD-A11Y-1: getRankIcon now returns an SVG element
            (not a text glyph), so render it directly. The rank colour is
            embedded in the medal's stroke. */}
        {getRankIcon() ? (
          <span style={styles.rankIcon}>{getRankIcon()}</span>
        ) : (
          <span style={{ ...styles.rank, color: getRankColor() }}>#{rank}</span>
        )}
      </div>

      <div style={styles.userSection}>
        {avatarUrl && <img src={avatarUrl} alt={username} style={styles.avatar} loading="lazy" />}
        <div>
          <div style={styles.username}>
            {username}
            {isCurrentUser && <span style={styles.youBadge}>YOU</span>}
          </div>
          <div style={styles.userStats}>
            {totalQuestions} questions • {accuracy}% accuracy
          </div>
        </div>
      </div>

      <div style={styles.scoreSection}>
        <div style={styles.score}>{Math.round(score)}</div>
        <div style={styles.scoreLabel}>Points</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

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
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '32px',
    textAlign: 'center',
  },
  filters: {
    marginBottom: '24px',
  },
  filterGroup: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
  },
  filterButton: {
    padding: '8px 24px',
    background: 'transparent',
    color: 'var(--sp-fg-muted)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    padding: '8px 24px',
    background: '#00E0FF',
    color: '#FFFFFF',
    border: '1px solid #00E0FF',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  userRankCard: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(0, 224, 255, 0.1), rgba(0, 153, 255, 0.1))',
    border: '1px solid rgba(0, 224, 255, 0.3)',
    borderRadius: '12px',
    marginBottom: '24px',
  },
  userRankLabel: {
    fontSize: '16px',
    color: 'var(--sp-fg-muted)',
  },
  userRankValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#00E0FF',
  },
  leaderboardList: {
    display: 'grid',
    gap: '12px',
  },
  leaderboardEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    background: '#1a1a1a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    transition: 'all 0.2s',
  },
  currentUserEntry: {
    background: 'rgba(0, 224, 255, 0.05)',
    border: '1px solid rgba(0, 224, 255, 0.3)',
  },
  rankSection: {
    minWidth: '50px',
    textAlign: 'center',
  },
  rank: {
    fontSize: '20px',
    fontWeight: 700,
  },
  rankIcon: {
    fontSize: '28px',
  },
  userSection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  username: {
    fontSize: '16px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  youBadge: {
    padding: '2px 8px',
    background: '#00E0FF',
    color: '#000',
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: '4px',
  },
  userStats: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
    marginTop: '4px',
  },
  scoreSection: {
    textAlign: 'right',
  },
  score: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#00E0FF',
  },
  scoreLabel: {
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '80px 24px',
  },
  spinner: {
    fontSize: '48px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: 'var(--sp-fg-muted)',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 24px',
    color: 'var(--sp-fg-muted)',
  },
  button: {
    display: 'inline-block',
    marginTop: '24px',
    padding: '12px 32px',
    background: '#00E0FF',
    color: '#FFFFFF',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 600,
  },
  categoryButton: {
    padding: '6px 14px',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  categoryButtonActive: {
    padding: '6px 14px',
    background: 'rgba(139, 92, 246, 0.15)',
    color: 'var(--sp-accent-purple)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
