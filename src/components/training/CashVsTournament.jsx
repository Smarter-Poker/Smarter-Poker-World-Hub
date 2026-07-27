/**
 * CashVsTournament — Cash Games vs Tournaments Comparison
 * Understanding the key differences between formats
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const COMPARISONS = [
  { topic: 'Chip Value', icon: '●', color: '#22c55e',
    cash: 'Every chip has a fixed dollar value. 100bb = $100 at NL100. You can cash out any time.',
    mtt: 'Chip value is non-linear. Your 50,000 chips in a tournament aren\'t worth 50,000x the buy-in. ICM determines real value.',
    impact: 'In cash, every +EV decision is correct. In MTTs, +ChipEV decisions can be -$EV due to ICM pressure.' },
  { topic: 'Risk & Variance', icon: '■', color: '#ef4444',
    cash: 'Lower variance. You can quit any time, top off your stack, and control session length. Consistent grind.',
    mtt: 'Higher variance. You can go months without a big score. The ROI comes in huge, infrequent spikes.',
    impact: 'Cash needs 20-30 buy-in bankroll. MTTs need 100-200 buy-ins due to extreme variance.' },
  { topic: 'Stack Depths', icon: '■', color: '#3b82f6',
    cash: 'Fixed at 100bb (or whatever you buy in for). Stack depth is consistent every hand.',
    mtt: 'Constantly changing. You might be 200bb deep one hand and 15bb the next. You must adjust continuously.',
    impact: 'Cash rewards deep-stack mastery. MTTs reward adaptability across all stack depths.' },
  { topic: 'Player Pool', icon: '●', color: '#f59e0b',
    cash: 'Same opponents over many sessions. Players adapt to each other. Meta-game and reads matter.',
    mtt: 'Constantly changing table draws. You play against thousands of unique players. Less meta-game.',
    impact: 'Cash rewards exploitation of known opponents. MTTs reward solid, balanced default strategies.' },
  { topic: 'Income & Lifestyle', icon: '■', color: '#8b5cf6',
    cash: 'Steady income stream. Easier to budget and plan. You know your hourly rate after ~50k hands.',
    mtt: 'Feast or famine. You might earn $0 for weeks, then score $50k in one night. Hard to budget.',
    impact: 'Cash is better for financial stability. MTTs are better for "swinging for the fences" and big life-changing scores.' },
];

export default function CashVsTournament() {
  const [idx, setIdx] = useState(0);
  const c = COMPARISONS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        » Cash Games vs Tournaments
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Understand the key differences between formats.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {COMPARISONS.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.topic}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: c.color, marginBottom: 12 }}>{c.icon} {c.topic}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>CASH GAMES</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.cash}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>TOURNAMENTS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.mtt}</div>
          </div>
          <div style={{ background: `${c.color}06`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.color }}>STRATEGIC IMPACT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.impact}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
