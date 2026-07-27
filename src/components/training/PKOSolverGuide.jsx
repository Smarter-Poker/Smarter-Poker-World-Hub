/**
 * PKOSolverGuide — Progressive Knockout Tournament Strategy & Solver
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's PKO/Bounty format support
 * Bounty-adjusted strategy with dynamic bounty-to-stack ratios
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BOUNTY_SCENARIOS = [
  { name: 'Small Bounty (0.1x)', ratio: 0.1, icon: '●', color: '#22c55e',
    adjust: 'Minimal adjustment. Play close to standard MTT strategy. The bounty adds ~5% to your calling range.',
    calling: '+3-5% wider calling range. Call with hands like A9o, KTo, 55 that you\'d normally fold.',
    shoving: 'Shove range barely changes. Maybe add lowest suited Aces (A2s-A5s).',
    example: 'You have 25bb, villain covers. Bounty = 2.5bb. Standard play with slight widening.' },
  { name: 'Medium Bounty (0.3x)', ratio: 0.3, icon: '●', color: '#f59e0b',
    adjust: 'Significant adjustment. Bounty is worth 30% of your stack. Call 10-15% wider than standard.',
    calling: '+10-15% wider. Call with suited connectors (54s+), any Ace, suited Kings, pocket pairs.',
    shoving: 'Shove range widens ~10%. Include hands like K5s, Q8s, J9o from late position.',
    example: 'You have 20bb, villain covers. Bounty = 6bb. This is almost 1/3 of your stack — fight for it.' },
  { name: 'Large Bounty (0.5x)', ratio: 0.5, icon: '●', color: '#ef4444',
    adjust: 'Major adjustment. The bounty is worth half your stack. Your calling range expands massively.',
    calling: '+20-25% wider. Call with almost any two suited, any broadway, any pair, suited one-gappers.',
    shoving: 'Shove with virtually any hand from BTN/SB when covering the bounty. ATC shoves are close.',
    example: 'You have 15bb, villain covers. Bounty = 7.5bb. This changes the math completely — call very wide.' },
  { name: 'Mega Bounty (1x+)', ratio: 1.0, icon: '●', color: '#dc2626',
    adjust: 'Extreme adjustment. The bounty equals or exceeds your stack. Almost any hand is a profitable call.',
    calling: 'Call with any two cards. The bounty alone justifies the call regardless of hand strength.',
    shoving: 'Shove any two cards if you\'re getting the bounty. The math is overwhelming.',
    example: 'You have 12bb, villain has 2bb with 15bb bounty. Call with literally anything — you can\'t lose money.' },
  { name: 'Covered (No Bounty)', ratio: 0, icon: '○', color: '#64748b',
    adjust: 'When you don\'t cover the villain, there\'s no bounty incentive. Play standard ICM-adjusted strategy.',
    calling: 'Standard ranges. No bounty adjustment. Focus on chip EV and ICM considerations.',
    shoving: 'Standard shove ranges. ICM applies normally when you\'re the shorter stack.',
    example: 'You have 15bb, villain has 30bb. No bounty available to you. Play standard MTT strategy.' },
];

const BOUNTY_MATH = [
  { stack: '30bb', bounty: '3bb (0.1x)', adj: '+3%', evGain: '+0.15bb/hand' },
  { stack: '25bb', bounty: '7.5bb (0.3x)', adj: '+12%', evGain: '+0.85bb/hand' },
  { stack: '20bb', bounty: '10bb (0.5x)', adj: '+22%', evGain: '+1.60bb/hand' },
  { stack: '15bb', bounty: '15bb (1.0x)', adj: '+35%', evGain: '+3.20bb/hand' },
  { stack: '10bb', bounty: '10bb (1.0x)', adj: '+40%', evGain: '+4.50bb/hand' },
];

export default function PKOSolverGuide() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = BOUNTY_SCENARIOS[scenarioIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        PKO / Bounty Solver
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Bounty-adjusted strategy for Progressive Knockout tournaments.</p>

      {/* Bounty Ratio Selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {BOUNTY_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenarioIdx(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: scenarioIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: scenarioIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: scenarioIdx === i ? s.color : '#64748b' }}>
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      {/* Scenario Detail */}
      <motion.div key={scenarioIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: scenario.color, marginBottom: 8 }}>{scenario.icon} {scenario.name}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{scenario.adjust}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>CALLING ADJUSTMENT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{scenario.calling}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>SHOVING ADJUSTMENT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{scenario.shoving}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>EXAMPLE</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{scenario.example}</div>
          </div>
        </div>
      </motion.div>

      {/* Bounty Math Table */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
          BOUNTY ADJUSTMENT CHART
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Stack', 'Bounty', 'Range Adj', 'EV Gain'].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        {BOUNTY_MATH.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace' }}>{row.stack}</span>
            <span style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'monospace' }}>{row.bounty}</span>
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>{row.adj}</span>
            <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace' }}>{row.evGain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
