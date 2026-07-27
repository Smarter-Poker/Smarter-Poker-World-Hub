/**
 * BetFoldLineGuide — The Bet/Fold Line
 * When you should bet and fold to a raise
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BET_FOLD_SPOTS = [
  { hand: 'Top Pair Weak Kicker', board: 'K♠ 9♦ 4♣ 2♥', street: 'Turn', sizing: '55%',
    action: 'BET / FOLD to raise', color: '#3b82f6',
    reason: 'K8 on K-high board. Good enough to bet for value vs worse, but if raised, you\'re crushed. Bet-fold.',
    betVs: 'Calls from worse Kx, 9x, draws', foldVs: 'Raises from KQ, KJ, sets, two pair' },
  { hand: 'Overpair on Wet Board', board: 'J♥ T♥ 6♣ 5♠', street: 'Turn', sizing: '66%',
    action: 'BET / FOLD to big raise', color: '#f59e0b',
    reason: 'QQ on J-T-6-5. Good hand but straight and flush draws are everywhere. Bet for value + protection, fold to a shove.',
    betVs: 'Calls from draws, Jx, medium pairs', foldVs: 'All-in from straights, sets, two pair' },
  { hand: 'Medium Pair, River', board: 'A♠ 8♦ 5♣ 2♥ 3♠', street: 'River', sizing: '40%',
    action: 'BET / FOLD to raise', color: '#22c55e',
    reason: 'TT on A-8-5-2-3. Villain checks, you bet thin for value vs 88-55, Ax will call but that\'s fine. Fold to raise = always Ax+.',
    betVs: 'Calls from 88, 77, 66, 55', foldVs: 'Raises from Ax, sets, two pair' },
  { hand: 'Flush on Paired Board', board: 'K♣ 9♣ 4♦ 7♣ 9♠', street: 'River', sizing: '75%',
    action: 'BET / FOLD to raise', color: '#ef4444',
    reason: 'You have the flush but the board paired. Bet for value vs straights and worse flushes. Fold to a raise = full house.',
    betVs: 'Calls from straights, smaller flushes', foldVs: 'Raises from full houses, quads' },
];

export default function BetFoldLineGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = BET_FOLD_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Bet/Fold Line Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Bet for value, but have the discipline to fold when raised.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {BET_FOLD_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand.substring(0, 15)}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>{spot.board}</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>{spot.street} | Sizing: {spot.sizing} pot</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: spot.color, textAlign: 'center', marginBottom: 12 }}>{spot.action}</div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{spot.reason}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>BET vs</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{spot.betVs}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>FOLD to raise from</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{spot.foldVs}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
