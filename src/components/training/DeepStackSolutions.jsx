/**
 * DeepStackSolutions — 200bb+ Deep Stack Solver Solutions
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's 200bb deep solutions
 * Strategy adjustments for deep-stack play
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DEPTH_LEVELS = [
  { depth: '100bb', label: 'Standard', color: '#22c55e', icon: '■',
    openSize: '2.5x', threeBet: '3x open', fourBet: '2.3x 3bet',
    spr_srp: '~6', spr_3bp: '~2.5',
    adjustments: [
      { spot: 'Preflop Ranges', change: 'Baseline. Standard opening and 3-betting ranges apply.' },
      { spot: 'Set Mining', change: 'Profitable with ~15:1 implied odds. Call up to 7bb with pocket pairs.' },
      { spot: 'Postflop SPR', change: 'SPR ~6 in SRPs. Top pair is a comfortable 3-street hand.' },
    ] },
  { depth: '150bb', label: 'Deep', color: '#3b82f6', icon: '·',
    openSize: '2.5x', threeBet: '3x open', fourBet: '2.2x 3bet',
    spr_srp: '~9', spr_3bp: '~4',
    adjustments: [
      { spot: 'Preflop Ranges', change: 'Open 3-5% wider. Suited connectors and small pairs gain value.' },
      { spot: 'Set Mining', change: 'Very profitable. Implied odds are excellent. Call up to 10bb.' },
      { spot: 'Postflop SPR', change: 'SPR ~9. Top pair is more of a 2-street hand. Sets are gold.' },
    ] },
  { depth: '200bb', label: 'Very Deep', color: '#8b5cf6', icon: '▲',
    openSize: '2.5-3x', threeBet: '3.5x open', fourBet: '2.5x 3bet',
    spr_srp: '~12', spr_3bp: '~5.5',
    adjustments: [
      { spot: 'Preflop Ranges', change: 'Open 8-10% wider. Suited hands dominate. 65s > ATo at 200bb.' },
      { spot: 'Set Mining', change: 'Extremely profitable. Set-mine any pair from any position.' },
      { spot: 'Postflop SPR', change: 'SPR ~12. One pair is almost never a 3-street hand. Play for sets and flushes.' },
    ] },
  { depth: '300bb+', label: 'Ultra Deep', color: '#ef4444', icon: '▲',
    openSize: '3x', threeBet: '4x open', fourBet: '2.5x 3bet',
    spr_srp: '~18', spr_3bp: '~8',
    adjustments: [
      { spot: 'Preflop Ranges', change: 'Play every suited hand. Suited connectors are more profitable than offsuit broadways.' },
      { spot: 'Set Mining', change: 'Call from any position. Even small pairs are printing money with 300bb stacks.' },
      { spot: 'Postflop SPR', change: 'SPR ~18. The game is completely different. Two pair is often a bluff catcher.' },
    ] },
];

const DEEP_CONCEPTS = [
  { concept: 'SPR Changes Everything', detail: 'At 100bb, SPR in SRP is ~6. At 200bb, it\'s ~12. Higher SPR = fewer streets of value with one-pair hands.' },
  { concept: 'Implied Odds Skyrocket', detail: 'Deep stacks mean bigger payoffs when you hit. Set mining, suited connectors, and drawing hands all gain value.' },
  { concept: 'Position is Amplified', detail: 'At 200bb+, being in position is worth significantly more than at 100bb. Play tighter OOP, wider IP.' },
  { concept: 'Multi-Street Planning', detail: 'At standard depth, you plan 2-3 streets. At 200bb+, you must plan for all 4 streets from the moment you see your hand.' },
];

export default function DeepStackSolutions() {
  const [depthIdx, setDepthIdx] = useState(0);
  const depth = DEPTH_LEVELS[depthIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #8b5cf6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ▲ Deep Stack Solutions (200bb+)
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Solver solutions optimized for deep-stack play.</p>

      {/* Depth Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {DEPTH_LEVELS.map((d, i) => (
          <button key={i} onClick={() => setDepthIdx(i)}
            style={{ flex: 1, padding: '8px 6px', borderRadius: 10, border: depthIdx === i ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.06)',
              background: depthIdx === i ? `${d.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{d.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: depthIdx === i ? d.color : '#64748b' }}>{d.depth}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{d.label}</div>
          </button>
        ))}
      </div>

      <motion.div key={depthIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Sizing & SPR */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 14 }}>
          {[
            { label: 'Open', val: depth.openSize },
            { label: '3-Bet', val: depth.threeBet },
            { label: '4-Bet', val: depth.fourBet },
            { label: 'SPR (SRP)', val: depth.spr_srp },
            { label: 'SPR (3BP)', val: depth.spr_3bp },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: depth.color, fontFamily: 'monospace' }}>{s.val}</div>
              <div style={{ fontSize: 8, color: '#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Adjustments */}
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: depth.color, marginBottom: 10 }}>STRATEGY ADJUSTMENTS AT {depth.depth}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {depth.adjustments.map((a, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${depth.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: depth.color }}>{a.spot}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{a.change}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Concepts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {DEEP_CONCEPTS.map((c, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>{c.concept}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.detail}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
