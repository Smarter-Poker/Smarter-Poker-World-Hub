/**
 * WEAKNESS SCANNER — Auto-Leak Finder
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyzes session data to find statistical leaks by position and phase.
 *
 * Route: /hub/training/weakness-scanner
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-63 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-53 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
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
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';
// TRAIN-WIRE-EMPTY-6a — adoption: shared empty-state primitive

export const analyzeData = analyzeVerifiedTrainingWeaknesses;

// BUG FIX (TRAIN-WEAKNESS-A11Y-1): SVG icon components replacing the
// weakness-scanner emojis (■ empty state, ← back). Time-filter and CTA
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
        className="sp-training-tool sp-training-tool--analysis sp-analysis-weakness"
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          className="sp-training-analysis-header"
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
              color: 'var(--sp-fg-muted)',
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
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Verified Session Analysis</div>
          </div>
        </div>

        <div className="sp-training-analysis-main" style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
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
                  color: timeFilter === f.id ? 'var(--sp-accent-red)' : 'var(--sp-fg-dim)',
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
                        color: 'var(--sp-accent-red)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 4,
                      }}
                    >
                      Scan Complete
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>
                      {data.leaks.length} {data.leaks.length === 1 ? 'Weakness' : 'Weaknesses'} Identified
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        color: data.overallAcc === null
                          ? 'var(--sp-fg-muted)'
                          : data.overallAcc >= 80
                            ? 'var(--sp-accent-green)'
                            : 'var(--sp-accent-amber)',
                      }}
                    >
                      {data.overallAcc === null ? '-' : `${Math.round(data.overallAcc)}%`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sp-fg-muted)' }}>Overall Acc</div>
                  </div>
                </div>
                <div style={{ marginTop: 16, fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
                  Based On {data.totalHands} Verified Decisions. Modules Appear Below Only When They
                  Have At Least Three Decisions And Measured Accuracy Of 85% Or Lower.
                </div>
              </div>

              {/* Severity Distribution Bar */}
              {data.leaks.length > 0 && (() => {
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
                        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--sp-accent-red)' }}>
                          {highCount}
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--sp-accent-red)', textTransform: 'uppercase' }}>
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
                        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--sp-accent-amber)' }}>
                          {medCount}
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--sp-accent-amber)', textTransform: 'uppercase' }}>
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
                        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--sp-fg-muted)' }}>
                          {lowCount}
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
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
                    router.push(buildCustomTrainingArenaHref({
                      gameId: w.gameId || w._engineLeak?.drill?.gameId,
                    }, 'weakness-scanner'));
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-red-rgb), 1), #dc2626)',
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
              {data.leaks.length > 0 && <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 12,
                }}
              >
                Identified Weaknesses
              </div>}
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
                                  ? 'var(--sp-accent-red)'
                                  : leak.sev === 'Medium'
                                    ? 'var(--sp-accent-amber)'
                                    : 'var(--sp-fg-muted)',
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            {leak.sev} Severity
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                          Category: {leak.cat} • {leak.sample} Hand Sample
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color:
                              leak.acc >= 75 ? 'var(--sp-accent-green)' : leak.acc >= 60 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                          }}
                        >
                          {leak.acc}%
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>Accuracy</div>
                      </div>
                    </div>

                    <div
                      style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 8 }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'var(--sp-accent-cyan)',
                          textTransform: 'uppercase',
                          marginBottom: 4,
                        }}
                      >
                        Verified Training Recommendation
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.5 }}>
                        {leak.tip}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        aria-label={`Practice ${leak.area} leak in spot trainer`}
                        onClick={() => {
                          router.push(buildCustomTrainingArenaHref({
                            gameId: leak.gameId || leak._engineLeak?.drill?.gameId,
                          }, 'weakness-scanner'));
                        }}
                        style={{
                          flex: 1,
                          padding: '10px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'rgba(34,197,94,0.1)',
                          color: 'var(--sp-accent-green)',
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
                          color: 'var(--sp-accent-purple)',
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
              {data.totalHands > 0 && data.leaks.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Measured Weakness Yet"
                  message="No module with at least three verified decisions is currently at 85% accuracy or lower. Keep training to expand the sample."
                  compact
                />
              )}
              {data.totalHands === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Scored Decisions Available"
                  message="Complete a scored training session before running this analysis."
                  compact
                />
              )}
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
