/**
 * IsoRaiseStrategy — Isolation Raise Strategy
 * How to isolate weak players and limpers
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ISO_SPOTS = [
  { limpers: '1 Limper (Fish)', position: 'CO/BTN', sizing: '3x + 1x/limper = 4x', color: '#22c55e',
    range: '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+',
    reason: 'Wide ISO range in position vs one fish. You have skill edge + position. Print money post-flop.' },
  { limpers: '2 Limpers', position: 'CO/BTN', sizing: '3x + 2x = 5x', color: '#3b82f6',
    range: '55+, A7s+, KTs+, QTs+, JTs, AJo+, KQo',
    reason: 'Tighten slightly with 2 limpers. Still wide in position but need stronger hands multi-way.' },
  { limpers: '3+ Limpers', position: 'BTN only', sizing: '3x + 3x = 6x', color: '#f59e0b',
    range: '77+, ATs+, KQs, AQo+',
    reason: 'Many limpers = someone might have a real hand. Raise big for value with premiums only.' },
  { limpers: '1 Limper', position: 'SB/BB', sizing: '4-5x', color: '#ef4444',
    range: 'TT+, AJs+, KQs (tight)',
    reason: 'OOP iso-raises need strong hands. You lose your positional advantage. Only do this with premiums.' },
];

export default function IsoRaiseStrategy() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = ISO_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Isolation Raise Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Isolate the fish. Get heads-up in position. Profit.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {ISO_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.limpers}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>{s.position}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: spot.color }}>{spot.limpers}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{spot.sizing}</span>
        </div>
        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${spot.color}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: spot.color }}>Range</div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{spot.range}</div>
        </div>
        <p style={{ fontSize: 12, color: '#cbd5e1' }}>{spot.reason}</p>
      </motion.div>
    </div>
  );
}
