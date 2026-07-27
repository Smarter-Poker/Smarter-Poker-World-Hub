/**
 * PreFlopMistakes — Common Preflop Mistakes
 * The most costly preflop errors and how to fix them
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PF_MISTAKES = [
  { mistake: 'Open Limping', severity: 'Critical', color: '#ef4444', icon: '',
    cost: '~5 BB/100 over time',
    why: 'Limping gives up initiative. You can\'t win the pot preflop and you play guessing games postflop.',
    fix: 'Raise or fold. Every hand you\'d limp, either raise it (if good enough) or muck it.',
    exception: 'The ONLY acceptable limp is completing the SB in a limped pot with a speculative hand.' },
  { mistake: 'Calling 3-Bets OOP', severity: 'High', color: '#f59e0b', icon: '▲',
    cost: '~3 BB/100',
    why: 'Calling 3-bets out of position creates bloated pots where you have no informational advantage.',
    fix: '4-bet or fold. If your hand isn\'t strong enough to 4-bet, it\'s probably a fold vs a 3-bet.',
    exception: 'Calling with pocket pairs (set-mining) when the 3-bet is small and stacks are deep.' },
  { mistake: 'Too Wide from EP', severity: 'High', color: '#f59e0b', icon: '',
    cost: '~2 BB/100',
    why: 'Opening K9o from UTG means playing OOP vs 5 players. You\'ll face 3-bets and tough postflop spots.',
    fix: 'Use a tight UTG range: 77+, ATs+, KQs, AJo+. Add hands as you move closer to the button.',
    exception: 'In very soft games with passive players behind, you can open slightly wider from EP.' },
  { mistake: 'Not 3-Betting Enough', severity: 'Medium', color: '#3b82f6', icon: '',
    cost: '~2 BB/100',
    why: 'Flatting every premium hand lets multiple players in. 3-betting isolates and builds pots with strong hands.',
    fix: '3-bet AA, KK, QQ, AKs always. Add light 3-bets (A5s, KQs) for balance, especially vs late position opens.',
    exception: 'Trapping with AA/KK by flatting is fine occasionally for balance, but not as a default.' },
  { mistake: 'Ignoring Position', severity: 'Critical', color: '#ef4444', icon: '',
    cost: '~4 BB/100',
    why: 'Playing the same range from every position is a massive leak. Position determines how wide you can play.',
    fix: 'UTG: ~15% of hands. CO: ~27%. BTN: ~40%. SB: ~35% (3-bet or fold). BB: defend ~40% vs opens.',
    exception: 'None. Position awareness is non-negotiable at every level of play.' },
];

export default function PreFlopMistakes() {
  const [mistakeIdx, setMistakeIdx] = useState(0);
  const m = PF_MISTAKES[mistakeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ✕ Common Preflop Mistakes
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Fix these leaks and instantly improve your winrate.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PF_MISTAKES.map((mk, i) => (
          <button key={i} onClick={() => setMistakeIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: mistakeIdx === i ? `2px solid ${mk.color}` : '1px solid rgba(255,255,255,0.06)',
              background: mistakeIdx === i ? `${mk.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{mk.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: mistakeIdx === i ? mk.color : '#64748b' }}>{mk.mistake.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={mistakeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{m.icon}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.mistake}</span>
          </div>
          <div style={{ background: `${m.color}20`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.severity}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 8, marginBottom: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Estimated Cost</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{m.cost}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{m.why}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Fix</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.fix}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Exception</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.exception}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
