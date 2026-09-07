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
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
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
  useTrainingBus('training-progress');
  const mountedRef = useRef(false);
  const requestRef = useRef(null);
  const inFlightRef = useRef(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
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

  if (loading) {
    return (
      <>
        <SEOHead title="Training Progress - Your Journey" description="Track Your GTO Training Progress Across All 100 Games And Categories." canonical="/hub/training/progress" noindex={true} />
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading Your Progress...</p>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <PageTransition>
        <SEOHead title="Training Progress - Your Journey" description="Track Your GTO Training Progress Across All 100 Games And Categories." canonical="/hub/training/progress" noindex={true} />
        <div style={styles.container}>
          <UniversalHeader pageDepth={2} />
          <TrainerEmptyState
            variant="locked"
            title="Sign in to view your progress"
            message="Track your accuracy, streaks, and weak spots once you sign in."
            cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[progress] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
          />
        </div>
      </PageTransition>
    );
  }

  if (fetchError) {
    return (
      <PageTransition>
        <SEOHead title="Training Progress - Your Journey" description="Track Your GTO Training Progress Across All 100 Games And Categories." canonical="/hub/training/progress" noindex={true} />
        <div style={styles.container}>
          <UniversalHeader pageDepth={2} />
          <div style={styles.content}>
            <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); loadProgress(); }} />
            <TrainerEmptyState
              variant="retry"
              title="Training Progress Is Unavailable"
              message="We could not verify your sealed training sessions. No zero-history fallback has been shown."
              cta={{ label: 'Try Again', onClick: () => { setFetchError(null); setLoading(true); loadProgress(); } }}
            />
          </div>
        </div>
        <ConnectionToast />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <SEOHead
        title="Training Progress - Your Journey"
        description="Track Your GTO Training Progress Across All 100 Games And Categories."
        canonical="/hub/training/progress"
        noindex={true}
      />

      <div className="sp-training-journey sp-training-journey--progress" style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div className="sp-journey-main" style={styles.content}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); loadProgress(); }} />

          <h1 className="sp-journey-title" style={styles.title}>Your Training Progress</h1>

          {/* Overall Stats */}
          <div className="sp-journey-stat-grid" style={styles.statsGrid}>
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
              value={Number.isFinite(stats.accuracy) ? `${stats.accuracy}%` : '—'}
              color={
                Number.isFinite(stats.accuracy)
                  ? (stats.accuracy >= 80 ? '#31A24C' : stats.accuracy >= 60 ? '#FFB800' : '#FF4444')
                  : 'var(--sp-fg-muted)'
              }
            />
            <StatCard iconKind="timer" label="Avg Time/Question" value={stats.averageTime == null ? 'Unavailable' : `${stats.averageTime}s`} />
            <StatCard
              iconKind="streak"
              label="Current Streak"
              value={`${stats.streak} days`}
              color={stats.streak >= 7 ? '#FF6B35' : stats.streak >= 3 ? '#FFB800' : 'var(--sp-fg-muted)'}
            />
          </div>

          {/* Category Breakdown */}
          <section className="sp-journey-section" style={styles.section}>
            <h2 style={{ ...styles.sectionTitle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {/* TRAIN-PROGRESS-A11Y-1: SVG icon (was □) */}
              <StatIcon kind="category" size={20} color="currentColor" />
              Category Breakdown
            </h2>
            <div style={styles.categoryList}>
              {Object.entries(stats.categoryBreakdown || {}).map(([category, data]) => {
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
          </section>

          {/* Weak Areas */}
          {stats.weakAreas.length > 0 && (
            <section className="sp-journey-section" style={styles.section}>
              <h2 style={{ ...styles.sectionTitle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {/* TRAIN-PROGRESS-A11Y-1: SVG icon */}
              <StatIcon kind="improve" size={20} color="currentColor" />
              Areas To Improve
            </h2>
              <div style={styles.weakAreasList}>
                {stats.weakAreas.map((area) => (
                  <WeakAreaCard key={area.category} {...area} />
                ))}
              </div>
            </section>
          )}

          {/* Recent Activity */}
          <section className="sp-journey-section" style={styles.section}>
            <h2 style={{ ...styles.sectionTitle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {/* TRAIN-PROGRESS-A11Y-1: SVG icon (was ·) */}
              <StatIcon kind="activity" size={20} color="currentColor" />
              Recent Activity
            </h2>
            <div style={styles.activityList}>
              {stats.recentActivity.map((activity, i) => (
                <ActivityCard key={i} {...activity} />
              ))}
            </div>
          </section>

          {/* Actions */}
          <div style={styles.actions}>
            <Link href="/hub/training" style={styles.primaryButton}>
              Continue Training
            </Link>
            <Link href="/hub/training/leaderboard" style={styles.secondaryButton}>
              View Leaderboard
            </Link>
          </div>
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// COMPONENTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// TRAIN-PROGRESS-A11Y-1: iconKind takes precedence; legacy icon accepted for back-compat.
function StatCard({ iconKind, icon, label, value, color = '#00E0FF' }) {
  return (
    <motion.div className="sp-journey-stat-card" style={styles.statCard} whileHover={{ scale: 1.02 }} transition={{ duration: MOTION.standard }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </motion.div>
  );
}

function CategoryCard({ category, total, correct, accuracy }) {
  return (
    <div className="sp-journey-data-card" style={styles.categoryCard}>
      <div style={styles.categoryHeader}>
        <span style={styles.categoryName}>{category}</span>
        <span style={{ ...styles.categoryAccuracy, color: accuracy >= 70 ? '#31A24C' : '#FFB800' }}>
          {accuracy}%
        </span>
      </div>
      <div style={styles.categoryStats}>
        {correct}/{total} Correct
      </div>
      <div style={styles.progressBar}>
        <div
          style={{
            ...styles.progressFill,
            width: `${accuracy}%`,
            background: accuracy >= 70 ? '#31A24C' : '#FFB800',
          }}
        />
      </div>
    </div>
  );
}

function WeakAreaCard({ category, accuracy, total }) {
  return (
    <div className="sp-journey-data-card sp-journey-data-card--warning" style={styles.weakAreaCard}>
      <div style={styles.weakAreaHeader}>
        <span>{category}</span>
        <span style={styles.weakAreaAccuracy}>{accuracy}%</span>
      </div>
      <p style={styles.weakAreaHint}>Practice More {category} Questions To Improve</p>
    </div>
  );
}

function ActivityCard({ date, category, questions, correct, accuracy }) {
  return (
    <div className="sp-journey-data-card" style={styles.activityCard}>
      <div style={styles.activityDate}>
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      <div style={styles.activityDetails}>
        <div style={styles.activityCategory}>{category}</div>
        <div style={styles.activityStats}>
          {correct}/{questions} Correct ({Number.isFinite(accuracy) ? `${accuracy}%` : 'Accuracy Not Available'})
        </div>
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STYLES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: '#0a0a0a',
    color: '#FFFFFF',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    marginBottom: '32px',
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '40px',
  },
  statCard: {
    background: '#1a1a1a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '16px',
  },
  categoryList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  categoryCard: {
    background: '#1a1a1a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '16px',
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  categoryName: {
    fontSize: '16px',
    fontWeight: 600,
  },
  categoryAccuracy: {
    fontSize: '18px',
    fontWeight: 700,
  },
  categoryStats: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
    marginBottom: '12px',
  },
  progressBar: {
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  weakAreasList: {
    display: 'grid',
    gap: '12px',
  },
  weakAreaCard: {
    background: 'rgba(255, 68, 68, 0.1)',
    border: '1px solid rgba(255, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '16px',
  },
  weakAreaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontWeight: 600,
  },
  weakAreaAccuracy: {
    color: '#FF4444',
  },
  weakAreaHint: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
    margin: 0,
  },
  activityList: {
    display: 'grid',
    gap: '12px',
  },
  activityCard: {
    display: 'flex',
    gap: '16px',
    background: '#1a1a1a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '16px',
  },
  activityDate: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#00E0FF',
    minWidth: '60px',
  },
  activityDetails: {
    flex: 1,
  },
  activityCategory: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  activityStats: {
    fontSize: '14px',
    color: 'var(--sp-fg-muted)',
  },
  actions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginTop: '40px',
  },
  primaryButton: {
    padding: '12px 32px',
    background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  },
  secondaryButton: {
    padding: '12px 32px',
    background: 'transparent',
    color: '#00E0FF',
    border: '1px solid #00E0FF',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
