/**
 * CUSTOM SOLVE — Configure & Query Custom GTO Spots
 * ═══════════════════════════════════════════════════════════════════════════
 * Configure positions, stack depth, and board cards, then query the authored
 * preflop reference service or an audited exact root decision when available.
 *
 * Route: /hub/training/custom-solve
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-3 — hex sweep batch 4: literals routed to --sp-* tokens
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch } from '../../../src/lib/authUtils';
import { createBoundedTrainingFetch } from '../../../src/lib/training/boundedTrainingFetch';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../src/lib/training/horseBrainTrainingAdapter';

const trainingFetch = createBoundedTrainingFetch(authedFetch);

const PREVIEW_HERO_CARDS_BY_VARIANT = {
  nlh: ['As', 'Kd'],
  plo4: ['As', 'Ks', 'Qh', 'Jh'],
  plo5: ['As', 'Ks', 'Qh', 'Jh', 'Td'],
  plo6: ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'],
  plo8: ['As', 'Ks', 'Qh', 'Jh'],
};

const HEATMAP_HAND_CLASSES_BY_VARIANT = {
  nlh: [
    { label: 'AA', cards: ['As', 'Ah'] },
    { label: 'KK', cards: ['Ks', 'Kh'] },
    { label: 'AKs', cards: ['As', 'Ks'] },
    { label: 'AQs', cards: ['As', 'Qs'] },
    { label: 'KQs', cards: ['Ks', 'Qs'] },
    { label: 'JTs', cards: ['Js', 'Ts'] },
    { label: '98s', cards: ['9s', '8s'] },
    { label: '77', cards: ['7s', '7h'] },
  ],
  plo4: [
    { label: 'AAKKds', cards: ['As', 'Ks', 'Ah', 'Kh'] },
    { label: 'AKQJds', cards: ['As', 'Qs', 'Kh', 'Jh'] },
    { label: 'KQT9ds', cards: ['Ks', 'Ts', 'Qh', '9h'] },
    { label: 'J987ds', cards: ['Js', '8s', '9h', '7h'] },
  ],
  plo5: [
    { label: 'AAKKds', cards: ['As', 'Ks', 'Ah', 'Kh', 'Qd'] },
    { label: 'AKQJds', cards: ['As', 'Qs', 'Kh', 'Jh', 'Td'] },
    { label: 'KQT9ds', cards: ['Ks', 'Ts', 'Qh', '9h', '8d'] },
    { label: 'J987ds', cards: ['Js', '8s', '9h', '7h', '6d'] },
  ],
  plo6: [
    { label: 'AAKKds', cards: ['As', 'Ks', 'Ah', 'Kh', 'Qd', 'Jd'] },
    { label: 'AKQJds', cards: ['As', 'Qs', 'Kh', 'Jh', 'Td', '9d'] },
    { label: 'KQT9ds', cards: ['Ks', 'Ts', 'Qh', '9h', '8d', '7d'] },
    { label: 'J987ds', cards: ['Js', '8s', '9h', '7h', '6d', '5d'] },
  ],
  plo8: [
    { label: 'AA23ds', cards: ['As', '2s', 'Ah', '3h'] },
    { label: 'AAK2ds', cards: ['As', '2s', 'Ah', 'Kh'] },
    { label: 'A234ds', cards: ['As', '3s', '2h', '4h'] },
    { label: 'AKQJds', cards: ['As', 'Qs', 'Kh', 'Jh'] },
  ],
};

// TRAIN-CSS-MOTION-ADOPT-11 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const PREFLOP_RFI_POSITIONS = POSITIONS.filter((position) => position !== 'BB');

const ALL_CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const ALL_CARD_SUITS = [
  { s: 'h', symbol: '♥', color: 'var(--sp-accent-red)' },
  { s: 'd', symbol: '♦', color: 'var(--sp-accent-blue)' },
  { s: 'c', symbol: '♣', color: 'var(--sp-accent-green)' },
  { s: 's', symbol: '♠', color: 'var(--sp-fg-muted)' },
];

function preflopHandCombos(hand) {
  if (hand?.length === 2) return 6;
  if (hand?.endsWith('s')) return 4;
  if (hand?.endsWith('o')) return 12;
  return 0;
}

// HARDENED: Deterministic hash for stable runout values (no flickering)
function BoardCardSelector({ boardCards, setBoardCards }) {
  const [selectorOpen, setSelectorOpen] = useState(null); // index to fill (0-4)
  const usedCards = new Set(boardCards.filter(Boolean));

  const pickCard = (card) => {
    if (selectorOpen === null) return;
    const updated = [...boardCards];
    updated[selectorOpen] = card;
    setBoardCards(updated);
    // Auto-advance to next empty slot
    const next = updated.findIndex((c, i) => i > selectorOpen && !c);
    setSelectorOpen(next >= 0 ? next : null);
  };

  const clearCard = (idx) => {
    const updated = [...boardCards];
    updated[idx] = null;
    // Clear downstream cards
    for (let i = idx; i < 5; i++) updated[i] = null;
    setBoardCards(updated);
  };

  const slotLabels = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--sp-fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
          padding: '0 4px',
        }}
      >
        Board Cards (Optional)
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {slotLabels.map((label, i) => {
          const card = boardCards[i];
          const isActive = selectorOpen === i;
          const suit = card ? ALL_CARD_SUITS.find((s) => s.s === card[1]) : null;
          return (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginBottom: 2 }}>{label}</div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => (card ? clearCard(i) : setSelectorOpen(isActive ? null : i))}
                style={{
                  width: 44,
                  height: 60,
                  borderRadius: 8,
                  border: `2px solid ${isActive ? 'var(--sp-accent-cyan)' : card ? suit?.color || 'var(--sp-fg-dim)' : 'rgba(255,255,255,0.08)'}`,
                  background: card
                    ? 'rgba(255,255,255,0.06)'
                    : isActive
                      ? 'rgba(0,212,255,0.05)'
                      : 'rgba(0,0,0,0.2)',
                  color: card ? 'var(--sp-fg)' : 'var(--sp-fg-faint)',
                  fontSize: card ? 14 : 20,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0,
                }}
              >
                {card ? (
                  <>
                    <span>{card[0]}</span>
                    <span style={{ color: suit?.color, fontSize: 12 }}>{suit?.symbol}</span>
                  </>
                ) : (
                  '+'
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Card Picker */}
      <AnimatePresence>
        {selectorOpen !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: 'hidden',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: 10,
            }}
          >
            {ALL_CARD_SUITS.map((suit) => (
              <div key={suit.s} style={{ display: 'flex', gap: 3, marginBottom: 3 }}>
                {ALL_CARD_RANKS.map((rank) => {
                  const card = rank + suit.s;
                  const used = usedCards.has(card);
                  return (
                    <button
                      key={card}
                      disabled={used}
                      onClick={() => pickCard(card)}
                      style={{
                        flex: '1 1 auto',
                        padding: '4px 2px',
                        borderRadius: 4,
                        border: 'none',
                        cursor: used ? 'not-allowed' : 'pointer',
                        background: used ? 'rgba(255,255,255,0.02)' : `${suit.color}15`,
                        color: used ? '#333' : suit.color,
                        fontSize: 12,
                        fontWeight: 700,
                        opacity: used ? 0.3 : 1,
                      }}
                    >
                      {rank}
                    </button>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE GRID VISUAL — Interactive 13×13 Grid for Solver Results
// ═══════════════════════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════════════════════
// RESULT DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

function SolveResult({ heroPos, villainPos, config, result }) {
  if (!result) return null;
  const isPreflopRfi = (config.boardCards?.filter(Boolean).length || 0) < 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '16px',
        borderRadius: 14,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(0,212,255,0.12)',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)' }}>
            {isPreflopRfi ? `${heroPos} First-In RFI` : `${heroPos} Vs ${villainPos}`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
            6-Max Cash · {config.stackDepth}BB · {isPreflopRfi ? 'Authored First-In Reference' : 'Board Reference Query'}
          </div>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sp-accent-green)',
          }}
        >
          {result.authorityLabel || 'Audited Solver Result'}
        </div>
      </div>

      {result.message && (
        <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {result.message}
        </div>
      )}

      {/* Strategy */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--sp-fg-dim)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          Action Frequency Reference
        </div>
        {(Array.isArray(result?.actions) ? result.actions : []).map((a) => (
          <div
            key={a.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background:
                  a.action === 'Raise'
                    ? 'var(--sp-accent-red)'
                    : a.action === 'Call'
                      ? 'var(--sp-accent-green)'
                      : a.action === 'Fold'
                        ? 'var(--sp-fg-dim)'
                        : 'var(--sp-accent-blue)',
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)', minWidth: 50 }}>
              {a.action}
            </div>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${a.freq}%` }}
                transition={{ duration: MOTION.slow }}
                style={{
                  height: '100%',
                  borderRadius: 3,
                  background:
                    a.action === 'Raise'
                      ? 'var(--sp-accent-red)'
                      : a.action === 'Call'
                        ? 'var(--sp-accent-green)'
                        : a.action === 'Fold'
                          ? 'var(--sp-fg-dim)'
                          : 'var(--sp-accent-blue)',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-muted)',
                minWidth: 36,
                textAlign: 'right',
              }}
            >
              {a.freq}%
            </div>
          </div>
        ))}
      </div>

      {/* Range Text */}
      {result.range && (
        <div
          style={{
            padding: '10px',
            borderRadius: 8,
            marginTop: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--sp-fg-dim)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Hands ({result.rangePercent || 0}% Of Combos)
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--sp-fg-muted)',
              lineHeight: 1.5,
              fontFamily: "'Courier New', monospace",
            }}
          >
            {result.range}
          </div>
        </div>
      )}

    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function CustomSolvePage() {
  const router = useRouter();
  useTrainingBus('custom-solve');

  // Configuration state
  const [heroPos, setHeroPos] = useState('BTN');
  const [villainPos, setVillainPos] = useState('BB');
  const [stackDepth, setStackDepth] = useState(100);
  const [boardCards, setBoardCards] = useState([null, null, null, null, null]);
  const [activeVariant, setActiveVariant] = useState('nlh');

  // Results state
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const selectedBoard = useMemo(() => boardCards.filter(Boolean), [boardCards]);
  const selectedBoardCount = selectedBoard.length;
  const isPreflopRfi = selectedBoardCount < 3;

  const effectiveBrainStreet = useMemo(() => {
    if (selectedBoardCount >= 5) return 'river';
    if (selectedBoardCount === 4) return 'turn';
    if (selectedBoardCount === 3) return 'flop';
    return 'flop';
  }, [selectedBoardCount]);

  const effectiveBrainBoard = useMemo(() => {
    if (selectedBoardCount >= 5) return selectedBoard.slice(0, 5);
    if (selectedBoardCount === 4) return selectedBoard.slice(0, 4);
    if (selectedBoardCount === 3) return selectedBoard.slice(0, 3);
    return ['Qc', '8d', '3c'];
  }, [selectedBoard, selectedBoardCount]);

  const brainEval = useMemo(() => {
    const heroCards = PREVIEW_HERO_CARDS_BY_VARIANT[activeVariant] || PREVIEW_HERO_CARDS_BY_VARIANT.nlh;
    return evaluateTrainingSpotWithHorseBrain({
      variant: activeVariant,
      street: effectiveBrainStreet,
      heroCards,
      boardCards: effectiveBrainBoard,
      heroPosition: heroPos,
      villainPosition: heroPos === villainPos ? (heroPos === 'BB' ? 'BTN' : 'BB') : villainPos,
      pot: 6.5,
      toCall: 0,
      effectiveStackBb: stackDepth,
    });
  }, [activeVariant, effectiveBrainStreet, effectiveBrainBoard, heroPos, villainPos, stackDepth]);

  const heatmapCells = useMemo(() => {
    const handList = HEATMAP_HAND_CLASSES_BY_VARIANT[activeVariant] || HEATMAP_HAND_CLASSES_BY_VARIANT.nlh;
    return handList.map((handEntry) => {
      const cellEval = evaluateTrainingSpotWithHorseBrain({
        variant: activeVariant,
        street: effectiveBrainStreet,
        heroCards: handEntry.cards,
        boardCards: effectiveBrainBoard,
        heroPosition: heroPos,
        villainPosition: heroPos === villainPos ? (heroPos === 'BB' ? 'BTN' : 'BB') : villainPos,
        pot: 6.5,
        toCall: 0,
        effectiveStackBb: stackDepth,
      });
      const bestOptionId = cellEval.correctAnswer;
      const topFreq = Number(cellEval.gtoFrequencies?.[bestOptionId] || 0);
      const topEv = Number(cellEval.actionEVs?.[bestOptionId] || 0);
      return {
        label: handEntry.label,
        cards: handEntry.cards,
        recommendedAction: cellEval.correctAnswerText,
        recommendedId: bestOptionId,
        frequencyPct: topFreq,
        evBb: topEv,
        handScore: cellEval.handScore,
        category: cellEval.madeHandCategory,
        frequencies: cellEval.gtoFrequencies || {},
        options: cellEval.options || [],
      };
    });
  }, [activeVariant, effectiveBrainStreet, effectiveBrainBoard, heroPos, villainPos, stackDepth]);

  const arenaLaunchHref = useMemo(
    () =>
      buildCustomTrainingArenaHref(
        {
          gameId: activeVariant === 'nlh' ? 'cash-002' : 'cash-005',
          variant: activeVariant,
          street: effectiveBrainStreet,
          position: heroPos,
          stackDepth,
          questionsCount: 10,
        },
        'custom-solve',
      ),
    [activeVariant, effectiveBrainStreet, heroPos, stackDepth],
  );

  useEffect(() => {
    if (!isPreflopRfi) return;
    if (!PREFLOP_RFI_POSITIONS.includes(heroPos)) setHeroPos('BTN');
    if (stackDepth !== 100) setStackDepth(100);
  }, [heroPos, isPreflopRfi, stackDepth]);

  const selectHeroPosition = useCallback((nextPosition) => {
    setHeroPos(nextPosition);
    setVillainPos((currentVillain) => (
      currentVillain === nextPosition
        ? POSITIONS.find((candidate) => candidate !== nextPosition) || 'BB'
        : currentVillain
    ));
  }, []);

  const handleSolve = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const selectedBoard = boardCards.filter(Boolean);
      if (selectedBoard.length < 3) {
        const res = await trainingFetch(
          `/api/training/preflop-ranges?gameType=cash_6max&stackDepth=100&position=${heroPos}&scenario=rfi`,
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.range) throw new Error(data?.error || `Request failed (${res.status})`);

        const comboWeightedTotals = {};
        let totalCombos = 0;
        Object.entries(data.range.gridData || {}).forEach(([hand, entry]) => {
          const combos = preflopHandCombos(hand);
          totalCombos += combos;
          if (!entry) {
            comboWeightedTotals.Fold = (comboWeightedTotals.Fold || 0) + (100 * combos);
            return;
          }
          Object.entries(entry).forEach(([actionName, frequency]) => {
            comboWeightedTotals[actionName] =
              (comboWeightedTotals[actionName] || 0) + ((Number(frequency) || 0) * combos);
          });
        });
        setResult({
          source: data.range.source,
          isEstimate: true,
          authorityLabel: 'Authored Reference',
          message: `${data.range.spotLabel}. ${data.range.provenance?.disclosure || 'This is an authored reference, not a solver-exact export.'}`,
          actions: Object.entries(comboWeightedTotals).map(([actionName, total]) => ({
            action: actionName,
            freq: Math.round(total / Math.max(1, totalCombos)),
          })),
          range: null,
          rangePercent: data.range.stats?.rfiPct || 0,
        });
      } else {
        const res = await trainingFetch('/api/training/solver-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heroPosition: heroPos,
            villainPosition: villainPos,
            board: selectedBoard,
            stackDepth,
            gameType: 'cash',
            street: selectedBoard.length === 3 ? 'flop' : selectedBoard.length === 4 ? 'turn' : 'river',
          }),
        });
        const data = await res.json().catch(() => null);
        const hasExactSolverResult = data?.source === 'training_solver_artifact_catalog'
          && data?.matchQuality === 'exact_root_node'
          && data?.solution?.isEstimate === false
          && data?.solution?.actions
          && typeof data.solution.actions === 'object';
        if (!res.ok || !hasExactSolverResult) {
          throw new Error(data?.error || 'No audited exact solver result is available for this decision.');
        }
        setResult({
          source: data.source,
          isEstimate: false,
          authorityLabel: 'Audited Solver Result',
          message: data.message,
          actions: Object.entries(data.solution.actions).map(([actionName, frequency]) => ({
            action: actionName.charAt(0).toUpperCase() + actionName.slice(1),
            freq: Math.round(Number(frequency) || 0),
          })),
          range: null,
          rangePercent: 0,
        });
      }
    } catch (e) {
      console.warn('[App] Handled exception:', e?.message || e);
      setError(e?.message || 'Solve failed. Please try again.');
    }

    setLoading(false);
  }, [heroPos, villainPos, stackDepth, boardCards]);

  return (
    <>
      <SEOHead
        title="Custom GTO Spot & Preflop Reference"
        description="Configure Poker Stack Depth, Table Positions, And Action Lines To Query Audited 100BB Preflop Reference Ranges And Postflop Board Data On Smarter.Poker."
        canonical="/hub/training/custom-solve"
      />

      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
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
            &larr;
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Custom Solve</div>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
              Query Authored Preflop And Audited Root-Node Data
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Supported corpus — variants are not offered as no-op controls. */}
          <div style={{ marginBottom: 16, padding: '12px 14px', border: '1px solid rgba(0,212,255,.16)', background: 'rgba(0,212,255,.04)' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Supported Corpus
            </div>
            <div style={{ color: 'var(--sp-fg)', fontSize: 13, fontWeight: 800 }}>6-Max Cash</div>
            <div style={{ color: 'var(--sp-fg-dim)', fontSize: 12, marginTop: 3 }}>
              {isPreflopRfi
                ? 'Before A Complete Flop Is Selected, This Tool Queries Only The Authored 100BB First-In RFI Reference. No Opponent Exists In A First-In Decision.'
                : 'Postflop Requests Apply Hero, Opponent, Effective Stack, And Every Concrete Board Card. Only An Audited Exact Root Decision Is Displayed. If No Exact Match Exists, The Request Fails Closed And No Modeled Result Is Shown.'}
            </div>
          </div>

          {/* Positions */}
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                  padding: '0 4px',
                }}
              >
                Hero Position
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {(isPreflopRfi ? PREFLOP_RFI_POSITIONS : POSITIONS).map((p) => (
                  <motion.button
                    key={p}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => selectHeroPosition(p)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      flex: '1 1 auto',
                      minWidth: 36,
                      border: `1px solid ${heroPos === p ? 'rgba(34,197,94,0.3)' : 'transparent'}`,
                      background: heroPos === p ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.2)',
                      color: heroPos === p ? 'var(--sp-accent-green)' : 'var(--sp-fg-dim)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {p}
                  </motion.button>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--sp-fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                  padding: '0 4px',
                }}
              >
                {isPreflopRfi ? 'Opponent' : 'Villain Position'}
              </div>
              {isPreflopRfi ? (
                <div
                  data-preflop-opponent="not-applicable"
                  style={{
                    minHeight: 31,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 9px',
                    border: '1px solid rgba(148,163,184,0.16)',
                    borderRadius: 6,
                    color: 'var(--sp-fg-dim)',
                    background: 'rgba(15,23,42,0.34)',
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  Not Applicable For A First-In RFI Node
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {POSITIONS.filter((p) => p !== heroPos).map((p) => (
                    <motion.button
                      key={p}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setVillainPos(p)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        flex: '1 1 auto',
                        minWidth: 36,
                        border: `1px solid ${villainPos === p ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                        background: villainPos === p ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.2)',
                        color: villainPos === p ? 'var(--sp-accent-red)' : 'var(--sp-fg-dim)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {p}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stack Depth */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--sp-fg-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              Effective Stack Depth
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[20, 40, 60, 100, 150, 200].map((sd) => (
                <motion.button
                  key={sd}
                  whileTap={isPreflopRfi && sd !== 100 ? undefined : { scale: 0.95 }}
                  onClick={() => {
                    if (!isPreflopRfi || sd === 100) setStackDepth(sd);
                  }}
                  disabled={isPreflopRfi && sd !== 100}
                  aria-label={`${sd} big blinds${isPreflopRfi && sd !== 100 ? ' unavailable for the first-in reference' : ''}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${stackDepth === sd ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                    background: stackDepth === sd ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                    color: stackDepth === sd ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                    opacity: isPreflopRfi && sd !== 100 ? 0.35 : 1,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isPreflopRfi && sd !== 100 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sd}bb
                </motion.button>
              ))}
            </div>
          </div>

          {/* Board Card Selector */}
          <BoardCardSelector boardCards={boardCards} setBoardCards={setBoardCards} />

          {/* Solve Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSolve}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              border: '1px solid rgba(0,212,255,0.3)',
              background: loading
                ? 'rgba(0,212,255,0.03)'
                : 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(139,92,246,0.08) 100%)',
              color: 'var(--sp-accent-cyan)',
              fontSize: 14,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 20,
            }}
          >
            {loading ? (
              <span
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid transparent',
                    borderTopColor: 'var(--sp-accent-cyan)',
                    borderRadius: '50%',
                  }}
                />
                Solving...
              </span>
            ) : (
              isPreflopRfi ? 'Load First-In RFI Reference' : 'Solve This Postflop Spot'
            )}
          </motion.button>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  marginBottom: 16,
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: 'var(--sp-accent-red)',
                  fontSize: 12,
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          {result && (
            <SolveResult
              heroPos={heroPos}
              villainPos={villainPos}
              config={{ stackDepth, boardCards }}
              result={result}
            />
          )}

          {/* Hand-Class Action Frequency Matrix / Heatmap */}
          <div
            data-custom-solve-heatmap="true"
            style={{
              marginTop: 18,
              marginBottom: 18,
              padding: 18,
              borderRadius: 14,
              border: '1px solid rgba(56, 189, 248, 0.35)',
              background: 'rgba(15, 23, 42, 0.72)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#7dd3fc', textTransform: 'uppercase' }}>
                  Hand-Class Action Frequency Matrix &amp; Heatmap
                </div>
                <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
                  Live Horse Brain Action Frequencies On [{effectiveBrainBoard.join(' ')}] At {stackDepth}BB ({activeVariant.toUpperCase()})
                </div>
              </div>
              <button
                type="button"
                data-lock-spot-drill-cta="true"
                onClick={() => router.push(arenaLaunchHref)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(52, 211, 153, 0.5)',
                  background: 'rgba(16, 185, 129, 0.18)',
                  color: '#6ee7b7',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Lock Spot &amp; Drill 10 Hands On Club Arena Felt →
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
              }}
            >
              {heatmapCells.map((cell) => {
                const isAggressive = /^b|^r|allin/i.test(String(cell.recommendedId || ''));
                return (
                  <div
                    key={cell.label}
                    data-heatmap-hand-cell={cell.label}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: isAggressive
                        ? '1px solid rgba(248, 113, 113, 0.4)'
                        : '1px solid rgba(52, 211, 153, 0.35)',
                      background: isAggressive
                        ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(15, 23, 42, 0.85))'
                        : 'linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(15, 23, 42, 0.85))',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
                        {cell.label}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: isAggressive ? '#fca5a5' : '#6ee7b7',
                        }}
                      >
                        {cell.frequencyPct}%
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
                      {cell.recommendedAction}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      Score {cell.handScore}/100 · EV {cell.evBb >= 0 ? `+${cell.evBb}` : cell.evBb} BB
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4-Variant Horse Brain Spot Preview & 1-Click Club Arena Launcher */}
          {brainEval && (
            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainEval.engineModule}
              data-recommended-action={brainEval.correctAnswer}
              data-active-variant={activeVariant}
              data-hero-position={heroPos}
              style={{
                padding: 18,
                borderRadius: 14,
                border: '1px solid rgba(56, 189, 248, 0.4)',
                background: 'rgba(2, 6, 23, 0.78)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900, color: '#79e6ff', textTransform: 'uppercase' }}>
                  Horse Brain 4-Variant Spot Preview
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
                  Engine: {brainEval.engineModule} | Recommended: {brainEval.correctAnswerText}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>
                    Variant
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={activeVariant === v}
                        onClick={() => setActiveVariant(v)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: activeVariant === v ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.16)',
                          background: activeVariant === v ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
                          color: activeVariant === v ? '#7dd3fc' : '#cbd5e1',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>
                {brainEval.explanation}
              </p>

              <button
                type="button"
                data-launch-club-arena-cta="true"
                onClick={() => router.push(arenaLaunchHref)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #38bdf8',
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Practice Target Spot In Club Arena →
              </button>
            </div>
          )}
        </div>
      </div>
      <HubPageSummary page="training-custom-solve" />
    </>
  );
}
