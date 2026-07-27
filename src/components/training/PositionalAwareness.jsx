/**
 * PositionalAwareness — Full Positional Awareness Guide
 * How every seat at the table changes your strategy
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const POSITIONS = [
  { pos: 'Under the Gun (UTG)', seats: '9-max: Seat 1', color: '#ef4444', icon: '◆',
    openRange: '~13% (77+, ATs+, KQs, AJo+)',
    advantage: 'When you open UTG and get called, your range is perceived as very strong. Easy to value bet.',
    disadvantage: 'You\'re OOP vs everyone. 5-8 players can wake up with a hand behind you.',
    keyTip: 'Play tight and aggressive. Every hand you open should be one you\'re comfortable 4-betting with.' },
  { pos: 'Middle Position (MP)', seats: '9-max: Seat 2-3', color: '#f59e0b', icon: '·',
    openRange: '~17% (66+, A9s+, KJs+, QJs, ATo+, KQo)',
    advantage: 'Slightly wider range than UTG. Still perceived as strong when opening.',
    disadvantage: 'Still OOP vs late position. Can get squeezed by CO/BTN.',
    keyTip: 'Add suited broadways and smaller pairs. Fold to 3-bets without strong hands.' },
  { pos: 'Cutoff (CO)', seats: '9-max: Seat 4', color: '#3b82f6', icon: '✕',
    openRange: '~27% (22+, A2s+, K9s+, Q9s+, J9s+, T9s, ATo+, KJo+, QJo)',
    advantage: 'Only BTN and blinds left. High chance of playing IP postflop. Great steal position.',
    disadvantage: 'BTN has position on you if they call. Blinds may defend wide vs your steals.',
    keyTip: 'The CO is where you start opening wide. Attack the blinds but respect 3-bets from BTN.' },
  { pos: 'Button (BTN)', seats: '9-max: Seat 5', color: '#22c55e', icon: '★',
    openRange: '~40% (22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 87s, A2o+, K8o+, Q9o+, JTo)',
    advantage: 'Best seat at the table. Always in position postflop (except vs BB). Maximum information advantage.',
    disadvantage: 'Blinds know you\'re stealing. Expect wider 3-bets.',
    keyTip: 'Steal relentlessly. If blinds don\'t fight back, open any two cards. Adjust to defenders.' },
  { pos: 'Blinds (SB/BB)', seats: '9-max: Seat 6-7', color: '#8b5cf6', icon: '■',
    openRange: 'SB: 3-bet or fold ~35%. BB: defend ~40% vs opens.',
    advantage: 'BB gets a discount to see flops. SB can squeeze effectively.',
    disadvantage: 'Always OOP postflop (SB). Already invested chips. Hardest positions to play.',
    keyTip: 'SB: 3-bet or fold, almost never flat. BB: defend wide vs late position, tighter vs EP opens.' },
];

export default function PositionalAwareness() {
  const [posIdx, setPosIdx] = useState(0);
  const pos = POSITIONS[posIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Positional Awareness
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Every seat demands a different strategy.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {POSITIONS.map((p, i) => (
          <button key={i} onClick={() => setPosIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: posIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: posIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{p.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: posIdx === i ? p.color : '#64748b' }}>{p.pos.substring(0, 8)}</div>
          </button>
        ))}
      </div>

      <motion.div key={posIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: pos.color }}>{pos.pos}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>{pos.seats}</div>
        </div>
        <div style={{ background: `${pos.color}08`, borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Open Range</div>
          <div style={{ fontSize: 11, color: pos.color }}>{pos.openRange}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Advantage</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{pos.advantage}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Disadvantage</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{pos.disadvantage}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Tip</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{pos.keyTip}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
