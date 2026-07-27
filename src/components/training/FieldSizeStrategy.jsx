/**
 * FieldSizeStrategy — Field Size & Tournament Selection
 * How field size affects variance, ROI, and strategy
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FIELD_SIZES = [
  { size: 'Heads-Up (2 players)', icon: '●', color: '#22c55e',
    variance: 'Low — smallest field means most consistent results.',
    roi: 'Skilled players can achieve 3-5% ROI.',
    strategy: 'Pure poker skill. No ICM. Aggression and hand-reading are everything.',
    edge: 'Highest edge per game. But rake is proportionally higher.' },
  { size: 'SNG (6-10 players)', icon: '●', color: '#3b82f6',
    variance: 'Low-Medium — small fields mean faster convergence to true ROI.',
    roi: 'Good players achieve 5-10% ROI in 6-max, 3-8% in 9-max.',
    strategy: 'Early game: tight. Bubble: ICM-aware. Push/fold charts essential for short stacks.',
    edge: 'Great for consistent grinders. Lower variance than MTTs but lower upside too.' },
  { size: 'Small MTT (50-200 players)', icon: '■', color: '#f59e0b',
    variance: 'Medium — need 200+ tournament sample for meaningful results.',
    roi: 'Strong players: 15-30% ROI.',
    strategy: 'Standard MTT approach. Early accumulation, bubble ICM, final table aggression.',
    edge: 'Sweet spot: enough runners for good prizes, small enough that skill matters quickly.' },
  { size: 'Large MTT (500-5,000)', icon: '○', color: '#8b5cf6',
    variance: 'High — massive fields mean long stretches without cashing.',
    roi: 'Elite players: 30-80% ROI. But you need a 1,000+ sample to verify.',
    strategy: 'Early: chip accumulation is key. You need a big stack to navigate deep. ICM matters late.',
    edge: 'Higher upside (bigger prizes) but much more variance. Need strong bankroll management.' },
  { size: 'Massive MTT (10,000+)', icon: '○', color: '#ef4444',
    variance: 'Extreme — even great players have huge downswings.',
    roi: 'Best players: 50-100%+ ROI. But swings are brutal.',
    strategy: 'Play for first. Min-cashes are irrelevant in massive fields. Accumulate or bust early.',
    edge: 'Lottery-like variance but soft fields (many recs). Best risk-reward if bankrolled properly.' },
];

export default function FieldSizeStrategy() {
  const [sizeIdx, setSizeIdx] = useState(0);
  const field = FIELD_SIZES[sizeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Field Size Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How field size changes variance, ROI, and approach.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {FIELD_SIZES.map((f, i) => (
          <button key={i} onClick={() => setSizeIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: sizeIdx === i ? `2px solid ${f.color}` : '1px solid rgba(255,255,255,0.06)',
              background: sizeIdx === i ? `${f.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{f.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: sizeIdx === i ? f.color : '#64748b' }}>{f.size.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={sizeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{field.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: field.color }}>{field.size}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Variance', text: field.variance, color: '#ef4444' },
            { label: 'Expected ROI', text: field.roi, color: '#22c55e' },
            { label: 'Strategy', text: field.strategy, color: '#3b82f6' },
            { label: 'Edge Factor', text: field.edge, color: field.color },
          ].map((s, i) => (
            <div key={i} style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.text}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
