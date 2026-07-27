/**
 * NodeLockingGuide — Node Locking Concepts
 * How to use node locking to find exploitative strategies
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const CONCEPTS = [
  { title: 'What is Node Locking?', icon: '■', color: '#3b82f6',
    content: 'Node locking is a solver technique where you fix one player\'s strategy and let the solver find the best counter-strategy. This models how to exploit specific opponent tendencies.',
    example: 'Lock villain to "never fold river" → solver shows you should never bluff river against them.' },
  { title: 'Lock: Villain Over-Folds', icon: '▼', color: '#22c55e',
    content: 'When villain folds too much to c-bets (>55%), node lock their strategy and the solver will tell you to bluff more.',
    example: 'Villain folds 65% to flop c-bet → Lock to 65% fold → Solver says: c-bet 90%+ with any two cards.' },
  { title: 'Lock: Villain Over-Calls', icon: '▲', color: '#ef4444',
    content: 'When villain calls too much, lock their calling frequency high. Solver will tell you to value bet thinner and bluff less.',
    example: 'Villain calls 80% of river bets → Lock → Solver says: bet top pair for value, never bluff.' },
  { title: 'Lock: Villain Over-Bluffs', icon: '◇', color: '#f59e0b',
    content: 'When villain bluffs too much on the river, lock their bluff frequency high. Solver says call down wider.',
    example: 'Villain bluffs 40% of river bets → Lock → Solver says: call with any pair, fold only air.' },
  { title: 'Practical Application', icon: '●', color: '#8b5cf6',
    content: 'Use HUD stats to identify leaks. Enter the leak into the solver via node locking. Apply the solver\'s counter-strategy at the table.',
    example: '1) Notice villain folds to 3-bet 75% | 2) Lock this in solver | 3) Solver says 3-bet very wide | 4) Print money.' },
];

export default function NodeLockingGuide() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Node Locking Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Fix villain's strategy, find the perfect exploit.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {CONCEPTS.map((c, i) => (
          <button key={i} onClick={() => setConceptIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: conceptIdx === i ? `linear-gradient(135deg, ${c.color}, ${c.color}cc)` : 'rgba(255,255,255,0.06)',
              color: conceptIdx === i ? '#fff' : '#94a3b8' }}>
            {c.icon} {c.title.substring(0, 15)}
          </button>
        ))}
      </div>

      <motion.div key={conceptIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{concept.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: concept.color }}>{concept.title}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{concept.content}</p>
        <div style={{ background: `${concept.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${concept.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: concept.color }}>Example</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.example}</div>
        </div>
      </motion.div>
    </div>
  );
}
