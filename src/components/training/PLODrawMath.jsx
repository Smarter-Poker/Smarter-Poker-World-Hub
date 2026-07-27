/**
 * PLODrawMath — PLO Draw Mathematics & Wrap Calculations
 * Understanding outs, wraps, and equity in Omaha
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DRAW_TYPES = [
  { name: '13-Card Wrap', outs: 13, icon: '·', color: '#22c55e',
    example: 'Hand: 9♠8♥ on board J♦T♣3♥ — Any Q, 9, 8, 7 makes a straight (13 outs)',
    equity: '~48% vs overpair, ~52% vs top pair. This is a coin flip or better!',
    play: 'Bet or raise aggressively. You\'re a slight favorite against most made hands.',
    math: 'Turn: 13/45 = 28.9% | River: 13/44 = 29.5% | Combined: ~48%' },
  { name: '20-Card Monster', outs: 20, icon: '▲', color: '#ef4444',
    example: 'Hand: Q♥J♥9♠8♦ on board T♥7♥2♣ — Wrap (13) + Flush Draw (9) - Overlap = ~20 outs',
    equity: '~65% vs top set. You\'re a massive favorite with this monster draw.',
    play: 'Get all-in if possible. You want to put maximum money in with 65% equity.',
    math: 'Turn: 20/45 = 44.4% | River: 20/44 = 45.5% | Combined: ~65%' },
  { name: 'Nut Flush Draw', outs: 9, icon: '♠', color: '#3b82f6',
    example: 'Hand: A♠K♠xx on board 7♠4♠2♥ — 9 spades make the nut flush',
    equity: '~35% vs top set. Decent but not amazing. Need backup equity.',
    play: 'Call a pot bet. Raise if you have additional straight outs or pair outs.',
    math: 'Turn: 9/45 = 20% | River: 9/44 = 20.5% | Combined: ~35%' },
  { name: 'Gutshot + Flush', outs: 12, icon: '◆', color: '#f59e0b',
    example: 'Hand: A♥K♥J♦x on board Q♥8♥3♣ — Flush (9) + Gutshot (3 unique) = 12 outs',
    equity: '~43% vs top pair. A strong semi-bluffing hand with good equity.',
    play: 'Semi-bluff the flop and turn. If raised, you can call profitably.',
    math: 'Turn: 12/45 = 26.7% | River: 12/44 = 27.3% | Combined: ~43%' },
  { name: 'Set (Boat Draw)', outs: 7, icon: '■', color: '#8b5cf6',
    example: 'Hand: 8♠8♥xx on board 8♣7♠6♠ — Set needs to fill up: 7 outs (1 eight + 3 sevens + 3 sixes)',
    equity: '~28% vs made straight. You need the board to pair to win.',
    play: 'In PLO, sets on wet boards must fill up. Call draws but don\'t go wild.',
    math: 'Turn: 7/45 = 15.6% | River: 7/44 = 15.9% | Combined: ~28%' },
];

export default function PLODrawMath() {
  const [idx, setIdx] = useState(0);
  const d = DRAW_TYPES[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        PLO Draw Mathematics
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Calculate outs, equity, and wraps in Omaha.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {DRAW_TYPES.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.name}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: d.color }}>{d.icon} {d.name}</span>
          <span style={{ padding: '4px 10px', borderRadius: 20, background: `${d.color}20`, fontSize: 13, fontWeight: 800, color: d.color }}>{d.outs} outs</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 11, color: d.color }}>{d.example}</div>
        </div>
        <div style={{ background: `${d.color}06`, borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace', borderLeft: `3px solid ${d.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: d.color }}>MATH</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.math}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>EQUITY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.equity}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>HOW TO PLAY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.play}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
