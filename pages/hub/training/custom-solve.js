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

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import at from '../../../src/styles/training/analysis-tools.module.css';
import cs from '../../../src/styles/training/custom-solve.module.css';
const trainingFetch = createBoundedTrainingFetch(authedFetch);


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
    <div className={at.field}>
      <span className={at.label}>Board Cards (Optional)</span>
      <div className={cs.boardSlots}>
        {slotLabels.map((label, i) => {
          const card = boardCards[i];
          const isActive = selectorOpen === i;
          const suit = card ? ALL_CARD_SUITS.find((s) => s.s === card[1]) : null;
          return (
            <div key={i} className={cs.boardSlot}>
              <span>{label}</span>
              <button
                type="button"
                className={at.slot}
                data-filled={card ? 'true' : undefined}
                data-active={isActive ? 'true' : undefined}
                aria-label={card ? `Clear ${label} (${card})` : `Pick ${label}`}
                onClick={() => (card ? clearCard(i) : setSelectorOpen(isActive ? null : i))}
              >
                {card ? (
                  <span className={cs.slotCard}>
                    <span>{card[0]}</span>
                    <span className={cs.suitMark} data-suit={suit?.s}>{suit?.symbol}</span>
                  </span>
                ) : (
                  <span className={at.slotPlus} aria-hidden>+</span>
                )}
              </button>
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
            className={`sd-panel ${at.panel} ${at.tight}`}
            style={{ overflow: 'hidden' }}
            role="group"
            aria-label={`Pick ${slotLabels[selectorOpen]}`}
          >
            <div className={at.pickerHead}>
              <span className={at.eyebrow}>Pick {slotLabels[selectorOpen]}</span>
              <button type="button" className={`sd-button ${at.close}`} onClick={() => setSelectorOpen(null)} aria-label="Close Card Picker">
                ✕
              </button>
            </div>
            {ALL_CARD_SUITS.map((suit) => (
              <div key={suit.s} className={cs.rankRow}>
                {ALL_CARD_RANKS.map((rank) => {
                  const card = rank + suit.s;
                  const used = usedCards.has(card);
                  return (
                    <button
                      key={card}
                      type="button"
                      data-allow-small="true"
                      data-training-raw-control="true"
                      className={cs.rankPick}
                      data-suit={suit.s}
                      disabled={used}
                      aria-label={`${rank}${suit.symbol}`}
                      onClick={() => pickCard(card)}
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
  const actionFill = (action) => (
    action === 'Raise'
      ? 'var(--sp-accent-red)'
      : action === 'Call'
        ? 'var(--sp-accent-green)'
        : action === 'Fold'
          ? 'var(--sp-fg-dim)'
          : 'var(--sp-accent-blue)'
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`sd-panel ${at.panel}`}
      aria-labelledby="cs-result-title"
    >
      <div className={at.panelHead}>
        <div>
          <h2 id="cs-result-title" className={at.sectionTitle}>
            {isPreflopRfi ? `${heroPos} First-In RFI` : `${heroPos} Vs ${villainPos}`}
          </h2>
          <p className={at.small}>
            6-Max Cash · {config.stackDepth}BB · {isPreflopRfi ? 'Authored First-In Reference' : 'Board Reference Query'}
          </p>
        </div>
        <span className={at.tag}>{result.authorityLabel || 'Audited Solver Result'}</span>
      </div>

      {result.message && <p className={at.copy}>{result.message}</p>}

      {/* Strategy */}
      <div className={at.field}>
        <h3 className={at.label}>Action Frequency Reference</h3>
        {(Array.isArray(result?.actions) ? result.actions : []).map((a) => (
          <div key={a.action} className={cs.actionRow}>
            <span className={cs.actionSwatch} style={{ background: actionFill(a.action) }} aria-hidden />
            <span>{a.action}</span>
            <div className={at.track}>
              <motion.div
                className={at.fill}
                initial={{ width: 0 }}
                animate={{ width: `${a.freq}%` }}
                transition={{ duration: MOTION.slow }}
                style={{ background: actionFill(a.action) }}
              />
            </div>
            <span>{a.freq}%</span>
          </div>
        ))}
      </div>

      {/* Range Text */}
      {result.range && (
        <div className={at.helpBlock}>
          <h3 className={at.label}>Hands ({result.rangePercent || 0}% Of Combos)</h3>
          <p className={cs.rangeText}>{result.range}</p>
        </div>
      )}
    </motion.section>
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

      <div className={at.shell}>
        <TrainingPageHead slug="training-custom-solve" note="Query Authored Preflop And Audited Root-Node Data" />

        <div className={at.page}>
          {/* Supported corpus — variants are not offered as no-op controls. */}
          <section className={`sd-panel ${at.panel} ${at.tight}`} aria-labelledby="cs-corpus-title">
            <h2 id="cs-corpus-title" className={at.label}>Supported Corpus</h2>
            <strong className={at.subTitle}>6-Max Cash</strong>
            <p className={at.small}>
              {isPreflopRfi
                ? 'Before A Complete Flop Is Selected, This Tool Queries Only The Authored 100BB First-In RFI Reference. No Opponent Exists In A First-In Decision.'
                : 'Postflop Requests Apply Hero, Opponent, Effective Stack, And Every Concrete Board Card. Only An Audited Exact Root Decision Is Displayed. If No Exact Match Exists, The Request Fails Closed And No Modeled Result Is Shown.'}
            </p>
          </section>

          <section className={`sd-panel ${at.panel}`} aria-label="Spot Setup">
            {/* Positions */}
            <div className={at.field}>
              <span className={at.label}>Hero Position</span>
              <div className={at.segmented} role="group" aria-label="Hero Position">
                {(isPreflopRfi ? PREFLOP_RFI_POSITIONS : POSITIONS).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="sd-button"
                    aria-pressed={heroPos === p}
                    onClick={() => selectHeroPosition(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className={at.field}>
              <span className={at.label}>{isPreflopRfi ? 'Opponent' : 'Villain Position'}</span>
              {isPreflopRfi ? (
                <p data-preflop-opponent="not-applicable" className={at.note}>
                  Not Applicable For A First-In RFI Node
                </p>
              ) : (
                <div className={at.segmented} role="group" aria-label="Villain Position">
                  {POSITIONS.filter((p) => p !== heroPos).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="sd-button"
                      aria-pressed={villainPos === p}
                      onClick={() => setVillainPos(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stack Depth */}
            <div className={at.field}>
              <span className={at.label}>Effective Stack Depth</span>
              <div className={at.segmented} role="group" aria-label="Effective Stack Depth">
                {[20, 40, 60, 100, 150, 200].map((sd) => (
                  <button
                    key={sd}
                    type="button"
                    className="sd-button"
                    aria-pressed={stackDepth === sd}
                    onClick={() => {
                      if (!isPreflopRfi || sd === 100) setStackDepth(sd);
                    }}
                    disabled={isPreflopRfi && sd !== 100}
                    aria-label={`${sd} big blinds${isPreflopRfi && sd !== 100 ? ' unavailable for the first-in reference' : ''}`}
                  >
                    {sd}BB
                  </button>
                ))}
              </div>
            </div>

            {/* Board Card Selector */}
            <BoardCardSelector boardCards={boardCards} setBoardCards={setBoardCards} />

            {/* Solve Button */}
            <motion.button
              type="button"
              className={`sd-button sd-primary ${at.primary}`}
              whileTap={{ scale: 0.98 }}
              onClick={handleSolve}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className={at.spinner} style={{ inlineSize: 16, blockSize: 16, borderWidth: 2 }} aria-hidden />
                  Solving...
                </>
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
                  role="alert"
                  className={at.error}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

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
          <section data-custom-solve-heatmap="true" className={`sd-panel ${at.panel}`} aria-labelledby="cs-heatmap-title">
            <div>
              <h2 id="cs-heatmap-title" className={at.sectionTitle}>
                Hand-Class Action Frequency Matrix &amp; Heatmap
              </h2>
              <p className={at.small}>
                Live Horse Brain Action Frequencies On [{effectiveBrainBoard.join(' ')}] At {stackDepth}BB ({activeVariant.toUpperCase()})
              </p>
            </div>
            <button
              type="button"
              className="sd-button sd-primary"
              data-lock-spot-drill-cta="true"
              onClick={() => router.push(arenaLaunchHref)}
            >
              Lock Spot &amp; Drill 10 Hands On Club Arena Felt →
            </button>

            <div className={cs.heatLegend} aria-hidden>
              <span><i className={cs.heatSwatch} style={{ background: 'rgba(239, 68, 68, 0.6)' }} />Bet / Raise Lines</span>
              <span><i className={cs.heatSwatch} style={{ background: 'rgba(16, 185, 129, 0.6)' }} />Check / Call Lines</span>
            </div>

            <div className={cs.heatGrid}>
              {heatmapCells.map((cell) => {
                const isAggressive = /^b|^r|allin/i.test(String(cell.recommendedId || ''));
                return (
                  <div
                    key={cell.label}
                    data-heatmap-hand-cell={cell.label}
                    className={cs.heatCell}
                    data-tone={isAggressive ? 'aggressive' : 'passive'}
                  >
                    <div className={cs.heatTop}>
                      <span>{cell.label}</span>
                      <span>{cell.frequencyPct}%</span>
                    </div>
                    <div className={cs.heatAction}>{cell.recommendedAction}</div>
                    <div className={cs.heatMeta}>
                      Score {cell.handScore}/100 · EV {cell.evBb >= 0 ? `+${cell.evBb}` : cell.evBb} BB
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      <HubPageSummary page="training-custom-solve" />
    </>
  );
}
