/**
 * FullRingStrategy — Full Ring (9-Max) Strategy Guide
 * Adjustments and strategy for full ring play
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FR_CONCEPTS = [
  { concept: 'Tight is Right (Mostly)', icon: '■', color: '#22c55e',
    detail: 'Full ring rewards patience. With 8 opponents, someone usually has a hand. Play fewer, better hands.',
    ranges: 'UTG: ~13% | UTG+1: ~14% | MP: ~16% | MP+1: ~18% | HJ: ~22% | CO: ~27% | BTN: ~38% | SB: 3bet/fold ~30% | BB: defend ~40%',
    keyDiff: 'Compared to 6-max, every position opens ~5% tighter. UTG in full ring is the tightest open in poker.',
    tip: 'If you\'re opening more than 15% from UTG in full ring, you\'re too loose. Discipline is profit.' },
  { concept: 'Position is Amplified', icon: '◆', color: '#3b82f6',
    detail: 'With more players behind, early position hands face more risk. Late position advantage is massive.',
    ranges: 'CO and BTN account for 60%+ of your profit in full ring. EP should be breakeven or slightly positive.',
    keyDiff: 'In 6-max, UTG is playable wide. In full ring, UTG is almost like the SB — a losing position by default.',
    tip: 'Track your win rate by position. If EP isn\'t near breakeven, you\'re playing too many hands there.' },
  { concept: 'Multiway Pot Dynamics', icon: '●', color: '#ef4444',
    detail: 'Full ring creates more multiway pots. Your equity realization drops with more players in the hand.',
    ranges: 'In 3-way+ pots, suited connectors gain value, offsuit broadways lose value. Pairs and sets are gold.',
    keyDiff: '6-max pots are usually heads-up. Full ring pots are often 3-4 way. Adjust your hand selection accordingly.',
    tip: 'In multiway pots, bet for value with strong hands. Bluff less — someone usually has something.' },
  { concept: 'Blind Defense is Less Critical', icon: '■', color: '#f59e0b',
    detail: 'You\'re in the blinds only 22% of the time (vs 33% in 6-max). You can afford to fold more from the blinds.',
    ranges: 'BB defense: ~35-45% vs CO/BTN. Tighter than 6-max because more players = stronger open ranges.',
    keyDiff: 'In 6-max, blind defense is critical. In full ring, you can survive with tighter blind play.',
    tip: 'Don\'t over-defend your BB in full ring. Respect EP and MP opens — they have real hands.' },
  { concept: 'Nit Strategy & Table Image', icon: '◇', color: '#8b5cf6',
    detail: 'Full ring allows you to cultivate a tight image, then exploit it with well-timed aggression.',
    ranges: 'Play tight for 30 minutes, then make a big 3-bet bluff. Your table image makes it credible.',
    keyDiff: 'In 6-max, everyone plays wide and image matters less. In full ring, a tight image is a weapon.',
    tip: 'Use your nit image as a weapon. When you finally 3-bet from UTG, everyone folds — even strong hands.' },
];

export default function FullRingStrategy() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = FR_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Full Ring (9-Max) Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master 9-handed play — the classic poker format.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {FR_CONCEPTS.map((c, i) => (
          <button key={i} onClick={() => setConceptIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: conceptIdx === i ? `2px solid ${c.color}` : '1px solid rgba(255,255,255,0.06)',
              background: conceptIdx === i ? `${c.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{c.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: conceptIdx === i ? c.color : '#64748b' }}>{c.concept.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={conceptIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{concept.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: concept.color }}>{concept.concept}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{concept.detail}</p>
        <div style={{ background: `${concept.color}08`, borderRadius: 8, padding: 8, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Key Numbers</div>
          <div style={{ fontSize: 11, color: concept.color }}>{concept.ranges}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>vs 6-Max</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.keyDiff}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Pro Tip</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.tip}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
