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
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { savePracticeSession } from '../../../src/lib/training/practiceSession';
import ConnectionToast from '../../../src/components/training/ConnectionToast';

// TRAIN-CSS-MOTION-ADOPT-22 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

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

const GRADE_COLORS = {
  'A+': 'var(--sp-accent-green)',
  A: 'var(--sp-accent-green)',
  'A-': 'var(--sp-accent-green)',
  'B+': 'var(--sp-accent-blue)',
  B: 'var(--sp-accent-blue)',
  'B-': 'var(--sp-accent-blue)',
  'C+': 'var(--sp-accent-amber)',
  C: 'var(--sp-accent-amber)',
  'C-': 'var(--sp-accent-amber)',
  'D+': 'var(--sp-accent-orange)',
  D: 'var(--sp-accent-orange)',
  'D-': 'var(--sp-accent-orange)',
  F: 'var(--sp-accent-red)',
};

// ═══════════════════════════════════════════════════════════════════════════
// RANGE BUILDER GRID CELL
// ═══════════════════════════════════════════════════════════════════════════

function BuilderCell({ hand, isSelected, isDiffMode, diffResult, onToggle, size }) {
  const [hovered, setHovered] = useState(false);

  const bgColor = isDiffMode
    ? DIFF_COLORS[diffResult] || DIFF_COLORS.neutral
    : isSelected
      ? 'var(--sp-accent-green)'
      : 'var(--sp-bg-elev2)';

  const opacity = isDiffMode ? (diffResult !== 'neutral' ? 0.85 : 0.2) : isSelected ? 0.8 : 0.3;

  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');

  return (
    <div
      role={isDiffMode ? undefined : 'button'}
      tabIndex={isDiffMode ? -1 : 0}
      aria-pressed={isDiffMode ? undefined : isSelected}
      onClick={() => !isDiffMode && onToggle(hand)}
      onKeyDown={(event) => { if (!isDiffMode && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle(hand); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: typeof size === 'number' ? (size > 28 ? 10 : 8) : 'clamp(7px, 2vw, 10px)',
        fontWeight: 700,
        fontFamily: "'Inter', sans-serif",
        cursor: isDiffMode ? 'default' : 'pointer',
        borderRadius: 2,
        border:
          hovered && !isDiffMode
            ? '2px solid #00d4ff'
            : isSelected && !isDiffMode
              ? '1px solid rgba(34,197,94,0.6)'
              : '1px solid rgba(255,255,255,0.08)',
        backgroundColor: bgColor,
        opacity,
        color: isSelected || (isDiffMode && diffResult !== 'neutral') ? '#fff' : '#555',
        position: 'relative',
        transition: 'all 0.1s ease',
        userSelect: 'none',
      }}
    >
      {hand}
      {/* Hand type indicator */}
      {!isDiffMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: isPair ? 'var(--sp-accent-purple)' : isSuited ? 'var(--sp-accent-blue)' : 'transparent',
            borderRadius: '0 0 2px 2px',
            opacity: 0.5,
          }}
        />
      )}
      {/* Diff tooltip */}
      {isDiffMode && hovered && diffResult !== 'neutral' && (
        <div
          style={{
            position: 'absolute',
            bottom: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            fontSize: 12,
            color: DIFF_COLORS[diffResult],
            fontWeight: 700,
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          {diffResult === 'match' && 'Matches The Authored Reference'}
          {diffResult === 'extra' && 'Selected Outside The Authored Reference'}
          {diffResult === 'omitted' && 'Included In The Authored Reference'}
          {diffResult === 'partial' && 'Mixed In The Authored Reference'}
        </div>
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
      <Head>
        <title>Authored Range Practice | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Build a 6-max cash RFI range at 100BB and compare it with a clearly labeled authored practice reference."
        />
      </Head>

      <div
        className="sp-training-tool sp-training-tool--range-builder"
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div
          className="sp-training-tool-header"
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
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
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-orange-rgb), 1), rgba(var(--sp-accent-red-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Range Builder
            </h1>
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-accent-orange)',
                background: 'rgba(249,115,22,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(249,115,22,0.2)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              PHASE 18
            </span>
          </div>

          {/* Position Selector */}
          <div data-pills-row
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--sp-fg-dim)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginRight: 4,
              }}
            >
              Build RFI Range For:
            </span>
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                aria-label={`Select position ${pos}`}
                aria-pressed={position === pos}
                onClick={() => {
                  setPosition(pos);
                  setSelectedHands(new Set());
                }}
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
                      ? 'linear-gradient(135deg, rgba(var(--sp-accent-orange-rgb), 1), rgba(var(--sp-accent-red-rgb), 1))'
                      : 'rgba(255,255,255,0.06)',
                  color: position === pos ? '#fff' : 'var(--sp-fg-muted)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          <div
            role="note"
            style={{
              maxWidth: 680,
              margin: '12px auto 0',
              padding: '8px 12px',
              border: '1px solid rgba(251,191,36,0.28)',
              borderRadius: 8,
              background: 'rgba(251,191,36,0.07)',
              color: 'var(--sp-fg-muted)',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.5,
              letterSpacing: 0.7,
            }}
          >
            AUTHORED STATIC REFERENCE • 6-MAX CASH RFI • 100BB • PRACTICE ONLY • NOT SOLVER VERIFIED
          </div>
        </div>

        {/* ─── Main Content ───────────────────────────────────────── */}
        <div
          className="sp-range-builder-layout"
          style={{
            padding: '20px 24px',
            display: 'flex',
            gap: 20,
            justifyContent: 'center',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          {/* Grid */}
          <div className="sp-range-builder-matrix">
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textAlign: 'center',
                marginBottom: 8,
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              {isDiffMode ? 'RESULTS - AUTHORED REFERENCE DIFF' : 'SELECT HANDS TO INCLUDE IN YOUR RANGE'}
            </div>
            <div data-allow-small="true"
              style={{
                display: 'inline-grid',
                gridTemplateColumns: `repeat(13, clamp(21px, 6.5vw, 34px))`,
                gap: 1,
                background: 'rgba(255,255,255,0.03)',
                padding: 4,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {gridRows.flat().map((hand) => (
                <BuilderCell
                  key={hand}
                  hand={hand}
                  isSelected={selectedHands.has(hand)}
                  isDiffMode={isDiffMode}
                  diffResult={gridDiff[hand]}
                  onToggle={toggleHand}
                  size={'clamp(21px, 6.5vw, 34px)'}
                />
              ))}
            </div>

            {/* Quick select buttons */}
            {!isDiffMode && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'center' }}>
                <button onClick={() => selectCategory('pairs')} style={quickBtnStyle}>
                  + All Pairs
                </button>
                <button onClick={() => selectCategory('broadways')} style={quickBtnStyle}>
                  + Broadways
                </button>
                <button onClick={() => selectCategory('suited')} style={quickBtnStyle}>
                  + All Suited
                </button>
                <button
                  onClick={clearAll}
                  style={{ ...quickBtnStyle, color: 'var(--sp-accent-red)', borderColor: 'rgba(239,68,68,0.3)' }}
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="sp-range-builder-sidebar" style={{ width: 240, flexShrink: 0 }}>
            <AnimatePresence mode="wait">
              {result ? (
                /* ─── Grade Results ─────────────────── */
                <motion.div
                  key="results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={sidebarStyle}
                >
                  {/* Authored-reference comparison */}
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: 56,
                        fontWeight: 900,
                        color: GRADE_COLORS[result.comparison?.letter] || 'var(--sp-fg)',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        lineHeight: 1,
                        textShadow: `0 0 30px ${GRADE_COLORS[result.comparison?.letter] || '#fff'}40`,
                      }}
                    >
                      {result.comparison?.letter}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--sp-fg-muted)',
                        fontWeight: 600,
                        marginTop: 4,
                      }}
                    >
                      Reference Agreement: {result.comparison?.score}%
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--sp-fg-dim)',
                        marginTop: 2,
                      }}
                    >
                      Reference Coverage: {result.comparison?.coverage}%
                    </div>
                  </div>

                  <div
                    role="note"
                    style={{
                      padding: '8px 10px',
                      border: '1px solid rgba(251,191,36,0.24)',
                      borderRadius: 8,
                      background: 'rgba(251,191,36,0.06)',
                      color: 'var(--sp-fg-muted)',
                      fontSize: 12,
                      lineHeight: 1.5,
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ color: 'var(--sp-accent-amber)' }}>Authored Practice Reference</strong>
                    <br />
                    {result.reference?.label}
                    <br />
                    Version {result.provenance?.version} • Not Solver Verified • No Exact EV
                  </div>

                  <div
                    style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}
                  />

                  {/* Stats */}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sp-fg-dim)',
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    BREAKDOWN
                  </div>
                  <StatRow label="Matched" value={result.stats?.matchedCount} color="#22c55e" />
                  <StatRow label="Omitted" value={result.stats?.omittedCount} color="#fbbf24" />
                  <StatRow label="Extra" value={result.stats?.extraCount} color="#ef4444" />
                  <StatRow label="Mixed" value={result.stats?.mixedCount} color="#f97316" />

                  <div
                    style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}
                  />

                  <StatRow label="Your Combos" value={result.stats?.userCombos} color="#94a3b8" />
                  <StatRow
                    label="Reference Combos"
                    value={result.stats?.totalReferenceCombos}
                    color="#94a3b8"
                  />
                  <StatRow label="Overlap" value={result.stats?.overlapCombos} color="#00d4ff" />

                  {/* Legend */}
                  <div
                    style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--sp-fg-dim)',
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    LEGEND
                  </div>
                  <LegendItem color="#22c55e" label="Match - Included in both ranges" />
                  <LegendItem color="#fbbf24" label="Omitted - Included in the authored reference" />
                  <LegendItem color="#ef4444" label="Extra - Outside the authored reference" />
                  <LegendItem color="#f97316" label="Partial - Mixed authored frequency" />

                  <button
                    onClick={() => {
                      setResult(null);
                      setSelectedHands(new Set());
                      setError('');
                    }}
                    style={{
                      width: '100%',
                      marginTop: 16,
                      padding: '10px 0',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: 'var(--sp-fg-muted)',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Try Again
                  </button>
                </motion.div>
              ) : (
                /* ─── Build Mode Sidebar ───────────── */
                <motion.div
                  key="build"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  style={sidebarStyle}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--sp-accent-orange)',
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      marginBottom: 12,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    {position} RFI RANGE
                  </div>

                  {/* Range % */}
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 900,
                        color: 'var(--sp-fg)',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        lineHeight: 1,
                      }}
                    >
                      {selectionStats.pct}%
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 4, fontWeight: 600 }}>
                      {selectionStats.totalCombos} / 1326 Combos
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        marginTop: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        animate={{ width: `${selectionStats.pct}%` }}
                        transition={{ duration: MOTION.standard }}
                        style={{
                          height: '100%',
                          borderRadius: 3,
                          background: 'linear-gradient(90deg, rgba(var(--sp-accent-orange-rgb), 1), rgba(var(--sp-accent-red-rgb), 1))',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}
                  />

                  {/* Category breakdown */}
                  <StatRow label="Hands" value={selectionStats.handCount} color="#e2e8f0" />
                  <StatRow label="Pairs" value={`${selectionStats.pairs} combos`} color="#a855f7" />
                  <StatRow
                    label="Suited"
                    value={`${selectionStats.suited} combos`}
                    color="#3b82f6"
                  />
                  <StatRow
                    label="Offsuit"
                    value={`${selectionStats.offsuit} combos`}
                    color="#64748b"
                  />

                  <div
                    style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}
                  />

                  {/* Instructions */}
                  <p
                    style={{ fontSize: 12, color: 'var(--sp-fg-faint)', lineHeight: 1.5, margin: '0 0 12px' }}
                  >
                    Click Hands To Toggle On/Off. Build A {position} Open-Raising Range, Then Compare
                    It With The Authored 6-Max Cash 100BB Practice Reference. This Is Not A Verified
                    Solver Result.
                  </p>

                  {error && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      style={{
                        marginBottom: 12,
                        padding: '8px 10px',
                        border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: 8,
                        background: 'rgba(239,68,68,0.08)',
                        color: 'var(--sp-accent-red)',
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: 1.45,
                      }}
                    >
                      {error}
                    </div>
                  )}

                  <button
                    onClick={submitRange}
                    disabled={selectedHands.size === 0 || grading}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      background:
                        selectedHands.size > 0
                          ? 'linear-gradient(135deg, rgba(var(--sp-accent-orange-rgb), 1), rgba(var(--sp-accent-red-rgb), 1))'
                          : 'rgba(255,255,255,0.06)',
                      border: 'none',
                      borderRadius: 10,
                      color: selectedHands.size > 0 ? '#fff' : 'var(--sp-fg-faint)',
                      cursor: selectedHands.size > 0 ? 'pointer' : 'default',
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      transition: 'all 0.2s',
                    }}
                  >
                    {grading ? 'Comparing...' : 'Compare To Reference'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <ConnectionToast />
    </>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────

function StatRow({ label, value, color }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        marginBottom: 4,
        padding: '2px 0',
      }}
    >
      <span style={{ color: 'var(--sp-fg-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>{value}</span>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>{label}</span>
    </div>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────────

const quickBtnStyle = {
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--sp-fg-muted)',
  transition: 'all 0.15s',
};

const sidebarStyle = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 16,
};
