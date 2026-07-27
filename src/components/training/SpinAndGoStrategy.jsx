/**
 * SpinAndGoStrategy — Spin & Go / Hyper-Turbo Strategy
 * Fast-format tournament strategy and adjustments
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SPIN_PHASES = [
  { phase: 'Early Game (25-50bb)', icon: '●', color: '#22c55e',
    detail: 'Play tight-aggressive. The blinds are small relative to stacks, so there\'s no rush. Build a chip lead through solid play.',
    opens: 'BTN: Open 50-60% of hands (2-2.5x). SB: Open 40-50% (2.5x). BB: Defend 40-50% vs BTN, tighter vs SB.',
    strategy: 'Avoid big pots without big hands. No need to gamble early. Let opponents make mistakes.',
    tip: 'At 50bb deep in a Spin, you can still play "real poker." Don\'t panic into push/fold yet.' },
  { phase: 'Mid Game (15-25bb)', icon: '●', color: '#f59e0b',
    detail: 'The transition zone. Start widening your opening ranges and apply pressure on shorter stacks.',
    opens: 'BTN: Open 60-70% (2-2.2x). SB: Open 50-60% (2.2x). BB: Defend wider, start shoving over opens with 18bb.',
    strategy: 'Pick up blind steals aggressively. 3-bet shove with pairs 66+, ATs+, KQs from any position.',
    tip: 'The player with the chip lead should be the most aggressive. Use your stack as a weapon.' },
  { phase: 'Late Game (10-15bb)', icon: '●', color: '#ef4444',
    detail: 'Push/fold territory. Use ICM-aware shove/fold charts. Every decision is all-in or fold.',
    opens: 'BTN: Shove 50-60% of hands. SB: Shove 40-50%. BB: Call shoves with top 30-40% vs BTN, wider vs SB.',
    strategy: 'Pure push/fold. No limping, no min-raising. Maximize fold equity before the blinds eat you.',
    tip: 'At 12bb in a Spin, you\'re shoving any Ace, any pair, most Kings, and suited connectors 56s+.' },
  { phase: 'Heads-Up Phase', icon: '●', color: '#8b5cf6',
    detail: 'Once one player busts, it\'s heads-up with varying stack depths. Adjust based on stack sizes and payout multiplier.',
    opens: 'SB: Open 80%+ (2x). BB: 3-bet 25-30%, call 40-50%. At <15bb: pure push/fold.',
    strategy: 'Aggression wins HU. Raise relentlessly from the button. Only slow down with extremely short stacks.',
    tip: 'In high multiplier Spins, ICM barely matters HU (prize is flat). Play for chip EV, not ICM.' },
  { phase: 'Multiplier Adjustments', icon: '●', color: '#3b82f6',
    detail: 'Higher multipliers = tighter play. In a 1000x Spin, survival matters more than chip accumulation.',
    opens: 'At 2x: Play normally, ChipEV ≈ $EV. At 10x+: Tighten 10-15%. At 100x+: Nit it up, fold equity > pot equity.',
    strategy: 'The higher the multiplier, the more ICM impacts decisions. A min-cash in a 1000x is worth more than 1st in a 2x.',
    tip: 'Most of your profit comes from 2x Spins played at high volume. Don\'t over-adjust for rare big multipliers.' },
];

export default function SpinAndGoStrategy() {
  const [idx, setIdx] = useState(0);
  const p = SPIN_PHASES[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Spin & Go Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master hyper-turbo 3-max tournaments.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {SPIN_PHASES.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.phase.split(' (')[0]}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: p.color, marginBottom: 8 }}>{p.icon} {p.phase}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{p.detail}</p>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Opening Ranges</div>
          <div style={{ fontSize: 11, color: p.color }}>{p.opens}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${p.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${p.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: p.color }}>STRATEGY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.strategy}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>PRO TIP</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{p.tip}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
