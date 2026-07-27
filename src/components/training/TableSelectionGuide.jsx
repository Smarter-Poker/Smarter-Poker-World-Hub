/**
 * TableSelectionGuide — Finding Profitable Tables
 * The most +EV skill in poker that most players ignore
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TABLE_INDICATORS = [
  { indicator: 'Average Pot Size', good: '> 15 BB', bad: '< 8 BB', weight: 'HIGH',
    desc: 'Bigger pots = more action = more fish. Look for tables with large average pots.' },
  { indicator: 'Players Per Flop %', good: '> 35%', bad: '< 20%', weight: 'HIGH',
    desc: 'More players seeing flops = more loose/passive players = more profit for you.' },
  { indicator: 'Number of Limpers', good: '2+ per hand', bad: '0 limpers', weight: 'MEDIUM',
    desc: 'Limpers are usually recreational players. Multiple limpers = great table.' },
  { indicator: 'Short Stackers', good: '0-1 at table', bad: '3+ at table', weight: 'MEDIUM',
    desc: 'Short stackers reduce your implied odds. Avoid tables full of 20-40 BB stacks.' },
  { indicator: 'Wait List Length', good: 'Short/None', bad: 'Long (5+)', weight: 'LOW',
    desc: 'Long wait lists mean regs are fighting for seats. The fish are surrounded by sharks.' },
];

const FISH_SIGNALS = [
  { signal: 'Limps preflop frequently', confidence: 95 },
  { signal: 'Min-bets or min-raises post-flop', confidence: 90 },
  { signal: 'Buys in for weird amounts (37 BB, 52 BB)', confidence: 85 },
  { signal: 'Uses the chat to complain about bad beats', confidence: 80 },
  { signal: 'Sits down with the minimum buy-in', confidence: 70 },
  { signal: 'Plays at odd hours (3 AM weekday)', confidence: 60 },
  { signal: 'Has no HUD stats (new to site)', confidence: 65 },
];

export default function TableSelectionGuide() {
  const [showSignals, setShowSignals] = useState(false);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Table Selection Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The easiest way to increase your win rate — play at better tables.</p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {TABLE_INDICATORS.map((ind, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{ind.indicator}</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
                background: ind.weight === 'HIGH' ? 'rgba(34,197,94,0.15)' : ind.weight === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                color: ind.weight === 'HIGH' ? '#22c55e' : ind.weight === 'MEDIUM' ? '#f59e0b' : '#64748b' }}>
                {ind.weight}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#22c55e'}}>✓ {ind.good}</span>
              <span style={{ fontSize: 11, color: '#ef4444'}}>✕ {ind.bad}</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{ind.desc}</div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowSignals(!showSignals)}
        style={{ width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none', fontWeight: 700, cursor: 'pointer',
          background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', fontSize: 14, marginBottom: 8 }}>
        {showSignals ? '▼' : '▶'} Fish Detection Signals
      </button>

      {showSignals && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          style={{ display: 'grid', gap: 6 }}>
          {FISH_SIGNALS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: '6px 10px' }}>
              <div style={{ width: 40, textAlign: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: s.confidence > 80 ? '#22c55e' : s.confidence > 70 ? '#f59e0b' : '#3b82f6' }}>
                  {s.confidence}%
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{s.signal}</span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
