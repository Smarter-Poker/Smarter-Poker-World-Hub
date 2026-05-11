/**
 * TRAINING CHALLENGES PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Weekly and Monthly Goals with diamond rewards
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// BUG FIX (TRAIN-CHALLENGES-A11Y-1): SVG icon components replacing the page's
// emoji set (🎯 header / sign-in / empty-state, 📅 weekly badge, 📆 monthly
// badge, 💎 diamond reward, ✅ claimed badge). Emojis read inconsistently
// across screen readers and don't theme via currentColor. Same surface-
// specific a11y pattern as PR #320/#322/#324/#327/#328.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function TargetIcon({ size = 22 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function CalendarIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function CalendarMonthIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="7" y="13" width="4" height="4" rx="0.5" />
      <rect x="13" y="13" width="4" height="4" rx="0.5" />
    </svg>
  );
}
function DiamondIcon({ size = 16 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M11 3 8 9l4 12 4-12-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}
function CheckIcon({ size = 16 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function ChallengesPage() {
  useTrainingBus('challenges');
  const [user, setUser] = useState(null);
  const [claiming, setClaiming] = useState(null);

  // Load auth user once
  useEffect(() => {
    const _c = new AbortController();
    const u = getAuthUser();
    if (u) setUser(u);
    return () => _c.abort();
  }, []);

  // SWR-backed challenges fetch — only fires when user is known
  const swrKey = user ? `/api/training/challenges?userId=${user.id}` : null;
  const {
    data: swrData,
    isLoading: loading,
    mutate: refreshChallenges,
  } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then((r) => r.json())
      .then((d) => d.challenges || [])
  );
  const challenges = swrData || [];

  const claimReward = async (challenge) => {
    if (!user || claiming) return;
    setClaiming(challenge.id);

    try {
      const res = await authedFetch('/api/training/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          challengeId: challenge.id,
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        // Update local state
        refreshChallenges((prev) =>
          prev.map((c) => (c.id === challenge.id ? { ...c, claimed: true } : c))
        );
        busEmit.diamondsEarned(data.diamondsAwarded, `Challenge: ${challenge.title}`);
        busEmit.celebration('confetti');
        alert(`+${data.diamondsAwarded} diamonds claimed!`);
      }
    } catch (error) {
      console.warn('Claim error:', error);
    } finally {
      setClaiming(null);
    }
  };

  const getProgressPercent = (challenge) => {
    return Math.min(100, (challenge.progress / challenge.goal) * 100);
  };

  if (!user) {
    return (
      <PageTransition>
        <SEOHead
          title="Daily Training Challenges"
          description="Complete Daily GTO Training Challenges To Sharpen Your Poker Skills And Earn Rewards."
          canonical="/hub/training/challenges"
        />
        <div style={styles.container}>
          <UniversalHeader pageDepth={2} />
          <div style={styles.content}>
            <div style={styles.signInPrompt}>
              {/* TRAIN-CHALLENGES-A11Y-1: SVG target replaces 🎯 fontSize:48 */}
              <span style={{ display: 'inline-flex', color: '#00E0FF' }} aria-hidden>
                <TargetIcon size={48} />
              </span>
              <h2>Sign In To Track Goals</h2>
              <p>Complete Weekly And Monthly Goals To Earn Diamonds!</p>
              <Link href="/auth/signup" style={styles.signInBtn}>
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <>
    <PageTransition>
      <Head>
        <title>Goals — Smarter.Poker</title>
      </Head>

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            {/* TRAIN-CHALLENGES-A11Y-1: semantic h1 + SVG target icon */}
            <h1 style={styles.title}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: '#00E0FF' }}>
                <TargetIcon size={26} />
                Your Goals
              </span>
            </h1>
            <p style={styles.subtitle}>Complete Challenges To Earn Diamond Rewards</p>
          </div>

          {/* Loading */}
          {loading ? (
            <div role="status" aria-label="Loading challenges">
              <SkeletonLoader variant="card" count={3} style={{ padding: '16px' }} />
            </div>
          ) : challenges.length === 0 ? (
            <div style={styles.emptyState}>
              {/* TRAIN-CHALLENGES-A11Y-1: SVG target replaces 🎯 fontSize:48 */}
              <span style={{ display: 'inline-flex', color: '#9ca3af' }} aria-hidden>
                <TargetIcon size={48} />
              </span>
              <p>No Active Goals Right Now</p>
              <p style={styles.emptyHint}>Check Back Soon For New Challenges!</p>
            </div>
          ) : (
            <div style={styles.challengeList}>
              {challenges.map((challenge, i) => {
                const progress = getProgressPercent(challenge);
                const isComplete = progress >= 100;
                const canClaim = isComplete && !challenge.claimed;
                const isWeekly = challenge.period === 'weekly';

                return (
                  <motion.div
                    key={challenge.id}
                    style={{
                      ...styles.challengeCard,
                      ...(challenge.claimed ? styles.claimedCard : {}),
                      ...(isComplete && !challenge.claimed ? styles.completeCard : {}),
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    {/* TRAIN-CHALLENGES-A11Y-1: SVG calendar icon replaces 📅 / 📆.
                        Period label remains the readable 'Weekly' / 'Monthly'. */}
                    <div style={styles.typeBadge}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {isWeekly ? <CalendarIcon size={12} /> : <CalendarMonthIcon size={12} />}
                        {isWeekly ? 'Weekly' : 'Monthly'}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 style={styles.challengeTitle}>{challenge.title}</h3>
                    <p style={styles.challengeDesc}>{challenge.description}</p>

                    {/* Progress Bar */}
                    <div style={styles.progressContainer}>
                      {/* TRAIN-CHALLENGES-A11Y-1: progress now a proper progressbar */}
                      <div
                        style={styles.progressTrack}
                        role="progressbar"
                        aria-label={`${challenge.title} progress`}
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <motion.div
                          style={{
                            ...styles.progressFill,
                            background: isComplete
                              ? 'linear-gradient(90deg, #31A24C, #4ADE80)'
                              : 'linear-gradient(90deg, #00E0FF, #0099FF)',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5, delay: i * 0.1 }}
                        />
                      </div>
                      <div style={styles.progressText}>
                        {challenge.progress} / {challenge.goal}
                      </div>
                    </div>

                    {/* Reward + Action */}
                    <div style={styles.rewardRow}>
                      <div style={styles.reward}>
                        {/* TRAIN-CHALLENGES-A11Y-1: SVG diamond replaces 💎 */}
                        <span style={{ display: 'inline-flex', color: '#00E0FF' }} aria-hidden>
                          <DiamondIcon size={16} />
                        </span>
                        <span style={styles.rewardAmount} aria-label={`${challenge.diamonds} diamonds`}>{challenge.diamonds}</span>
                      </div>

                      {challenge.claimed ? (
                        <span style={styles.claimedBadge}>
                          {/* TRAIN-CHALLENGES-A11Y-1: SVG check replaces ✅ */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckIcon size={14} />
                            Claimed
                          </span>
                        </span>
                      ) : canClaim ? (
                        /* TRAIN-CHALLENGES-A11Y-1: type+aria on claim button */
                        <button
                          type="button"
                          onClick={() => claimReward(challenge)}
                          disabled={claiming === challenge.id}
                          style={styles.claimBtn}
                          aria-label={`Claim ${challenge.diamonds} diamonds for ${challenge.title}`}
                        >
                          {claiming === challenge.id ? 'Claiming...' : 'Claim Reward'}
                        </button>
                      ) : (
                        <span style={styles.inProgress}>In Progress</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
    <ConnectionToast />
    </>
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
    maxWidth: '600px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#9ca3af',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#9ca3af',
  },
  emptyHint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '8px',
  },
  signInPrompt: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#fff',
  },
  signInBtn: {
    display: 'inline-block',
    marginTop: '20px',
    padding: '14px 32px',
    background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    textDecoration: 'none',
  },
  challengeList: {
    display: 'grid',
    gap: '16px',
  },
  challengeCard: {
    background: '#1a1a1a',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  completeCard: {
    border: '2px solid #31A24C',
    boxShadow: '0 0 20px rgba(49, 162, 76, 0.2)',
  },
  claimedCard: {
    opacity: 0.6,
  },
  typeBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#9ca3af',
    marginBottom: '12px',
  },
  challengeTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: '0 0 6px 0',
  },
  challengeDesc: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: '0 0 16px 0',
  },
  progressContainer: {
    marginBottom: '16px',
  },
  progressTrack: {
    width: '100%',
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
  },
  progressText: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '6px',
    textAlign: 'right',
  },
  rewardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reward: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  rewardAmount: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#00E0FF',
  },
  claimBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #31A24C, #228B22)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  claimedBadge: {
    fontSize: '14px',
    color: '#31A24C',
    fontWeight: 600,
  },
  inProgress: {
    fontSize: '13px',
    color: '#6b7280',
  },
  actions: {
    textAlign: 'center',
    marginTop: '40px',
  },
  backButton: {
    color: '#00E0FF',
    textDecoration: 'none',
    fontSize: '16px',
  },
};
