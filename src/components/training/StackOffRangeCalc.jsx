/**
 * StackOffRangeCalc — Stack-Off Range Calculator by SPR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate which hands to stack off with at different SPR levels.
 * Shows commitment thresholds and hand categories.
 */
import React, { useState, useMemo } from 'react';

const SPR_RANGES = [
  {
    spr: '0-1', label: 'Ultra Low SPR', color: '#ef4444',
    stackOff: [
      { category: 'Always Stack Off', hands: 'Any pair, any draw with 6+ outs, Ace-high', pct: 85 },
      { category: 'Fold', hands: 'Only complete air with no equity (rare)', pct: 15 },
    ],
    tip: 'At SPR <1, you are pot-committed on the flop. Get it in with almost anything that has equity.',
  },
  {
    spr: '1-3', label: 'Low SPR', color: '#f59e0b',
    stackOff: [
      { category: 'Strong Stack Off', hands: 'Overpairs (AA-TT), top pair top kicker, sets, two pair+', pct: 40 },
      { category: 'Marginal Stack Off', hands: 'Top pair decent kicker, flush draws, OESD + pair', pct: 25 },
      { category: 'Fold', hands: 'Weak pairs, gutshots, Ace-high, missed draws', pct: 35 },
    ],
    tip: 'Low SPR = simplified poker. Top pair is often strong enough to commit. Sets are the stone cold nuts.',
  },
  {
    spr: '3-6', label: 'Medium-Low SPR', color: '#eab308',
    stackOff: [
      { category: 'Strong Stack Off', hands: 'Sets, two pair, nut flush draws, combo draws', pct: 25 },
      { category: 'Marginal', hands: 'Top pair good kicker, overpairs on safe boards', pct: 20 },
      { category: 'Call One Street', hands: 'Top pair weak kicker, middle pair, flush draws', pct: 25 },
      { category: 'Fold', hands: 'Bottom pair, gutshots, unimproved overs', pct: 30 },
    ],
    tip: 'Need TPGK+ to stack off comfortably. Sets and two pair are premium. Draws need semi-bluff potential.',
  },
  {
    spr: '6-13', label: 'Medium SPR', color: '#22c55e',
    stackOff: [
      { category: 'Stack Off for Value', hands: 'Sets, top two pair, nut flushes, nut straights', pct: 15 },
      { category: 'Bet/Call Two Streets', hands: 'Overpairs, strong top pair, combo draws', pct: 20 },
      { category: 'Bet/Call One Street', hands: 'Top pair, strong draws, middle pair good kicker', pct: 25 },
      { category: 'Check/Fold or Bluff', hands: 'Weak hands, missed draws, bottom pair', pct: 40 },
    ],
    tip: 'Multi-street planning critical. Sets are gold. Top pair is a 1-2 street hand, not a 3-street hand.',
  },
  {
    spr: '13+', label: 'Deep SPR', color: '#3b82f6',
    stackOff: [
      { category: 'Stack Off (3 streets)', hands: 'Sets+, nut flushes, nut straights only', pct: 8 },
      { category: 'Value 2 Streets', hands: 'Overpairs on safe boards, strong two pair', pct: 15 },
      { category: 'Value 1 Street', hands: 'Top pair, decent made hands', pct: 22 },
      { category: 'Speculative/Bluff', hands: 'Draws, suited connectors, small pairs (set mining)', pct: 20 },
      { category: 'Give Up', hands: 'Missed draws, weak holdings, air', pct: 35 },
    ],
    tip: 'Deep stacks favor skill and position. Never stack off with one pair. Speculative hands gain huge implied odds.',
  },
];

function StackOffRangeCalc() {
  const [selectedSPR, setSelectedSPR] = useState(2);

  const data = SPR_RANGES[selectedSPR];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f472b6' }}>Stack-Off Range Calculator</h3>

        {/* SPR Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SPR_RANGES.map((s, i) => (
            <button key={s.spr} onClick={() => setSelectedSPR(i)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedSPR === i ? s.color : 'rgba(255,255,255,0.06)',
              color: selectedSPR === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>SPR {s.spr}</button>
          ))}
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', padding: 14, background: `${data.color}10`, borderRadius: 10, border: `1px solid ${data.color}25`, marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: data.color }}>{data.label}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>SPR: {data.spr}</div>
        </div>

        {/* Range Breakdown */}
        <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
          {data.stackOff.map((cat, i) => {
            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280'];
            return (
              <div key={i} style={{
                width: `${cat.pct}%`, background: colors[i] || '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: '#fff',
              }}>{cat.pct}%</div>
            );
          })}
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {data.stackOff.map((cat, i) => {
            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#6b7280'];
            return (
              <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${colors[i] || '#6b7280'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors[i] || '#6b7280' }}>{cat.category}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors[i] || '#6b7280' }}>{cat.pct}%</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{cat.hands}</div>
              </div>
            );
          })}
        </div>

        {/* Tip */}
        <div style={{ padding: 10, background: `${data.color}08`, borderRadius: 8, border: `1px solid ${data.color}20` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: data.color, marginBottom: 4 }}>Key Insight</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{data.tip}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Stack-Off Calculator failed to load: {err.message}</div>;
  }
}

export default StackOffRangeCalc;
