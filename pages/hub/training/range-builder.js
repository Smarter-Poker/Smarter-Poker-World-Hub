/**
 * RANGE BUILDER — Authored Preflop Reference Practice
 * ═══════════════════════════════════════════════════════════════════════════
 * Users construct a 6-max cash RFI range at 100BB, then compare it with an
 * explicitly non-authoritative authored reference. This page never presents
 * the static corpus as a verified solver artifact.
 *
 * Route: /hub/training/range-builder
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-MOBILE-ADOPT-12 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH4-14 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-TOKENS-BATCH5-47 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-38 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-14 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
// TRAIN-CSS-MOTION-ADOPT-22 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

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

function saveSession(payload) {
  savePracticeSession('range-builder', payload)
    .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];
const REFERENCE_VERSION = 'range-builder-rfi-100bb-v1';
const REFERENCE_REQUEST = Object.freeze({
  gameType: 'cash_6max',
  scenario: 'rfi',
  stackDepth: 100,
});

export function isExactAuthoredReferenceResponse(data, position) {
  const expectedReferenceId = `cash_6max:rfi:${position}:100bb`;
  return data?.success === true
    && data?.reference?.id === expectedReferenceId
    && data?.reference?.position === position
    && data?.reference?.gameType === REFERENCE_REQUEST.gameType
    && data?.reference?.scenario === REFERENCE_REQUEST.scenario
    && Number(data?.reference?.stackDepth) === REFERENCE_REQUEST.stackDepth
    && data?.provenance?.source === 'static_authored_preflop_reference'
    && data?.provenance?.authority === 'authored_reference'
    && data?.provenance?.version === REFERENCE_VERSION
    && data?.provenance?.referenceId === expectedReferenceId
    && data?.provenance?.authoritative === false
    && data?.provenance?.solverVerified === false
    && data?.provenance?.exactEVAvailable === false
    && data?.provenance?.practiceOnly === true;
}

function getHandNotation(row, col) {
  if (row === col) return `${RANKS[row]}${RANKS[col]}`;
  if (row < col) return `${RANKS[row]}${RANKS[col]}s`;
  return `${RANKS[col]}${RANKS[row]}o`;
}

function getCombos(hand) {
  if (hand.length === 2) return 6;
  if (hand.endsWith('s')) return 4;
  return 12;
}




const DIFF_COLORS = {
  match: 'var(--sp-accent-green)',
  extra: 'var(--sp-accent-red)',
  omitted: 'var(--sp-accent-amber)',
  partial: 'var(--sp-accent-orange)',
  neutral: 'var(--sp-bg-elev2)',
};

// Grade letters: green and red only at the real ends of the scale; ice and
// silver between (no amber or orange ink under #SMARTERDESIGN).
const GRADE_COLORS = {
  'A+': '#5ee08a',
  A: '#5ee08a',
  'A-': '#5ee08a',
  'B+': '#86daff',
  B: '#86daff',
  'B-': '#86daff',
  'C+': '#bdd0e2',
  C: '#bdd0e2',
  'C-': '#bdd0e2',
  'D+': '#ff7a86',
  D: '#ff7a86',
  'D-': '#ff7a86',
  F: '#ff7a86',
};

// ═══════════════════════════════════════════════════════════════════════════
// RANGE BUILDER GRID CELL
// ═══════════════════════════════════════════════════════════════════════════

function BuilderCell({ hand, isSelected, isDiffMode, diffResult, onToggle }) {
  const [hovered, setHovered] = useState(false);

  const bgColor = isDiffMode
    ? DIFF_COLORS[diffResult] || DIFF_COLORS.neutral
    : isSelected
      ? 'var(--sp-accent-green)'
      : 'var(--sp-bg-elev2)';

  const opacity = isDiffMode ? (diffResult !== 'neutral' ? 0.85 : 0.2) : isSelected ? 0.8 : 0.3;

  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');
  const lit = isSelected || (isDiffMode && diffResult !== 'neutral');

  return (
    <div
      role={isDiffMode ? undefined : 'button'}
      tabIndex={isDiffMode ? -1 : 0}
      aria-pressed={isDiffMode ? undefined : isSelected}
      onClick={() => !isDiffMode && onToggle(hand)}
      onKeyDown={(event) => { if (!isDiffMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle(hand); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={at.gridCell}
      data-lit={lit ? 'true' : undefined}
      data-hover={hovered && !isDiffMode ? 'true' : undefined}
      data-diff={isDiffMode ? 'true' : undefined}
      style={{ backgroundColor: bgColor, opacity }}
    >
      {hand}
      {/* Hand type indicator */}
      {!isDiffMode && (isPair || isSuited) && (
        <span className={at.gridMark} style={{ background: isPair ? '#86daff' : 'var(--sp-accent-blue)' }} aria-hidden />
      )}
      {/* Diff tooltip */}
      {isDiffMode && hovered && diffResult !== 'neutral' && (
        <span className={at.gridTip}>
          {diffResult === 'match' && 'Matches The Authored Reference'}
          {diffResult === 'extra' && 'Selected Outside The Authored Reference'}
          {diffResult === 'omitted' && 'Included In The Authored Reference'}
          {diffResult === 'partial' && 'Mixed In The Authored Reference'}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function RangeBuilder() {
  const router = useRouter();
  useTrainingBus('range-builder', {
    practiceOnly: true,
    authority: 'authored_reference',
  });

  // Spot selection
  const [position, setPosition] = useState('BTN');

  // Selection state
  const [selectedHands, setSelectedHands] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // 'add' or 'remove'

  // Grading state
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Horse Brain Calibration Panel state




  // Clear result when position changes
  useEffect(() => {
    setResult(null);
    setError('');
  }, [position]);

  // Toggle hand
  const toggleHand = useCallback((hand) => {
    setSelectedHands((prev) => {
      const next = new Set(prev);
      if (next.has(hand)) next.delete(hand);
      else next.add(hand);
      return next;
    });
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setSelectedHands(new Set());
    setResult(null);
    setError('');
  }, []);

  // Select all pairs
  const selectCategory = useCallback((category) => {
    setSelectedHands((prev) => {
      const next = new Set(prev);
      for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
          const hand = getHandNotation(r, c);
          if (category === 'pairs' && r === c) next.add(hand);
          if (category === 'suited' && r < c) next.add(hand);
          if (category === 'broadways') {
            const r1 = RANKS[r],
              r2 = RANKS[c];
            if (['A', 'K', 'Q', 'J', 'T'].includes(r1) && ['A', 'K', 'Q', 'J', 'T'].includes(r2)) {
              next.add(hand);
            }
          }
        }
      }
      return next;
    });
  }, []);

  // Computed stats
  const selectionStats = useMemo(() => {
    let totalCombos = 0;
    let pairs = 0,
      suited = 0,
      offsuit = 0;
    selectedHands.forEach((hand) => {
      const combos = getCombos(hand);
      totalCombos += combos;
      if (hand.length === 2) pairs += combos;
      else if (hand.endsWith('s')) suited += combos;
      else offsuit += combos;
    });
    return {
      handCount: selectedHands.size,
      totalCombos,
      pct: ((totalCombos / 1326) * 100).toFixed(1),
      pairs,
      suited,
      offsuit,
    };
  }, [selectedHands]);

  // Submit for grading
  const submitRange = useCallback(async () => {
    if (selectedHands.size === 0) return;
    setGrading(true);
    setError('');
    try {
      const res = await authedFetch('/api/training/grade-range', {
        method: 'POST',
        body: JSON.stringify({
          ...REFERENCE_REQUEST,
          position,
          selectedHands: Array.from(selectedHands),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Reference comparison failed (${res.status})`);
      }
      if (!isExactAuthoredReferenceResponse(data, position)) {
        throw new Error('The authored reference identity could not be verified. No result was recorded.');
      }

      setResult(data);
      const passed = Number(data.comparison?.score) >= 80;
      saveSession({
        game_id: 'range-builder',
        hands_played: 1,
        accuracy: Number(data.comparison?.score) || 0,
        correct_answers: passed ? 1 : 0,
        total_questions: 1,
        context: {
          authority: data.provenance.authority,
          referenceId: data.reference.id,
          practiceOnly: true,
        },
      });
    } catch (err) {
      console.warn('[RangeBuilder] Grade error:', err);
      setResult(null);
      setError(err?.message || 'Unable to compare this range right now.');
    } finally {
      setGrading(false);
    }
  }, [selectedHands, position]);

  // Build grid
  const gridRows = useMemo(() => {
    const rows = [];
    for (let r = 0; r < 13; r++) {
      const cells = [];
      for (let c = 0; c < 13; c++) {
        cells.push(getHandNotation(r, c));
      }
      rows.push(cells);
    }
    return rows;
  }, []);

  const isDiffMode = !!result;
  const gridDiff = result?.diff?.gridDiff || {};

  return (
    <>
      <SEOHead
        title="Interactive 13x13 Range Builder"
        description="Construct Custom 13x13 Preflop Poker Hand Ranges At 100BB And Grade Your Matrix Recall Accuracy Against Reference Baselines On Smarter.Poker."
        canonical="/hub/training/range-builder"
      />

      <div className={`sp-training-tool sp-training-tool--range-builder ${at.shell}`}>
        <TrainingPageHead slug="training-range-builder" note="Authored Static Reference • 6-Max Cash RFI • 100BB • Practice Only • Not Solver Verified" />

        <div className={at.page}>
          {/* Position Selector */}
          <section className={`sd-panel ${at.panel}`} aria-labelledby="rb-position-label">
            <span id="rb-position-label" className={at.label}>Build RFI Range For</span>
            <div data-pills-row className={at.segmented}>
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className="sd-button"
                  aria-label={`Select position ${pos}`}
                  aria-pressed={position === pos}
                  onClick={() => {
                    setPosition(pos);
                    setSelectedHands(new Set());
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
          </section>

          {/* ─── Main Content ───────────────────────────────────────── */}
          <div className="sp-range-builder-layout">
            {/* Grid */}
            <div className="sp-range-builder-matrix">
            <section className={`sd-panel ${at.panel}`} aria-labelledby="rb-grid-title">
              <h2 id="rb-grid-title" className={at.subTitle}>
                {isDiffMode ? 'Results: Authored Reference Diff' : 'Select Hands To Include In Your Range'}
              </h2>
              <div className={at.grid} data-allow-small="true">
                {gridRows.flat().map((hand) => (
                  <BuilderCell
                    key={hand}
                    hand={hand}
                    isSelected={selectedHands.has(hand)}
                    isDiffMode={isDiffMode}
                    diffResult={gridDiff[hand]}
                    onToggle={toggleHand}
                  />
                ))}
              </div>

              {/* Quick select buttons */}
              {!isDiffMode && (
                <div className={at.chips}>
                  <button type="button" className={`sd-button ${at.compact}`} onClick={() => selectCategory('pairs')}>
                    + All Pairs
                  </button>
                  <button type="button" className={`sd-button ${at.compact}`} onClick={() => selectCategory('broadways')}>
                    + Broadways
                  </button>
                  <button type="button" className={`sd-button ${at.compact}`} onClick={() => selectCategory('suited')}>
                    + All Suited
                  </button>
                  <button type="button" className={`sd-button ${at.compact}`} onClick={clearAll}>
                    Clear All
                  </button>
                </div>
              )}
            </section>
            </div>

            {/* Sidebar */}
            <div className="sp-range-builder-sidebar">
              <AnimatePresence mode="wait">
                {result ? (
                  /* ─── Grade Results ─────────────────── */
                  <motion.section
                    key="results"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`sd-panel ${at.panel}`}
                    aria-label="Reference Comparison"
                  >
                    {/* Authored-reference comparison */}
                    <div className={at.metric}>
                      <strong className={at.bigFigure} style={{ color: GRADE_COLORS[result.comparison?.letter] || '#f2f7ff' }}>
                        {result.comparison?.letter}
                      </strong>
                      <span className={at.label}>Reference Agreement: <strong className={at.white}>{result.comparison?.score}%</strong></span>
                      <span className={at.small}>Reference Coverage: {result.comparison?.coverage}%</span>
                    </div>

                    <div role="note" className={at.note}>
                      <strong>Authored Practice Reference</strong>
                      <br />
                      {result.reference?.label}
                      <br />
                      Version {result.provenance?.version} • Not Solver Verified • No Exact EV
                    </div>

                    <hr className={at.rule} />
                    <h3 className={at.eyebrow}>Breakdown</h3>
                    <dl className={at.kv}>
                      <StatRow label="Matched" value={result.stats?.matchedCount} />
                      <StatRow label="Omitted" value={result.stats?.omittedCount} />
                      <StatRow label="Extra" value={result.stats?.extraCount} />
                      <StatRow label="Mixed" value={result.stats?.mixedCount} />
                      <StatRow label="Your Combos" value={result.stats?.userCombos} />
                      <StatRow label="Reference Combos" value={result.stats?.totalReferenceCombos} />
                      <StatRow label="Overlap" value={result.stats?.overlapCombos} tone="ice" />
                    </dl>

                    <hr className={at.rule} />
                    <h3 className={at.eyebrow}>Legend</h3>
                    <div className={at.legend}>
                      <LegendItem color={DIFF_COLORS.match} label="Match - Included In Both Ranges" />
                      <LegendItem color={DIFF_COLORS.omitted} label="Omitted - Included In The Authored Reference" />
                      <LegendItem color={DIFF_COLORS.extra} label="Extra - Outside The Authored Reference" />
                      <LegendItem color={DIFF_COLORS.partial} label="Partial - Mixed Authored Frequency" />
                    </div>

                    <button
                      type="button"
                      className="sd-button"
                      onClick={() => {
                        setResult(null);
                        setSelectedHands(new Set());
                        setError('');
                      }}
                    >
                      Try Again
                    </button>
                  </motion.section>
                ) : (
                  /* ─── Build Mode Sidebar ───────────── */
                  <motion.section
                    key="build"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`sd-panel ${at.panel}`}
                    aria-labelledby="rb-range-title"
                  >
                    <h2 id="rb-range-title" className={at.eyebrow}>{position} RFI Range</h2>

                    {/* Range % */}
                    <div className={at.metric}>
                      <strong className={at.bigFigure}>{selectionStats.pct}%</strong>
                      <span className={at.small}>{selectionStats.totalCombos} / 1326 Combos</span>
                    </div>
                    <div className={at.track} role="progressbar" aria-label="Range Size" aria-valuenow={Number(selectionStats.pct)} aria-valuemin={0} aria-valuemax={100}>
                      <motion.div
                        className={at.fill}
                        animate={{ width: `${selectionStats.pct}%` }}
                        transition={{ duration: MOTION.standard }}
                      />
                    </div>

                    {/* Category breakdown */}
                    <dl className={at.kv}>
                      <StatRow label="Hands" value={selectionStats.handCount} />
                      <StatRow label="Pairs" value={`${selectionStats.pairs} Combos`} tone="ice" />
                      <StatRow label="Suited" value={`${selectionStats.suited} Combos`} tone="ice" />
                      <StatRow label="Offsuit" value={`${selectionStats.offsuit} Combos`} />
                    </dl>

                    {/* Instructions */}
                    <p className={at.small}>
                      Click Hands To Toggle On/Off. Build A {position} Open-Raising Range, Then Compare
                      It With The Authored 6-Max Cash 100BB Practice Reference. This Is Not A Verified
                      Solver Result.
                    </p>

                    {error && (
                      <div role="alert" aria-live="assertive" className={at.error}>
                        {error}
                      </div>
                    )}

                    <button
                      type="button"
                      className={`sd-button sd-primary ${at.primary}`}
                      onClick={submitRange}
                      disabled={selectedHands.size === 0 || grading}
                    >
                      {grading ? 'Comparing...' : 'Compare To Reference'}
                    </button>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <ConnectionToast />
      <HubPageSummary page="training-range-builder" />
    </>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────

function StatRow({ label, value, tone }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone === 'ice' ? at.ice : undefined}>{value}</dd>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className={at.legendItem}>
      <span className={at.legendSwatch} style={{ background: color }} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
