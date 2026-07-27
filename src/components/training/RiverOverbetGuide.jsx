/**
 * RiverOverbetGuide — River Overbet Strategy
 * When to bet 125-200% pot on the river for maximum value or maximum fold equity
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const OVERBET_SPOTS = [
  { scenario: 'Nut flush on 3-flush river', sizing: '150% pot', type: 'VALUE', color: '#22c55e',
    reason: 'You have the nuts, villain\'s range is capped (no flush). They call with two pair, sets, straights.',
    key: 'Villain can\'t have the nuts → overbet for maximum value extraction.' },
  { scenario: 'Full house vs missed draws', sizing: '125% pot', type: 'VALUE', color: '#22c55e',
    reason: 'Board has completed draws but you have a boat. Villain may bluff-catch with flushes/straights.',
    key: 'When you unblock their calling range and have the nuts, size up.' },
  { scenario: 'Busted draw as bluff', sizing: '150-200% pot', type: 'BLUFF', color: '#ef4444',
    reason: 'Your draw missed but the board is scary. Overbet to tell a story of the nuts.',
    key: 'Only works if the board supports your nut story (flush/straight completing).' },
  { scenario: 'Turned nut straight, brick river', sizing: '125% pot', type: 'VALUE', color: '#22c55e',
    reason: 'You have the nuts and villain has been calling. Overbet to extract from two pair and sets.',
    key: 'Brick rivers are great for overbets — nothing changed, so villain\'s range is defined.' },
  { scenario: 'Top pair on dry board', sizing: 'DON\'T OVERBET', type: 'AVOID', color: '#64748b',
    reason: 'Top pair is not nutted enough. Overbetting only gets called by better. Use 50-66% instead.',
    key: 'Overbetting with medium hands is a massive leak. Save it for the nuts and bluffs.' },
];

export default function RiverOverbetGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = OVERBET_SPOTS[spotIdx];
  const typeColor = spot.type === 'VALUE' ? '#22c55e' : spot.type === 'BLUFF' ? '#ef4444' : '#64748b';

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        River Overbet Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Overbetting the river = maximum pressure. Use wisely.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {OVERBET_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #ef4444, #f59e0b)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.scenario.substring(0, 25)}...
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 4, background: `${typeColor}15`, color: typeColor }}>{spot.type}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>{spot.sizing}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{spot.scenario}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{spot.reason}</p>
        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: spot.color }}>Key</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.key}</div>
        </div>
      </motion.div>
    </div>
  );
}
