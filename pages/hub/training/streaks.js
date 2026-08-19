/**
 * TRAINING STREAKS PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 * Visual streak calendar, milestone progress, and reward claiming
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-55 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH6-16 — hex sweep batch 6: extended palette literals routed
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
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
  useTrainingBus('streaks');
  const [user, setUser] = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const _c = new AbortController();
    const u = getAuthUser();
    if (u) setUser(u);
    return () => _c.abort();
  }, []);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`train-streaks:${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'jarvis_training_sessions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          refreshStreak();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id]);

  const swrKey = user ? `/api/training/streak?userId=${user.id}` : null;
  const {
    data: swrData,
    isLoading: loading,
    error: swrError,
    mutate: refreshStreak,
  } = useSWR(swrKey, async (url) => {
    const [streakRes, { data: sessions }] = await Promise.all([
      authedFetch(url).then((r) => r.json()),
      supabase
        .from('jarvis_training_sessions')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const uniqueDays = [
      ...new Set((sessions || []).map((s) => new Date(s.created_at).toISOString().split('T')[0])),
    ];
    return {
      streak:
        streakRes.success && streakRes.streak
          ? streakRes.streak
          : {
              currentStreak: 0,
              longestStreak: 0,
              lastTrainingDate: null,
              streakStartDate: null,
              allMilestones: [],
              claimableMilestones: [],
            },
      trainingDays: uniqueDays,
    };
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

    try {
      const res = await authedFetch('/api/training/streak', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          milestoneDays,
        }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        // Refresh data
        loadStreakData();
        // Emit EventBus for header diamond counter + celebration
        const milestone = STREAK_MILESTONES.find((m) => m.days === milestoneDays);
        if (milestone) {
          busEmit.diamondsEarned(milestone.diamonds, `Streak Milestone: ${milestone.name}`);

          busEmit.sessionEnd('streaks');
          busEmit.celebration('confetti');
        }
      }
    } catch (error) {
      console.warn('Claim error:', error);
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

  if (loading) {
    return (
      <div style={{ ...styles.loadingContainer, padding: 24 }} role="status" aria-label="Loading streak data">
        <SkeletonLoader variant="profile" style={{ maxWidth: 480, margin: '0 auto 24px' }} />
        <SkeletonLoader variant="card" count={2} style={{ maxWidth: 480, margin: '0 auto' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <PageTransition>
        <div style={styles.container}>
          <UniversalHeader pageDepth={2} />
          <TrainerEmptyState
            variant="locked"
            title="Sign in to view your streak"
            message="Daily streaks unlock once you sign in to track your training."
            cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[streaks] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
          />
        </div>
      </PageTransition>
    );
  }

  const calendar = generateCalendar();
  const nextMilestone = STREAK_MILESTONES.find((m) => m.days > streak.currentStreak);

  return (
    <PageTransition>
      <SEOHead
        title="Training Streaks — Stay Consistent"
        description="Build And Maintain Your Daily Training Streaks On Smarter.Poker."
        canonical="/hub/training/streaks"
        noindex={true}
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          <ErrorBanner
            message={swrError ? 'Unable to load streak data.' : null}
            onRetry={() => refreshStreak()}
          />

          {/* At-Risk Warning */}
          {streak.currentStreak >= 3 && (() => {
            const today = new Date().toISOString().split('T')[0];
            const trainedToday = trainingDays.includes(today);
            if (trainedToday) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  marginBottom: 16,
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(249,115,22,0.04))',
                  border: '1px solid rgba(239,68,68,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
                role="alert"
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-accent-red)' }}>
                    Your {streak.currentStreak}-Day Streak Is At Risk!
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginTop: 2 }}>
                    Train today to keep it alive.
                  </div>
                </div>
                <Link
                  href="/hub/training"
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: 'var(--sp-accent-red)',
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Start Training
                </Link>
              </motion.div>
            );
          })()}

          {/* Hero Section */}
          <motion.div
            style={styles.heroSection}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: MOTION.slow }}
          >
            <div style={styles.flameContainer}>
              {/* TRAIN-STREAKS-A11Y-1: SVG flame replaces ▲ hero icon.
                  Color drives the gradient; CSS keeps the pulse animation. */}
              <span style={{ ...styles.flame, color: '#FF6B35', display: 'inline-flex' }} aria-hidden>
                <FlameIcon size={64} />
              </span>
            </div>
            <div style={styles.streakNumber} role="status" aria-label={`${streak.currentStreak} day streak`}>{streak.currentStreak}</div>
            <div style={styles.streakLabel}>Day Streak</div>
            {streak.longestStreak > streak.currentStreak && (
              <div style={styles.longestStreak}>Best: {streak.longestStreak} days</div>
            )}

            {/* Diamond Multiplier Badge */}
            {streak.currentStreak >= 3 && (() => {
              const mult = streak.currentStreak >= 30 ? '5x' : streak.currentStreak >= 14 ? '3x' : streak.currentStreak >= 7 ? '2x' : '1.5x';
              const multColor = streak.currentStreak >= 30 ? 'var(--sp-accent-amber)' : streak.currentStreak >= 14 ? 'var(--sp-accent-purple)' : streak.currentStreak >= 7 ? 'var(--sp-accent-blue)' : 'var(--sp-accent-green)';
              return (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 20,
                  background: `${multColor}10`,
                  border: `1px solid ${multColor}30`,
                  marginTop: 12,
                }}>
                  {/* TRAIN-STREAKS-A11Y-1: SVG diamond replaces fontSize:14 */}
                  <span style={{ display: 'inline-flex', color: multColor }} aria-hidden>
                    <DiamondIcon size={14} />
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: multColor }}>{mult}</span>
                  <span style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>Diamond Multiplier</span>
                </div>
              );
            })()}

            {streak.currentStreak >= 3 && (
              /* TRAIN-STREAKS-A11Y-1: type+aria-label on share-streak button */
              <button
                type="button"
                aria-label={`Share your ${streak.currentStreak}-day streak to your feed`}
                disabled={sharing}
                onClick={async () => {
                  if (sharing) return;
                  setSharing(true);
                  try {
                    const res = await authedFetch('/api/training/share', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: user.id,
                        shareType: 'streak',
                        data: {
                          days: streak.currentStreak,
                        },
                      }),
                    });
                    if (!res.ok) throw new Error(`Request failed (${res.status})`);
                    const data = await res.json();
                    if (data.success) {
                      alert('Streak shared to your feed!');
                    }
                  } catch (e) {
                    console.warn('Share error:', e);
                    alert('Failed to share streak. Please try again.');
                  } finally {
                    setSharing(false);
                  }
                }}
                style={{
                  ...styles.shareStreakBtn,
                  opacity: sharing ? 0.6 : 1,
                  cursor: sharing ? 'not-allowed' : 'pointer',
                }}
              >
                {sharing ? 'Sharing...' : 'Share Streak'}
              </button>
            )}

            {/* Daily Motivational Tip */}
            {(() => {
              const tips = [
                'Consistency beats intensity. 30 minutes every day > 4 hours once a week.',
                'The best players review their mistakes the same day they make them.',
                'Position awareness is the fastest ROI skill. Master your BTN game first.',
                'Review 5 flashcards per day and you will master 50 GTO concepts in 2 weeks.',
                'Warm up with 5 minutes of preflop ranges before every session.',
                'Track your tilt patterns. Most leaks are emotional, not strategic.',
                'The gap between 70% and 90% accuracy is where the real money is hidden.',
              ];
              const dayIdx = Math.floor(Date.now() / 86400000) % tips.length;
              return (
                <div style={{
                  marginTop: 16,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: 11,
                  color: 'var(--sp-fg-muted)',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  {/* TRAIN-STREAKS-A11Y-1: SVG lightbulb replaces inline emoji */}
                  <span style={{ display: 'inline-flex', color: 'var(--sp-accent-amber)', flexShrink: 0, marginTop: 1 }} aria-hidden>
                    <LightbulbIcon size={14} />
                  </span>
                  <span>{tips[dayIdx]}</span>
                </div>
              );
            })()}
          </motion.div>

          {/* Next Milestone Progress */}
          {nextMilestone && (
            <div style={styles.nextMilestoneCard}>
              <div style={styles.nextMilestoneHeader}>
                {/* TRAIN-STREAKS-A11Y-1: route milestone icon via MilestoneIcon */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', color: 'var(--sp-accent-amber)' }} aria-hidden>
                    <MilestoneIcon kind={nextMilestone.iconKind} size={20} />
                  </span>
                  Next: {nextMilestone.name}
                </span>
                <span style={styles.diamondReward}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {/* TRAIN-STREAKS-A11Y-1: SVG diamond replaces */}
                    <span aria-hidden style={{ display: 'inline-flex' }}><DiamondIcon size={14} /></span>
                    {nextMilestone.diamonds}
                  </span>
                </span>
              </div>
              <div
                style={styles.progressBarContainer}
                role="progressbar"
                aria-label={`Progress to ${nextMilestone.name}`}
                aria-valuenow={Math.round((streak.currentStreak / nextMilestone.days) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  style={{
                    ...styles.progressBarFill,
                    width: `${(streak.currentStreak / nextMilestone.days) * 100}%`,
                  }}
                />
              </div>
              <div style={styles.progressText}>
                {streak.currentStreak}/{nextMilestone.days} days
              </div>
            </div>
          )}

          {/* 30-Day Calendar */}
          <section style={styles.section}>
            {/* TRAIN-STREAKS-A11Y-1: SVG calendar icon in section heading */}
            <h2 style={styles.sectionTitle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', color: '#00E0FF' }} aria-hidden>
                  <CalendarIcon size={18} />
                </span>
                Last 30 Days
              </span>
            </h2>
            <div style={styles.calendarGrid}>
              {calendar.map((day, i) => (
                <motion.div
                  key={day.date}
                  style={{
                    ...styles.calendarDay,
                    background: day.trained
                      ? 'linear-gradient(135deg, #FF6B35, #FF4444)'
                      : day.isToday
                        ? 'rgba(0, 224, 255, 0.2)'
                        : '#1a1a1a',
                    border: day.isToday ? '2px solid #00E0FF' : '1px solid rgba(255,255,255,0.1)',
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  aria-label={`${day.date}${day.trained ? ', trained' : ''}${day.isToday ? ', today' : ''}`}
                >
                  <span style={styles.calendarDayNumber}>{day.dayOfMonth}</span>
                  {/* TRAIN-STREAKS-A11Y-1: SVG flame indicator replaces ▲ */}
                  {day.trained && (
                    <span style={styles.trainedIndicator} aria-hidden>
                      <FlameIcon size={10} />
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
            <div style={styles.calendarLegend}>
              <span>
                <span style={styles.legendDot} /> Trained
              </span>
              <span>
                <span style={{ ...styles.legendDot, background: '#00E0FF' }} /> Today
              </span>
            </div>
          </section>

          {/* Milestones */}
          <section style={styles.section}>
            {/* TRAIN-STREAKS-A11Y-1: SVG trophy in section heading */}
            <h2 style={styles.sectionTitle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', color: '#FFD700' }} aria-hidden>
                  <TrophyIcon size={18} />
                </span>
                Milestones
              </span>
            </h2>
            <div style={styles.milestonesGrid}>
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

                return (
                  <motion.div
                    key={milestone.days}
                    style={{
                      ...styles.milestoneCard,
                      opacity: milestone.achieved ? 1 : 0.5,
                      border: isClaimable ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                    }}
                    whileHover={isClaimable ? { scale: 1.02 } : {}}
                  >
                    {/* TRAIN-STREAKS-A11Y-1: SVG milestone icon via MilestoneIcon */}
                    <div style={{ ...styles.milestoneIcon, color: isClaimable ? '#FFD700' : 'var(--sp-fg-muted)', display: 'inline-flex' }} aria-hidden>
                      <MilestoneIcon kind={kind} size={32} />
                    </div>
                    <div style={styles.milestoneInfo}>
                      <div style={styles.milestoneName}>{baseData.name}</div>
                      <div style={styles.milestoneDays}>{baseData.days} days</div>
                    </div>
                    <div style={styles.milestoneReward}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span aria-hidden style={{ display: 'inline-flex', color: '#00E0FF' }}><DiamondIcon size={14} /></span>
                        {baseData.diamonds}
                      </span>
                    </div>
                    {milestone.claimed ? (
                      <div style={styles.claimedBadge}>
                        {/* TRAIN-STREAKS-A11Y-1: SVG check replaces ✓ */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckIcon size={12} />
                          Claimed
                        </span>
                      </div>
                    ) : isClaimable ? (
                      /* TRAIN-STREAKS-A11Y-1: type+aria-label on milestone claim */
                      <button
                        type="button"
                        aria-label={`Claim ${baseData.diamonds} diamonds for ${baseData.name}`}
                        onClick={() => claimMilestone(milestone.days)}
                        disabled={claiming === milestone.days}
                        style={styles.claimButton}
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
  heroSection: {
    textAlign: 'center',
    padding: '40px 20px',
    background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(255, 68, 68, 0.1))',
    borderRadius: '20px',
    marginBottom: '24px',
  },
  flameContainer: {
    marginBottom: '16px',
  },
  flame: {
    fontSize: '64px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  streakNumber: {
    fontSize: '72px',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  streakLabel: {
    fontSize: '20px',
    color: 'var(--sp-fg-muted)',
    marginTop: '8px',
  },
  longestStreak: {
    marginTop: '16px',
    fontSize: '14px',
    color: 'var(--sp-fg-dim)',
    background: 'rgba(255,255,255,0.05)',
    padding: '8px 16px',
    borderRadius: '20px',
    display: 'inline-block',
  },
  shareStreakBtn: {
    marginTop: '20px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
    border: 'none',
    borderRadius: '12px',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    margin: '20px auto 0',
  },
  nextMilestoneCard: {
    background: '#1a1a1a',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
  },
  nextMilestoneHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    fontWeight: 600,
  },
  diamondReward: {
    color: '#00E0FF',
  },
  progressBarContainer: {
    height: '8px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #FF6B35, #FFD700)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
    textAlign: 'center',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
    marginBottom: '16px',
  },
  calendarDay: {
    aspectRatio: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    position: 'relative',
  },
  calendarDayNumber: {
    fontSize: '12px',
    fontWeight: 500,
  },
  trainedIndicator: {
    fontSize: '10px',
    position: 'absolute',
    bottom: '2px',
    color: '#fff',
    display: 'inline-flex',
  },
  calendarLegend: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
  },
  legendDot: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
  milestonesGrid: {
    display: 'grid',
    gap: '12px',
  },
  milestoneCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: '#1a1a1a',
    borderRadius: '12px',
    padding: '16px',
  },
  milestoneIcon: {
    fontSize: '32px',
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneName: {
    fontWeight: 600,
    marginBottom: '4px',
  },
  milestoneDays: {
    fontSize: '13px',
    color: 'var(--sp-fg-muted)',
  },
  milestoneReward: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#00E0FF',
  },
  claimedBadge: {
    fontSize: '14px',
    color: '#31A24C',
    padding: '6px 12px',
    background: 'rgba(49, 162, 76, 0.1)',
    borderRadius: '6px',
  },
  claimButton: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
    border: 'none',
    borderRadius: '6px',
    color: '#000',
    fontWeight: 600,
    cursor: 'pointer',
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
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
  },
  loadingText: {
    color: 'var(--sp-fg-muted)',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 24px',
  },
  button: {
    display: 'inline-block',
    marginTop: '24px',
    padding: '12px 32px',
    background: '#00E0FF',
    color: '#000',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 600,
  },
};
