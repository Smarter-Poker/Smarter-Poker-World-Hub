/**
 * NodeAnalysis — Game Tree Node Analysis
 * Understand decision nodes in the game tree
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const NODE_TYPES = [
  { node: 'Bet/Check Decision (IP)', icon: '⇄', color: '#22c55e',
    what: 'After villain checks to you in position. You decide: bet or check back.',
    factors: 'Hand strength, board texture, villain\'s checking range strength, stack depth.',
    betWhen: 'Strong hands (value), draw-heavy boards (protection), weak hands with no showdown (bluffs).',
    checkWhen: 'Medium hands that play well as check-backs (pot control), strong hands on dry boards (trapping).' },
  { node: 'Check/Raise/Call (OOP vs Bet)', icon: '■', color: '#ef4444',
    what: 'Villain bet and you\'re OOP. Three options: fold, call, or check-raise.',
    factors: 'Bet sizing, your hand equity, your range composition, board texture.',
    betWhen: 'Check-raise with: sets+, strong draws (semi-bluff), occasional bluffs for balance.',
    checkWhen: 'Call with: medium pairs, good draws getting right price. Fold with: no equity, no blockers.' },
  { node: 'Sizing Selection', icon: '■', color: '#3b82f6',
    what: 'You\'ve decided to bet. Now choose: small (33%), medium (50-66%), or large (75%+).',
    factors: 'Range polarity, nut advantage, SPR, board texture, villain\'s likely defense strategy.',
    betWhen: 'Small: range advantage, dry board. Medium: standard value/bluffs. Large: polar range, wet board.',
    checkWhen: 'Overbet (100%+): massive nut advantage, river with strong blockers.' },
  { node: 'Facing a Raise', icon: '⌁', color: '#f59e0b',
    what: 'You bet and villain raised. Fold, call, or re-raise (3-bet)?',
    factors: 'Villain\'s raising range (VALUE-heavy at most stakes), pot odds, your hand strength, stack depth.',
    betWhen: '3-bet with: nut hands only (sets+, top 2 pair). Call with: strong draws, top pair sometimes.',
    checkWhen: 'Fold: one pair on wet boards, weak draws, air. At low stakes, respect raises.' },
  { node: 'River Decision After Check-Check', icon: '·', color: '#8b5cf6',
    what: 'Both players checked turn. River arrives. Bet or check?',
    factors: 'Both ranges are capped (weak). River card impact. Who has more bluffs?',
    betWhen: 'Bet if: you improved on river, you have fold equity, villain\'s range is capped.',
    checkWhen: 'Check if: you have a showdown-worthy hand, villain could be trapping, board is scary.' },
];

export default function NodeAnalysis() {
  const [nodeIdx, setNodeIdx] = useState(0);
  const node = NODE_TYPES[nodeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Node Analysis
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master every decision point in the game tree.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {NODE_TYPES.map((n, i) => (
          <button key={i} onClick={() => setNodeIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: nodeIdx === i ? `2px solid ${n.color}` : '1px solid rgba(255,255,255,0.06)',
              background: nodeIdx === i ? `${n.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{n.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: nodeIdx === i ? n.color : '#64748b' }}>{n.node.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={nodeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{node.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: node.color }}>{node.node}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{node.what}</p>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Key Factors</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{node.factors}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Act Aggressively When</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{node.betWhen}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Play Passive When</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{node.checkWhen}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
