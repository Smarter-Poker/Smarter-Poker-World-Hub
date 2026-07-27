/**
 * RangePolarizerTool — Visualize Range Polarization
 * See how your range splits into value, bluffs, and medium on each street
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STREET_RANGES = [
  { street: 'Pre-Flop', icon: '◇', ranges: [
    { action: 'Open Raise (BTN)', value: 25, medium: 20, bluff: 0, check: 55 },
    { action: '3-Bet (vs CO)', value: 5, medium: 3, bluff: 4, check: 88 },
    { action: 'Call 3-Bet (IP)', value: 0, medium: 10, bluff: 0, check: 90 },
  ]},
  { street: 'Flop', icon: '◇', ranges: [
    { action: 'C-Bet (dry board)', value: 20, medium: 30, bluff: 20, check: 30 },
    { action: 'C-Bet (wet board)', value: 15, medium: 10, bluff: 20, check: 55 },
    { action: 'Check-Raise (OOP)', value: 5, medium: 0, bluff: 7, check: 88 },
  ]},
  { street: 'Turn', icon: '↻', ranges: [
    { action: 'Barrel (after c-bet)', value: 20, medium: 10, bluff: 15, check: 55 },
    { action: 'Probe (vs missed c-bet)', value: 10, medium: 15, bluff: 15, check: 60 },
    { action: 'Check-Raise', value: 8, medium: 0, bluff: 4, check: 88 },
  ]},
  { street: 'River', icon: '★', ranges: [
    { action: 'Value Bet (pot)', value: 25, medium: 0, bluff: 12, check: 63 },
    { action: 'Value Bet (1/3)', value: 30, medium: 15, bluff: 5, check: 50 },
    { action: 'Overbet (1.5x)', value: 20, medium: 0, bluff: 10, check: 70 },
  ]},
];

export default function RangePolarizerTool() {
  const [streetIdx, setStreetIdx] = useState(3);
  const street = STREET_RANGES[streetIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Range Polarizer
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Visualize how your range splits between value, bluffs, and medium.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {STREET_RANGES.map((s, i) => (
          <button key={i} onClick={() => setStreetIdx(i)}
            style={{ padding: '8px 6px', borderRadius: 8, border: streetIdx === i ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.06)',
              background: streetIdx === i ? 'rgba(139,92,246,0.15)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{s.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: streetIdx === i ? '#8b5cf6' : '#64748b' }}>{s.street}</div>
          </button>
        ))}
      </div>

      <motion.div key={streetIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'grid', gap: 12 }}>
        {street.ranges.map((r, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{r.action}</div>
            <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${r.value}%` }} transition={{ duration: 0.6 }}
                style={{ background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#000' }}>
                {r.value > 8 && `${r.value}%`}
              </motion.div>
              <motion.div initial={{ width: 0 }} animate={{ width: `${r.medium}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                style={{ background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#000' }}>
                {r.medium > 8 && `${r.medium}%`}
              </motion.div>
              <motion.div initial={{ width: 0 }} animate={{ width: `${r.bluff}%` }} transition={{ duration: 0.6, delay: 0.2 }}
                style={{ background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                {r.bluff > 8 && `${r.bluff}%`}
              </motion.div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
              <span><span style={{ color: '#22c55e' }}>●</span> Value {r.value}%</span>
              <span><span style={{ color: '#f59e0b' }}>●</span> Medium {r.medium}%</span>
              <span><span style={{ color: '#ef4444' }}>●</span> Bluff {r.bluff}%</span>
              <span><span style={{ color: '#475569' }}>●</span> Check {r.check}%</span>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
