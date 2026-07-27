/**
 * StakesLadderGuide — Moving Up in Stakes
 * When and how to move up (and when to move back down)
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STAKES = [
  { name: 'NL2', bb: '$0.02', bi: '$2', color: '#94a3b8', skill: 'Beginner',
    moveUp: ['30+ buy-ins for NL5 ($150)', 'Winning at 5+ bb/100 over 30k hands', 'Understand basic preflop ranges'],
    expect: 'Very soft. Players make massive mistakes. Focus on value betting and avoiding bluffs.' },
  { name: 'NL5', bb: '$0.05', bi: '$5', color: '#22c55e', skill: 'Beginner+',
    moveUp: ['30+ buy-ins for NL10 ($300)', 'Winning at 4+ bb/100 over 50k hands', 'C-bet strategy and pot control mastered'],
    expect: 'Still soft but some players know basics. Tighten up slightly and exploit the limp-callers.' },
  { name: 'NL10', bb: '$0.10', bi: '$10', color: '#3b82f6', skill: 'Intermediate',
    moveUp: ['30+ buy-ins for NL25 ($750)', 'Winning at 3+ bb/100 over 75k hands', 'Comfortable with 3-bet pots and postflop play'],
    expect: 'First real stake. Some regs study. Need solid fundamentals and position awareness.' },
  { name: 'NL25', bb: '$0.25', bi: '$25', color: '#f59e0b', skill: 'Intermediate+',
    moveUp: ['30+ buy-ins for NL50 ($1500)', 'Winning at 3+ bb/100 over 100k hands', 'HUD usage and opponent profiling'],
    expect: 'Regs get tougher. Fish are fewer. Need to actively table select and exploit specific players.' },
  { name: 'NL50', bb: '$0.50', bi: '$50', color: '#ef4444', skill: 'Advanced',
    moveUp: ['30+ buy-ins for NL100 ($3000)', 'Winning at 2+ bb/100 over 150k hands', 'Solver-informed strategy'],
    expect: 'Serious stakes. Most players study. You need a clear edge and strong mental game.' },
  { name: 'NL100+', bb: '$1.00+', bi: '$100+', color: '#8b5cf6', skill: 'Expert',
    moveUp: ['Continuous improvement', 'Coaching / study groups', 'Elite mental game'],
    expect: 'The big leagues. Small edges, high variance. Rakeback matters. Network with other winners.' },
];

export default function StakesLadderGuide() {
  const [stakeIdx, setStakeIdx] = useState(2);
  const stake = STAKES[stakeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Stakes Ladder Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know when you're ready to move up — and when to move down.</p>

      {/* Ladder visual */}
      <div style={{ display: 'grid', gap: 4, marginBottom: 16 }}>
        {STAKES.map((s, i) => (
          <button key={i} onClick={() => setStakeIdx(i)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
              border: stakeIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: stakeIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.15)', cursor: 'pointer' }}>
            <div style={{ width: 50, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.name}</div>
            </div>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${(i + 1) / STAKES.length * 100}%`, background: s.color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, color: '#64748b', minWidth: 40, textAlign: 'right' }}>{s.bi}</span>
          </button>
        ))}
      </div>

      <motion.div key={stakeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: `${stake.color}08`, border: `1px solid ${stake.color}25`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: stake.color }}>{stake.name}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: `${stake.color}20`, color: stake.color }}>{stake.skill}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{stake.expect}</p>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 6 }}>✓ Move Up When:</div>
        {stake.moveUp.map((m, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#22c55e' }}>→</span> {m}
          </div>
        ))}
      </motion.div>

      <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>▲ Move DOWN When</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Below 20 buy-ins, losing at the stake over 50k+ hands, or if losing affects your mental game.</div>
      </div>
    </div>
  );
}
