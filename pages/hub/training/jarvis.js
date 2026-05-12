/**
 * Jarvis Dashboard Page
 * ═══════════════════════════════════════════════════════════════════════════
 * AI-powered training insights and personalized recommendations
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH5-26 — hex sweep batch 5: literals routed to --sp-* tokens
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser, authedFetch } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import ErrorBanner from '../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
// TRAIN-WIRE-EMPTY-5d — adoption: shared empty-state primitive

// BUG FIX (TRAIN-JARVIS-A11Y-1): SVG icon components replacing the Jarvis
// dashboard emoji set across hero (🧠), section headings (📊 💡 🔍 🎮 💰
// 📈), StatCard icons (🎮 🎯 🔥 🏅 📈 ⏱️ 🟢🟡🔴 trend indicators), and
// venue annotations (🏆 best / ⚠️ worst). Same surface-specific a11y
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
function BrainIcon({ size=48 })       { return <_Svg size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_Svg>; }
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
  // green / red / yellow filled circle (replaces 🟢🔴🟡)
  const color = kind === 'green' ? 'var(--sp-accent-green)' : kind === 'red' ? 'var(--sp-accent-red)' : 'var(--sp-accent-amber)';
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
  useTrainingBus('jarvis-dashboard');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const _c = new AbortController();

    loadInsights();
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
      setUser(authUser);

      if (authUser) {
        const response = await authedFetch(`/api/jarvis/user-insights`);
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = await response.json();

        if (data.success) {
          setInsights(data.insights);
        }
      }
      setLoading(false);
    } catch (error) {
      console.warn('Error loading insights:', error);
      setFetchError('Unable to load Jarvis insights. Please try again.');
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <SEOHead
        title="Jarvis AI Coach — GTO Analysis"
        description="Get Personalized GTO Coaching From Jarvis, Your AI Poker Intelligence. Solver-grade Analysis For Every Hand."
        canonical="/hub/training/jarvis"
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <div style={styles.content}>
          <ErrorBanner message={fetchError} onRetry={() => { setFetchError(null); loadInsights(); }} />
          <div style={styles.header}>
            {/* TRAIN-JARVIS-A11Y-1: SVG brain replaces 🧠 hero */}
            <div style={{ ...styles.jarvisIcon, color: 'var(--sp-accent-purple)', display: 'inline-flex', justifyContent: 'center' }} aria-hidden>
              <BrainIcon size={48} />
            </div>
            <h1 style={styles.title}>JARVIS Dashboard</h1>
            <p style={styles.subtitle}>Your AI Training Coach</p>
          </div>

          {loading ? (
            <div style={styles.loading}>
              <Image
                src="/images/jarvis-avatar.png"
                alt="Jarvis"
                width={1024}
                height={682}
                style={{ width: 48, height: 48, borderRadius: '50%' }}
              />
              <p>Analyzing Your Training Data...</p>
            </div>
          ) : !user ? (
            <TrainerEmptyState
              variant="locked"
              title="Sign in for personalized insights"
              message="Jarvis tracks your patterns and surfaces tailored coaching once you sign in."
              cta={{ label: 'Sign In', onClick: () => { try { window.location.href = '/auth/login'; } catch (_) { if (typeof console !== "undefined" && console.warn) console.warn(`[jarvis] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ } } }}
            />
          ) : (
            <div style={styles.dashboard}>
              {/* Overview Stats */}
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="chart" size={18} />
                    Overview
                  </span>
                </h2>
                <div style={styles.statsGrid}>
                  <StatCard
                    label="Total Sessions"
                    value={insights?.overview?.totalSessions || 0}
                    icon="🎮"
                    iconKind="gamepad"
                  />
                  <StatCard
                    label="Accuracy"
                    value={`${insights?.overview?.overallAccuracy || 0}%`}
                    icon="🎯"
                    iconKind="target"
                  />
                  <StatCard
                    label="Current Streak"
                    value={insights?.overview?.currentStreak || 0}
                    icon="🔥"
                    iconKind="flame"
                  />
                  <StatCard
                    label="Achievements"
                    value={insights?.overview?.achievementsUnlocked || 0}
                    icon="🏅"
                    iconKind="medal"
                  />
                </div>
              </div>

              {/* Jarvis Advice */}
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="lightbulb" size={18} />
                    Jarvis Says
                  </span>
                </h2>
                <div style={styles.adviceBox}>
                  <p style={styles.advice}>
                    {insights?.jarvisAdvice || 'Keep training to unlock personalized insights!'}
                  </p>
                </div>
              </div>

              {/* Top Leaks */}
              {insights?.topLeaks?.length > 0 && (
                <div style={styles.section}>
                  <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="search" size={18} />
                    Top Leaks To Fix
                  </span>
                </h2>
                  <div style={styles.leaksList}>
                    {insights.topLeaks.map((leak, i) => (
                      <div key={i} style={styles.leakCard}>
                        <span style={styles.leakName}>{leak.name}</span>
                        <span style={styles.leakCount}>{leak.count} occurrences</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game Performance */}
              {insights?.gamePerformance?.length > 0 && (
                <div style={styles.section}>
                  <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="gamepad" size={18} />
                    Game Performance
                  </span>
                </h2>
                  <div style={styles.gamesGrid}>
                    {insights.gamePerformance.slice(0, 6).map((game, i) => (
                      <div key={i} style={styles.gameCard}>
                        <div style={styles.gameName}>{game.name}</div>
                        <div style={styles.gameAccuracy}>{game.accuracy}%</div>
                        <div style={styles.gameLabel}>Accuracy</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bankroll Summary */}
              {insights?.bankroll && (
                <div style={styles.section}>
                  <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="money" size={18} />
                    Bankroll Overview
                  </span>
                </h2>
                  <div style={styles.statsGrid}>
                    <StatCard
                      label="Monthly P/L"
                      value={`${insights.bankroll.monthlyPL >= 0 ? '+' : ''}$${Math.abs(insights.bankroll.monthlyPL).toLocaleString()}`}
                      icon="📈"
                    iconKind="trending"
                    />
                    <StatCard
                      label="Hourly Rate"
                      value={`$${insights.bankroll.hourlyRate}/hr`}
                      icon="⏱️"
                    iconKind="clock"
                    />
                    <StatCard label="Win Rate" value={`${insights.bankroll.winRate}%`} icon="🎯"
                    iconKind="target" />
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
                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                      {insights.bankroll.topVenue && (
                        <div
                          style={{
                            ...styles.adviceBox,
                            flex: 1,
                            borderColor: 'rgba(34,197,94,0.3)',
                            background: 'rgba(34,197,94,0.1)',
                          }}
                        >
                          <div style={{ fontSize: 11, color: 'var(--sp-accent-green)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {/* TRAIN-JARVIS-A11Y-1: SVG trophy replaces 🏆 */}
                            <TrophyIcon size={12} /> Best Venue
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {insights.bankroll.topVenue.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--sp-accent-green)' }}>
                            +$
                            {Math.abs(Math.round(insights.bankroll.topVenue.net)).toLocaleString()}
                          </div>
                        </div>
                      )}
                      {insights.bankroll.worstVenue && insights.bankroll.worstVenue.net < 0 && (
                        <div
                          style={{
                            ...styles.adviceBox,
                            flex: 1,
                            borderColor: 'rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.1)',
                          }}
                        >
                          <div style={{ fontSize: 11, color: 'var(--sp-accent-red)', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {/* TRAIN-JARVIS-A11Y-1: SVG alert replaces ⚠️ */}
                            <AlertIcon size={12} /> Worst Venue
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {insights.bankroll.worstVenue.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--sp-accent-red)' }}>
                            -$
                            {Math.abs(
                              Math.round(insights.bankroll.worstVenue.net)
                            ).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Progress */}
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {/* TRAIN-JARVIS-A11Y-1: SVG heading icon */}
                    <HeadingIcon kind="trending" size={18} />
                    This Week
                  </span>
                </h2>
                <div style={styles.weeklyStats}>
                  <div style={styles.weeklyStat}>
                    <span style={styles.weeklyValue}>
                      {insights?.weeklyProgress?.sessions || 0}
                    </span>
                    <span style={styles.weeklyLabel}>Sessions</span>
                  </div>
                  <div style={styles.weeklyStat}>
                    <span style={styles.weeklyValue}>{insights?.weeklyProgress?.correct || 0}</span>
                    <span style={styles.weeklyLabel}>Correct</span>
                  </div>
                  <div style={styles.weeklyStat}>
                    <span style={styles.weeklyValue}>
                      {insights?.weeklyProgress?.timeSpent || 0}m
                    </span>
                    <span style={styles.weeklyLabel}>Time Spent</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConnectionToast />
    </PageTransition>
  );
}

function StatCard({ label, value, icon, iconKind }) {
  return (
    <div style={styles.statCard}>
      {/* TRAIN-JARVIS-A11Y-1: SVG StatIcon when iconKind given, otherwise legacy emoji */}
      <div style={styles.statIcon} aria-hidden>
        {iconKind ? <StatIcon kind={iconKind} size={24} /> : icon}
      </div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: '#0a0a0a',
    color: '#FFFFFF',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '80px 24px 40px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  jarvisIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
  },
  subtitle: {
    color: 'var(--sp-fg-muted)',
    marginTop: '8px',
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: 'var(--sp-fg-muted)',
  },
  loadingIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    animation: 'pulse 2s infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px',
    color: 'var(--sp-fg-muted)',
  },
  signInBtn: {
    display: 'inline-block',
    marginTop: '16px',
    padding: '12px 32px',
    background: '#00E0FF',
    color: '#000',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 600,
  },
  dashboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  section: {},
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#FFFFFF',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  statCard: {
    padding: '20px',
    background: '#1a1a1a',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statIcon: {
    fontSize: '24px',
    marginBottom: '8px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#00E0FF',
  },
  statLabel: {
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
    marginTop: '4px',
  },
  adviceBox: {
    padding: '20px',
    background: 'linear-gradient(135deg, rgba(0, 224, 255, 0.1), rgba(139, 92, 246, 0.1))',
    border: '1px solid rgba(0, 224, 255, 0.3)',
    borderRadius: '12px',
  },
  advice: {
    fontSize: '16px',
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  leaksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  leakCard: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#1a1a1a',
    borderRadius: '8px',
    borderLeft: '3px solid #ef4444',
  },
  leakName: {
    fontWeight: 500,
  },
  leakCount: {
    color: 'var(--sp-fg-muted)',
    fontSize: '14px',
  },
  gamesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  gameCard: {
    padding: '16px',
    background: '#1a1a1a',
    borderRadius: '12px',
    textAlign: 'center',
  },
  gameName: {
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
    marginBottom: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gameAccuracy: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--sp-accent-green)',
  },
  gameLabel: {
    fontSize: '10px',
    color: '#666',
  },
  weeklyStats: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
  },
  weeklyStat: {
    flex: 1,
    padding: '16px',
    background: '#1a1a1a',
    borderRadius: '12px',
    textAlign: 'center',
  },
  weeklyValue: {
    display: 'block',
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--sp-accent-amber)',
  },
  weeklyLabel: {
    fontSize: '12px',
    color: 'var(--sp-fg-muted)',
    marginTop: '4px',
  },
  backLink: {
    display: 'block',
    textAlign: 'center',
    marginTop: '32px',
    color: '#00E0FF',
    textDecoration: 'none',
  },
};
