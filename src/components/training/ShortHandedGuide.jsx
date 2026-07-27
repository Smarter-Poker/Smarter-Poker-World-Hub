/**
 * ShortHandedGuide — 6-Max Strategy Guide
 * Adjustments for short-handed (6-max) play
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SH_CONCEPTS = [
  { concept: '6-Max vs Full Ring Ranges', icon: '', color: '#22c55e',
    detail: 'With 3 fewer players, you open wider from every position. UTG in 6-max ≈ MP in full ring.',
    ranges: 'UTG: ~18% | MP: ~22% | CO: ~28% | BTN: ~42% | SB: 3bet/fold ~38% | BB: defend ~45%',
    keyDiff: 'The biggest change: UTG opens 18% instead of 13%. Every position opens ~5% wider.',
    tip: 'If you\'re used to full ring, the transition to 6-max means opening more, defending more, and playing more pots.' },
  { concept: 'Blind Defense is Critical', icon: '', color: '#3b82f6',
    detail: 'You\'re in the blinds 33% of the time (vs 22% in full ring). Blind defense frequency matters more.',
    ranges: 'BB should defend ~45-55% vs CO/BTN opens. SB should 3-bet or fold ~35-40%.',
    keyDiff: 'In full ring, you can fold your way to profit. In 6-max, tight blind play = bleeding money.',
    tip: 'Master BB defense. It\'s the most important skill in 6-max poker.' },
  { concept: 'Aggression is Rewarded', icon: '▲', color: '#ef4444',
    detail: '6-max rewards aggressive play more than full ring. Fewer players means more stealing and 3-betting.',
    ranges: '3-Bet frequency should be 8-12% overall. vs BTN opens: 3-bet 12-16% from blinds.',
    keyDiff: 'Passive play gets punished. If your PFR is below 18%, you\'re leaving money on the table.',
    tip: 'Be the aggressor. 6-max is about putting pressure on opponents, not waiting for premiums.' },
  { concept: 'Postflop Skill Matters More', icon: '', color: '#f59e0b',
    detail: 'More hands played = more postflop decisions. Your edge comes from postflop play, not just preflop tightness.',
    ranges: 'You\'ll see 2-3x more flops than full ring. C-bet, barrel, and value bet frequencies all matter.',
    keyDiff: 'In full ring, a tight player can win without great postflop skill. In 6-max, you can\'t hide.',
    tip: 'Study postflop spots obsessively. That\'s where the money is in 6-max.' },
  { concept: 'Table Dynamics & Reads', icon: '', color: '#8b5cf6',
    detail: 'Fewer players = more frequent matchups. You\'ll play against the same opponents repeatedly.',
    ranges: 'Build reads faster. Note tendencies every 20-30 hands. Adjust exploitatively.',
    keyDiff: 'In full ring, you rarely face the same opponent. In 6-max, you battle the same 5 players all session.',
    tip: 'HUD stats are more useful in 6-max because you accumulate hands faster against each opponent.' },
];

export default function ShortHandedGuide() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = SH_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        6 6-Max Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master short-handed play — the most popular online format.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {SH_CONCEPTS.map((c, i) => (
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
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>vs Full Ring</div>
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
