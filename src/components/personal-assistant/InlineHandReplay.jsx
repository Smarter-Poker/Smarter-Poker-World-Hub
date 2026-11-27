/**
 * InlineHandReplay · Embedded street-by-street hand stepper for Personal Assistant / Leak Finder.
 *
 * Adheres to the approved MTT Lobby / Arena Workspace standard:
 *   - #05080c–#0d141c canvas, 1px solid rgba(140, 161, 180, 0.24) crisp hairlines
 *   - Royal blue primary CTAs / active street indicators
 *   - >= 44px tap targets for every street pill in a thumb-zone sticky bottom bar
 *   - Left / Right arrow keyboard navigation (role="tablist", aria-selected)
 *   - Optional touch swipe left/right navigation (>= 48px horizontal threshold with vertical-scroll guard)
 *   - Community board cards, Hero cards, Pot and Stack depth for the active street
 *   - Compact Hero vs Solver verdict at top + explicit strategy-unsupported banner
 *   - Zero block elements inside <button>
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

const STREET_TAB_LABELS = Object.freeze({
  preflop: 'Pre',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
});

const SWIPE_THRESHOLD_PX = 48;

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#4DE0A5', d: '#56D8FF', h: '#FF6B7A', s: '#F1F5FC' };

export function parseCard(cardStr) {
  if (!cardStr || typeof cardStr !== 'string') return null;
  const trimmed = cardStr.trim();
  if (trimmed.length < 2) return null;
  const rank = trimmed.slice(0, -1).toUpperCase().replace(/^T$/, '10');
  const suitChar = trimmed.slice(-1).toLowerCase();
  return {
    rank,
    suit: SUITS[suitChar] || '?',
    color: SUIT_COLORS[suitChar] || '#FFFFFF',
    raw: trimmed,
  };
}

/**
 * Format an action bet/raise amount using unit-aware hand currency context.
 * Shows "X BB" when the hand or action is BB/tournament-denominated,
 * "$X" ONLY when cash USD chips are explicitly confirmed, and plain numeric
 * chips otherwise (never fabricating a "$" sign).
 */
export function formatActionAmount(act, { handIsBb = false, handIsCashUsd = false } = {}) {
  if (!act || typeof act !== 'object') return null;
  if (act.amountBb != null && String(act.amountBb).trim() !== '') {
    return `${act.amountBb} BB`;
  }
  if (act.amountBB != null && String(act.amountBB).trim() !== '') {
    return `${act.amountBB} BB`;
  }
  const rawAmount = act.amount;
  if (rawAmount === null || rawAmount === undefined || String(rawAmount).trim() === '') return null;
  if (typeof rawAmount === 'string') {
    const trimmed = rawAmount.trim();
    if (trimmed.includes('$') || /\bbb\b/i.test(trimmed)) return trimmed;
  }
  const unit = String(act.unit || act.currency || '').trim().toLowerCase();
  if (unit === 'bb' || unit === 'bbs') return `${rawAmount} BB`;
  if (unit === '$' || unit === 'usd') return `$${rawAmount}`;
  if (handIsBb || act.potBeforeBB != null) return `${rawAmount} BB`;
  if (handIsCashUsd) return `$${rawAmount}`;
  return String(rawAmount);
}

function normalizeShareCardCode(card) {
  const raw = typeof card === 'object' && card !== null && card.rank
    ? `${card.rank}${String(card.suit || '')[0] || ''}`
    : String(card || '').trim();
  if (!/^(?:10|[2-9TJQKA])[cdhs]$/i.test(raw)) return null;
  const rank = raw.slice(0, -1).toUpperCase().replace(/^10$/, 'T');
  const suit = raw.slice(-1).toLowerCase();
  return `${rank}${suit}`;
}

/**
 * Build a privacy-safe read-only /share/hand?view=review URL for the replay.
 * Hole cards are strictly omitted unless includeHoleCards === true.
 * Never includes hand IDs, user IDs, or opponent handles.
 */
