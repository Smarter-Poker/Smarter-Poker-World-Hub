/**
 * NutBlockerBluff — Blocker-Based Bluffs
 * Using card removal effects to find the best bluffs
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BLOCKER_SPOTS = [
  { hand: 'A♥ on 3-heart board', board: 'K♥ T♥ 7♥ 4♠ 2♣', blocker: 'Nut flush',
    quality: 'EXCELLENT', color: '#22c55e',
    reason: 'You hold the A♥ so villain CANNOT have the nut flush. This makes your bluff much more credible — you can rep the nut flush.' },
  { hand: 'K♣Q♣ on 3-club board', board: 'J♣ 9♣ 5♣ 8♦ 2♠', blocker: 'Second nut flush',
    quality: 'GOOD', color: '#3b82f6',
    reason: 'You block the K-high flush and Q-high flush. Villain is less likely to have a flush, making your bluff more effective.' },
  { hand: 'A♠K♠ no pair', board: 'Q♦ J♣ 8♠ 5♥ 3♦', blocker: 'AK/AQ combos',
    quality: 'MODERATE', color: '#f59e0b',
    reason: 'You block AQ (top pair) and AK. Villain has fewer strong hands in their range. Can bluff representing an overpair.' },
  { hand: '7♠6♠ missed draw', board: 'A♣ K♦ 9♥ 5♣ 2♣', blocker: 'Nothing relevant',
    quality: 'POOR', color: '#ef4444',
    reason: 'You don\'t block any of villain\'s value hands (Ax, Kx). Your bluff has no card removal advantage. Bad bluff candidate.' },
  { hand: 'Q♠J♠ on A-high', board: 'A♠ 8♠ 4♦ T♣ 3♠', blocker: 'Some flush combos',
    quality: 'GOOD', color: '#3b82f6',
    reason: 'You block Q♠ and J♠ flush combos. You also made a flush yourself! But if you missed, blocking flush combos helps your bluff.' },
];

export default function NutBlockerBluff() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = BLOCKER_SPOTS[spotIdx];
  const qualityColor = { EXCELLENT: '#22c55e', GOOD: '#3b82f6', MODERATE: '#f59e0b', POOR: '#ef4444' };

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Nut Blocker Bluffs
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Use card removal to find the most profitable bluffs.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {BLOCKER_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.hand}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>{spot.board}</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>
          Hand: <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{spot.hand}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ background: `${qualityColor[spot.quality]}15`, borderRadius: 8, padding: '6px 16px' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Bluff Quality</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: qualityColor[spot.quality] }}>{spot.quality}</div>
          </div>
          <div style={{ background: 'rgba(139,92,246,0.1)', borderRadius: 8, padding: '6px 16px' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Blocks</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>{spot.blocker}</div>
          </div>
        </div>

        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.reason}</div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>Blocker Hierarchy (Best → Worst)</div>
        {['Block the nuts (nut flush blocker, straight blocker)', 'Block strong hands (top pair, overpairs)', 'Block calling range (remove combos that would call)', 'Unblock folding range (don\'t block hands that fold)'].map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{i + 1}.</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}
