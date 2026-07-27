/**
 * LateRegStrategy — Late Registration in Tournaments
 * When to late-reg and optimal strategy for re-entry MTTs
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LATE_REG_FACTORS = [
  { factor: 'Field Size Matters', icon: '', color: '#3b82f6',
    pro: 'Bigger fields = more value in late-regging. The fish who bust early can re-enter.',
    con: 'Very small fields — every chip matters from the start. Don\'t miss early levels.' },
  { factor: 'Structure Quality', icon: '', color: '#22c55e',
    pro: 'Deep structures (200BB+): Late reg is fine. You still have plenty of play.',
    con: 'Turbo/hyper structures: Every blind level matters. Late reg means starting short.' },
  { factor: 'Starting Stack vs Avg', icon: '', color: '#f59e0b',
    pro: 'If starting stack > 40BB, you can still play poker and have room to maneuver.',
    con: 'If starting stack < 20BB, you\'re in push/fold. Only late reg if the prize pool justifies it.' },
  { factor: 'Overlay Opportunities', icon: '', color: '#ef4444',
    pro: 'Late reg when there\'s a guaranteed prize pool not yet met — you\'re getting extra value.',
    con: 'If the tournament is already above guarantee, there\'s less mathematical incentive.' },
  { factor: 'Your Edge', icon: '', color: '#8b5cf6',
    pro: 'If you\'re significantly better than the field, playing more hands = more edge realized.',
    con: 'If the field is tough, late reg with a short stack removes your postflop edge.' },
];

export default function LateRegStrategy() {
  const [factorIdx, setFactorIdx] = useState(0);
  const factor = LATE_REG_FACTORS[factorIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ⏰ Late Registration Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>When to late-reg tournaments and how to play when you do.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {LATE_REG_FACTORS.map((f, i) => (
          <button key={i} onClick={() => setFactorIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: factorIdx === i ? `2px solid ${f.color}` : '1px solid rgba(255,255,255,0.06)',
              background: factorIdx === i ? `${f.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{f.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: factorIdx === i ? f.color : '#64748b' }}>{f.factor.substring(0,8)}</div>
          </button>
        ))}
      </div>

      <motion.div key={factorIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>{factor.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: factor.color }}>{factor.factor}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e'}}>Late Reg ✓</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{factor.pro}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444'}}>Register Early ✕</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{factor.con}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
