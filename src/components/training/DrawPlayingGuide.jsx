/**
 * DrawPlayingGuide — Complete Guide to Playing Draws
 * Flush draws, straight draws, combo draws — play them right
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DRAWS = [
  { name: 'Nut Flush Draw', outs: 9, equity: '35%', icon: '♥', color: '#ef4444',
    play: 'Semi-bluff aggressively. Check-raise or bet when you have fold equity. Call when priced in.',
    sizing: 'Bet 66-75% or check-raise to 3x as semi-bluff', avoid: 'Passive calling on the flop — you have too much equity to just call' },
  { name: 'Open-Ended Straight', outs: 8, equity: '31%', icon: '·', color: '#f59e0b',
    play: 'Similar to flush draws but slightly less equity. Semi-bluff in position, check-call OOP.',
    sizing: 'Bet 55-66% as semi-bluff, call reasonable bets', avoid: 'Overplaying gutshots as OESDs — count your outs carefully' },
  { name: 'Combo Draw (Flush + Straight)', outs: 15, equity: '54%', icon: '◆', color: '#22c55e',
    play: 'You\'re actually a FAVORITE. Play ultra-aggressively. Get it all in on the flop if possible.',
    sizing: 'Check-raise all-in or bet 100% pot. You want max money in.', avoid: 'Playing passively with a combo draw — you\'re leaving money on the table' },
  { name: 'Gutshot', outs: 4, equity: '17%', icon: '●', color: '#64748b',
    play: 'Mostly a fold or a bluff. Not enough equity to call big bets. Use as bluff candidates.',
    sizing: 'Only semi-bluff when you have strong fold equity', avoid: 'Calling large bets hoping to hit — pot odds rarely justify it' },
  { name: 'Backdoor Flush + Backdoor Straight', outs: '~6', equity: '~12%', icon: '↻', color: '#8b5cf6',
    play: 'Not enough to call big bets alone, but great to add to your floating/bluffing range.',
    sizing: 'Float flop bets in position, barrel favorable turns', avoid: 'Overvaluing backdoor draws — they\'re a bonus, not a primary draw' },
];

export default function DrawPlayingGuide() {
  const [drawIdx, setDrawIdx] = useState(0);
  const draw = DRAWS[drawIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Draw Playing Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Every draw type, how many outs, and the optimal way to play it.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {DRAWS.map((d, i) => (
          <button key={i} onClick={() => setDrawIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: drawIdx === i ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.06)',
              background: drawIdx === i ? `${d.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{d.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: drawIdx === i ? d.color : '#64748b' }}>{d.name}</div>
          </button>
        ))}
      </div>

      <motion.div key={drawIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: `${draw.color}08`, border: `1px solid ${draw.color}25`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 32 }}>{draw.icon}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: draw.color }}>{draw.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{draw.outs} outs | {draw.equity} equity (2 cards)</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>How to Play</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{draw.play}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Sizing</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{draw.sizing}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Avoid</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{draw.avoid}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
