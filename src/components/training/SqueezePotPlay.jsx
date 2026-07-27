/**
 * SqueezePotPlay — Squeeze Pot Dynamics
 * Playing pots after you've squeezed (3-bet over a raise + callers)
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SQUEEZE_SPOTS = [
  { title: 'You Squeezed and Got Called', color: '#ef4444',
    desc: 'Your squeeze was called by one player. The pot is bloated and SPR is low.',
    strategy: [
      { action: 'C-bet 55-65% of flops', detail: 'Your range is perceived as very strong. Bet often with small sizing.' },
      { action: 'Size: 33-40% pot', detail: 'Small sizing works because SPR is already low (~3-5). No need to bomb it.' },
      { action: 'Barrel turns with equity', detail: 'If you c-bet flop and got called, barrel turns when you have draws or strong hands.' },
      { action: 'Give up air on turn', detail: 'If you have pure air and villain called flop, they usually have something. Let it go.' },
    ]},
  { title: 'You Squeezed and Went HU', color: '#22c55e',
    desc: 'Original raiser called your squeeze, callers folded. Standard 3-bet pot.',
    strategy: [
      { action: 'Play like a standard 3BP', detail: 'This is now a normal 3-bet pot. Apply your 3-bet pot strategy.' },
      { action: 'Advantage: dead money in pot', detail: 'The callers\' money sweetens the pot. You already won their investment.' },
      { action: 'C-bet 60-70%', detail: 'Slightly higher c-bet frequency because of the dead money and strong perceived range.' },
      { action: 'Don\'t slow play', detail: 'With dead money in the pot, build it with your strong hands. No need to get cute.' },
    ]},
  { title: 'You Squeezed and Got 4-Bet', color: '#8b5cf6',
    desc: 'Someone 4-bet your squeeze. This is a big decision point.',
    strategy: [
      { action: 'With AA, KK: 5-bet shove', detail: 'Always. These hands are too strong to flat and risk seeing a flop multi-way.' },
      { action: 'With QQ, AKs: call or 5-bet', detail: 'Depends on stack depth and villain. Deep = call. Short = shove.' },
      { action: 'With bluffs: fold', detail: 'Your A5s squeeze bluff ran into a 4-bet. Just fold and move on.' },
      { action: 'Check the math', detail: 'If 4-bet is small (2.2x), you\'re getting good odds to flat with QQ/AKs.' },
    ]},
];

export default function SqueezePotPlay() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = SQUEEZE_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Squeeze Pot Dynamics
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>After the squeeze — how to navigate these bloated pots.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
        {SQUEEZE_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 6px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12, background: `${spot.color}08`, borderRadius: 8, padding: 10 }}>{spot.desc}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {spot.strategy.map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${spot.color}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: spot.color, marginBottom: 2 }}>{s.action}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.detail}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
