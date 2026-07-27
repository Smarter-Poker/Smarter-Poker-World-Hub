/**
 * SmallBlindComplete — SB Strategy (3-Bet or Fold / Complete)
 * Complete guide to the hardest position at the table
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SB_STRATEGIES = [
  { title: 'SB vs Open (3B or Fold)', color: '#ef4444', icon: '▲',
    desc: 'Against a raise, the SB should mostly 3-bet or fold. Calling creates a bloated pot OOP.',
    ranges: [
      { label: '3-Bet Value', hands: 'QQ+, AKs, AKo', color: '#22c55e' },
      { label: '3-Bet Bluff', hands: 'A5s-A2s, K5s, Q5s (blockers)', color: '#f59e0b' },
      { label: 'Fold', hands: 'Everything else — don\'t flat OOP', color: '#ef4444' },
    ],
    tip: 'Flatting from SB is a major leak. You\'re OOP with a capped range. 3-bet or fold.' },
  { title: 'SB Complete vs Limp', color: '#22c55e', icon: '·',
    desc: 'When there are limpers, SB can complete for 0.5 BB getting great odds.',
    ranges: [
      { label: 'Complete', hands: 'Any suited hand, small pairs, connectors — amazing pot odds', color: '#22c55e' },
      { label: 'Raise to ISO', hands: 'JJ+, AQ+, KQs — isolate the limpers', color: '#f59e0b' },
    ],
    tip: 'You\'re getting 3:1+ odds. Complete wide. But raise premiums to thin the field.' },
  { title: 'SB vs BB (heads up)', color: '#3b82f6', icon: '»',
    desc: 'SB vs BB is a unique dynamic. Open to 2.5-3x with a wide range.',
    ranges: [
      { label: 'Open-Raise', hands: '~55-65% of hands — very wide', color: '#22c55e' },
      { label: 'Limp', hands: 'Weak suited hands, K2o-K5o — too weak to raise, too good to fold', color: '#f59e0b' },
      { label: 'Fold', hands: 'Bottom ~20% — total trash', color: '#ef4444' },
    ],
    tip: 'Some solvers recommend a mixed limp/raise strategy from SB vs BB. Both are valid.' },
];

export default function SmallBlindComplete() {
  const [stratIdx, setStratIdx] = useState(0);
  const strat = SB_STRATEGIES[stratIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Small Blind Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The hardest position — minimize losses with the right approach.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {SB_STRATEGIES.map((s, i) => (
          <button key={i} onClick={() => setStratIdx(i)}
            style={{ padding: '10px 6px', borderRadius: 8, border: stratIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: stratIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{s.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: stratIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={stratIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{strat.desc}</p>

        {strat.ranges.map((r, i) => (
          <div key={i} style={{ background: `${r.color}08`, borderLeft: `3px solid ${r.color}`, borderRadius: 8, padding: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{r.label}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{r.hands}</div>
          </div>
        ))}

        <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Key Insight</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{strat.tip}</div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>SB Expected Loss</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Even the best players lose ~15-25 bb/100 from the SB. The goal is to lose LESS, not win.</div>
      </div>
    </div>
  );
}
