/**
 * ThinValueGuide — Thin Value Betting Mastery
 * Extract maximum value from medium-strength hands
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const THIN_VALUE_SPOTS = [
  { spot: 'Second Pair on Dry River', hand: 'KQ on A♠K♦7♣ 2♥ 4♦', color: '#22c55e', icon: '◆',
    sizing: '33-40% pot',
    why: 'Second pair is ahead of all Ax-missed, Jx, Tx, pocket pairs below kings. Lots of worse calls.',
    getCalledBy: 'Pocket pairs (88-QQ), Ax with weak kickers, random floats that paired.',
    beats: 'Only Ax and sets beat you. Those are few combos. Thin value is the way.' },
  { spot: 'Top Pair Weak Kicker River', hand: 'A6 on A♠J♦8♣ 3♥ 5♦', color: '#3b82f6', icon: '■',
    sizing: '33% pot',
    why: 'You beat all lower Ax (A2-A5) and any Jx/8x. Small sizing extracts from hands that would fold to bigger.',
    getCalledBy: 'Weaker aces, Jx for curiosity, stubborn pocket pairs.',
    beats: 'AK, AQ, AJ, A9-A7 beat you. But A5-A2, Jx, and pairs still call thin.' },
  { spot: 'Rivered Two Pair vs Missed Draw Board', hand: 'KJ on K♥9♥4♣ 2♦ J♠', color: '#f59e0b', icon: '⌁',
    sizing: '66-75% pot',
    why: 'Flush draw missed. You have KJ for two pair. Villain\'s flush draws missed — bet big for value.',
    getCalledBy: 'Kx, 99, rivered Jx, stubborn pocket pairs. Missed draws fold (you don\'t want those calls).',
    beats: 'Only K9, 44, KK, JJ beat you. Very few combos.' },
  { spot: 'Overpair on Scary Board', hand: 'QQ on T♠8♦6♣ 5♥ 3♠', color: '#8b5cf6', icon: '■',
    sizing: '50% pot',
    why: 'No straight completed on the river. Your QQ is likely best. Bet for thin value against Tx, 8x.',
    getCalledBy: 'Tx, 8x, 99, JJ. Maybe even A-high bluff-catchers.',
    beats: 'Sets (TT, 88, 66), 97s. Very few combos on this runout.' },
  { spot: 'Turned Pair in 3-Bet Pot', hand: 'AQ on K♠9♦3♣ Q♥', color: '#ef4444', icon: '◆',
    sizing: '50-66% pot',
    why: 'You turned second pair in a 3-bet pot. Your hand is disguised. Villain puts you on AK, not AQ.',
    getCalledBy: 'Kx (thinks they\'re good), JJ-AA without a king, any queen.',
    beats: 'Only KK, 99, 33, KQ, K9s beat you. Very narrow range.' },
];

export default function ThinValueGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = THIN_VALUE_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Thin Value Mastery
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Extract max value from medium-strength hands.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {THIN_VALUE_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.spot.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: spot.color, marginBottom: 4 }}>{spot.spot}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, flex: 2, fontFamily: 'monospace' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Hand & Board</div>
            <div style={{ fontSize: 11, color: '#e2e8f0' }}>{spot.hand}</div>
          </div>
          <div style={{ background: `${spot.color}10`, borderRadius: 8, padding: 8, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Sizing</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: spot.color }}>{spot.sizing}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.why}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Gets Called By</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.getCalledBy}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>What Beats You</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.beats}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
