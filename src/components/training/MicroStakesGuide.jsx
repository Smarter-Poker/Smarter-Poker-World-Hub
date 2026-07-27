/**
 * MicroStakesGuide — Micro Stakes Strategy & Adjustments
 * Beating the lowest stakes with solid fundamentals
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MICRO_TIPS = [
  { title: 'Value Bet Relentlessly', icon: '●', color: '#22c55e',
    detail: 'At micros, players call too much. Bet thinner for value than you would at higher stakes. Top pair good kicker is often 3 streets of value.',
    mistake: 'Checking back rivers with strong hands "to be safe" — you\'re leaving money on the table.',
    adjustment: 'If villain calls 2 streets, they\'ll usually call 3. Size up on value bets (75-100% pot).' },
  { title: 'Bluff Less, Not Never', icon: '◇', color: '#ef4444',
    detail: 'Reduce bluff frequency by ~30% vs optimal. Players at micros are calling stations — but they still fold sometimes.',
    mistake: 'Triple-barreling as a bluff into players who never fold. Save your bluffs for good spots.',
    adjustment: 'Bluff on scary boards (4-flush, 4-straight). Skip bluffs on dry, paired boards where they "have something."' },
  { title: 'Play ABC Preflop', icon: '□', color: '#3b82f6',
    detail: 'Tight-aggressive preflop wins at micros. Don\'t get creative with 3-bet bluffs or 4-bet light — just play strong hands.',
    mistake: 'Over-adjusting and playing too loose because "it\'s just micros." Discipline still matters.',
    adjustment: 'Open 15-20% from EP, 25-30% from CO/BTN. 3-bet for value with QQ+, AKs. Fold the rest to 3-bets.' },
  { title: 'Ignore Bet Sizing Tells', icon: '○', color: '#f59e0b',
    detail: 'Many micro players don\'t understand sizing. A min-bet doesn\'t always mean weak, a pot-bet doesn\'t always mean strong.',
    mistake: 'Over-reading opponents who are just clicking buttons randomly.',
    adjustment: 'Focus on hand ranges and board texture, not sizing reads. Those come at higher stakes.' },
  { title: 'Table Select Aggressively', icon: '◆', color: '#8b5cf6',
    detail: 'The biggest edge at micros is finding tables with recreational players. One fish can double your win rate.',
    mistake: 'Sitting at tables full of other regs grinding the same strategy.',
    adjustment: 'Look for high VPIP tables (>30% average). Sit to the left of the loosest player.' },
];

export default function MicroStakesGuide() {
  const [tipIdx, setTipIdx] = useState(0);
  const tip = MICRO_TIPS[tipIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Micro Stakes Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Beat NL2-NL25 with rock-solid fundamentals.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {MICRO_TIPS.map((t, i) => (
          <button key={i} onClick={() => setTipIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: tipIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tipIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: tipIdx === i ? t.color : '#64748b' }}>
            {t.icon} {t.title}
          </button>
        ))}
      </div>

      <motion.div key={tipIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: tip.color, marginBottom: 8 }}>{tip.icon} {tip.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{tip.detail}</p>
        <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>COMMON MISTAKE</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{tip.mistake}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>ADJUSTMENT</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{tip.adjustment}</div>
        </div>
      </motion.div>
    </div>
  );
}
