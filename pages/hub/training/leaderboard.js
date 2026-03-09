/**
 * Training Leaderboard Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Global and friend leaderboards for training performance
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { useSWRConfig } from 'swr';

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

  // SWR-backed leaderboard fetch — cached 60s, instant on timeframe switch
  const swrKey = `/api/training/leaderboard?period=${period}&limit=100`;
  const { data: swrData, isLoading: loading } = useSWR(swrKey, (url) =>
    fetch(url)
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
          <h1 style={styles.title}>Trophy Training Leaderboard</h1>

          {/* Filters */}
          <div style={styles.filters}>
            <div style={styles.filterGroup}>
              <button
                style={timeframe === 'daily' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('daily')}
              >
                Daily
              </button>
              <button
                style={timeframe === 'weekly' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('weekly')}
              >
                Weekly
              </button>
              <button
                style={timeframe === 'all-time' ? styles.filterButtonActive : styles.filterButton}
                onClick={() => setTimeframe('all-time')}
              >
                All Time
              </button>
            </div>

            {/* TODO: Add friends filter when friendships are implemented */}
          </div>

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
              {leaderboard.map((entry, index) => (
                <LeaderboardEntry
                  key={entry.userId}
                  rank={index + 1}
                  {...entry}
                  isCurrentUser={user?.id === entry.userId}
                />
              ))}

              {leaderboard.length === 0 && (
                <div style={styles.emptyState}>
                  <p>No Data Yet For This Timeframe</p>
                  <Link href="/hub/training" style={styles.button}>
                    Start Training
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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

  const getRankIcon = () => {
    if (rank === 1) return '';
    if (rank === 2) return '';
    if (rank === 3) return '';
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
    minHeight: '100vh',
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
    color: '#9ca3af',
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
    color: '#9ca3af',
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
    color: '#9ca3af',
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
    color: '#9ca3af',
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
    color: '#9ca3af',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 24px',
    color: '#9ca3af',
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
};
