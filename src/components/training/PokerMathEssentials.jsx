/**
 * PokerMathEssentials — Essential Poker Mathematics
 * Core math concepts every poker player must know
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const MATH_TOPICS = [
  { title: 'Pot Odds', icon: '■', color: '#22c55e',
    formula: 'Pot Odds = Call Amount / (Pot + Call Amount)',
    example: 'Pot is $100, villain bets $50. You must call $50 into $150. Pot odds = 50/200 = 25%. You need 25%+ equity to call.',
    shortcut: 'Quick math: Divide your call by the total pot after calling. If your equity beats that number, call.',
    practice: 'Half-pot bet: need 25% | 2/3 pot: need 28.5% | Full pot: need 33% | Overbet 2x: need 40%' },
  { title: 'Implied Odds', icon: '◆', color: '#3b82f6',
    formula: 'Implied Odds = (Call Amount) / (Pot + Call + Expected Future Bets)',
    example: 'You have a set draw (2 outs). Direct odds are terrible. But if you hit, you\'ll win villain\'s whole stack. That\'s implied odds.',
    shortcut: 'Ask: "If I hit my draw, how much more will I win?" Add that to the pot to calculate true odds.',
    practice: 'Set mining: Need ~15:1 implied odds. With 100bb stacks, call up to 7bb to set-mine (100/7 ≈ 14:1).' },
  { title: 'Expected Value (EV)', icon: '■', color: '#ef4444',
    formula: 'EV = (Win% × Amount Won) − (Lose% × Amount Lost)',
    example: 'You shove $100 into a $100 pot with 60% equity. EV = (0.6 × $100) − (0.4 × $100) = $60 − $40 = +$20.',
    shortcut: 'If you\'re getting the right price (pot odds < equity), the call is +EV. Always.',
    practice: 'A +$1 EV decision made 1000 times = $1000 profit. Small edges compound over volume.' },
  { title: 'Combinatorics', icon: '■', color: '#f59e0b',
    formula: 'Unpaired hands: 16 combos (12 off, 4 suited) | Pairs: 6 combos',
    example: 'How many combos of AK? 4 Aces × 4 Kings = 16. If one Ace is on the board? 3 × 4 = 12 combos.',
    shortcut: 'Board cards reduce combos. Each blocker card removes 25% of that rank\'s combos from ranges.',
    practice: 'AK: 16 → Board has A: 12 → You hold K: 9 → Board has A and you hold K: 9 combos.' },
  { title: 'Outs & Rule of 2/4', icon: '◆', color: '#8b5cf6',
    formula: 'Flop to River: Outs × 4 | Turn to River: Outs × 2',
    example: 'Flush draw on flop: 9 outs × 4 = 36% equity. Same draw on turn: 9 × 2 = 18% equity.',
    shortcut: 'This is an approximation. For 8+ outs, subtract 1% for each out above 8. (9 outs × 4 = 36% → actual ~35%)',
    practice: 'Gutshot: 4 outs = 16%/8% | OESD: 8 outs = 32%/16% | Flush: 9 outs = 36%/18% | Flush+OESD: 15 outs = 54%/30%' },
];

export default function PokerMathEssentials() {
  const [idx, setIdx] = useState(0);
  const m = MATH_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Poker Math Essentials
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The core mathematics every poker player must master.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {MATH_TOPICS.map((t, i) => (
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
        <div style={{ fontSize: 16, fontWeight: 800, color: m.color, marginBottom: 8 }}>{m.icon} {m.title}</div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 10, marginBottom: 10, fontFamily: 'monospace', borderLeft: `3px solid ${m.color}` }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>FORMULA</div>
          <div style={{ fontSize: 13, color: m.color, fontWeight: 700 }}>{m.formula}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{m.example}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>SHORTCUT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.shortcut}</div>
          </div>
          <div style={{ background: `${m.color}06`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${m.color}`, fontFamily: 'monospace' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: m.color }}>PRACTICE</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.practice}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
