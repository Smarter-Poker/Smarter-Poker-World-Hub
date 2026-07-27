/**
 * RiverValueOwnedGuide — Avoiding Value-Owning Yourself
 * When your "value bet" only gets called by better
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TRAP_HANDS = [
  { hand: 'AJ on A♠K♦8♣5♥2♦', action: 'CHECK ✓', wrong: 'Bet for value',
    reason: 'AJ is second pair with the A on board. Villain calls with AK, AQ, and folds worse. You\'re value-owning yourself.',
    rule: 'When the board has an Ace, Ax hands with weak kickers should check for showdown.' },
  { hand: 'KQ on K♥J♣7♦4♠T♥', action: 'CHECK ✓', wrong: 'Bet for value',
    reason: 'Board completed a straight (AQ has the nuts). KQ is just top pair and gets called by Kx+ and straights. Check.',
    rule: 'When draws complete on the river, top pair becomes a check-call, not a bet.' },
  { hand: 'TT on 9♣8♦4♠2♥6♣', action: 'BET THIN ✓', wrong: 'Check back',
    reason: 'Your overpair is ahead of most of villain\'s range (99, 88, 77, Ax). Bet 40-50% for thin value.',
    rule: 'On dry/static rivers, overpairs can value bet thin against wide ranges.' },
  { hand: 'QJ on Q♠T♣6♦3♠A♥', action: 'CHECK ✓', wrong: 'Bet for value',
    reason: 'Ace on river is terrible for QJ. Villain calls with AQ, AT, and folds worse Qx. Classic value-own.',
    rule: 'When a scare card hits the river, your medium hands lose value. Check for showdown.' },
  { hand: 'AA on A♦K♠Q♥J♣T♠', action: 'CHECK ✓', wrong: 'Bet big',
    reason: 'Board is AKQJT — any suited hand has a straight. Your aces are barely ahead. Check and pray.',
    rule: 'On monotone or 4-straight boards, even strong hands should check for pot control.' },
];

export default function RiverValueOwnedGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = TRAP_HANDS[spotIdx];
  const isCheck = spot.action.includes('CHECK');

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Value-Own Prevention
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Stop betting when you only get called by better hands.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {TRAP_HANDS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand.split(' on ')[0]}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{spot.hand}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Correct</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>{spot.action}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Mistake</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', textDecoration: 'line-through' }}>{spot.wrong}</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{spot.reason}</p>
        <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b'}}> Rule</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.rule}</div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>The #1 Leak</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Ask yourself before every river bet: "What worse hand calls?" If you can't name 5+ combos, check.</div>
      </div>
    </div>
  );
}
