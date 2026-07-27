/**
 * SmallBallStrategy — Small Ball Poker Framework
 * Playing a low-variance, high-frequency style with small bets and controlled pots
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PRINCIPLES = [
  { title: 'See More Flops Cheaply', icon: '○', desc: 'Open wider in position with small sizings (2-2.2x). Play more pots, risk less per pot.',
    example: 'Open K9s from CO for 2x instead of folding. Your position and skill edge compensates for the marginal hand.' },
  { title: 'Small C-Bets, High Frequency', icon: '◆', desc: 'Bet 25-33% pot on most flops. Wins more pots than checking, costs less when check-raised.',
    example: 'You open ATo, flop J♠7♣2♦. Bet 2.5 into 7.5. Villain folds 60%+ of the time.' },
  { title: 'Control Pot Size', icon: '●', desc: 'Keep pots small with medium-strength hands. Save big pots for big hands.',
    example: 'You have KQ on K♥8♣3♦. Bet small on flop, check turn for pot control, value bet river.' },
  { title: 'Positional Warfare', icon: '·', desc: 'Small ball thrives in position. Out of position, tighten up and play more straightforwardly.',
    example: 'IP you can float, probe, and take delayed stabs. OOP you need stronger hands.' },
  { title: 'Pick Up Dead Money', icon: '▼', desc: 'Many small wins > few big wins. Accumulate chips through steal attempts and light stabs.',
    example: 'Raise limpers, steal blinds, bet when checked to. Each 3-5 BB win adds up over a session.' },
];

const SIZING_GUIDE = [
  { street: 'Preflop', size: '2-2.2x', freq: 'Wide in position', note: 'Minimize risk, maximize VPIP IP' },
  { street: 'Flop', size: '25-33%', freq: '65-75% of flops', note: 'Small c-bet, high frequency' },
  { street: 'Turn', size: '40-55%', freq: 'Selective', note: 'Barrel with equity, check mediocre' },
  { street: 'River', size: '55-75%', freq: 'Polarized', note: 'Value or give up, rarely medium' },
];

export default function SmallBallStrategy() {
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Small Ball Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Low-variance, high-frequency poker — win many small pots with controlled risk.</p>

      {/* Sizing guide */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Sizing Blueprint</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {SIZING_GUIDE.map((s, i) => (
            <div key={i} style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.street}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{s.size}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{s.freq}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Principles */}
      <div style={{ display: 'grid', gap: 8 }}>
        {PRINCIPLES.map((p, i) => (
          <motion.div key={i} layout
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            style={{ background: expandedIdx === i ? 'rgba(34,197,94,0.08)' : 'rgba(0,0,0,0.2)',
              borderRadius: 10, padding: 12, cursor: 'pointer', border: expandedIdx === i ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.desc}</div>
              </div>
              <span style={{ color: '#64748b', fontSize: 16 }}>{expandedIdx === i ? '●' : '▶'}</span>
            </div>
            {expandedIdx === i && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ marginTop: 8, padding: 8, background: 'rgba(34,197,94,0.06)', borderRadius: 6, fontSize: 12, color: '#cbd5e1', borderLeft: '3px solid #22c55e' }}>
                 {p.example}
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
