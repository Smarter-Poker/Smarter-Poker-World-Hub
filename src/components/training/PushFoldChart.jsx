/**
 * PushFoldChart — Push/Fold Strategy Charts
 * Optimal shoving ranges by position and stack depth
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PUSHFOLD_RANGES = [
  { stack: '15 BB — Button', color: '#22c55e', icon: '★',
    shoveRange: 'Any pair, A2s+, K5s+, Q8s+, J8s+, T8s+, 98s, A2o+, K9o+, QTo+, JTo',
    percentage: '~42%',
    reasoning: 'On the button with 15 BB, you only have SB and BB to get through. Wide shoving is very +EV.',
    keyHands: 'Shove K5s (61% vs calling range), shove Q8s (57%), fold 72o (28%)' },
  { stack: '15 BB — Cutoff', color: '#3b82f6', icon: '✕',
    shoveRange: 'Any pair, A2s+, K8s+, Q9s+, JTs, A3o+, KTo+, QJo',
    percentage: '~30%',
    reasoning: 'One more player behind than BTN. Tighten up slightly but still shove aggressively.',
    keyHands: 'Shove 55 (59% vs calling range), shove A5s (58%), fold J7s (44%)' },
  { stack: '10 BB — Button', color: '#f59e0b', icon: '⌁',
    shoveRange: 'Any pair, A2s+, K2s+, Q4s+, J7s+, T7s+, 97s+, 87s, 76s, A2o+, K5o+, Q8o+, J9o+, T9o',
    percentage: '~55%',
    reasoning: 'At 10 BB, you MUST shove wide from BTN. Fold equity alone makes most hands profitable.',
    keyHands: 'Shove K2s (56% fold equity alone), shove 76s (52%), even T7s is +EV' },
  { stack: '10 BB — UTG', color: '#ef4444', icon: '◆',
    shoveRange: '55+, A7s+, KTs+, QJs, ATo+, KQo',
    percentage: '~15%',
    reasoning: 'UTG with 10 BB is the tightest shove spot. 5+ players can wake up with a hand.',
    keyHands: 'Shove 66 (54%), shove ATs (60%), fold K9s (too many players behind)' },
  { stack: '5 BB — Any Position', color: '#8b5cf6', icon: '▼',
    shoveRange: 'BTN: Any two. CO: ~70%. MP: ~45%. UTG: ~30%.',
    percentage: 'Varies by position',
    reasoning: 'At 5 BB, every orbit costs you ~30% of your stack. You cannot afford to wait.',
    keyHands: 'BTN: shove 72o (yes, really). UTG: shove any pair, any Ax, any broadway' },
];

export default function PushFoldChart() {
  const [chartIdx, setChartIdx] = useState(0);
  const chart = PUSHFOLD_RANGES[chartIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Push/Fold Charts
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Mathematically optimal shove ranges by spot.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PUSHFOLD_RANGES.map((r, i) => (
          <button key={i} onClick={() => setChartIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: chartIdx === i ? `2px solid ${r.color}` : '1px solid rgba(255,255,255,0.06)',
              background: chartIdx === i ? `${r.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{r.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: chartIdx === i ? r.color : '#64748b' }}>{r.stack.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={chartIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: chart.color }}>{chart.stack}</div>
          <div style={{ background: `${chart.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: chart.color }}>{chart.percentage}</span>
          </div>
        </div>
        <div style={{ background: `${chart.color}08`, borderRadius: 8, padding: 10, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Shove Range</div>
          <div style={{ fontSize: 11, color: chart.color, lineHeight: 1.5 }}>{chart.shoveRange}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{chart.reasoning}</p>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Hands</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{chart.keyHands}</div>
        </div>
      </motion.div>
    </div>
  );
}
