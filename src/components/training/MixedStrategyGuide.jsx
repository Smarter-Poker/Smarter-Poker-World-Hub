/**
 * MixedStrategyGuide — Mixed Strategy / GTO Frequencies
 * Understanding why solvers mix between actions
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MIXED_CONCEPTS = [
  { concept: 'Why Solvers Mix', icon: '◆', color: '#3b82f6',
    detail: 'GTO solvers mix between betting and checking (or different sizes) to stay unexploitable. If you always bet with a hand, opponents can exploit that pattern.',
    example: 'Solver checks AK on A♠7♦2♣ about 40% of the time. Why? To protect the checking range and trap.',
    practical: 'You don\'t need to mix perfectly. Use a simplified strategy: always bet with your strongest and weakest hands, check the middle.' },
  { concept: 'Indifference Principle', icon: '', color: '#22c55e',
    detail: 'At equilibrium, mixed strategy hands are indifferent between actions — each action has the SAME EV. The solver picks frequencies to make the opponent indifferent too.',
    example: 'If you\'re mixed between bet and check with KQ on a K-high board, both options are worth exactly the same in EV.',
    practical: 'If both options are equal EV, just pick one and be consistent. The error is small either way.' },
  { concept: 'Simplifying Mixed Strategies', icon: '', color: '#f59e0b',
    detail: 'In practice, you can simplify mixed strategies by choosing ONE action for each hand category. The EV loss is tiny compared to trying to randomize in-game.',
    example: 'Instead of betting AK 60% and checking 40%, just always bet AK. Then always check AQ. Net effect is similar.',
    practical: 'Split your range into clear categories: always bet, always check, always raise. No randomization needed.' },
  { concept: 'When to Deviate from GTO', icon: '', color: '#ef4444',
    detail: 'Against weak opponents, you should NOT mix. You should exploit. GTO mixing is only necessary vs strong, balanced opponents.',
    example: 'If villain never folds to river bets, stop bluffing entirely. Pure exploitation > balanced frequencies.',
    practical: 'Against regs: approximate GTO frequencies. Against fish: pure exploitation, no mixing needed.' },
  { concept: 'Common Mixing Spots', icon: '', color: '#8b5cf6',
    detail: 'The most common mixing spots: c-betting dry flops, checking back with medium hands IP, 3-betting vs late position opens, river bluffing frequency.',
    example: 'On K♠7♦2♣ as PFR: solver mixes between 33% c-bet with entire range and checking back hands like QQ, JJ.',
    practical: 'In mixed spots, ask: "What would villain exploit if I always did one thing?" Then do the opposite sometimes.' },
];

export default function MixedStrategyGuide() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = MIXED_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ◆ Mixed Strategy Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Why solvers mix and how to simplify for real play.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {MIXED_CONCEPTS.map((c, i) => (
          <button key={i} onClick={() => setConceptIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: conceptIdx === i ? `2px solid ${c.color}` : '1px solid rgba(255,255,255,0.06)',
              background: conceptIdx === i ? `${c.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{c.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: conceptIdx === i ? c.color : '#64748b' }}>{c.concept.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={conceptIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{concept.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: concept.color }}>{concept.concept}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{concept.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${concept.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${concept.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: concept.color }}>Example</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.example}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Practical Application</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.practical}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
