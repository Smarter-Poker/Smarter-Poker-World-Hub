/**
 * PREFLOP CHARTS — Authored 6-Max Cash 100BB Reference Browser
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 17: Standalone study tool for browsing preflop ranges by position,
 * stack depth, and action scenario. Compare mode for side-by-side analysis.
 *
 * Route: /hub/training/preflop-charts
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-39 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-32 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';
import PreflopChartStats from '../../../src/components/training/PreflopChartStats';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import BottomSheet from '../../../src/components/ui/BottomSheet';
import useVIPGate from '../../../src/hooks/useVIPGate';
import VIPGateModal from '../../../src/components/ui/VIPGateModal';

// TRAIN-CSS-MOTION-ADOPT-18 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-CSS-MOBILE-ADOPT-2 — adoption of mobile data-attr patterns from TRAIN-CSS-MOBILE-1

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SUPPORTED_GAME_TYPE = 'cash_6max';
const SUPPORTED_STACK_DEPTH = 100;

const SCENARIOS = [
  { value: 'rfi', label: 'RFI (Raise First In)', desc: 'Open-raising range' },
  { value: 'vs3bet', label: 'Vs 3-Bet', desc: 'Facing a 3-bet after opening' },
  { value: 'bb_defense', label: 'BB Defense', desc: 'Defending Big-Blind vs open' },
];

const POSITIONS_BY_SCENARIO = Object.freeze({
  rfi: Object.freeze(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']),
  vs3bet: Object.freeze(['UTG', 'CO', 'BTN']),
  bb_defense: Object.freeze(['UTG', 'CO', 'BTN', 'SB']),
});


// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function PreflopCharts() {
  const router = useRouter();
  // TRAIN-WIRE-BOTTOMSHEET-5 — info sheet state
  const [infoOpen, setInfoOpen] = useState(false);
  useTrainingBus('preflop-charts');
  
  // Filters
  const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal } = useVIPGate('gto-training');
  const [scenario, setScenario] = useState('rfi');
  const [position, setPosition] = useState('BTN');
  const gameType = SUPPORTED_GAME_TYPE;
  const stackDepth = SUPPORTED_STACK_DEPTH;

  // Data
  const [rangeData, setRangeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [actions, setActions] = useState([]);
  const [provenance, setProvenance] = useState(null);
  const [rangeError, setRangeError] = useState('');
  const primaryRequestId = useRef(0);
  const compareRequestId = useRef(0);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState('UTG');
  const [compareData, setCompareData] = useState(null);
  const [compareStats, setCompareStats] = useState(null);
  const [compareActions, setCompareActions] = useState([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Displayed positions depend on scenario
  const displayedPositions = useMemo(
    () => POSITIONS_BY_SCENARIO[scenario] || POSITIONS_BY_SCENARIO.rfi,
    [scenario],
  );

  const selectScenario = useCallback((nextScenario) => {
    const supportedPositions = POSITIONS_BY_SCENARIO[nextScenario];
    if (!supportedPositions) return;

    const nextPosition = supportedPositions.includes(position) ? position : supportedPositions[0];
    const nextComparePosition = supportedPositions.includes(comparePosition) && comparePosition !== nextPosition
      ? comparePosition
      : supportedPositions.find((candidate) => candidate !== nextPosition) || nextPosition;

    setScenario(nextScenario);
    setPosition(nextPosition);
    setComparePosition(nextComparePosition);
  }, [position, comparePosition]);

  const selectPosition = useCallback((nextPosition) => {
    setPosition(nextPosition);
    if (compareMode && comparePosition === nextPosition) {
      const alternative = displayedPositions.find((candidate) => candidate !== nextPosition);
      if (alternative) setComparePosition(alternative);
    }
  }, [compareMode, comparePosition, displayedPositions]);

  // Fetch range data
  const fetchRange = useCallback(
    async (pos, isCompare = false) => {
      const requestRef = isCompare ? compareRequestId : primaryRequestId;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      if (isCompare) {
        setLoadingCompare(true);
        setCompareData(null);
        setCompareStats(null);
      } else {
        setLoading(true);
        setRangeData(null);
        setStats(null);
        setProvenance(null);
        setRangeError('');
      }

      try {
        const params = new URLSearchParams({
          gameType,
          stackDepth: stackDepth.toString(),
          position: pos,
          scenario,
        });

        const res = await authedFetch(`/api/training/preflop-ranges?${params}`);
        const data = await res.json().catch(() => null);
        if (requestRef.current !== requestId) return;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Request failed (${res.status})`);
        }

        if (data.success && data.range) {
          if (isCompare) {
            setCompareData(data.range.gridData || null);
            setCompareStats(data.range.stats || null);
            setCompareActions(Array.isArray(data.range.actions) ? data.range.actions : []);
          } else {
            setRangeData(data.range.gridData || null);
            setStats(data.range.stats || null);
            setActions(Array.isArray(data.range.actions) ? data.range.actions : []);
            setProvenance(data.range.provenance || null);
          }
        }
      } catch (err) {
        console.warn('[PreflopCharts] Fetch error:', err);
        if (!isCompare && requestRef.current === requestId) {
          setRangeError(err?.message || 'Reference range unavailable.');
        }
      } finally {
        if (requestRef.current === requestId) {
          if (isCompare) setLoadingCompare(false);
          else setLoading(false);
        }
      }
    },
    [gameType, stackDepth, scenario]
  );

  // Fetch primary range on filter change
  useEffect(() => {
    fetchRange(position);
  }, [position, fetchRange]);

  // Fetch compare range
  useEffect(() => {
    if (compareMode) {
      fetchRange(comparePosition, true);
    }
  }, [comparePosition, compareMode, fetchRange]);

  // Reset compare when turning off
  useEffect(() => {
    if (!compareMode) {
      setCompareData(null);
      setCompareStats(null);
    }
  }, [compareMode]);

  return (
    <>
      <Head>
        <title>Preflop Reference Charts | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Browse the authored Smarter.Poker 6-max cash 100BB preflop reference corpus by position and supported scenario."
        />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* ●●● Header ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
        <BottomSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          title="How Preflop Charts Work"
          subtitle="Authored 6-max cash 100BB teaching references"
        >
          <div style={{ padding: '0 4px', color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              Each Chart Shows An Authored Teaching Mix For One Supported
              6-Max Cash 100BB Reference Spot. Highlighted Cells Show Raise,
              Call, Or Fold Frequencies In That Reference.
            </p>
            <p>
              <strong style={{ color: 'var(--sp-accent-cyan)' }}>RFI</strong>
              Charts Show Your First-In Raising Range.
              <strong style={{ color: 'var(--sp-accent-purple)' }}> Vs RFI</strong>
              Charts Show How To Respond To An Opener.
              <strong style={{ color: 'var(--sp-accent-green)' }}> 3-Bet</strong>
              Charts Show 3-Bet Ranges When Facing An Open.
            </p>
            <p>
              These Charts Are Not Provenance-Sealed Solver Exports. No Solver
              Binary Checksum, Tree Identity, Or Source Artifact Is Attached,
              So They Must Be Used As Authored Study References Rather Than
              Solver-Exact GTO Truth.
            </p>
          </div>
        </BottomSheet>

        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ← Training
            </button>
            <button
              onClick={() => setInfoOpen(true)}
              aria-label="How Preflop Charts work"
              style={{
                background: 'rgba(0,212,255,0.10)',
                border: '1px solid rgba(0,212,255,0.30)',
                color: 'var(--sp-accent-cyan)',
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              How It Works
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Preflop Charts
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-accent-cyan)',
                background: 'rgba(0,212,255,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(0,212,255,0.2)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              PHASE 17
            </span>
          </div>

          {/* ●●● Filters ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <div data-pills-row style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)',
                color: '#fff',
              }}
            >
              ● Cash 6-Max · 100BB Only
            </span>
          </div>

          {/* Scenario + Stack */}
          <div data-pills-row style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Scenario:
              </span>
              {SCENARIOS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => {
                    if (s.value !== 'rfi' && !allowed) {
                      showUpgradeModal();
                      return;
                    }
                    selectScenario(s.value);
                  }}
                  title={s.desc}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.15s',
                    background:
                      scenario === s.value ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
                    color: scenario === s.value ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Stack:
              </span>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(0,212,255,0.2)',
                  color: 'var(--sp-accent-cyan)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                100BB
              </span>
            </div>
          </div>
        </div>

        {/* ●●● Main Content ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
        <div style={{ padding: '20px 24px' }}>
          <div
            role="note"
            style={{
              maxWidth: 700,
              margin: '0 auto 18px',
              padding: '12px 15px',
              border: '1px solid rgba(251,191,36,0.28)',
              borderRadius: 10,
              color: 'var(--sp-fg-muted)',
              background: 'rgba(120,53,15,0.12)',
              fontSize: 11,
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: '#fbd38d' }}>Authored Reference · Not Solver-Exact</strong>
            <br />
            {provenance?.disclosure ||
              'This 6-Max Cash 100BB teaching corpus has no attached solver checksum, tree identity, or audited source artifact.'}
          </div>

          {rangeError && (
            <div
              role="alert"
              style={{
                maxWidth: 700,
                margin: '0 auto 18px',
                padding: '11px 14px',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 9,
                color: 'var(--sp-accent-red)',
                background: 'rgba(127,29,29,0.12)',
                fontSize: 12,
              }}
            >
              {rangeError}
            </div>
          )}

          {/* Position Selector + Compare Toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginRight: 4,
                }}
              >
                {scenario === 'bb_defense' ? 'Opener:' : 'Position:'}
              </span>
              {displayedPositions.map((pos) => (
                <button
                  key={pos}
                  onClick={() => selectPosition(pos)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 'none',
                    transition: 'all 0.2s',
                    background:
                      position === pos
                        ? 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), #7c3aed)'
                        : 'rgba(255,255,255,0.06)',
                    color: position === pos ? '#fff' : 'var(--sp-fg-muted)',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Compare Toggle */}
            <button
              onClick={() => {
                if (!compareMode && !allowed) {
                  showUpgradeModal();
                  return;
                }
                setCompareMode(!compareMode);
                if (!compareMode && comparePosition === position) {
                  const alt = displayedPositions.find((p) => p !== position);
                  if (alt) setComparePosition(alt);
                }
              }}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                border: compareMode
                  ? '1px solid rgba(0,212,255,0.4)'
                  : '1px solid rgba(255,255,255,0.1)',
                background: compareMode ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)',
                color: compareMode ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-muted)',
              }}
            >
              {compareMode ? '✕ Close Compare' : '⇄ Compare Positions'}
            </button>
          </div>

          {/* Compare position selector */}
          <AnimatePresence>
            {compareMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', marginBottom: 16 }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '10px 14px',
                    background: 'rgba(124,58,237,0.08)',
                    borderRadius: 10,
                    border: '1px solid rgba(124,58,237,0.2)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--sp-accent-purple)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginRight: 4,
                    }}
                  >
                    Compare With:
                  </span>
                  {displayedPositions
                    .filter((p) => p !== position)
                    .map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setComparePosition(pos)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: 'none',
                          transition: 'all 0.15s',
                          background:
                            comparePosition === pos
                              ? 'linear-gradient(135deg, #7c3aed, rgba(var(--sp-accent-purple-rgb), 1))'
                              : 'rgba(255,255,255,0.06)',
                          color: comparePosition === pos ? '#fff' : 'var(--sp-fg-muted)',
                          fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}
                      >
                        {pos}
                      </button>
                    ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ●●● Grid(s) + Stats ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'flex-start',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {/* Primary Range */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--sp-accent-cyan)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  marginBottom: 8,
                  padding: '4px 12px',
                  background: 'rgba(0,212,255,0.1)',
                  borderRadius: 6,
                  border: '1px solid rgba(0,212,255,0.2)',
                }}
              >
                {scenario === 'bb_defense' ? `BB vs ${position}` : position} - {stackDepth}BB
              </div>

              {loading ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      border: '3px solid rgba(0,212,255,0.2)',
                      borderTop: '3px solid #00d4ff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto',
                    }}
                  />
                  <p style={{ color: 'var(--sp-fg-dim)', fontSize: 12, marginTop: 8 }}>Loading Range...</p>
                  <style>{`
                    @keyframes spin {
                      to {
                        transform: rotate(360deg);
                      }
                    }
                  `}</style>
                </div>
              ) : rangeData ? (
                <motion.div
                  key={`${position}-${scenario}-${stackDepth}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: MOTION.standard }}
                >
                  <RangeGrid
                    gridData={rangeData}
                    actions={actions}
                    cellSize={compareMode ? 'clamp(20px, 6vw, 28px)' : 'clamp(21px, 6.5vw, 34px)'}
                    colorMode="action"
                  />
                </motion.div>
              ) : (
                <div
                  style={{
                    padding: 60,
                    textAlign: 'center',
                    color: 'var(--sp-fg-faint)',
                    fontSize: 13,
                  }}
                >
                  No Range Data Available For This Configuration
                </div>
              )}
            </div>

            {/* Compare Range */}
            <AnimatePresence>
              {compareMode && (
                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--sp-accent-purple)',
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      marginBottom: 8,
                      padding: '4px 12px',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: 6,
                      border: '1px solid rgba(168,85,247,0.2)',
                    }}
                  >
                    {scenario === 'bb_defense' ? `BB vs ${comparePosition}` : comparePosition} -{' '}
                    {stackDepth}BB
                  </div>

                  {loadingCompare ? (
                    <div style={{ padding: 60, textAlign: 'center' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          border: '3px solid rgba(168,85,247,0.2)',
                          borderTop: '3px solid #a855f7',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                          margin: '0 auto',
                        }}
                      />
                    </div>
                  ) : compareData ? (
                    <RangeGrid
                      gridData={compareData}
                      actions={compareActions}
                      cellSize={'clamp(20px, 6vw, 28px)'}
                      colorMode="action"
                    />
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats Sidebar */}
            <PreflopChartStats
              stats={stats}
              position={scenario === 'bb_defense' ? `BB vs ${position}` : position}
              scenario={scenario}
              actions={actions}
            />

            {/* Compare Stats */}
            {compareMode && compareStats && (
              <PreflopChartStats
                stats={compareStats}
                position={scenario === 'bb_defense' ? `BB vs ${comparePosition}` : comparePosition}
                scenario={scenario}
                actions={compareActions}
              />
            )}
          </div>

          {/* ●●● Scenario Description ●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <div
            style={{
              marginTop: 24,
              padding: '14px 18px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)',
              maxWidth: 700,
              margin: '24px auto 0',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 6,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              About This Chart
            </div>
            <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
              {scenario === 'rfi' && (
                <>
                  Open-Raising Range (RFI) Shows Which Hands To Raise With When Folded To You In
                  This Position. Pure Raise (100%) Hands Are Always Opened. Mixed Frequency Hands
                  Are Sometimes Raised, Sometimes Folded In This Authored 100BB Reference Mix.
                </>
              )}
              {scenario === 'vs3bet' && (
                <>
                  Shows How To React When You Open-Raise And Face A 3-Bet. High-Equity Hands 4-Bet,
                  Medium-Equity Hands Flat Call, And The Rest Fold. Mixed Frequencies Are Common -
                  Use Them As Study References, Not Solver-Exact Prescriptions.
                </>
              )}
              {scenario === 'bb_defense' && (
                <>
                  BB Defense Range Against An Open-Raise From The Selected Position. Wider Defense
                  Ranges Apply Against Late Position Opens (BTN, CO) And Tighter Ranges Vs Early
                  Position (UTG). Includes Both Call And 3-Bet Frequencies.
                </>
              )}
            </p>
            <div style={{ height: 20 }} />
          </div>
        </div>
      </div>
      <VIPGateModal 
        visible={upgradeModalVisible}
        onClose={hideUpgradeModal}
        featureName="Advanced Preflop Charts"
      />
      <ConnectionToast />
    </>
  );
}
