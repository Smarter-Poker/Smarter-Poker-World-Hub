/**
 * TILT GUARD — Emotional Intelligence Coach
 * ═══════════════════════════════════════════════════════════════════════════
 * Monitors training accuracy trends for tilt signals. Detects rapid
 * accuracy drops and provides guided interventions.
 *
 * Route: /hub/training/tilt-guard
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-17 — hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// ═══════════════════════════════════════════════════════════════════════════
// TILT DETECTION
// ═══════════════════════════════════════════════════════════════════════════


// BUG FIX (TRAIN-TILTGUARD-A11Y-1): SVG icons replacing the tilt-guard
// emoji set. MENTAL_TIPS + WARMUP_GAMES gain iconKind discriminator;
// TipIcon/WarmupIcon switch by kind. Standalone CheckSquareIcon for the
// ✅ "exercise complete" indicator, MeditateIcon for the 🧘 breathing
// CTA. Same surface-specific a11y pattern as PR #320/#322/#324/#327-#341.
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
function MeditateIcon({ size=20 })    { return <_Svg size={size}><circle cx="12" cy="6" r="3"/><path d="M9 11l-4 5 4 4 3-4 3 4 4-4-4-5"/></_Svg>; }
function TargetIcon({ size=20 })      { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function WalkIcon({ size=20 })        { return <_Svg size={size}><circle cx="13" cy="4" r="2"/><path d="M4 22l4-9 4 3 3-4 3 5"/></_Svg>; }
function LightbulbIcon({ size=20 })   { return <_Svg size={size}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z"/></_Svg>; }
function WaterIcon({ size=20 })       { return <_Svg size={size}><path d="M12 2c4 4 7 8 7 13a7 7 0 0 1-14 0c0-5 3-9 7-13z"/></_Svg>; }
function StopIcon({ size=20 })        { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><line x1="6" y1="6" x2="18" y2="18"/></_Svg>; }
function CardsIcon({ size=20 })       { return <_Svg size={size}><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M8 5V3a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14"/></_Svg>; }
function AbacusIcon({ size=20 })      { return <_Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="7" cy="6" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="9" cy="18" r="1"/></_Svg>; }
function CompassIcon({ size=20 })     { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></_Svg>; }
function CheckSquareIcon({ size=40 }) { return <_Svg size={size}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></_Svg>; }
function BackArrowIcon({ size=18 })   { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function TipIcon({ kind, size=20 }) {
  switch (kind) {
    case 'meditate':  return <MeditateIcon size={size}/>;
    case 'target':    return <TargetIcon size={size}/>;
    case 'walk':      return <WalkIcon size={size}/>;
    case 'lightbulb': return <LightbulbIcon size={size}/>;
    case 'water':     return <WaterIcon size={size}/>;
    case 'stop':      return <StopIcon size={size}/>;
    default:          return <LightbulbIcon size={size}/>;
  }
}
function WarmupIcon({ kind, size=20 }) {
  switch (kind) {
    case 'cards':   return <CardsIcon size={size}/>;
    case 'abacus':  return <AbacusIcon size={size}/>;
    case 'compass': return <CompassIcon size={size}/>;
    default:        return null;
  }
}

const TILT_THRESHOLD = -15; // 15% accuracy drop triggers alert
const MENTAL_TIPS = [
  {
    title: 'Box Breathing',
    desc: 'Inhale 4s → Hold 4s → Exhale 4s → Hold 4s. Repeat 4 cycles.',
    iconKind: 'meditate',
    icon: '🧘',
    color: 'var(--sp-accent-blue)',
  },
  {
    title: 'Process Over Results',
    desc: 'Focus on making GTO-correct decisions, not outcomes. Variance is temporary.',
    iconKind: 'target',
    icon: '🎯',
    color: 'var(--sp-accent-green)',
  },
  {
    title: 'Take a Walk',
    desc: 'Physical movement resets your nervous system. Even 5 minutes helps.',
    iconKind: 'walk',
    icon: '🚶',
    color: 'var(--sp-accent-orange)',
  },
  {
    title: 'Reframe the Mistake',
    desc: 'Every mistake reveals a pattern to fix. More data = faster improvement.',
    iconKind: 'lightbulb',
    icon: '💡',
    color: 'var(--sp-accent-purple)',
  },
  {
    title: 'Drink Water',
    desc: 'Dehydration impairs decision-making by up to 12%. Stay hydrated.',
    iconKind: 'water',
    icon: '💧',
    color: 'var(--sp-accent-cyan)',
  },
  {
    title: 'Set a Stop-Loss',
    desc: 'Decide in advance: if accuracy drops below 60%, stop for 30 minutes.',
    iconKind: 'stop',
    icon: '🛑',
    color: 'var(--sp-accent-red)',
  },
];

const WARMUP_GAMES = [
  {
    id: 'easy-preflop',
    name: 'Easy Preflop Warmup',
    desc: 'Low-stress opening decisions',
    iconKind: 'cards',
    icon: '🃏',
  },
  {
    id: 'easy-math',
    name: 'Pot Odds Refresher',
    desc: 'Simple math to rebuild confidence',
    iconKind: 'abacus',
    icon: '🧮',
  },
  { id: 'easy-position', name: 'Position Review', desc: 'Fundamental seat awareness', iconKind: 'compass', icon: '🧭' },
];

function analyzeTiltRisk(sessions) {
  if (!sessions || sessions.length < 3) {
    return {
      risk: 'none',
      trend: [],
      message: 'Not enough data yet',
      recentAvg: null,
      previousAvg: null,
      delta: 0,
    };
  }

  // Calculate accuracy for recent sessions (last 3) vs previous 3
  const recent = sessions.slice(0, 3);
  const previous = sessions.slice(3, 6);

  const recentAvg = computeAvgAccuracy(recent);
  const previousAvg = previous.length > 0 ? computeAvgAccuracy(previous) : recentAvg;
  const delta = recentAvg - previousAvg;

  // Build trend data (last 10 sessions, reversed for chronological)
  const trend = sessions
    .slice(0, 10)
    .map((s) => {
      const hands = s.hands_played || s.total_questions || 1;
      const correct = s.correct_count || s.correct_answers || 0;
      return {
        accuracy: Math.round((correct / hands) * 100),
        timestamp: new Date(s.created_at).getTime(),
      };
    })
    .reverse();

  let risk = 'low';
  let message = "You're training at a consistent level.";

  if (delta <= TILT_THRESHOLD) {
    risk = 'high';
    message = `Your accuracy dropped ${Math.abs(Math.round(delta))}% in the last 3 sessions. Take a break or switch to easy drills.`;
  } else if (delta <= -10) {
    risk = 'medium';
    message = `Slight accuracy dip detected (${Math.round(delta)}%). Watch for tilt signs.`;
  } else if (recentAvg >= 80) {
    risk: 'none';
    message = "You're in the zone! Keep going.";
  }

  return { risk, trend, message, recentAvg, previousAvg, delta };
}

function computeAvgAccuracy(sessions) {
  let totalH = 0,
    totalC = 0;
  sessions.forEach((s) => {
    totalH += s.hands_played || s.total_questions || 0;
    totalC += s.correct_count || s.correct_answers || 0;
  });
  return totalH > 0 ? Math.round((totalC / totalH) * 100) : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// BREATHING EXERCISE
// ═══════════════════════════════════════════════════════════════════════════

function BreathingExercise({ onClose }) {
  const [phase, setPhase] = useState('inhale');
  const [cycle, setCycle] = useState(1);
  const [timer, setTimer] = useState(4);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setPhase((p) => {
            if (p === 'inhale') return 'hold1';
            if (p === 'hold1') return 'exhale';
            if (p === 'exhale') return 'hold2';
            setCycle((c) => c + 1);
            return 'inhale';
          });
          return 4;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const phaseLabel = { inhale: 'Breathe In', hold1: 'Hold', exhale: 'Breathe Out', hold2: 'Hold' };
  const phaseColor = { inhale: 'var(--sp-accent-blue)', hold1: 'var(--sp-accent-purple)', exhale: 'var(--sp-accent-green)', hold2: 'var(--sp-accent-orange)' };

  if (cycle > 4) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: '40px 20px',
          borderRadius: 16,
          textAlign: 'center',
          background: 'rgba(34,197,94,0.04)',
          border: '1px solid rgba(34,197,94,0.15)',
        }}
      >
        {/* TRAIN-TILTGUARD-A11Y-1: SVG check-square replaces ✅ */}
        <div style={{ display: 'inline-flex', marginBottom: 12, color: 'var(--sp-accent-green)' }} aria-hidden>
          <CheckSquareIcon size={40} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sp-accent-green)', marginBottom: 6 }}>
          Exercise Complete
        </div>
        <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', marginBottom: 16 }}>
          4 cycles done. Feeling calmer?
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(0,212,255,0.06)',
            color: 'var(--sp-accent-cyan)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Done
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      style={{
        padding: '40px 20px',
        borderRadius: 16,
        textAlign: 'center',
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${phaseColor[phase]}30`,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--sp-fg-faint)', marginBottom: 8 }}>Cycle {cycle} of 4</div>
      <motion.div
        animate={{
          scale: phase === 'inhale' ? [1, 1.3] : phase === 'exhale' ? [1.3, 1] : 1.3,
        }}
        transition={{ duration: 4, ease: 'easeInOut' }}
        style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          margin: '0 auto 16px',
          background: `radial-gradient(circle, ${phaseColor[phase]}20, transparent)`,
          border: `2px solid ${phaseColor[phase]}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 32, fontWeight: 900, color: phaseColor[phase] }}>{timer}</span>
      </motion.div>
      <div style={{ fontSize: 20, fontWeight: 800, color: phaseColor[phase] }}>
        {phaseLabel[phase]}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TiltGuardPage() {
  const router = useRouter();
  useTrainingBus('tilt-guard');
  const [loading, setLoading] = useState(true);
  const [tiltData, setTiltData] = useState(null);
  const [showBreathing, setShowBreathing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    const user = getAuthUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setFetchError(null);
      const res = await authedFetch(`/api/training/get-sessions?limit=20`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success && data.sessions) {
        setTiltData(analyzeTiltRisk(data.sessions));
      }
    } catch (e) {
      console.warn('[TiltGuard] Error:', e);
      setFetchError('Failed to load tilt data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchData());
    return unsub;
  }, [fetchData]);

  const riskColors = { high: 'var(--sp-accent-red)', medium: 'var(--sp-accent-amber)', low: 'var(--sp-accent-green)', none: 'var(--sp-fg-dim)' };
  const riskLabels = { high: 'HIGH TILT RISK', medium: 'MODERATE', low: 'STABLE', none: 'NEUTRAL' };

  return (
    <>
      <Head>
        <title>Tilt Guard | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
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
            {/* TRAIN-TILTGUARD-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Tilt Guard</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Emotional intelligence coach</div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Loading */}
          {loading && (
            <div style={{ padding: '20px 0' }}>
              <SkeletonLoader variant="card" count={2} />
            </div>
          )}

          {tiltData && !showBreathing && (
            <>
              {/* Risk Status */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '24px 20px',
                  borderRadius: 16,
                  marginBottom: 20,
                  background: `linear-gradient(135deg, ${riskColors[tiltData.risk]}08, ${riskColors[tiltData.risk]}02)`,
                  border: `1px solid ${riskColors[tiltData.risk]}20`,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: `${riskColors[tiltData.risk]}15`,
                    border: `1px solid ${riskColors[tiltData.risk]}30`,
                    fontSize: 10,
                    fontWeight: 800,
                    color: riskColors[tiltData.risk],
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}
                >
                  {riskLabels[tiltData.risk]}
                </div>
                <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', lineHeight: 1.6 }}>
                  {tiltData.message}
                </div>
                {tiltData.recentAvg !== null && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 20,
                      marginTop: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sp-fg)' }}>
                        {tiltData.recentAvg}%
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>RECENT (3)</div>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sp-fg-muted)' }}>
                        {tiltData.previousAvg}%
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>PREVIOUS (3)</div>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: tiltData.delta >= 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                        }}
                      >
                        {tiltData.delta >= 0 ? '+' : ''}
                        {Math.round(tiltData.delta)}%
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>DELTA</div>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Trend Chart (simple bar chart) */}
              {tiltData.trend.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    ACCURACY TREND (Last {tiltData.trend.length} Sessions)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                    {tiltData.trend.map((t, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${t.accuracy}%` }}
                        transition={{ delay: i * 0.05, duration: 0.4 }}
                        style={{
                          flex: 1,
                          borderRadius: 3,
                          background:
                            t.accuracy >= 75 ? 'var(--sp-accent-green)' : t.accuracy >= 60 ? 'var(--sp-accent-amber)' : 'var(--sp-accent-red)',
                          opacity: 0.7,
                          minHeight: 4,
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: -14,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: 8,
                            color: 'var(--sp-fg-faint)',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.accuracy}%
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breathing Exercise CTA */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowBreathing(true)}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  marginBottom: 20,
                  border: '1px solid rgba(59,130,246,0.2)',
                  background:
                    'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))',
                  color: 'var(--sp-accent-blue)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {/* TRAIN-TILTGUARD-A11Y-1: SVG meditate replaces 🧘 */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <MeditateIcon size={18} />
                  Start Breathing Exercise
                </span>
              </motion.button>

              {/* Mental Tips */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  MENTAL GAME TIPS
                </div>
                {MENTAL_TIPS.map((tip, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      marginBottom: 6,
                      background: 'rgba(0,0,0,0.2)',
                      border: `1px solid ${tip.color}12`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {/* TRAIN-TILTGUARD-A11Y-1: SVG TipIcon */}
                    <span style={{ fontSize: 18, flexShrink: 0, color: tip.color, display: 'inline-flex' }} aria-hidden>
                      <TipIcon kind={tip.iconKind} size={18} />
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: tip.color }}>
                        {tip.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginTop: 1 }}>{tip.desc}</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Cool Down Drills */}
              {tiltData.risk === 'high' && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-fg-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    COOL DOWN DRILLS
                  </div>
                  {WARMUP_GAMES.map((game) => (
                    <motion.button
                      key={game.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        router.push(`/hub/training/arena/spot-trainer?gameId=${game.id}`)
                      }
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        marginBottom: 6,
                        background: 'rgba(34,197,94,0.04)',
                        border: '1px solid rgba(34,197,94,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {/* TRAIN-TILTGUARD-A11Y-1: SVG WarmupIcon */}
                      <span style={{ fontSize: 18, display: 'inline-flex', color: 'var(--sp-fg-muted)' }} aria-hidden>
                        <WarmupIcon kind={game.iconKind} size={18} />
                      </span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-green)' }}>
                          {game.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>{game.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Breathing Exercise Overlay */}
          {showBreathing && <BreathingExercise onClose={() => setShowBreathing(false)} />}
        </div>
      </div>
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}
      <ConnectionToast />
    </>
  );
}