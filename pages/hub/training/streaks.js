/**
 * TRAINING STREAKS PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual streak calendar, milestone progress, and reward claiming
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-55 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-16 — hex sweep batch 6: extended palette literals routed
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TrainingPageHead, { TrainingDailyNav } from '../../../src/components/training/TrainingPageHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';



// TRAIN-CSS-MOTION-ADOPT-26 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-5c — adoption: shared empty-state primitive

// BUG FIX (TRAIN-STREAKS-A11Y-1): SVG icon components replacing the page's
// emoji set. The milestone data structure adds an `iconKind` discriminator
// so the visual icon comes from a typed SVG component (MilestoneIcon)
// instead of an emoji string. Same surface-specific a11y pattern as PR
// #320/#322/#324/#327/#328/#329.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function FlameIcon({ size = 64 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z" />
    </svg>
  );
}
function BoltIcon({ size = 32 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function MuscleIcon({ size = 32 }) {
  // simple flexed-arm pictograph
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 14c2-4 6-6 9-6 4 0 7 3 7 7 0 3-2 5-5 5h-2c-2 0-4-1-5-3l-4-3z" />
      <path d="M9 15c1-1 2-1 3 0" />
    </svg>
  );
}
function TrophyIcon({ size = 32 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}
function CrownIcon({ size = 32 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z" />
      <path d="M4 19h16" />
    </svg>
  );
}
function StarIcon({ size = 32 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function MedalIcon({ size = 32 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="14" r="7" />
      <path d="M8.21 13.89 6 22l6-3 6 3-2.21-8.12" />
      <path d="M9 7h6" />
    </svg>
  );
}
function DiamondIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M11 3 8 9l4 12 4-12-3-6" />
      <path d="M2 9h20" />
    </svg>
  );
}
function CalendarIcon({ size = 18 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function CheckIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function LightbulbIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function MilestoneIcon({ kind, size = 32 }) {
  switch (kind) {
    case 'flame':  return <FlameIcon size={size} />;
    case 'bolt':   return <BoltIcon size={size} />;
    case 'muscle': return <MuscleIcon size={size} />;
    case 'trophy': return <TrophyIcon size={size} />;
    case 'crown':  return <CrownIcon size={size} />;
    case 'star':   return <StarIcon size={size} />;
    case 'medal':  return <MedalIcon size={size} />;
    default:       return <FlameIcon size={size} />;
  }
}

// Milestone definitions (must match API). `iconKind` is the visual
// discriminator — kept alongside legacy `icon` emoji string so that
// downstream consumers reading from the API (which still ships the
// emoji) continue to function until the API migrates.
const STREAK_MILESTONES = [
  { days: 3, diamonds: 25, name: '3-Day Streak', icon: '▲', iconKind: 'flame'},
  { days: 7, diamonds: 75, name: 'Week Warrior', icon: '', iconKind: 'bolt'},
  { days: 14, diamonds: 150, name: 'Two Week Champion', icon: '', iconKind: 'muscle'},
  { days: 30, diamonds: 400, name: 'Monthly Master', icon: '', iconKind: 'trophy'},
  { days: 60, diamonds: 800, name: 'Double Month Legend', icon: '', iconKind: 'crown'},
  { days: 100, diamonds: 2000, name: 'Century Grinder', icon: '', iconKind: 'star'},
  { days: 365, diamonds: 10000, name: 'Year of Dedication', icon: '', iconKind: 'medal'},
];

export default function StreaksPage() {
  const router = useRouter();
  useTrainingBus('streaks');
  const [user, setUser] = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [claimReceipt, setClaimReceipt] = useState(null);
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



  useEffect(() => {
    const _c = new AbortController();
    const u = getAuthUser();
    if (u) setUser(u);
    return () => _c.abort();
  }, []);
  const swrKey = user ? '/api/training/streak' : null;
  const {
    data: swrData,
    isLoading: loading,
    error: swrError,
    mutate: refreshStreak,
  } = useSWR(swrKey, async (url) => {
    const streakRes = await authedFetch(url).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success !== true || !payload?.streak) {
        throw new Error(payload?.error || `Streak request failed (${response.status})`);
      }
      return payload;
    });
    return {
      streak: streakRes.streak,
      trainingDays: Array.isArray(streakRes.trainingDays) ? streakRes.trainingDays : [],
    };
  }, {
    refreshInterval: 30_000,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
  });

  const streak = swrData?.streak || {
    currentStreak: 0,
    longestStreak: 0,
    lastTrainingDate: null,
    streakStartDate: null,
    allMilestones: [],
    claimableMilestones: [],
  };
  const trainingDays = swrData?.trainingDays || [];

  const loadStreakData = () => refreshStreak();

  // Bus listener — auto-refresh streaks when a training session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => refreshStreak());
    return unsub;
  }, [refreshStreak]);

  const claimMilestone = async (milestoneDays) => {
    if (!user) return;
    setClaiming(milestoneDays);
    setClaimError(null);
    setClaimReceipt(null);

    try {
      const res = await authedFetch('/api/training/streak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestoneDays,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success !== true) {
        throw new Error(data?.error || `Claim request failed (${res.status})`);
      }
      if (data.success) {
        setClaimReceipt({
          milestoneDays,
          diamondsAwarded: Number(data.diamondsAwarded) || 0,
          diamondsAwardedTotal: Number(data.diamondsAwardedTotal) || 0,
          entitlementDiamonds: Number(data.entitlementDiamonds) || 0,
          diamondsRemaining: Number(data.diamondsRemaining) || 0,
          milestoneCompleted: data.milestoneCompleted === true,
        });
        // Refresh data
        await loadStreakData();
        // Emit EventBus for header diamond counter + celebration
        const milestone = STREAK_MILESTONES.find((m) => m.days === milestoneDays);
        if (milestone && Number(data.diamondsAwarded) > 0) {
          busEmit.diamondsEarned(Number(data.diamondsAwarded), `Streak Milestone: ${milestone.name}`);

          busEmit.sessionEnd('streaks');
          if (data.milestoneCompleted) busEmit.celebration('confetti');
        }
      }
    } catch (error) {
      console.warn('Claim error:', error);
      setClaimError(error?.message || 'The milestone claim could not be verified.');
    } finally {
      setClaiming(null);
    }
  };

  // Generate 30-day calendar
  const generateCalendar = () => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayOfMonth: date.getDate(),
        isToday: i === 0,
        trained: trainingDays.includes(dateStr),
      });
    }
    return days;
  };

  const offlineNotice = !isOnline && (
    <div role="status" data-offline-banner="true" className={sd.notice}>
      Offline. Streak Updates Will Resume After Reconnection.
    </div>
  );

  const pageHead = (
    <TrainingPageHead slug="training-streaks" nav={<TrainingDailyNav current="/hub/training/streaks" />} />
  );

  if (loading) {
    return (
      <PageTransition>
        <SEOHead title="Training Streaks - Stay Consistent" description="Build And Maintain Your Daily Training Streaks On Smarter.Poker." canonical="/hub/training/streaks" noindex={true} />
        <div className={`sp-training-journey sp-training-journey--streaks ${sd.root}`}>
          <UniversalHeader pageDepth={2} />
          {pageHead}
          <div className={`sp-journey-main ${sd.main}`}>
            <TrainingConsoleSkeleton label="Loading Streak Data" metrics={1} panels={2} rows={3} />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!user) {
    return (
      <PageTransition>
        <SEOHead title="Training Streaks - Stay Consistent" description="Build And Maintain Your Daily Training Streaks On Smarter.Poker." canonical="/hub/training/streaks" noindex={true} />
        <div className={`sp-training-journey sp-training-journey--streaks ${sd.root}`}>
          <UniversalHeader pageDepth={2} />
          {pageHead}
          <div className={`sp-journey-main ${sd.main}`}>
            {offlineNotice}
            <TrainerEmptyState
              variant="locked"
              title="Sign In To View Your Streak"
              message="Daily Streaks Unlock Once You Sign In To Track Your Training."
              cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[streaks] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
            />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (swrError) {
    return (
      <PageTransition>
        <SEOHead title="Training Streaks - Stay Consistent" description="Build And Maintain Your Daily Training Streaks On Smarter.Poker." canonical="/hub/training/streaks" noindex={true} />
        <div className={`sp-training-journey sp-training-journey--streaks ${sd.root}`}>
          <UniversalHeader pageDepth={2} />
          {pageHead}
          <div className={`sp-journey-main ${sd.main}`}>
            {offlineNotice}
            <ErrorBanner message="Unable to verify your training streak." onRetry={() => refreshStreak()} />
            <TrainerEmptyState
              variant="retry"
              title="Training Streak Is Unavailable"
              message="We Could Not Verify Sealed Training Sessions. No Zero-Streak Fallback Has Been Shown."
              cta={{ label: 'Try Again', onClick: () => refreshStreak() }}
            />
          </div>
        </div>
        <ConnectionToast />
      </PageTransition>
    );
  }

  const calendar = generateCalendar();
  const nextMilestone = STREAK_MILESTONES.find((m) => m.days > streak.currentStreak);
  const tips = [
    'Consistency beats intensity. 30 minutes every day > 4 hours once a week.',
    'The best players review their mistakes the same day they make them.',
    'Position awareness is the fastest ROI skill. Master your BTN game first.',
    'Review 5 flashcards per day and you will master 50 GTO concepts in 2 weeks.',
    'Warm up with 5 minutes of preflop ranges before every session.',
    'Track your tilt patterns. Most leaks are emotional, not strategic.',
    'The gap between 70% and 90% accuracy is where the real money is hidden.',
  ];
  const tipOfTheDay = tips[Math.floor(Date.now() / 86400000) % tips.length];
  const todayKey = new Date().toISOString().split('T')[0];
  const streakAtRisk = streak.currentStreak >= 3 && !trainingDays.includes(todayKey);

  return (
    <PageTransition>
      <SEOHead
        title="Training Streaks - Stay Consistent"
        description="Build And Maintain Your Daily Training Streaks On Smarter.Poker."
        canonical="/hub/training/streaks"
        noindex={true}
      />

      <div className={`sp-training-journey sp-training-journey--streaks ${sd.root}`}>
        <UniversalHeader pageDepth={2} />

        {pageHead}

        <div className={`sp-journey-main ${sd.main}`}>
          {offlineNotice}

          <ErrorBanner
            message={swrError ? 'Unable to load streak data.' : null}
            onRetry={() => refreshStreak()}
          />

          {/* At-Risk Warning */}
          {streakAtRisk && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${sd.card} ${sd.row}`}
              data-tone="bad"
              role="alert"
            >
              <div>
                <div className={`${sd.title} ${sd.bad}`}>
                  Your {streak.currentStreak}-Day Streak Is At Risk
                </div>
                <div className={sd.copy}>Train Today To Keep It Alive.</div>
              </div>
              <Link href="/hub/training" className={`${sd.button} ${sd.primary}`} style={{ flex: '0 0 auto' }}>
                Start Training
              </Link>
            </motion.div>
          )}

          {/* Hero Section */}
          <motion.div
            className={`sp-journey-hero-meter ${sd.panel} ${sd.streakHero}`}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: MOTION.slow }}
          >
            {/* TRAIN-STREAKS-A11Y-1: SVG flame replaces the hero glyph. */}
            <span className={sd.metricIcon} aria-hidden>
              <FlameIcon size={48} />
            </span>
            <div className={sd.streakNumber} role="status" aria-label={`${streak.currentStreak} day streak`}>{streak.currentStreak}</div>
            <div className={sd.metricLabel}>Day Streak</div>
            {streak.longestStreak > streak.currentStreak && (
              <div className={sd.copy}>Best: <strong className={sd.ice}>{streak.longestStreak} Days</strong></div>
            )}

            {streak.currentStreak >= 3 && (
              /* TRAIN-STREAKS-A11Y-1: type+aria-label on share-streak button */
              <button
                type="button"
                aria-label={`Feed sharing is unavailable for your ${streak.currentStreak}-day streak`}
                disabled
                title="Feed Sharing Reopens After Verified Streak Settlement Is Certified"
                className={sd.button}
              >
                Feed Sharing Unavailable
              </button>
            )}

            {/* Daily Motivational Tip */}
            <div className={sd.tip}>
              {/* TRAIN-STREAKS-A11Y-1: SVG lightbulb replaces inline emoji */}
              <span className={sd.ice} aria-hidden>
                <LightbulbIcon size={16} />
              </span>
              <span>{tipOfTheDay}</span>
            </div>
          </motion.div>

          {/* Next Milestone Progress */}
          {nextMilestone && (
            <div className={sd.card}>
              <div className={sd.row}>
                {/* TRAIN-STREAKS-A11Y-1: route milestone icon via MilestoneIcon */}
                <span className={`${sd.title} ${sd.inline}`}>
                  <span className={sd.ice} aria-hidden>
                    <MilestoneIcon kind={nextMilestone.iconKind} size={20} />
                  </span>
                  Next: {nextMilestone.name}
                </span>
                <span className={`${sd.value} ${sd.inline}`}>
                  {/* TRAIN-STREAKS-A11Y-1: SVG diamond */}
                  <span aria-hidden className={sd.inline}><DiamondIcon size={14} /></span>
                  {nextMilestone.diamonds}
                </span>
              </div>
              <div
                className={sd.meter}
                role="progressbar"
                aria-label={`Progress to ${nextMilestone.name}`}
                aria-valuenow={Math.round((streak.currentStreak / nextMilestone.days) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={sd.meterFill}
                  style={{ width: `${(streak.currentStreak / nextMilestone.days) * 100}%` }}
                />
              </div>
              <div className={`${sd.copy} ${sd.alignEnd}`}>
                {streak.currentStreak}/{nextMilestone.days} Days
              </div>
            </div>
          )}

          {/* 30-Day Calendar */}
          <section className={sd.section}>
            <div className={sd.sectionHead}>
              {/* TRAIN-STREAKS-A11Y-1: SVG calendar icon in section heading */}
              <h2 className={sd.sectionTitle}>
                <CalendarIcon size={18} />
                Last 30 Days
              </h2>
            </div>
            <div className={sd.calendar}>
              {calendar.map((day, i) => (
                <motion.div
                  key={day.date}
                  className={sd.calendarDay}
                  data-trained={day.trained || undefined}
                  data-today={day.isToday || undefined}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  aria-label={`${day.date}${day.trained ? ', trained' : ''}${day.isToday ? ', today' : ''}`}
                >
                  <span>{day.dayOfMonth}</span>
                  {/* TRAIN-STREAKS-A11Y-1: SVG flame indicator */}
                  {day.trained && (
                    <span className={sd.calendarFlame} aria-hidden>
                      <FlameIcon size={10} />
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
            <div className={sd.legend}>
              <span><i className={sd.legendTrained} /> Trained</span>
              <span><i className={sd.legendToday} /> Today</span>
            </div>
          </section>

          {/* Milestones */}
          <section className={sd.section}>
            <div className={sd.sectionHead}>
              {/* TRAIN-STREAKS-A11Y-1: SVG trophy in section heading */}
              <h2 className={sd.sectionTitle}>
                <TrophyIcon size={18} />
                Milestones
              </h2>
            </div>
            <ErrorBanner
              message={claimError}
              onRetry={claiming ? null : () => setClaimError(null)}
            />
            {claimReceipt && (
              <div className={sd.notice} role="status">
                {claimReceipt.milestoneCompleted
                  ? `${claimReceipt.entitlementDiamonds} Diamonds Verified And Paid.`
                  : `${claimReceipt.diamondsAwardedTotal} Of ${claimReceipt.entitlementDiamonds} Diamonds Paid. ${claimReceipt.diamondsRemaining} Remain For The Next Monthly Award Window.`}
              </div>
            )}
            <div className={sd.milestoneGrid}>
              {(
                streak.allMilestones ||
                STREAK_MILESTONES.map((m) => ({
                  ...m,
                  achieved: m.days <= streak.currentStreak,
                  claimed: false,
                }))
              ).map((milestone) => {
                const isClaimable = milestone.achieved && !milestone.claimed;
                // Merge legacy server payload with our local iconKind metadata.
                const baseData = {
                  ...(STREAK_MILESTONES.find((m) => m.days === milestone.days) || milestone),
                  ...milestone,
                };
                const kind = baseData.iconKind || (STREAK_MILESTONES.find((m) => m.days === milestone.days) || {}).iconKind || 'flame';
                const entitlement = Number.isInteger(Number(milestone.entitlementDiamonds))
                  ? Number(milestone.entitlementDiamonds)
                  : baseData.diamonds;
                const partialSettlement = milestone.settlementStatus === 'partial';
                const pendingVerification = milestone.settlementStatus === 'historical_credit_pending_verification';

                return (
                  <motion.div
                    key={milestone.days}
                    className={`${sd.card} ${sd.milestone}`}
                    data-tone={milestone.claimed ? 'good' : isClaimable ? 'ice' : undefined}
                    data-locked={milestone.achieved ? undefined : true}
                    whileHover={isClaimable ? { scale: 1.02 } : {}}
                  >
                    {/* TRAIN-STREAKS-A11Y-1: SVG milestone icon via MilestoneIcon */}
                    <div className={isClaimable ? sd.ice : sd.muted} aria-hidden>
                      <MilestoneIcon kind={kind} size={30} />
                    </div>
                    <div className={sd.title}>{baseData.name}</div>
                    <div className={sd.copy}>{baseData.days} Days</div>
                    <div className={`${sd.value} ${sd.inline}`}>
                      <span aria-hidden className={sd.inline}><DiamondIcon size={14} /></span>
                      {entitlement}
                    </div>
                    {partialSettlement && (
                      <div className={sd.copy} role="status">
                        {milestone.diamondsAwardedTotal} Paid · {milestone.diamondsRemaining} Remaining · Retry Next Month
                      </div>
                    )}
                    {pendingVerification && (
                      <div className={sd.copy} role="status">
                        Historical Credit Is Pending Verification
                      </div>
                    )}
                    {milestone.claimed ? (
                      <div className={`${sd.good} ${sd.inline} ${sd.stateLabel}`}>
                        {/* TRAIN-STREAKS-A11Y-1: SVG check */}
                        <CheckIcon size={12} />
                        Claimed
                      </div>
                    ) : partialSettlement || pendingVerification ? (
                      <button type="button" disabled className={sd.button}>
                        {partialSettlement ? 'Retry Next Month' : 'Verification Pending'}
                      </button>
                    ) : isClaimable ? (
                      /* TRAIN-STREAKS-A11Y-1: type+aria-label on milestone claim */
                      <button
                        type="button"
                        aria-label={`Claim ${baseData.diamonds} diamonds for ${baseData.name}`}
                        onClick={() => claimMilestone(milestone.days)}
                        disabled={claiming === milestone.days}
                        className={`${sd.button} ${sd.primary}`}
                      >
                        {claiming === milestone.days ? 'Claiming...' : 'Claim'}
                      </button>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}
