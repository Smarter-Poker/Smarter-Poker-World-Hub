/**
 * GTO REPORTS — GTO Wizard-Style Performance Report
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Aggregate view of user's training performance vs GTO baselines.
 * Color-coded deviation matrix, classification breakdown, and trends.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH4-9 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-39 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import GTODeviationHeatmap from '../../../src/components/training/GTODeviationHeatmap';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
// ●● Phase 3+5 Engines: Session trends + leak detection for reports ●●●●●●
import { calculateTrends, identifyLeaks } from '../../../src/engines/SessionTracker';
import { detectLeaks, generateDrillRecommendations } from '../../../src/engines/LeakDetector';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';

// TRAIN-CSS-MOTION-ADOPT-24 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-1b — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CLASSIFICATION CONFIG
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const CLASS_CONFIG = {
  best: { label: 'Best', color: 'var(--sp-accent-green)', bg: 'rgba(34, 197, 94, 0.15)' },
  correct: { label: 'Correct', color: 'var(--sp-accent-blue)', bg: 'rgba(59, 130, 246, 0.15)' },
  inaccuracy: { label: 'Inaccuracy', color: 'var(--sp-accent-amber)', bg: 'rgba(251, 191, 36, 0.15)' },
  wrong: { label: 'Wrong', color: 'var(--sp-accent-orange)', bg: 'rgba(249, 115, 22, 0.15)' },
  blunder: { label: 'Blunder', color: 'var(--sp-accent-red)', bg: 'rgba(239, 68, 68, 0.15)' },
};

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// DEVIATION CELL
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function DeviationCell({ value, deviation }) {
  // Color: green = close to GTO, yellow = moderate, red = far
  const getColor = (dev) => {
    if (dev === null || dev === undefined) return 'var(--sp-fg-faint)';
    if (dev <= 5) return 'var(--sp-accent-green)';
    if (dev <= 10) return 'var(--sp-accent-green)';
    if (dev <= 15) return 'var(--sp-accent-amber)';
    if (dev <= 25) return 'var(--sp-accent-orange)';
    return 'var(--sp-accent-red)';
  };

  const getBg = (dev) => {
    if (dev === null || dev === undefined) return 'rgba(255,255,255,0.03)';
    if (dev <= 5) return 'rgba(34, 197, 94, 0.1)';
    if (dev <= 10) return 'rgba(34, 197, 94, 0.05)';
    if (dev <= 15) return 'rgba(251, 191, 36, 0.1)';
    if (dev <= 25) return 'rgba(249, 115, 22, 0.1)';
    return 'rgba(239, 68, 68, 0.1)';
  };

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '6px 8px',
        background: getBg(deviation),
        borderRadius: 6,
        border: `1px solid ${getColor(deviation)}20`,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: getColor(deviation),
          fontFamily: "'Orbitron', monospace",
        }}
      >
        {value}%
      </div>
      {deviation !== null && (
        <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)', fontWeight: 600 }}>
          {deviation <= 5 ? '≈ GTO' : `±${deviation}%`}
        </div>
      )}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CLASSIFICATION BAR
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function ClassificationBar({ classifications, total }) {
  if (!classifications || total === 0) return null;

  const ordered = ['best', 'correct', 'inaccuracy', 'wrong', 'blunder'];

  return (
    <div>
      {/* Stacked bar */}
      <div
        style={{
          display: 'flex',
          height: 24,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        {ordered.map((cls) => {
          const count = classifications[cls] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <motion.div
              key={cls}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: MOTION.slow, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: CLASS_CONFIG[cls]?.color || 'var(--sp-fg-faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                minWidth: pct > 5 ? 30 : 0,
              }}
            >
              {pct > 8 ? `${Math.round(pct)}%` : ''}
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 8,
          justifyContent: 'center',
        }}
      >
        {ordered.map((cls) => {
          const count = classifications[cls] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: CLASS_CONFIG[cls]?.color,
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--sp-fg-muted)', fontWeight: 600 }}>
                {CLASS_CONFIG[cls]?.label}: {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// BUG FIX (TRAIN-REPORTS-A11Y-1): SVG back arrow + button hardening for
// the GTO reports surface. The rendered UI is already emoji-free
// (all emojis present are inside source comments). Same surface-specific
// a11y pattern as PR #320/#322/#324/#327-#342.
const _RPT_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function ReportsBackArrowIcon({ size=14 }) {
  return (
    <svg {..._RPT_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}


export default function GTOReports() {
  const router = useRouter();
  useTrainingBus('gto-reports');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = usePersistedState('sp-filters-training-reports', 'all');
  const [userId, setUserId] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Get user ID from auth on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const authUser = getAuthUser();
      if (authUser?.id) {
        setUserId(authUser.id);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.warn('[Reports] Auth error:', e);
      setLoading(false);
    }
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await authedFetch(`/api/training/gto-reports?userId=${userId}&period=${period}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        // Engine enrichment: add trends + leak detection to report
        let enrichedReport = data.report;
        try {
          if (data.report?.sessions && Array.isArray(data.report.sessions)) {
            const trends = calculateTrends(data.report.sessions);
            const leaks = identifyLeaks(data.report.sessions);
            const engineLeaks = detectLeaks(data.report);
            const drills = generateDrillRecommendations(engineLeaks || []);
            enrichedReport = {
              ...data.report,
              _engineTrends: trends,
              _engineLeaks: leaks,
              _detectedLeaks: engineLeaks,
              _drillRecommendations: drills,
            };
          }
        } catch (e) {
          console.warn('[Reports] Engine enrichment failed:', e.message);
        }
        setReport(enrichedReport);
      }
    } catch (err) {
      console.warn('[Reports] Fetch error:', err);
      setFetchError('Unable to load GTO reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    if (userId) fetchReport();
  }, [fetchReport, userId]);

  // Bus listener: auto-refresh when Play Mode (or any trainer) completes a session
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      if (userId) fetchReport();
    });
    return unsub;
  }, [userId, fetchReport]);

  const positionOrder = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

  return (
    <>
      <Head>
        <title>GTO Reports | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Compare your poker training stats against optimal GTO frequencies. Find your biggest leaks."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
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
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              aria-label="Back to training"
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
              {/* TRAIN-REPORTS-A11Y-1: SVG back arrow + visible label */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ReportsBackArrowIcon size={14} />
                Training
              </span>
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-green-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron', monospace",
              }}
            >
              GTO Reports
            </h1>
          </div>

          {/* Period Selector */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[
              { value: 'week', label: 'Last 7 Days' },
              { value: 'month', label: 'Last 30 Days' },
              { value: 'all', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={period === p.value}
                aria-label={`Show ${p.label}`}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'all 0.2s',
                  background:
                    period === p.value
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-green-rgb), 1))'
                      : 'rgba(255,255,255,0.06)',
                  color: period === p.value ? '#fff' : 'var(--sp-fg-muted)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', maxWidth: 800, margin: '0 auto' }}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchReport(); }} />
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: '3px solid rgba(0,212,255,0.2)',
                  borderTop: '3px solid #00d4ff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto',
                }}
              />
              <p style={{ color: 'var(--sp-fg-dim)', fontSize: 13, marginTop: 12 }}>
                Loading your GTO report...
              </p>
              <style>{`
                @keyframes spin {
                  to {
                    transform: rotate(360deg);
                  }
                }
              `}</style>
            </div>
          ) : !report || report.totalSessions === 0 ? (
            <div style={{ paddingTop: 60 }}>
              <TrainerEmptyState
                variant="no-data"
                title="No training data"
                message="Complete some training sessions to see your GTO report."
              />
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              {/* Top Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                {[
                  { label: 'Sessions', value: report.totalSessions, color: 'var(--sp-accent-purple)' },
                  { label: 'Questions', value: report.totalQuestions, color: 'var(--sp-accent-blue)' },
                  {
                    label: 'Accuracy',
                    value: `${report.overallAccuracy}%`,
                    color:
                      report.overallAccuracy >= 70
                        ? 'var(--sp-accent-green)'
                        : report.overallAccuracy >= 50
                          ? 'var(--sp-accent-amber)'
                          : 'var(--sp-accent-red)',
                  },
                  { label: 'Best Rate', value: `${report.bestRate}%`, color: 'var(--sp-accent-purple)' },
                  {
                    label: 'GTO Proximity',
                    value:
                      report.gtoProximityScore !== undefined
                        ? `${report.gtoProximityScore}%`
                        : 'N/A',
                    color:
                      (report.gtoProximityScore || 0) >= 85
                        ? 'var(--sp-accent-cyan)'
                        : (report.gtoProximityScore || 0) >= 70
                          ? 'var(--sp-accent-green)'
                          : 'var(--sp-accent-amber)',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      padding: '14px 12px',
                      borderRadius: 10,
                      textAlign: 'center',
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: stat.color,
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: 'var(--sp-fg-dim)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginTop: 4,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Classification Breakdown */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--sp-fg-muted)',
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  Move Classification Distribution
                </div>
                <ClassificationBar
                  classifications={report.classifications}
                  total={report.totalQuestions}
                />
              </div>

              {/* Position Deviation Matrix */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.04), rgba(34,197,94,0.03))',
                  border: '1px solid rgba(0,212,255,0.15)',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--sp-accent-cyan)',
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    marginBottom: 14,
                    fontFamily: "'Orbitron', monospace",
                  }}
                >
                  Position Accuracy vs GTO Baseline
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                  }}
                >
                  {positionOrder.map((pos) => {
                    const data = report.positionReport?.[pos];
                    if (!data || data.total === 0) {
                      return (
                        <div
                          key={pos}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            textAlign: 'center',
                            opacity: 0.4,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: 'var(--sp-fg-dim)',
                              fontFamily: "'Orbitron', monospace",
                              marginBottom: 4,
                            }}
                          >
                            {pos}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)' }}>No data</div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={pos}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: 'var(--sp-accent-cyan)',
                            fontFamily: "'Orbitron', monospace",
                            marginBottom: 6,
                            textAlign: 'center',
                          }}
                        >
                          {pos}
                        </div>
                        <DeviationCell value={data.accuracy} deviation={data.deviation} />
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 9,
                            color: 'var(--sp-fg-dim)',
                            textAlign: 'center',
                          }}
                        >
                          {data.total} hands • EV: -{data.avgEvLoss}BB
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 12,
                    marginTop: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    { label: '≈ GTO (±5%)', color: 'var(--sp-accent-green)' },
                    { label: 'Close (±10%)', color: 'var(--sp-accent-green)' },
                    { label: 'Moderate (±15%)', color: 'var(--sp-accent-amber)' },
                    { label: 'Significant (±25%)', color: 'var(--sp-accent-orange)' },
                    { label: 'Major Leak (25%+)', color: 'var(--sp-accent-red)' },
                  ].map((l) => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: l.color,
                        }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--sp-fg-muted)', fontWeight: 600 }}>
                        {l.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* ♠ GTO Scorecard: VPIP / PFR / 3Bet deviations */}
                {report.scorecardStats && report.scorecardStats.totalAnalyzed > 0 && (
                  <div
                    style={{
                      marginTop: 24,
                      paddingTop: 16,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: 'var(--sp-fg)',
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        marginBottom: 12,
                        fontFamily: "'Orbitron', monospace",
                      }}
                    >
                      GTO Deviation Scorecard
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-muted)', marginBottom: 16 }}>
                      Based on {report.scorecardStats.totalAnalyzed} preflop hands played across
                      your tracked sessions.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <GTODeviationHeatmap
                        label="VPIP (Voluntarily Put In Pot)"
                        description="Measures how often you enter the pot. High VPIP means you play too many hands."
                        actualPct={report.scorecardStats.vpip}
                        gtoPct={report.gtoBaselines?.scorecard?.vpip || 22.5}
                      />
                      <GTODeviationHeatmap
                        label="PFR (Preflop Raise)"
                        description="Measures aggression preflop. Should closely mirror your VPIP."
                        actualPct={report.scorecardStats.pfr}
                        gtoPct={report.gtoBaselines?.scorecard?.pfr || 18.0}
                      />
                      <GTODeviationHeatmap
                        label="3-Bet %"
                        description="Frequency of re-raising an open. Key indicator of aggression."
                        actualPct={report.scorecardStats.threeBet}
                        gtoPct={report.gtoBaselines?.scorecard?.threeBet || 8.5}
                      />
                    </div>
                  </div>
                )}

                {/* ▲ Weakest Spots Heatmap */}
                {report.positionReport &&
                  (() => {
                    const sorted = positionOrder
                      .filter((p) => report.positionReport[p]?.total > 0)
                      .map((p) => ({ pos: p, ...report.positionReport[p] }))
                      .sort((a, b) => a.accuracy - b.accuracy);
                    const weakest = sorted.slice(0, 3);

                    if (weakest.length === 0) return null;

                    return (
                      <div
                        style={{
                          marginTop: 24,
                          padding: 16,
                          background: 'rgba(239,68,68,0.05)',
                          borderRadius: 12,
                          border: '1px solid rgba(239,68,68,0.15)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--sp-accent-red)',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 16, fontWeight: 'bold' }}>●</span>
                          Weakest Spots — Fix These First
                        </div>

                        {weakest.map((w, idx) => (
                          <div
                            key={w.pos}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '8px 0',
                              borderBottom:
                                idx < weakest.length - 1
                                  ? '1px solid rgba(255,255,255,0.04)'
                                  : 'none',
                            }}
                          >
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 4,
                                background:
                                  w.accuracy < 40
                                    ? 'var(--sp-accent-red)'
                                    : w.accuracy < 60
                                      ? 'var(--sp-accent-orange)'
                                      : 'var(--sp-accent-amber)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 800,
                                color: '#000',
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: 'var(--sp-fg)',
                                fontFamily: "'Orbitron', monospace",
                                width: 36,
                              }}
                            >
                              {w.pos}
                            </div>
                            <div
                              style={{
                                flex: 1,
                                height: 6,
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${w.accuracy}%`,
                                  height: '100%',
                                  borderRadius: 3,
                                  background:
                                    w.accuracy < 40
                                      ? 'var(--sp-accent-red)'
                                      : w.accuracy < 60
                                        ? 'var(--sp-accent-orange)'
                                        : 'var(--sp-accent-amber)',
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: "'Orbitron', monospace",
                                color:
                                  w.accuracy < 40
                                    ? 'var(--sp-accent-red)'
                                    : w.accuracy < 60
                                      ? 'var(--sp-accent-orange)'
                                      : 'var(--sp-accent-amber)',
                                width: 36,
                                textAlign: 'right',
                              }}
                            >
                              {w.accuracy}%
                            </span>
                            <button
                              onClick={() =>
                                router.push(`/hub/training/solutions?position=${w.pos}`)
                              }
                              style={{
                                background: 'rgba(249,115,22,0.15)',
                                border: '1px solid rgba(249,115,22,0.3)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                color: 'var(--sp-accent-orange)',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Fix Leak →
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            </motion.div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}