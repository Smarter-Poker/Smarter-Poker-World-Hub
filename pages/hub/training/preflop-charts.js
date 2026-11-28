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
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../../../src/components/training/RangeGrid';
import PreflopChartStats from '../../../src/components/training/PreflopChartStats';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import useVIPGate from '../../../src/hooks/useVIPGate';
import VIPGateModal from '../../../src/components/ui/VIPGateModal';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
// TRAIN-CSS-MOTION-ADOPT-18 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-CSS-MOBILE-ADOPT-2 — adoption of mobile data-attr patterns from TRAIN-CSS-MOBILE-1

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// CONSTANTS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SUPPORTED_GAME_TYPE = 'cash_6max';
const SUPPORTED_STACK_DEPTH = 100;

const CALIBRATION_HERO_CARDS_BY_VARIANT = Object.freeze({
  nlh: ['As', 'Ks'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
});

const CALIBRATION_VARIANTS = Object.freeze(['nlh', 'plo4', 'plo5', 'plo6', 'plo8']);
const CALIBRATION_POSITIONS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const CALIBRATION_STACKS = Object.freeze([20, 40, 100]);

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

  // Horse Brain Calibration Panel state

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
      <SEOHead
        title="6-Max 100BB Preflop Range Browser"
        description="Browse And Compare Authored 6-Max 100BB Cash Game Preflop Ranges By Table Position, Raise-First-In, And Three-Bet Scenario On Smarter.Poker."
        canonical="/hub/training/preflop-charts"
      />

      <div className={at.shell}>
        <TrainingPageHead
          slug="training-range-browser"
          note="Cash 6-Max · 100BB Only"
          helpContent={(
            <>
              <p>
                Each Chart Shows An Authored Teaching Mix For One Supported
                6-Max Cash 100BB Reference Spot. Highlighted Cells Show Raise,
                Call, Or Fold Frequencies In That Reference.
              </p>
              <div className={at.helpBlock}>
                <h3>How Preflop Charts Work</h3>
                <p>
                  <strong>RFI</strong> Charts Show Your First-In Raising Range.
                  <strong> Vs RFI</strong> Charts Show How To Respond To An Opener.
                  <strong> 3-Bet</strong> Charts Show 3-Bet Ranges When Facing An Open.
                </p>
                <p>
                  These Charts Are Not Provenance-Sealed Solver Exports. No Solver
                  Binary Checksum, Tree Identity, Or Source Artifact Is Attached,
                  So They Must Be Used As Authored Study References Rather Than
                  Solver-Exact GTO Truth.
                </p>
              </div>
            </>
          )}
        />

        <div className={at.page}>
          {/* ●●● Filters ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <section className={`sd-panel ${at.panel}`} aria-label="Chart Filters">
            <div className={at.field}>
              <span className={at.label}>Scenario</span>
              <div data-pills-row className={at.chips}>
                {SCENARIOS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="sd-button"
                    aria-pressed={scenario === s.value}
                    onClick={() => {
                      if (s.value !== 'rfi' && !allowed) {
                        showUpgradeModal();
                        return;
                      }
                      selectScenario(s.value);
                    }}
                    title={s.desc}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={at.panelHead}>
              <span className={at.label}>Stack Depth</span>
              <span className={at.tag}>100BB</span>
            </div>

            <hr className={at.rule} />

            <div className={at.field}>
              <span className={at.label}>{scenario === 'bb_defense' ? 'Opener' : 'Position'}</span>
              <div className={at.segmented}>
                {displayedPositions.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className="sd-button"
                    aria-pressed={position === pos}
                    onClick={() => selectPosition(pos)}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Compare Toggle */}
            <button
              type="button"
              className="sd-button"
              aria-pressed={compareMode}
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
            >
              {compareMode ? '✕ Close Compare' : '⇄ Compare Positions'}
            </button>

            {/* Compare position selector */}
            <AnimatePresence>
              {compareMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={at.field}
                  style={{ overflow: 'hidden' }}
                >
                  <span className={at.label}>Compare With</span>
                  <div className={at.segmented}>
                    {displayedPositions
                      .filter((p) => p !== position)
                      .map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          className="sd-button"
                          aria-pressed={comparePosition === pos}
                          onClick={() => setComparePosition(pos)}
                        >
                          {pos}
                        </button>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ●●● Main Content ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <div role="note" className={`sd-panel ${at.note}`} style={{ borderLeft: 0 }}>
            <strong>Authored Reference · Not Solver-Exact</strong>
            <br />
            {provenance?.disclosure ||
              'This 6-Max Cash 100BB teaching corpus has no attached solver checksum, tree identity, or audited source artifact.'}
          </div>

          {rangeError && (
            <div role="alert" className={at.error}>
              {rangeError}
            </div>
          )}

          {/* ●●● Grid(s) + Stats ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <section className={`sd-panel ${at.panel} ${at.rangeHost}`} aria-labelledby="pc-primary-title">
            <div className={at.panelHead}>
              <h2 id="pc-primary-title" className={at.subTitle}>
                {scenario === 'bb_defense' ? `BB Vs ${position}` : position} - {stackDepth}BB
              </h2>
            </div>

            {loading ? (
              <div className={at.empty} role="status">
                <span className={at.spinner} aria-hidden />
                <span className={at.small}>Loading Range...</span>
              </div>
            ) : rangeData ? (
              <motion.div
                key={`${position}-${scenario}-${stackDepth}`}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: MOTION.standard }}
                className={at.gridBox}
              >
                <RangeGrid
                  gridData={rangeData}
                  actions={actions}
                  cellSize={compareMode ? 'clamp(20px, 6vw, 28px)' : 'clamp(21px, 6.5vw, 34px)'}
                  colorMode="action"
                />
              </motion.div>
            ) : (
              <div className={at.empty}>
                <span className={at.copy}>No Range Data Available For This Configuration</span>
              </div>
            )}
          </section>

          {/* Compare Range */}
          <AnimatePresence>
            {compareMode && (
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`sd-panel ${at.panel} ${at.rangeHost}`}
                aria-labelledby="pc-compare-title"
              >
                <h2 id="pc-compare-title" className={at.subTitle}>
                  {scenario === 'bb_defense' ? `BB Vs ${comparePosition}` : comparePosition} - {stackDepth}BB
                </h2>

                {loadingCompare ? (
                  <div className={at.empty} role="status">
                    <span className={at.spinner} aria-hidden />
                  </div>
                ) : compareData ? (
                  <div className={at.gridBox}>
                    <RangeGrid
                      gridData={compareData}
                      actions={compareActions}
                      cellSize={'clamp(20px, 6vw, 28px)'}
                      colorMode="action"
                    />
                  </div>
                ) : null}
              </motion.section>
            )}
          </AnimatePresence>

          {/* Stats */}
          <div className={compareMode && compareStats ? `${at.cardsGrid} ${at.cardsGrid2}` : undefined}>
            <PreflopChartStats
              stats={stats}
              position={scenario === 'bb_defense' ? `BB Vs ${position}` : position}
              scenario={scenario}
              actions={actions}
            />

            {/* Compare Stats */}
            {compareMode && compareStats && (
              <PreflopChartStats
                stats={compareStats}
                position={scenario === 'bb_defense' ? `BB Vs ${comparePosition}` : comparePosition}
                scenario={scenario}
                actions={compareActions}
              />
            )}
          </div>

          {/* ●●● Scenario Description ●●●●●●●●●●●●●●●●●●●●●●●●●●●● */}
          <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="pc-about-title">
            <h2 id="pc-about-title" className={at.sectionTitle}>About This Chart</h2>
            <p className={at.copy}>
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
          </section>
        </div>
      </div>
      <VIPGateModal
        visible={upgradeModalVisible}
        onClose={hideUpgradeModal}
        featureName="Advanced Preflop Charts"
      />
      <ConnectionToast />
      <HubPageSummary page="training-preflop-charts" />
    </>
  );
}
