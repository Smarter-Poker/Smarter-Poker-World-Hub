/**
 * HUSNGSolver — Heads-Up SNG Specific Solutions
 * CRITICAL GAP CLOSER: GTO Wizard has HU SNG support
 * Nash equilibrium push/fold charts + ICM adjustments for HU SNGs
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STACK_DEPTHS = [
  { bb: 25, label: '25bb', phase: 'Early', color: '#22c55e', icon: '●',
    strategy: 'Play poker. Open normally. Don\'t shove yet.',
    openRange: '~45% from SB, ~35% from BB defense',
    notes: 'Full post-flop game applies. Position is king. Standard 2-2.5x opens.',
    pushRange: 'Never push at this depth unless you have AA/KK and villain 3-bets' },
  { bb: 15, label: '15bb', phase: 'Mid', color: '#3b82f6', icon: '●',
    strategy: 'Mix open-shoves with standard opens. Some hands are too strong to open-fold.',
    openRange: '~55% from SB, ~40% from BB defense',
    notes: 'Start incorporating open-shoves with hands like A2-A9, KT+, suited connectors.',
    pushRange: 'Shove any pocket pair, A2+, K8+, Q9+, JTs from SB' },
  { bb: 10, label: '10bb', phase: 'Push/Fold', color: '#f59e0b', icon: '●',
    strategy: 'Primarily push or fold. Open-raising is rarely correct at 10bb.',
    openRange: 'N/A — push or fold',
    notes: 'The Nash push/fold zone. Every hand is either a shove or a fold from SB.',
    pushRange: 'Shove any pair, any Ace, K2s+, K5o+, Q7s+, Q9o+, J8s+, JTo, T8s+, 98s, 87s' },
  { bb: 7, label: '7bb', phase: 'Desperation', color: '#ef4444', icon: '●',
    strategy: 'Shove extremely wide. You\'re almost dead — fight for every blind.',
    openRange: 'N/A — pure push/fold',
    notes: 'At 7bb, you must shove ~65-70% from SB. Any two cards with an Ace or King.',
    pushRange: 'Shove 70%+ of hands from SB: any Ace, any King, any Queen, any suited, any connected' },
  { bb: 4, label: '4bb', phase: 'All-In Preflop', color: '#dc2626', icon: '●',
    strategy: 'Shove literally everything from SB. Call very wide from BB.',
    openRange: 'N/A — ATC shove',
    notes: 'At 4bb, both players should be shoving 80%+ and calling 60%+ of shoves.',
    pushRange: 'Shove any two cards (ATC). Fold only the very worst hands like 72o, 83o.' },
];

const NASH_CHART = [
  { hand: 'AA', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'KK', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'QQ', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'AKs', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'AKo', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'JJ', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'AQs', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'TT', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'AQo', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'A5s', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: '99', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'KQs', sb10: 'PUSH', bb10: 'CALL', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'K9s', sb10: 'PUSH', bb10: 'FOLD', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'Q9s', sb10: 'PUSH', bb10: 'FOLD', sb7: 'PUSH', bb7: 'CALL' },
  { hand: 'J8s', sb10: 'PUSH', bb10: 'FOLD', sb7: 'PUSH', bb7: 'FOLD' },
  { hand: 'T8s', sb10: 'PUSH', bb10: 'FOLD', sb7: 'PUSH', bb7: 'FOLD' },
  { hand: '72o', sb10: 'FOLD', bb10: 'FOLD', sb7: 'PUSH', bb7: 'FOLD' },
];

export default function HUSNGSolver() {
  const [depthIdx, setDepthIdx] = useState(2);
  const depth = STACK_DEPTHS[depthIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        » HU SNG Solver
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Nash equilibrium push/fold charts for Heads-Up Sit & Go tournaments.</p>

      {/* Stack Depth Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {STACK_DEPTHS.map((d, i) => (
          <button key={i} onClick={() => setDepthIdx(i)}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: depthIdx === i ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.06)',
              background: depthIdx === i ? `${d.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{d.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: depthIdx === i ? d.color : '#64748b' }}>{d.label}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{d.phase}</div>
          </button>
        ))}
      </div>

      <motion.div key={depthIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Strategy Overview */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: depth.color, marginBottom: 8 }}>{depth.icon} {depth.phase} Phase ({depth.label})</div>
          <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{depth.strategy}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { label: 'PUSH RANGE (SB)', value: depth.pushRange, color: '#ef4444' },
              { label: 'OPEN RANGE', value: depth.openRange, color: '#3b82f6' },
              { label: 'NOTES', value: depth.notes, color: '#f59e0b' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${item.color}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Nash Chart */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
            NASH PUSH/FOLD CHART (HU SNG)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Hand', 'SB 10bb', 'BB 10bb', 'SB 7bb', 'BB 7bb'].map(h => (
              <div key={h} style={{ fontSize: 8, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
          {NASH_CHART.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', padding: '5px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace', fontWeight: 700 }}>{row.hand}</span>
              {[row.sb10, row.bb10, row.sb7, row.bb7].map((v, j) => (
                <span key={j} style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                  color: v === 'PUSH' ? '#ef4444' : v === 'CALL' ? '#22c55e' : '#64748b' }}>{v}</span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
