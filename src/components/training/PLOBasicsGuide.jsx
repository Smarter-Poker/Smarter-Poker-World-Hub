/**
 * PLOBasicsGuide — Pot Limit Omaha Fundamentals
 * Core PLO concepts for NLHE players transitioning
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PLO_BASICS = [
  { title: 'Hand Selection', icon: '◇', color: '#22c55e',
    detail: 'In PLO, you get 4 hole cards but must use exactly 2. Strong hands have coordination: double-suited, connected, with big pairs.',
    examples: 'AAKKds, JT98ds, AKQJss are premium. Random hands like K♠7♥3♦2♣ are trash despite having a King.',
    tip: 'Think in terms of "planarity" — how many ways can your 4 cards work together? More connections = better hand.' },
  { title: 'Position Matters More', icon: '·', color: '#3b82f6',
    detail: 'PLO is a drawing game with massive equity swings. Being in position lets you control pot size and see how draws develop.',
    examples: 'IP you can pot-control with draws, value bet thinner, and bluff more effectively. OOP you\'re guessing.',
    tip: 'Play 30%+ fewer hands from EP in PLO vs NLHE. Position advantage is amplified.' },
  { title: 'Pot Limit Betting', icon: '●', color: '#ef4444',
    detail: 'You can only bet the size of the pot. This means hands rarely get all-in preflop, and postflop play is where the action is.',
    examples: 'Pot preflop: $3.50 in a $1/$2 game. By the turn, pot sizes explode. A $10 pot on the flop becomes $80+ by river.',
    tip: 'PLO pots grow geometrically. If you pot every street, you\'re always getting all-in by the river with 100bb stacks.' },
  { title: 'Drawing vs Made Hands', icon: '◆', color: '#f59e0b',
    detail: 'In PLO, draws are often favorites over made hands. A wrap + flush draw can have 60%+ equity against top set.',
    examples: 'On J♥T♣5♥: Q♥9♥8♠7♦ (wrap + flush draw) has ~58% vs A♠A♣J♦5♠ (top two pair).',
    tip: 'Don\'t overvalue bare top pair or even two pair. In PLO, if you can\'t improve, you\'re often behind.' },
  { title: 'The Nuts Matters', icon: '★', color: '#8b5cf6',
    detail: 'In PLO, someone almost always has the nuts or near-nuts. Non-nut hands are dangerous, especially in multiway pots.',
    examples: 'A non-nut flush (Q-high flush) in PLO is often just a bluff catcher. In NLHE it\'s a monster.',
    tip: 'When the board pairs and you have a flush, proceed with extreme caution. Full houses are common in PLO.' },
];

export default function PLOBasicsGuide() {
  const [idx, setIdx] = useState(0);
  const b = PLO_BASICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        PLO Fundamentals
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Essential Pot Limit Omaha concepts for Hold'em players.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PLO_BASICS.map((t, i) => (
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
        <div style={{ fontSize: 16, fontWeight: 800, color: b.color, marginBottom: 8 }}>{b.icon} {b.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{b.detail}</p>
        <div style={{ background: `${b.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace', borderLeft: `3px solid ${b.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: b.color }}>EXAMPLES</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{b.examples}</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>PRO TIP</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{b.tip}</div>
        </div>
      </motion.div>
    </div>
  );
}
