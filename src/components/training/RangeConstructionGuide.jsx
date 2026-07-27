/**
 * RangeConstructionGuide — Step-by-Step Range Building Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Learn how to construct opening, defending, and 3-betting ranges
 * from scratch using GTO principles.
 */
import React, { useState } from 'react';

const RANGE_TYPES = [
  {
    name: 'Opening Range',
    color: '#10b981',
    steps: [
      { step: 'Start with Premium Pairs', hands: 'AA, KK, QQ, JJ, TT', pct: 4, reason: 'Always open from any position. Core of every range.' },
      { step: 'Add Strong Broadway', hands: 'AKs, AKo, AQs, AQo, AJs', pct: 8, reason: 'High card strength + straight potential. Dominate weaker hands.' },
      { step: 'Add Medium Pairs', hands: '99, 88, 77, 66', pct: 11, reason: 'Set mining potential. Profitable even without improvement.' },
      { step: 'Add Suited Broadways', hands: 'KQs, KJs, KTs, QJs, QTs, JTs', pct: 15, reason: 'Straight + flush potential. Play well postflop in position.' },
      { step: 'Add Suited Aces', hands: 'A9s-A2s (blockers + nut flush)', pct: 20, reason: 'Nut flush draws. Ace blocker for 3-bet defense. Great semi-bluffs.' },
      { step: 'Add Suited Connectors', hands: 'T9s, 98s, 87s, 76s, 65s, 54s', pct: 25, reason: 'Hidden equity monsters. Flushes, straights, two pairs that win big pots.' },
      { step: 'Position Widening', hands: 'Offsuit broadways, weak suited, small pairs', pct: 35, reason: 'From CO/BTN, add weaker hands. Position compensates for hand quality.' },
    ],
  },
  {
    name: '3-Bet Range',
    color: '#ef4444',
    steps: [
      { step: 'Value 3-Bets', hands: 'QQ+, AKs, AKo', pct: 3, reason: 'Hands too strong to flat. Want to build pot and isolate.' },
      { step: 'Add Thin Value', hands: 'JJ, AQs, AQo (position dependent)', pct: 5, reason: 'Strong hands that play better in 3-bet pots with initiative.' },
      { step: 'Suited Ace Bluffs', hands: 'A5s, A4s, A3s, A2s', pct: 7, reason: 'Ace blockers reduce villain premium combos. Nut flush potential if called.' },
      { step: 'Suited Connector Bluffs', hands: '76s, 87s, T9s (polarized)', pct: 9, reason: 'Play well as bluffs — if called, still have equity. Balanced with value.' },
      { step: 'Adjustments', hands: 'Widen vs late position, tighten vs early position', pct: 12, reason: 'Vs BTN open: 3-bet wider. Vs UTG open: only premiums + a few bluffs.' },
    ],
  },
  {
    name: 'BB Defense Range',
    color: '#3b82f6',
    steps: [
      { step: 'Premium 3-Bets', hands: 'QQ+, AKs, AKo (vs any open)', pct: 3, reason: 'Always 3-bet premiums from BB. Build pot with the best hands.' },
      { step: 'Value 3-Bets', hands: 'JJ, TT, AQs, AJs (vs late position)', pct: 6, reason: 'Against wider opens, these become value 3-bets.' },
      { step: 'Bluff 3-Bets', hands: 'A5s-A2s, 76s, 87s, K9s', pct: 10, reason: 'Balanced bluffs. Blockers + playability if called.' },
      { step: 'Flatting Range', hands: 'Pairs 22-99, suited broadways, suited connectors', pct: 25, reason: 'Hands with good implied odds and playability. Price is right with BB discount.' },
      { step: 'Wide Defense (vs BTN)', hands: 'Any suited, weak broadways, connected cards', pct: 40, reason: 'Vs BTN opens, defend very wide. You close action + have BB invested.' },
    ],
  },
];

function RangeConstructionGuide() {
  const [selectedType, setSelectedType] = useState(0);

  const range = RANGE_TYPES[selectedType];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#a78bfa' }}>Range Construction Guide</h3>

        {/* Type Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {RANGE_TYPES.map((r, i) => (
            <button key={r.name} onClick={() => setSelectedType(i)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedType === i ? r.color : 'rgba(255,255,255,0.06)',
              color: selectedType === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none', flex: 1,
            }}>{r.name}</button>
          ))}
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {range.steps.map((s, i) => (
            <div key={i} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${range.color}`, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, background: `${range.color}20`, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, color: range.color }}>
                ~{s.pct}%
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: range.color, marginBottom: 4 }}>
                {i + 1}. {s.step}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{s.hands}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{s.reason}</div>
              {/* Cumulative bar */}
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}>
                <div style={{ width: `${Math.min(s.pct * 2, 100)}%`, height: '100%', background: range.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Range Construction Guide failed to load: {err.message}</div>;
  }
}

export default RangeConstructionGuide;
