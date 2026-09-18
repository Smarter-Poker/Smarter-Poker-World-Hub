/**
 * TRAINING CHALLENGES PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Historical weekly and monthly challenge definitions. Live settlement is
 * paused until challenges are derived from verified attempts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-5 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-2 — hex sweep batch 6: extended palette literals routed
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
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';

// TRAIN-CSS-MOTION-ADOPT-10 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-3e — adoption: shared empty-state primitive

// BUG FIX (TRAIN-CHALLENGES-A11Y-1): SVG icon components replacing the page's
// emoji set (header / sign-in / empty-state, weekly badge, monthly
// badge, diamond reward, ✓ claimed badge). Emojis read inconsistently
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
export default function ChallengesPage() {
  useTrainingBus('challenges');
  const [user, setUser] = useState(null);

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
    error: swrError,
    mutate: retryChallenges,
  } = useSWR(swrKey, (url) =>
    authedFetch(url)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success !== true || !Array.isArray(body.challenges)) {
          throw new Error(body?.error || 'Unable to load challenges');
        }
        return body.challenges.map((challenge) => ({
        ...challenge,
        title: challenge.title || challenge.name || 'Training Challenge',
        description: challenge.description || 'Historical training challenge definition.',
        period: challenge.period || challenge.challenge_type || 'weekly',
        goal: Math.max(1, Number(challenge.goal ?? challenge.target_value ?? 1)),
        progress: Math.max(0, Number(challenge.progress ?? 0)),
        periodKey: challenge.periodKey || challenge.period_key || '',
      }));
      })
  );
  const challenges = swrData || [];

  const getProgressPercent = (challenge) => {
    return Math.min(100, Math.max(0, (challenge.progress / Math.max(1, challenge.goal)) * 100));
  };

  if (!user) {
    return (
      <PageTransition>
        <SEOHead
          title="Daily Training Challenges"
          description="Review Smarter.Poker Training Challenge Availability."
          canonical="/hub/training/challenges"
        />
        <div style={styles.container}>
          <UniversalHeader pageDepth={2} />
          <div className="sp-training-command sp-training-command--challenges sp-command-main" style={styles.content}>
            <div style={styles.signInPrompt}>
              {/* TRAIN-CHALLENGES-A11Y-1: SVG target replaces fontSize:48 */}
              <span style={{ display: 'inline-flex', color: '#00E0FF' }} aria-hidden>
                <TargetIcon size={48} />
              </span>
              <h2>Sign In To Track Goals</h2>
              <p>Sign In To Review Challenge Availability And Historical Snapshots.</p>
              <Link href="/auth/signup" style={styles.signInBtn}>
                Sign In
              </Link>
            </div>
          </div>
        </div>
        <HubPageSummary page="training-challenges" as="h1" />
      </PageTransition>
    );
  }

  return (
    <>
    <PageTransition>
      <Head>
        <title>Goals - Smarter.Poker</title>
      </Head>

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div className="sp-training-command sp-training-command--challenges sp-command-main" style={styles.content}>
          {/* Header */}
          <div className="sp-command-header" style={styles.header}>
            {/* TRAIN-CHALLENGES-A11Y-1: semantic h1 + SVG target icon */}
            <h1 style={styles.title}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: '#00E0FF' }}>
                <TargetIcon size={26} />
                Your Goals
              </span>
            </h1>
            <p style={styles.subtitle}>Live Challenge Tracking And Rewards Are Paused Pending Verified Settlement</p>
          </div>

          <ErrorBanner
            message={swrError ? 'Unable To Load Challenge Definitions.' : null}
            onRetry={() => retryChallenges()}
          />

          {/* Loading */}
          {loading ? (
            <div role="status" aria-label="Loading challenges">
              <SkeletonLoader variant="card" count={3} style={{ padding: '16px' }} />
            </div>
          ) : challenges.length === 0 ? (
            <TrainerEmptyState
              variant="no-data"
              title="No active goals right now"
              message="Check back soon for new challenges!"
            />
          ) : (
            <div className="sp-command-grid sp-command-grid--challenges" style={styles.challengeList}>
              {challenges.map((challenge, i) => {
                const progress = getProgressPercent(challenge);
                const isWeekly = challenge.period === 'weekly';

                return (
                  <motion.div
                    key={challenge.id}
                    className="sp-command-card"
                    style={{
                      ...styles.challengeCard,
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    {/* TRAIN-CHALLENGES-A11Y-1: SVG calendar icon replaces / .
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
                            background: 'linear-gradient(90deg, #00E0FF, #0099FF)',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: MOTION.slow, delay: i * 0.1 }}
                        />
                      </div>
                      <div style={styles.progressText}>
                        {challenge.progress} / {challenge.goal}
                      </div>
                    </div>

                    {/* Authority status — no reward or completion is inferred
                        from retained browser-authored history. */}
                    <div style={styles.rewardRow}>
                      <span style={{ ...styles.inProgress, color: 'var(--sp-accent-amber)' }}>
                        Tracking Paused
                      </span>
                      {Number(challenge.historicalProgress) > 0 && (
                        <span style={styles.inProgress}>
                          Historical Snapshot: {challenge.historicalProgress} / {challenge.goal}
                        </span>
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
      {/* Server rendered: measured on production this page returned
          only chrome to a crawler (AEO phase 3, 2026-09-17). */}
      <HubPageSummary page="training-challenges" as="h1" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
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
    color: 'var(--sp-fg-muted)',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
    color: 'var(--sp-fg-muted)',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: 'var(--sp-fg-muted)',
  },
  emptyHint: {
    fontSize: '13px',
    color: 'var(--sp-fg-dim)',
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
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--sp-fg-muted)',
    marginBottom: '12px',
  },
  challengeTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: '0 0 6px 0',
  },
  challengeDesc: {
    fontSize: '13px',
    color: 'var(--sp-fg-muted)',
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
    color: 'var(--sp-fg-muted)',
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
    color: 'var(--sp-fg-dim)',
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