export function buildReplayShareUrl({
  origin = '',
  street = null,
  position = null,
  board = null,
  heroCards = null,
  stakes = null,
  formatLabel = null,
  includeHoleCards = false,
} = {}) {
  const params = new URLSearchParams();
  params.set('view', 'review');
  params.set('anon', '1');
  const safeStreet = String(street || '').trim().toLowerCase();
  if (STREETS.includes(safeStreet)) params.set('street', safeStreet);
  const safePos = String(position || '').replace(/[^A-Za-z0-9+_-]/g, '').trim().toUpperCase().slice(0, 8);
  if (safePos) params.set('position', safePos);
  const cleanBoard = (Array.isArray(board) ? board : [])
    .map(normalizeShareCardCode)
    .filter(Boolean)
    .filter((code, idx, arr) => arr.indexOf(code) === idx)
    .slice(0, 5);
  if (cleanBoard.length > 0) params.set('board', cleanBoard.join(','));
  if (includeHoleCards === true) {
    const cleanHero = (Array.isArray(heroCards) ? heroCards : [])
      .map(normalizeShareCardCode)
      .filter(Boolean)
      .filter((code, idx, arr) => arr.indexOf(code) === idx)
      .slice(0, 2);
    if (cleanHero.length === 2) params.set('hero', cleanHero.join(','));
  }
  const safeStakes = String(stakes || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (safeStakes) params.set('stakes', safeStakes);
  const safeFormat = String(formatLabel || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (safeFormat) params.set('venue', safeFormat);
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/share/hand?${params.toString()}`;
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

/**
 * Safely normalize a solver frequency into a 0..100 percentage.
 * Converts ratio inputs in (0..1] into (0..100]% and clamps finite percentages into [0, 100].
 * Returns null for nullish, boolean, negative, or non-finite values.
 */
export function normalizeSolverFrequency(raw, { treatOneAsHundred = true } = {}) {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  let pct = num;
  if (num > 0 && num < 1) {
    pct = num * 100;
  } else if (num === 1 && treatOneAsHundred) {
    pct = 100;
  }
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.round(clamped * 10) / 10;
}

/**
 * Build the Hero Action vs Solver Frequency comparison model for an audited street decision.
 * Enforces strict honesty boundaries:
 *   - Returns null whenever strategySupported === false or decision.solverVerified !== true
 *   - Includes evLossBb / evLossLabel ONLY when decision.evLossMeasured === true and finite
 */
export function buildSolverFrequencyComparison(decision, { strategySupported = true } = {}) {
  if (!decision || typeof decision !== 'object') return null;
  if (
    strategySupported === false ||
    decision.strategySupported === false ||
    decision.supported === false ||
    decision.solverVerified !== true
  ) {
    return null;
  }

  const rawOptimal =
    decision.optimalFrequency
    ?? decision.optimalPct
    ?? decision.solverFrequency
    ?? decision.optimal_frequency
    ?? decision.solver_frequency
    ?? null;
  const rawHero =
    decision.selectedFrequency
    ?? decision.heroFrequency
    ?? decision.heroPct
    ?? decision.playerFrequency
    ?? decision.chosenFrequency
    ?? decision.selected_frequency
    ?? null;

  const optimalIsRatio =
    rawOptimal !== null
    && rawOptimal !== undefined
    && rawOptimal !== ''
    && Number.isFinite(Number(rawOptimal))
    && Number(rawOptimal) > 0
    && Number(rawOptimal) <= 1;

  const optimalFrequencyPct = normalizeSolverFrequency(rawOptimal, { treatOneAsHundred: true });
  const heroFrequencyPct = normalizeSolverFrequency(rawHero, {
    treatOneAsHundred: rawOptimal === null || rawOptimal === undefined ? true : optimalIsRatio,
  });

  const rawEvLoss =
    decision.evLossBB
    ?? decision.evLoss
    ?? decision.ev_loss_bb
    ?? decision.ev_loss
    ?? null;
  const hasMeasuredEvLoss =
    decision.evLossMeasured === true
    && rawEvLoss !== null
    && rawEvLoss !== undefined
    && rawEvLoss !== ''
    && typeof rawEvLoss !== 'boolean'
    && Number.isFinite(Number(rawEvLoss));
  const evLossBb = hasMeasuredEvLoss ? Math.abs(Number(rawEvLoss)) : null;

  return {
    heroAction: titleCase(decision.playerAction || decision.player_action || decision.heroAction || 'Recorded'),
    solverAction: titleCase(
      decision.solverAction
      || decision.optimalAction
      || decision.solver_action
      || decision.optimal_action
      || 'Optimal',
    ),
    optimalFrequencyPct,
    heroFrequencyPct,
    evLossBb,
    evLossLabel: evLossBb !== null ? `-${evLossBb.toFixed(2)} BB` : null,
  };
}

function CardBadge({ card, variant = 'board' }) {
  const parsed = parseCard(card);
  if (!parsed) return null;
  const isHero = variant === 'hero';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minWidth: 32,
        height: 36,
        padding: '0 6px',
        borderRadius: 5,
        background: isHero
          ? 'linear-gradient(165deg, #0D1E32 0%, #07111C 72%, #040B13 100%)'
          : 'linear-gradient(165deg, #0A1828 0%, #07111C 72%, #040A11 100%)',
        border: isHero ? '1px solid rgba(86, 216, 255, 0.34)' : '1px solid rgba(140, 161, 180, 0.28)',
        borderTopColor: isHero ? '#56d8ff' : '#aec0d0',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.36)',
        color: parsed.color,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: -0.5,
      }}
      data-card={card}
      data-card-variant={isHero ? 'hero' : 'board'}
    >
      <span>{parsed.rank}</span>
      <span style={{ fontSize: 13 }}>{parsed.suit}</span>
    </span>
  );
}

export default function InlineHandReplay({
  audit = null,
  hand = null,
  streetTimeline = null,
  decisions = null,
  initialStreet = null,
  strategySupported = null,
  declineReason = null,
  className = '',
  style = {},
}) {
  const baseId = useId();
  const resolvedHand = hand || audit?.hand || null;
  const resolvedTimeline = useMemo(() => {
    const raw = Array.isArray(streetTimeline)
      ? streetTimeline
      : Array.isArray(audit?.streetTimeline)
        ? audit.streetTimeline
        : [];
    return raw.filter((st) => st && typeof st === 'object');
  }, [streetTimeline, audit?.streetTimeline]);

  const resolvedDecisions = useMemo(() => {
    const raw = Array.isArray(decisions)
      ? decisions
      : Array.isArray(audit?.decisions)
        ? audit.decisions
        : [];
    return raw.filter((dec) => dec && typeof dec === 'object');
  }, [decisions, audit?.decisions]);

  // Explicit strategy-unsupported detection (Omaha / Limit / Bomb Pot / Kill Pot / Multi-Runout / Missing Cards)
  const isStrategyUnsupported =
    strategySupported === false ||
    audit?.strategySupported === false ||
    resolvedHand?.strategySupported === false ||
    audit?.supported === false;

  const resolvedDeclineReason =
    declineReason ||
    audit?.declineReason ||
    resolvedHand?.declineReason ||
    audit?.limitation ||
    resolvedHand?.limitation ||
    (isStrategyUnsupported
      ? "Replayable Hand History Only. Automated Solver Strategy Grading Supports Standard Single-Board No-Limit Hold'em."
      : null);

  // Determine available streets from timeline or decisions
  const availableStreets = useMemo(() => {
    const present = new Set();
    resolvedTimeline.forEach((st) => {
      if (typeof st?.street === 'string' && st.street) present.add(st.street.toLowerCase());
    });
    resolvedDecisions.forEach((dec) => {
      if (typeof dec?.street === 'string' && dec.street) present.add(dec.street.toLowerCase());
    });
    const list = STREETS.filter((s) => present.has(s));
    return list.length > 0 ? list : STREETS;
  }, [resolvedTimeline, resolvedDecisions]);

  // Initial street selection: first divergence street or first available street
  const defaultStreet = useMemo(() => {
    if (typeof initialStreet === 'string' && availableStreets.includes(initialStreet.toLowerCase())) {
      return initialStreet.toLowerCase();
    }
    const divergenceDec = resolvedDecisions.find((dec) => {
      const p = String(dec?.playerAction || '').toLowerCase();
      const s = String(dec?.solverAction || dec?.optimalAction || '').toLowerCase();
      return (
        (p && s && p !== s) ||
        dec?.classification === 'blunder' ||
        dec?.classification === 'mistake' ||
        dec?.classification === 'inaccuracy'
      );
    });
    if (typeof divergenceDec?.street === 'string' && availableStreets.includes(divergenceDec.street.toLowerCase())) {
      return divergenceDec.street.toLowerCase();
    }
    return availableStreets[0] || 'preflop';
  }, [initialStreet, availableStreets, resolvedDecisions]);

  const [activeStreet, setActiveStreet] = useState(defaultStreet);
  const [includeHoleCards, setIncludeHoleCards] = useState(false);
  const [shareStatus, setShareStatus] = useState(null);
  useEffect(() => {
    setActiveStreet(defaultStreet);
  }, [defaultStreet]);
  const tabRefs = useRef({});
  const touchStartRef = useRef(null);

  // Keyboard navigation for street pill tabs
  const handleKeyDown = useCallback(
    (event, streetIndex) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      let nextIndex = null;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        nextIndex = (streetIndex + 1) % availableStreets.length;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        nextIndex = (streetIndex - 1 + availableStreets.length) % availableStreets.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        nextIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        event.stopPropagation();
        nextIndex = availableStreets.length - 1;
      }

      if (nextIndex !== null) {
        const nextStreet = availableStreets[nextIndex];
        setActiveStreet(nextStreet);
        tabRefs.current[nextStreet]?.focus?.();
      }
    },
    [availableStreets]
  );

  // Container-level ArrowLeft / ArrowRight keyboard street stepping from anywhere inside the replay
  const handleContainerKeyDown = useCallback(
    (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const targetTag = String(event.target?.tagName || '').toUpperCase();
      if (
        targetTag === 'INPUT'
        || targetTag === 'TEXTAREA'
        || targetTag === 'SELECT'
        || event.target?.isContentEditable
      ) {
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (availableStreets.length <= 1) return;
      const currentIdx = availableStreets.indexOf(activeStreet);
      if (currentIdx < 0) return;
      if (event.key === 'ArrowRight' && currentIdx < availableStreets.length - 1) {
        event.preventDefault();
        setActiveStreet(availableStreets[currentIdx + 1]);
      } else if (event.key === 'ArrowLeft' && currentIdx > 0) {
        event.preventDefault();
        setActiveStreet(availableStreets[currentIdx - 1]);
      }
    },
    [availableStreets, activeStreet],
  );

  // Optional touch swipe left/right navigation (>= 48px horizontal threshold with vertical-scroll guard)
  const handleTouchStart = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (event) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const touch = event.changedTouches?.[0];
      if (!start || !touch || availableStreets.length <= 1) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      // Vertical-scroll guard: never switch streets if vertical movement dominates or horizontal swipe < 48px
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaY) >= Math.abs(deltaX)) return;
      const currentIdx = availableStreets.indexOf(activeStreet);
      if (currentIdx < 0) return;
      if (deltaX < 0 && currentIdx < availableStreets.length - 1) {
        setActiveStreet(availableStreets[currentIdx + 1]);
      } else if (deltaX > 0 && currentIdx > 0) {
        setActiveStreet(availableStreets[currentIdx - 1]);
      }
    },
    [availableStreets, activeStreet]
  );

  // Derive board cards for active street
  const activeTimeline = resolvedTimeline.find(
    (st) => String(st?.street || '').toLowerCase() === activeStreet
  );

  const fullBoard = useMemo(() => {
    if (Array.isArray(resolvedHand?.board)) return resolvedHand.board.filter(Boolean);
    const lastWithBoard = [...resolvedTimeline].reverse().find((st) => Array.isArray(st?.board) && st.board.length > 0);
    return Array.isArray(lastWithBoard?.board) ? lastWithBoard.board.filter(Boolean) : [];
  }, [resolvedHand?.board, resolvedTimeline]);

  const streetBoard = useMemo(() => {
    if (Array.isArray(activeTimeline?.board) && activeTimeline.board.length > 0) {
      return activeTimeline.board.filter(Boolean);
    }
    if (activeStreet === 'preflop') return [];
    if (activeStreet === 'flop') return fullBoard.slice(0, 3);
    if (activeStreet === 'turn') return fullBoard.slice(0, 4);
    if (activeStreet === 'river') return fullBoard.slice(0, 5);
    return [];
  }, [activeTimeline?.board, activeStreet, fullBoard]);

  const heroCards = useMemo(() => {
    if (Array.isArray(resolvedHand?.heroCards)) return resolvedHand.heroCards.filter(Boolean);
    return [];
  }, [resolvedHand?.heroCards]);

  // All hero decisions for the active street (not just [0])
  const activeDecisions = useMemo(
    () => resolvedDecisions.filter((dec) => String(dec?.street || '').toLowerCase() === activeStreet),
    [resolvedDecisions, activeStreet],
  );

  const heroPosition =
    resolvedHand?.heroPosition
    ?? resolvedHand?.position
    ?? activeDecisions[0]?.heroPosition
    ?? activeDecisions[0]?.position
    ?? resolvedDecisions[0]?.heroPosition
    ?? resolvedDecisions[0]?.position
    ?? null;

  const isDecisionDivergence = useCallback((dec) => {
    if (!dec) return false;
    const pAction = String(dec.playerAction || '').toLowerCase();
    const sAction = String(dec.solverAction || dec.optimalAction || '').toLowerCase();
    return Boolean(
      (pAction && sAction && pAction !== sAction) ||
      dec.classification === 'blunder' ||
      dec.classification === 'mistake' ||
      dec.classification === 'inaccuracy'
    );
  }, []);

  const rawPot =
    activeTimeline?.pot
    ?? activeTimeline?.potSize
    ?? activeTimeline?.potBb
    ?? resolvedHand?.pot
    ?? resolvedHand?.potSize
    ?? resolvedHand?.potBb
    ?? null;
  const potIsBb =
    activeTimeline?.pot == null
    && activeTimeline?.potSize == null
    && (activeTimeline?.potBb != null || (resolvedHand?.pot == null && resolvedHand?.potSize == null && resolvedHand?.potBb != null));
  const potDisplay = rawPot != null
    ? (typeof rawPot === 'string' && (rawPot.includes('$') || /bb/i.test(rawPot))
        ? rawPot
        : potIsBb
          ? `${rawPot} BB`
          : `$${rawPot}`)
    : null;

  const hasStackBb =
    activeTimeline?.effectiveStackBb != null
    || resolvedHand?.effectiveStackBb != null;
  const rawStack =
    activeTimeline?.effectiveStackBb
    ?? activeTimeline?.effectiveStack
    ?? resolvedHand?.effectiveStackBb
    ?? resolvedHand?.effectiveStack
    ?? null;
  const stackIsBb =
    hasStackBb
    || (activeTimeline?.effectiveStack == null && activeTimeline?.effectiveStackBb != null)
    || (activeTimeline?.effectiveStack == null && activeTimeline?.effectiveStackBb == null && resolvedHand?.effectiveStack == null && resolvedHand?.effectiveStackBb != null);
  const stackDisplay = rawStack != null
    ? (typeof rawStack === 'string' && (rawStack.includes('$') || /bb/i.test(rawStack))
        ? rawStack
        : stackIsBb
          ? `${rawStack} BB`
          : `$${rawStack}`)
    : null;

  const actions = Array.isArray(activeTimeline?.actions)
    ? activeTimeline.actions.filter((act) => act && typeof act === 'object')
    : [];

  const formatHint = String(
    resolvedHand?.format
    || resolvedHand?.gameType
    || resolvedHand?.formatLabel
    || audit?.hand?.formatLabel
    || '',
  ).toLowerCase();
  const isTournamentFormat = /tournament|\bmtt\b|\bsng\b/.test(formatHint);
  const stakesText = String(resolvedHand?.stakes || '');
  const handIsBb = Boolean(
    potIsBb
    || stackIsBb
    || isTournamentFormat
    || (/\bbb\b/i.test(stakesText) && !stakesText.includes('$'))
    || String(resolvedHand?.currency || '').toUpperCase() === 'BB',
  );
  const handIsCashUsd = Boolean(
    !handIsBb
    && (
      String(resolvedHand?.currency || '').toUpperCase() === 'USD'
      || stakesText.includes('$')
      || String(potDisplay || '').includes('$')
      || String(stackDisplay || '').includes('$')
    ),
  );

  const handleShareHand = useCallback(async () => {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const shareUrl = buildReplayShareUrl({
      origin,
      street: activeStreet,
      position: heroPosition,
      board: streetBoard,
      heroCards,
      stakes: resolvedHand?.stakes || null,
      formatLabel: resolvedHand?.formatLabel || audit?.hand?.formatLabel || null,
      includeHoleCards,
    });
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
        throw new Error('Clipboard Unavailable');
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus({
        tone: 'success',
        text: includeHoleCards && heroCards.length >= 2
          ? 'Share Link Copied (Hole Cards Included)'
          : 'Share Link Copied (Hole Cards Hidden)',
      });
    } catch (_) {
      setShareStatus({
        tone: 'error',
        text: 'Could Not Copy Share Link',
      });
    }
  }, [activeStreet, heroPosition, streetBoard, heroCards, resolvedHand?.stakes, resolvedHand?.formatLabel, audit?.hand?.formatLabel, includeHoleCards]);

  return (
    <div
      className={`inline-hand-replay ${className}`}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        display: 'grid',
        gap: 12,
        padding: 14,
        background: '#05080c',
        border: '1px solid rgba(140, 161, 180, 0.24)',
        borderTopColor: '#aec0d0',
        borderRadius: 8,
        color: '#f1f5fc',
        ...style,
      }}
      data-testid="inline-hand-replay"
    >
      {/* Header with Title and Pot/Stack info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: '"Arial Narrow", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#83deff',
            }}
          >
            Street Replay
          </span>
          <span
            data-testid="replay-swipe-hint"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#9eb4c8',
              padding: '2px 7px',
              borderRadius: 999,
              background: '#0d141c',
              border: '1px solid rgba(140, 161, 180, 0.24)',
            }}
          >
            Swipe Or Tap Street
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#9eb4c8' }}>
          {potDisplay && (
            <span>
              Pot: <strong style={{ color: '#f1f5fc' }}>{potDisplay}</strong>
            </span>
          )}
          {stackDisplay && (
            <span>
              Effective Stack: <strong style={{ color: '#f1f5fc' }}>{stackDisplay}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Explicit strategySupported === false banner for Omaha/Limit/Bomb Pot/etc. */}
      {isStrategyUnsupported && (
        <div
          role="note"
          data-testid="replay-strategy-unsupported-banner"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(255, 198, 109, 0.12)',
            border: '1px solid rgba(140, 161, 180, 0.24)',
            borderLeft: '3px solid #ffc66d',
            color: '#f1f5fc',
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <strong style={{ color: '#ffc66d', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Replay Only · Strategy Grading Not Supported
          </strong>
          <span>{resolvedDeclineReason}</span>
        </div>
      )}

      {/* Active Street Panel (Hero vs Solver verdict compact & scannable at top) */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeStreet}`}
        aria-labelledby={`${baseId}-tab-${activeStreet}`}
        style={{ display: 'grid', gap: 10 }}
      >
        {/* All Hero Decisions & Solver-vs-Hero Divergence Badges for Active Street */}
        {activeDecisions.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {activeDecisions.map((activeDecision, decIndex) => {
              const divergent = isDecisionDivergence(activeDecision);
              const measuredLossRaw = activeDecision.evLossMeasured === true
                ? (activeDecision.evLossBB ?? activeDecision.evLoss)
                : null;
              const measuredLoss =
                measuredLossRaw != null && Number.isFinite(Number(measuredLossRaw))
                  ? Math.abs(Number(measuredLossRaw))
                  : null;
              const solverAct = activeDecision.solverAction || activeDecision.optimalAction;
              const freqComparison = buildSolverFrequencyComparison(activeDecision, {
                strategySupported: !isStrategyUnsupported,
              });
              return (
                <div
                  key={activeDecision.decisionKey || `${activeStreet}-dec-${decIndex}`}
                  style={{ display: 'grid', gap: 6 }}
                >
                  <div
                    role={divergent ? 'status' : undefined}
                    aria-live={divergent ? 'polite' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: divergent ? 'rgba(255, 198, 109, 0.12)' : '#091017',
                      border: divergent ? '1px solid rgba(255, 198, 109, 0.45)' : '1px solid rgba(140, 161, 180, 0.24)',
                      color: '#f1f5fc',
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                    data-testid="replay-divergence-badge"
                    data-divergence={divergent ? 'true' : 'false'}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: divergent ? '#ffc66d' : '#16324f',
                        color: divergent ? '#040d18' : '#83deff',
                        fontWeight: 800,
                        fontSize: 12,
                        textTransform: 'uppercase',
                      }}
                    >
                      {divergent ? 'Divergence' : (activeDecision.solverVerified === false ? 'Unpriced' : 'Aligned')}
                    </span>
                    <span>
                      You: <strong style={{ color: '#ffffff' }}>{titleCase(activeDecision.playerAction || 'Recorded')}</strong>
                      {solverAct ? (
                        <>
                          {' · '}Solver: <strong style={{ color: '#56d8ff' }}>{titleCase(solverAct)}</strong>
                        </>
                      ) : null}
                      {measuredLoss !== null ? (
                        <span style={{ color: '#ff8290', marginLeft: 6 }}>
                          · {measuredLoss.toFixed(2)} BB Lost
                        </span>
                      ) : null}
                    </span>
                  </div>

                  {freqComparison && (
                    <div
                      data-testid="replay-solver-frequency-bar"
                      style={{
                        display: 'grid',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 6,
                        background: '#091017',
                        border: '1px solid rgba(140, 161, 180, 0.24)',
                        borderTopColor: '#aec0d0',
                        color: '#f1f5fc',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <span
                            data-testid="replay-hero-action-pill"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: '#0d141c',
                              border: '1px solid rgba(140, 161, 180, 0.24)',
                              color: '#f1f5fc',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <span>Hero Action:</span>
                            <strong style={{ color: '#ffffff' }}>{freqComparison.heroAction}</strong>
                            {freqComparison.heroFrequencyPct !== null && (
                              <span style={{ color: '#9eb4c8' }}>({freqComparison.heroFrequencyPct}%)</span>
                            )}
                          </span>
                          <span
                            data-testid="replay-solver-optimal-pill"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(8, 124, 250, 0.16)',
                              border: '1px solid #56d8ff',
                              color: '#83deff',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <span>Solver Optimal:</span>
                            <strong style={{ color: '#ffffff' }}>{freqComparison.solverAction}</strong>
                            {freqComparison.optimalFrequencyPct !== null && (
                              <span>({freqComparison.optimalFrequencyPct}%)</span>
                            )}
                          </span>
                        </div>

                        {freqComparison.evLossLabel !== null && (
                          <span
                            data-testid="replay-ev-loss-pill"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(255, 107, 122, 0.16)',
                              border: '1px solid rgba(255, 130, 144, 0.5)',
                              color: '#ff8290',
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            <span>EV Loss:</span>
                            <strong>{freqComparison.evLossLabel}</strong>
                          </span>
                        )}
                      </div>

                      {freqComparison.optimalFrequencyPct !== null && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ display: 'grid', gap: 3 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#9eb4c8' }}>
                              <span>Solver Optimal Frequency</span>
                              <strong style={{ color: '#83deff' }}>{freqComparison.optimalFrequencyPct}%</strong>
                            </div>
                            <div
                              role="progressbar"
                              aria-label="Solver Optimal Frequency"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(freqComparison.optimalFrequencyPct)}
                              data-testid="replay-optimal-frequency-track"
                              style={{
                                width: '100%',
                                height: 8,
                                borderRadius: 999,
                                background: '#05080c',
                                border: '1px solid rgba(140, 161, 180, 0.24)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                className="pa-progress-fill"
                                data-testid="replay-optimal-frequency-fill"
                                style={{
                                  width: '100%',
                                  '--pa-target-width': `${freqComparison.optimalFrequencyPct}%`,
                                  height: '100%',
                                  transform: `scaleX(${Math.max(0, Math.min(1, freqComparison.optimalFrequencyPct / 100))})`,
                                  transformOrigin: 'left center',
                                  background: 'linear-gradient(90deg, #087cfa 0%, #56d8ff 100%)',
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                          </div>

                          {freqComparison.heroFrequencyPct !== null && (
                            <div style={{ display: 'grid', gap: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#9eb4c8' }}>
                                <span>Hero Action Frequency</span>
                                <strong style={{ color: divergent ? '#ffc66d' : '#4de0a5' }}>{freqComparison.heroFrequencyPct}%</strong>
                              </div>
                              <div
                                role="progressbar"
                                aria-label="Hero Action Frequency"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(freqComparison.heroFrequencyPct)}
                                data-testid="replay-hero-frequency-track"
                                style={{
                                  width: '100%',
                                  height: 8,
                                  borderRadius: 999,
                                  background: '#05080c',
                                  border: '1px solid rgba(140, 161, 180, 0.24)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  className="pa-progress-fill"
                                  data-testid="replay-hero-frequency-fill"
                                  style={{
                                    width: '100%',
                                    '--pa-target-width': `${freqComparison.heroFrequencyPct}%`,
                                    height: '100%',
                                    transform: `scaleX(${Math.max(0, Math.min(1, freqComparison.heroFrequencyPct / 100))})`,
                                    transformOrigin: 'left center',
                                    background: divergent
                                      ? 'linear-gradient(90deg, #d99b38 0%, #ffc66d 100%)'
                                      : 'linear-gradient(90deg, #1fa97c 0%, #4de0a5 100%)',
                                    borderRadius: 999,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Community Board and Hero Cards */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            background: '#091017',
            border: '1px solid rgba(140, 161, 180, 0.24)',
            borderRadius: 6,
          }}
        >
          {/* Community Board Cards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#9eb4c8', textTransform: 'uppercase' }}>
              Board:
            </span>
            {streetBoard.length > 0 ? (
              <div style={{ display: 'flex', gap: 4 }}>
                {streetBoard.map((c, i) => (
                  <CardBadge key={`${c}-${i}`} card={c} variant="board" />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#9eb4c8' }}>
                {activeStreet === 'preflop' ? 'None (Preflop)' : 'Board Not Recorded'}
              </span>
            )}
          </div>

          {/* Hero Cards */}
          {heroCards.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9eb4c8', textTransform: 'uppercase' }}>
                Hero {heroPosition ? `(${heroPosition})` : ''}:
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {heroCards.map((c, i) => (
                  <CardBadge key={`hero-${c}-${i}`} card={c} variant="hero" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Street Actions List */}
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#9eb4c8', textTransform: 'uppercase' }}>
            Actions ({titleCase(activeStreet)})
          </span>
          {actions.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {actions.map((act, index) => {
                const isHero = act.isHero === true || (heroPosition && act.position === heroPosition);
                return (
                  <li
                    key={`${act.position || 'act'}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: 4,
                      background: isHero ? 'rgba(8, 124, 250, 0.15)' : '#091017',
                      border: isHero ? '1px solid #56d8ff' : '1px solid rgba(140, 161, 180, 0.24)',
                      fontSize: 13,
                    }}
                  >
                    <span>
                      <strong style={{ color: isHero ? '#83deff' : '#f1f5fc' }}>
                        {act.position || (isHero ? 'Hero' : 'Opponent')}
                      </strong>
                      : {titleCase(act.action)}
                      {(() => {
                        const formattedAmount = formatActionAmount(act, { handIsBb, handIsCashUsd });
                        return formattedAmount ? ` (${formattedAmount})` : '';
                      })()}
                    </span>
                    {act.potBeforeBB != null && (
                      <span style={{ color: '#9eb4c8', fontSize: 12 }}>
                        Pot: {act.potBeforeBB} BB
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ padding: '8px 10px', background: '#091017', borderRadius: 4, color: '#9eb4c8', fontSize: 13 }}>
              No Specific Actions Recorded For {titleCase(activeStreet)}.
            </div>
          )}
        </div>
      </div>

      {/* Privacy-Safe Inline Share Hand Footer Control */}
      <div
        data-testid="replay-share-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          padding: '8px 10px',
          borderRadius: 6,
          background: '#091017',
          border: '1px solid rgba(140, 161, 180, 0.24)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: '#dce5ef',
            }}
          >
            <input
              type="checkbox"
              checked={includeHoleCards}
              onChange={(e) => {
                setIncludeHoleCards(e.target.checked);
                setShareStatus(null);
              }}
              aria-label="Include Hole Cards"
              data-testid="replay-share-include-cards"
              style={{ width: 18, height: 18, margin: 0, cursor: 'pointer', accentColor: '#087cfa' }}
            />
            <span>Include Hole Cards</span>
          </label>
          <span
            role="status"
            aria-live="polite"
            data-testid="replay-share-status"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: shareStatus?.tone === 'error'
                ? '#ff8290'
                : shareStatus?.tone === 'success'
                  ? '#4de0a5'
                  : '#9eb4c8',
            }}
          >
            {shareStatus?.text || (includeHoleCards ? 'Hole Cards Will Be Included' : 'Hole Cards Hidden By Default')}
          </span>
        </div>
        <button
          type="button"
          className="pa-btn"
          data-testid="replay-share-hand-btn"
          onClick={handleShareHand}
          style={{
            minHeight: 44,
            minWidth: 44,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid rgba(86, 216, 255, 0.45)',
            borderTopColor: '#aec0d0',
            background: 'linear-gradient(180deg, #132233 0%, #060d16 65%)',
            color: '#f1f5fc',
            fontFamily: '"Arial Narrow", Arial, sans-serif',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          <span>Share Hand</span>
        </button>
      </div>

      {/* Thumb-Zone Sticky Bottom Street Selector (Pre, Flop, Turn, River) */}
      <div
        data-testid="replay-sticky-street-bar"
        style={{
          position: 'sticky',
          bottom: 'var(--sp-footer-dock-height, 0px)',
          zIndex: 5,
          paddingTop: 6,
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(180deg, rgba(5, 8, 12, 0.92) 0%, #05080c 25%, #091017 100%)',
          borderTop: '1px solid rgba(140, 161, 180, 0.24)',
        }}
      >
        <div
          role="tablist"
          aria-label="Hand Streets"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${availableStreets.length}, 1fr)`,
            gap: 6,
            background: '#0d141c',
            padding: 4,
            borderRadius: 6,
            border: '1px solid rgba(140, 161, 180, 0.24)',
          }}
        >
          {availableStreets.map((street, idx) => {
            const isSelected = activeStreet === street;
            const tabLabel = STREET_TAB_LABELS[street] || titleCase(street);
            return (
              <button
                key={street}
                ref={(el) => {
                  tabRefs.current[street] = el;
                }}
                type="button"
                role="tab"
                className="pa-btn pa-replay-tab"
                id={`${baseId}-tab-${street}`}
                data-street={street}
                aria-selected={isSelected}
                aria-controls={isSelected ? `${baseId}-panel-${street}` : undefined}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveStreet(street)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  border: isSelected ? '1px solid #56d8ff' : '1px solid transparent',
                  borderRadius: 5,
                  background: isSelected
                    ? 'linear-gradient(180deg, #087cfa 0%, #0044ac 55%, #002b68 100%)'
                    : 'transparent',
                  color: isSelected ? '#ffffff' : '#9eb4c8',
                  fontFamily: '"Arial Narrow", Arial, sans-serif',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  textTransform: 'capitalize',
                }}
              >
                <span>{tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
