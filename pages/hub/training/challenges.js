/**
 * TRAINING CHALLENGES PAGE - #SMARTERCASINOREALISM COMMAND DECK
 * ═══════════════════════════════════════════════════════════════════════════
 * Historical weekly and monthly challenge definitions. Live settlement is
 * paused until challenges are derived from verified attempts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH5-5 - hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-2 - hex sweep batch 6: extended palette literals routed
// TRAIN-CHALLENGES-A11Y-1 - semantic SVG icons and accessible challenge plates
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
import casinoStyles from '../../../src/styles/training/challenges-casino.module.css';

// TRAIN-CSS-MOTION-ADOPT-10 - durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1).
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

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

function SubpageNavigation() {
  return (
    <nav className={casinoStyles.subpageNav} aria-label="Daily Challenges Subpages">
      <Link href="/hub/training/daily-challenge" className={casinoStyles.navPlate}>
        Hand Of The Day
      </Link>
      <Link href="/hub/training/daily-goals" className={casinoStyles.navPlate}>
        Daily Goals Vault
      </Link>
      <Link href="/hub/training/challenges" className={`${casinoStyles.navPlate} ${casinoStyles.navPlateActive}`}>
        Weekly &amp; Monthly Goals
      </Link>
      <Link href="/hub/training" className={casinoStyles.navPlate}>
        Training Arena
      </Link>
    </nav>
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

  // SWR-backed challenges fetch - only fires when user is known
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
          description="Daily GTO Training Challenges On Smarter.Poker: A Short Set Of Hands Chosen From The Spots You Have Been Getting Wrong, Scored Against A Solver Baseline. Free To Play, And Nothing In It Is A Wager."
          canonical="/hub/training/challenges"
        />
        <div className={casinoStyles.shell}>
          <UniversalHeader pageDepth={2} />
          <header className={`sp-command-header ${casinoStyles.marquee}`}>
            <div className={casinoStyles.marqueeArtwork} aria-hidden="true" />
            <div className={casinoStyles.marqueeContent}>
              <div className={casinoStyles.titleBlock}>
                <span className={casinoStyles.eyebrow}>Casino Realism Command · Verified Ledger</span>
                <h1>
                  <span style={{ display: 'inline-flex', color: '#25c8ff' }} aria-hidden>
                    <TargetIcon size={32} />
                  </span>
                  Training Challenges
                </h1>
                <p>Review Historical Weekly And Monthly Challenge Definitions And Access Daily Solver Assignments.</p>
                <SubpageNavigation />
              </div>
            </div>
          </header>
          <div className={`sp-training-command sp-training-command--challenges sp-command-main ${casinoStyles.commandDeck}`}>
            <div className={casinoStyles.signInVault}>
              <span style={{ display: 'inline-flex', color: '#25c8ff' }} aria-hidden>
                <TargetIcon size={48} />
              </span>
              <h2>Sign In To Track Goals</h2>
              <p>Sign In To Review Challenge Availability And Historical Snapshots.</p>
              <Link href="/auth/signup" className={casinoStyles.primaryButton}>
                Sign In
              </Link>
            </div>
          </div>
        </div>
        <HubPageSummary page="training-challenges" as="h1" />
      </PageTransition>
    );
  }

  const weeklyCount = challenges.filter((c) => c.period === 'weekly').length;
  const monthlyCount = challenges.filter((c) => c.period !== 'weekly').length;

  return (
    <>
      <PageTransition>
        <Head>
          <title>Goals - Smarter.Poker</title>
        </Head>

        <div className={casinoStyles.shell}>
          <UniversalHeader pageDepth={2} />

          <header className={`sp-command-header ${casinoStyles.marquee}`}>
            <div className={casinoStyles.marqueeArtwork} aria-hidden="true" />
            <div className={casinoStyles.marqueeContent}>
              <div className={casinoStyles.titleBlock}>
                <span className={casinoStyles.eyebrow}>Casino Realism Command · Verified Ledger</span>
                <h1>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: '#25c8ff' }}>
                    <TargetIcon size={30} />
                    Your Goals
                  </span>
                </h1>
                <p>Live Challenge Tracking And Rewards Are Paused Pending Verified Settlement</p>
                <SubpageNavigation />
              </div>
            </div>
          </header>

          <div className={`sp-training-command sp-training-command--challenges sp-command-main ${casinoStyles.commandDeck}`}>
            <section className={casinoStyles.telemetryBar} aria-label="Challenge Ledger Summary">
              <div className={casinoStyles.telemetryCell}>
                <span>Weekly Definitions</span>
                <strong>{weeklyCount}</strong>
                <small>Cataloged</small>
              </div>
              <div className={casinoStyles.telemetryCell}>
                <span>Monthly Definitions</span>
                <strong>{monthlyCount}</strong>
                <small>Cataloged</small>
              </div>
              <div className={`${casinoStyles.telemetryCell} ${casinoStyles.telemetryGold}`}>
                <span>Settlement State</span>
                <strong>Paused</strong>
                <small>Audit Lock</small>
              </div>
            </section>

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
              <div className={`sp-command-grid sp-command-grid--challenges ${casinoStyles.challengeGrid}`}>
                {challenges.map((challenge, i) => {
                  const progress = getProgressPercent(challenge);
                  const isWeekly = challenge.period === 'weekly';

                  return (
                    <motion.div
                      key={challenge.id}
                      className={`sp-command-card ${casinoStyles.challengeCard} ${!isWeekly ? casinoStyles.challengeCardMonthly : ''}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className={casinoStyles.cardHeader}>
                        <div className={`${casinoStyles.typeBadge} ${!isWeekly ? casinoStyles.typeBadgeMonthly : ''}`}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {isWeekly ? <CalendarIcon size={12} /> : <CalendarMonthIcon size={12} />}
                            {isWeekly ? 'Weekly' : 'Monthly'}
                          </span>
                        </div>
                        {challenge.periodKey && (
                          <span className={casinoStyles.periodCode}>{challenge.periodKey}</span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className={casinoStyles.challengeTitle}>{challenge.title}</h3>
                      <p className={casinoStyles.challengeDesc}>{challenge.description}</p>

                      {/* Progress Bar */}
                      <div className={casinoStyles.progressContainer}>
                        <div
                          className={casinoStyles.progressTrack}
                          role="progressbar"
                          aria-label={`${challenge.title} progress`}
                          aria-valuenow={Math.round(progress)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <motion.div
                            className={casinoStyles.progressFill}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: MOTION.slow, delay: i * 0.1 }}
                          />
                        </div>
                        <div className={casinoStyles.progressText}>
                          {challenge.progress} / {challenge.goal}
                        </div>
                      </div>

                      {/* Authority status */}
                      <div className={casinoStyles.rewardRow}>
                        <span className={casinoStyles.statusStamp}>
                          Tracking Paused
                        </span>
                        {Number(challenge.historicalProgress) > 0 && (
                          <span className={casinoStyles.snapshotStamp}>
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
      <HubPageSummary page="training-challenges" as="h1" />
    </>
  );
}
