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
import { useRouter } from 'next/router';
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
import sd from '../../../src/styles/training/training-smarterdesign.module.css';
import TrainingPageHead, { TrainingDailyNav } from '../../../src/components/training/TrainingPageHead';



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

const GOALS_HELP = (
  <>
    <p>Live Challenge Tracking And Rewards Are Paused Pending Verified Settlement.</p>
    <p>Review Historical Weekly And Monthly Challenge Definitions And Access Daily Solver Assignments. A Historical Snapshot Shows Progress Recorded Before Tracking Was Paused.</p>
  </>
);

export default function ChallengesPage() {
  const router = useRouter();
  useTrainingBus('challenges');
  const [user, setUser] = useState(null);
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

  const renderBrainPanel = () => (
    <>
      {!isOnline && (
        <p role="status" data-offline-banner="true" className={sd.offline}>
          Offline. Challenge Ledger Sync Will Resume After Reconnection.
        </p>
      )}
    </>
  );

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
          <div className={sd.page}>
            <div className={casinoStyles.marquee}>
              <TrainingPageHead slug="training-goals" title="Training Challenges" helpContent={GOALS_HELP} nav={<TrainingDailyNav current="/hub/training/challenges" />} />
            </div>
            {renderBrainPanel()}
            <section className={`sd-panel ${sd.panel} ${sd.state}`} aria-labelledby="goals-sign-in-title">
              <h2 id="goals-sign-in-title" className={sd.sectionTitle}>Sign In To Track Goals</h2>
              <p className={sd.copy}>Sign In To Review Challenge Availability And Historical Snapshots.</p>
              <Link href="/auth/login?redirect=/hub/training/challenges" className={`sd-button sd-primary ${casinoStyles.primaryButton}`}>
                Sign In
              </Link>
            </section>
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

          <div className={sd.page}>
            <div className={casinoStyles.marquee}>
              <TrainingPageHead slug="training-goals" title="Your Goals" helpContent={GOALS_HELP} nav={<TrainingDailyNav current="/hub/training/challenges" />} />
            </div>
            {renderBrainPanel()}

            <section className={sd.metrics} aria-label="Challenge Ledger Summary">
              <div className={`sd-metric ${sd.metric}`}>
                <span className={sd.metricLabel}>Weekly Goals</span>
                <strong className={sd.metricValue}>{weeklyCount}</strong>
              </div>
              <div className={`sd-metric ${sd.metric}`}>
                <span className={sd.metricLabel}>Monthly Goals</span>
                <strong className={sd.metricValue}>{monthlyCount}</strong>
              </div>
              <div className={`sd-metric ${sd.metric}`}>
                <span className={sd.metricLabel}>Live Tracking</span>
                <strong className={sd.metricValue} data-tone="ice">Paused</strong>
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
              swrError ? null : (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Active Goals Right Now"
                  message="Check Back Soon For New Challenges."
                />
              )
            ) : (
              <div className={sd.cardGrid}>
                {challenges.map((challenge, i) => {
                  const progress = getProgressPercent(challenge);
                  const isWeekly = challenge.period === 'weekly';

                  return (
                    <motion.article
                      key={challenge.id}
                      className={`sd-panel ${sd.goalCard}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 6) * 0.05, duration: MOTION.standard }}
                    >
                      <div className={sd.goalMeta}>
                        <span className={`${sd.tag} ${!isWeekly ? sd.tagMonthly : ''}`}>
                          {isWeekly ? <CalendarIcon size={13} /> : <CalendarMonthIcon size={13} />}
                          {isWeekly ? 'Weekly' : 'Monthly'}
                        </span>
                        {challenge.periodKey && (
                          <span className={sd.periodCode}>{challenge.periodKey}</span>
                        )}
                      </div>

                      <h3 className={sd.goalTitle}>{challenge.title}</h3>
                      <p className={sd.copy}>{challenge.description}</p>

                      <div className={sd.goalProgress}>
                        <div
                          className={sd.track}
                          role="progressbar"
                          aria-label={`${challenge.title} progress`}
                          aria-valuenow={Math.round(progress)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <motion.div
                            className={`${sd.fill} ${sd.fillIcm}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: MOTION.slow, delay: Math.min(i, 6) * 0.05 }}
                          />
                        </div>
                        <span className={sd.goalCount}>{challenge.progress} / {challenge.goal}</span>
                      </div>

                      {/* Authority status */}
                      <div className={sd.status}>
                        <span className={sd.statusPill}>Tracking Paused</span>
                        {Number(challenge.historicalProgress) > 0 && (
                          <span className={sd.statusPill} data-tone="ice">
                            Historical Snapshot: {challenge.historicalProgress} / {challenge.goal}
                          </span>
                        )}
                      </div>
                    </motion.article>
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
