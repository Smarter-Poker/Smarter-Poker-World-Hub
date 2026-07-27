/**
 * AnteStealGuide — Stealing with Antes in Play
 * How antes change preflop math and increase steal frequency
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ANTE_MATH = [
  { scenario: 'No Antes (Cash)', deadMoney: '1.5 BB', stealProfit: '+1.5 BB', openPct: '~28% CO', color: '#64748b',
    explain: 'Standard blinds only. Steal profit is the SB + BB (1.5 BB). Standard opening ranges.' },
  { scenario: '10% Ante (6-max)', deadMoney: '2.1 BB', stealProfit: '+2.1 BB', openPct: '~35% CO', color: '#3b82f6',
    explain: '0.6 BB extra dead money. You risk 2.2x to win 2.1 BB. Opens become much more profitable.' },
  { scenario: '12.5% BB Ante (MTT)', deadMoney: '2.25 BB', stealProfit: '+2.25 BB', openPct: '~38% CO', color: '#22c55e',
    explain: 'Common MTT format. Tons of dead money. Open wider and steal aggressively.' },
  { scenario: '25% Ante (Hyper)', deadMoney: '3.0 BB', stealProfit: '+3.0 BB', openPct: '~45% CO', color: '#f59e0b',
    explain: 'Huge antes = massive dead money. You should be stealing extremely wide in late position.' },
];

export default function AnteStealGuide() {
  const [scenIdx, setScenIdx] = useState(1);
  const scen = ANTE_MATH[scenIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        □‍▼ Ante Steal Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Antes change everything — steal wider when there's dead money.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {ANTE_MATH.map((s, i) => (
          <button key={i} onClick={() => setScenIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: scenIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: scenIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: scenIdx === i ? s.color : '#64748b' }}>{s.scenario}</div>
          </button>
        ))}
      </div>

      <motion.div key={scenIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Dead Money', val: scen.deadMoney, color: '#22c55e' },
            { label: 'Steal Profit', val: scen.stealProfit, color: '#f59e0b' },
            { label: 'CO Open %', val: scen.openPct, color: '#3b82f6' },
          ].map((s, i) => (
            <div key={i} style={{ background: `${s.color}10`, borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1' }}>{scen.explain}</p>
      </motion.div>

      <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>Rule of Thumb</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>For every 1 BB of extra dead money, widen your CO open range by ~5-7%.</div>
      </div>
    </div>
  );
}
