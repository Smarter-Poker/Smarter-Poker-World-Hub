/**
 * 📈 SESSION HISTORY DASHBOARD — Training Progress Tracker
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregates all training sessions from Supabase and visualizes progress
 * over time with SVG charts, streak tracking, and per-game breakdowns.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// SVG LINE CHART COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function LineChart({ data, width = 600, height = 200, color = '#00d4ff', label = '' }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 12 }}>
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

// ═══════════════════════════════════════════════════════════════════════════
// STAT TILE
// ═══════════════════════════════════════════════════════════════════════════

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
          color: color || '#00d4ff',
          fontFamily: "'Orbitron', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      {subtitle && (
        <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME TYPE PERFORMANCE TABLE
// ═══════════════════════════════════════════════════════════════════════════

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
    return Object.entries(stats)
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
          color: '#00d4ff',
          fontFamily: "'Orbitron', monospace",
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
                    color: '#64748b',
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
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#e2e8f0', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.game}
                </td>
                <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: "'Orbitron', monospace", fontWeight: 600 }}>{g.sessions}</td>
                <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: "'Orbitron', monospace", fontWeight: 600 }}>{g.totalHands}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontFamily: "'Orbitron', monospace",
                      color: g.avgAccuracy >= 75 ? '#22c55e' : g.avgAccuracy >= 50 ? '#fbbf24' : '#ef4444',
                    }}
                  >
                    {g.avgAccuracy}%
                  </span>
                </td>
                <td style={{ padding: '8px 12px', color: '#f97316', fontWeight: 600, fontFamily: "'Orbitron', monospace" }}>
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

// ═══════════════════════════════════════════════════════════════════════════
// STREAK TRACKER
// ═══════════════════════════════════════════════════════════════════════════

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
          color: '#fbbf24',
          fontFamily: "'Orbitron', monospace",
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12,
        }}
      >
        🔥 Training Streak
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: streaks.current > 0 ? '#fbbf24' : '#475569', fontFamily: "'Orbitron', monospace" }}>
            {streaks.current}
          </div>
          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Current</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#a855f7', fontFamily: "'Orbitron', monospace" }}>
            {streaks.best}
          </div>
          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Best</div>
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
      <div style={{ fontSize: 8, color: '#475569', marginTop: 4 }}>Last 14 days</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function SessionDashboard() {
  const router = useRouter();
  useTrainingBus('session-dashboard');

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all'); // 'week' | 'month' | 'all'

  // Fetch sessions from Supabase
  useEffect(() => {
    let cancelled = false;
    const fetchSessions = async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await authedFetch('/api/training/get-sessions?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          const allSessions = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
          // Filter out nodelocking profile storage entries (not real training sessions)
          setSessions(allSessions.filter((s) => (s.game_id || s.gameId) !== 'nodelocking_profile'));
        }
      } catch (e) {
        console.warn('[Dashboard] Fetch failed, using mock data');
        // Provide mock data for UI development
        if (!cancelled) {
          const mockSessions = generateMockSessions();
          setSessions(mockSessions);
        }
      }
      if (!cancelled) setLoading(false);
    };

    fetchSessions();
    return () => { cancelled = true; };
  }, []);

  // Listen for new sessions via EventBus
  useEffect(() => {
    const handler = () => {
      const refetch = async () => {
        try {
          const token = await getAccessToken();
          if (!token) return;
          const res = await authedFetch('/api/training/get-sessions?limit=100', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const allSessions = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
            setSessions(allSessions.filter((s) => (s.game_id || s.gameId) !== 'nodelocking_profile'));
          }
        } catch (e) { /* silent */ }
      };
      refetch();
    };

    if (eventBus?.on) {
      eventBus.on(EventType?.SESSION_END || 'session:end', handler);
      eventBus.on('training:session-complete', handler);
      return () => {
        eventBus.off?.(EventType?.SESSION_END || 'session:end', handler);
        eventBus.off?.('training:session-complete', handler);
      };
    }
  }, []);

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
    const avgAccuracy = Math.round(
      filteredSessions.reduce((s, ses) => s + (Number(ses.accuracy || ses.gtow_score || ses.gtowScore) || 0), 0) /
      filteredSessions.length
    );
    const totalEV = filteredSessions.reduce((s, ses) => s + Math.abs(Number(ses.total_ev_loss || ses.totalEVLoss) || 0), 0);
    const wins = filteredSessions.filter((s) => (Number(s.accuracy || s.gtow_score || s.gtowScore) || 0) >= 60).length;
    return { totalHands, avgAccuracy, totalEV, sessions: filteredSessions.length, wins };
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
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: '#e2e8f0',
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
                color: '#94a3b8',
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
                background: 'linear-gradient(135deg, #00d4ff, #22c55e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              Session Dashboard
            </h1>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
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
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: timeRange === t.key ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: timeRange === t.key ? '#00d4ff' : '#64748b',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ marginTop: 24 }}>
              <DashboardSkeleton />
            </div>
          ) : (
            <>
              {/* Stat Tiles */}
              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <StatTile label="Sessions" value={stats.sessions} color="#00d4ff" icon="🎮" />
                  <StatTile label="Hands Played" value={stats.totalHands} color="#22c55e" icon="🃏" />
                  <StatTile label="Avg Accuracy" value={`${stats.avgAccuracy}%`} color={stats.avgAccuracy >= 70 ? '#22c55e' : '#fbbf24'} icon="🎯" />
                  <StatTile label="Total EV Loss" value={stats.totalEV.toFixed(1)} color="#ef4444" icon="📉" subtitle="bb total" />
                  <StatTile label="Win Rate" value={`${stats.sessions > 0 ? Math.round((stats.wins / stats.sessions) * 100) : 0}%`} color="#a855f7" icon="🏆" subtitle={`${stats.wins}/${stats.sessions} sessions`} />
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
                    color: '#00d4ff',
                    fontFamily: "'Orbitron', monospace",
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Recent Sessions ({filteredSessions.length})
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {filteredSessions.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: '#475569', fontSize: 12 }}>
                      No sessions found. Start training to see your progress!
                    </div>
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
                                background: acc >= 70 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {game}
                            </span>
                            <span style={{ color: acc >= 70 ? '#22c55e' : acc >= 50 ? '#fbbf24' : '#ef4444', fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>
                              {acc}%
                            </span>
                            <span style={{ color: '#475569', fontSize: 9 }}>{dateStr}</span>
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
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATOR (fallback when API unavailable)
// ═══════════════════════════════════════════════════════════════════════════

function generateMockSessions() {
  const games = [
    'GTO Preflop Trainer',
    'Pot Odds Quiz',
    'Position Awareness',
    'ICM Endgame',
    'Bluff Catcher Drill',
    'Play Mode Simulation',
    'Range Construction',
  ];

  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(i * 1.2));
    return {
      game_id: games[i % games.length].toLowerCase().replace(/ /g, '_'),
      game_name: games[i % games.length],
      accuracy: 45 + Math.floor(Math.random() * 50),
      hands_played: 5 + Math.floor(Math.random() * 20),
      total_ev_loss: Math.random() * 8,
      created_at: d.toISOString(),
    };
  });
}
