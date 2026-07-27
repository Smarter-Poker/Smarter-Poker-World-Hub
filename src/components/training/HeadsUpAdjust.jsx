/**
 * HeadsUpAdjust — Heads-Up Play Adjustments
 * How to dominate 1v1 poker situations
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const HU_ADJUSTMENTS = [
  { area: 'Preflop Ranges', icon: '◇', color: '#22c55e',
    adjust: 'Open nearly every hand from the button (80-100%). Defend BB very wide (~70%). 3-bet BB ~25%.',
    why: 'With only one opponent, hand values increase dramatically. Even K2o has value on the button.',
    mistake: 'Playing too tight. If you fold more than 30% from the button HU, you\'re bleeding chips.',
    tip: 'Any ace, any king, any pair, any suited, any connected = auto-open on the button.' },
  { area: 'Aggression Frequency', icon: '▲', color: '#ef4444',
    adjust: 'C-bet 65-75% of flops. Double barrel 55-65% of turns. Aggression is king heads-up.',
    why: 'Your opponent misses the flop ~65% of the time. Aggression takes down pots by default.',
    mistake: 'Checking too much. If you check more than 40% of flops IP, you\'re way too passive.',
    tip: 'When in doubt, bet. HU rewards aggression more than any other format.' },
  { area: 'Positional Advantage', icon: '★', color: '#3b82f6',
    adjust: 'IP (button/SB) should play extremely aggressively. OOP (BB) should check-raise more often.',
    why: 'Position is EVERYTHING heads-up. The button acts last on every street and controls the pot.',
    mistake: 'Not utilizing position enough. IP should be printing money in HU — it\'s a massive advantage.',
    tip: 'Track your win rate IP vs OOP. If you\'re not winning significantly more IP, you\'re too passive.' },
  { area: 'Bluffing & Value', icon: '◇', color: '#f59e0b',
    adjust: 'Bluff more. Value bet thinner. Second pair is often a value bet HU. Ace-high can check down.',
    why: 'Ranges are wide, so hands that are mediocre in 6-max become strong HU.',
    mistake: 'Not bluffing enough. Your opponent folds a lot HU because their range is so wide.',
    tip: 'If you never get caught bluffing HU, you\'re not bluffing enough.' },
  { area: 'Adaptation Speed', icon: '◇', color: '#8b5cf6',
    adjust: 'Adjust every 10-20 hands. If villain folds to 3-bets, 3-bet more. If they call, bluff less.',
    why: 'HU gives you maximum information per hand. You see every showdown. Adapt constantly.',
    mistake: 'Playing the same strategy regardless of opponent. HU is about constant adjustment.',
    tip: 'Take notes on EVERY hand. What did they show? How did they react to your bets?' },
];

export default function HeadsUpAdjust() {
  const [areaIdx, setAreaIdx] = useState(0);
  const area = HU_ADJUSTMENTS[areaIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Heads-Up Adjustments
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Dominate 1v1 situations with these adjustments.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {HU_ADJUSTMENTS.map((a, i) => (
          <button key={i} onClick={() => setAreaIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: areaIdx === i ? `2px solid ${a.color}` : '1px solid rgba(255,255,255,0.06)',
              background: areaIdx === i ? `${a.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{a.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: areaIdx === i ? a.color : '#64748b' }}>{a.area.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={areaIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{area.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: area.color }}>{area.area}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Adjustment</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{area.adjust}</div>
          </div>
          <div style={{ background: `${area.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${area.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: area.color }}>Why</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{area.why}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Common Mistake</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{area.mistake}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Pro Tip</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{area.tip}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
