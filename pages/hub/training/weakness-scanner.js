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
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
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


export const WEAKNESS_SCANNER_ICON_COMPONENT = WeaknessBackArrowIcon;
export default function WeaknessScannerPage() {
  const router = useRouter();
  useTrainingBus('weakness-scanner');
  const [loading, setLoading] = useState(true);
  const [rawSessions, setRawSessions] = useState(null);
  const [rawAnswers, setRawAnswers] = useState([]);
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
      const res = await authedFetch('/api/training/get-sessions?limit=50&includeAnswers=1');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const d = await res.json();
      if (d.success && Array.isArray(d.sessions)) setRawSessions(d.sessions);
      if (d.success && Array.isArray(d.recentAnswers)) setRawAnswers(d.recentAnswers);
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
    if (!rawSessions && (!rawAnswers || rawAnswers.length === 0)) return null;
    if (timeFilter === 'all') return analyzeData(rawSessions || [], rawAnswers || []);
    const now = Date.now();
    const cutoffMs = timeFilter === '7d' ? 7 * 86400000 : 30 * 86400000;
    const filtered = (rawSessions || []).filter(s => {
      const created = new Date(s.created_at || s.timestamp).getTime();
      return now - created < cutoffMs;
    });
    const filteredAnswers = (rawAnswers || []).filter(a => {
      const created = new Date(a.answered_at || a.created_at || Date.now()).getTime();
      return now - created < cutoffMs;
    });
    return analyzeData(filtered, filteredAnswers);
  }, [rawSessions, rawAnswers, timeFilter]);

  const topLeak = data?.topSpotLeak || data?.spotLeaks?.[0] || data?.leaks?.[0] || null;
  const hasVerifiedLeak = Boolean(topLeak && topLeak.sample >= 3);
  const topLeakHref = hasVerifiedLeak ? buildCustomTrainingArenaHref({
    gameId: topLeak.gameId || topLeak._engineLeak?.drill?.gameId,
    variant: topLeak.variant || 'nlh',
    street: topLeak.street || 'flop',
    position: topLeak.position || 'BB',
  }, 'weakness-scanner') : null;

  return (
    <>
      <SEOHead
        title="Position & Street Weakness Scanner"
        description="Scan Your Graded Poker Training History By Table Seat, Street, And Scenario Category To Pinpoint And Fix Expected Value Leaks On Smarter.Poker."
        canonical="/hub/training/weakness-scanner"
      />
      <div className={`sp-analysis-weakness ${s.shell}`}>
        <TrainingPageHead slug="training-weakness-scanner" note="Verified Session Analysis" />

        <div className={s.page}>
          {/* Time Filter */}
          <div className={s.chips} role="group" aria-label="Time Range">
            {[{ id: '7d', label: 'Last 7 Days' }, { id: '30d', label: 'Last 30 Days' }, { id: 'all', label: 'All Time' }].map(f => (
              <button
                key={f.id}
                type="button"
                className={`sd-button ${s.button}`}
                onClick={() => setTimeFilter(f.id)}
                aria-label={`Filter by ${f.label}`}
                aria-pressed={timeFilter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>

          {!loading && !fetchError && topLeakHref && (
            <section data-leak-brain-panel="true" data-leak-basis="verified-history" data-leak-sample-count={topLeak.sample}
              aria-labelledby="top-weakness" className={`sd-panel ${s.panel}`}>
              <h2 id="top-weakness" className={s.sectionTitle}>Top Weakness</h2>
              <p className={s.copy}>{topLeak.area || topLeak.name} Across {topLeak.sample} Decisions</p>
              <a href={topLeakHref} data-fix-top-leak-cta="true" className={`sd-button sd-primary ${s.button} ${s.primary}`}>Practice This Spot</a>
            </section>
          )}

          {/* Error State */}
          <ErrorBanner message={fetchError} onRetry={() => { setLoading(true); fetchData(); }} />

          {loading && (
            <section className={`sd-panel ${s.panel} ${s.state}`} role="status" aria-live="polite">
              <p className={s.copy}>Scanning Your Verified Sessions...</p>
            </section>
          )}

          {!loading && data && (
            <>
              {/* Summary Card */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="scan-summary-title">
                <div className={s.panelHead}>
                  <div>
                    <p className={s.eyebrow}>Scan Complete</p>
                    <h2 id="scan-summary-title" className={s.sectionTitle}>
                      {data.leaks.length} {data.leaks.length === 1 ? 'Weakness' : 'Weaknesses'} Identified
                    </h2>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <strong className={s.metricValue} data-tone={data.overallAcc === null ? undefined : data.overallAcc >= 80 ? 'up' : 'ice'}>
                      {data.overallAcc === null ? '-' : `${Math.round(data.overallAcc)}%`}
                    </strong>
                    <span className={s.metricLabel}>Overall Accuracy</span>
                  </div>
                </div>
                <p className={s.copy}>
                  Based On {data.totalHands} Verified Decisions. Modules Appear Below Only When They
                  Have At Least Three Decisions And Measured Accuracy Of 85% Or Lower.
                </p>

                {/* Severity Distribution */}
                {data.leaks.length > 0 && (() => {
                  const highCount = data.leaks.filter((l) => l.sev === 'High').length;
                  const medCount = data.leaks.filter((l) => l.sev === 'Medium').length;
                  const lowCount = data.leaks.filter((l) => l.sev === 'Low').length;
                  return (
                    <div className={s.metrics3} aria-label="Severity Distribution">
                      <div className={`sd-metric ${s.metric}`}>
                        <strong className={s.metricValue} data-tone={highCount > 0 ? 'down' : undefined}>{highCount}</strong>
                        <span className={s.metricLabel}>High</span>
                      </div>
                      <div className={`sd-metric ${s.metric}`}>
                        <strong className={s.metricValue} data-tone="ice">{medCount}</strong>
                        <span className={s.metricLabel}>Medium</span>
                      </div>
                      <div className={`sd-metric ${s.metric}`}>
                        <strong className={s.metricValue}>{lowCount}</strong>
                        <span className={s.metricLabel}>Low</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Drill Weakest CTA */}
                {data.leaks.length > 0 && data.leaks[0].sev !== 'Low' && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    className={`sd-button sd-primary ${s.button} ${s.primary} ${s.full}`}
                    onClick={() => {
                      const w = data.topSpotLeak || data.leaks[0];
                      router.push(buildCustomTrainingArenaHref({
                        gameId: w.gameId || w._engineLeak?.drill?.gameId,
                        variant: w.variant,
                        street: w.street,
                        position: w.position,
                      }, 'weakness-scanner'));
                    }}
                  >
                    Drill Weakest Spot: {(data.topSpotLeak || data.leaks[0]).area}
                  </motion.button>
                )}
              </section>

              {/* Leaks List */}
              {data.leaks.length > 0 && <h2 className={s.sectionTitle}>Identified Weaknesses</h2>}
              <AnimatePresence>
                {data.leaks.map((leak, i) => (
                  <motion.article
                    key={leak.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`sd-panel ${s.panel}`}
                  >
                    <div className={s.panelHead} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                        <h3 className={s.subTitle}>{leak.area}</h3>
                        <span className={s.tag} style={leak.sev === 'High' ? { color: '#ff7a86' } : undefined}>{leak.sev} Severity</span>
                        <span className={s.metricLabel}>Category: {leak.cat} • {leak.sample} Hand Sample</span>
                      </div>
                      <div className={`sd-metric ${s.metric}`}>
                        <strong className={s.metricValue} data-tone={leak.acc >= 75 ? 'up' : leak.acc >= 60 ? 'ice' : 'down'}>{leak.acc}%</strong>
                        <span className={s.metricLabel}>Accuracy</span>
                      </div>
                    </div>

                    <div className={s.answerBlock}>
                      <p className={s.eyebrow}>Verified Training Recommendation</p>
                      <p className={s.copy} style={{ color: '#f2f7ff' }}>{leak.tip}</p>
                    </div>

                    <div className={s.actions}>
                      <button
                        type="button"
                        className={`sd-button sd-primary ${s.button}`}
                        aria-label={`Practice ${leak.area} leak in spot trainer`}
                        onClick={() => {
                          router.push(buildCustomTrainingArenaHref({
                            gameId: leak.gameId || leak._engineLeak?.drill?.gameId,
                            variant: leak.variant,
                            street: leak.street,
                            position: leak.position,
                          }, 'weakness-scanner'));
                        }}
                      >
                        Practice This Leak
                      </button>
                      <button
                        type="button"
                        className={`sd-button ${s.button}`}
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
                      >
                        Get Coaching
                      </button>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
              {data.totalHands > 0 && data.leaks.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Measured Weakness Yet"
                  message="No Module With At Least Three Verified Decisions Is Currently At 85% Accuracy Or Lower. Keep Training To Expand The Sample."
                  compact
                />
              )}
              {data.totalHands === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No Scored Decisions Available"
                  message="Complete A Scored Training Session Before Running This Analysis."
                  compact
                />
              )}
            </>
          )}

          {!loading && !data && !fetchError && (
            rawSessions && rawSessions.length > 0 ? (
              <TrainerEmptyState
                variant="no-data"
                title="No Data In This Time Range"
                message="Try Selecting A Wider Time Range Above."
                compact
              />
            ) : (
              <TrainerEmptyState
                variant="no-data"
                title="No Data To Scan"
                message="Play Some Training Sessions First."
                compact
              />
            )
          )}
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-weakness-scanner" />
    </>
  );
}

WeaknessScannerPage.displayName = 'WeaknessScannerPage';
