/**
 * AGGREGATE FLOP REPORTS — GTO Wizard-Style Texture Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Aggregated strategy data across ALL possible flops for a given preflop spot.
 * Shows C-bet / check frequencies by flop texture (monotone, paired, connected, etc).
 * The "missing piece" from GTO Wizard that provides strategic insight at scale.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-2 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-1 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';

// TRAIN-CSS-MOTION-ADOPT-1 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-EMPTY-5e — adoption: shared empty-state primitive

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

// BUG FIX (TRAIN-AGGREGATE-A11Y-1): SVG icon components replacing the
// aggregate-reports emoji set (▲ header, ● ◆ ★ game-type icons,
// results header, ◇ textures, □ empty state, ● position row,
// ▲ error). Plus ← back arrow hardening. Same surface-specific a11y
// pattern as PR #320/#322/#324/#327/#328/#329/#330/#331/#332/#333/#334/
// #335/#336/#337/#338/#339.
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
function TrendingUpIcon({ size=28 }) { return <_Svg size={size}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></_Svg>; }
function MoneyIcon({ size=14 })      { return <_Svg size={size}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></_Svg>; }
function TargetIcon({ size=14 })     { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function TrophyIcon({ size=14 })     { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function ChartBarIcon({ size=24 })   { return <_Svg size={size}><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="13" width="3" height="7"/><rect x="10" y="8" width="3" height="12"/><rect x="15" y="4" width="3" height="16"/></_Svg>; }
function PaletteIcon({ size=18 })    { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="6.5" cy="11.5" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="17" cy="12" r="1"/><circle cx="14" cy="17" r="1"/></_Svg>; }
function InboxEmptyIcon({ size=48 }) { return <_Svg size={size}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></_Svg>; }
function ChairIcon({ size=18 })      { return <_Svg size={size}><path d="M5 4v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4"/><path d="M5 12v8"/><path d="M19 12v8"/><line x1="3" y1="20" x2="21" y2="20"/></_Svg>; }
function AlertIcon({ size=14 })      { return <_Svg size={size}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></_Svg>; }
function BackArrowIcon({ size=18 })  { return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function GameTypeIcon({ kind, size=14 }) {
  switch (kind) {
    case 'money':  return <MoneyIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'trophy': return <TrophyIcon size={size}/>;
    default:       return null;
  }
}

const GAME_TYPES = [
  { key: 'hu_cash', label: 'Cash HU', iconKind: 'money', icon: '?' },
  { key: 'cash_6max', label: 'Cash 6-Max', iconKind: 'target', icon: '?' },
  { key: 'mtt_6max_icm', label: 'MTT 6-Max', iconKind: 'trophy', icon: '?' },
];

const STACK_DEPTHS = [20, 40, 60, 80, 100, 150, 200];

const POSITIONS = [
  { key: '', label: 'All Positions' },
  { key: 'UTG', label: 'UTG' },
  { key: 'MP', label: 'MP' },
  { key: 'CO', label: 'CO' },
  { key: 'BTN', label: 'BTN' },
  { key: 'SB', label: 'SB' },
  { key: 'BB', label: 'BB' },
];

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
export default function AggregateReports() {
  const router = useRouter();
  useTrainingBus('aggregate-reports');
  const [gameType, setGameType] = useState('hu_cash');
  const [stackDepth, setStackDepth] = useState(100);
  const [heroPosition, setHeroPosition] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        gameType,
        stackDepth: stackDepth.toString(),
      });
      if (heroPosition) params.set('heroPosition', heroPosition);

      const res = await authedFetch(`/api/training/aggregate-report?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        setReport(data.report);
      } else {
        setError(data.error || 'Failed to load report');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gameType, stackDepth, heroPosition]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Bus listener — auto-refresh when other training completes
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchReport());
    return unsub;
  }, [fetchReport]);

  const maxCbet = useMemo(() => {
    if (!report?.textures) return 100;
    return Math.max(...report.textures.map((t) => t.cbetFreq), 1);
  }, [report]);

  return (
    <>
      <Head>
        <title>Aggregate Flop Reports | Smarter.Poker Training</title>
        <meta
          name="description"
          content="See aggregated GTO strategy across all flop textures. Discover which boards favor betting vs checking."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <motion.button
            type="button"
            aria-label="Back to training"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/hub/training')}
            style={styles.backBtn}
          >
            {/* TRAIN-AGGREGATE-A11Y-1: SVG back arrow + visible label */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <BackArrowIcon size={14} />
              Training
            </span>
          </motion.button>
          <h1 style={styles.title}>
            {/* TRAIN-AGGREGATE-A11Y-1: SVG TrendingUp replaces ▲ */}
            <span style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--sp-accent-cyan)' }} aria-hidden><TrendingUpIcon size={28} /></span> Aggregate Reports
          </h1>
        </div>

        <p style={styles.subtitle}>
          Aggregated strategy across all flop textures — see when to C-bet vs check by board type
        </p>

        {/* Filters */}
        <div style={styles.filtersSection}>
          {/* Game Type */}
          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>Game Format</label>
            <div style={styles.buttonRow}>
              {GAME_TYPES.map((g) => (
                <motion.button
                  key={g.key}
                  type="button"
                  aria-pressed={gameType === g.key}
                  aria-label={`Game format: ${g.label}`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setGameType(g.key)}
                  style={{
                    ...styles.filterBtn,
                    ...(gameType === g.key ? styles.filterBtnActive : {}),
                  }}
                >
                  {/* TRAIN-AGGREGATE-A11Y-1: SVG icon replaces emoji */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <GameTypeIcon kind={g.iconKind} size={14} />
                    {g.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Stack Depth */}
          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>Stack Depth</label>
            <div style={styles.buttonRow}>
              {STACK_DEPTHS.map((d) => (
                <motion.button
                  key={d}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setStackDepth(d)}
                  style={{
                    ...styles.stackBtn,
                    ...(stackDepth === d ? styles.stackBtnActive : {}),
                  }}
                >
                  {d}BB
                </motion.button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div style={styles.filterRow}>
            <label style={styles.filterLabel}>Hero Position</label>
            <div style={styles.buttonRow}>
              {POSITIONS.map((p) => (
                <motion.button
                  key={p.key}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setHeroPosition(p.key)}
                  style={{
                    ...styles.posBtn,
                    ...(heroPosition === p.key ? styles.posBtnActive : {}),
                  }}
                >
                  {p.label}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={styles.loadingContainer}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={styles.spinner}
            />
            <p style={{ color: 'var(--sp-fg-dim)', marginTop: 12 }}>Analyzing flop textures...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && <div style={styles.errorBox} role="alert">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {/* TRAIN-AGGREGATE-A11Y-1: SVG alert replaces ▲ */}
              <AlertIcon size={14} /> {error}
            </span>
          </div>}

        {/* Report Data */}
        {report && !loading && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${gameType}-${stackDepth}-${heroPosition}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Overall Stats */}
              <div style={styles.overallCard}>
                <div style={styles.overallHeader}>
                  {/* TRAIN-AGGREGATE-A11Y-1: SVG bar chart replaces ■ */}
                  <span style={{ display: 'inline-flex', color: 'var(--sp-accent-cyan)' }} aria-hidden><ChartBarIcon size={24} /></span>
                  <span style={styles.overallTitle}>Overall Summary</span>
                  <span style={styles.spotCount}>
                    {report.totalSpots.toLocaleString()} spots analyzed
                  </span>
                </div>
                <div style={styles.overallStats}>
                  <div style={styles.overallStat}>
                    <div style={{ ...styles.overallValue, color: 'var(--sp-accent-red)' }}>
                      {report.overall.cbetFreq}%
                    </div>
                    <div style={styles.overallLabel}>Avg Bet/Raise</div>
                  </div>
                  <div style={styles.overallDivider} />
                  <div style={styles.overallStat}>
                    <div style={{ ...styles.overallValue, color: 'var(--sp-accent-green)' }}>
                      {report.overall.checkFreq}%
                    </div>
                    <div style={styles.overallLabel}>Avg Check/Call</div>
                  </div>
                </div>
              </div>

              {/* Texture Breakdown */}
              <div style={styles.sectionHeader}>
                {/* TRAIN-AGGREGATE-A11Y-1: SVG palette replaces ◇ */}
                <span style={{ display: 'inline-flex', color: 'var(--sp-accent-purple)' }} aria-hidden><PaletteIcon size={18} /></span>
                <span>Strategy by Flop Texture</span>
              </div>

              {report.textures.length === 0 && (
                <TrainerEmptyState
                  variant="no-data"
                  title="No solver data for this configuration"
                  message="Try changing the game type or stack depth."
                />
              )}

              {report.textures.map((tex, idx) => (
                <motion.div
                  key={tex.texture}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  style={styles.textureCard}
                >
                  <div style={styles.textureHeader}>
                    <div style={styles.textureTitle}>
                      <span style={{ fontSize: 16, marginRight: 6 }}>{tex.icon}</span>
                      <span style={{ color: tex.color, fontWeight: 700 }}>{tex.label}</span>
                    </div>
                    <span style={styles.textureSpots}>{tex.spotCount} spots</span>
                  </div>
                  {tex.desc && <div style={styles.textureDesc}>{tex.desc}</div>}

                  {/* Bar chart */}
                  <div style={styles.barContainer}>
                    {/* Bet/Raise bar */}
                    <div style={styles.barRow}>
                      <span style={styles.barLabel}>BET</span>
                      <div style={styles.barTrack}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max((tex.cbetFreq / maxCbet) * 100, 2)}%` }}
                          transition={{ duration: MOTION.slow, delay: idx * 0.05 }}
                          style={{
                            ...styles.barFill,
                            background: `linear-gradient(90deg, ${tex.color}88, ${tex.color})`,
                          }}
                        />
                      </div>
                      <span style={{ ...styles.barValue, color: tex.color }}>{tex.cbetFreq}%</span>
                    </div>
                    {/* Check/Call bar */}
                    <div style={styles.barRow}>
                      <span style={styles.barLabel}>CHECK</span>
                      <div style={styles.barTrack}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max((tex.checkFreq / maxCbet) * 100, 2)}%` }}
                          transition={{ duration: MOTION.slow, delay: idx * 0.05 + 0.1 }}
                          style={{
                            ...styles.barFill,
                            background: 'linear-gradient(90deg, #22c55e44, rgba(var(--sp-accent-green-rgb), 1))',
                          }}
                        />
                      </div>
                      <span style={{ ...styles.barValue, color: 'var(--sp-accent-green)' }}>{tex.checkFreq}%</span>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Position Breakdown */}
              {report.positions && report.positions.length > 0 && (
                <>
                  <div style={{ ...styles.sectionHeader, marginTop: 24 }}>
                    {/* TRAIN-AGGREGATE-A11Y-1: SVG chair replaces ● */}
                    <span style={{ display: 'inline-flex', color: 'var(--sp-fg-muted)' }} aria-hidden><ChairIcon size={18} /></span>
                    <span>Strategy by Position</span>
                  </div>
                  <div style={styles.positionGrid}>
                    {report.positions
                      .filter((p) => p.position !== 'UNK')
                      .map((p, idx) => (
                        <motion.div
                          key={p.position}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.08 }}
                          style={styles.posCard}
                        >
                          <div style={styles.posName}>{p.position}</div>
                          <div style={styles.posFreq}>
                            <span style={{ color: 'var(--sp-accent-red)', fontWeight: 700 }}>{p.cbetFreq}%</span>
                            <span style={{ color: 'var(--sp-fg-faint)', margin: '0 4px' }}>bet</span>
                          </div>
                          <div style={styles.posFreq}>
                            <span style={{ color: 'var(--sp-accent-green)', fontWeight: 700 }}>
                              {p.checkFreq}%
                            </span>
                            <span style={{ color: 'var(--sp-fg-faint)', margin: '0 4px' }}>chk</span>
                          </div>
                          <div style={styles.posSpots}>{p.spotCount} spots</div>
                        </motion.div>
                      ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STYLES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
const styles = {
  page: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
    color: 'var(--sp-fg)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    padding: '20px 16px 60px',
    maxWidth: 700,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--sp-fg-muted)',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    fontFamily: "'Orbitron', monospace",
    background: 'linear-gradient(135deg, rgba(var(--sp-accent-orange-rgb), 1), #fb923c)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--sp-fg-dim)',
    marginBottom: 20,
    lineHeight: 1.5,
  },
  filtersSection: {
    marginBottom: 20,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--sp-fg-dim)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    display: 'block',
    marginBottom: 6,
  },
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--sp-fg-muted)',
    padding: '7px 14px',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  filterBtnActive: {
    background: 'rgba(249,115,22,0.15)',
    borderColor: 'var(--sp-accent-orange)',
    color: 'var(--sp-accent-orange)',
  },
  stackBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--sp-fg-muted)',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 700,
    fontFamily: "'Orbitron', monospace",
    transition: 'all 0.2s',
  },
  stackBtnActive: {
    background: 'rgba(59,130,246,0.15)',
    borderColor: 'var(--sp-accent-blue)',
    color: 'var(--sp-accent-blue)',
  },
  posBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--sp-fg-muted)',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  posBtnActive: {
    background: 'rgba(34,197,94,0.15)',
    borderColor: 'var(--sp-accent-green)',
    color: 'var(--sp-accent-green)',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '3px solid rgba(249,115,22,0.2)',
    borderTop: '3px solid #f97316',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: '14px 18px',
    color: 'var(--sp-accent-red)',
    fontSize: 13,
    textAlign: 'center',
  },
  overallCard: {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.06)',
    padding: 18,
    marginBottom: 20,
  },
  overallHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  overallTitle: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Orbitron', monospace",
    color: 'var(--sp-fg)',
    flex: 1,
  },
  spotCount: {
    fontSize: 11,
    color: 'var(--sp-fg-dim)',
    fontWeight: 600,
  },
  overallStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  overallStat: {
    textAlign: 'center',
  },
  overallValue: {
    fontSize: 32,
    fontWeight: 800,
    fontFamily: "'Orbitron', monospace",
    lineHeight: 1,
  },
  overallLabel: {
    fontSize: 11,
    color: 'var(--sp-fg-dim)',
    fontWeight: 600,
    marginTop: 4,
  },
  overallDivider: {
    width: 1,
    height: 40,
    background: 'rgba(255,255,255,0.08)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--sp-fg-muted)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textureCard: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 8,
  },
  textureHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  textureTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
  },
  textureSpots: {
    fontSize: 10,
    color: 'var(--sp-fg-faint)',
    fontWeight: 600,
  },
  textureDesc: {
    fontSize: 11,
    color: 'var(--sp-fg-faint)',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  barContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--sp-fg-dim)',
    width: 38,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  barTrack: {
    flex: 1,
    height: 12,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
    minWidth: 2,
  },
  barValue: {
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Orbitron', monospace",
    width: 40,
    textAlign: 'right',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--sp-fg-dim)',
  },
  positionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  posCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '10px 12px',
    textAlign: 'center',
  },
  posName: {
    fontSize: 14,
    fontWeight: 800,
    fontFamily: "'Orbitron', monospace",
    color: 'var(--sp-fg)',
    marginBottom: 4,
  },
  posFreq: {
    fontSize: 12,
    lineHeight: 1.6,
  },
  posSpots: {
    fontSize: 9,
    color: 'var(--sp-fg-faint)',
    marginTop: 4,
  },
};