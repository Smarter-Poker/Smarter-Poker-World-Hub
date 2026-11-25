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
import { useState, useEffect, useMemo } from 'react';
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
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import casinoStyles from '../../../src/styles/training/challenges-casino.module.css';

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const DEFAULT_BOARD_CARDS = ['8d', '5c', '2s'];

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
  const router = useRouter();
  useTrainingBus('challenges');
  const [user, setUser] = useState(null);
  const [brainVariant, setBrainVariant] = useState('nlh');
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

  const brainSpotInput = useMemo(
    () => ({
      gameId: brainVariant === 'nlh' ? 'cash-002' : 'cash-005',
      variant: brainVariant,
      street: 'flop',
      position: 'BTN',
      stackDepth: 100,
    }),
    [brainVariant]
  );

  const brainDecision = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[brainVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const raw = evaluateTrainingSpotWithHorseBrain({
      gameId: brainSpotInput.gameId,
      variant: brainVariant,
      street: 'flop',
      heroCards,
      boardCards: DEFAULT_BOARD_CARDS,
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 6.5,
      toCall: 2.2,
      effectiveStackBb: 100,
    });
    const engineSource = raw.engineSource || raw.engineModule || 'holdem-brain.js';
    const recommendedAction = raw.recommendedAction || raw.correctAnswerText || raw.correctAnswer || 'Call 2.2 BB';
    const recommendedSizingBb =
      raw.recommendedSizingBb ??
      raw.potLimitSizing?.twoThirdsPotBetOrRaise ??
      raw.brainEvaluation?.potLimitBounds?.twoThirdsPotBetOrRaise ??
      4.5;
    const equityPct = raw.equityPct ?? raw.handScore ?? 68;
    const madeHandCategory = raw.madeHandCategory || raw.brainEvaluation?.madeHandCategory || 'postflop_hand';
    const potLimitMaxBetBb =
      raw.potLimitMaxBetBb ??
      raw.brainEvaluation?.potLimitMaxBetBb ??
      raw.potLimitSizing?.maxPotBetOrRaise ??
      10.9;
    return {
      ...raw,
      engineSource,
      recommendedAction,
      recommendedSizingBb,
      equityPct,
      madeHandCategory,
      potLimitMaxBetBb,
    };
  }, [brainVariant, brainSpotInput]);

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
        <div
          role="status"
          data-offline-banner="true"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 0,
            border: '1px solid rgba(251, 191, 36, 0.4)',
            background: 'rgba(251, 191, 36, 0.08)',
            color: '#fde68a',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Offline Mode Detected: Local Horse Brain Spot Evaluation Remains Active While Challenge Ledger Sync Waits For Reconnection.
        </div>
      )}
      {brainDecision && (
        <div
          data-specialty-brain-panel="true"
          data-brain-engine={brainDecision.engineSource}
          data-recommended-action={brainDecision.recommendedAction}
          data-active-variant={brainVariant}
          style={{
            marginBottom: 20,
            padding: 18,
            borderRadius: 0,
            border: '1px solid rgba(37, 200, 255, 0.4)',
            background: 'rgba(6, 15, 24, 0.88)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 900, color: '#25c8ff', textTransform: 'uppercase' }}>
              Horse Brain Spot Preview &amp; 1:1 Club Arena Drill Launcher
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#39d59b' }}>
              Engine: {brainDecision.engineSource} | Action: {brainDecision.recommendedAction}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
              <button
                key={v}
                type="button"
                data-variant-option={v}
                aria-pressed={brainVariant === v}
                onClick={() => setBrainVariant(v)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 2,
                  border: brainVariant === v ? '1px solid #25c8ff' : '1px solid rgba(255,255,255,0.16)',
                  background: brainVariant === v ? 'rgba(37, 200, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                  color: brainVariant === v ? '#e8fbff' : '#cbd5e1',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
              marginBottom: 12,
              fontSize: 12,
            }}
          >
            <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Engine Source</div>
              <div style={{ color: '#f2f7fa', fontWeight: 800 }}>{brainDecision.engineSource}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Recommended Action</div>
              <div style={{ color: '#39d59b', fontWeight: 800 }}>{brainDecision.recommendedAction}</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Sizing</div>
              <div style={{ color: '#25c8ff', fontWeight: 800 }}>{brainDecision.recommendedSizingBb} BB</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Equity</div>
              <div style={{ color: '#f2b84b', fontWeight: 800 }}>{brainDecision.equityPct}%</div>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Made Hand</div>
              <div style={{ color: '#f2f7fa', fontWeight: 800 }}>{brainDecision.madeHandCategory}</div>
            </div>
            {brainVariant.startsWith('plo') && (
              <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#8ca4b0', fontWeight: 700 }}>Pot-Limit Max Bet</div>
                <div style={{ color: '#25c8ff', fontWeight: 800 }}>{brainDecision.potLimitMaxBetBb} BB</div>
              </div>
            )}
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
            {brainDecision.explanation}
          </p>

          <button
            type="button"
            data-launch-club-arena-cta="true"
            onClick={() => router.push(buildCustomTrainingArenaHref(brainSpotInput, 'challenges'))}
            style={{
              padding: '10px 14px',
              borderRadius: 2,
              border: '1px solid #25c8ff',
              background: 'rgba(37, 200, 255, 0.2)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Launch Challenge Spot In Club Arena →
          </button>
        </div>
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
            {renderBrainPanel()}
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
            {renderBrainPanel()}
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
