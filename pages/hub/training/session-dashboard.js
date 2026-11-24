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
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';
// TRAIN-WIRE-EMPTY-1a — adoption: shared empty-state primitive

const HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
};

const BOARD_CARDS = ['8d', '5c', '2s', '6h', '3d'];

const BOARD_CARDS_BY_STREET = {
  preflop: [],
  flop: BOARD_CARDS.slice(0, 3),
  turn: BOARD_CARDS.slice(0, 4),
  river: BOARD_CARDS.slice(0, 5),
};

const CANONICAL_6MAX_SEATS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const DEFAULT_LAST_HAND = Object.freeze({
  id: '994810242',
  variant: 'nlh',
  street: 'flop',
  heroPosition: 'BTN',
  estimatedEvLossBb: 1.45,
  recommendedAction: 'Bet 75% Pot',
  drillHref: '/hub/training/arena/cash-002?level=1&source=live-hand-sync&syncedHandId=994810242',
});

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
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-fg-faint)', fontSize: 12 }}>
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
          <text x={padding.left - 6} y={g.y + 3} textAnchor="end" fill="#475569" fontSize={12}>{g.label}</text>
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
          {(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && measuredData[i]?.label && (
            <text x={p.x} y={padding.top + chartH + 16} textAnchor="middle" fill="#475569" fontSize={12}>
              {measuredData[i].label}
            </text>
          )}
        </g>
      ))}

      {/* Label */}
      {label && (
        <text x={padding.left} y={12} fill={color} fontSize={12} fontWeight={700}>
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
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginTop: 2 }}>{subtitle}</div>
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
          fontSize: 12,
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Game', 'Sessions', 'Hands', 'Avg Accuracy', 'Avg Measured EV Loss'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 12,
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
                  {g.avgAccuracy === null ? '-' : `${g.avgAccuracy}%`}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--sp-accent-orange)', fontWeight: 600, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                  {g.avgEV === null ? '-' : `${g.avgEV.toFixed(3)} BB`}
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
          fontSize: 12,
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
          <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Current</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--sp-accent-purple)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
            {streaks.best}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Best</div>
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
      <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginTop: 4 }}>Last 14 Days</div>
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
        type="button"
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
            fontSize: 12,
            fontWeight: 800,
            color: 'var(--sp-accent-purple)',
            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Coach&apos;S Notes
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
                <div style={{ padding: '12px 0', color: 'var(--sp-fg-dim)', fontSize: 12 }}>Loading Coach&apos;S Analysis...</div>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-green)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Strengths</div>
                        {coaching.strengths.map((s, i) => (
                          <div key={i} style={{ color: 'var(--sp-fg-muted)', fontSize: 12, marginBottom: 3 }}>+ {s}</div>
                        ))}
                      </div>
                    )}
                    {coaching.areasToImprove?.length > 0 && (
                      <div style={{ padding: 10, borderRadius: 8, background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.1)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-orange)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Work On</div>
                        {coaching.areasToImprove.map((s, i) => (
                          <div key={i} style={{ color: 'var(--sp-fg-muted)', fontSize: 12, marginBottom: 3 }}>- {s}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {coaching.recommendedDrill && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-cyan)', textTransform: 'uppercase' }}>Next Drill:</span>
                      <span style={{ color: 'var(--sp-fg)', fontSize: 12, fontWeight: 600 }}>{coaching.recommendedDrill.name}</span>
                    </div>
                  )}

                  {coaching.motivationalQuote && (
                    <div style={{ color: 'var(--sp-fg-faint)', fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingTop: 4 }}>
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
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');
  const [selectedLeakSeat, setSelectedLeakSeat] = useState('BB');
  const [lastClubArenaHand, setLastClubArenaHand] = useState(DEFAULT_LAST_HAND);

  const brainEval = useMemo(() => {
    const heroCards = HERO_CARDS_BY_VARIANT[activeVariant] || HERO_CARDS_BY_VARIANT.nlh;
    const boardCards = BOARD_CARDS_BY_STREET[activeStreet] || BOARD_CARDS_BY_STREET.flop;
    return evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: activeStreet,
      heroCards,
      boardCards,
      heroPosition,
      villainPosition: heroPosition === 'BB' ? 'BTN' : 'BB',
      pot: activeStreet === 'preflop' ? 1.5 : 6.5,
      toCall: activeStreet === 'preflop' ? 1 : 2.2,
      effectiveStackBb: 100,
    });
  }, [activeVariant, activeStreet, heroPosition]);

  const arenaHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: activeStreet,
          position: heroPosition,
        },
        'session-dashboard',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  const mistakeReplayTarget = useMemo(() => {
    const analysis = analyzeVerifiedTrainingWeaknesses(Array.isArray(sessions) ? sessions : [], []);
    const leak = analysis?.topSpotLeak || analysis?.spotLeaks?.[0] || analysis?.leaks?.[0] || null;
    const variant = leak?.variant || activeVariant || 'nlh';
    const street = leak?.street || activeStreet || 'flop';
    const position = leak?.position || heroPosition || 'BTN';
    const gameId = leak?.gameId || (variant === 'nlh' ? 'cash-002' : 'cash-005');
    const href = buildCustomTrainingArenaHref(
      {
        gameId,
        variant,
        street,
        heroPosition: position,
        position,
      },
      'session-mistakes-replay',
    );
    return { gameId, variant, street, position, href };
  }, [sessions, activeVariant, activeStreet, heroPosition]);

  const seatHeatmapMetrics = useMemo(() => {
    const baseMetrics = {
      UTG: { evLossBb: 0.42, accuracyPct: 81 },
      HJ: { evLossBb: 0.58, accuracyPct: 78 },
      CO: { evLossBb: 0.64, accuracyPct: 76 },
      BTN: { evLossBb: 0.35, accuracyPct: 84 },
      SB: { evLossBb: 0.96, accuracyPct: 68 },
      BB: { evLossBb: 1.38, accuracyPct: 62 },
    };
    const analysis = analyzeVerifiedTrainingWeaknesses(Array.isArray(sessions) ? sessions : [], []);
    const spotLeaks = Array.isArray(analysis?.spotLeaks) ? analysis.spotLeaks : [];
    for (const pos of CANONICAL_6MAX_SEATS) {
      const matching = spotLeaks.filter((s) => String(s?.position || '').toUpperCase() === pos);
      if (matching.length > 0) {
        const totalEv = matching.reduce((sum, s) => sum + (Number(s.evLossBb) || 0), 0);
        const avgAcc = Math.round(matching.reduce((sum, s) => sum + (Number(s.acc) || 0), 0) / matching.length);
        baseMetrics[pos] = {
          evLossBb: Number(totalEv.toFixed(2)),
          accuracyPct: avgAcc,
        };
      }
    }
    return baseMetrics;
  }, [sessions]);

  const selectedSeatDrillHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'cash',
          variant: activeVariant,
          streets: [activeStreet],
          positions: [selectedLeakSeat],
          stackDepth: 100,
        },
        'positional-seat-heatmap',
      ),
    [activeVariant, activeStreet, selectedLeakSeat],
  );

  // Shared fetch function — used by initial load, retry button, and EventBus
  const fetchSessions = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setFetchError(null);
      const token = await getAccessToken();
      if (!token) {
        if (!silent) setLoading(false);
        return;
      }

      const [res, handRes] = await Promise.all([
        authedFetch('/api/training/get-sessions?limit=100'),
        authedFetch('/api/training/audit-hand-history').catch(() => null),
      ]);

      if (res.ok) {
        const data = await res.json();
        const allSessions = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
        setSessions(allSessions.filter((s) => (s.game_id || s.gameId) !== 'nodelocking_profile'));
        if (!silent) setFetchError(null);
      } else if (!silent) {
        setFetchError(`Unable to load session data (${res.status}). Please try again.`);
      }
      if (handRes && handRes.ok) {
        const hd = await handRes.json().catch(() => null);
        const topHand = hd?.topLeakHand || (Array.isArray(hd?.hands) ? hd.hands[0] : null);
        if (topHand && topHand.id) {
          setLastClubArenaHand({
            id: String(topHand.id),
            variant: String(topHand.variant || 'nlh').toLowerCase(),
            street: String(topHand.street || 'flop').toLowerCase(),
            heroPosition: String(topHand.heroPosition || 'BTN').toUpperCase(),
            estimatedEvLossBb: Number(topHand.estimatedEvLossBb ?? topHand.evLoss ?? 1.45) || 1.45,
            recommendedAction: topHand.recommendedAction || 'Bet 75% Pot',
            drillHref: topHand.drillHref || `/hub/training/arena/cash-002?level=1&source=live-hand-sync&syncedHandId=${encodeURIComponent(String(topHand.id))}`,
          });
        }
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
        className="sp-training-intelligence sp-training-intelligence--session-dashboard"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div className="sp-intelligence-header" style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
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
            Track Your Training Progress, Identify Trends, And Maintain Your Streak.
          </p>
        </div>

        <div className="sp-intelligence-main" style={{ padding: '16px 24px', maxWidth: 900, margin: '0 auto' }}>
          {/* Time Range Selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[
              { key: 'week', label: 'Last 7 Days' },
              { key: 'month', label: 'Last 30 Days' },
              { key: 'all', label: 'All Time' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeRange(t.key)}
                aria-label={`Filter by ${t.label}`}
                aria-pressed={timeRange === t.key}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  fontSize: 12,
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

          {brainEval && (
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              data-hero-position={heroPosition}
              style={{
                marginBottom: 16,
                padding: 18,
                borderRadius: 12,
                border: '1px solid rgba(0, 212, 255, 0.35)',
                background: 'rgba(2, 6, 23, 0.78)',
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
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--sp-accent-cyan)', textTransform: 'uppercase' }}>
                  Horse Brain Session Dashboard Spot Preview
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-green)' }}>
                  Engine: {brainEval.engineModule} | Recommended: {brainEval.correctAnswerText}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-fg-dim)', marginBottom: 4 }}>
                    Variant
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['nlh', 'plo4', 'plo5', 'plo6'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-variant-option={v}
                        aria-pressed={activeVariant === v}
                        onClick={() => setActiveVariant(v)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: activeVariant === v ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.16)',
                          background: activeVariant === v ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                          color: activeVariant === v ? '#e8fbff' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-fg-dim)', marginBottom: 4 }}>
                    Position
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['BTN', 'CO', 'SB', 'BB'].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        data-position-option={pos}
                        aria-pressed={heroPosition === pos}
                        onClick={() => setHeroPosition(pos)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: heroPosition === pos ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.16)',
                          background: heroPosition === pos ? 'rgba(34, 197, 94, 0.18)' : 'rgba(255,255,255,0.04)',
                          color: heroPosition === pos ? '#86efac' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--sp-fg-dim)', marginBottom: 4 }}>
                    Street
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['preflop', 'flop', 'turn', 'river'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        data-street-option={st}
                        aria-pressed={activeStreet === st}
                        onClick={() => setActiveStreet(st)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: activeStreet === st ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.16)',
                          background: activeStreet === st ? 'rgba(251, 191, 36, 0.18)' : 'rgba(255,255,255,0.04)',
                          color: activeStreet === st ? '#fde68a' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {st.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.55, marginBottom: 12 }}>
                {brainEval.explanation}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  data-launch-club-arena-cta="true"
                  onClick={() => router.push(arenaHref)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: '1px solid #00d4ff',
                    background: 'rgba(0, 212, 255, 0.18)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Launch Calibrated Spot In Club Arena →
                </button>
                <button
                  type="button"
                  data-drill-session-mistakes-cta="true"
                  data-drill-top-weakness="true"
                  data-mistake-target-variant={mistakeReplayTarget.variant}
                  data-mistake-target-street={mistakeReplayTarget.street}
                  data-mistake-target-position={mistakeReplayTarget.position}
                  onClick={() => router.push(mistakeReplayTarget.href)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: '1px solid #fbbf24',
                    background: 'rgba(251, 191, 36, 0.18)',
                    color: '#fde68a',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {`Fix My Mistakes From This Session (${mistakeReplayTarget.variant.toUpperCase()} · ${mistakeReplayTarget.street.toUpperCase()} · ${mistakeReplayTarget.position}) →`}
                </button>
              </div>
            </div>
          )}

          {/* Last Club Arena Hand Played — Instant Post-Hand Review Quick-Drill Bar */}
          <div
            data-last-club-arena-hand-bar="true"
            data-last-hand-id={lastClubArenaHand.id}
            data-last-hand-ev-loss-bb={String(lastClubArenaHand.estimatedEvLossBb)}
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'rgba(15, 23, 42, 0.78)',
              border: '1px solid rgba(251, 191, 36, 0.38)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
                Last Club Arena Hand Played - Instant Post-Hand Review
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                Hand #{lastClubArenaHand.id} · {lastClubArenaHand.variant.toUpperCase()} · {lastClubArenaHand.heroPosition} · {lastClubArenaHand.street.toUpperCase()} · -{lastClubArenaHand.estimatedEvLossBb} BB EV Loss
              </div>
            </div>
            <button
              type="button"
              data-drill-last-club-arena-hand="true"
              onClick={() => router.push(lastClubArenaHand.drillHref)}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid #fbbf24',
                background: 'rgba(251, 191, 36, 0.18)',
                color: '#fde68a',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Drill Last Hand #{lastClubArenaHand.id} In Club Arena →
            </button>
          </div>

          {/* 6-Max Club Arena Positional Seat EV Leak Heatmap */}
          <div
            data-positional-leak-heatmap="true"
            data-selected-seat={selectedLeakSeat}
            style={{
              padding: '16px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.14) 0%, rgba(15, 23, 42, 0.85) 75%)',
              border: '1px solid rgba(52, 211, 153, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#6ee7b7' }}>
                6-Max Club Arena Positional Seat EV Leak Heatmap
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                Selected Seat: {selectedLeakSeat} (-{seatHeatmapMetrics[selectedLeakSeat]?.evLossBb} BB · {seatHeatmapMetrics[selectedLeakSeat]?.accuracyPct}% Acc)
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              {CANONICAL_6MAX_SEATS.map((pos) => {
                const metric = seatHeatmapMetrics[pos] || { evLossBb: 0.5, accuracyPct: 75 };
                const isSelected = selectedLeakSeat === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    data-leak-seat-node={pos}
                    data-seat-ev-loss-bb={String(metric.evLossBb)}
                    data-seat-accuracy-pct={String(metric.accuracyPct)}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedLeakSeat(pos)}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 10,
                      border: isSelected ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.24)' : 'rgba(15, 23, 42, 0.7)',
                      color: isSelected ? '#ecfdf5' : '#cbd5e1',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{pos}</div>
                    <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700, marginTop: 2 }}>
                      -{metric.evLossBb} BB EV
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {metric.accuracyPct}% Acc
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              data-drill-selected-seat-cta="true"
              data-selected-seat={selectedLeakSeat}
              data-target-href={selectedSeatDrillHref}
              onClick={() => router.push(selectedSeatDrillHref)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #34d399',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#ecfdf5',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Drill Selected Seat On Club Arena Felt ({selectedLeakSeat} · {activeVariant.toUpperCase()} · {activeStreet.toUpperCase()}) →
            </button>
          </div>

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
                      fontSize: 12,
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
                            <span style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>{e.hands}h</span>
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
                  <StatTile label="Avg Accuracy" value={stats.avgAccuracy === null ? '-' : `${stats.avgAccuracy}%`} color={stats.avgAccuracy !== null && stats.avgAccuracy >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)'} icon="◆" />
                  <StatTile label="Measured EV Loss" value={stats.totalEV === null ? '-' : stats.totalEV.toFixed(3)} color="#ef4444" icon="▼" subtitle={stats.totalEV === null ? 'No Solver-Measured Decisions' : `${stats.measuredEVDecisions} Measured Decisions`} />
                  <StatTile label="Pass Rate" value={stats.accuracySessions > 0 ? `${Math.round((stats.wins / stats.accuracySessions) * 100)}%` : '-'} color="#a855f7" icon="★" subtitle={`${stats.wins}/${stats.accuracySessions} Scored Sessions`} />
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
                  <LineChart data={evLossChartData} width={400} height={180} color="#ef4444" label="Measured EV Loss Per Session" />
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
                    fontSize: 12,
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
                      title="No Sessions Yet"
                      message="Start Training To See Your Progress Here."
                      compact
                    />
                  ) : (
                    [...filteredSessions]
                      .sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp))
                      .slice(0, 20)
                      .map((s, i) => {
                        const acc = sessionAccuracyPercent(s);
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
                              fontSize: 12,
                            }}
                          >
                            <div
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: acc === null ? 'var(--sp-fg-faint)' : acc >= 70 ? 'var(--sp-accent-green)' : acc >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: 'var(--sp-fg)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {game}
                            </span>
                            <span style={{ color: acc === null ? 'var(--sp-fg-faint)' : acc >= 70 ? 'var(--sp-accent-green)' : acc >= 50 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)', fontWeight: 700, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                              {acc === null ? '-' : `${Math.round(acc)}%`}
                            </span>
                            <span style={{ color: 'var(--sp-fg-faint)', fontSize: 12 }}>{dateStr}</span>
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

SessionDashboard.displayName = 'SessionDashboard';
