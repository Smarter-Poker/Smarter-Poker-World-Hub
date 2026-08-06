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
// ●● Phase 3 Engine: Session tracking with trends + leak identification ●●
import { calculateTrends, identifyLeaks } from '../../../src/engines/SessionTracker';
import { normalizeScoreToPercent } from '../../../src/engines/GTOScoreEngine';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-1a — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// SVG LINE CHART COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function LineChart({ data, width = 600, height = 200, color = 'var(--sp-accent-cyan)', label = '' }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-fg-faint)', fontSize: 12 }}>
        {data?.length === 1 ? 'Need more sessions for chart' : 'No data yet'}
      </div>
    );
  }

  const values = data.map((d) => d.value);
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

  // Grid lines
  const gridLines = 4;
  const gridY = Array.from({ length: gridLines + 1 }, (_, i) => ({
    y: padding.top + (i / gridLines) * chartH,
    label: (max - (i / gridLines) * range).toFixed(0),
  }));

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* Grid */}
      {gridY.map((g, i) => (
        <g key={i}>
          <line x1={padding.left} y1={g.y} x2={width - padding.right} y2={g.y} stroke="rgba(255,255,255,0.05)" strokeDasharray="4" />
          <text x={padding.left - 6} y={g.y + 3} textAnchor="end" fill="#475569" fontSize={8}>{g.label}</text>
        </g>
      ))}

      {/* Area fill */}
      <defs>
        <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#gradient-${label})`} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
          {/* Label (only show every few) */}
          {(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && data[i]?.label && (
            <text x={p.x} y={padding.top + chartH + 16} textAnchor="middle" fill="#475569" fontSize={7}>
              {data[i].label}
            </text>
          )}
        </g>
      ))}

      {/* Label */}
      {label && (
        <text x={padding.left} y={12} fill={color} fontSize={10} fontWeight={700}>
          {label}
        </text>
      )}
    </svg>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STAT TILE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StatTile({ label, value, color, icon, subtitle }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center',
      }}
    >
      {icon && <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>}
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          color: color || 'var(--sp-accent-cyan)',
          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      {subtitle && (
        <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)', marginTop: 2 }}>{subtitle}</div>
      )}
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
      if (!stats[game]) stats[game] = { sessions: 0, totalAccuracy: 0, totalHands: 0, totalEV: 0 };
      stats[game].sessions++;
      stats[game].totalAccuracy += Number(s.accuracy) || 0;
      stats[game].totalHands += Number(s.hands_played || s.handsPlayed) || 0;
      stats[game].totalEV += Number(s.total_ev_loss || s.totalEVLoss) || 0;
    });
    return Object.entries(stats || {})
      .map(([game, s]) => ({
        game: game.replace(/_/g, ' '),
        sessions: s.sessions,
        avgAccuracy: Math.round(s.totalAccuracy / s.sessions),
        totalHands: s.totalHands,
        avgEV: (s.totalEV / s.sessions).toFixed(1),
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions]);

  if (gameStats.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--sp-accent-cyan)',
          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Per-Game Performance
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Game', 'Sessions', 'Hands', 'Avg Accuracy', 'Avg EV Loss'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gameStats.slice(0, 12).map((g) => (
              <tr key={g.game} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--sp-fg)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.game}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--sp-fg-muted)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace", fontWeight: 600 }}>{g.sessions}</td>
                <td style={{ padding: '8px 12px', color: 'var(--sp-fg-muted)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace", fontWeight: 600 }}>{g.totalHands}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      color: g.avgAccuracy >= 75 ? 'var(--sp-accent-green)' : g.avgAccuracy >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                    }}
                  >
                    {g.avgAccuracy}%
                  </span>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--sp-accent-orange)', fontWeight: 600, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                  {g.avgEV > 0 ? `-${g.avgEV}` : '0.0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--sp-accent-amber)',
          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        Training Streak
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: streaks.current > 0 ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
            {streaks.current}
          </div>
          <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Current</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sp-accent-purple)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
            {streaks.best}
          </div>
          <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Best</div>
        </div>
      </div>

      {/* Activity heatmap (last 14 days) */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {last14.map((day) => {
          const isActive = streaks.days.includes(day);
          const isToday = day === today.toISOString().split('T')[0];
          return (
            <div
              key={day}
              title={day}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: isActive ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.04)',
                border: isToday ? '1px solid #fbbf24' : '1px solid transparent',
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 8, color: 'var(--sp-fg-faint)', marginTop: 4 }}>Last 14 days</div>
    </div>
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
    borderRadius: 12,
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
    const acc = Number(session.accuracy || session.gtow_score) || 0;
    const hands = Number(session.hands_played || session.handsPlayed || session.total_questions) || 0;
    const correct = Math.round((acc / 100) * hands);

    authedFetch('/api/training/coaching-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: session.game_id || session.gameId || 'training',
        gameName: session.game_name || session.gameName || session.game_id || 'Training',
        level: session.level || 1,
        questionsAnswered: hands,
        questionsCorrect: correct,
        accuracy: acc,
        streak: session.best_streak || 0,
        timeSpentSeconds: session.time_spent || 0,
        mistakes: [],
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

  const gradeColors = { A: 'var(--sp-accent-green)', B: 'var(--sp-accent-blue)', C: 'var(--sp-accent-amber)', D: 'var(--sp-accent-red)' };
  const gradeColor = gradeColors[coaching?.overallGrade] || 'var(--sp-fg-dim)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        marginBottom: 16,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'var(--sp-accent-purple)',
            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Coach&apos;s Notes
          </div>
          {coaching?.overallGrade && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 6,
              background: `${gradeColor}15`,
              border: `1px solid ${gradeColor}40`,
              color: gradeColor,
              fontSize: 12,
              fontWeight: 800,
            }}>
              {coaching.overallGrade}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--sp-fg-dim)', fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>

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
            <div style={{ padding: '0 16px 14px' }}>
              {loadingCoach ? (
                <div style={{ padding: '12px 0', color: 'var(--sp-fg-dim)', fontSize: 11 }}>Loading coach&apos;s analysis...</div>
              ) : coaching ? (
                <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                  {coaching.headline && (
                    <div style={{ color: 'var(--sp-fg)', fontWeight: 700, fontSize: 14 }}>{coaching.headline}</div>
                  )}
                  {coaching.detailedFeedback && (
                    <div style={{ color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>{coaching.detailedFeedback}</div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {coaching.strengths?.length > 0 && (
                      <div style={{ padding: 10, borderRadius: 8, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-accent-green)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Strengths</div>
                        {coaching.strengths.map((s, i) => (
                          <div key={i} style={{ color: 'var(--sp-fg-muted)', fontSize: 11, marginBottom: 3 }}>+ {s}</div>
                        ))}
                      </div>
                    )}
                    {coaching.areasToImprove?.length > 0 && (
                      <div style={{ padding: 10, borderRadius: 8, background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.1)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-accent-orange)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Work On</div>
                        {coaching.areasToImprove.map((s, i) => (
                          <div key={i} style={{ color: 'var(--sp-fg-muted)', fontSize: 11, marginBottom: 3 }}>- {s}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {coaching.recommendedDrill && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--sp-accent-cyan)', textTransform: 'uppercase' }}>Next Drill:</span>
                      <span style={{ color: 'var(--sp-fg)', fontSize: 11, fontWeight: 600 }}>{coaching.recommendedDrill.name}</span>
                    </div>
                  )}

                  {coaching.motivationalQuote && (
                    <div style={{ color: 'var(--sp-fg-faint)', fontSize: 10, fontStyle: 'italic', textAlign: 'center', paddingTop: 4 }}>
                      {coaching.motivationalQuote}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

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

    return sorted.map((s, i) => ({
      value: Number(s.accuracy || s.gtow_score || s.gtowScore) || 0,
      label: new Date(s.created_at || s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [filteredSessions]);

  const evLossChartData = useMemo(() => {
    const sorted = [...filteredSessions]
      .sort((a, b) => new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp))
      .slice(-30);

    return sorted.map((s) => ({
      value: Math.abs(Number(s.total_ev_loss || s.totalEVLoss)) || 0,
      label: new Date(s.created_at || s.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));
  }, [filteredSessions]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (filteredSessions.length === 0) return null;
    const totalHands = filteredSessions.reduce((s, ses) => s + (Number(ses.hands_played || ses.handsPlayed) || 0), 0);
    // GTOW parity #25: `accuracy` is always 0-100, but the gtow_score fallback
    // is -100..+100 on any row written with score_scale = 2. Averaging the two
    // conventions together silently under-reports every recent session, so
    // normalise the fallback onto the 0-100 scale before it joins the pool.
    const sessionPercent = (ses) => {
      const acc = Number(ses.accuracy);
      if (Number.isFinite(acc) && acc !== 0) return acc;
      return normalizeScoreToPercent(ses.gtow_score ?? ses.gtowScore, ses.score_scale);
    };
    const avgAccuracy = Math.round(
      filteredSessions.reduce((s, ses) => s + sessionPercent(ses), 0) /
      filteredSessions.length
    );
    const totalEV = filteredSessions.reduce((s, ses) => s + Math.abs(Number(ses.total_ev_loss || ses.totalEVLoss) || 0), 0);
    const wins = filteredSessions.filter((s) => sessionPercent(s) >= 60).length;

    // Engine enrichment: trend analysis + leak identification
    let trends = null;
    let leaks = [];
    try {
      trends = calculateTrends(filteredSessions);
      leaks = identifyLeaks(filteredSessions);
    } catch (e) {
      console.warn('[Dashboard] Engine trend calculation failed:', e.message);
    }

    return { totalHands, avgAccuracy, totalEV, sessions: filteredSessions.length, wins, trends, leaks };
  }, [filteredSessions]);

  return (
    <>
      <Head>
        <title>Session Dashboard | Smarter.Poker Training</title>
        <meta name="description" content="Track your poker training progress over time. View accuracy trends, EV loss charts, streaks, and per-game performance." />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ← Training
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-green-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Session Dashboard
            </h1>
          </div>
          <p style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 6 }}>
            Track your training progress, identify trends, and maintain your streak.
          </p>
        </div>

        <div style={{ padding: '16px 24px', maxWidth: 900, margin: '0 auto' }}>
          {/* Time Range Selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'week', label: 'Last 7 Days' },
              { key: 'month', label: 'Last 30 Days' },
              { key: 'all', label: 'All Time' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTimeRange(t.key)}
                aria-label={`Filter by ${t.label}`}
                aria-pressed={timeRange === t.key}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: timeRange === t.key ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: timeRange === t.key ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Error State */}
          <ErrorBanner message={fetchError} onRetry={() => { setLoading(true); fetchSessions(); }} />

          {loading ? (
            <div style={{ marginTop: 24 }}>
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
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginBottom: 16,
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--sp-accent-cyan)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}>Progress Report</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(() => {
                        const displayEntries = entries.slice(0, 5);
                        return displayEntries.map((e, i) => (
                        <div key={e.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: i === 0 ? 'rgba(34,197,94,0.04)' : i === displayEntries.length - 1 ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)', flex: 1 }}>
                            {i === 0 && <span style={{ color: 'var(--sp-accent-green)', marginRight: 4 }}>●</span>}
                            {i === displayEntries.length - 1 && displayEntries.length > 1 && <span style={{ color: 'var(--sp-accent-red)', marginRight: 4 }}>●</span>}
                            {e.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>{e.hands}h</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: e.acc >= 80 ? 'var(--sp-accent-green)' : e.acc >= 60 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)' }}>
                              {e.acc}%
                            </span>
                          </div>
                        </div>
                      ));
                      })()}
                    </div>
                  </motion.div>
                );
              })()}

              {/* Stat Tiles */}
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <StatTile label="Sessions" value={stats.sessions} color="#00d4ff" icon="●" />
                  <StatTile label="Hands Played" value={stats.totalHands} color="#22c55e" icon="◇" />
                  <StatTile label="Avg Accuracy" value={`${stats.avgAccuracy}%`} color={stats.avgAccuracy >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)'} icon="◆" />
                  <StatTile label="Total EV Loss" value={stats.totalEV.toFixed(1)} color="#ef4444" icon="▼" subtitle="bb total" />
                  <StatTile label="Win Rate" value={`${stats.sessions > 0 ? Math.round((stats.wins / stats.sessions) * 100) : 0}%`} color="#a855f7" icon="★" subtitle={`${stats.wins}/${stats.sessions} sessions`} />
                </div>
              )}

              {/* Charts */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 12px',
                    overflow: 'hidden',
                  }}
                >
                  <LineChart data={accuracyChartData} width={400} height={180} color="#22c55e" label="Accuracy Trend" />
                </div>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '14px 12px',
                    overflow: 'hidden',
                  }}
                >
                  <LineChart data={evLossChartData} width={400} height={180} color="#ef4444" label="EV Loss per Session" />
                </div>
              </div>

              {/* Streak + Performance */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 16 }}>
                <StreakTracker sessions={filteredSessions} />
                <PerformanceTable sessions={filteredSessions} />
              </div>

              {/* Recent Sessions */}
              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--sp-accent-cyan)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Recent Sessions ({filteredSessions.length})
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {filteredSessions.length === 0 ? (
                    <TrainerEmptyState
                      variant="no-data"
                      title="No sessions yet"
                      message="Start training to see your progress here."
                      compact
                    />
                  ) : (
                    [...filteredSessions]
                      .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp))
                      .slice(0, 20)
                      .map((s, i) => {
                        const acc = Number(s.accuracy || s.gtow_score || s.gtowScore) || 0;
                        const game = (s.game_name || s.gameName || s.game_id || s.gameId || 'Training').replace(/_/g, ' ');
                        const d = new Date(s.created_at || s.timestamp);
                        const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

                        return (
                          <div
                            key={i}
                            style={{
                              padding: '8px 16px',
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              fontSize: 11,
                            }}
                          >
                            <div
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: acc >= 70 ? 'var(--sp-accent-green)' : acc >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: 'var(--sp-fg)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {game}
                            </span>
                            <span style={{ color: acc >= 70 ? 'var(--sp-accent-green)' : acc >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)', fontWeight: 700, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                              {acc}%
                            </span>
                            <span style={{ color: 'var(--sp-fg-faint)', fontSize: 9 }}>{dateStr}</span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
