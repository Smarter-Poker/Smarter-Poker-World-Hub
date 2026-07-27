/**
 * ThreeHandedPlay — 3-Handed Strategy Guide
 * Key adjustments when playing 3-way
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const THREE_HANDED = [
  { concept: 'Opening Ranges Expand', icon: '▲', color: '#22c55e',
    detail: 'With only 2 opponents, your opening ranges widen by ~40% compared to full ring.',
    btnRange: 'Button: Open ~55-65%. Any pair, any suited, most broadways, connected hands.',
    sbRange: 'Small Blind: 3-bet or fold ~35-45%. Don\'t flat call from SB 3-handed.',
    bbRange: 'Big Blind: Defend ~55-65% vs button opens. Defend tighter vs SB opens.' },
  { concept: 'Button is King', icon: '★', color: '#3b82f6',
    detail: 'The button in 3-handed play is the most profitable seat by far. You act last vs both blinds.',
    btnRange: 'Open raise relentlessly. If both blinds are passive, open any two cards.',
    sbRange: 'When button folds, SB becomes the aggressor. Open ~60-70% against the BB.',
    bbRange: 'BB must defend wide vs SB opens since SB has position on them too.' },
  { concept: 'Blind-on-Blind Wars', icon: '»', color: '#ef4444',
    detail: '3-handed means BTN folds a lot, creating frequent SB vs BB battles.',
    btnRange: 'N/A — you folded this hand.',
    sbRange: 'As SB: raise 60-70% or fold. Never limp. You have position postflop.',
    bbRange: 'As BB: 3-bet ~20-25% for value+bluffs. Flat ~30-40%. Fold ~35-40%.' },
  { concept: 'ICM at 3-Handed Final Table', icon: '●', color: '#f59e0b',
    detail: 'In tournaments, 3-handed is where ICM pressure peaks. Big pay jumps between 3rd and 1st.',
    btnRange: 'As chip leader: attack. As medium: be cautious. As short: shove or fold.',
    sbRange: 'ICM makes SB vs BB wars less aggressive. You can\'t risk busting before the short stack.',
    bbRange: 'Tighten BB defense if you\'re the medium stack. Let the big stack eliminate the short.' },
  { concept: 'Adjusting to Opponents', icon: '◇', color: '#8b5cf6',
    detail: 'With only 2 opponents, you see their actions every hand. Adjust rapidly.',
    btnRange: 'If both blinds are tight: steal 80%+. If one is aggressive: tighten vs them, steal from the other.',
    sbRange: 'If BB folds a lot: raise every SB. If BB 3-bets often: tighten up and 4-bet/fold.',
    bbRange: 'If SB steals wide: 3-bet more from BB. If SB is tight: respect their opens.' },
];

export default function ThreeHandedPlay() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = THREE_HANDED[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        3-Handed Play
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Key adjustments for 3-way final table action.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {THREE_HANDED.map((c, i) => (
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
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Button</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.btnRange}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Small Blind</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.sbRange}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Big Blind</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.bbRange}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
