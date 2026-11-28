/**
 * TILT GUARD - Emotional Intelligence Coach
 * ═══════════════════════════════════════════════════════════════════════════
 * Monitors training accuracy trends for tilt signals. Detects rapid
 * accuracy drops and provides guided interventions.
 *
 * Route: /hub/training/tilt-guard
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-17 - hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
// TRAIN-CSS-MOTION-ADOPT-28 - durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// TILT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

// BUG FIX (TRAIN-TILTGUARD-A11Y-1): SVG icons replacing the tilt-guard
// emoji set. MENTAL_TIPS + WARMUP_GAMES gain iconKind discriminator;
// TipIcon/WarmupIcon switch by kind. Standalone CheckSquareIcon for the
// ✓ "exercise complete"indicator, MeditateIcon for the breathing
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
    icon: '',
    color: 'var(--sp-accent-blue)',
  },
  {
    title: 'Process Over Results',
    desc: 'Focus on making GTO-correct decisions, not outcomes. Variance is temporary.',
    iconKind: 'target',
    icon: '',
    color: 'var(--sp-accent-green)',
  },
  {
    title: 'Take a Walk',
    desc: 'Physical movement resets your nervous system. Even 5 minutes helps.',
    iconKind: 'walk',
    icon: '',
    color: '#86daff',
  },
  {
    title: 'Reframe the Mistake',
    desc: 'Every mistake reveals a pattern to fix. More data = faster improvement.',
    iconKind: 'lightbulb',
    icon: '',
    color: '#86daff',
  },
  {
    title: 'Drink Water',
    desc: 'Dehydration impairs decision-making by up to 12%. Stay hydrated.',
    iconKind: 'water',
    icon: '',
    color: 'var(--sp-accent-cyan)',
  },
  {
    title: 'Set a Stop-Loss',
    desc: 'Decide in advance: if accuracy drops below 60%, stop for 30 minutes.',
    iconKind: 'stop',
    icon: '',
    color: 'var(--sp-accent-red)',
  },
];

const WARMUP_GAMES = [
  {
    id: 'cash-001',
    name: 'Easy Preflop Warmup',
    desc: 'Low-stress opening decisions',
    iconKind: 'cards',
    icon: '',
  },
  {
    id: 'adv-006',
    name: 'Pot Odds Refresher',
    desc: 'Simple math to rebuild confidence',
    iconKind: 'abacus',
    icon: '',
  },
  { id: 'cash-006', name: 'Position Review', desc: 'Fundamental seat awareness', iconKind: 'compass', icon: ''},
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
    risk = 'none';
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

  if (cycle > 4) {
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`sd-panel ${st.panel} ${st.state}`}
        aria-labelledby="breathing-done-title"
      >
        {/* TRAIN-TILTGUARD-A11Y-1: SVG check-square replaces ✓ */}
        <div className={st.ice} style={{ display: 'inline-flex' }} aria-hidden>
          <CheckSquareIcon size={40} />
        </div>
        <h2 id="breathing-done-title" className={st.title}>Exercise Complete</h2>
        <p className={st.copy}>4 Cycles Done. Feeling Calmer?</p>
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={onClose} className="sd-button sd-primary">
          Done
        </motion.button>
      </motion.section>
    );
  }

  return (
    <motion.section className={`sd-panel ${st.panel} ${st.breathPanel}`} aria-labelledby="breathing-title">
      <div className={st.panelHead}>
        <h2 id="breathing-title" className={st.title}>Box Breathing</h2>
        <span className={st.tag}>Cycle {cycle} Of 4</span>
      </div>
      <motion.div
        animate={{
          scale: phase === 'inhale' ? [1, 1.25] : phase === 'exhale' ? [1.25, 1] : 1.25,
        }}
        transition={{ duration: 4, ease: 'easeInOut' }}
        className={st.breathOrb}
        data-phase={phase}
      >
        <span className={st.breathCount} role="timer" aria-live="off">{timer}</span>
      </motion.div>
      <div className={st.breathLabel} aria-live="polite">{phaseLabel[phase]}</div>
      <button type="button" onClick={onClose} className="sd-button">
        Stop Exercise
      </button>
    </motion.section>
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

  const riskLabels = { high: 'High Tilt Risk', medium: 'Moderate', low: 'Stable', none: 'Neutral' };

  return (
    <>
      <SEOHead
        title="Poker Tilt Guard & Mindset Coach"
        description="Monitor Mid-Session Emotional Triggers, Log Mental Game Check-Ins, And Run Guided Breathing And Stop-Loss Cooldown Protocols On Smarter.Poker."
        canonical="/hub/training/tilt-guard"
      />
      <div className={st.shell}>
        <TrainingPageHead slug="training-tilt-guard" note="Emotional Intelligence Coach" />

        <div className={st.page}>
          {fetchError && <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); fetchData(); }} />}

          {/* Loading */}
          {loading && (
            <section className={`sd-panel ${st.panel}`} role="status" aria-label="Loading Tilt Data">
              <div className={st.skeleton} aria-hidden><span /><span /><span /><span /></div>
              <p className={st.small}>Loading Recent Sessions...</p>
            </section>
          )}

          {!loading && !tiltData && !showBreathing && !fetchError && (
            <section className={`sd-panel ${st.panel} ${st.state}`} aria-labelledby="tilt-empty-title">
              <h2 id="tilt-empty-title" className={st.title}>Tilt Check Needs Recent Sessions</h2>
              <p className={st.copy}>Your Tilt Risk Appears After Verified Training Sessions Load. The Breathing Exercise And Tips Below Work Any Time.</p>
            </section>
          )}

          {tiltData && !showBreathing && (
            <>
              {/* Risk Status */}
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`sd-panel ${st.panel} ${st.riskPanel}`}
                aria-labelledby="tilt-risk-title"
              >
                <h2 id="tilt-risk-title" className={st.title}>Tilt Risk</h2>
                <span className={st.riskBadge} data-risk={tiltData.risk}>
                  {riskLabels[tiltData.risk]}
                </span>
                <p className={st.copy}>{tiltData.message}</p>
                {tiltData.recentAvg !== null && (
                  <dl className={st.facts3}>
                    <div><dt>Recent (3)</dt><dd>{tiltData.recentAvg}%</dd></div>
                    <div><dt>Previous (3)</dt><dd>{tiltData.previousAvg}%</dd></div>
                    <div>
                      <dt>Change</dt>
                      <dd className={tiltData.delta >= 0 ? st.up : st.down}>
                        {tiltData.delta >= 0 ? '+' : ''}
                        {Math.round(tiltData.delta)}%
                      </dd>
                    </div>
                  </dl>
                )}
              </motion.section>

              {/* Trend Chart (simple bar chart) */}
              {tiltData.trend.length > 0 && (
                <section className={`sd-panel ${st.panel}`} aria-labelledby="tilt-trend-title">
                  <h2 id="tilt-trend-title" className={st.title}>Accuracy Trend (Last {tiltData.trend.length} Sessions)</h2>
                  <div className={st.bars} role="img" aria-label={`Accuracy by session: ${tiltData.trend.map((t) => `${t.accuracy}%`).join(', ')}`}>
                    {tiltData.trend.map((t, i) => (
                      <div key={i} className={st.barCol}>
                        <span className={st.barValue}>{t.accuracy}%</span>
                        <div className={st.barTrack}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${t.accuracy}%` }}
                            transition={{ delay: i * 0.05, duration: MOTION.standard }}
                            className={st.barFill}
                            data-band={t.accuracy >= 75 ? 'good' : t.accuracy >= 60 ? 'mid' : 'low'}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className={st.small}>Bars Of 75%+ Are Steady, 60-74% Are Watch, Under 60% Are At Risk.</p>
                </section>
              )}

              {/* Cool Down Drills */}
              {tiltData.risk === 'high' && (
                <section className={`sd-panel ${st.panel}`} aria-labelledby="tilt-cooldown-title">
                  <h2 id="tilt-cooldown-title" className={st.title}>Cool Down Drills</h2>
                  <div className={st.list}>
                    {WARMUP_GAMES.map((game) => (
                      <motion.button
                        key={game.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() =>
                          router.push(`/hub/training/arena/${game.id}?level=1&source=tilt-guard`)
                        }
                        className={`sd-button ${st.savedRow}`}
                      >
                        <span className={st.tipRow}>
                          {/* TRAIN-TILTGUARD-A11Y-1: SVG WarmupIcon */}
                          <span className={st.stateIcon} aria-hidden>
                            <WarmupIcon kind={game.iconKind} size={18} />
                          </span>
                          <span className={st.savedText}>
                            <span className={st.presetName}>{game.name}</span>
                            <span className={st.presetDesc}>{game.desc}</span>
                          </span>
                        </span>
                        <span className={st.tag}>Play</span>
                      </motion.button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {!loading && !showBreathing && (
            <>
              {/* Breathing Exercise CTA */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowBreathing(true)}
                className={`sd-button sd-primary ${st.block}`}
              >
                {/* TRAIN-TILTGUARD-A11Y-1: SVG meditate replaces */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <MeditateIcon size={18} />
                  Start Breathing Exercise
                </span>
              </motion.button>

              {/* Mental Tips */}
              <section className={`sd-panel ${st.panel}`} aria-labelledby="tilt-tips-title">
                <h2 id="tilt-tips-title" className={st.title}>Mental Game Tips</h2>
                <div className={st.list}>
                  {MENTAL_TIPS.map((tip, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`${st.item} ${st.tipRow}`}
                    >
                      {/* TRAIN-TILTGUARD-A11Y-1: SVG TipIcon */}
                      <span className={st.stateIcon} aria-hidden>
                        <TipIcon kind={tip.iconKind} size={18} />
                      </span>
                      <span className={st.savedText}>
                        <span className={st.itemTitle}>{tip.title}</span>
                        <span className={st.small}>{tip.desc}</span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Breathing Exercise Overlay */}
          {showBreathing && <BreathingExercise onClose={() => setShowBreathing(false)} />}
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-tilt-guard" />
    </>
  );
}
