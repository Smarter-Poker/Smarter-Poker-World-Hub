/**
 * HandCombinatorics — Hand Combinatorics Guide
 * Count combos to make better decisions
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const COMBO_LESSONS = [
  { topic: 'Pocket Pair Combos', icon: '◇', color: '#ef4444',
    combos: '6 combos per pair (e.g., AA = A♠A♥, A♠A♦, A♠A♣, A♥A♦, A♥A♣, A♦A♣)',
    onBoard: 'If one card is on board, only 3 combos remain. Two cards = 1 combo.',
    why: 'Pairs are rarer than you think. Only 6 combos of AA vs 16 combos of AK.',
    exercise: 'Board: A♠K♥7♦. How many combos of KK? Answer: 3 (K can\'t be K♥ since it\'s on board).' },
  { topic: 'Unpaired Hand Combos', icon: '◇', color: '#3b82f6',
    combos: '16 combos total: 4 suited (AKs) + 12 offsuit (AKo).',
    onBoard: 'Each board card removes combos. AK with A on board = 4×3 = 12 combos (not 16).',
    why: 'Unpaired hands are 2.7x more common than pairs. This matters for range construction.',
    exercise: 'Board: A♠K♥7♦. How many combos of AK? Answer: 3×3 = 9 (one A and one K are out).' },
  { topic: 'Set Combos on Board', icon: '◆', color: '#22c55e',
    combos: 'For any board card, there are exactly 3 combos of sets (e.g., board has 7♦ → 7♠7♥, 7♠7♣, 7♥7♣).',
    onBoard: 'Across a 3-card flop, there are 9 possible set combos (3 per card).',
    why: 'Sets are rare! Only 3 combos each. Don\'t overweight them in villain\'s range.',
    exercise: 'Board: Q♠J♦T♣. Total set combos? Answer: 9 (3 for QQ + 3 for JJ + 3 for TT).' },
  { topic: 'Suited vs Offsuit', icon: '♠♥', color: '#f59e0b',
    combos: 'Suited hands: 4 combos. Offsuit hands: 12 combos. Ratio is always 1:3.',
    onBoard: 'Suited combos matter for flush draws. On a two-heart board, only hearts-hearts combos make flush draws.',
    why: 'When counting flush draw combos, each suited combo has only 1 relevant suit.',
    exercise: 'How many combos of A♥x♥ (nut flush draw)? Answer: 12 combos (A♥ paired with each non-heart).' },
  { topic: 'Blocker Math', icon: '✕', color: '#8b5cf6',
    combos: 'Holding a card removes combos. Holding A♠ removes 3 combos of AA, 4 combos of AK, etc.',
    onBoard: 'Blockers are most powerful on the river when ranges are narrow.',
    why: 'If you hold the A♠ on a 3-spade board, villain has ZERO combos of the nut flush.',
    exercise: 'You hold K♠K♥. How many combos of KK does villain have? Answer: 1 (K♦K♣).' },
];

export default function HandCombinatorics() {
  const [topicIdx, setTopicIdx] = useState(0);
  const topic = COMBO_LESSONS[topicIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Hand Combinatorics
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Count combos like a pro. The math behind ranges.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {COMBO_LESSONS.map((t, i) => (
          <button key={i} onClick={() => setTopicIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: topicIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: topicIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{t.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: topicIdx === i ? t.color : '#64748b' }}>{t.topic.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={topicIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{topic.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: topic.color }}>{topic.topic}</span>
        </div>
        <div style={{ background: `${topic.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Base Combos</div>
          <div style={{ fontSize: 12, color: topic.color }}>{topic.combos}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>On a Board</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{topic.onBoard}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Why It Matters</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{topic.why}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Practice Exercise</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{topic.exercise}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
