import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { usePersistedState } from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';


import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Last 7 Days' },
  { value: 'month', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];
const POSITION_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'unknown'];
const CLASSIFICATIONS = [
  ['best', 'Best', '#45e6ff'],
  ['correct', 'Correct', '#3ce78b'],
  ['inaccuracy', 'Inaccuracy', '#ffca5c'],
  ['wrong', 'Wrong', '#ff8d45'],
  ['blunder', 'Blunder', '#ff4d5e'],
];

// TRAIN-REPORTS-A11Y-1: the verified replacement keeps labeled navigation and
// uses a currentColor SVG instead of a font-dependent arrow glyph.
function BackArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatMetric(value, suffix = '') {
  return isFiniteNumber(value) ? `${Number(value).toLocaleString()}${suffix}` : '-';
}

function formatEv(value) {
  return isFiniteNumber(value) ? `${Number(value).toFixed(3)} BB` : '-';
}

function MetricCard({ label, value, detail, tone }) {
  return (
    <div className={`sd-metric ${s.metric}`}>
      <strong className={s.metricValue} data-tone={tone}>{value}</strong>
      <span className={s.metricLabel}>{label}</span>
      {detail && <span className={s.metricLabel} style={{ opacity: 0.85 }}>{detail}</span>}
    </div>
  );
}

function AccuracyBar({ value, tone }) {
  const numeric = isFiniteNumber(value) ? Math.max(0, Math.min(100, Number(value))) : null;
  return (
    <div className={s.track}>
      {numeric !== null && (
        <div className={`${s.fill} ${tone === 'up' ? s.fillUp : ''}`} style={{ width: `${numeric}%` }} />
      )}
    </div>
  );
}

