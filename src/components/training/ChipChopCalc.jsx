/**
 * ChipChopCalc — Chip Chop & Deal-Making Calculator
 * Understanding ICM-based deals at final tables
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DEAL_TYPES = [
  { deal: 'Even Chop', icon: '●', color: '#22c55e',
    how: 'Split remaining prize pool equally among all players regardless of chip count.',
    when: 'Never optimal unless all stacks are nearly equal. Heavily favors short stacks.',
    example: '3 players left. Prizes: $5K/$3K/$2K. Even chop = $3,333 each. Chip leader gets robbed.',
    verdict: 'Almost always BAD for the chip leader. Only accept if you\'re the short stack.' },
  { deal: 'Chip Chop', icon: '■', color: '#3b82f6',
    how: 'Divide prize pool proportional to chip counts. Each player gets their share of total chips × total prizes.',
    when: 'Simple and fast. Better than even chop but still imperfect — doesn\'t account for ICM.',
    example: 'You have 50% of chips in play. Total remaining prizes = $10K. You get $5K.',
    verdict: 'Overvalues big stacks, undervalues small stacks. Use ICM chop instead.' },
  { deal: 'ICM Chop', icon: '■', color: '#f59e0b',
    how: 'Use ICM calculations to determine each player\'s tournament equity based on stack size and payout structure.',
    when: 'The mathematically fairest deal. Accounts for the non-linear relationship between chips and money.',
    example: 'With 50% of chips, your ICM equity might be only 38% of remaining prizes (not 50%).',
    verdict: 'BEST method. Always request ICM-based calculations when making deals.' },
  { deal: 'Chip Leader Premium', icon: '★', color: '#8b5cf6',
    how: 'ICM chop but the chip leader gets extra money for their positional advantage and skill edge.',
    when: 'When the chip leader feels ICM undervalues their dominant position.',
    example: 'ICM says you should get $4,200. You negotiate $4,500 as chip leader premium.',
    verdict: 'Reasonable if you\'re clearly the best player. Hard to negotiate but worth asking.' },
  { deal: 'Save + Play On', icon: '★', color: '#ef4444',
    how: 'Lock up a guaranteed amount for everyone, then play for the remaining prize pool.',
    when: 'Best of both worlds — reduces risk while keeping the competitive element alive.',
    example: '$10K total. Lock up $2K each (3 players). Play for remaining $4K. Winner gets $2K + $4K = $6K.',
    verdict: 'Great compromise. Everyone gets security, but there\'s still something to play for.' },
];

export default function ChipChopCalc() {
  const [dealIdx, setDealIdx] = useState(0);
  const deal = DEAL_TYPES[dealIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Chip Chop Calculator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Make smart deals at final tables.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {DEAL_TYPES.map((d, i) => (
          <button key={i} onClick={() => setDealIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: dealIdx === i ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.06)',
              background: dealIdx === i ? `${d.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{d.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: dealIdx === i ? d.color : '#64748b' }}>{d.deal.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={dealIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{deal.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: deal.color }}>{deal.deal}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'How It Works', text: deal.how, color: '#3b82f6' },
            { label: 'When to Use', text: deal.when, color: '#22c55e' },
            { label: 'Example', text: deal.example, color: '#f59e0b' },
            { label: 'Verdict', text: deal.verdict, color: deal.color },
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
