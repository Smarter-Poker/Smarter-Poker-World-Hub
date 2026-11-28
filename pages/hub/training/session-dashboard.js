/**
 * SESSION HISTORY DASHBOARD — Training Progress Tracker
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Aggregates all training sessions from Supabase and visualizes progress
 * over time with SVG charts, streak tracking, and per-game breakdowns.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH4-6 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-42 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { normalizeScoreToPercent } from '../../../src/engines/GTOScoreEngine';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import sc from '../../../src/styles/training/sessions-coaching.module.css';
// TRAIN-WIRE-EMPTY-1a — adoption: shared empty-state primitive


function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sessionAccuracyPercent(session) {
  const accuracy = nullableNumber(session?.accuracy);
  if (accuracy !== null) return accuracy;
  if (Number(session?.score_scale) !== 2) return null;
  const signed = nullableNumber(session?.gtow_score_signed ?? session?.gtow_score ?? session?.gtowScore);
  return signed === null ? null : normalizeScoreToPercent(signed, 2);
}

function measuredSessionEvLoss(session) {
  if ((Number(session?.measured_ev_decisions) || 0) <= 0) return null;
  return nullableNumber(session?.total_ev_loss ?? session?.totalEVLoss);
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SVG LINE CHART COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function LineChart({ data, width = 600, height = 200, color = 'var(--sp-accent-cyan)', label = '' }) {
  const measuredData = (Array.isArray(data) ? data : []).filter((entry) => nullableNumber(entry?.value) !== null);
  if (measuredData.length < 2) {
    return (
      <div className={sc.copy} style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
        {measuredData.length === 1 ? 'Need More Measured Sessions For Chart' : 'No Measured Data Yet'}
      </div>
    );
  }

  const values = measuredData.map((d) => Number(d.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = { top: 20, bottom: 30, left: 40, right: 20 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / (values.length - 1)) * chartW,
    y: padding.top + chartH - ((v - min) / range) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  const gradientId = `sd-chart-gradient-${String(label || 'trend').replace(/[^a-z0-9]+/gi, '-')}`;

  // Grid lines
  const gridLines = 4;
  const gridY = Array.from({ length: gridLines + 1 }, (_, i) => ({
    y: padding.top + (i / gridLines) * chartH,
    label: (max - (i / gridLines) * range).toFixed(range < 5 ? 2 : 0),
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block', maxWidth: '100%', height: 'auto', overflow: 'visible' }} role="img" aria-label={label || 'Trend Chart'}>
      {/* Grid */}
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padding.left} y1={g.y} x2={width - padding.right} y2={g.y} stroke="rgba(124,158,187,0.22)" strokeDasharray="4" />
          <text x={padding.left - 6} y={g.y + 3} textAnchor="end" fill="#bdd0e2" fontSize={12}>{g.label}</text>
        </g>
      ))}

      {/* Area fill */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
          {/* Label (only show every few) */}
          {(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && measuredData[i]?.label && (
            <text x={p.x} y={padding.top + chartH + 16} textAnchor="middle" fill="#bdd0e2" fontSize={12}>
              {measuredData[i].label}
            </text>
          )}
        </g>
      ))}

      {/* Label */}
      {label && (
        <text x={padding.left} y={12} fill="#f2f7ff" fontSize={13} fontWeight={700}>
          {label}
        </text>
      )}
    </svg>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STAT TILE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StatTile({ label, value, tone, subtitle }) {
  return (
    <div className={`sd-metric ${sc.metric}`}>
      <strong className={sc.metricValue} data-tone={tone}>{value}</strong>
      <span className={sc.metricLabel}>{label}</span>
      {subtitle && <span className={sc.metricLabel} style={{ opacity: 0.85 }}>{subtitle}</span>}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GAME TYPE PERFORMANCE TABLE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function PerformanceTable({ sessions }) {
  const gameStats = useMemo(() => {
    const stats = {};
    sessions.forEach((s) => {
      const game = s.game_id || s.gameId || 'unknown';
      if (!stats[game]) stats[game] = { sessions: 0, totalAccuracy: 0, accuracyCount: 0, totalHands: 0, totalEV: 0, measuredEVCount: 0 };
      stats[game].sessions++;
      const accuracy = sessionAccuracyPercent(s);
      if (accuracy !== null) {
        stats[game].totalAccuracy += accuracy;
        stats[game].accuracyCount += 1;
      }
      stats[game].totalHands += Number(s.hands_played || s.handsPlayed) || 0;
      const evLoss = measuredSessionEvLoss(s);
      if (evLoss !== null) {
        stats[game].totalEV += evLoss;
        stats[game].measuredEVCount += Number(s.measured_ev_decisions) || 0;
      }
    });
    return Object.entries(stats || {})
      .map(([game, s]) => ({
        game: game.replace(/_/g, ' '),
        sessions: s.sessions,
        avgAccuracy: s.accuracyCount > 0 ? Math.round(s.totalAccuracy / s.accuracyCount) : null,
        totalHands: s.totalHands,
        avgEV: s.measuredEVCount > 0 ? s.totalEV / s.measuredEVCount : null,
        measuredEVCount: s.measuredEVCount,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  if (gameStats.length === 0) return null;

  return (
    <section className={`sd-panel ${sc.panel}`} aria-labelledby="per-game-performance-title">
      <h2 id="per-game-performance-title" className={sc.sectionTitle}>Per-Game Performance</h2>
      <div className={sc.tableWrap}>
        <table className={sc.table}>
          <thead>
            <tr>
              {['Game', 'Sessions', 'Hands', 'Avg Accuracy', 'Avg Measured EV Loss'].map((h) => (
                <th key={h} scope="col">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gameStats.slice(0, 12).map((g) => (
              <tr key={g.game}>
                <td style={{ textTransform: 'capitalize', overflowWrap: 'anywhere' }}>{g.game}</td>
                <td>{g.sessions}</td>
                <td>{g.totalHands}</td>
                <td className={g.avgAccuracy === null ? '' : g.avgAccuracy >= 75 ? sc.up : g.avgAccuracy >= 50 ? sc.ice : sc.down}>
                  {g.avgAccuracy === null ? '-' : `${g.avgAccuracy}%`}
                </td>
                <td className={sc.ice}>
                  {g.avgEV === null ? '-' : `${g.avgEV.toFixed(3)} BB`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STREAK TRACKER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StreakTracker({ sessions }) {
  const streaks = useMemo(() => {
    if (!sessions || sessions.length === 0) return { current: 0, best: 0, days: [] };

    // Sort by date
    const sorted = [...sessions].sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp));

    // Extract unique days
    const daySet = new Set();
    sorted.forEach((s) => {
      const date = new Date(s.created_at || s.timestamp);
      if (!isNaN(date.getTime())) {
        daySet.add(date.toISOString().split('T')[0]);
      }
    });

    const days = [...daySet].sort();
    if (days.length === 0) return { current: 0, best: 0, days: [] };

    // Calculate streaks
    let currentStreak = 1;
    let bestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]);
      const curr = new Date(days[i]);
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    // Check if current streak is active (played today or yesterday)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastDay = days[days.length - 1];

    if (lastDay === today || lastDay === yesterday) {
      currentStreak = tempStreak;
    } else {
      currentStreak = 0;
    }

    return { current: currentStreak, best: bestStreak, days: days.slice(-14) };
  }, [sessions]);

  const today = new Date();
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split('T')[0];
  });

  const todayKey = today.toISOString().split('T')[0];
  return (
    <section className={`sd-panel ${sc.panel}`} aria-labelledby="training-streak-title">
      <h2 id="training-streak-title" className={sc.sectionTitle}>Training Streak</h2>
      <div className={sc.metrics2}>
        <div className={`sd-metric ${sc.metric}`}>
          <strong className={sc.metricValue} data-tone={streaks.current > 0 ? 'ice' : undefined}>{streaks.current}</strong>
          <span className={sc.metricLabel}>Current</span>
        </div>
        <div className={`sd-metric ${sc.metric}`}>
          <strong className={sc.metricValue} data-tone="ice">{streaks.best}</strong>
          <span className={sc.metricLabel}>Best</span>
        </div>
      </div>

      {/* Activity heatmap (last 14 days) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: 3 }} role="list" aria-label="Activity, Last 14 Days">
        {last14.map((day) => {
          const isActive = streaks.days.includes(day);
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              role="listitem"
              title={day}
              aria-label={`${day}: ${isActive ? 'Trained' : 'No Training'}${isToday ? ' (Today)' : ''}`}
              style={{
                aspectRatio: '1',
                background: isActive ? 'linear-gradient(180deg, #7fe7ff, #1d8fe0)' : '#06111c',
                boxShadow: isToday ? '0 0 0 2px #f2f7ff' : 'inset 0 0 0 1px rgba(124, 158, 187, 0.3)',
              }}
            />
          );
        })}
      </div>
      <p className={sc.metricLabel} style={{ margin: 0 }}>Last 14 Days (Today Outlined In White)</p>
    </section>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// LOADING SKELETON
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DashboardSkeleton() {
  const shimmer = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    border: '3px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch",
  };
  return (
    <>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[1,2,3,4,5].map(i => <div key={i} style={{ ...shimmer, height: 90 }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ ...shimmer, height: 200 }} />
        <div style={{ ...shimmer, height: 200 }} />
      </div>
      <div style={{ ...shimmer, height: 160 }} />
    </>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// COACH'S NOTES — AI COACHING CARD
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function CoachingCard({ session }) {
  const [coaching, setCoaching] = React.useState(null);
  const [loadingCoach, setLoadingCoach] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!session) return;
    const cacheKey = `coaching-${session.id || session.game_id || 'latest'}`;
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (data && ts && (Date.now() - ts < CACHE_TTL_MS)) {
          setCoaching(data);
          return;
        }
      }
    } catch (e) { console.warn('[App] Handled exception:', e); }

    setLoadingCoach(true);
    authedFetch('/api/training/coaching-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.coaching) {
          setCoaching(data.coaching);
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: data.coaching, ts: Date.now() })); } catch (e) { console.warn('[App] Handled exception:', e); }
        } else { setError(true); }
      })
      .catch(() => setError(true))
      .finally(() => setLoadingCoach(false));
  }, [session]);

  if (error || (!coaching && !loadingCoach)) return null;

  const gradeTone = { A: sc.up, B: sc.ice, C: sc.ice, D: sc.down }[coaching?.overallGrade] || sc.white;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sd-panel ${sc.panel}`}
      aria-label="Coach's Notes"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={`sd-button ${sc.button} ${sc.full}`}
        style={{ justifyContent: 'space-between' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          Coach&apos;s Notes
          {coaching?.overallGrade && (
            <span className={`${sc.tag} ${gradeTone}`}>Grade {coaching.overallGrade}</span>
          )}
        </span>
        <span aria-hidden className={sc.ice} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {loadingCoach ? (
              <p className={sc.copy}>Loading Coach&apos;s Analysis...</p>
            ) : coaching ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {coaching.headline && <h3 className={sc.subTitle}>{coaching.headline}</h3>}
                {coaching.detailedFeedback && <p className={sc.copy}>{coaching.detailedFeedback}</p>}

                <div className={sc.cardGrid}>
                  {coaching.strengths?.length > 0 && (
                    <div className={`sd-metric ${sc.card}`}>
                      <span className={`${sc.eyebrow} ${sc.up}`}>Strengths</span>
                      {coaching.strengths.map((item, i) => (
                        <span key={i} className={sc.copy}>+ {item}</span>
                      ))}
                    </div>
                  )}
                  {coaching.areasToImprove?.length > 0 && (
                    <div className={`sd-metric ${sc.card}`}>
                      <span className={sc.eyebrow}>Work On</span>
                      {coaching.areasToImprove.map((item, i) => (
                        <span key={i} className={sc.copy}>- {item}</span>
                      ))}
                    </div>
                  )}
                </div>

                {coaching.recommendedDrill && (
                  <p className={sc.note}>
                    <strong className={sc.ice}>Next Drill:</strong> <span className={sc.white}>{coaching.recommendedDrill.name}</span>
                  </p>
                )}

                {coaching.motivationalQuote && (
                  <p className={sc.copy} style={{ fontStyle: 'italic', textAlign: 'center' }}>
                    {coaching.motivationalQuote}
                  </p>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export const SESSION_DASHBOARD_HELPERS = Object.freeze({
  LineChart,
  StatTile,
  PerformanceTable,
  StreakTracker,
  DashboardSkeleton,
  CoachingCard,
});

export default function SessionDashboard() {
  const router = useRouter();
  useTrainingBus('session-dashboard');

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [timeRange, setTimeRange] = useState('all'); // 'week' | 'month' | 'all'

  // Shared fetch function — used by initial load, retry button, and EventBus
  const fetchSessions = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setFetchError(null);
      const token = await getAccessToken();
      if (!token) {
        if (!silent) setLoading(false);
        return;
      }

      const res = await authedFetch('/api/training/get-sessions?limit=100');

      if (res.ok) {
        const data = await res.json();
        const allSessions = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
        setSessions(allSessions.filter((s) => (s.game_id || s.gameId) !== 'nodelocking_profile'));
        if (!silent) setFetchError(null);
      } else if (!silent) {
        setFetchError(`Unable to load session data (${res.status}). Please try again.`);
      }
    } catch (e) {
      console.warn('[Dashboard] Fetch failed:', e.message);
      if (!silent) {
        setFetchError('Unable to load session data. Please check your connection.');
      }
    }
    if (!silent) setLoading(false);
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Listen for new sessions via EventBus — silent refetch (no loading/error UI)
  useEffect(() => {
    const handler = () => fetchSessions({ silent: true });

    if (eventBus?.on) {
      eventBus.on(EventType?.SESSION_END || 'session:end', handler);
      eventBus.on('training:session-complete', handler);
      return () => {
        eventBus.off?.(EventType?.SESSION_END || 'session:end', handler);
        eventBus.off?.('training:session-complete', handler);
      };
    }
  }, [fetchSessions]);

  // Filter by time range
  const filteredSessions = useMemo(() => {
    if (timeRange === 'all') return sessions;

    const now = new Date();
    const cutoff = new Date();
    if (timeRange === 'week') cutoff.setDate(now.getDate() - 7);
    else if (timeRange === 'month') cutoff.setDate(now.getDate() - 30);

    return sessions.filter((s) => {
      const d = new Date(s.created_at || s.timestamp);
      return d >= cutoff;
    });
  }, [sessions, timeRange]);

  // Latest session for coaching card — memoized to prevent re-renders
  const latestSession = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    return [...filteredSessions].sort((a, b) =>
      new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp)
    )[0];
  }, [filteredSessions]);

  // Chart data
  const accuracyChartData = useMemo(() => {
    const sorted = [...filteredSessions]
      .sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp))
      .slice(-30);

    return sorted.map((s) => ({
      value: sessionAccuracyPercent(s),
      label: new Date(s.created_at || s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [filteredSessions]);

  const evLossChartData = useMemo(() => {
    const sorted = [...filteredSessions]
      .sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp))
      .slice(-30);

    return sorted.map((s) => ({
      value: measuredSessionEvLoss(s),
      label: new Date(s.created_at || s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [filteredSessions]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    const totalHands = filteredSessions.reduce((s, ses) => s + (Number(ses.hands_played || ses.handsPlayed) || 0), 0);
    const measuredAccuracies = filteredSessions
      .map(sessionAccuracyPercent)
      .filter((value) => value !== null);
    const avgAccuracy = measuredAccuracies.length > 0
      ? Math.round(measuredAccuracies.reduce((sum, value) => sum + value, 0) / measuredAccuracies.length)
      : null;
    const measuredEvSessions = filteredSessions
      .map(measuredSessionEvLoss)
      .filter((value) => value !== null);
    const totalEV = measuredEvSessions.length > 0
      ? measuredEvSessions.reduce((sum, value) => sum + value, 0)
      : null;
    const measuredEVDecisions = filteredSessions.reduce(
      (sum, session) => sum + (measuredSessionEvLoss(session) === null ? 0 : (Number(session.measured_ev_decisions) || 0)),
      0,
    );
    const wins = measuredAccuracies.filter((accuracy) => accuracy >= 60).length;

    return { totalHands, avgAccuracy, totalEV, measuredEVDecisions, sessions: filteredSessions.length, accuracySessions: measuredAccuracies.length, wins };
  }, [filteredSessions]);

  return (
    <>
      <Head>
        <title>Session Dashboard | Smarter.Poker Training</title>
        <meta name="description" content="Track sealed poker Training results, verified accuracy, measured solver EV, streaks, and per-game performance." />
              <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div
        className="sp-training-session-dashboard"
        style={{
          minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: '#040d18',
          color: '#f2f7ff',
        }}
      >
        <TrainingPageHead slug="training-session-dashboard" note="Track Your Training Progress, Identify Trends, And Maintain Your Streak." />

        <div className={sc.page}>
          {/* Time Range Selector */}
          <div className={sc.chips} role="group" aria-label="Time Range">
            {[
              { key: 'week', label: 'Last 7 Days' },
              { key: 'month', label: 'Last 30 Days' },
              { key: 'all', label: 'All Time' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                className={`sd-button ${sc.button}`}
                onClick={() => setTimeRange(t.key)}
                aria-label={`Filter by ${t.label}`}
                aria-pressed={timeRange === t.key}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Error State */}
          <ErrorBanner message={fetchError} onRetry={() => { setLoading(true); fetchSessions(); }} />

          {loading ? (
            <div role="status" aria-label="Loading Sessions">
              <DashboardSkeleton />
            </div>
          ) : (
            <>
              {/* Coach's Notes — AI Coaching Card */}
              {latestSession && <CoachingCard session={latestSession} />}

              {/* Progress Report — per-game accuracy breakdown */}
              {filteredSessions.length >= 3 && (() => {
                const gameMap = {};
                filteredSessions.forEach(s => {
                  const gId = s.game_id || s.gameId || 'unknown';
                  const label = gId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  if (!gameMap[label]) gameMap[label] = { hands: 0, correct: 0 };
                  const q = Number(s.total_questions || s.hands_played || 0);
                  const c = Number(s.correct_count || s.correct_answers || 0);
                  if (q > 0) { gameMap[label].hands += q; gameMap[label].correct += c; }
                });
                const entries = Object.entries(gameMap || {})
                  .filter(([, v]) => v.hands >= 3)
                  .map(([name, v]) => ({ name, acc: Math.round((v.correct / v.hands) * 100), hands: v.hands }))
                  .sort((a, b) => b.acc - a.acc);
                if (entries.length < 2) return null;
                return (
                  <motion.section
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`sd-panel ${sc.panel}`}
                    aria-labelledby="progress-report-title"
                  >
                    <h2 id="progress-report-title" className={sc.sectionTitle}>Progress Report</h2>
                    <ul className={sc.list}>
                      {(() => {
                        const displayEntries = entries.slice(0, 5);
                        return displayEntries.map((e, i) => (
                        <li key={e.name} className={sc.row}>
                          <span className={sc.rowLabel}>
                            {i === 0 && <span className={sc.up} style={{ marginRight: 6 }}>Strongest ·</span>}
                            {i === displayEntries.length - 1 && displayEntries.length > 1 && <span className={sc.down} style={{ marginRight: 6 }}>Weakest ·</span>}
                            {e.name}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <span className={sc.rowValue}>{e.hands} Hands</span>
                            <strong className={e.acc >= 80 ? sc.up : e.acc >= 60 ? sc.ice : sc.down}>
                              {e.acc}%
                            </strong>
                          </span>
                        </li>
                      ));
                      })()}
                    </ul>
                  </motion.section>
                );
              })()}

              {/* Stat Tiles */}
              {stats && (
                <section className={sc.metrics} aria-label="Session Summary">
                  <StatTile label="Sessions" value={stats.sessions} />
                  <StatTile label="Hands Played" value={stats.totalHands} />
                  <StatTile label="Avg Accuracy" value={stats.avgAccuracy === null ? '-' : `${stats.avgAccuracy}%`} tone={stats.avgAccuracy !== null && stats.avgAccuracy >= 70 ? 'up' : 'ice'} />
                  <StatTile label="Measured EV Loss" value={stats.totalEV === null ? '-' : stats.totalEV.toFixed(3)} tone={stats.totalEV === null ? undefined : 'down'} subtitle={stats.totalEV === null ? 'No Solver-Measured Decisions' : `${stats.measuredEVDecisions} Measured Decisions`} />
                  <StatTile label="Pass Rate" value={stats.accuracySessions > 0 ? `${Math.round((stats.wins / stats.accuracySessions) * 100)}%` : '-'} tone="ice" subtitle={`${stats.wins}/${stats.accuracySessions} Scored Sessions`} />
                </section>
              )}

              {filteredSessions.length === 0 ? (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Sessions Yet"
                  message="Start Training To See Your Progress Here."
                />
              ) : (
              <>
              {/* Charts */}
              <div className={sc.cardGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
                <section className={`sd-panel ${sc.panel}`} aria-label="Accuracy Trend">
                  <LineChart data={accuracyChartData} width={400} height={180} color="#22c55e" label="Accuracy Trend" />
                </section>
                <section className={`sd-panel ${sc.panel}`} aria-label="Measured EV Loss Per Session">
                  <LineChart data={evLossChartData} width={400} height={180} color="#ef4444" label="Measured EV Loss Per Session" />
                </section>
              </div>

              {/* Streak + Performance */}
              <div className={sc.cardGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
                <StreakTracker sessions={filteredSessions} />
                <PerformanceTable sessions={filteredSessions} />
              </div>

              {/* Recent Sessions */}
              <section className={`sd-panel ${sc.panel}`} aria-labelledby="recent-sessions-title">
                <h2 id="recent-sessions-title" className={sc.sectionTitle}>Recent Sessions ({filteredSessions.length})</h2>
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <ul className={sc.list}>
                      {[...filteredSessions]
                        .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp))
                        .slice(0, 20)
                        .map((s, i) => {
                          const acc = sessionAccuracyPercent(s);
                          const game = (s.game_name || s.gameName || s.game_id || s.gameId || 'Training').replace(/_/g, ' ');
                          const d = new Date(s.created_at || s.timestamp);
                          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

                          return (
                            <li key={i} className={sc.row}>
                              <span className={sc.rowLabel} style={{ textTransform: 'capitalize' }}>{game}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                                <strong className={acc === null ? sc.rowValue : acc >= 70 ? sc.up : acc >= 50 ? sc.ice : sc.down}>
                                  {acc === null ? '-' : `${Math.round(acc)}%`}
                                </strong>
                                <span className={sc.rowValue}>{dateStr}</span>
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                </div>
              </section>
              </>
              )}
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}

SessionDashboard.displayName = 'SessionDashboard';
