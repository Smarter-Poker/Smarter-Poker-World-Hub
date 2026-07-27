/**
 * StackOffRanges — Stack-Off Range Construction
 * Know which hands to go all-in with by SPR
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const STACKOFF_SPOTS = [
  { spr: 'SPR 1-2 (Short)', color: '#ef4444', icon: '▲',
    stackOff: 'Any top pair, any overpair, any draw with 8+ outs.',
    why: 'With 1-2x pot behind, you\'re committed with almost anything. Folding top pair is a mistake.',
    example: 'Pot $100, you have $150 behind (SPR 1.5). Top pair = always stack off.',
    avoid: 'Don\'t fold TPTK in low SPR spots. The math demands you get it in.' },
  { spr: 'SPR 3-5 (Medium)', color: '#f59e0b', icon: '⌁',
    stackOff: 'Overpairs+, top pair with strong kicker, combo draws.',
    why: 'Medium SPR means two pair and sets are premium. Top pair is still strong but be cautious.',
    example: 'Pot $100, you have $400 behind (SPR 4). TPTK = value bet/call. Second pair = pot control.',
    avoid: 'Don\'t stack off with weak top pair (e.g., A3 on A-high board) at medium SPR.' },
  { spr: 'SPR 7-10 (Deep-ish)', color: '#3b82f6', icon: '▲',
    stackOff: 'Two pair+, strong draws, sets. Top pair is a one/two-street hand.',
    why: 'Deep enough that one-pair hands shouldn\'t play for stacks. Need two pair or better.',
    example: 'Pot $100, you have $800 behind (SPR 8). Top pair = bet two streets, check-call river.',
    avoid: 'Don\'t build a massive pot with one pair at this depth. You\'ll only get stacked by better.' },
  { spr: 'SPR 13+ (Deep Stack)', color: '#22c55e', icon: '■',
    stackOff: 'Sets, straights, flushes, full houses. Only the nuts or near-nuts.',
    why: 'Very deep stacks mean implied odds are huge. Speculative hands gain value.',
    example: 'Pot $100, you have $1500 behind (SPR 15). TPTK is just a bluff-catcher at this depth.',
    avoid: 'Never play for stacks with one pair at SPR 13+. You\'ll only get called by sets and better.' },
  { spr: 'SPR Calculation', color: '#8b5cf6', icon: '■',
    stackOff: 'SPR = Effective Stack / Pot Size (after preflop action)',
    why: 'SPR tells you how "deep" you are relative to the pot. Lower SPR = more committed.',
    example: 'You raise to $10, villain calls. Pot is $23. Effective stacks are $190. SPR = $190/$23 = 8.3.',
    avoid: 'Don\'t ignore SPR. It\'s the single most important number for postflop stack-off decisions.' },
];

export default function StackOffRanges() {
  const [sprIdx, setSprIdx] = useState(0);
  const spr = STACKOFF_SPOTS[sprIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Stack-Off Ranges
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Which hands to commit your stack with by SPR.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {STACKOFF_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSprIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: sprIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: sprIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: sprIdx === i ? s.color : '#64748b' }}>{s.spr.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={sprIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: spr.color, marginBottom: 4 }}>{spr.spr}</div>
        <div style={{ background: `${spr.color}10`, borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Stack-Off Range</div>
          <div style={{ fontSize: 12, color: spr.color }}>{spr.stackOff}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spr.why}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Example</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spr.example}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Avoid</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spr.avoid}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
