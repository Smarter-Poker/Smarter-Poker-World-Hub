/**
 * CappedRangeDetector — Identifying Capped Ranges
 * Detect when villain's range is capped and how to exploit it
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const CAPPED_SPOTS = [
  { action: 'Villain calls flop + turn on K♠Q♦7♣ 4♥', capped: true, color: '#22c55e',
    maxHand: 'KQ two pair (usually just Kx or Qx)',
    reason: 'If they had KK, QQ, or a set, they would have raised. Calling twice = capped at top pair.',
    exploit: 'Overbet the river. They can\'t have the nuts, so your overbets get max fold equity.' },
  { action: 'Villain 3-bets and c-bets small on A♥8♣3♦', capped: false, color: '#ef4444',
    maxHand: 'AA, AK (uncapped)',
    reason: '3-bet range includes AA, AK. They\'re not capped — their range is strong.',
    exploit: 'Don\'t try to overbet bluff. Their range has too many nutted hands.' },
  { action: 'Villain checks back flop on T♥9♣5♠', capped: true, color: '#22c55e',
    maxHand: 'Medium pairs, weak Tx, draws',
    reason: 'Checking back as PFR = giving up on strong hands. Sets, overpairs, and ATo+ would c-bet.',
    exploit: 'Probe turn and river aggressively. Their range is face-up weak.' },
  { action: 'Villain calls pre, flop, turn on J♣T♠6♦2♥', capped: true, color: '#22c55e',
    maxHand: 'Top pair (Jx), maybe JT',
    reason: 'Three streets of calling = never a raise. Their hand is mediocre and they know it.',
    exploit: 'Polarize on river: overbet with nuts and bluffs. They fold everything but the top of their capped range.' },
  { action: 'Villain check-raises flop then bets turn', capped: false, color: '#ef4444',
    maxHand: 'Sets, two pair, strong draws (uncapped)',
    reason: 'Check-raise = strength. They can have anything from sets to strong semi-bluffs.',
    exploit: 'Don\'t overbet. Play pot control and be ready to fold marginal hands.' },
];

export default function CappedRangeDetector() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = CAPPED_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Capped Range Detector
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Spot when villain's range has a ceiling — then crush them.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {CAPPED_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            Spot {i + 1}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, marginBottom: 8 }}>{spot.action}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ background: `${spot.capped ? '#22c55e' : '#ef4444'}15`, borderRadius: 8, padding: '6px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: spot.capped ? '#22c55e' : '#ef4444' }}>
              {spot.capped ? '✓ CAPPED': '✕ UNCAPPED'}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 16px' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Max Hand</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>{spot.maxHand}</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{spot.reason}</p>
        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: spot.color }}>Exploit</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.exploit}</div>
        </div>
      </motion.div>
    </div>
  );
}
