/**
 * IndifferenceCalc — Indifference & MDF Calculator
 * Understanding when villain is indifferent to calling/folding
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const INDIFF_SPOTS = [
  { bet: '33% Pot', mdf: '75%', bluffFreq: '25%', color: '#22c55e', icon: '●',
    explain: 'When you bet 1/3 pot, villain needs to defend 75% of their range to prevent you from auto-profiting.',
    implication: 'This means you can bluff 25% of the time. For every 3 value bets, include 1 bluff.',
    practical: 'Small bets are great for range-betting. You deny equity cheaply with your entire range.' },
  { bet: '50% Pot', mdf: '67%', bluffFreq: '33%', color: '#3b82f6', icon: '●',
    explain: 'Half-pot bets require villain to defend 67% of range. The most common bet sizing in poker.',
    implication: 'You can bluff 1 in 3 times. For every 2 value bets, include 1 bluff.',
    practical: 'Standard c-bet sizing. Good balance of fold equity and pot-building.' },
  { bet: '75% Pot', mdf: '57%', bluffFreq: '43%', color: '#f59e0b', icon: '●',
    explain: 'Three-quarter pot gives villain more reason to fold. They only need to defend 57% of range.',
    implication: 'Higher fold equity. Good for semi-bluffs where you want folds but have equity if called.',
    practical: 'Use on wet boards where you want to charge draws. Strong sizing for value+bluff combos.' },
  { bet: '100% Pot', mdf: '50%', bluffFreq: '50%', color: '#ef4444', icon: '●',
    explain: 'Pot-sized bets force villain to fold half their range. Maximum pressure at standard sizing.',
    implication: 'You can be 50/50 value and bluffs. Very polarized — you have the nuts or nothing.',
    practical: 'River pot-sized bets should be 1:1 value-to-bluff. If you\'re not bluffing enough, you\'re leaving money on the table.' },
  { bet: '150% Pot (Overbet)', mdf: '40%', bluffFreq: '60%', color: '#8b5cf6', icon: '●',
    explain: 'Overbets force villain to fold 60% of range! Only the top of their range can call.',
    implication: 'You can have MORE bluffs than value hands. 3 bluffs for every 2 value bets.',
    practical: 'Overbets on the river are massively underused. If you have the nut advantage, overbet your entire range.' },
];

export default function IndifferenceCalc() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = INDIFF_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ◇ Indifference Calculator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How bet sizing determines optimal bluff frequency.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {INDIFF_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.bet}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: spot.color, marginBottom: 8 }}>Bet: {spot.bet}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Villain Must Defend</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{spot.mdf}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your Bluff Frequency</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{spot.bluffFreq}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.explain}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: spot.color }}>Implication</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.implication}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Practical Use</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.practical}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
