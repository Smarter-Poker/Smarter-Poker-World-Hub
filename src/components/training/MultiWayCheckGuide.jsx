/**
 * MultiWayCheckGuide — Playing Multi-Way Pots
 * Tighten up drastically when 3+ players see the flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MW_RULES = [
  { rule: 'Tighten Your C-Bet Range', icon: '◆', color: '#ef4444',
    detail: 'C-bet only 25-35% of flops multi-way vs 65%+ heads-up. Multiple players = someone has something.',
    example: 'HU: C-bet AK on J74 for value. Multi-way: Check AK — too many players can have Jx.' },
  { rule: 'Top Pair Isn\'t Always Good', icon: '▲', color: '#f59e0b',
    detail: 'In HU pots, top pair is strong. In 4-way pots, top pair weak kicker is often second-best.',
    example: '4-way on K♠9♦4♣: Your K8 is borderline. Check-call at best, often check-fold to big action.' },
  { rule: 'Set Mine More Aggressively', icon: '◆', color: '#22c55e',
    detail: 'Small pairs go up in value multi-way because you get better implied odds when you flop a set.',
    example: 'Call with 22-66 in multi-way pots. You need ~15:1 implied odds, and multi-way delivers that.' },
  { rule: 'Draws Need Better Odds', icon: '■', color: '#3b82f6',
    detail: 'In multi-way pots, draws face more players who might have the same draw. Your flush might lose to a bigger flush.',
    example: 'Multi-way with 8♥7♥ on flush draw: call if price is right, but be aware of nut flush possibilities.' },
  { rule: 'Position Matters Even More', icon: '·', color: '#8b5cf6',
    detail: 'Acting last in a 4-way pot gives you information from 3 players. IP multi-way = massive edge.',
    example: 'If 3 players check to you multi-way, stab with any reasonable hand. Dead money is yours.' },
];

export default function MultiWayCheckGuide() {
  const [ruleIdx, setRuleIdx] = useState(0);
  const rule = MW_RULES[ruleIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Multi-Way Pot Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>More players = tighter play. Here's how to adjust.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {MW_RULES.map((r, i) => (
          <button key={i} onClick={() => setRuleIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: ruleIdx === i ? `2px solid ${r.color}` : '1px solid rgba(255,255,255,0.06)',
              background: ruleIdx === i ? `${r.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{r.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: ruleIdx === i ? r.color : '#64748b' }}>{r.rule.substring(0,10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={ruleIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: `${rule.color}08`, border: `1px solid ${rule.color}25`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{rule.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: rule.color }}>{rule.rule}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{rule.detail}</p>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${rule.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: rule.color }}>Example</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{rule.example}</div>
        </div>
      </motion.div>
    </div>
  );
}
