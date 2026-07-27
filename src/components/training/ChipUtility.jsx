/**
 * ChipUtility — Chip Utility & Diminishing Value
 * Why tournament chips have non-linear value
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const UTILITY_CONCEPTS = [
  { concept: 'Chips Won ≠ Chips Lost', icon: '◇', color: '#ef4444',
    detail: 'In tournaments, winning 1,000 chips is worth LESS than losing 1,000 chips costs you. This is the fundamental ICM insight.',
    example: 'With 10K chips, winning 10K more doesn\'t double your equity. But losing 10K eliminates you completely.',
    implication: 'Be more risk-averse in tournaments than in cash games. Avoid marginal coinflips.',
    math: 'First chip: maximum value. Each additional chip: slightly less value. Last chip: infinite value (survival).' },
  { concept: 'Survival Premium', icon: '■', color: '#22c55e',
    detail: 'Simply staying alive in a tournament has value because other players bust. Your equity increases just by surviving.',
    example: 'With 1 BB left, your equity is still positive because you might double, double, double and run deep.',
    implication: 'Never give up. Even a tiny stack has value. Someone might bust before you.',
    math: 'Even with 1 chip, your probability of winning the tournament is non-zero. ICM guarantees min equity.' },
  { concept: 'Big Stack Privilege', icon: '★', color: '#3b82f6',
    detail: 'Big stacks can apply pressure without risking elimination. They can bully medium and short stacks who can\'t afford to gamble.',
    example: 'With 100 BB, losing a 20 BB pot doesn\'t end your tournament. Short stacks can\'t take that risk.',
    implication: 'As big stack: abuse your position. Raise wide, put pressure. You can afford mistakes.',
    math: 'Big stack\'s first 20 BB are worth less than a short stack\'s 20 BB. Use this asymmetry.' },
  { concept: 'Pay Jump Impact', icon: '●', color: '#f59e0b',
    detail: 'As players bust near pay jumps, the value of surviving increases dramatically.',
    example: '4th pays $3K, 3rd pays $5K. Surviving from 4th to 3rd is worth $2K. Don\'t gamble that away.',
    implication: 'Near pay jumps, tighten drastically unless you\'re the big stack. Let others bust.',
    math: 'The ICM tax on marginal calls increases as you get closer to a pay jump. Fold equity skyrockets.' },
  { concept: 'Cash Game vs Tournament Chips', icon: '↻', color: '#8b5cf6',
    detail: 'In cash games, every chip has equal value (you can leave anytime). In tournaments, chips have diminishing marginal utility.',
    example: '$100 in cash = $100 always. 10K tournament chips might be worth $50 in equity at one point and $200 later.',
    implication: 'Don\'t play tournaments like cash games. The math is different. ICM > chip EV.',
    math: 'Cash: linear utility. Tournaments: concave utility curve. Same chip count, different real-world value.' },
];

export default function ChipUtility() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = UTILITY_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Chip Utility Theory
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Why tournament chips have non-linear value.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {UTILITY_CONCEPTS.map((c, i) => (
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
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{concept.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Example', text: concept.example, color: '#3b82f6' },
            { label: 'Implication', text: concept.implication, color: '#22c55e' },
            { label: 'The Math', text: concept.math, color: concept.color },
          ].map((s, i) => (
            <div key={i} style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.text}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