function ClassificationStrip({ classifications = {} }) {
  const total = CLASSIFICATIONS.reduce((sum, [key]) => sum + (Number(classifications[key]) || 0), 0);
  return (
    <section className={`sd-panel ${s.panel}`} aria-labelledby="verified-classifications-title">
      <h2 id="verified-classifications-title" className={s.sectionTitle}>
        Verified Decision Classifications
      </h2>
      <div style={{ display: 'flex', minHeight: 12, background: '#06111c', boxShadow: 'inset 0 1px 3px #000, 0 0 0 1px rgba(124, 158, 187, 0.25)' }}>
        {CLASSIFICATIONS.map(([key, label, color]) => {
          const count = Number(classifications[key]) || 0;
          if (!count || total === 0) return null;
          return <div key={key} aria-label={`${label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: color }} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
        {CLASSIFICATIONS.map(([key, label, color]) => (
          <div key={key} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
            <div className={s.metricValue} style={{ fontSize: '1.2rem' }}>{Number(classifications[key]) || 0}</div>
            <div className={s.metricLabel}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const REPORTS_SURFACE_HELPERS = Object.freeze({
  BackArrowIcon,
  MetricCard,
  AccuracyBar,
  ClassificationStrip,
});

export default function VerifiedTrainingReports() {
  const router = useRouter();
  useTrainingBus('verified-training-reports');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [period, setPeriod] = usePersistedState('sp-filters-training-reports', 'all');
  const [gameId, setGameId] = usePersistedState('sp-filters-training-reports-format', '');

  useEffect(() => {
    const user = getAuthUser();
    setIsAuthenticated(Boolean(user?.id));
    if (!user?.id) setLoading(false);
  }, []);

  const fetchReport = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setFetchError(null);
    try {
      const query = new URLSearchParams({ period });
      if (gameId) query.set('gameId', gameId);
      const response = await authedFetch(`/api/training/gto-reports?${query.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true || !body?.report) {
        throw new Error(body?.error || `Request Failed (${response.status})`);
      }
      setReport(body.report);
    } catch (error) {
      console.warn('[VerifiedTrainingReports] Fetch Error:', error);
      setFetchError('Verified Training Reports Are Temporarily Unavailable. Please Try Again.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [gameId, isAuthenticated, period]);

  useEffect(() => {
    if (isAuthenticated) fetchReport();
  }, [fetchReport, isAuthenticated]);

  useEffect(() => {
    const unsubscribe = eventBus.on(EventType?.SESSION_END || 'session:end', fetchReport);
    return unsubscribe;
  }, [fetchReport]);

  const orderedPositions = useMemo(() => Object.entries(report?.positionReport || {})
    .sort(([left], [right]) => {
      const leftIndex = POSITION_ORDER.indexOf(left);
      const rightIndex = POSITION_ORDER.indexOf(right);
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    }), [report]);

  const formatRows = Array.isArray(report?.byFormat) ? report.byFormat : [];
  const dailyRows = Array.isArray(report?.byDate) ? report.byDate.slice(-14) : [];
  const querySource = typeof router.query?.source === 'string' ? router.query.source.trim() : '';
  const queryLeak = typeof router.query?.leak === 'string' ? router.query.leak.trim() : '';
  const isPaSource = querySource.startsWith('personal-assistant') || querySource.startsWith('assistant-sandbox');
  const backHref = isPaSource
    ? (queryLeak ? `/hub/personal-assistant/leaks?leak=${encodeURIComponent(queryLeak)}` : '/hub/personal-assistant/leaks')
    : '/hub/training';
  const backLabel = isPaSource ? 'Back To Personal Assistant' : 'Training';

  return (
    <>
      <Head>
        <title>Verified Training Reports | Smarter.Poker</title>
        <meta name="description" content="Review sealed Training results and measured solver evidence without inferred or simulated player statistics." />
      </Head>
      <div style={{ minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', background: '#040d18', color: '#f2f7ff' }}>
        <TrainingPageHead slug="training-reports" backHref={backHref} backLabel={backLabel} />

        <main className={s.page}>
          <section className={`sd-panel ${s.panel}`} aria-label="Report Filters">
            <div className={s.chips} role="group" aria-label="Report Period">
              {PERIOD_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={`sd-button ${s.button}`} aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
            <label className={s.label}>
              Training Game
              <select className={s.input} value={gameId} onChange={(event) => setGameId(event.target.value)}>
                <option value="">All Games</option>
                {(report?.availableFormats || []).map((format) => (
                  <option key={format.gameId} value={format.gameId}>{format.gameName} ({format.sessions})</option>
                ))}
              </select>
            </label>
          </section>

          <ErrorBanner message={fetchError} onRetry={fetchReport} />

          {!isAuthenticated ? (
            <TrainerEmptyState variant="locked" title="Sign In To View Verified Reports" message="Training History Is Private And Requires An Authenticated Account." cta={{ label: 'Sign In', onClick: () => router.push('/auth/login?redirect=/hub/training/reports') }} />
          ) : loading ? (
            <section className={`sd-panel ${s.panel} ${s.state}`} role="status" aria-live="polite">
              <p className={s.copy}>Loading Verified Training Evidence...</p>
            </section>
          ) : !report || report.totalSessions === 0 ? (
            <TrainerEmptyState variant="no-data" title="No Verified Training Data Yet" message="Complete A Non-Practice Training Session To Build This Report. No Sample Or Estimated Player Statistics Are Displayed." cta={{ label: 'Start Training', onClick: () => router.push('/hub/training') }} />
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gap: 14, minWidth: 0 }}>
              <section aria-label="Verified Summary" className={s.metrics}>
                <MetricCard label="Sessions" value={formatMetric(report.totalSessions)} />
                <MetricCard label="Hands" value={formatMetric(report.totalQuestions)} />
                <MetricCard label="Accuracy" value={formatMetric(report.overallAccuracy, '%')} tone="ice" />
                <MetricCard label="Verified Signed Score" value={formatMetric(report.verifiedScoreAverage)} detail="Scale: -100 To +100" tone="ice" />
                <MetricCard label="Measured EV Loss" value={formatEv(report.totalMeasuredEvLoss)} detail={`${report.measuredEvDecisions || 0} Solver-Measured Decisions`} />
              </section>

              <aside className={s.note}>
                <strong className={s.ice}>Evidence Boundary:</strong>{' '}
                Accuracy And Classifications Come From Completed, Non-Practice Server Attempts. EV Appears Only For Solver-Verified Decisions With Measured Loss. Frequency-Based VPIP, PFR, Three-Bet, And “GTO Proximity” Scores Are Not Inferred From Quiz Accuracy.
              </aside>

              <ClassificationStrip classifications={report.classifications} />

              <section className={`sd-panel ${s.panel}`} aria-labelledby="position-performance-title">
                <h2 id="position-performance-title" className={s.sectionTitle}>Performance By Position</h2>
                {orderedPositions.length === 0 ? (
                  <p className={s.copy}>No Position-Tagged Decisions Are Available.</p>
                ) : (
                  <div className={s.cardGrid}>
                    {orderedPositions.map(([position, data]) => (
                      <article key={position} className={`sd-metric ${s.card}`}>
                        <div className={s.panelHead}>
                          <strong className={s.ice}>{position === 'unknown' ? 'Unknown Position' : position}</strong>
                          <span className={s.white} style={{ fontWeight: 800 }}>{formatMetric(data.accuracy, '%')}</span>
                        </div>
                        <AccuracyBar value={data.accuracy} />
                        <div className={s.panelHead} style={{ fontSize: 12 }}>
                          <span className={s.metricLabel}>{data.correct}/{data.total} Correct</span>
                          <span className={s.metricLabel}>{data.measuredEvDecisions > 0 ? `${formatEv(data.avgMeasuredEvLoss)} Avg` : 'EV Unmeasured'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {formatRows.length > 0 && (
                <section className={`sd-panel ${s.panel}`} aria-labelledby="format-performance-title">
                  <h2 id="format-performance-title" className={s.sectionTitle}>Performance By Training Game</h2>
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr><th scope="col">Game</th><th scope="col">Sessions</th><th scope="col">Accuracy</th><th scope="col">Score</th><th scope="col">Avg EV Loss</th></tr>
                      </thead>
                      <tbody>
                        {formatRows.map((format) => (
                          <tr key={format.gameId}>
                            <td style={{ overflowWrap: 'anywhere' }}>{format.gameName}</td>
                            <td>{format.sessions}</td>
                            <td className={s.ice}>{formatMetric(format.accuracy, '%')}</td>
                            <td className={s.ice}>{formatMetric(format.verifiedScoreAverage)}</td>
                            <td>{format.measuredEvDecisions > 0 ? formatEv(format.avgMeasuredEvLoss) : 'Unmeasured'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {dailyRows.length > 0 && (
                <section className={`sd-panel ${s.panel}`} aria-labelledby="daily-performance-title">
                  <h2 id="daily-performance-title" className={s.sectionTitle}>Recent Daily Evidence</h2>
                  <div style={{ display: 'grid', gap: 9 }}>
                    {dailyRows.map((day) => (
                      <div key={day.date} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(40px, 1fr) auto auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
                        <span className={s.metricLabel}>{day.date}</span>
                        <AccuracyBar value={day.accuracy} />
                        <strong className={s.white}>{formatMetric(day.accuracy, '%')}</strong>
                        <span className={s.metricLabel}>{day.measuredEvDecisions > 0 ? formatEv(day.avgMeasuredEvLoss) : 'EV -'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </main>
      </div>
      <ConnectionToast />
    </>
  );
}
