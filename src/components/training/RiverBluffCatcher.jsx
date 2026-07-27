/**
 * RiverBluffCatcher — River Bluff-Catching Decision Guide
 * When to hero-call and when to fold on the river
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BLUFFCATCH_SPOTS = [
  { spot: 'Missed Draw Board — Villain Bets Big', color: '#22c55e', icon: '✓',
    board: 'K♥9♥4♣ 2♦ → 6♠', betSize: '80% pot',
    decision: 'CALL', confidence: 'High',
    reason: 'Flush draw bricked. Many combos of A♥x, Q♥x missed. Villain has plenty of bluffs here.',
    checklist: 'Does villain bluff missed draws? Is the bet sizing consistent with bluffs? Do I block value hands?' },
  { spot: 'Static Board — Small River Bet', color: '#ef4444', icon: '✕',
    board: 'A♠K♦8♣ 3♠ → 2♦', betSize: '33% pot',
    decision: 'FOLD', confidence: 'Medium',
    reason: 'Small river bets on static boards are almost always thin value. Villain wants a call with Ax.',
    checklist: 'Small bets = value at low stakes. Does villain ever bluff this size? Usually no.' },
  { spot: 'Overbet on Scary River', color: '#f59e0b', icon: '▲',
    board: 'Q♠J♦T♣ 5♥ → 9♠', betSize: '150% pot',
    decision: 'DEPENDS', confidence: 'Low',
    reason: 'Four-to-a-straight on board. Overbets are polarized — either the nuts or air. MDF says call ~40%.',
    checklist: 'Is villain capable of overbetting as a bluff? Do I have a blocker to the straight (K, 8)?' },
  { spot: 'Check-Raise on River', color: '#ef4444', icon: '',
    board: 'J♠8♦4♣ 2♥ → 7♠', betSize: 'X/R to 3x',
    decision: 'FOLD', confidence: 'High',
    reason: 'River check-raises at low/mid stakes are almost NEVER bluffs. This is a set, straight, or two pair.',
    checklist: 'At lower stakes, river X/R = fold everything except the nuts. Trust this until proven otherwise.' },
  { spot: 'Triple Barrel on Dry Board', color: '#22c55e', icon: '',
    board: 'K♠7♦2♣ 5♣ → 9♥', betSize: '75% pot',
    decision: 'CALL', confidence: 'Medium',
    reason: 'Dry board means few value combos (KK, 77, 22, K7s). Villain\'s range has many bluffs after 3 barrels.',
    checklist: 'How many value combos exist? If fewer than bluff combos, calling is profitable long-term.' },
];

export default function RiverBluffCatcher() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = BLUFFCATCH_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         River Bluff Catcher
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Call or fold? The hardest decision in poker.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {BLUFFCATCH_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: spotIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: spotIdx === i ? s.color : '#64748b' }}>{s.spot.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: spot.color }}>{spot.spot}</div>
          <div style={{ background: spot.decision === 'CALL' ? 'rgba(34,197,94,0.2)' : spot.decision === 'FOLD' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
            borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: spot.decision === 'CALL' ? '#22c55e' : spot.decision === 'FOLD' ? '#ef4444' : '#f59e0b' }}>{spot.decision}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center', flex: 2 }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Board</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#e2e8f0' }}>{spot.board}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Bet Size</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: spot.color }}>{spot.betSize}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{spot.reason}</p>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Decision Checklist</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.checklist}</div>
        </div>
      </motion.div>
    </div>
  );
}
