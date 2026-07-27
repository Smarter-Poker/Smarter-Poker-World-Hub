/**
 * SitAndGoGuide — Sit & Go Tournament Strategy
 * Complete SNG strategy from registration to final table
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SNG_STAGES = [
  { stage: 'Early Stage (Deep Stacks)', icon: '★', color: '#22c55e', bb: '50-100bb',
    detail: 'Play conservatively. The blinds are tiny and ICM pressure is minimal. Focus on building reads and avoiding big mistakes.',
    strategy: 'Open tight from EP (12-15%). Widen on BTN (30-35%). Set-mine with small pairs. Fold marginal hands.',
    avoid: 'Don\'t play big pots with one-pair hands. Don\'t try to "build a stack" — survival is more important than chips.',
    icm: 'ICM impact: Minimal. Chip EV ≈ $EV at this stage. Play close to a cash game strategy.' },
  { stage: 'Middle Stage (Approaching Bubble)', icon: '▲', color: '#f59e0b', bb: '20-40bb',
    detail: 'ICM starts mattering. The bubble is approaching and short stacks are tightening up. Exploit their fear.',
    strategy: 'Apply pressure on medium stacks who are trying to ladder. Steal blinds from tight players. Avoid confrontations with big stacks.',
    avoid: 'Don\'t bust out before the money. Avoid flips against big stacks unless you have a premium hand.',
    icm: 'ICM impact: Moderate. Losing your stack costs more $EV than winning an equal amount gains you.' },
  { stage: 'Bubble Play', icon: '○', color: '#ef4444', bb: '15-25bb',
    detail: 'The bubble is the most profitable stage of a SNG. Players tighten massively — exploit this by stealing relentlessly.',
    strategy: 'As big stack: Raise every hand, shove over limps, punish tight play. As short stack: Push/fold with ~15bb or less.',
    avoid: 'As a medium stack: Don\'t call all-ins light. Let short stacks bust. Don\'t risk your tournament life.',
    icm: 'ICM impact: Maximum. A bust here = $0. Survival to the money = guaranteed payout. Tighten calling ranges by 20-30%.' },
  { stage: 'In the Money', icon: '●', color: '#3b82f6', bb: '10-20bb',
    detail: 'You\'ve made the money! Now the ICM dynamics shift. With pay jumps, aggression is rewarded differently.',
    strategy: 'Loosen up slightly now that min-cash is secured. Target players trying to ladder to higher payouts.',
    avoid: 'Don\'t be the one trying to ladder — play to win, not to survive. The biggest pay jump is 1st vs 2nd.',
    icm: 'ICM impact: Shifting. Now that min-cash is locked, chip accumulation for 1st becomes more valuable.' },
  { stage: 'Heads-Up for the Win', icon: '★', color: '#8b5cf6', bb: '10-30bb',
    detail: 'HU play in SNGs is high-leverage. The pay jump from 2nd to 1st is often 1.5x the buy-in. Play aggressively.',
    strategy: 'Open 70%+ from SB. 3-bet 25-30% from BB. Shove wide at 15bb or less. Aggression wins HU.',
    avoid: 'Don\'t play passively HU hoping for good cards. The blinds are too big and the variance is too high.',
    icm: 'ICM impact: None — it\'s winner-take-all between the two remaining payouts. Pure chip EV.' },
];

export default function SitAndGoGuide() {
  const [idx, setIdx] = useState(0);
  const s = SNG_STAGES[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Sit & Go Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master every stage of SNG tournaments.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {SNG_STAGES.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.stage.split(' (')[0]}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.icon} {s.stage}</span>
          <span style={{ padding: '3px 8px', borderRadius: 12, background: `${s.color}20`, fontSize: 11, fontWeight: 700, color: s.color }}>{s.bb}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{s.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>STRATEGY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.strategy}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>AVOID</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.avoid}</div>
          </div>
          <div style={{ background: `${s.color}06`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>ICM IMPACT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.icm}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
