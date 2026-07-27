/**
 * MultiStreetPlan — Multi-Street Planning Framework
 * Plan all three streets before you act on the flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STREET_PLANS = [
  { hand: 'Top Pair Top Kicker', example: 'AK on A♠9♦4♣', color: '#22c55e', icon: '▲',
    flop: 'Bet 50% pot. You have the best one-pair hand. Build the pot for value.',
    turn: 'Bet 66% on safe turns (2-8). Check back on scary turns (K, Q, J that bring straights).',
    river: 'Value bet 75% on blank rivers. Check-call if turn was scary. Fold to big raises.',
    pitfall: 'Don\'t bet-bet-bet automatically. Plan changes based on runout.' },
  { hand: 'Overpair on Wet Board', example: 'QQ on J♥T♥7♣', color: '#f59e0b', icon: '⌁',
    flop: 'Bet 66% pot. Charge draws hard. Many hands have equity against you.',
    turn: 'If heart or straight card: check for pot control. If brick: bet 75% for value/protection.',
    river: 'If draws bricked: thin value bet. If draws completed: check-fold or check-call based on sizing.',
    pitfall: 'Don\'t barrel all three streets on wet boards. Draws complete ~40% of the time.' },
  { hand: 'Flush Draw', example: 'A♥5♥ on K♥9♥2♣', color: '#3b82f6', icon: '·',
    flop: 'Bet 50% as a semi-bluff (9 outs = 35% equity). Or check-raise for fold equity.',
    turn: 'If flush hits: bet 75% for value. If miss: check (give up) or barrel (if scare card helps).',
    river: 'If flush hit on turn: bet river for value. If missed: check and give up (no showdown value).',
    pitfall: 'Don\'t commit entire stack drawing. Know your breakeven price at each decision point.' },
  { hand: 'Bottom Set', example: '44 on K♠8♦4♣', color: '#8b5cf6', icon: '●',
    flop: 'Bet 50-66%. Build the pot with a disguised monster. Or check-raise if villain bets.',
    turn: 'Bet 75% on all turns. You beat everything except higher sets (very rare). Go for stacks.',
    river: 'Overbet river for max value. You want to get paid by Kx, 88, straights, or two pair.',
    pitfall: 'Don\'t slow-play sets on wet boards. Fast-play to deny equity and build pot.' },
  { hand: 'Complete Air (Bluff)', example: '6♠5♠ on A♠K♦9♣', color: '#ef4444', icon: '◇',
    flop: 'Bet 33% with range on AK9. Representing AK/AQ/AJ. Cheap bluff.',
    turn: 'If called, evaluate: pick up equity? Barrel scary turns (Q, J, T). Check bricks.',
    river: 'If barreled turn: follow through ONLY with blockers or on scare cards. Otherwise give up.',
    pitfall: 'Triple barrel bluffs are rare in practice. Most bluffs should stop by the turn.' },
];

export default function MultiStreetPlan() {
  const [planIdx, setPlanIdx] = useState(0);
  const plan = STREET_PLANS[planIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Multi-Street Planner
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Plan all three streets before acting on the flop.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {STREET_PLANS.map((p, i) => (
          <button key={i} onClick={() => setPlanIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: planIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: planIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{p.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: planIdx === i ? p.color : '#64748b' }}>{p.hand.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={planIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: plan.color, marginBottom: 4 }}>{plan.hand}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontFamily: 'monospace' }}>{plan.example}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Flop Plan', text: plan.flop, color: '#22c55e' },
            { label: 'Turn Plan', text: plan.turn, color: '#f59e0b' },
            { label: 'River Plan', text: plan.river, color: '#ef4444' },
            { label: 'Common Pitfall', text: plan.pitfall, color: '#8b5cf6' },
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
