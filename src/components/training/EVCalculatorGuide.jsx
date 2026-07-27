/**
 * EVCalculatorGuide — Expected Value Calculation Guide
 * How to calculate EV for any poker decision
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const EV_EXAMPLES = [
  { scenario: 'Simple Call Decision', icon: '●', color: '#22c55e',
    setup: 'Pot: $100. Villain bets $50. You need to call $50 to win $150.',
    formula: 'EV = (Win% × WinAmount) - (Lose% × LoseAmount)',
    calc: 'You estimate 40% to win. EV = (0.40 × $150) - (0.60 × $50) = $60 - $30 = +$30',
    result: '+$30 EV — CALL. You profit $30 on average despite losing more than half the time.',
    lesson: 'You don\'t need to win most of the time to make a profitable call. Pot odds drive this.' },
  { scenario: 'Bluff Decision', icon: '◇', color: '#ef4444',
    setup: 'Pot: $200. You bet $150 as a bluff. Villain folds 60% of the time.',
    formula: 'EV = (Fold% × Pot) - (Call% × BetSize)',
    calc: 'EV = (0.60 × $200) - (0.40 × $150) = $120 - $60 = +$60',
    result: '+$60 EV — BET. Even when called and losing, the folds more than compensate.',
    lesson: 'Bluffs don\'t need to work every time. If fold equity × pot > call frequency × bet, it\'s +EV.' },
  { scenario: 'Semi-Bluff All-In', icon: '▲', color: '#3b82f6',
    setup: 'Pot: $300. You shove $400 with a flush draw (35% equity). Villain calls 50% of the time.',
    formula: 'EV = (Fold% × Pot) + Call% × [(Equity × TotalPot) - ShoveAmount]',
    calc: 'EV = (0.50 × $300) + 0.50 × [(0.35 × $1100) - $400] = $150 + 0.50 × [-$15] = +$142.50',
    result: '+$142.50 EV — SHOVE. Massive +EV from fold equity combined with live equity when called.',
    lesson: 'Semi-bluffs are powerful because you win TWO ways: fold equity + equity when called.' },
  { scenario: 'Set Mining Decision', icon: '◇', color: '#f59e0b',
    setup: 'You hold 44. Cost to call: $15. Effective stacks: $300. You flop a set ~12% of the time.',
    formula: 'EV = (SetFreq × AvgWin) - (MissFreq × CallCost)',
    calc: 'Assume you win $200 average when hitting set. EV = (0.12 × $200) - (0.88 × $15) = $24 - $13.20 = +$10.80',
    result: '+$10.80 EV — CALL. You need ~15:1 implied odds; here you have 20:1.',
    lesson: 'Set mining is profitable when stacks are deep enough. Rule of thumb: need 15x the call amount in effective stacks.' },
  { scenario: 'Fold Equity Minimum', icon: '■', color: '#8b5cf6',
    setup: 'You want to bluff $100 into a $150 pot. How often must villain fold to break even?',
    formula: 'Break-Even% = BetSize / (BetSize + Pot)',
    calc: 'BE% = $100 / ($100 + $150) = $100 / $250 = 40%',
    result: 'Villain must fold 40%+ for your bluff to be +EV. If they fold less, don\'t bluff.',
    lesson: 'This formula is essential. Memorize it. It tells you exactly when bluffing is profitable.' },
];

export default function EVCalculatorGuide() {
  const [exIdx, setExIdx] = useState(0);
  const ex = EV_EXAMPLES[exIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        EV Calculator Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Calculate expected value for any decision.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {EV_EXAMPLES.map((e, i) => (
          <button key={i} onClick={() => setExIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: exIdx === i ? `2px solid ${e.color}` : '1px solid rgba(255,255,255,0.06)',
              background: exIdx === i ? `${e.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{e.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: exIdx === i ? e.color : '#64748b' }}>{e.scenario.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={exIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{ex.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: ex.color }}>{ex.scenario}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{ex.setup}</div>
        </div>
        <div style={{ background: `${ex.color}08`, borderRadius: 8, padding: 8, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Formula</div>
          <div style={{ fontSize: 11, color: ex.color }}>{ex.formula}</div>
        </div>
        <div style={{ background: 'rgba(59,130,246,0.05)', borderRadius: 8, padding: 8, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Calculation</div>
          <div style={{ fontSize: 11, color: '#3b82f6' }}>{ex.calc}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{ex.result}</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Lesson</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{ex.lesson}</div>
        </div>
      </motion.div>
    </div>
  );
}
