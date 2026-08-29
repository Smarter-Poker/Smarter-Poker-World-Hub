/**
 * RestealGuide — Re-Steal / Light 3-Bet Strategy
 * When and how to 3-bet light to steal from late-position openers
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RESTEAL_SPOTS = [
  { opener: 'Action Folds To The Cutoff, Who Raises To 2.5 BB', you: 'BTN', stack: '30 BB', action: '3-BET ALL-IN',
    hands: 'A2s-A5s, K9s+, QTs+, 77+', color: '#ef4444',
    reason: 'Short stack + LP opener = perfect resteal. They fold 60%+ and you pick up 4+ BB.' },
  { opener: 'Action Folds To The Button, Who Raises To 2.2 BB', you: 'SB', stack: '100 BB', action: '3-BET TO 10-11 BB',
    hands: 'ATs+, KQs, 99+, A5s-A4s (blockers)', color: '#f59e0b',
    reason: 'The Button Raises First-In With A Wide Range. From The Small Blind, Use A Polarized 3-Bet Range Of Value Hands And Selected Blocker Bluffs.' },
  { opener: 'Action Folds To The Hijack, Who Raises To 2.5 BB', you: 'CO', stack: '80 BB', action: '3-BET TO 8 BB',
    hands: 'QQ+, AKs, AQs (mostly value)', color: '#3b82f6',
    reason: 'The Hijack Raises First-In With A Tighter Range, So The Cutoff\'s 3-Bet Range Should Be More Value-Heavy.' },
  { opener: 'Action Folds To The Button, Who Raises To 2 BB', you: 'BB', stack: '50 BB', action: '3-BET TO 10 BB',
    hands: 'TT+, AJs+, KQs, A5s-A2s, 76s-98s', color: '#22c55e',
    reason: 'BB vs BTN is the most common 3-bet spot. Mix value and bluffs. You close the action.' },
  { opener: 'Action Folds To Under The Gun, Who Raises To 3 BB', you: 'BTN', stack: '100 BB', action: 'CALL',
    hands: 'Just call with TT-JJ, AQs, KQs', color: '#64748b',
    reason: 'Under The Gun Raises First-In With A Tight Range, So This Lesson Keeps The Button\'s Response Value-Heavy And Uses A Call With The Stated Hand.' },
];

export default function RestealGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = RESTEAL_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Re-Steal Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Light 3-bets to punish wide openers and steal dead money.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {RESTEAL_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.opener} → {s.you}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your Position</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#8b5cf6' }}>{spot.you}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Stack</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>{spot.stack}</div>
          </div>
          <div style={{ background: `${spot.color}15`, borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Action</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: spot.color }}>{spot.action}</div>
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Hands</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{spot.hands}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}` }}>
          {spot.reason}
        </p>
      </motion.div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Resteal Checklist</div>
        {['Opener is in late position (CO/BTN)', 'You have fold equity (they\'ll fold 50%+)', 'Your hand has blockers (Ax, Kx)', 'Stack size supports the play', 'Table image allows it (you haven\'t 3-bet recently)'].map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: '#ef4444' }}>✓</span> {r}
          </div>
        ))}
      </div>
    </div>
  );
}
