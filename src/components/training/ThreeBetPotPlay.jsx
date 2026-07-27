/**
 * ThreeBetPotPlay — Playing 3-Bet Pots
 * Strategy for navigating pots after 3-betting or calling a 3-bet
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PERSPECTIVES = [
  { role: '3-Bettor (Aggressor)', color: '#ef4444', icon: '▲', scenarios: [
    { spot: 'In Position, Single Raised Pot', cbet: '55-65%', sizing: '33-50%', key: 'C-bet most flops with small sizing. Your range is perceived as strong.' },
    { spot: 'Out of Position', cbet: '40-50%', sizing: '33-40%', key: 'Check more OOP. Your positional disadvantage means you can\'t barrel as freely.' },
    { spot: 'Multi-way 3BP', cbet: '30-40%', sizing: '50-66%', key: 'Tighten up significantly. Only c-bet with strong hands or great equity.' },
    { spot: 'Vs Short Stack', cbet: '70%+', sizing: 'All-in or 50%', key: 'SPR is low. Push equity advantage. Most flops are commit-or-fold.' },
  ]},
  { role: 'Caller (Defender)', color: '#3b82f6', icon: '■', scenarios: [
    { spot: 'In Position vs C-bet', cbet: 'Call 50-60%', sizing: 'Raise 10-15%', key: 'Flat most hands that connected. Raise sets and strong draws for value/semi-bluff.' },
    { spot: 'OOP vs C-bet', cbet: 'Call 40-50%', sizing: 'X/R 8-12%', key: 'Defend tighter OOP. Check-raise with sets and combo draws.' },
    { spot: 'When 3-bettor checks', cbet: 'Probe 30-40%', sizing: '50-66%', key: 'They showed weakness. Probe with any piece of the board or good bluffs.' },
    { spot: 'Multi-way', cbet: 'Tighten up', sizing: 'Value only', key: 'Be very selective. Multiple ranges = need stronger hands to continue.' },
  ]},
];

export default function ThreeBetPotPlay() {
  const [perspIdx, setPerspIdx] = useState(0);
  const persp = PERSPECTIVES[perspIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        3-Bet Pot Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Navigate the biggest pots correctly — 3-bet pots are where the money is.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        {PERSPECTIVES.map((p, i) => (
          <button key={i} onClick={() => setPerspIdx(i)}
            style={{ padding: '10px 8px', borderRadius: 10, border: perspIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: perspIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{p.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: perspIdx === i ? p.color : '#64748b' }}>{p.role}</div>
          </button>
        ))}
      </div>

      <motion.div key={perspIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'grid', gap: 8 }}>
        {persp.scenarios.map((s, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${persp.color}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{s.spot}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${persp.color}15`, color: persp.color, fontWeight: 700 }}>
                {s.cbet}
              </span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>
                Size: {s.sizing}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.key}</div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
