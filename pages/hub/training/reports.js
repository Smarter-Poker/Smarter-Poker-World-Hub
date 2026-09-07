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

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatMetric(value, suffix = '') {
  return isFiniteNumber(value) ? `${Number(value).toLocaleString()}${suffix}` : '—';
}

function formatEv(value) {
  return isFiniteNumber(value) ? `${Number(value).toFixed(3)} BB` : '—';
}

function panelStyle(accent = 'rgba(69,230,255,.28)') {
  return {
    position: 'relative',
    overflow: 'hidden',
    border: `1px solid ${accent}`,
    borderRadius: 0,
    background: 'linear-gradient(145deg, rgba(24,38,51,.96), rgba(5,10,16,.98) 55%, rgba(16,27,38,.98))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16), inset 0 -12px 28px rgba(0,0,0,.38), 0 14px 34px rgba(0,0,0,.34)',
  };
}

function MetricCard({ label, value, detail, accent = '#45e6ff' }) {
  return (
    <div style={{ ...panelStyle(`${accent}55`), padding: '16px 14px', minWidth: 0 }}>
      <div style={{ color: accent, fontSize: 22, fontWeight: 900, fontFamily: "var(--font-orbitron), 'Orbitron', monospace", overflowWrap: 'anywhere' }}>
        {value}
      </div>
      <div style={{ color: 'var(--sp-fg)', fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 5 }}>
        {label}
      </div>
      {detail && <div style={{ color: 'var(--sp-fg-dim)', fontSize: 9, marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

function AccuracyBar({ value, color = '#45e6ff' }) {
  const numeric = isFiniteNumber(value) ? Math.max(0, Math.min(100, Number(value))) : null;
  return (
    <div style={{ height: 7, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
      {numeric !== null && (
        <div style={{ width: `${numeric}%`, height: '100%', background: `linear-gradient(90deg, ${color}77, ${color})`, boxShadow: `0 0 12px ${color}88` }} />
      )}
    </div>
  );
}

function ClassificationStrip({ classifications = {} }) {
  const total = CLASSIFICATIONS.reduce((sum, [key]) => sum + (Number(classifications[key]) || 0), 0);
  return (
    <section style={{ ...panelStyle(), padding: 16 }} aria-labelledby="verified-classifications-title">
      <h2 id="verified-classifications-title" style={{ margin: '0 0 13px', color: 'var(--sp-fg)', fontSize: 13, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
        Verified Decision Classifications
      </h2>
      <div style={{ display: 'flex', minHeight: 12, background: 'rgba(255,255,255,.05)', marginBottom: 12 }}>
        {CLASSIFICATIONS.map(([key, label, color]) => {
          const count = Number(classifications[key]) || 0;
          if (!count || total === 0) return null;
          return <div key={key} aria-label={`${label}: ${count}`} style={{ width: `${(count / total) * 100}%`, background: color, boxShadow: `0 0 12px ${color}55` }} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
        {CLASSIFICATIONS.map(([key, label, color]) => (
          <div key={key} style={{ borderLeft: `2px solid ${color}`, paddingLeft: 8 }}>
            <div style={{ color: 'var(--sp-fg)', fontWeight: 800, fontSize: 13 }}>{Number(classifications[key]) || 0}</div>
            <div style={{ color: 'var(--sp-fg-dim)', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

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

  return (
    <>
      <Head>
        <title>Verified Training Reports | Smarter.Poker</title>
        <meta name="description" content="Review sealed Training results and measured solver evidence without inferred or simulated player statistics." />
      </Head>
      <div className="sp-training-intelligence sp-training-intelligence--reports" style={{ minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', paddingBottom: 76, background: 'radial-gradient(circle at 50% -10%, rgba(0,155,255,.18), transparent 34%), linear-gradient(180deg, #071018, #03070b 64%, #071019)', color: 'var(--sp-fg)' }}>
        <header className="sp-intelligence-header" style={{ padding: '22px clamp(16px, 4vw, 40px) 18px', borderBottom: '1px solid rgba(91,221,255,.32)', background: 'linear-gradient(180deg, rgba(28,44,58,.96), rgba(4,10,15,.96))', boxShadow: '0 8px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.16)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" onClick={() => router.push('/hub/training')} style={{ ...panelStyle(), color: 'var(--sp-fg)', padding: '9px 13px', cursor: 'pointer', fontWeight: 800 }} aria-label="Return To Training Hub">
              ← Training
            </button>
            <div>
              <div style={{ color: '#75e9ff', fontSize: 9, letterSpacing: 2.1, textTransform: 'uppercase', fontWeight: 800 }}>Sealed Attempt Intelligence</div>
              <h1 style={{ margin: '3px 0 0', fontSize: 'clamp(21px, 4vw, 34px)', fontFamily: "var(--font-orbitron), 'Orbitron', monospace", color: '#f4fbff', textShadow: '0 2px 0 #000, 0 0 20px rgba(69,230,255,.35)' }}>
                Verified Training Reports
              </h1>
            </div>
          </div>
        </header>

        <main className="sp-intelligence-main" style={{ width: 'min(1100px, calc(100% - 28px))', margin: '0 auto', paddingTop: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {PERIOD_OPTIONS.map((option) => (
              <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} style={{ ...panelStyle(period === option.value ? 'rgba(69,230,255,.75)' : 'rgba(255,255,255,.13)'), color: period === option.value ? '#eaffff' : 'var(--sp-fg-muted)', padding: '9px 13px', cursor: 'pointer', fontWeight: 800 }}>
                {option.label}
              </button>
            ))}
            <label style={{ marginLeft: 'auto', color: 'var(--sp-fg-muted)', fontSize: 10, fontWeight: 800 }}>
              Training Game{' '}
              <select value={gameId} onChange={(event) => setGameId(event.target.value)} style={{ marginLeft: 6, color: '#f4fbff', background: '#071018', border: '1px solid rgba(69,230,255,.35)', borderRadius: 0, padding: '8px 10px' }}>
                <option value="">All Games</option>
                {(report?.availableFormats || []).map((format) => (
                  <option key={format.gameId} value={format.gameId}>{format.gameName} ({format.sessions})</option>
                ))}
              </select>
            </label>
          </div>

          <ErrorBanner message={fetchError} onRetry={fetchReport} />

          {!isAuthenticated ? (
            <TrainerEmptyState variant="locked" title="Sign In To View Verified Reports" message="Training History Is Private And Requires An Authenticated Account." cta={{ label: 'Sign In', onClick: () => router.push('/auth/login?next=/hub/training/reports') }} />
          ) : loading ? (
            <div style={{ ...panelStyle(), padding: 48, textAlign: 'center', color: 'var(--sp-fg-muted)' }}>Loading Verified Training Evidence...</div>
          ) : !report || report.totalSessions === 0 ? (
            <TrainerEmptyState variant="no-data" title="No Verified Training Data Yet" message="Complete A Non-Practice Training Session To Build This Report. No Sample Or Estimated Player Statistics Are Displayed." cta={{ label: 'Start Training', onClick: () => router.push('/hub/training') }} />
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <section aria-label="Verified Summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                <MetricCard label="Sessions" value={formatMetric(report.totalSessions)} />
                <MetricCard label="Hands" value={formatMetric(report.totalQuestions)} accent="#78a8ff" />
                <MetricCard label="Accuracy" value={formatMetric(report.overallAccuracy, '%')} accent="#3ce78b" />
                <MetricCard label="Verified Signed Score" value={formatMetric(report.verifiedScoreAverage)} detail="Scale: -100 To +100" accent="#c593ff" />
                <MetricCard label="Measured EV Loss" value={formatEv(report.totalMeasuredEvLoss)} detail={`${report.measuredEvDecisions || 0} Solver-Measured Decisions`} accent="#ffca5c" />
              </section>

              <aside style={{ ...panelStyle('rgba(255,202,92,.38)'), padding: 14, marginBottom: 14, color: 'var(--sp-fg-muted)', fontSize: 11, lineHeight: 1.55 }}>
                <strong style={{ color: '#ffdb83' }}>Evidence Boundary:</strong>{' '}
                Accuracy And Classifications Come From Completed, Non-Practice Server Attempts. EV Appears Only For Solver-Verified Decisions With Measured Loss. Frequency-Based VPIP, PFR, Three-Bet, And “GTO Proximity” Scores Are Not Inferred From Quiz Accuracy.
              </aside>

              <ClassificationStrip classifications={report.classifications} />

              <section style={{ ...panelStyle(), padding: 16, marginTop: 14 }} aria-labelledby="position-performance-title">
                <h2 id="position-performance-title" style={{ margin: '0 0 13px', fontSize: 13, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>Performance By Position</h2>
                {orderedPositions.length === 0 ? (
                  <div style={{ color: 'var(--sp-fg-dim)', fontSize: 11 }}>No Position-Tagged Decisions Are Available.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 9 }}>
                    {orderedPositions.map(([position, data]) => (
                      <article key={position} style={{ padding: 12, border: '1px solid rgba(255,255,255,.1)', background: 'linear-gradient(160deg, rgba(22,38,51,.78), rgba(1,5,9,.9))' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <strong style={{ color: '#75e9ff' }}>{position === 'unknown' ? 'Unknown Position' : position}</strong>
                          <span style={{ color: 'var(--sp-fg)', fontWeight: 900 }}>{formatMetric(data.accuracy, '%')}</span>
                        </div>
                        <AccuracyBar value={data.accuracy} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, color: 'var(--sp-fg-dim)', fontSize: 9 }}>
                          <span>{data.correct}/{data.total} Correct</span>
                          <span>{data.measuredEvDecisions > 0 ? `${formatEv(data.avgMeasuredEvLoss)} Avg` : 'EV Unmeasured'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {formatRows.length > 0 && (
                <section style={{ ...panelStyle(), padding: 16, marginTop: 14 }} aria-labelledby="format-performance-title">
                  <h2 id="format-performance-title" style={{ margin: '0 0 13px', fontSize: 13, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>Performance By Training Game</h2>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {formatRows.map((format) => (
                      <div key={format.gameId} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1.5fr) repeat(4, minmax(64px, .7fr))', gap: 9, alignItems: 'center', padding: '10px 11px', border: '1px solid rgba(255,255,255,.08)', overflowX: 'auto' }}>
                        <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{format.gameName}</strong>
                        <span style={{ color: 'var(--sp-fg-muted)', fontSize: 10 }}>{format.sessions} Sessions</span>
                        <span style={{ color: '#3ce78b', fontWeight: 800 }}>{formatMetric(format.accuracy, '%')}</span>
                        <span style={{ color: '#c593ff', fontWeight: 800 }}>{formatMetric(format.verifiedScoreAverage)}</span>
                        <span style={{ color: '#ffca5c', fontSize: 10 }}>{format.measuredEvDecisions > 0 ? formatEv(format.avgMeasuredEvLoss) : 'EV Unmeasured'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {dailyRows.length > 0 && (
                <section style={{ ...panelStyle(), padding: 16, marginTop: 14 }} aria-labelledby="daily-performance-title">
                  <h2 id="daily-performance-title" style={{ margin: '0 0 13px', fontSize: 13, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>Recent Daily Evidence</h2>
                  <div style={{ display: 'grid', gap: 7 }}>
                    {dailyRows.map((day) => (
                      <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto auto', gap: 10, alignItems: 'center', color: 'var(--sp-fg-muted)', fontSize: 10 }}>
                        <span>{day.date}</span>
                        <AccuracyBar value={day.accuracy} color="#3ce78b" />
                        <strong style={{ color: 'var(--sp-fg)' }}>{formatMetric(day.accuracy, '%')}</strong>
                        <span>{day.measuredEvDecisions > 0 ? formatEv(day.avgMeasuredEvLoss) : 'EV —'}</span>
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
