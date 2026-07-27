/**
 * RangeVisualization — How to Read & Build Range Charts
 * Understanding the 13x13 range grid
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RANGE_CONCEPTS = [
  { concept: 'Reading the 13x13 Grid', icon: '■', color: '#3b82f6',
    detail: 'The range grid has 169 cells. Diagonal = pairs (AA to 22). Above diagonal = suited hands. Below = offsuit.',
    tip: 'Top-left is AA (strongest), bottom-right is 32o (weakest). Colors show action frequency.',
    practice: 'Open GTO Wizard and look at UTG opening range. Notice how tight the "green" area is.',
    key: 'Suited hands are always above their offsuit counterpart. AKs is top-right of AKo.' },
  { concept: 'Color Coding Actions', icon: '◇', color: '#22c55e',
    detail: 'Green = raise/bet. Red = fold. Blue = call. Yellow = mixed. The brighter the color, the higher the frequency.',
    tip: 'A cell that\'s half green/half blue means you should raise that hand 50% and call 50%.',
    practice: 'Look at BB defense vs BTN open. Notice how much blue (calling) there is.',
    key: 'Dark cells = always take that action. Light cells = sometimes. Mixed cells = both actions are close in EV.' },
  { concept: 'Range Density', icon: '▲', color: '#f59e0b',
    detail: 'A "tight" range looks like a small cluster in the top-left corner. A "wide" range fills most of the grid.',
    tip: 'UTG opens ~13% (tiny cluster). BTN opens ~40% (huge green area). BB defends ~40% (lots of blue).',
    practice: 'Compare UTG vs BTN opening ranges side by side. The difference is dramatic.',
    key: 'Count the filled cells to estimate range percentage. Each pair = 6 combos. Each suited = 4. Each offsuit = 12.' },
  { concept: 'Board Filtering', icon: '○', color: '#ef4444',
    detail: 'After the flop, ranges narrow. Hands that missed are removed. The grid gets sparser.',
    tip: 'On A♠K♦7♣: PFR still has lots of green (AK, AQ, AA, KK). Caller\'s grid is much thinner.',
    practice: 'Use GTO Wizard\'s range filter. See how villain\'s range changes on each street.',
    key: 'By the river, both ranges are very narrow. This is where hand-reading matters most.' },
  { concept: 'Building Your Own Ranges', icon: '■', color: '#8b5cf6',
    detail: 'Start with GTO ranges, then adjust for your opponents. Add exploits as notes on each cell.',
    tip: 'Build ranges position by position: UTG first, then MP, CO, BTN, SB, BB.',
    practice: 'Print out a blank grid. Color in your opening range for each position. Memorize them.',
    key: 'Ranges are living documents. Update them as you study. Review vs solver outputs monthly.' },
];

export default function RangeVisualization() {
  const [conceptIdx, setConceptIdx] = useState(0);
  const concept = RANGE_CONCEPTS[conceptIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Range Visualization
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master the 13x13 range grid.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {RANGE_CONCEPTS.map((c, i) => (
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
          <span style={{ fontSize: 16, fontWeight: 800, color: concept.color }}>{concept.concept}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{concept.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Pro Tip</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.tip}</div>
          </div>
          <div style={{ background: `${concept.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${concept.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: concept.color }}>Practice</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.practice}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Insight</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{concept.key}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
