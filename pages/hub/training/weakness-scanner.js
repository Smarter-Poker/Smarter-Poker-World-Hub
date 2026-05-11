/**
 * WEAKNESS SCANNER — Auto-Leak Finder
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes session data to find statistical leaks by position and phase.
 *
 * Route: /hub/training/weakness-scanner
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
// ── Phase 5 Engine: Auto-detect leaks against GTO benchmarks ────────────
import { detectLeaks, generateDrillRecommendations, LEAK_TYPES } from '../../../src/engines/LeakDetector';
import { identifyLeaks as identifySessionLeaks } from '../../../src/engines/SessionTracker';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-6a — adoption: shared empty-state primitive

function analyzeData(sessions) {
  if (!sessions || sessions.length === 0) return null;

  let totalHands = 0,
    totalCorrect = 0;
  const gameAccMap = {};

  sessions.forEach((s) => {
    // Handle varying payload structures historically used across the platform
    const q = Number(s.total_questions || s.questions_answered || 0);
    const c = Number(s.correct_count || s.questions_correct || 0);

    // Some tools (like Focus Timer) log sessions but don't output "questions". Count them as 1 volume unit.
    const vol = q > 0 ? q : 1;

    totalHands += vol;
    totalCorrect += c;

    const gId = s.game_id || s.gameId || 'unknown';

    // Exclude non-scoring tools from accuracy metrics
    if (!['focus-timer', 'risk-analyzer', 'gto-preloader'].includes(gId) && q > 0) {
      if (!gameAccMap[gId]) gameAccMap[gId] = { q: 0, c: 0 };
      gameAccMap[gId].q += q;
      gameAccMap[gId].c += c;
    }
  });

  const overallAcc = totalHands > 0 ? (totalCorrect / totalHands) * 100 : 0;
  const leaks = [];
  let idCounter = 1;

  for (const [gId, stats] of Object.entries(gameAccMap || {})) {
    if (stats.q < 3) continue; // Need minimum sample size to flag a leak

    const acc = (stats.c / stats.q) * 100;
    if (acc <= 85) {
      // Anything 85% or below is considered an active leak
      let tip, cat, area;
      area = gId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

      if (gId.includes('preflop')) {
        cat = 'Preflop';
        tip = `Your accuracy in ${area} is sub-optimal (${Math.round(acc)}%). Review your opening ranges and 3-bet frequencies to plug this leak.`;
      } else if (gId.includes('icm') || gId.includes('tournament')) {
        cat = 'ICM / Math';
        tip = `You are losing EV in high-pressure ${area} spots. Tighten your calling ranges near the bubble.`;
      } else if (gId.includes('ev') || gId.includes('geometry') || gId.includes('odds')) {
        cat = 'Postflop Math';
        tip = `Miscalculating pot odds and SPR. Re-drill ${area} to ensure you are getting the right mathematical price.`;
      } else if (gId.includes('short-deck')) {
        cat = 'Variant Rules';
        tip = `Short Deck equities differ drastically from NLHE. You are overvaluing top pair and undervaluing straight draws.`;
      } else {
        cat = 'General Tactics';
        tip = `Statistical weakness detected in ${area}. Replay this specific module repeatedly until your accuracy climbs above 90%.`;
      }

      leaks.push({
        id: idCounter++,
        cat,
        area,
        acc: Math.round(acc),
        sample: stats.q,
        tip,
        sev: acc < 65 ? 'High' : 'Medium',
      });
    }
  }

  // Default state if they are performing perfectly or playing low sample size
  if (leaks.length === 0 && totalHands > 0) {
    leaks.push({
      id: 999,
      cat: 'System Intel',
      area: 'Sample Size Too Small',
      acc: Math.round(overallAcc),
      sample: totalHands,
      tip: 'Your accuracy is solid, or we need more data. Keep drilling across different categories to uncover hidden leaks.',
      sev: 'Low',
    });
  }

  leaks.sort((a, b) => a.acc - b.acc);

  // ── Engine enrichment: GTO benchmark leak detection ──────────────────
  let engineLeaks = [];
  let drillRecommendations = [];
  try {
    // Run SessionTracker's identifyLeaks for position/game-type breakdowns
    const sessionLeakResult = identifySessionLeaks(sessions);
    if (sessionLeakResult && sessionLeakResult.length > 0) {
      engineLeaks = sessionLeakResult.map((l, i) => ({
        id: 1000 + i,
        cat: l.category || 'Engine Detection',
        area: l.area || l.type || 'Unknown',
        acc: Math.round((1 - (l.deviation || 0)) * 100),
        sample: l.sampleSize || 0,
        tip: l.recommendation || l.description || 'Review this area for GTO improvement',
        sev: (l.severity === 'high' || (l.deviation || 0) > 0.15) ? 'High' : 'Medium',
        _engineLeak: l,
      }));
    }

    // Run LeakDetector for drill recommendations if we have engine-enriched leaks
    if (engineLeaks.length > 0) {
      drillRecommendations = generateDrillRecommendations(
        engineLeaks.map(l => l._engineLeak).filter(Boolean)
      );
    }
  } catch (e) {
    console.warn('[Scanner] Engine leak detection failed:', e.message);
  }

  // Merge engine leaks that don't overlap with inline leaks
  const inlineAreas = new Set(leaks.map(l => l.area.toLowerCase()));
  engineLeaks.forEach(el => {
    if (!inlineAreas.has(el.area.toLowerCase())) {
      leaks.push(el);
    }
  });

  leaks.sort((a, b) => a.acc - b.acc);

  return { overallAcc, totalHands, leaks, drillRecommendations, engineLeaks };
}

// BUG FIX (TRAIN-WEAKNESS-A11Y-1): SVG icon components replacing the
// weakness-scanner emojis (📊 empty state, ← back). Time-filter and CTA
// buttons gain type+aria. Same surface-specific a11y pattern as PR
// #320/#322/#324/#327-#346.
const _WK_ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function WeaknessChartIcon({ size=32 }) {
  return (
    <svg {..._WK_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="3" y1="21" x2="21" y2="21"/>
      <rect x="5" y="13" width="3" height="7"/>
      <rect x="10" y="8" width="3" height="12"/>
      <rect x="15" y="4" width="3" height="16"/>
    </svg>
  );
}
function WeaknessBackArrowIcon({ size=18 }) {
  return (
    <svg {..._WK_ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}


export default function WeaknessScannerPage() {
  const router = useRouter();
  useTrainingBus('weakness-scanner');
  const [loading, setLoading] = useState(true);
  const [rawSessions, setRawSessions] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [timeFilter, setTimeFilter] = useState('all');

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setFetchError(null);
      const res = await authedFetch(`/api/training/get-sessions?limit=50`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const d = await res.json();
      if (d.success && d.sessions) setRawSessions(d.sessions);
    } catch (e) {
      console.warn('[Scanner]', e);
      setFetchError('Unable to load session data. Please check your connection.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  useEffect(() => {
    const h = () => fetchData();
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, [fetchData]);

  // Time-filtered analysis (computed at render-time so filter changes don't re-fetch)
  const data = React.useMemo(() => {
    if (!rawSessions) return null;
    if (timeFilter === 'all') return analyzeData(rawSessions);
    const now = Date.now();
    const cutoffMs = timeFilter === '7d' ? 7 * 86400000 : 30 * 86400000;
    const filtered = rawSessions.filter(s => {
      const created = new Date(s.created_at || s.timestamp).getTime();
      return now - created < cutoffMs;
    });
    return analyzeData(filtered);
  }, [rawSessions, timeFilter]);

  return (
    <>
      <Head>
        <title>Weakness Scanner | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* TRAIN-WEAKNESS-A11Y-1: SVG back arrow */}
            <WeaknessBackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-WEAKNESS-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Weakness Scanner</h1>
            <div style={{ fontSize: 11, color: '#64748b' }}>AI leak detection</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Time Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {[{ id: '7d', label: 'Last 7 Days' }, { id: '30d', label: 'Last 30 Days' }, { id: 'all', label: 'All Time' }].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTimeFilter(f.id)}
                aria-label={`Filter by ${f.label}`}
                aria-pressed={timeFilter === f.id}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 8,
                  border: `1px solid ${timeFilter === f.id ? 'rgba(248,113,113,0.2)' : 'transparent'}`,
                  background: timeFilter === f.id ? 'rgba(248,113,113,0.06)' : 'transparent',
                  color: timeFilter === f.id ? '#f87171' : '#64748b',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Error State */}
          <ErrorBanner message={fetchError} onRetry={() => { setLoading(true); fetchData(); }} />

          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="card" count={2} />
            </div>
          )}

          {!loading && data && (
            <>
              {/* Summary Card */}
              <div
                style={{
                  padding: '24px 20px',
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(248,113,113,0.1), rgba(0,0,0,0.2))',
                  border: '1px solid rgba(248,113,113,0.2)',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#f87171',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 4,
                      }}
                    >
                      Scan Complete
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>
                      {data.leaks.length} Leaks Detected
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        color: data.overallAcc >= 80 ? '#4ade80' : '#fbbf24',
                      }}
                    >
                      {Math.round(data.overallAcc)}%
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>Overall Acc</div>
                  </div>
                </div>
                <div style={{ marginTop: 16, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  Based on analysis of your last {data.totalHands} hands, we've identified specific
                  areas where your decisions consistently deviate from GTO frequencies.
                </div>
              </div>

              {/* Severity Distribution Bar */}
              {(() => {
                const highCount = data.leaks.filter((l) => l.sev === 'High').length;
                const medCount = data.leaks.filter((l) => l.sev === 'Medium').length;
                const lowCount = data.leaks.filter((l) => l.sev === 'Low').length;
                return (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    {highCount > 0 && (
                      <div
                        style={{
                          flex: highCount,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.15)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#ef4444' }}>
                          {highCount}
                        </div>
                        <div style={{ fontSize: 8, color: '#f87171', textTransform: 'uppercase' }}>
                          High
                        </div>
                      </div>
                    )}
                    {medCount > 0 && (
                      <div
                        style={{
                          flex: medCount,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'rgba(251,191,36,0.06)',
                          border: '1px solid rgba(251,191,36,0.12)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24' }}>
                          {medCount}
                        </div>
                        <div style={{ fontSize: 8, color: '#fbbf24', textTransform: 'uppercase' }}>
                          Medium
                        </div>
                      </div>
                    )}
                    {lowCount > 0 && (
                      <div
                        style={{
                          flex: lowCount,
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#94a3b8' }}>
                          {lowCount}
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase' }}>
                          Low
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Drill Weakest CTA */}
              {data.leaks.length > 0 && data.leaks[0].sev !== 'Low' && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const w = data.leaks[0];
                    const params = new URLSearchParams({ game: w.area.toLowerCase().replace(/\s+/g, '-') });
                    router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(239,68,68,0.25)',
                    marginBottom: 20,
                  }}
                >
                  Drill Weakest Spot: {data.leaks[0].area}
                </motion.button>
              )}

              {/* Leaks List */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                Identified Weaknesses
              </div>
              <AnimatePresence>
                {data.leaks.map((leak, i) => (
                  <motion.div
                    key={leak.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{
                      padding: '16px',
                      borderRadius: 12,
                      marginBottom: 12,
                      background: 'rgba(0,0,0,0.2)',
                      border: `1px solid ${leak.sev === 'High' ? 'rgba(239,68,68,0.3)' : leak.sev === 'Medium' ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                        >
                          <span style={{ fontSize: 15, fontWeight: 800 }}>{leak.area}</span>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              background:
                                leak.sev === 'High'
                                  ? 'rgba(239,68,68,0.1)'
                                  : leak.sev === 'Medium'
                                    ? 'rgba(251,191,36,0.1)'
                                    : 'rgba(255,255,255,0.05)',
                              color:
                                leak.sev === 'High'
                                  ? '#f87171'
                                  : leak.sev === 'Medium'
                                    ? '#fbbf24'
                                    : '#94a3b8',
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            {leak.sev} Severity
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          Category: {leak.cat} • {leak.sample} hand sample
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color:
                              leak.acc >= 75 ? '#4ade80' : leak.acc >= 60 ? '#fbbf24' : '#f87171',
                          }}
                        >
                          {leak.acc}%
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b' }}>Accuracy</div>
                      </div>
                    </div>

                    <div
                      style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 8 }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#00d4ff',
                          textTransform: 'uppercase',
                          marginBottom: 4,
                        }}
                      >
                        AI Fix Recommendation
                      </div>
                      <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
                        {leak.tip}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        aria-label={`Practice ${leak.area} leak in spot trainer`}
                        onClick={() => {
                          const params = new URLSearchParams({ game: leak.area.toLowerCase().replace(/\s+/g, '-') });
                          router.push(`/hub/training/arena/spot-trainer?${params.toString()}`);
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'rgba(34,197,94,0.1)',
                          color: '#4ade80',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Practice This Leak
                      </button>
                      <button
                        type="button"
                        aria-label={`Ask Jarvis about ${leak.area} leak`}
                        onClick={() => {
                          const q = new URLSearchParams({
                            context: 'weakness',
                            area: leak.area,
                            accuracy: String(leak.acc),
                            category: leak.cat,
                          });
                          window.location.href = `/hub/training/jarvis?${q.toString()}`;
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'rgba(168,85,247,0.1)',
                          color: '#a855f7',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Get Coaching
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}

          {!loading && !data && !fetchError && (
            rawSessions && rawSessions.length > 0 ? (
              <TrainerEmptyState
                variant="no-data"
                title="No data in this time range"
                message="Try selecting a wider time range above."
                compact
              />
            ) : (
              <TrainerEmptyState
                variant="no-data"
                title="No data to scan"
                message="Play some training sessions first."
                compact
              />
            )
          )}
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}
