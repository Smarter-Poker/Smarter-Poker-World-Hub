/**
 * CashGameBuyIn — Cash Game Buy-In & Stack Management
 * Optimal buy-in strategy and stack size management
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BUYIN_TOPICS = [
  { title: 'Maximum Buy-In (100bb)', icon: '●', color: '#22c55e',
    detail: 'Always buy in for the maximum allowed. More chips = more decisions = more edge for skilled players.',
    why: 'Deep stacks let you play more hands profitably, realize implied odds, and apply maximum pressure on opponents.',
    when: 'Default choice for any game where you have an edge. If you\'re a winning player, buy in full every time.',
    math: 'At NL100 (100bb = $100): You maximize your edge per hand. Expected value scales with stack depth for skilled players.' },
  { title: 'Short Stack Strategy (20-40bb)', icon: '■', color: '#ef4444',
    detail: 'Some players intentionally buy in short to simplify decisions. With 20-40bb, most hands become push/fold or 1-street plays.',
    why: 'Reduces post-flop complexity. Good for players weak at post-flop play or learning fundamentals.',
    when: 'When you\'re a beginner, playing above your skill level, or multi-tabling and want simpler decisions.',
    math: 'At 20bb, all-in preflop or on the flop is standard. SPR ≈ 2 after a 3x open, meaning 1 bet commits you.' },
  { title: 'Top-Off Strategy', icon: '↻', color: '#3b82f6',
    detail: 'Always top off to maximum when your stack drops below 100bb. Never sit with 60-80bb — it\'s the worst of both worlds.',
    why: 'With 70bb you\'re too deep for short-stack play but too shallow for deep-stack maneuvers. It\'s an awkward, -EV stack size.',
    when: 'After every hand where you lose chips. Most sites let you add chips between hands. Do it automatically.',
    math: 'If you lose a 30bb pot and drop to 70bb, immediately top up to 100bb. The difference in EV is significant.' },
  { title: 'Deep Stack Games (200bb+)', icon: '▲', color: '#8b5cf6',
    detail: 'Some games allow 200bb+ buy-ins. These are extremely skill-intensive — the best players in the world thrive in deep games.',
    why: 'At 200bb, you can play every hand type: set-mining, floating, multi-street bluffs, thin value bets. Maximum skill expression.',
    when: 'Only if you\'re a strong post-flop player with deep-stack experience. Weak players get crushed at 200bb.',
    math: 'SPR after a 3x open at 200bb ≈ 12. You can comfortably bet 3 streets and still have fold equity on the river.' },
  { title: 'Table Stakes & Risk', icon: '▲', color: '#f59e0b',
    detail: 'Never have more than 5% of your bankroll on any single table. If you\'re playing NL100, you need at least $2,000.',
    why: 'Variance in poker is extreme. Even winning players can lose 10+ buy-ins in a row. Bankroll management prevents going broke.',
    when: 'Always. This is non-negotiable. If you can\'t afford 20 buy-ins, move down in stakes.',
    math: 'Recommended: 20-30 buy-ins for cash games. At NL50: $1,000-$1,500. At NL100: $2,000-$3,000.' },
];

export default function CashGameBuyIn() {
  const [idx, setIdx] = useState(0);
  const t = BUYIN_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Cash Game Buy-In Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Optimize your stack size for maximum profit.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {BUYIN_TOPICS.map((topic, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${topic.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${topic.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? topic.color : '#64748b' }}>
            {topic.icon} {topic.title.split(' (')[0]}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.color, marginBottom: 8 }}>{t.icon} {t.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{t.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${t.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${t.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>WHY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.why}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>WHEN</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.when}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6', fontFamily: 'monospace' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>MATH</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.math}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
