/**
 * EVComparisonTool — EV Comparison & Action Regret Analyzer
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's EV Comparison feature
 * Shows side-by-side EV of all actions at a decision node with regret values
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const SAMPLE_NODES = [
  { id: 1, spot: 'BTN vs BB — SRP Flop A♠K♥7♦', position: 'BTN', street: 'Flop', pot: 6.5,
    actions: [
      { action: 'Bet 33%', freq: 45, ev: 1.82, evDiff: 0, best: true },
      { action: 'Bet 75%', freq: 22, ev: 1.65, evDiff: -0.17, best: false },
      { action: 'Check', freq: 33, ev: 1.71, evDiff: -0.11, best: false },
      { action: 'Bet 150%', freq: 0, ev: 1.28, evDiff: -0.54, best: false },
    ]},
  { id: 2, spot: 'CO vs BTN 3BP — Flop Q♥J♠5♦', position: 'CO', street: 'Flop', pot: 13.5,
    actions: [
      { action: 'Check', freq: 62, ev: -0.45, evDiff: 0, best: true },
      { action: 'Bet 33%', freq: 28, ev: -0.52, evDiff: -0.07, best: false },
      { action: 'Bet 75%', freq: 10, ev: -0.68, evDiff: -0.23, best: false },
      { action: 'Bet 150%', freq: 0, ev: -1.12, evDiff: -0.67, best: false },
    ]},
  { id: 3, spot: 'BB vs BTN — SRP Turn A♠K♥7♦ 3♣', position: 'BB', street: 'Turn', pot: 12.0,
    actions: [
      { action: 'Check', freq: 78, ev: -1.20, evDiff: 0, best: true },
      { action: 'Bet 33%', freq: 12, ev: -1.28, evDiff: -0.08, best: false },
      { action: 'Bet 75%', freq: 8, ev: -1.35, evDiff: -0.15, best: false },
      { action: 'Donk Pot', freq: 2, ev: -1.92, evDiff: -0.72, best: false },
    ]},
  { id: 4, spot: 'BTN vs BB — River A♠K♥7♦3♣9♠', position: 'BTN', street: 'River', pot: 18.0,
    actions: [
      { action: 'Bet 75%', freq: 38, ev: 3.45, evDiff: 0, best: true },
      { action: 'Bet 150%', freq: 25, ev: 3.22, evDiff: -0.23, best: false },
      { action: 'Check', freq: 22, ev: 2.85, evDiff: -0.60, best: false },
      { action: 'Bet 33%', freq: 15, ev: 3.10, evDiff: -0.35, best: false },
    ]},
];

function getRegretColor(evDiff) {
  if (evDiff === 0) return '#22c55e';
  if (evDiff > -0.1) return '#86efac';
  if (evDiff > -0.3) return '#f59e0b';
  if (evDiff > -0.5) return '#ef4444';
  return '#dc2626';
}

function getRegretLabel(evDiff) {
  if (evDiff === 0) return 'Best';
  if (evDiff > -0.1) return 'Correct';
  if (evDiff > -0.3) return 'Inaccuracy';
  if (evDiff > -0.5) return 'Mistake';
  return 'Blunder';
}

export default function EVComparisonTool() {
  const [nodeIdx, setNodeIdx] = useState(0);
  const [showRegret, setShowRegret] = useState(true);
  const node = SAMPLE_NODES[nodeIdx];

  const maxFreq = Math.max(...node.actions.map(a => a.freq));
  const maxEV = Math.max(...node.actions.map(a => a.ev));
  const minEV = Math.min(...node.actions.map(a => a.ev));
  const evRange = maxEV - minEV || 1;

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ◇ EV Comparison Tool
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Compare EV of every action at any decision node. See regret for suboptimal choices.</p>

      {/* Node Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {SAMPLE_NODES.map((n, i) => (
          <button key={i} onClick={() => setNodeIdx(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: nodeIdx === i ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
              background: nodeIdx === i ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: nodeIdx === i ? '#3b82f6' : '#64748b' }}>
            {n.street} #{i + 1}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowRegret(!showRegret)}
          style={{ padding: '6px 10px', borderRadius: 8, background: showRegret ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: showRegret ? '#ef4444' : '#64748b', cursor: 'pointer' }}>
          {showRegret ? 'Regret ON' : 'Regret OFF'}
        </button>
      </div>

      {/* Spot Header */}
      <motion.div key={nodeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{node.spot}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Position: {node.position} | Pot: {node.pot}bb</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{node.street}</span>
          </div>
        </div>

        {/* Action Comparison Bars */}
        <div style={{ display: 'grid', gap: 8 }}>
          {node.actions.map((a, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, border: a.best ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.best ? '#22c55e' : '#e2e8f0' }}>{a.action}</span>
                  {a.best && <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', fontSize: 9, fontWeight: 700, color: '#22c55e' }}>BEST</span>}
                  {showRegret && !a.best && (
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: `${getRegretColor(a.evDiff)}15`, fontSize: 9, fontWeight: 700, color: getRegretColor(a.evDiff) }}>
                      {getRegretLabel(a.evDiff)}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: a.ev >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                    {a.ev >= 0 ? '+' : ''}{a.ev.toFixed(2)} bb
                  </span>
                  {showRegret && a.evDiff < 0 && (
                    <span style={{ fontSize: 11, color: getRegretColor(a.evDiff), marginLeft: 8, fontFamily: 'monospace' }}>
                      ({a.evDiff.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>

              {/* Frequency Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 30 }}>{a.freq}%</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.3)' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(a.freq / maxFreq) * 100}%` }}
                    transition={{ duration: 0.5 }}
                    style={{ height: '100%', borderRadius: 4, background: a.best ? '#22c55e' : a.freq > 0 ? '#3b82f6' : '#ef4444' }} />
                </div>
              </div>

              {/* EV Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: '#64748b', width: 30 }}>EV</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.3)' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${((a.ev - minEV) / evRange) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    style={{ height: '100%', borderRadius: 3, background: a.ev >= 0 ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ marginTop: 12, background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>INSIGHT</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Best action: <strong style={{ color: '#22c55e' }}>{node.actions.find(a => a.best)?.action}</strong> at {node.actions.find(a => a.best)?.freq}% frequency.
            {' '}Worst mistake: choosing {node.actions[node.actions.length - 1]?.action} loses {Math.abs(node.actions[node.actions.length - 1]?.evDiff || 0).toFixed(2)}bb/hand.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
