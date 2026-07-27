/**
 * SolverSimplify — Simplifying Solver Solutions for Real Play
 * Turn complex solver outputs into actionable strategies
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SIMPLIFY_RULES = [
  { rule: 'Replace Mixed Strategies with Pure Actions', icon: '', color: '#22c55e',
    solver: 'Solver bets AK 62% and checks 38% on A♠7♦2♣.',
    simplified: 'Always bet AK on this board. Always check AQ. Split your range by hand, not by randomizer.',
    evLoss: '<0.5 BB/100 — almost zero EV lost from this simplification.',
    howTo: 'Take your range and split it: strong hands → always bet. Medium → always check. Air → always bet (bluff).' },
  { rule: 'Use 2-3 Bet Sizes Max', icon: '', color: '#3b82f6',
    solver: 'Solver uses 33%, 50%, 75%, 100%, 150% sizing across different boards.',
    simplified: 'Pick 2 sizes: 33% (range bet) and 75% (polar bet). Use one or the other per board.',
    evLoss: '<1 BB/100 — minimal EV loss. Simplicity > perfection in real-time.',
    howTo: 'Dry boards → 33% range bet. Wet boards → 75% with polar range. River → pot-sized when polarized.' },
  { rule: 'Categorize Boards into 3 Types', icon: '', color: '#f59e0b',
    solver: 'Solver has unique strategy for each of 1,755 possible flops.',
    simplified: 'Group boards: (1) Dry/High = range bet. (2) Wet/Connected = check more. (3) Low = check most.',
    evLoss: '<2 BB/100 — significant simplification with minimal cost.',
    howTo: 'Before each flop, ask: Is this board dry, wet, or low? Then apply the matching template.' },
  { rule: 'IP vs OOP Templates', icon: '', color: '#8b5cf6',
    solver: 'Solver has different strategies for every position combination.',
    simplified: 'IP: bet more often, use smaller sizes. OOP: bet less, use bigger sizes when you do bet.',
    evLoss: '<1.5 BB/100 — position-based templates cover 90% of spots.',
    howTo: 'IP after check: stab 55-65%. OOP as PFR: c-bet 35-50%. OOP as caller: mostly check.' },
  { rule: 'River = Value or Bluff (Nothing Else)', icon: '', color: '#ef4444',
    solver: 'Solver has complex mixed strategies even on the river.',
    simplified: 'On the river: either bet for value (you want a call) or bet as a bluff (you want a fold). Never "bet for information."',
    evLoss: '<0.5 BB/100 — river polarization is very close to optimal.',
    howTo: 'Ask: "Do I want a call?" → value bet. "Do I want a fold?" → bluff. "Neither?" → check.' },
];

export default function SolverSimplify() {
  const [ruleIdx, setRuleIdx] = useState(0);
  const rule = SIMPLIFY_RULES[ruleIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Solver Simplifier
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Turn solver complexity into real-world strategy.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {SIMPLIFY_RULES.map((r, i) => (
          <button key={i} onClick={() => setRuleIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: ruleIdx === i ? `2px solid ${r.color}` : '1px solid rgba(255,255,255,0.06)',
              background: ruleIdx === i ? `${r.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{r.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: ruleIdx === i ? r.color : '#64748b' }}>{r.rule.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={ruleIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: rule.color, marginBottom: 8 }}>{rule.rule}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>What Solver Does</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{rule.solver}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Simplified Version</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{rule.simplified}</div>
          </div>
          <div style={{ background: `${rule.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${rule.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: rule.color }}>EV Cost</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{rule.evLoss}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>How to Implement</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{rule.howTo}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
