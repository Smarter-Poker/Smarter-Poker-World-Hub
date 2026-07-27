/**
 * TurnCheckRaiseGuide — Turn Check-Raise Strategy
 * The most powerful move on the turn — when and how to deploy it
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TURN_XR_SPOTS = [
  { hand: 'Turned set', board: 'K♠ 7♦ 3♣ → 7♥', action: 'CHECK-RAISE 2.5x', color: '#22c55e',
    reason: 'Board paired giving you a full house or set. Villain barrels overpairs and Kx. Raise for max value.' },
  { hand: 'Nut flush draw + pair', board: 'T♥ 8♣ 5♦ → 6♥', action: 'CHECK-RAISE 2.5x', color: '#22c55e',
    reason: 'Huge semi-bluff. 15+ outs if called. Massive equity + fold equity = printing money.' },
  { hand: 'Two pair', board: 'Q♠ J♣ 4♦ → 9♥', action: 'CHECK-RAISE 2.5-3x', color: '#22c55e',
    reason: 'Vulnerable two pair on connected board. Raise to deny straight draws and get value from overpairs.' },
  { hand: 'Top pair (K on Kxx)', board: 'K♦ 8♣ 3♠ → 5♦', action: 'CHECK-CALL', color: '#f59e0b',
    reason: 'Strong but not strong enough to raise for value. Raising only gets called by better. Just call.' },
  { hand: 'Gutshot only', board: 'A♠ T♦ 6♣ → 2♥', action: 'CHECK-FOLD', color: '#ef4444',
    reason: 'Only 4 outs, brick turn. Not enough equity to check-raise as a bluff. Save chips.' },
  { hand: 'Backdoor flush arrived', board: 'J♣ 9♣ 4♦ → 7♣', action: 'CHECK-RAISE 2.5x', color: '#22c55e',
    reason: 'Flush draw arrived on turn. Check-raise with flush + straight draws. Monster semi-bluff.' },
];

export default function TurnCheckRaiseGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = TURN_XR_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Turn Check-Raise Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The turn check-raise is the most feared move in poker.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {TURN_XR_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, marginBottom: 8 }}>{spot.board}</div>
        <div style={{ fontSize: 14, color: '#8b5cf6', fontWeight: 700, marginBottom: 12 }}>Hand: {spot.hand}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: spot.color, marginBottom: 8 }}>{spot.action}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'left', background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
          {spot.reason}
        </p>
      </motion.div>
    </div>
  );
}
