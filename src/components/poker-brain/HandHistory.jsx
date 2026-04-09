import React, { useState } from 'react';

/**
 * Poker Brain - Hand History Panel
 * ---------------------------------
 * Renders the most recent completed hands from the state machine along with
 * the per-street decisions the engine made (action, equity, pot odds). This is
 * the session-live view only; persistent history lives in Supabase via
 * storage.js.
 *
 * Props:
 *   hands - array of hand objects from HandStateMachine onHandEnd, newest first
 */

const SUIT_COLOR = {
  s: '#1a1a2e',
  h: '#dc2626',
  d: '#2563eb',
  c: '#16a34a',
};

const SUIT_GLYPH = {
  s: '\u2660',
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
};

function MiniCard({ card }) {
  if (!card) return null;
  const color = SUIT_COLOR[card.suit] || '#1a1a2e';
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 bg-white text-xs font-bold"
      style={{ color }}
    >
      {card.rank}
      <span className="text-[10px]">{SUIT_GLYPH[card.suit] || ''}</span>
    </span>
  );
}

function CardRow({ cards, label }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-slate-500 uppercase tracking-wider font-semibold w-10">{label}</span>
      <div className="flex gap-1">
        {cards.map((c, i) => <MiniCard key={label + i} card={c} />)}
      </div>
    </div>
  );
}

function DecisionRow({ street, decision }) {
  if (!decision) return null;
  // Engine already returns equity/potOdds as percentages (0-100). Do NOT
  // multiply again or you get 4500% readings.
  const equity = typeof decision.equity === 'number' ? Math.round(decision.equity) : null;
  const potOdds = typeof decision.potOdds === 'number' ? Math.round(decision.potOdds) : null;
  const actionColor =
    decision.action === 'RAISE' || decision.action === 'BET' ? 'text-emerald-300'
    : decision.action === 'CALL' ? 'text-sky-300'
    : decision.action === 'CHECK' ? 'text-amber-300'
    : decision.action === 'FOLD' ? 'text-rose-300'
    : 'text-slate-300';
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-400">
      <span className="w-12 uppercase tracking-wider font-semibold">{street}</span>
      <span className={'font-bold ' + actionColor}>{decision.action}</span>
      {decision.raiseAmount > 0 && <span>{decision.raiseAmount}</span>}
      {equity !== null && <span>eq {equity}%</span>}
      {potOdds !== null && potOdds > 0 && <span>odds {potOdds}%</span>}
    </div>
  );
}

function HandCard({ hand, index }) {
  const [open, setOpen] = useState(false);
  const started = hand.startedAt ? new Date(hand.startedAt) : null;
  const duration = hand.startedAt && hand.endedAt
    ? Math.round((hand.endedAt - hand.startedAt) / 1000)
    : null;
  const decisions = hand.streetDecisions || {};
  const streetsWithDecisions = Object.keys(decisions);

  // Board fallback: if the state machine skipped straight from flop to river
  // (fast detection stream, missed turn transition), the per-street fields may
  // be null but `finalBoard` will still hold the 5 cards. Fill the gaps from
  // finalBoard so the history view is not missing cards the user saw.
  const fb = Array.isArray(hand.finalBoard) ? hand.finalBoard : [];
  const flop = hand.flop && hand.flop.length === 3
    ? hand.flop
    : (fb.length >= 3 ? fb.slice(0, 3) : null);
  const turn = hand.turn || (fb.length >= 4 ? fb[3] : null);
  const river = hand.river || (fb.length >= 5 ? fb[4] : null);

  return (
    <div className="rounded-lg bg-slate-800/70 border border-white/5 p-2.5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono">#{index + 1}</span>
          {hand.holeCards && hand.holeCards.map((c, i) => (
            <MiniCard key={'hh' + i} card={c} />
          ))}
          {hand.position && (
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
              {hand.position}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          {duration !== null && <span>{duration}s</span>}
          {started && (
            <span>
              {started.getHours().toString().padStart(2, '0')}:
              {started.getMinutes().toString().padStart(2, '0')}
            </span>
          )}
          <span className="text-slate-500">{open ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>

      {open && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5">
          {(hand.potAtStart != null || hand.stackAtStart != null || hand.bigBlind != null) && (
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              {hand.potAtStart != null && (
                <span>Pot <span className="text-white font-bold">{hand.potAtStart}</span></span>
              )}
              {hand.stackAtStart != null && (
                <span>Stack <span className="text-white font-bold">{hand.stackAtStart}</span></span>
              )}
              {hand.bigBlind != null && hand.bigBlind > 0 && (
                <span>BB <span className="text-white font-bold">{hand.bigBlind}</span></span>
              )}
              {hand.gameType && (
                <span className="uppercase">{hand.gameType}</span>
              )}
            </div>
          )}
          <CardRow cards={hand.holeCards} label="Hole" />
          <CardRow cards={flop} label="Flop" />
          {turn && <CardRow cards={[turn]} label="Turn" />}
          {river && <CardRow cards={[river]} label="River" />}
          {streetsWithDecisions.length > 0 && (
            <div className="pt-1 mt-1 border-t border-white/5 space-y-0.5">
              {streetsWithDecisions.map((s) => (
                <DecisionRow key={s} street={s} decision={decisions[s]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HandHistory({ hands = [] }) {
  if (!hands || hands.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800/50 border border-white/5 p-4 text-center">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Hand History
        </h2>
        <p className="text-[11px] text-slate-500">
          Completed hands from this session will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-slate-800/50 border border-white/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Hand History
        </h2>
        <span className="text-[10px] text-slate-500">{hands.length} hand{hands.length === 1 ? '' : 's'}</span>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {hands.map((h, i) => (
          <HandCard key={h.handId || i} hand={h} index={i} />
        ))}
      </div>
    </div>
  );
}
