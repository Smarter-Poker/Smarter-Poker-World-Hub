/**
 * WEAK SPOT AUTOPILOT — Zero-Decision Training Mode
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * One-click "train my weakest spots" — automatically queues drills
 * targeting your worst performance areas. Zero setup required.
 *
 * Route: /hub/training/autopilot
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-3 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-3 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { normalizeTrainingSessionConfig } from '../../../src/lib/training/sessionConfigContract.mjs';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
// TRAIN-WIRE-EMPTY-2a — adoption: shared empty-state primitive

const GodModeArena = dynamic(() => import('../../../src/components/training/GodModeArena'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
        background: '#040d18',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#bdd0e2',
      }}
    >
      Loading Arena...
    </div>
  ),
});

// Autopilot remains an embedded Arena so it can advance through its queue
// without a route transition. Give every mount one fixed, supported session
// contract; GodModeArena then obtains and grades only server-signed questions.
const AUTOPILOT_ARENA_CONFIG = Object.freeze(normalizeTrainingSessionConfig({
  difficulty: 'standard',
  timer: 'standard',
  mode: 'standard',
  gameMode: 'full',
  tables: '1',
  handSelection: 'all',
}));

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// WEAK SPOT DETECTION ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●


// BUG FIX (TRAIN-AUTOPILOT-A11Y-1): SVG icon components replacing the
// autopilot surface emoji set across SPOT_DEFINITIONS (■ ◆ ▲ ↻ ★
// ♠ ★), ◇ detection banner, ★ completion celebration, ■ empty state.
// Same surface-specific a11y pattern as PR #320/#322/#324/#327-#345.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=20, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function ShieldIcon({ size=20 })   { return <_Svg size={size}><path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z"/></_Svg>; }
function TargetIcon({ size=20 })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function ExplosionIcon({ size=20 }){ return <_Svg size={size}><polygon points="12 2 14 8 20 5 16 11 22 12 16 13 20 19 14 16 12 22 10 16 4 19 8 13 2 12 8 11 4 5 10 8 12 2"/></_Svg>; }
function RotateIcon({ size=20 })   { return <_Svg size={size}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></_Svg>; }
function FlagIcon({ size=20 })     { return <_Svg size={size}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></_Svg>; }
function BoltIcon({ size=20 })     { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function SpadeIcon({ size=20 })    { return <_Svg size={size}><path d="M12 2c-2 3-7 7-7 11 0 3 2 5 5 5 1 0 2-1 2-2v-2"/><path d="M12 2c2 3 7 7 7 11 0 3-2 5-5 5-1 0-2-1-2-2v-2"/><line x1="9" y1="22" x2="15" y2="22"/></_Svg>; }
function TrophyIcon({ size=20 })   { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function BrainIcon({ size=40 })    { return <_Svg size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_Svg>; }
function CelebrateIcon({ size=32 }){ return <_Svg size={size}><polyline points="3 21 5 13 16 2 22 8 11 19 3 21"/><line x1="7" y1="17" x2="15" y2="9"/></_Svg>; }
function SpotIcon({ kind, size=20 }) {
  switch (kind) {
    case 'shield':    return <ShieldIcon size={size}/>;
    case 'target':    return <TargetIcon size={size}/>;
    case 'explosion': return <ExplosionIcon size={size}/>;
    case 'rotate':    return <RotateIcon size={size}/>;
    case 'flag':      return <FlagIcon size={size}/>;
    case 'bolt':      return <BoltIcon size={size}/>;
    case 'spade':     return <SpadeIcon size={size}/>;
    case 'trophy':    return <TrophyIcon size={size}/>;
    default:          return <TargetIcon size={size}/>;
  }
}

const SPOT_DEFINITIONS = [
  {
    id: 'bb-preflop',
    name: 'BB Defense (Preflop)',
    position: 'BB',
    street: 'preflop',
    color: 'var(--sp-accent-blue)',
    iconKind: 'shield',
    icon: '■',
    gameId: 'cash-003',
  },
  {
    id: 'btn-preflop',
    name: 'BTN Opens',
    position: 'BTN',
    street: 'preflop',
    color: 'var(--sp-accent-green)',
    iconKind: 'target',
    icon: '◆',
    gameId: 'cash-001',
  },
  {
    id: 'cbet-flop',
    name: 'C-Betting (Flop)',
    position: 'any',
    street: 'flop',
    color: '#86daff',
    iconKind: 'explosion',
    icon: '▲',
    gameId: 'cash-002',
  },
  {
    id: 'turn-barrels',
    name: 'Turn Pot Control',
    position: 'any',
    street: 'turn',
    color: '#86daff',
    iconKind: 'rotate',
    icon: '↻',
    gameId: 'cash-024',
  },
  {
    id: 'river-bluffs',
    name: 'River Decisions',
    position: 'any',
    street: 'river',
    color: 'var(--sp-accent-red)',
    iconKind: 'flag',
    icon: '★',
    gameId: 'cash-012',
  },
  {
    id: '3bet-pots',
    name: '3-Bet Pots',
    position: 'any',
    street: 'any',
    color: '#86daff',
    iconKind: 'bolt',
    icon: '⌁',
    gameId: 'cash-007',
  },
  {
    id: 'sb-play',
    name: 'SB Strategy',
    position: 'SB',
    street: 'preflop',
    color: '#86daff',
    iconKind: 'spade',
    icon: '♠',
    gameId: 'cash-018',
  },
  {
    id: 'mtt-push',
    name: 'MTT Push/Fold',
    position: 'any',
    street: 'preflop',
    color: '#86daff',
    iconKind: 'trophy',
    icon: '★',
    gameId: 'mtt-001',
  },
];

function analyzeWeakSpots(sessions) {
  if (!sessions || sessions.length < 3) {
    // Not enough data — return random rotation
    return SPOT_DEFINITIONS.slice(0, 3).map((s) => ({
      ...s,
      accuracy: null,
      evLoss: null,
      reason: 'Build your training history',
    }));
  }

  // Group by game pattern
  const spotStats = {};
  sessions.forEach((s) => {
    const gameId = (s.game_id || '').toLowerCase();
    SPOT_DEFINITIONS.forEach((spot) => {
      if (gameId === spot.gameId) {
        if (!spotStats[spot.id]) {
          spotStats[spot.id] = { hands: 0, correct: 0, evLoss: 0, measuredEvDecisions: 0 };
        }
        spotStats[spot.id].hands += s.hands_played || s.total_questions || 0;
        spotStats[spot.id].correct += s.correct_count || s.correct_answers || 0;
        const measuredDecisions = Number(s.measured_ev_decisions) || 0;
        const measuredLoss = s.total_ev_loss === null || s.total_ev_loss === undefined
          ? null
          : Number(s.total_ev_loss);
        if (measuredDecisions > 0 && Number.isFinite(measuredLoss)) {
          spotStats[spot.id].evLoss += measuredLoss;
          spotStats[spot.id].measuredEvDecisions += measuredDecisions;
        }
      }
    });
  });

  // Rank by weakness (low accuracy + high EV loss)
  const ranked = SPOT_DEFINITIONS.map((spot) => {
    const stats = spotStats[spot.id];
    if (!stats || stats.hands === 0) {
      return {
        ...spot,
        accuracy: null,
        evLoss: null,
        score: 50,
        reason: 'Not enough data - needs practice',
      };
    }
    const accuracy = Math.round((stats.correct / stats.hands) * 100);
    const avgMeasuredEvLoss = stats.measuredEvDecisions > 0
      ? stats.evLoss / stats.measuredEvDecisions
      : null;
    // Accuracy is always available for a sealed completed session. Measured
    // solver EV may refine priority, but an unavailable EV cannot become zero.
    const score = 100 - accuracy + (avgMeasuredEvLoss === null ? 0 : avgMeasuredEvLoss * 10);
    return {
      ...spot,
      accuracy,
      evLoss: stats.measuredEvDecisions > 0 ? stats.evLoss : null,
      measuredEvDecisions: stats.measuredEvDecisions,
      hands: stats.hands,
      score,
      reason:
        accuracy < 60
          ? `Only ${accuracy}% - significant leak`
          : accuracy < 75
            ? `${accuracy}% - room for improvement`
            : `${accuracy}% - maintain consistency`,
    };
  }).sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3);
}

function createAutopilotRunId() {
  const randomUUID = globalThis?.crypto?.randomUUID;
  const suffix = typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  return `autopilot-${suffix}`;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN PAGE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function AutopilotPage() {
  const router = useRouter();
  useTrainingBus('autopilot');
  const { guardAction, UpgradePopup } = useFeatureGate('gto_training');
  const [loading, setLoading] = useState(true);
  const [weakSpots, setWeakSpots] = useState([]);
  const [activeSpot, setActiveSpot] = useState(null);
  const [currentSpotIdx, setCurrentSpotIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [results, setResults] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [autopilotRunId, setAutopilotRunId] = useState(null);
  const [arenaUserId, setArenaUserId] = useState(null);

  const fetchAndAnalyze = useCallback(async () => {
    setFetchError(null);
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await authedFetch(`/api/training/get-sessions?limit=200`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        const spots = analyzeWeakSpots(data.sessions);
        setWeakSpots(spots);
      }
    } catch (e) {
      console.warn('[Autopilot] Fetch error:', e);
      setFetchError('Unable to load autopilot data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  // Bus listener — refresh weak spot analysis when a session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchAndAnalyze());
    return unsub;
  }, [fetchAndAnalyze]);

  const startAutopilot = () => {
    if (!guardAction()) return;
    if (weakSpots.length === 0) return;
    const user = getAuthUser();
    if (!user?.id) {
      router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath || '/hub/training/autopilot')}`);
      return;
    }
    setCurrentSpotIdx(0);
    setActiveSpot(weakSpots[0]);
    setAutopilotRunId(createAutopilotRunId());
    setArenaUserId(user.id);
    setIsPlaying(true);
    setResults([]);
  };

  const handleArenaComplete = (arenaResults) => {
    const newResults = [
      ...results,
      {
        spot: activeSpot,
        accuracy: arenaResults?.accuracy || 0,
        questionsAnswered: arenaResults?.questionsAnswered || 0,
      },
    ];
    setResults(newResults);

    // Move to next spot or finish
    const nextIdx = currentSpotIdx + 1;
    if (nextIdx < weakSpots.length) {
      setCurrentSpotIdx(nextIdx);
      setActiveSpot(weakSpots[nextIdx]);
    } else {
      setIsPlaying(false);
      setActiveSpot(null);
    }
  };

  // Active arena
  if (isPlaying && activeSpot && arenaUserId && autopilotRunId) {
    return (
      <>
        <SEOHead
          title="Weak Spot Autopilot GTO Trainer"
          description="Stream Continuous GTO Poker Drills Automatically Targeted At Your Lowest-Accuracy Table Positions, Streets, And Scenario Categories On Smarter.Poker."
          canonical="/hub/training/autopilot"
        />
        <GodModeArena
          key={`${autopilotRunId}:${currentSpotIdx}:${activeSpot.gameId}`}
          userId={arenaUserId}
          gameId={activeSpot.gameId}
          gameName={`Autopilot: ${activeSpot.name}`}
          level={1}
          sessionId={`${autopilotRunId}-${currentSpotIdx}`}
          initialConfig={AUTOPILOT_ARENA_CONFIG}
          onComplete={handleArenaComplete}
        />
        <HubPageSummary page="training-autopilot" />
      </>
    );
  }

  return (
    <>
      <SEOHead
        title="Weak Spot Autopilot GTO Trainer"
        description="Stream Continuous GTO Poker Drills Automatically Targeted At Your Lowest-Accuracy Table Positions, Streets, And Scenario Categories On Smarter.Poker."
        canonical="/hub/training/autopilot"
      />
      <div style={{ minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', background: '#040d18', color: '#f2f7ff' }}>
        <TrainingPageHead slug="training-autopilot" note="Zero-Decision Training Mode" />

        <div className={s.page}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); setLoading(true); fetchAndAnalyze(); }} />
          {/* Loading */}
          {loading && (
            <section className={`sd-panel ${s.panel} ${s.state}`} role="status" aria-live="polite">
              <p className={s.copy}>Analyzing Your Training History...</p>
            </section>
          )}

          {/* Results Summary (after completing autopilot) */}
          {!loading && !isPlaying && results.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`sd-panel ${s.panel}`}
              aria-labelledby="autopilot-complete-title"
            >
              <h2 id="autopilot-complete-title" className={s.sectionTitle}>
                <CelebrateIcon size={20} />
                Autopilot Complete
              </h2>

              {/* Coaching Grade Badge */}
              {(() => {
                const totalQ = results.reduce((sum, r) => sum + (r.questionsAnswered || 0), 0);
                const totalCorrect = results.reduce((sum, r) => sum + Math.round(((r.accuracy || 0) / 100) * (r.questionsAnswered || 0)), 0);
                const avgAccuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
                const grade = avgAccuracy >= 90 ? 'A' : avgAccuracy >= 80 ? 'B' : avgAccuracy >= 70 ? 'C' : 'D';
                const gradeTone = avgAccuracy >= 80 ? 'up' : avgAccuracy >= 70 ? 'ice' : 'down';
                return (
                  <div className={s.metrics3}>
                    <div className={`sd-metric ${s.metric}`}>
                      <strong className={s.metricValue} data-tone={gradeTone}>{grade}</strong>
                      <span className={s.metricLabel}>Grade</span>
                    </div>
                    <div className={`sd-metric ${s.metric}`}>
                      <strong className={s.metricValue} data-tone="ice">{avgAccuracy}%</strong>
                      <span className={s.metricLabel}>Overall</span>
                    </div>
                    <div className={`sd-metric ${s.metric}`}>
                      <strong className={s.metricValue}>{totalCorrect}/{totalQ}</strong>
                      <span className={s.metricLabel}>Correct</span>
                    </div>
                  </div>
                );
              })()}

              {/* Per-Spot Breakdown */}
              <ul className={s.list} aria-label="Per-Spot Breakdown">
                {results.map((r, i) => (
                  <li key={i} className={s.row}>
                    <span className={s.rowLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className={s.ice} aria-hidden style={{ display: 'inline-flex' }}><SpotIcon kind={r.spot.iconKind} size={16} /></span>
                      {r.spot.name}
                    </span>
                    <strong className={r.accuracy >= 75 ? s.up : s.ice}>{r.accuracy}%</strong>
                  </li>
                ))}
              </ul>

              {/* Coaching Recommendation */}
              {(() => {
                const weakest = [...results].sort((a, b) => a.accuracy - b.accuracy)[0];
                if (!weakest) return null;
                return (
                  <p className={s.note}>
                    <strong className={s.ice}>Coach Recommendation:</strong>{' '}
                    Focus Your Next Session On <strong className={s.white}>{weakest.spot.name}</strong> - It Was Your Weakest Area At {weakest.accuracy}%.
                  </p>
                );
              })()}

              {/* Action Buttons */}
              <div className={s.actions}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={startAutopilot}
                  className={`sd-button sd-primary ${s.button}`}
                >
                  Run Again
                </motion.button>
                <motion.button
                  type="button"
                  disabled
                  title="Feed Sharing Reopens After Verified Autopilot Settlement Is Certified"
                  aria-label="Autopilot feed sharing is unavailable"
                  className={`sd-button ${s.button}`}
                >
                  Feed Sharing Unavailable
                </motion.button>
              </div>
            </motion.section>
          )}

          {/* Weak Spots Detected */}
          {!loading && weakSpots.length > 0 && results.length === 0 && (
            <>
              {/* Hero CTA */}
              <motion.section
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`sd-panel ${s.panel}`}
                aria-labelledby="autopilot-detected-title"
              >
                <h2 id="autopilot-detected-title" className={s.sectionTitle}>
                  <BrainIcon size={22} />
                  {weakSpots.length} Weak Spots Detected
                </h2>
                <p className={s.copy}>
                  We Analyzed Your Training History And Found The Areas That Need The Most Attention. One Click To Start.
                </p>
                <p data-autopilot-preset-summary="true" className={s.note}>
                  <strong className={s.ice}>Preset Queue:</strong> {weakSpots.map((spot) => spot.name).join(' → ')} · Standard Timer · 100 BB
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={startAutopilot}
                  className={`sd-button sd-primary ${s.button} ${s.primary} ${s.full}`}
                >
                  Start Autopilot
                </motion.button>
              </motion.section>

              {/* Spot Breakdown */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="autopilot-spots-title">
                <h2 id="autopilot-spots-title" className={s.sectionTitle}>Your Weak Spots</h2>
                <ol className={s.list}>
                  {weakSpots.map((spot, i) => (
                    <motion.li
                      key={spot.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={s.row}
                      style={{ flexWrap: 'nowrap' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span className={`sd-metric ${s.ice}`} aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 40, height: 40, padding: 0, flex: 'none' }}>
                          <SpotIcon kind={spot.iconKind} size={18} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span className={s.rowLabel} style={{ display: 'block', fontWeight: 700 }}>
                            {i + 1}. {spot.name}
                          </span>
                          <span className={s.metricLabel} style={{ display: 'block', marginTop: 2, textTransform: 'capitalize' }}>
                            {spot.reason}
                          </span>
                        </span>
                      </span>
                      {spot.accuracy !== null && (
                        <strong className={spot.accuracy < 60 ? s.down : spot.accuracy < 75 ? s.ice : s.up} style={{ fontSize: '1.2rem' }}>
                          {spot.accuracy}%
                        </strong>
                      )}
                    </motion.li>
                  ))}
                </ol>
              </section>
            </>
          )}

          {/* No data state */}
          {!loading && weakSpots.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="Need More Data"
              message="Complete A Few Training Sessions First So We Can Identify Your Weak Spots."
              cta={{ label: 'Start Training', onClick: () => router.push('/hub/training') }}
            />
          )}

        </div>
      </div>
      <HubPageSummary page="training-autopilot" />
      {UpgradePopup}
      <ConnectionToast />
    </>
  );
}
