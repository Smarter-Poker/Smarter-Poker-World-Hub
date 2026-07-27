/**
 * MidStakesGuide — Mid Stakes Strategy (NL50-NL200)
 * Transitioning from ABC to balanced, exploitative play
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MID_CONCEPTS = [
  { title: 'Balance Your Ranges', icon: '◇', color: '#3b82f6',
    detail: 'Mid-stakes regs will notice if you only bet big with nutted hands. Mix in bluffs with your value bets at correct frequencies.',
    key: 'Aim for ~2:1 value-to-bluff on the river. On earlier streets, you can bluff more due to equity realization.',
    example: 'If you pot the river, you need to bluff 33% of the time to make villain indifferent to calling.' },
  { title: 'Exploit Population Tendencies', icon: '○', color: '#ef4444',
    detail: 'Even at mid-stakes, the pool has leaks. Most players over-fold to river raises, under-bluff turn check-raises, and over-call flop c-bets.',
    key: 'Use population data to deviate from GTO. Raise rivers for thin value, bluff turn x/r more, and reduce flop c-bet frequency.',
    example: 'If the pool folds to river raises 70%+ of the time, river raise bluffs print money.' },
  { title: 'Master 3-Bet Pots', icon: '◆', color: '#22c55e',
    detail: '3-bet pots are where the money is at mid-stakes. SPR is low, decisions are magnified, and small edges compound.',
    key: 'In 3-bet pots as the aggressor: c-bet 33% on most flops, barrel turns that improve your range, and give up on bad runouts.',
    example: 'As 3-bettor on K♠7♥2♦: c-bet small (33%). You have range advantage but not nut advantage on all runouts.' },
  { title: 'Position is Everything', icon: '·', color: '#f59e0b',
    detail: 'Your win rate IP vs OOP at mid-stakes will diverge sharply. Tighten up OOP, widen IP, and fight hard for button.',
    key: 'Expect ~80% of your profit from CO+BTN. Break even from blinds. Small loss from EP/MP.',
    example: 'If you\'re losing >5bb/100 from the BB at NL100, you\'re probably defending too wide or playing too passively postflop.' },
  { title: 'Study and Review', icon: '□', color: '#8b5cf6',
    detail: 'At mid-stakes, the players who study the most win the most. Solver work, hand reviews, and database analysis separate winners from losers.',
    key: 'Spend 50% of your "poker time" studying. Review every session. Run solver sims on your toughest spots.',
    example: 'After each session: filter for your biggest losing hands, run them through a solver, and find where you deviated.' },
];

export default function MidStakesGuide() {
  const [idx, setIdx] = useState(0);
  const c = MID_CONCEPTS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Mid Stakes Strategy (NL50-NL200)
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Level up from ABC poker to balanced, thinking play.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {MID_CONCEPTS.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.title}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: c.color, marginBottom: 8 }}>{c.icon} {c.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{c.detail}</p>
        <div style={{ background: `${c.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${c.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.color }}>KEY PRINCIPLE</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.key}</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>EXAMPLE</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.example}</div>
        </div>
      </motion.div>
    </div>
  );
}
