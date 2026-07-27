/**
 * MergeRangeGuide — Merged vs Polarized Ranges
 * Understanding when to use a merged range vs a polarized range
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RANGE_TYPES = [
  { type: 'Polarized', icon: '⌁', color: '#ef4444',
    desc: 'Your betting range contains only very strong hands (value) and bluffs. No medium-strength hands.',
    when: ['Flop c-bets on wet boards', 'River bets (most common spot)', 'Large bet sizes (75%+ pot)', '3-bet pots'],
    example: 'River: You bet 75% pot with sets+ and missed draws. Your medium pairs check behind for showdown.',
    visual: { value: 30, bluff: 20, medium: 0 } },
  { type: 'Merged', icon: '↻', color: '#3b82f6',
    desc: 'Your betting range includes strong AND medium-strength hands. Few or no bluffs.',
    when: ['Dry board flops (K72r, A52r)', 'Small bet sizes (25-33% pot)', 'Against calling stations', 'When villain doesn\'t fold often'],
    example: 'Flop K72r: You bet 33% with all Kx, all pairs, even A-high. Your whole range bets.',
    visual: { value: 35, bluff: 5, medium: 40 } },
  { type: 'Linear', icon: '▲', color: '#22c55e',
    desc: 'Betting your best hands and calling/checking your worst. Pure value-based ordering.',
    when: ['Pre-flop opening ranges', 'Calling 3-bets', 'Multi-way pots', 'When you want to simplify'],
    example: 'Pre-flop: Open your top 25% of hands. 3-bet your top 5%. Fold the rest.',
    visual: { value: 50, bluff: 0, medium: 30 } },
];

export default function MergeRangeGuide() {
  const [typeIdx, setTypeIdx] = useState(0);
  const rangeType = RANGE_TYPES[typeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Range Types Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Polarized vs Merged vs Linear — the three betting paradigms.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {RANGE_TYPES.map((r, i) => (
          <button key={i} onClick={() => setTypeIdx(i)}
            style={{ padding: '10px 6px', borderRadius: 10, border: typeIdx === i ? `2px solid ${r.color}` : '1px solid rgba(255,255,255,0.06)',
              background: typeIdx === i ? `${r.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{r.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: typeIdx === i ? r.color : '#64748b' }}>{r.type}</div>
          </button>
        ))}
      </div>

      <motion.div key={typeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{rangeType.desc}</p>

        {/* Visual range bar */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Betting Range Composition</div>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${rangeType.visual.value}%` }}
              style={{ background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000' }}>
              {rangeType.visual.value > 10 && 'Value'}
            </motion.div>
            <motion.div initial={{ width: 0 }} animate={{ width: `${rangeType.visual.medium}%` }}
              style={{ background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000' }}>
              {rangeType.visual.medium > 10 && 'Medium'}
            </motion.div>
            <motion.div initial={{ width: 0 }} animate={{ width: `${rangeType.visual.bluff}%` }}
              style={{ background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
              {rangeType.visual.bluff > 10 && 'Bluff'}
            </motion.div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#64748b' }}>
              Check
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: rangeType.color, marginBottom: 6 }}>When to Use {rangeType.type}:</div>
        {rangeType.when.map((w, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: rangeType.color }}>•</span> {w}
          </div>
        ))}

        <div style={{ marginTop: 8, background: `${rangeType.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${rangeType.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: rangeType.color }}>Example</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{rangeType.example}</div>
        </div>
      </motion.div>
    </div>
  );
}
