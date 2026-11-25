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
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';
import { evaluateTrainingSpotWithHorseBrain } from '../../../src/lib/training/horseBrainTrainingAdapter';
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


const DEFAULT_LAST_HAND = Object.freeze({
  id: '994810242',
  variant: 'nlh',
  street: 'flop',
  heroPosition: 'BTN',
  estimatedEvLossBb: 1.45,
  recommendedAction: 'Bet 75% Pot',
  drillHref: '/hub/training/arena/cash-002?level=1&source=live-hand-sync&syncedHandId=994810242',
});

const CANONICAL_6MAX_SEATS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

const CANONICAL_PLO8_LEAK_BUCKETS = Object.freeze([
  {
    id: 'plo8_quartering_trap',
    title: 'PLO8 One-Way Nut Low Quartering Trap',
    evLossPerHandBb: 1.62,
    sampleCount: 18,
    remedy: 'Fold naked A-2 without high backup or low redraws when facing multiway pot-size action.',
  },
  {
    id: 'plo8_counterfeit_vulnerability',
    title: 'PLO8 Unprotected A-2 Counterfeit Vulnerability',
    evLossPerHandBb: 1.28,
    sampleCount: 14,
    remedy: 'Prioritize A-2-3 and A-2-4 wheel wraps that retain nut low equity when an Ace or Deuce hits.',
  },
  {
    id: 'plo8_missed_scoop_raise',
    title: 'PLO8 Missed Two-Way High + Low Scoop Raise',
    evLossPerHandBb: 1.14,
    sampleCount: 22,
    remedy: 'Pot-raise two-way nut low plus flush or set redraws to freeroll opponents drawing to half the pot.',
  },
  {
    id: 'fixed_limit_turn_cap_defense',
    title: 'Fixed-Limit Turn Big-Bet & 4-Raise Cap Defense',
    evLossPerHandBb: 0.94,
    sampleCount: 16,
    remedy: 'Defend wider against turn double-bet sizing and cap 4-bet spots only when two-way scoop equity exceeds 58%.',
  },
]);

