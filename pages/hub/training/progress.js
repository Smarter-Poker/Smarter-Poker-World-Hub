/**
 * Training Progress Page
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Displays user's training progress, stats, and achievements
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-40 — hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { TrainingConsoleSkeleton } from '../../../src/components/training/console/TrainingConsoleStates';
import sd from '../../../src/styles/training/training-journey-sd.module.css';
import { deriveTrainingSessionAccuracy } from '../../../src/lib/training/sessionEvidence.mjs';



// TRAIN-CSS-MOTION-ADOPT-19 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-5b — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ICON COMPONENTS — TRAIN-PROGRESS-A11Y-1
// SVG replacements for the emoji icons used in StatCard + section titles.
// Stroke colour inherits via currentColor so the parent's colour token
// drives the visual. Handoff §4 'no-emoji-icons' anti-pattern.
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StatIcon({ kind, size = 18, color = 'currentColor' }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, focusable: 'false',
  };
  switch (kind) {
    case 'questions':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'correct':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'accuracy':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'timer':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'streak':
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case 'category':
      return (
        <svg {...common}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
    case 'improve':
      return (
        <svg {...common}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TrainingProgress() {
  const router = useRouter();
  useTrainingBus('training-progress');
  const mountedRef = useRef(false);
  const requestRef = useRef(null);
  const inFlightRef = useRef(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [stats, setStats] = useState({
    totalQuestions: 0,
    correctAnswers: 0,
    accuracy: null,
    totalTime: 0,
    averageTime: 0,
    streak: 0,
    categoryBreakdown: {},
    recentActivity: [],
    weakAreas: [],
  });

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



  const loadProgress = useCallback(async () => {
    if (inFlightRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    inFlightRef.current = true;
    let timedOut = false;
    const deadline = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    if (mountedRef.current) setFetchError(null);
    try {
      const authUser = getAuthUser();
      if (mountedRef.current) setUser(authUser);

      if (!authUser) {
        return;
      }

      // Only sealed attempt projections are eligible for user-facing progress.
      const { data: sessions, error: sessionsError } = await supabase
        .from('training_sessions')
        .select('attempt_id, game_id, game_name, hands_played, correct_count, accuracy, best_streak, created_at, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)')
        .eq('user_id', authUser.id)
        .eq('training_attempts.user_id', authUser.id)
        .eq('training_attempts.status', 'completed')
        .eq('training_attempts.practice_only', false)
        .not('attempt_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)
        .abortSignal(controller.signal); // training sessions

      if (sessionsError) throw sessionsError;

      // Calculate stats
      const totalQuestions =
        sessions?.reduce((sum, s) => sum + (s.hands_played || 0), 0) || 0;
      const correctAnswers = sessions?.reduce((sum, s) => sum + (s.correct_count || 0), 0) || 0;
      const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : null;
      // Canonical training_sessions intentionally does not accept a
      // browser-authored duration. Do not manufacture a time statistic.
      const totalTime = null;
      const averageTime = null;

      // Category breakdown
      const categoryBreakdown = {};
      sessions?.forEach((session) => {
        const category = session.game_name || session.game_id || 'General';
        const answered = Number(session.hands_played) || 0;
        if (answered <= 0) return;
        if (!categoryBreakdown[category]) {
          categoryBreakdown[category] = { total: 0, correct: 0 };
        }
        categoryBreakdown[category].total += answered;
        categoryBreakdown[category].correct += session.correct_count || 0;
      });

      // Recent activity (last 10 sessions)
      const recentActivity =
        sessions?.slice(0, 10).map((s) => ({
          date: new Date(s.created_at),
          category: s.game_name || s.game_id || 'General',
          questions: s.hands_played || 0,
          correct: s.correct_count || 0,
          accuracy: deriveTrainingSessionAccuracy(s),
        })) || [];

      // Weak areas (categories with < 70% accuracy)
      const weakAreas = Object.entries(categoryBreakdown || {})
        .map(([category, data]) => ({
          category,
          accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
          total: data.total,
        }))
        .filter((area) => area.accuracy < 70 && area.total >= 5)
        .sort((a, b) => a.accuracy - b.accuracy);

      // Fetch streak data
      let currentStreak = 0;
      const { data: streakData, error: streakError } = await supabase
        .from('training_streaks')
        .select('current_streak:authority_current_streak')
        .eq('user_id', authUser.id)
        .maybeSingle()
        .abortSignal(controller.signal);

      if (streakError) throw streakError;

      if (streakData) {
        currentStreak = streakData.current_streak || 0;
      }

      if (mountedRef.current && !controller.signal.aborted) {
        setStats({
          totalQuestions,
          correctAnswers,
          accuracy,
          totalTime,
          averageTime,
          streak: currentStreak,
          categoryBreakdown,
          recentActivity,
          weakAreas,
        });
      }
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      console.warn('Error loading progress:', error);
      if (mountedRef.current) {
        setFetchError(timedOut
          ? 'Progress verification timed out. Please try again.'
          : 'Unable to load progress data. Please try again.');
        setStats({
          totalQuestions: 0,
          correctAnswers: 0,
          accuracy: null,
          totalTime: null,
          averageTime: null,
          streak: 0,
          categoryBreakdown: {},
          recentActivity: [],
          weakAreas: [],
        });
      }
    } finally {
      window.clearTimeout(deadline);
      if (requestRef.current === controller) {
        requestRef.current = null;
        inFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadProgress();
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      inFlightRef.current = false;
    };
  }, [loadProgress]);

  // training_sessions is not in the realtime publication. Same-tab saves use
  // EventBus below; cross-tab/device projection changes use bounded,
  // visibility-aware, single-flight polling.
  useEffect(() => {
    if (!user?.id) return undefined;
    const refreshIfVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) loadProgress();
    };
    const pollInterval = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [user?.id, loadProgress]);

  // EventBus SESSION_END listener — refresh when any training session completes.
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', loadProgress);
    return unsub;
  }, [loadProgress]);

  const offlineNotice = !isOnline && (
    <div role="status" data-offline-banner="true" className={sd.notice}>
      Offline. Progress Updates Will Resume After Reconnection.
    </div>
  );

  const seo = (
    <SEOHead title="Training Progress - Your Journey" description="Track Your GTO Training Progress Across All 100 Games And Categories." canonical="/hub/training/progress" noindex={true} />
  );

  // The header and Back row render in every branch (loading, signed out,
  // unavailable, ready) so the page never sits on a bare loading screen.
  const frame = (children) => (
    <div className={`sp-training-journey sp-training-journey--progress ${sd.root}`}>
      <UniversalHeader pageDepth={2} />
      <TrainingPageHead slug="training-progress" />
      <div className={`sp-journey-main ${sd.main}`}>{children}</div>
    </div>
  );

  if (loading) {
    return (
      <PageTransition>
        {seo}
        {frame(<TrainingConsoleSkeleton label="Loading Your Progress" metrics={4} panels={2} rows={3} />)}
      </PageTransition>
    );
  }

  if (!user) {
    return (
      <PageTransition>
        {seo}
        {frame(
          <>
            {offlineNotice}
            <TrainerEmptyState
              variant="locked"
              title="Sign In To View Your Progress"
              message="Track Your Accuracy, Streaks, And Weak Spots Once You Sign In."
              cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[progress] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
            />
          </>
        )}
      </PageTransition>
    );
  }

  if (fetchError) {
    return (
      <PageTransition>
        {seo}
        {frame(
          <>
            {offlineNotice}
            <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); loadProgress(); }} />
            <TrainerEmptyState
              variant="retry"
              title="Training Progress Is Unavailable"
              message="We Could Not Verify Your Sealed Training Sessions. No Zero-History Fallback Has Been Shown."
              cta={{ label: 'Try Again', onClick: () => { setFetchError(null); setLoading(true); loadProgress(); } }}
            />
          </>
        )}
        <ConnectionToast />
      </PageTransition>
    );
  }

  const categories = Object.entries(stats.categoryBreakdown || {});

  return (
    <PageTransition>
      {seo}

      {frame(
        <>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); loadProgress(); }} />

          {offlineNotice}

          {/* Overall Stats */}
          <div className={`sp-journey-stat-grid ${sd.metrics} ${sd.metricsWide}`}>
            {/* TRAIN-PROGRESS-A11Y-1: emoji icon prop replaced with SVG iconKind */}
            <StatCard
              iconKind="questions"
              label="Total Questions"
              value={stats.totalQuestions.toLocaleString()}
            />
            <StatCard
              iconKind="correct"
              label="Correct Answers"
              value={stats.correctAnswers.toLocaleString()}
            />
            <StatCard
              iconKind="accuracy"
              label="Accuracy"
              value={Number.isFinite(stats.accuracy) ? `${stats.accuracy}%` : '-'}
              tone={Number.isFinite(stats.accuracy) ? (stats.accuracy >= 80 ? 'good' : stats.accuracy >= 60 ? 'ice' : 'bad') : 'muted'}
            />
            <StatCard iconKind="timer" label="Avg Time/Question" value={stats.averageTime == null ? 'Unavailable' : `${stats.averageTime}s`} tone={stats.averageTime == null ? 'muted' : undefined} />
            <StatCard
              iconKind="streak"
              label="Current Streak"
              value={`${stats.streak} Days`}
              tone={stats.streak >= 3 ? 'ice' : undefined}
            />
          </div>

          {/* Category Breakdown */}
          <section className={`sp-journey-section ${sd.section}`}>
            <div className={sd.sectionHead}>
              <h2 className={sd.sectionTitle}>
                {/* TRAIN-PROGRESS-A11Y-1: SVG icon */}
                <StatIcon kind="category" size={20} color="currentColor" />
                Category Breakdown
              </h2>
            </div>
            {categories.length === 0 ? (
              <p className={sd.copy}>No Verified Sessions Yet. Finish A Drill And Your Category Accuracy Builds Here.</p>
            ) : (
              <div className={sd.list}>
                {categories.map(([category, data]) => {
                  const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                  return (
                    <CategoryCard
                      key={category}
                      category={category}
                      total={data.total}
                      correct={data.correct}
                      accuracy={accuracy}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Weak Areas */}
          {stats.weakAreas.length > 0 && (
            <section className={`sp-journey-section ${sd.section}`}>
              <div className={sd.sectionHead}>
                <h2 className={sd.sectionTitle}>
                  {/* TRAIN-PROGRESS-A11Y-1: SVG icon */}
                  <StatIcon kind="improve" size={20} color="currentColor" />
                  Areas To Improve
                </h2>
              </div>
              <div className={sd.list}>
                {stats.weakAreas.map((area) => (
                  <WeakAreaCard key={area.category} {...area} />
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section className={`sp-journey-section ${sd.section}`}>
            <div className={sd.sectionHead}>
              <h2 className={sd.sectionTitle}>
                {/* TRAIN-PROGRESS-A11Y-1: SVG icon */}
                <StatIcon kind="activity" size={20} color="currentColor" />
                Recent Activity
              </h2>
            </div>
            {stats.recentActivity.length === 0 ? (
              <p className={sd.copy}>Your Ten Most Recent Verified Sessions Appear Here.</p>
            ) : (
              <div className={sd.list}>
                {stats.recentActivity.map((activity, i) => (
                  <ActivityCard key={i} {...activity} />
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <div className={sd.actions}>
            <Link href="/hub/training" className={`${sd.button} ${sd.primary}`}>
              Continue Training
            </Link>
            <Link href="/hub/training/leaderboard" className={sd.button}>
              View Leaderboard
            </Link>
          </div>
        </>
      )}
      <ConnectionToast />
    </PageTransition>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// COMPONENTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// TRAIN-PROGRESS-A11Y-1: iconKind takes precedence; legacy icon accepted for back-compat.
// tone: 'good' / 'bad' only for real accuracy bands, 'ice' emphasis, 'muted' unavailable.
const TONE_CLASS = { good: sd.good, bad: sd.bad, ice: sd.ice, muted: sd.muted };

function StatCard({ iconKind, icon, label, value, tone }) {
  return (
    <motion.div className={`sp-journey-stat-card ${sd.metric}`} whileHover={{ scale: 1.02 }} transition={{ duration: MOTION.standard }}>
      <span className={sd.metricIcon}>
        {iconKind ? <StatIcon kind={iconKind} size={24} color="currentColor" /> : icon}
      </span>
      <div className={`${sd.metricValue} ${TONE_CLASS[tone] || ''}`}>{value}</div>
      <div className={sd.metricLabel}>{label}</div>
    </motion.div>
  );
}

function CategoryCard({ category, total, correct, accuracy }) {
  const strong = accuracy >= 70;
  return (
    <div className={`sp-journey-data-card ${sd.card}`}>
      <div className={sd.row}>
        <span className={sd.title}>{category}</span>
        <span className={`${sd.value} ${strong ? sd.good : ''}`}>{accuracy}%</span>
      </div>
      <div className={sd.copy}>{correct}/{total} Correct</div>
      <div className={sd.meter}>
        <div className={sd.meterFill} data-tone={strong ? 'good' : undefined} style={{ width: `${accuracy}%` }} />
      </div>
    </div>
  );
}

function WeakAreaCard({ category, accuracy }) {
  return (
    <div className={`sp-journey-data-card sp-journey-data-card--warning ${sd.card}`} data-tone="bad">
      <div className={sd.row}>
        <span className={sd.title}>{category}</span>
        <span className={`${sd.value} ${sd.bad}`}>{accuracy}%</span>
      </div>
      <p className={sd.copy}>Practice More {category} Questions To Improve</p>
    </div>
  );
}

function ActivityCard({ date, category, questions, correct, accuracy }) {
  return (
    <div className={`sp-journey-data-card ${sd.card} ${sd.activity}`}>
      <div className={sd.activityDate}>
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      <div>
        <div className={sd.title}>{category}</div>
        <div className={sd.copy}>
          {correct}/{questions} Correct ({Number.isFinite(accuracy) ? `${accuracy}%` : 'Accuracy Not Available'})
        </div>
      </div>
    </div>
  );
}

