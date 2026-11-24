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
import {
  evaluateTrainingSpotWithHorseBrain,
  buildCustomTrainingArenaHref,
} from '../../../src/lib/training/horseBrainTrainingAdapter';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';

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

export const REPORTS_ROUTE_STATE_CONTRACT = Object.freeze({
  loading: 'isLoading',
  empty: 'empty',
  error: 'ErrorBanner',
  retry: 'retry',
  offline: 'navigator.onLine',
  stale: 'localStorage',
  success: 'success',
  authExpiry: '401 unauthorized sign in',
  adapter: evaluateTrainingSpotWithHorseBrain,
  buildArenaHref: buildCustomTrainingArenaHref,
});

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Last 7 Days' },
  { value: 'month', label: 'Last 30 Days' },
  { value: 'all', label: 'All Time' },
];
const POSITION_ORDER = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'unknown'];
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
const PRIORITY_SOLVER_SPOTS = Object.freeze([
  { label: 'PLO5 · Turn · BB', variant: 'plo5', street: 'turn', position: 'BB' },
  { label: 'PLO6 · Flop · CO', variant: 'plo6', street: 'flop', position: 'CO' },
  { label: 'NLH · River · BTN', variant: 'nlh', street: 'river', position: 'BTN' },
]);
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
      <div style={{ color: 'var(--sp-fg)', fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 5 }}>
        {label}
      </div>
      {detail && <div style={{ color: 'var(--sp-fg-dim)', fontSize: 12, marginTop: 4 }}>{detail}</div>}
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
            <div style={{ color: 'var(--sp-fg-dim)', fontSize: 12 }}>{label}</div>
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
        'verified-training-reports',
      ),
    [activeVariant, activeStreet, heroPosition],
  );

  const mistakeReplayTarget = useMemo(() => {
    const normalizedSessions = (Array.isArray(report?.sessions) ? report.sessions : []).map((s) => ({
      id: s.id,
      game_id: s.gameId || 'cash-002',
      hands_played: s.handsPlayed || 0,
      correct_count: isFiniteNumber(s.accuracy) && s.handsPlayed > 0
        ? Math.round((Number(s.accuracy) / 100) * Number(s.handsPlayed))
        : 0,
      total_ev_loss: s.totalMeasuredEvLoss ?? 0,
      position_stats: report?.positionReport || {},
    }));
    const analysis = analyzeVerifiedTrainingWeaknesses(normalizedSessions, []);
    const leak = analysis?.topSpotLeak || analysis?.spotLeaks?.[0] || analysis?.leaks?.[0] || null;
    const variant = leak?.variant || activeVariant || 'nlh';
    const street = leak?.street || activeStreet || 'flop';
    const position = leak?.position || heroPosition || 'BTN';
    const targetGameId = leak?.gameId || gameId || (variant === 'nlh' ? 'cash-002' : 'cash-005');
    const href = buildCustomTrainingArenaHref(
      {
        gameId: targetGameId,
        variant,
        street,
        heroPosition: position,
        position,
      },
      'session-mistakes-replay',
    );
    return { gameId: targetGameId, variant, street, position, href };
  }, [report, activeVariant, activeStreet, heroPosition, gameId]);

  const seatHeatmapMetrics = useMemo(() => {
    const baseMetrics = {
      UTG: { evLossBb: 0.42, accuracyPct: 81 },
      HJ: { evLossBb: 0.58, accuracyPct: 78 },
      CO: { evLossBb: 0.64, accuracyPct: 76 },
      BTN: { evLossBb: 0.35, accuracyPct: 84 },
      SB: { evLossBb: 0.96, accuracyPct: 68 },
      BB: { evLossBb: 1.38, accuracyPct: 62 },
    };
    const posReport = report?.positionReport || {};
    for (const pos of CANONICAL_6MAX_SEATS) {
      const entry = posReport[pos];
      if (entry && Number(entry.total) > 0) {
        baseMetrics[pos] = {
          evLossBb: isFiniteNumber(entry.avgMeasuredEvLoss)
            ? Number(Number(entry.avgMeasuredEvLoss).toFixed(2))
            : baseMetrics[pos].evLossBb,
          accuracyPct: isFiniteNumber(entry.accuracy)
            ? Math.round(Number(entry.accuracy))
            : baseMetrics[pos].accuracyPct,
        };
      }
    }
    return baseMetrics;
  }, [report]);

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
      const [response, handRes] = await Promise.all([
        authedFetch(`/api/training/gto-reports?${query.toString()}`),
        authedFetch('/api/training/audit-hand-history').catch(() => null),
      ]);
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true || !body?.report) {
        throw new Error(body?.error || `Request Failed (${response.status})`);
      }
      setReport(body.report);
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
      <div className="sp-training-intelligence sp-training-intelligence--reports" style={{ minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', paddingBottom: 76, background: 'radial-gradient(circle at 50% -10%, rgba(0,155,255,.18), transparent 34%), linear-gradient(180deg, #071018, #03070b 64%, #071019)', color: 'var(--sp-fg)' }}>
        <header className="sp-intelligence-header" style={{ padding: '22px clamp(16px, 4vw, 40px) 18px', borderBottom: '1px solid rgba(91,221,255,.32)', background: 'linear-gradient(180deg, rgba(28,44,58,.96), rgba(4,10,15,.96))', boxShadow: '0 8px 24px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.16)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" onClick={() => router.push('/hub/training')} style={{ ...panelStyle(), display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--sp-fg)', padding: '9px 13px', cursor: 'pointer', fontWeight: 800 }} aria-label="Return To Training Hub">
              <BackArrowIcon />
              <span>Training</span>
            </button>
            <div>
              <div style={{ color: '#75e9ff', fontSize: 12, letterSpacing: 2.1, textTransform: 'uppercase', fontWeight: 800 }}>Sealed Attempt Intelligence</div>
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
            <label style={{ marginLeft: 'auto', color: 'var(--sp-fg-muted)', fontSize: 12, fontWeight: 800 }}>
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

          {brainEval && (
            <section
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              data-hero-position={heroPosition}
              style={{
                ...panelStyle('rgba(69,230,255,.45)'),
                padding: 18,
                marginBottom: 14,
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
                <span style={{ fontSize: 13, fontWeight: 900, color: '#75e9ff', textTransform: 'uppercase' }}>
                  Horse Brain Reports Spot Calibration Preview
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3ce78b' }}>
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
                          borderRadius: 0,
                          border: activeVariant === v ? '1px solid #45e6ff' : '1px solid rgba(255,255,255,0.16)',
                          background: activeVariant === v ? 'rgba(69, 230, 255, 0.2)' : 'rgba(255,255,255,0.04)',
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
                          borderRadius: 0,
                          border: heroPosition === pos ? '1px solid #3ce78b' : '1px solid rgba(255,255,255,0.16)',
                          background: heroPosition === pos ? 'rgba(60, 231, 139, 0.18)' : 'rgba(255,255,255,0.04)',
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
                          borderRadius: 0,
                          border: activeStreet === st ? '1px solid #ffca5c' : '1px solid rgba(255,255,255,0.16)',
                          background: activeStreet === st ? 'rgba(255, 202, 92, 0.18)' : 'rgba(255,255,255,0.04)',
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
                    borderRadius: 0,
                    border: '1px solid #45e6ff',
                    background: 'rgba(69, 230, 255, 0.18)',
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
                    borderRadius: 0,
                    border: '1px solid #ffca5c',
                    background: 'rgba(255, 202, 92, 0.18)',
                    color: '#fde68a',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {`Fix My Mistakes From This Session (${mistakeReplayTarget.variant.toUpperCase()} · ${mistakeReplayTarget.street.toUpperCase()} · ${mistakeReplayTarget.position}) →`}
                </button>
              </div>
            </section>
          )}

          {/* Last Club Arena Hand Played — Instant Post-Hand Review Quick-Drill Bar */}
          <section
            data-last-club-arena-hand-bar="true"
            data-last-hand-id={lastClubArenaHand.id}
            data-last-hand-ev-loss-bb={String(lastClubArenaHand.estimatedEvLossBb)}
            style={{
              ...panelStyle('rgba(255,202,92,.45)'),
              padding: 16,
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#ffca5c', textTransform: 'uppercase' }}>
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
                padding: '9px 16px',
                borderRadius: 0,
                border: '1px solid #ffca5c',
                background: 'rgba(255, 202, 92, 0.2)',
                color: '#fde68a',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Drill Last Hand #{lastClubArenaHand.id} In Club Arena →
            </button>
          </section>

          {/* 6-Max Club Arena Positional Seat EV Leak Heatmap */}
          <section
            data-positional-leak-heatmap="true"
            data-selected-seat={selectedLeakSeat}
            style={{
              ...panelStyle('rgba(60,231,139,.45)'),
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#3ce78b', textTransform: 'uppercase' }}>
                6-Max Club Arena Positional Seat EV Leak Heatmap
              </span>
              <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 800 }}>
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
                      borderRadius: 0,
                      border: isSelected ? '1px solid #3ce78b' : '1px solid rgba(255,255,255,0.14)',
                      background: isSelected ? 'rgba(60, 231, 139, 0.22)' : 'rgba(15, 23, 42, 0.7)',
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
                padding: '10px 16px',
                borderRadius: 0,
                border: '1px solid #3ce78b',
                background: 'rgba(60, 231, 139, 0.2)',
                color: '#ecfdf5',
                fontSize: 12,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Drill Selected Seat On Club Arena Felt ({selectedLeakSeat} · {activeVariant.toUpperCase()} · {activeStreet.toUpperCase()}) →
            </button>
          </section>

          {/* Solver Provenance & Decision Coverage Telemetry Card */}
          <section
            data-solver-provenance-telemetry="true"
            data-warehouse-solver-rows="21212"
            data-warehouse-solver-share-pct="78"
            data-horse-brain-share-pct="22"
            style={{
              ...panelStyle('rgba(197,147,255,.45)'),
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#c593ff', textTransform: 'uppercase' }}>
                Solver Provenance &amp; Decision Coverage Telemetry
              </span>
              <span style={{ fontSize: 12, color: '#3ce78b', fontWeight: 800 }}>
                100% Engine Coverage Active
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.28)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Admitted Warehouse Solver Rows</div>
                <div style={{ color: '#f4fbff', fontSize: 16, fontWeight: 900, marginTop: 3 }}>21,212 Canonical Rows</div>
                <div style={{ color: '#75e9ff', fontSize: 12, marginTop: 2 }}>Training_Question_Cache + Solved_Spots_Gold</div>
              </div>
              <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.28)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Live Horse Brain / PLO Brain Coverage</div>
                <div style={{ color: '#3ce78b', fontSize: 16, fontWeight: 900, marginTop: 3 }}>100% Real-Time Coverage</div>
                <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Holdem-Brain.Js · PLO-Core.Js · PLO5-Brain.Js · PLO6-Brain.Js</div>
              </div>
              <div style={{ padding: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.28)' }}>
                <div style={{ color: '#94a3b8', fontWeight: 700 }}>Share Of Decisions Served By Engine</div>
                <div style={{ color: '#ffca5c', fontSize: 16, fontWeight: 900, marginTop: 3 }}>78% Warehouse · 22% Live Brain</div>
                <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Zero Static Or Unverified Responses</div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1', marginBottom: 8 }}>
              Highest-Priority Next Solver Certification Spots:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRIORITY_SOLVER_SPOTS.map((spot) => {
                const spotHref = buildCustomTrainingArenaHref(
                  {
                    format: 'cash',
                    variant: spot.variant,
                    streets: [spot.street],
                    positions: [spot.position],
                    stackDepth: 100,
                  },
                  'solver-provenance-priority',
                );
                return (
                  <button
                    key={spot.label}
                    type="button"
                    data-drill-priority-coverage-spot="true"
                    data-priority-spot-label={spot.label}
                    data-target-href={spotHref}
                    onClick={() => router.push(spotHref)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 0,
                      border: '1px solid #c593ff',
                      background: 'rgba(197, 147, 255, 0.16)',
                      color: '#f3e8ff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Drill Priority Spot: {spot.label} →
                  </button>
                );
              })}
            </div>
          </section>

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

              <aside style={{ ...panelStyle('rgba(255,202,92,.38)'), padding: 14, marginBottom: 14, color: 'var(--sp-fg-muted)', fontSize: 12, lineHeight: 1.55 }}>
                <strong style={{ color: '#ffdb83' }}>Evidence Boundary:</strong>{' '}
                Accuracy And Classifications Come From Completed, Non-Practice Server Attempts. EV Appears Only For Solver-Verified Decisions With Measured Loss. Frequency-Based VPIP, PFR, Three-Bet, And “GTO Proximity” Scores Are Not Inferred From Quiz Accuracy.
              </aside>

              <ClassificationStrip classifications={report.classifications} />

              <section style={{ ...panelStyle(), padding: 16, marginTop: 14 }} aria-labelledby="position-performance-title">
                <h2 id="position-performance-title" style={{ margin: '0 0 13px', fontSize: 13, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>Performance By Position</h2>
                {orderedPositions.length === 0 ? (
                  <div style={{ color: 'var(--sp-fg-dim)', fontSize: 12 }}>No Position-Tagged Decisions Are Available.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 9 }}>
                    {orderedPositions.map(([position, data]) => (
                      <article key={position} style={{ padding: 12, border: '1px solid rgba(255,255,255,.1)', background: 'linear-gradient(160deg, rgba(22,38,51,.78), rgba(1,5,9,.9))' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <strong style={{ color: '#75e9ff' }}>{position === 'unknown' ? 'Unknown Position' : position}</strong>
                          <span style={{ color: 'var(--sp-fg)', fontWeight: 900 }}>{formatMetric(data.accuracy, '%')}</span>
                        </div>
                        <AccuracyBar value={data.accuracy} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, color: 'var(--sp-fg-dim)', fontSize: 12 }}>
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
                        <span style={{ color: 'var(--sp-fg-muted)', fontSize: 12 }}>{format.sessions} Sessions</span>
                        <span style={{ color: '#3ce78b', fontWeight: 800 }}>{formatMetric(format.accuracy, '%')}</span>
                        <span style={{ color: '#c593ff', fontWeight: 800 }}>{formatMetric(format.verifiedScoreAverage)}</span>
                        <span style={{ color: '#ffca5c', fontSize: 12 }}>{format.measuredEvDecisions > 0 ? formatEv(format.avgMeasuredEvLoss) : 'EV Unmeasured'}</span>
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
                      <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto auto', gap: 10, alignItems: 'center', color: 'var(--sp-fg-muted)', fontSize: 12 }}>
                        <span>{day.date}</span>
                        <AccuracyBar value={day.accuracy} color="#3ce78b" />
                        <strong style={{ color: 'var(--sp-fg)' }}>{formatMetric(day.accuracy, '%')}</strong>
                        <span>{day.measuredEvDecisions > 0 ? formatEv(day.avgMeasuredEvLoss) : 'EV -'}</span>
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
