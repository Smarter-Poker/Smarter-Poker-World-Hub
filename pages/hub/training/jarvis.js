/**
 * Jarvis Dashboard Page
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * AI-powered training insights and personalized recommendations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-26 — hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { buildCustomTrainingArenaHref } from '../../../src/lib/training/customTrainingLaunchContract.mjs';
import { analyzeVerifiedTrainingWeaknesses } from '../../../src/lib/training/weaknessAnalysis.mjs';
import s from '../../../src/styles/training/sessions-coaching.module.css';
// TRAIN-WIRE-EMPTY-5d — adoption: shared empty-state primitive




// BUG FIX (TRAIN-JARVIS-A11Y-1): SVG icon components replacing the Jarvis
// dashboard emoji set across hero (◇), section headings (■  ○ ●
// ▲), StatCard icons (● ◆ ▲ ★ ▲ ○ ●●● trend indicators), and
// venue annotations (★ best / ▲ worst). Same surface-specific a11y
// pattern as PR #320/#322/#324/#327-#352.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=24, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function ChartIcon({ size=18 })       { return <_Svg size={size}><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="7"/><rect x="10" y="8" width="3" height="12"/><rect x="15" y="4" width="3" height="16"/></_Svg>; }
function LightbulbIcon({ size=18 })   { return <_Svg size={size}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.65V17h8v-2.35A7 7 0 0 0 12 2z"/></_Svg>; }
function SearchIcon({ size=18 })      { return <_Svg size={size}><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></_Svg>; }
function GamepadIcon({ size=18 })     { return <_Svg size={size}><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18.5" cy="11.5" r="1"/><rect x="2" y="6" width="20" height="12" rx="3"/></_Svg>; }
function MoneyIcon({ size=18 })       { return <_Svg size={size}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></_Svg>; }
function TrendingUpIcon({ size=18 })  { return <_Svg size={size}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></_Svg>; }
function TargetIcon({ size=18 })      { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function FlameIcon({ size=18 })       { return <_Svg size={size}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z"/></_Svg>; }
function MedalIcon({ size=18 })       { return <_Svg size={size}><circle cx="12" cy="14" r="7"/><path d="M8.21 13.89 6 22l6-3 6 3-2.21-8.12"/><path d="M9 7h6"/></_Svg>; }
function TrophyIcon({ size=14 })      { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function AlertIcon({ size=14 })       { return <_Svg size={size}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></_Svg>; }
function ClockIcon({ size=18 })       { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></_Svg>; }
function TrendDot({ kind, size=14 }) {
  // green / red / yellow filled circle (replaces ●●●)
  const color = kind === 'green' ? 'var(--sp-accent-green)' : kind === 'red' ? 'var(--sp-accent-red)' : '#86daff';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill={color} stroke={color} />
    </svg>
  );
}
function HeadingIcon({ kind, size=18 }) {
  switch (kind) {
    case 'chart':     return <ChartIcon size={size}/>;
    case 'lightbulb': return <LightbulbIcon size={size}/>;
    case 'search':    return <SearchIcon size={size}/>;
    case 'gamepad':   return <GamepadIcon size={size}/>;
    case 'money':     return <MoneyIcon size={size}/>;
    case 'trending':  return <TrendingUpIcon size={size}/>;
    default:          return null;
  }
}
function StatIcon({ kind, size=24 }) {
  switch (kind) {
    case 'gamepad':  return <GamepadIcon size={size}/>;
    case 'target':   return <TargetIcon size={size}/>;
    case 'flame':    return <FlameIcon size={size}/>;
    case 'medal':    return <MedalIcon size={size}/>;
    case 'trending': return <TrendingUpIcon size={size}/>;
    case 'clock':    return <ClockIcon size={size}/>;
    case 'green':    return <TrendDot kind="green" size={size}/>;
    case 'red':      return <TrendDot kind="red" size={size}/>;
    case 'yellow':   return <TrendDot kind="yellow" size={size}/>;
    default:         return null;
  }
}


export default function JarvisDashboard() {
  const router = useRouter();
  useTrainingBus('jarvis-dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [recentAnswers, setRecentAnswers] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [activeVariant, setActiveVariant] = useState('nlh');
  const [heroPosition, setHeroPosition] = useState('BTN');
  const [activeStreet, setActiveStreet] = useState('flop');



  const leakAnalysis = useMemo(() => {
    const rawAnalysis = analyzeVerifiedTrainingWeaknesses(
      Array.isArray(sessions) ? sessions : [],
      Array.isArray(recentAnswers) ? recentAnswers : [],
    );
    const verifiedTop = rawAnalysis?.topSpotLeak || rawAnalysis?.spotLeaks?.[0] || rawAnalysis?.leaks?.[0] || null;
    const hasVerifiedLeak = Boolean(verifiedTop && (verifiedTop.sample || verifiedTop.sampleCount || 0) >= 3);
    const topLeak = hasVerifiedLeak
      ? {
          gameId: verifiedTop.gameId || 'cash-002',
          variant: verifiedTop.variant || activeVariant || 'nlh',
          street: verifiedTop.street || activeStreet || 'flop',
          position: verifiedTop.position || heroPosition || 'BTN',
          sampleSize: Number(verifiedTop.sample || verifiedTop.sampleCount || 3),
          evLossBb: Number(verifiedTop.evLossBb || 0),
          avgEvLossBb: Number(verifiedTop.avgEvLossBb || Number(((verifiedTop.evLossBb || 0) / Math.max(1, verifiedTop.sample || 1)).toFixed(2))),
          accuracy: Number(verifiedTop.acc ?? 60),
        }
      : {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant || 'nlh',
          street: activeStreet || 'flop',
          position: heroPosition || 'BTN',
          sampleSize: Number(rawAnalysis?.totalHands || 0),
          evLossBb: 0,
          avgEvLossBb: 0,
          accuracy: Number(rawAnalysis?.overallAcc ? Math.round(rawAnalysis.overallAcc) : 75),
        };
    return {
      hasVerifiedLeak,
      topLeak,
      rawAnalysis,
    };
  }, [sessions, recentAnswers, activeVariant, activeStreet, heroPosition]);

  const topLeak = leakAnalysis.topLeak;
  const topLeakDrillHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: topLeak.gameId,
          variant: topLeak.variant,
          street: topLeak.street,
          heroPosition: topLeak.position,
          position: topLeak.position,
          stackDepth: 100,
        },
        'dynamic-leak-curriculum',
      ),
    [topLeak],
  );

  useEffect(() => {
    const _c = new AbortController();

    loadInsights(_c.signal);
    return () => _c.abort();
  }, []);

  // Auto-refresh insights when a training session completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => {
      loadInsights();
    });
    return unsub;
  }, []);

  const loadInsights = async (signal) => {
    try {
      setLoading(true);
      setFetchError(null);
      const authUser = getAuthUser();
      const token = getAccessToken();
      setUser(authUser);

      if (authUser || token) {
        try {
          const sessRes = await authedFetch(`/api/training/get-sessions?limit=50&includeAnswers=1`, { signal });
          if (sessRes.ok) {
            const sessData = await sessRes.json();
            if (sessData?.success) {
              if (Array.isArray(sessData.sessions)) setSessions(sessData.sessions);
              if (Array.isArray(sessData.recentAnswers)) setRecentAnswers(sessData.recentAnswers);
            }
          }
        } catch (sessErr) {
          if (sessErr?.name === 'AbortError') return;
          console.warn('Jarvis session weakness fetch fallback:', sessErr);
        }

        if (authUser) {
          const response = await authedFetch(`/api/jarvis/user-insights`, { signal });
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          const data = await response.json();

          if (data.success) {
            setInsights(data.insights);
          }
        }
      }
      setLoading(false);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.warn('Error loading insights:', error);
      setFetchError('Unable to load Jarvis insights. Please try again.');
      setLoading(false);
    }
  };

  const rawAccuracy = insights?.overview?.overallAccuracy;
  const measuredAccuracy = rawAccuracy === null || rawAccuracy === undefined
    ? null
    : Number(rawAccuracy);
  const accuracyLabel = measuredAccuracy !== null && Number.isFinite(measuredAccuracy)
    ? `${measuredAccuracy}%`
    : 'Not Available';
  const rawWeeklySeconds = insights?.weeklyProgress?.timeSpentSeconds
    ?? insights?.weeklyProgress?.timeSpent;
  const measuredWeeklySeconds = rawWeeklySeconds === null || rawWeeklySeconds === undefined
    ? null
    : Number(rawWeeklySeconds);
  const weeklyTimeLabel = measuredWeeklySeconds !== null && Number.isFinite(measuredWeeklySeconds)
    ? `${Math.round(measuredWeeklySeconds / 60)}m`
    : 'Not Available';

  return (
    <PageTransition>
      <SEOHead
        title="Jarvis Training Insights"
        description="Jarvis Reads The Hand In Front Of You, Compares Your Line To The Solver Baseline And Explains The Difference In Words Rather Than A Frequency Table. Free To Use While Training On Smarter.Poker."
        canonical="/hub/training/jarvis"
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <TrainingPageHead slug="training-jarvis" note="Your AI Training Coach" />
        <div className={s.page}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); loadInsights(); }} />

          {/* The question Jarvis is answering, and the action that follows it. */}
          <section
            className={`sd-panel ${s.panel}`}
            aria-labelledby="jarvis-priority-title"
            data-dynamic-leak-curriculum="true"
            data-leak-variant={topLeak.variant}
            data-leak-street={topLeak.street}
            data-leak-position={topLeak.position}
            data-leak-sample-count={topLeak.sampleSize}
            data-leak-basis={leakAnalysis.hasVerifiedLeak ? 'verified-history' : 'baseline-calibration'}
          >
            <div className={s.askBlock}>
              <div className={s.panelHead}>
                <p className={s.eyebrow}>Priority Leak Curriculum</p>
                <span className={s.tag} style={leakAnalysis.hasVerifiedLeak ? { color: '#5ee08a' } : undefined}>
                  {leakAnalysis.hasVerifiedLeak ? 'Verified Leak History' : 'Baseline Calibration'} · N = {topLeak.sampleSize}
                </span>
              </div>
              <h2 id="jarvis-priority-title" className={s.sectionTitle}>
                #1 Priority: {String(topLeak.variant).toUpperCase()} · {String(topLeak.street).toUpperCase()} · {topLeak.position}
              </h2>
              <dl className={s.metrics2} style={{ margin: 0 }}>
                <div className={`sd-metric ${s.metric}`}>
                  <dt className={s.metricLabel}>Target Module</dt>
                  <dd className={s.metricValue} data-tone="ice" style={{ margin: 0 }}>{topLeak.gameId}</dd>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <dt className={s.metricLabel}>Sample Count</dt>
                  <dd className={s.metricValue} style={{ margin: 0 }}>N = {topLeak.sampleSize}</dd>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <dt className={s.metricLabel}>Total EV Loss</dt>
                  <dd className={s.metricValue} style={{ margin: 0 }}>{topLeak.evLossBb} BB</dd>
                </div>
                <div className={`sd-metric ${s.metric}`}>
                  <dt className={s.metricLabel}>Avg EV Loss</dt>
                  <dd className={s.metricValue} style={{ margin: 0 }}>{topLeak.avgEvLossBb} BB/Hand</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              className={`sd-button sd-primary ${s.button} ${s.primary} ${s.full}`}
              data-drill-priority-leak-cta="true"
              data-drill-href={topLeakDrillHref}
              onClick={() => router.push(topLeakDrillHref)}
            >
              Drill Priority #1 Leak In Club Arena ({String(topLeak.variant).toUpperCase()} · {String(topLeak.street).toUpperCase()} · {topLeak.position}) →
            </button>
          </section>

          {loading ? (
            <section className={`sd-panel ${s.panel} ${s.state}`} role="status" aria-live="polite">
              <Image
                src="/images/jarvis-avatar.webp"
                alt="Jarvis"
                width={1024}
                height={682}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 2px #0b1724, 0 0 0 3px #7f9db6' }}
              />
              <p className={s.copy}>Analyzing Your Training Data...</p>
            </section>
          ) : !user ? (
            <TrainerEmptyState
              variant="locked"
              title="Sign In For Personalized Insights"
              message="Jarvis Tracks Your Patterns And Surfaces Tailored Coaching Once You Sign In."
              cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[jarvis] swallowed:`, _); /* TRAIN-CATCH-FIX-1 */ } } }}
            />
          ) : (
            <>
              {/* Jarvis's answer, in its own space. */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="jarvis-says-title">
                <h2 id="jarvis-says-title" className={s.sectionTitle}>
                  <HeadingIcon kind="lightbulb" size={18} />
                  Jarvis Says
                </h2>
                <div className={s.answerBlock}>
                  <p className={s.answerText}>
                    {insights?.jarvisAdvice || 'Keep Training To Unlock Personalized Insights.'}
                  </p>
                </div>
              </section>

              {/* Overview Stats */}
              <section className={`sd-panel ${s.panel}`} aria-labelledby="jarvis-overview-title">
                <h2 id="jarvis-overview-title" className={s.sectionTitle}>
                  <HeadingIcon kind="chart" size={18} />
                  Overview
                </h2>
                <div className={s.metrics2}>
                  <StatCard label="Total Sessions" value={insights?.overview?.totalSessions || 0} iconKind="gamepad" />
                  <StatCard label="Accuracy" value={accuracyLabel} iconKind="target" />
                  <StatCard label="Current Streak" value={insights?.overview?.currentStreak || 0} iconKind="flame" />
                  <StatCard label="Achievements" value={insights?.overview?.achievementsUnlocked || 0} iconKind="medal" />
                </div>
              </section>

              {/* Top Leaks: earlier findings */}
              {insights?.topLeaks?.length > 0 && (
                <section className={`sd-panel ${s.panel}`} aria-labelledby="jarvis-leaks-title">
                  <h2 id="jarvis-leaks-title" className={s.sectionTitle}>
                    <HeadingIcon kind="search" size={18} />
                    Top Leaks To Fix
                  </h2>
                  <ul className={s.list}>
                    {insights.topLeaks.map((leak, i) => (
                      <li key={i} className={s.row}>
                        <span className={s.rowLabel}>{leak.leak || leak.name || leak.position || 'Training Area'}</span>
                        <span className={s.rowValue}>{leak.count} Occurrences</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Game Performance */}
              {insights?.gamePerformance?.length > 0 && (
                <section className={`sd-panel ${s.panel}`} aria-labelledby="jarvis-games-title">
                  <h2 id="jarvis-games-title" className={s.sectionTitle}>
                    <HeadingIcon kind="gamepad" size={18} />
                    Game Performance
                  </h2>
                  <div className={s.metrics}>
                    {insights.gamePerformance.slice(0, 6).map((game, i) => (
                      <div key={i} className={`sd-metric ${s.metric}`}>
                        <span className={s.metricLabel}>{game.gameName || game.name || 'Training'}</span>
                        <strong className={s.metricValue} data-tone="ice">{game.accuracy}%</strong>
                        <span className={s.metricLabel}>Accuracy</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Bankroll & Weekly Progress (Progressive Disclosure) */}
              <details
                className={`sd-panel ${s.details}`}
                data-jarvis-detailed-metrics="true"
                open
              >
                <summary>
                  <span>Detailed Bankroll &amp; Weekly Activity Telemetry</span>
                </summary>
                <div className={s.detailsBody}>
              {/* Bankroll Summary */}
              {insights?.bankroll && (
                <div className={s.panel}>
                  <h3 className={s.sectionTitle}>
                    <HeadingIcon kind="money" size={18} />
                    Bankroll Overview
                  </h3>
                  <div className={s.metrics2}>
                    <StatCard
                      label="Monthly P/L"
                      value={`${insights.bankroll.monthlyPL >= 0 ? '+' : '-'}$${Math.abs(insights.bankroll.monthlyPL).toLocaleString()}`}
                      tone={insights.bankroll.monthlyPL >= 0 ? 'up' : 'down'}
                      iconKind="trending"
                    />
                    <StatCard label="Hourly Rate" value={`$${insights.bankroll.hourlyRate}/hr`} iconKind="clock" />
                    <StatCard label="Win Rate" value={`${insights.bankroll.winRate}%`} iconKind="target" />
                    <StatCard
                      label="Trend"
                      value={insights.bankroll.recentTrend}
                      iconKind={
                        insights.bankroll.recentTrend === 'upswing'
                          ? 'green'
                          : insights.bankroll.recentTrend === 'downswing'
                            ? 'red'
                            : 'yellow'
                      }
                    />
                  </div>
                  {(insights.bankroll.topVenue || insights.bankroll.worstVenue) && (
                    <div className={s.metrics2}>
                      {insights.bankroll.topVenue && (
                        <div className={`sd-metric ${s.metric}`}>
                          <span className={`${s.metricLabel} ${s.up}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <TrophyIcon size={12} /> Best Venue
                          </span>
                          <strong className={s.subTitle}>{insights.bankroll.topVenue.name}</strong>
                          <span className={s.metricValue} data-tone="up">
                            +${Math.abs(Math.round(insights.bankroll.topVenue.net)).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {insights.bankroll.worstVenue && insights.bankroll.worstVenue.net < 0 && (
                        <div className={`sd-metric ${s.metric}`}>
                          <span className={`${s.metricLabel} ${s.down}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AlertIcon size={12} /> Worst Venue
                          </span>
                          <strong className={s.subTitle}>{insights.bankroll.worstVenue.name}</strong>
                          <span className={s.metricValue} data-tone="down">
                            -${Math.abs(Math.round(insights.bankroll.worstVenue.net)).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Progress */}
              <div className={s.panel}>
                <h3 className={s.sectionTitle}>
                  <HeadingIcon kind="trending" size={18} />
                  This Week
                </h3>
                <div className={s.metrics3}>
                  <div className={`sd-metric ${s.metric}`}>
                    <strong className={s.metricValue} data-tone="ice">{insights?.weeklyProgress?.sessions || 0}</strong>
                    <span className={s.metricLabel}>Sessions</span>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <strong className={s.metricValue} data-tone="ice">{insights?.weeklyProgress?.correct || 0}</strong>
                    <span className={s.metricLabel}>Correct</span>
                  </div>
                  <div className={`sd-metric ${s.metric}`}>
                    <strong className={s.metricValue} data-tone="ice">{weeklyTimeLabel}</strong>
                    <span className={s.metricLabel}>Time Spent</span>
                  </div>
                </div>
              </div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
      <ConnectionToast />
      {/* Server rendered: measured on production this page returned
          only chrome to a crawler (AEO phase 3, 2026-09-17). */}
      <HubPageSummary page="training-jarvis" />
    </PageTransition>
  );
}

function StatCard({ label, value, iconKind, tone }) {
  return (
    <div className={`sd-metric ${s.metric}`}>
      {/* TRAIN-JARVIS-A11Y-1: SVG StatIcon */}
      {iconKind && (
        <span className={s.metricIcon} aria-hidden>
          <StatIcon kind={iconKind} size={22} />
        </span>
      )}
      <strong className={s.metricValue} data-tone={tone}>{value}</strong>
      <span className={s.metricLabel}>{label}</span>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
    background: '#040d18',
    color: '#f2f7ff',
  },
};