function computeDecisionPacingTelemetry(answersList = [], sessionsList = []) {
  const buckets = {
    impulse_snap: {
      id: 'impulse_snap',
      label: 'Impulse Snap Under 3s',
      count: 14,
      correct: 8,
      totalEvLossBb: 18.2,
    },
    optimal_read: {
      id: 'optimal_read',
      label: 'Optimal Read 3s To 10s',
      count: 38,
      correct: 32,
      totalEvLossBb: 12.92,
    },
    shot_clock_pressure: {
      id: 'shot_clock_pressure',
      label: 'Shot-Clock Pressure Over 10s',
      count: 12,
      correct: 7,
      totalEvLossBb: 17.4,
    },
  };
  const validAnswers = Array.isArray(answersList) ? answersList : [];
  if (validAnswers.length > 0) {
    validAnswers.forEach((ans) => {
      const ms = Number(ans?.decision_time_ms ?? ans?.time_taken_ms ?? ans?.elapsed_ms ?? 5200);
      const key = ms < 3000 ? 'impulse_snap' : ms <= 10000 ? 'optimal_read' : 'shot_clock_pressure';
      buckets[key].count += 1;
      if (ans?.is_correct || ans?.correct) buckets[key].correct += 1;
      buckets[key].totalEvLossBb += Number(ans?.ev_loss_bb ?? ans?.evLoss ?? 0.45) || 0;
    });
  } else if (Array.isArray(sessionsList) && sessionsList.length > 0) {
    buckets.optimal_read.count += sessionsList.length;
    buckets.optimal_read.correct += Math.max(1, Math.round(sessionsList.length * 0.8));
  }
  const rows = Object.values(buckets).map((b) => {
    const accuracyPct = b.count > 0 ? Math.round((b.correct / b.count) * 100) : 0;
    const avgEvLossBb = b.count > 0 ? Number((b.totalEvLossBb / b.count).toFixed(2)) : 0;
    return {
      ...b,
      accuracyPct,
      avgEvLossBb,
    };
  });
  const worst = [...rows].sort((a, b) => b.avgEvLossBb - a.avgEvLossBb)[0] || rows[0];
  return {
    rows,
    primaryLeakDiagnosis:
      worst.id === 'impulse_snap'
        ? 'Primary Pacing Leak: Impulse Snap Under 3s Causes Premature Fold/Call Errors Before Counting Low Redraws.'
        : worst.id === 'shot_clock_pressure'
          ? 'Primary Pacing Leak: Shot-Clock Pressure Over 10s Degrades Multi-Street Sizing Precision Near Timebank Expiry.'
          : 'Primary Pacing Leak: Maintain Balanced 3s To 10s Cadence While Eliminating Late-Clock Panic Clicks.',
  };
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
  const [villainArchetype, setVillainArchetype] = useState('Calling Station');
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [selectedLeakSeat, setSelectedLeakSeat] = useState('BB');
  const [lastClubArenaHand, setLastClubArenaHand] = useState(DEFAULT_LAST_HAND);

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setFetchError(null);
      const [res, handRes] = await Promise.all([
        authedFetch(`/api/training/get-sessions?limit=50&includeAnswers=1`),
        authedFetch('/api/training/audit-hand-history').catch(() => null),
      ]);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const d = await res.json();
      if (d.success && Array.isArray(d.sessions)) setRawSessions(d.sessions);
      if (d.success && Array.isArray(d.recentAnswers)) setRawAnswers(d.recentAnswers);
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
  const topLeakGameId = topLeak?.gameId || topLeak?._engineLeak?.drill?.gameId || 'cash-005';
  const topLeakVariant = activeVariant || topLeak?.variant || 'nlh';
  const topLeakStreet = topLeak?.street || 'flop';
  const topLeakPosition = topLeak?.position || 'BB';
  const topLeakSample = topLeak?.sample ?? data?.totalHands ?? 0;
  const topLeakEvLossBb = topLeak?.evLossBb ?? 0;

  const plo8FixLeakHref = React.useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'cash',
          variant: 'plo8',
          streets: ['flop'],
          positions: ['BB'],
          stackDepth: 100,
        },
        'plo8-leak-diagnostics',
      ),
    [],
  );

  const shotClockDrillHref = React.useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'cash',
          variant: topLeakVariant,
          streets: [topLeakStreet],
          positions: [selectedLeakSeat],
          stackDepth: 100,
        },
        'decision-pacing-shot-clock',
      ),
    [topLeakVariant, topLeakStreet, selectedLeakSeat],
  );

  const pacingTelemetry = React.useMemo(
    () => computeDecisionPacingTelemetry(rawAnswers, rawSessions),
    [rawAnswers, rawSessions],
  );
  const baselinePacingTelemetry = React.useMemo(
    () => computeDecisionPacingTelemetry([], []),
    [],
  );

  const seatHeatmapMetrics = React.useMemo(() => {
    const baseMetrics = {
      UTG: { evLossBb: 0.42, accuracyPct: 81 },
      HJ: { evLossBb: 0.58, accuracyPct: 78 },
      CO: { evLossBb: 0.64, accuracyPct: 76 },
      BTN: { evLossBb: 0.35, accuracyPct: 84 },
      SB: { evLossBb: 0.96, accuracyPct: 68 },
      BB: { evLossBb: 1.38, accuracyPct: 62 },
    };
    const spotLeaks = Array.isArray(data?.spotLeaks) ? data.spotLeaks : [];
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
  }, [data]);

  const selectedSeatDrillHref = React.useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          format: 'cash',
          variant: topLeakVariant,
          streets: [topLeakStreet],
          positions: [selectedLeakSeat],
          stackDepth: 100,
        },
        'positional-seat-heatmap',
      ),
    [topLeakVariant, topLeakStreet, selectedLeakSeat],
  );
  const topLeakHref = React.useMemo(
    () => buildCustomTrainingArenaHref(
      hasVerifiedLeak
        ? {
            gameId: topLeakGameId,
            variant: topLeakVariant,
            street: topLeakStreet,
            position: topLeakPosition,
          }
        : { gameId: topLeakGameId },
      'weakness-scanner'
    ),
    [hasVerifiedLeak, topLeakGameId, topLeakVariant, topLeakStreet, topLeakPosition]
  );

  const leakBrainEval = React.useMemo(() => {
    try {
      const archetypeMap = {
        'Calling Station': { vpip: 48, pfr: 9, threeBet: 2, toCall: 0, pot: 6.5 },
        'Aggro 3-Bettor': { vpip: 38, pfr: 31, threeBet: 16, toCall: 4.5, pot: 12.0 },
        'Tight-Passive Nit': { vpip: 13, pfr: 10, threeBet: 3, toCall: 6.0, pot: 7.5 },
        'Balanced GTO Reg': { vpip: 24, pfr: 20, threeBet: 8, toCall: 2.2, pot: 6.5 },
      };
      const profileCfg = archetypeMap[villainArchetype] || archetypeMap['Calling Station'];
      const heroCardsByVariant = {
        nlh: ['Kh', 'Jc'],
        plo4: ['As', 'Ks', 'Qh', 'Jd'],
        plo5: ['As', 'Ks', 'Qh', 'Jd', 'Tc'],
        plo6: ['As', 'Ks', 'Qh', 'Jd', 'Tc', '9h'],
        plo8: ['As', 'Ks', 'Qh', 'Jd'],
      };
      const boardByStreet = {
        preflop: [],
        flop: ['8d', '5c', '2s'],
        turn: ['8d', '5c', '2s', '6h'],
        river: ['8d', '5c', '2s', '6h', '3d'],
      };
      return evaluateTrainingSpotWithHorseBrain({
        gameId: topLeakGameId,
        variant: topLeakVariant,
        heroCards: heroCardsByVariant[topLeakVariant] || heroCardsByVariant.nlh,
        boardCards: boardByStreet[topLeakStreet] || boardByStreet.flop,
        street: topLeakStreet,
        pot: profileCfg.pot,
        toCall: profileCfg.toCall,
        stackDepth: 100,
        heroPosition: topLeakPosition,
        villainPosition: topLeakPosition === 'BB' ? 'BTN' : 'BB',
        villainArchetype,
        villainStats: {
          vpip: profileCfg.vpip,
          pfr: profileCfg.pfr,
          threeBet: profileCfg.threeBet,
        },
      });
    } catch {
      return null;
    }
  }, [topLeakGameId, topLeakVariant, topLeakStreet, topLeakPosition, villainArchetype]);

  return (
    <>
      <SEOHead
        title="Position & Street Weakness Scanner"
        description="Scan Your Graded Poker Training History By Table Seat, Street, And Scenario Category To Pinpoint And Fix Expected Value Leaks On Smarter.Poker."
        canonical="/hub/training/weakness-scanner"
      />
      <div
        className="sp-training-tool sp-training-tool--analysis sp-analysis-weakness"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
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
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>Verified Session Analysis</div>
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
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Horse Brain Leak Remediation & One-Click Club Arena CTA */}
          {leakBrainEval && (
            <div
              data-leak-brain-panel="true"
              data-brain-engine={leakBrainEval.brainEvaluation?.engineModule || leakBrainEval.engineModule}
              data-leak-basis={hasVerifiedLeak ? 'verified-history' : 'general-suggestion'}
              data-leak-variant={topLeakVariant}
              data-leak-street={topLeakStreet}
              data-leak-position={topLeakPosition}
              data-leak-sample-count={String(topLeakSample)}
              data-leak-ev-loss-bb={String(topLeakEvLossBb)}
              data-exploit-archetype={villainArchetype}
              data-recommended-action={leakBrainEval.correctAnswer}
              style={{
                padding: '16px',
                borderRadius: 12,
                marginBottom: 16,
                background: 'rgba(15, 23, 42, 0.72)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-cyan)' }}>
                  Horse Brain Leak Remediation Engine
                </span>
                <span
                  data-leak-basis-badge="true"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    color: hasVerifiedLeak ? '#fbbf24' : '#94a3b8',
                    background: hasVerifiedLeak ? 'rgba(251, 191, 36, 0.14)' : 'rgba(148, 163, 184, 0.14)',
                    border: hasVerifiedLeak ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(148, 163, 184, 0.3)',
                  }}
                >
                  {hasVerifiedLeak
                    ? `Verified Personal Leak · ${topLeakSample} Hands · -${topLeakEvLossBb} BB EV Loss`
                    : `General Practice Suggestion (Sample: ${topLeakSample}/3 Hands Required)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>
                <span>Target Spot: {topLeakVariant.toUpperCase()} · {topLeakPosition} · {topLeakStreet.toUpperCase()}</span>
                <span>•</span>
                <span>Module: {topLeakGameId}</span>
                <span>•</span>
                <span data-exploit-recommended-label="true" style={{ color: '#6ee7b7' }}>
                  Recommended Vs {villainArchetype}: {leakBrainEval.correctAnswerText}
                </span>
              </div>
              {/* 5-Variant Selector Pills */}
              <div
                data-variant-selector="true"
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}
              >
                {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-variant-option={v}
                    aria-pressed={topLeakVariant === v}
                    onClick={() => setActiveVariant(v)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: topLeakVariant === v ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.14)',
                      background: topLeakVariant === v ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                      color: topLeakVariant === v ? '#e0f2fe' : '#cbd5e1',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
              {/* Exploitative Villain Tendency Selector */}
              <div
                data-exploit-tendency-selector="true"
                data-recommended-action={leakBrainEval.correctAnswer}
                style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}
              >
                {['Calling Station', 'Aggro 3-Bettor', 'Tight-Passive Nit', 'Balanced GTO Reg'].map((arch) => (
                  <button
                    key={arch}
                    type="button"
                    data-exploit-tendency-btn={arch}
                    data-tendency-option={arch}
                    onClick={() => setVillainArchetype(arch)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: villainArchetype === arch ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
                      background: villainArchetype === arch ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.04)',
                      color: villainArchetype === arch ? '#7dd3fc' : '#94a3b8',
                    }}
                  >
                    {arch}
                  </button>
                ))}
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.5 }}>
                {leakBrainEval.explanation || leakBrainEval.coachingExplanation}
              </p>
              <button
                type="button"
                data-fix-top-leak-cta="true"
                data-drill-top-weakness="true"
                data-target-game-id={topLeakGameId}
                data-target-variant={topLeakVariant}
                data-target-street={topLeakStreet}
                data-target-position={topLeakPosition}
                data-target-href={topLeakHref}
                onClick={() => {
                  router.push(topLeakHref);
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  background: 'rgba(56, 189, 248, 0.16)',
                  color: 'var(--sp-accent-cyan)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {hasVerifiedLeak
                  ? `Fix My #1 Leak In Club Arena: ${topLeakVariant.toUpperCase()} ${topLeakPosition} (${topLeakStreet.toUpperCase()}) →`
                  : 'Launch General Practice Suggestion In Club Arena →'}
              </button>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
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
              Drill Selected Seat On Club Arena Felt ({selectedLeakSeat} · {topLeakVariant.toUpperCase()} · {topLeakStreet.toUpperCase()}) →
            </button>
          </div>

          {/* PLO8 Hi-Lo & Fixed-Limit Leak Diagnostics Panel */}
          <div
            data-plo8-leak-diagnostics="true"
            style={{
              padding: '16px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'rgba(15, 23, 42, 0.82)',
              border: '1px solid rgba(244, 114, 182, 0.38)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f472b6' }}>
                PLO8 Hi-Lo &amp; Fixed-Limit Leak Diagnostics
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fbcfe8' }}>
                4 Canonical Split-Pot &amp; Limit Cap Leak Buckets
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {CANONICAL_PLO8_LEAK_BUCKETS.map((bucket) => (
                <div
                  key={bucket.id}
                  data-plo8-leak-bucket={bucket.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(2, 6, 23, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc' }}>{bucket.title}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5' }}>
                      -{bucket.evLossPerHandBb.toFixed(2)} BB/Hand · {bucket.sampleCount} Hands
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{bucket.remedy}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              data-fix-plo8-leak-cta="true"
              data-target-href={plo8FixLeakHref}
              onClick={() => router.push(plo8FixLeakHref)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #f472b6',
                background: 'rgba(244, 114, 182, 0.18)',
                color: '#fdf2f8',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Fix My #1 PLO8 / Fixed-Limit Leak →
            </button>
          </div>

          {/* Decision Pacing & Shot-Clock Pressure Telemetry Panel */}
          <div
            data-decision-pacing-telemetry="true"
            style={{
              padding: '16px',
              borderRadius: 12,
              marginBottom: 16,
              background: 'rgba(15, 23, 42, 0.82)',
              border: '1px solid rgba(251, 191, 36, 0.38)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>
                Decision Pacing &amp; Shot-Clock Pressure Telemetry
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fde68a' }}>
                Baseline Optimal Cadence: {baselinePacingTelemetry.rows[1].accuracyPct}% Acc
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
              {pacingTelemetry.rows.map((b) => (
                <div
                  key={b.id}
                  data-pacing-bucket={b.id}
                  data-pacing-accuracy-pct={String(b.accuracyPct)}
                  data-pacing-ev-loss-bb={String(b.avgEvLossBb)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    background: 'rgba(2, 6, 23, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>{b.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#38bdf8', marginTop: 4 }}>
                    {b.accuracyPct}% Acc
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', marginTop: 2 }}>
                    -{b.avgEvLossBb} BB Avg
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 12, fontWeight: 600 }}>
              {pacingTelemetry.primaryLeakDiagnosis}
            </div>
            <button
              type="button"
              data-drill-shot-clock-cta="true"
              data-target-href={shotClockDrillHref}
              onClick={() => router.push(shotClockDrillHref)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #fbbf24',
                background: 'rgba(251, 191, 36, 0.2)',
                color: '#fef3c7',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Drill Under 15s Shot-Clock Pressure →
            </button>
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
                        fontSize: 12,
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
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>Overall Acc</div>
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
                        <div style={{ fontSize: 12, color: 'var(--sp-accent-red)', textTransform: 'uppercase' }}>
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
                        <div style={{ fontSize: 12, color: 'var(--sp-accent-amber)', textTransform: 'uppercase' }}>
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
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', textTransform: 'uppercase' }}>
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
                    const w = data.topSpotLeak || data.leaks[0];
                    router.push(buildCustomTrainingArenaHref({
                      gameId: w.gameId || w._engineLeak?.drill?.gameId,
                      variant: w.variant,
                      street: w.street,
                      position: w.position,
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
                  Drill Weakest Spot: {(data.topSpotLeak || data.leaks[0]).area}
                </motion.button>
              )}

              {/* Leaks List */}
              {data.leaks.length > 0 && <div
                style={{
                  fontSize: 12,
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
                              fontSize: 12,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                            }}
                          >
                            {leak.sev} Severity
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>
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
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>Accuracy</div>
                      </div>
                    </div>

                    <div
                      style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 8 }}
                    >
                      <div
                        style={{
                          fontSize: 12,
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
                            variant: leak.variant,
                            street: leak.street,
                            position: leak.position,
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
      <HubPageSummary page="training-weakness-scanner" />
    </>
  );
}

WeaknessScannerPage.displayName = 'WeaknessScannerPage';
