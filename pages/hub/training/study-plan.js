/**
 * STUDY PLAN GENERATOR — Verified Or Authored Weekly Training Schedule
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes user session data to identify weak spots and generates a 7-day
 * training plan with recommended games and daily goals.
 *
 * Route: /hub/training/study-plan
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-16 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-50 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
// TRAIN-CSS-MOTION-ADOPT-9 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING LIBRARY REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

const FOCUS_AREAS = [
  {
    id: 'bb-defense',
    gameId: 'cash-003',
    name: 'BB Defense',
    positions: ['BB'],
    streets: ['preflop'],
    color: 'var(--sp-accent-blue)',
    icon: '',
  },
  {
    id: 'btn-play',
    gameId: 'cash-001',
    name: 'BTN Play',
    positions: ['BTN'],
    streets: ['preflop'],
    color: 'var(--sp-accent-green)',
    icon: '',
  },
  {
    id: 'cbet-decisions',
    gameId: 'cash-002',
    name: 'C-Bet Decisions',
    positions: [],
    streets: ['flop'],
    color: '#86daff',
    icon: '',
  },
  {
    id: 'turn-play',
    gameId: 'cash-024',
    name: 'Turn Play',
    positions: [],
    streets: ['turn'],
    color: '#86daff',
    icon: '',
  },
  {
    id: 'river-decisions',
    gameId: 'cash-012',
    name: 'River Decisions',
    positions: [],
    streets: ['river'],
    color: 'var(--sp-accent-red)',
    icon: '',
  },
  {
    id: '3bet-pots',
    gameId: 'cash-007',
    name: '3-Bet Pots',
    positions: [],
    streets: ['flop'],
    color: '#86daff',
    icon: '',
  },
  {
    id: 'mtt-push-fold',
    gameId: 'mtt-001',
    name: 'MTT Push/Fold',
    positions: [],
    streets: ['preflop'],
    color: '#86daff',
    icon: '',
  },
  {
    id: 'position-awareness',
    gameId: 'cash-006',
    name: 'Position Play',
    positions: ['CO', 'HJ', 'MP'],
    streets: ['preflop'],
    color: 'var(--sp-accent-cyan)',
    icon: '',
  },
  {
    id: 'sb-play',
    gameId: 'cash-018',
    name: 'SB Strategy',
    positions: ['SB'],
    streets: ['preflop'],
    color: '#86daff',
    icon: '♠',
  },
  {
    id: 'bluffing',
    gameId: 'mtt-024',
    name: 'Bluffing Spots',
    positions: [],
    streets: ['river'],
    color: '#f43f5e',
    icon: '',
  },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DIFFICULTY_LABELS = { easy: 'Foundation', medium: 'Tactical', hard: 'Advanced' };

// ═══════════════════════════════════════════════════════════════════════════
// PLAN GENERATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function generateStudyPlan(sessions) {
  const plan = [];
  const weakAreas = analyzeWeaknesses(sessions);

  // Build 7-day schedule
  for (let i = 0; i < 7; i++) {
    const dayAreas = [];
    const isRestDay = i === 6; // Sunday: lighter load

    if (isRestDay) {
      // Light review day
      dayAreas.push({
        ...FOCUS_AREAS[i % FOCUS_AREAS.length],
        difficulty: 'easy',
        goal: 85,
        questionCount: 15,
        reason: 'Review day - keep sharp without burnout',
      });
    } else {
      // Main weak area focus
      const primaryWeakness =
        weakAreas[i % weakAreas.length] || FOCUS_AREAS[i % FOCUS_AREAS.length];
      dayAreas.push({
        ...primaryWeakness,
        difficulty: 'medium',
        goal: 80,
        questionCount: 25,
        reason: primaryWeakness.weakness
          ? `You\'re at ${primaryWeakness.accuracy}% here - needs work`
          : 'Balanced training to fill gaps',
      });

      // Secondary area (different from primary)
      const secondaryIdx = (i + 3) % FOCUS_AREAS.length;
      const secondary = FOCUS_AREAS[secondaryIdx];
      if (secondary.id !== primaryWeakness.id) {
        dayAreas.push({
          ...secondary,
          difficulty: i < 3 ? 'easy' : 'medium',
          goal: 75,
          questionCount: 15,
          reason: 'Diversify your training',
        });
      }

      // Every other day: add a challenge drill
      if (i % 2 === 0) {
        dayAreas.push({
        id: 'challenge',
        gameId: 'quiz-gauntlet',
          name: 'Daily Challenge',
          color: '#86daff',
          icon: '★',
          difficulty: 'hard',
          goal: 70,
          questionCount: 10,
          reason: 'Push your limits with harder spots',
        });
      }
    }

    plan.push({
      day: DAYS[i],
      dayIndex: i,
      areas: dayAreas,
      totalQuestions: dayAreas.reduce((sum, a) => sum + a.questionCount, 0),
      completed: false,
    });
  }

  return plan;
}

function analyzeWeaknesses(sessions) {
  if (!sessions || sessions.length === 0) {
    // No data — return default rotation
    return FOCUS_AREAS.slice(0, 5);
  }

  // Group sessions by game_id prefix to identify weak categories
  const categoryStats = {};
  sessions.forEach((s) => {
    const category = (s.game_id || '').split('-')[0] || 'unknown';
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, correct: 0, sessions: 0, evLoss: 0, measuredEvDecisions: 0 };
    }
    categoryStats[category].total += s.hands_played || s.total_questions || 0;
    categoryStats[category].correct += s.correct_count || s.correct_answers || 0;
    categoryStats[category].sessions += 1;
    const measuredDecisions = Number(s.measured_ev_decisions) || 0;
    const measuredLoss = s.total_ev_loss === null || s.total_ev_loss === undefined
      ? null
      : Number(s.total_ev_loss);
    if (measuredDecisions > 0 && Number.isFinite(measuredLoss)) {
      categoryStats[category].evLoss += measuredLoss;
      categoryStats[category].measuredEvDecisions += measuredDecisions;
    }
  });

  // Compute accuracy per category and rank by weakness
  const ranked = Object.entries(categoryStats || {})
    .map(([cat, stats]) => ({
      category: cat,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      evLoss: stats.measuredEvDecisions > 0 ? stats.evLoss : null,
      measuredEvDecisions: stats.measuredEvDecisions,
      sessions: stats.sessions,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  // Map weakest categories to focus areas
  const weakFocusAreas = ranked.slice(0, 5).map((r, idx) => {
    const matchedArea =
      FOCUS_AREAS.find(
        (f) => f.id.includes(r.category) || r.category.includes(f.id.split('-')[0])
      ) || FOCUS_AREAS[idx % FOCUS_AREAS.length];

    return {
      ...matchedArea,
      weakness: true,
      accuracy: r.accuracy,
      evLoss: r.evLoss,
    };
  });

  return weakFocusAreas.length > 0 ? weakFocusAreas : FOCUS_AREAS.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// DAY CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function DayCard({ dayPlan, isToday, onStartArea, completedGames }) {
  const [expanded, setExpanded] = useState(isToday);
  const allDone = dayPlan.areas.every((area) => completedGames.has(area.gameId));

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sd-panel ${st.dayCard}`}
      data-today={isToday ? 'true' : undefined}
      aria-label={`${dayPlan.day} Plan`}
    >
      {/* Header */}
      <motion.button
        type="button"
        onClick={() => setExpanded(!expanded)}
        whileTap={{ scale: 0.99 }}
        aria-expanded={expanded}
        className={st.dayToggle}
      >
        <span className={st.dayBadge} data-state={allDone ? 'done' : isToday ? 'today' : 'idle'} aria-hidden>
          {allDone ? '✓' : isToday ? '▶' : dayPlan.dayIndex + 1}
        </span>
        <span className={st.dayText}>
          <span className={st.itemTitle}>
            {dayPlan.day}{' '}
            {isToday && <span className={st.ice}>· Today</span>}
            {allDone && <span className={st.ice}> · Complete</span>}
          </span>
          <span className={st.small}>
            {dayPlan.areas.length} Focus {dayPlan.areas.length === 1 ? 'Area' : 'Areas'} ·{' '}
            {dayPlan.totalQuestions} Questions
          </span>
        </span>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className={st.chevron} aria-hidden>
          ▼
        </motion.span>
      </motion.button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION.standard }}
            style={{ overflow: 'hidden' }}
          >
            <div className={st.dayAreas}>
              {dayPlan.areas.map((area, areaIdx) => {
                const isDone = completedGames.has(area.gameId);

                return (
                  <motion.button
                    type="button"
                    key={areaIdx}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartArea(area)}
                    className={`sd-button ${st.savedRow}`}
                    data-done={isDone ? 'true' : undefined}
                  >
                    <span className={st.savedText}>
                      <span className={st.presetName}>
                        {area.icon ? `${area.icon} ` : ''}{area.name}
                      </span>
                      {isDone && <span className={st.doneNote}>✓ Practiced This Week</span>}
                      <span className={st.presetDesc}>{area.reason}</span>
                    </span>
                    <span className={st.areaGoal}>
                      <strong>{area.questionCount}Q</strong>
                      <span>Goal: {area.goal}%</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function StudyPlanPage() {
  const router = useRouter();
  useTrainingBus('study-plan');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  // `null` means session history is unavailable or has not been verified. An
  // empty array means the server successfully verified that this player has no
  // completed sessions yet, which is the only state that may use a starter plan.
  const [sessions, setSessions] = useState(null);
  const [recentAnswers, setRecentAnswers] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [effectiveStackBb, setEffectiveStackBb] = useState(100);

  const leakAnalysis = useMemo(() => {
    const rawAnalysis = analyzeVerifiedTrainingWeaknesses(
      Array.isArray(sessions) ? sessions : [],
      Array.isArray(recentAnswers) ? recentAnswers : [],
    );
    const verifiedTop = rawAnalysis?.topSpotLeak || rawAnalysis?.spotLeaks?.[0] || rawAnalysis?.leaks?.[0] || null;
    const hasVerifiedLeak = Boolean(verifiedTop && (verifiedTop.sample || verifiedTop.sampleCount || 0) >= 3);
    const topLeak = hasVerifiedLeak
      ? {
          gameId: verifiedTop.gameId || 'cash-002',
          variant: verifiedTop.variant || activeVariant || 'nlh',
          street: verifiedTop.street || 'flop',
          position: verifiedTop.position || 'BB',
          sampleSize: Number(verifiedTop.sample || verifiedTop.sampleCount || 3),
          evLossBb: Number(verifiedTop.evLossBb || 0),
          avgEvLossBb: Number(verifiedTop.avgEvLossBb || Number(((verifiedTop.evLossBb || 0) / Math.max(1, verifiedTop.sample || 1)).toFixed(2))),
          accuracy: Number(verifiedTop.acc ?? 60),
        }
      : {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant || 'nlh',
          street: 'flop',
          position: 'BB',
          sampleSize: Number(rawAnalysis?.totalHands || 0),
          evLossBb: 0,
          avgEvLossBb: 0,
          accuracy: Number(rawAnalysis?.overallAcc ? Math.round(rawAnalysis.overallAcc) : 75),
        };
    return {
      hasVerifiedLeak,
      topLeak,
      rawAnalysis,
    };
  }, [sessions, recentAnswers, activeVariant]);

  const topLeak = leakAnalysis.topLeak;
  const topLeakDrillHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: topLeak.gameId,
          variant: topLeak.variant,
          street: topLeak.street,
          heroPosition: topLeak.position,
          position: topLeak.position,
          stackDepth: effectiveStackBb,
        },
        'dynamic-leak-curriculum',
      ),
    [topLeak, effectiveStackBb],
  );

  // Get current day of week (0 = Monday)
  const today = new Date();
  const todayIdx = (today.getDay() + 6) % 7; // JS Sunday=0 → shift so Monday=0

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setPlan(null);
    const user = getAuthUser();
    const token = getAccessToken();
    if (!user?.id && !token) {
      setSignedOut(true);
      setSessions(null);
      setRecentAnswers([]);
      setLoading(false);
      return;
    }
    setSignedOut(false);
    try {
      const [res, leakRes] = await Promise.all([
        authedFetch(`/api/training/get-sessions?limit=100`),
        authedFetch(`/api/training/get-sessions?limit=50&includeAnswers=1`).catch(() => null),
      ]);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data?.success !== true || !Array.isArray(data.sessions)) {
        throw new Error('Verified Training history was not returned.');
      }
      setSessions(data.sessions);
      if (leakRes && leakRes.ok) {
        const leakData = await leakRes.json().catch(() => null);
        setRecentAnswers(Array.isArray(leakData?.recentAnswers) ? leakData.recentAnswers : []);
      } else {
        setRecentAnswers(Array.isArray(data.recentAnswers) ? data.recentAnswers : []);
      }
    } catch (e) {
      console.warn('[StudyPlan] Fetch error:', e);
      setSessions(null);
      setRecentAnswers([]);
      setFetchError('Unable To Load Study Plan Data. Please Try Again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate plan from sessions
  useEffect(() => {
    if (!loading && !fetchError && !signedOut && Array.isArray(sessions)) {
      const newPlan = generateStudyPlan(sessions);
      setPlan(newPlan);
    }
  }, [fetchError, loading, sessions, signedOut]);

  // Fetch on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Bus listener — refresh when session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchSessions());
    return unsub;
  }, [fetchSessions]);

  const handleStartArea = (area) => {
    if (area.id === 'challenge') {
      router.push('/hub/training/arena/quiz-gauntlet?level=1&source=study-plan');
      return;
    }
    router.push(buildCustomTrainingArenaHref({
      gameId: area.gameId,
      format: area.gameId?.startsWith('mtt-') ? 'mtt' : 'cash',
      positions: area.positions,
      streets: area.streets,
      stackDepth: area.gameId === 'mtt-001' ? 10 : 100,
    }, 'study-plan'));
  };

  const regeneratePlan = () => {
    if (!Array.isArray(sessions)) return;
    const newPlan = generateStudyPlan(sessions);
    setPlan(newPlan);
  };

  // Only server-returned completed sessions can mark a plan item practiced.
  // Navigation itself never authors completion.
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const verifiedSessions = Array.isArray(sessions) ? sessions : [];
  const hasVerifiedHistory = verifiedSessions.length > 0;
  const isAuthoredStarterPlan = Array.isArray(sessions) && sessions.length === 0;
  const completedGames = new Set(
    verifiedSessions
      .filter((session) => {
        const timestamp = new Date(session.completed_at || session.created_at || 0).getTime();
        return Number.isFinite(timestamp) && timestamp >= weekStart.getTime();
      })
      .map((session) => session.game_id)
      .filter(Boolean),
  );
  const totalCompleted = plan
    ? plan.reduce(
        (sum, day) => sum + day.areas.filter((area) => completedGames.has(area.gameId)).length,
        0,
      )
    : 0;
  const totalAreas = plan ? plan.reduce((sum, d) => sum + d.areas.length, 0) : 0;
  const progress = totalAreas > 0 ? Math.round((totalCompleted / totalAreas) * 100) : 0;

  return (
    <>
      <Head>
        <title>Study Plan | Smarter.Poker GTO Training</title>
              <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={`sp-training-journey sp-training-journey--study-plan ${st.shell}`}>
        <TrainingPageHead slug="training-study-plan">
          <p className="sp-head-note">
            {loading
              ? 'Loading Verified Training History'
              : signedOut
                ? 'Sign In To Build Your Schedule'
                : fetchError
                  ? 'Training History Unavailable'
                  : isAuthoredStarterPlan
                    ? 'Authored Starter Schedule'
                    : 'Personalized From Verified Training History'}
          </p>
          {plan && (
            <button type="button" className="sd-button" onClick={regeneratePlan}>
              New Plan
            </button>
          )}
        </TrainingPageHead>

        <div className={`sp-journey-main ${st.page} ${st.journey}`}>
          <section
            data-dynamic-leak-curriculum="true"
            data-leak-variant={topLeak.variant}
            data-leak-street={topLeak.street}
            data-leak-position={topLeak.position}
            data-leak-sample-count={topLeak.sampleSize}
            data-leak-basis={leakAnalysis.hasVerifiedLeak ? 'verified-history' : 'baseline-calibration'}
            className={`sd-panel ${st.panel}`}
            aria-labelledby="priority-leak-title"
          >
            <div className={st.panelHead}>
              <div>
                <p className={st.eyebrow}>#1 Priority Leak Curriculum</p>
                <h2 id="priority-leak-title" className={st.title}>
                  {String(topLeak.variant).toUpperCase()} · {String(topLeak.street).toUpperCase()} · {topLeak.position}
                </h2>
              </div>
              <span className={`${st.tag} ${leakAnalysis.hasVerifiedLeak ? st.tagActive : ''}`}>
                {leakAnalysis.hasVerifiedLeak ? 'Verified Leak History' : 'Baseline Calibration'} · N = {topLeak.sampleSize}
              </span>
            </div>
            <dl className={st.facts}>
              <div><dt>Target Module</dt><dd className="no-capitalize">{topLeak.gameId}</dd></div>
              <div><dt>Sample Count</dt><dd>N = {topLeak.sampleSize}</dd></div>
              <div><dt>Total EV Loss</dt><dd>{topLeak.evLossBb} BB</dd></div>
              <div><dt>Avg EV Loss</dt><dd>{topLeak.avgEvLossBb} BB/Hand</dd></div>
            </dl>
            <button
              type="button"
              data-drill-priority-leak-cta="true"
              data-drill-href={topLeakDrillHref}
              onClick={() => router.push(topLeakDrillHref)}
              className={`sd-button sd-primary ${st.block}`}
            >
              Drill Priority #1 Leak In Club Arena ({String(topLeak.variant).toUpperCase()} · {String(topLeak.street).toUpperCase()} · {topLeak.position}) →
            </button>
          </section>

          {!loading && signedOut && (
            <section role="status" className={`sd-panel ${st.panel} ${st.state}`}>
              <h2 className={st.title}>Sign In To Build Your Study Plan</h2>
              <p className={st.copy}>
                Personalized Progress Requires Verified Training History. No Schedule Or Completion Totals Are Inferred While Signed Out.
              </p>
              <button
                type="button"
                onClick={() => router.push('/auth/login?redirect=/hub/training/study-plan')}
                className="sd-button sd-primary"
              >
                Sign In
              </button>
            </section>
          )}
          {!loading && !signedOut && (fetchError || !Array.isArray(sessions)) && (
            <ErrorBanner
              message={fetchError || 'Verified Training History Is Unavailable.'}
              onRetry={fetchSessions}
            />
          )}
          {/* Progress Overview */}
          {plan && !loading && !fetchError && !signedOut && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`sd-panel ${st.panel}`}
              aria-label="Week Progress"
            >
              <div className={st.grid2}>
                <div className={st.statBlock}>
                  <span className={st.metricLabel}>Week Progress</span>
                  <strong className={st.metricValue}>{progress}%</strong>
                </div>
                <div className={`${st.statBlock} ${st.statRight}`}>
                  <span className={st.metricLabel}>Drills Completed</span>
                  <strong className={st.metricValue} data-tone="ice">{totalCompleted}/{totalAreas}</strong>
                </div>
              </div>
              {/* Progress bar */}
              <div className={st.track} role="progressbar" aria-label="Week Progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: MOTION.glacial, ease: 'easeOut' }}
                  className={st.fill}
                />
              </div>
            </motion.section>
          )}

          {/* Loading State */}
          {loading && (
            <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading Study Plan">
              <div className={st.skeleton} aria-hidden><span /><span /><span /><span /><span /><span /></div>
              <p className={st.small}>Loading Verified Training History...</p>
            </section>
          )}

          {/* Weakness Insights (data-driven transparency) */}
          {plan && hasVerifiedHistory && (() => {
            const weaknesses = analyzeWeaknesses(verifiedSessions);
            const dataWeaknesses = weaknesses.filter((w) => w.weakness && w.accuracy !== undefined);
            if (dataWeaknesses.length === 0) return null;
            return (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`sd-panel ${st.panel}`}
                aria-labelledby="weak-spots-title"
              >
                <h2 id="weak-spots-title" className={st.title}>Your Weak Spots (Based On Data)</h2>
                <div className={st.list}>
                  {dataWeaknesses.slice(0, 3).map((w, i) => (
                    <div key={i} className={`${st.item} ${st.rowItem}`}>
                      <span className={st.itemTitle}>
                        {w.icon ? `${w.icon} ` : ''}{w.name}
                      </span>
                      <span className={st.areaGoal}>
                        <strong className={w.accuracy < 50 ? st.down : w.accuracy < 70 ? st.ice : st.up}>
                          {w.accuracy}%
                        </strong>
                        {w.measuredEvDecisions > 0 && w.evLoss !== null && (
                          <span className={st.down}>
                            {Math.round(w.evLoss * 10) / 10} BB Measured EV Loss
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.section>
            );
          })()}

          {/* Today's Focus — CTA */}
          {hasVerifiedHistory && (() => {
            const allWeaknesses = analyzeWeaknesses(verifiedSessions);
            const focusWeaknesses = allWeaknesses.filter((w) => w.weakness && w.accuracy !== undefined);
            if (focusWeaknesses.length === 0) return null;
            const focus = focusWeaknesses[Math.floor(Date.now() / 86400000) % focusWeaknesses.length];
            if (!focus) return null;
            return (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`sd-panel ${st.panel} ${st.rowItem}`}
                aria-label="Today's Focus"
              >
                <div>
                  <p className={st.eyebrow}>Today's Focus</p>
                  <div className={st.itemTitle}>
                    {focus.icon} {focus.name}
                  </div>
                  <div className={st.small}>
                    {focus.accuracy}% Accuracy - Needs Attention
                  </div>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleStartArea(focus, 'focus-0')}
                  className="sd-button sd-primary"
                >
                  Start Training
                </motion.button>
              </motion.section>
            );
          })()}

          {/* Day Cards */}
          {plan &&
            plan.map((dayPlan, idx) => (
              <DayCard
                key={idx}
                dayPlan={dayPlan}
                isToday={idx === todayIdx}
                onStartArea={handleStartArea}
                completedGames={completedGames}
              />
            ))}

          {/* Footer tip */}
          {plan && (
            <p className={`${st.small} ${st.centerNote}`}>
              {isAuthoredStarterPlan
                ? 'This Is An Authored Starter Plan Because No Verified Sessions Were Found.'
                : 'Plan Regenerates Each Week From Your Latest Verified Performance.'}
              <br />
              Training Completion And Streaks Are Recorded Only By The Server.
            </p>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
