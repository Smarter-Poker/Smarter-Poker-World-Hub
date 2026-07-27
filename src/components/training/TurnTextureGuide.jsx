/**
 * TurnTextureGuide — Turn Card Texture Analysis
 * How different turn cards change the board dynamics
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const TURN_TEXTURES = [
  { card: 'Overcard (A on K87)', type: 'Scary', color: '#ef4444', icon: '●',
    effect: 'Favors the preflop raiser\'s range heavily. AK, AQ, AJ all improve.',
    ipAction: 'Continue barreling with Ax. Bluff with backdoor equity that missed.',
    oopAction: 'Check-call top pair cautiously. Check-fold middle pair without reads.' },
  { card: 'Flush Completing', type: 'Dynamic', color: '#3b82f6', icon: '·',
    effect: 'Drastically changes ranges. Flush draws complete, but also creates reverse implied odds.',
    ipAction: 'Bet big with flushes for value. Slow down with one-pair hands.',
    oopAction: 'Check to let IP bet. Donk-lead with nut flush to build pot on scary boards.' },
  { card: 'Straight Completing', type: 'Dynamic', color: '#f59e0b', icon: '·',
    effect: 'Connected turns (making 4-to-a-straight) slow down both players.',
    ipAction: 'Reduce c-bet frequency. Check back medium-strength hands for pot control.',
    oopAction: 'Lead with made straights. Check-raise bluff representing the straight.' },
  { card: 'Brick / Low Card', type: 'Static', color: '#22c55e', icon: '■',
    effect: 'Board stays similar. Whoever had range advantage on flop keeps it.',
    ipAction: 'Continue your flop line. Double barrel bluffs with equity. Value bet thin.',
    oopAction: 'If you check-called flop, continue check-calling. Your range is defined.' },
  { card: 'Pairing Card', type: 'Neutral', color: '#8b5cf6', icon: '●',
    effect: 'Reduces combos of trips dramatically. Makes full houses possible for set-miners.',
    ipAction: 'Great bluff card — fewer combos of trips exist. Barrel as a bluff.',
    oopAction: 'Check-raise with trips for value. Fold out overpairs that fear trips.' },
];

export default function TurnTextureGuide() {
  const [texIdx, setTexIdx] = useState(0);
  const tex = TURN_TEXTURES[texIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Turn Texture Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How different turn cards reshape the hand.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {TURN_TEXTURES.map((t, i) => (
          <button key={i} onClick={() => setTexIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: texIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: texIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{t.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: texIdx === i ? t.color : '#64748b' }}>{t.type}</div>
          </button>
        ))}
      </div>

      <motion.div key={texIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{tex.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: tex.color }}>{tex.card}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{tex.type} Turn</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{tex.effect}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>In Position</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tex.ipAction}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Out of Position</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tex.oopAction}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
