/**
 * InlineHandReplay · Embedded street-by-street hand stepper for Personal Assistant / Leak Finder.
 *
 * Adheres to the approved MTT Lobby / Arena Workspace standard:
 *   - #040d18 canvas, #688299 / #aec0d0 steel bevels
 *   - Royal blue primary CTAs / active street indicators
 *   - >= 44px tap targets for every street pill
 *   - Left / Right arrow keyboard navigation (role="tablist", aria-selected)
 *   - Community board cards, Hero cards, Pot and Stack depth for the active street
 *   - Street actions list + crisp highlight badge on solver divergence
 *   - Zero block elements inside <button>
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

const SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_COLORS = { c: '#2ECC71', d: '#3498DB', h: '#E74C3C', s: '#ECF0F1' };

function parseCard(cardStr) {
  if (!cardStr || typeof cardStr !== 'string' || cardStr.length < 2) return null;
  const rank = cardStr.slice(0, -1).replace('T', '10').toUpperCase();
  const suitChar = cardStr.slice(-1).toLowerCase();
  return {
    rank,
    suit: SUITS[suitChar] || '?',
    color: SUIT_COLORS[suitChar] || '#FFFFFF',
    raw: cardStr,
  };
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function CardBadge({ card }) {
  const parsed = parseCard(card);
  if (!parsed) return null;
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
        borderRadius: 4,
        background: '#07111C',
        border: '1px solid #688299',
        borderTopColor: '#aec0d0',
        color: parsed.color,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: -0.5,
      }}
      data-card={card}
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
  useEffect(() => {
    setActiveStreet(defaultStreet);
  }, [defaultStreet]);
  const tabRefs = useRef({});

  // Keyboard navigation for street pill tabs
  const handleKeyDown = useCallback(
    (event, streetIndex) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nextIndex = (streetIndex + 1) % availableStreets.length;
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nextIndex = (streetIndex - 1 + availableStreets.length) % availableStreets.length;
      } else if (event.key === 'Home') {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
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

  const rawStack =
    activeTimeline?.effectiveStack
    ?? activeTimeline?.effectiveStackBb
    ?? resolvedHand?.effectiveStack
    ?? resolvedHand?.effectiveStackBb
    ?? null;
  const stackIsBb =
    (activeTimeline?.effectiveStack == null && activeTimeline?.effectiveStackBb != null)
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

  return (
    <div
      className={`inline-hand-replay ${className}`}
      style={{
        display: 'grid',
        gap: 12,
        padding: 14,
        background: '#040d18',
        border: '1px solid #688299',
        borderTopColor: '#aec0d0',
        borderRadius: 8,
        color: '#f1f5fc',
        ...style,
      }}
      data-testid="inline-hand-replay"
    >
      {/* Header with Title and Pot/Stack info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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

      {/* Street Pill Tabs */}
      <div
        role="tablist"
        aria-label="Hand Streets"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${availableStreets.length}, 1fr)`,
          gap: 6,
          background: '#06111e',
          padding: 4,
          borderRadius: 6,
          border: '1px solid #253e57',
        }}
      >
        {availableStreets.map((street, idx) => {
          const isSelected = activeStreet === street;
          return (
            <button
              key={street}
              ref={(el) => {
                tabRefs.current[street] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${street}`}
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
                padding: '6px 12px',
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
              <span>{titleCase(street)}</span>
            </button>
          );
        })}
      </div>

      {/* Active Street Panel */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeStreet}`}
        aria-labelledby={`${baseId}-tab-${activeStreet}`}
        style={{ display: 'grid', gap: 10 }}
      >
        {/* Community Board and Hero Cards */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            background: '#07111c',
            border: '1px solid #253e57',
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
                  <CardBadge key={`${c}-${i}`} card={c} />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#688299' }}>
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
                  <CardBadge key={`hero-${c}-${i}`} card={c} />
                ))}
              </div>
            </div>
          )}
        </div>

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
              return (
                <div
                  key={activeDecision.decisionKey || `${activeStreet}-dec-${decIndex}`}
                  role={divergent ? 'status' : undefined}
                  aria-live={divergent ? 'polite' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: divergent ? 'rgba(255, 198, 109, 0.12)' : '#07111c',
                    border: divergent ? '1px solid rgba(255, 198, 109, 0.45)' : '1px solid #253e57',
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
              );
            })}
          </div>
        )}

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
                      background: isHero ? 'rgba(8, 124, 250, 0.15)' : '#07111c',
                      border: isHero ? '1px solid #56d8ff' : '1px solid #1c2e42',
                      fontSize: 13,
                    }}
                  >
                    <span>
                      <strong style={{ color: isHero ? '#83deff' : '#f1f5fc' }}>
                        {act.position || (isHero ? 'Hero' : 'Opponent')}
                      </strong>
                      : {titleCase(act.action)}
                      {act.amount != null ? ` ($${act.amount})` : ''}
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
            <div style={{ padding: '8px 10px', background: '#07111c', borderRadius: 4, color: '#9eb4c8', fontSize: 13 }}>
              No Specific Actions Recorded For {titleCase(activeStreet)}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
