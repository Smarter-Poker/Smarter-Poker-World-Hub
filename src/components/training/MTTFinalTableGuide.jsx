/**
 * MTTFinalTableGuide — MTT Final Table Strategy
 * ICM-heavy play at the most important stage of tournaments
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FT_CONCEPTS = [
  { title: 'ICM Awareness', icon: '■', color: '#ef4444',
    detail: 'At the final table, every pay jump represents real money. ICM distorts optimal play — you must tighten your calling ranges significantly.',
    key: 'The shorter stacks\' busts increase everyone\'s equity. Don\'t risk your stack unless the reward justifies the ICM cost.',
    example: 'With 9 players left and a $1M prize pool: busting 9th = $50k, but laddering to 6th = $120k. That $70k difference demands tighter play.',
    numbers: 'Tighten calling ranges 15-25% vs ICM-naive ChipEV. The closer you are to a pay jump, the tighter you should be.' },
  { title: 'Stack Size Dynamics', icon: '■', color: '#22c55e',
    detail: 'Your stack size relative to others determines your strategy. Big stacks bully, medium stacks survive, short stacks shove.',
    key: 'Big stack (>40bb): Apply pressure on everyone, especially medium stacks who can\'t call. You\'re the table captain.',
    example: 'Short stack (10-15bb): Push/fold mode. Look for spots to double up through big stack calls. Target the big blind.',
    numbers: 'Medium stack (20-30bb): The hardest spot. You can\'t push freely but can\'t play post-flop deep either. Pick spots carefully.' },
  { title: 'Pay Jump Laddering', icon: '↑', color: '#f59e0b',
    detail: 'Each elimination at the FT means more money for everyone. Sometimes the correct play is to fold and let shorter stacks bust.',
    key: 'Calculate the $EV of folding vs playing. If folding and waiting for a shorter stack to bust has higher $EV, fold.',
    example: '3 players left with 5bb, you have 15bb. Even with AKs, calling the 5bb player\'s shove might be -$EV if the 40bb stack covers you.',
    numbers: 'Rule of thumb: If there\'s a stack shorter than yours who\'s likely to bust soon, tighten up and wait.' },
  { title: 'Deal-Making Strategy', icon: '●', color: '#3b82f6',
    detail: 'Many final tables end with ICM deals. Understanding your ICM equity helps you negotiate from a position of strength.',
    key: 'Know your ICM equity before entering deal discussions. The big stack always has more than their chip share.',
    example: 'If you have 40% of chips at a 3-way FT, your ICM equity might be 38% due to diminishing chip value — but you negotiate from strength.',
    numbers: 'Use ICM calculators during breaks. Never accept a deal that gives you less than your ICM equity minus 2%.' },
  { title: 'Heads-Up for the Title', icon: '★', color: '#8b5cf6',
    detail: 'The biggest pay jump is usually 1st vs 2nd. Heads-up play is pure aggression — ICM barely matters with only 2 payouts.',
    key: 'Play close to ChipEV HU. The pay jump to 1st is worth fighting for. Don\'t try to nit into 2nd.',
    example: 'If 1st = $200k and 2nd = $130k, you\'re playing for a $70k difference. That\'s worth taking +ChipEV spots.',
    numbers: 'HU opening range: 80%+ from SB. 3-bet BB range: 25-30%. Shove <15bb with any two playable cards.' },
];

export default function MTTFinalTableGuide() {
  const [idx, setIdx] = useState(0);
  const c = FT_CONCEPTS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        MTT Final Table Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Navigate the most important stage of any tournament.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FT_CONCEPTS.map((t, i) => (
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
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Example</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.example}</div>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>KEY NUMBERS</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.numbers}</div>
        </div>
      </motion.div>
    </div>
  );
}
