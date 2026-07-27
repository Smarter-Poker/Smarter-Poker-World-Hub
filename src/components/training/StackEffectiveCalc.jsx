/**
 * StackEffectiveCalc — Effective Stack Calculator
 * Calculate the effective stack in multi-player pots and adjust strategy
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

export default function StackEffectiveCalc() {
  const [players, setPlayers] = useState([
    { name: 'Hero', stack: 100, active: true },
    { name: 'Villain 1', stack: 75, active: true },
    { name: 'Villain 2', stack: 45, active: true },
    { name: 'Villain 3', stack: 120, active: false },
  ]);

  const activePlayers = players.filter(p => p.active);
  const effectiveStack = useMemo(() => {
    const stacks = activePlayers.map(p => p.stack).sort((a, b) => a - b);
    if (stacks.length < 2) return 0;
    return stacks[stacks.length - 2]; // second largest or smallest of active
  }, [activePlayers]);

  const heroStack = players[0].stack;
  const heroEffective = Math.min(heroStack, effectiveStack);

  const sprAnalysis = useMemo(() => {
    const spr = heroEffective / 6.5; // assume ~6.5 BB pot
    if (spr <= 2) return { label: 'Very Short', color: '#ef4444', advice: 'Commit with any piece of the flop. Push/fold territory.' };
    if (spr <= 5) return { label: 'Short', color: '#f59e0b', advice: 'Top pair is gold. Set-mine less. Play more straightforwardly.' };
    if (spr <= 10) return { label: 'Medium', color: '#3b82f6', advice: 'Standard play. Can set-mine, float, and play draws.' };
    if (spr <= 20) return { label: 'Deep', color: '#8b5cf6', advice: 'Implied odds matter. Position is king. Play speculative hands.' };
    return { label: 'Very Deep', color: '#22c55e', advice: 'Huge implied odds. Suited connectors and small pairs go up in value.' };
  }, [heroEffective]);

  const togglePlayer = (idx) => {
    if (idx === 0) return;
    const updated = [...players];
    updated[idx].active = !updated[idx].active;
    setPlayers(updated);
  };

  const updateStack = (idx, val) => {
    const updated = [...players];
    updated[idx].stack = val;
    setPlayers(updated);
  };

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Effective Stack Calculator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know the real stack depth in every pot — it changes everything.</p>

      {/* Player stacks */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {players.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: p.active ? 1 : 0.4 }}>
            <button onClick={() => togglePlayer(i)}
              style={{ width: 28, height: 28, borderRadius: 6, border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                background: p.active ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)',
                color: p.active ? '#fff' : '#64748b', fontSize: 12, fontWeight: 700 }}>
              {p.active ? '✓' : '×'}
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? '#8b5cf6' : '#94a3b8', minWidth: 70 }}>{p.name}</span>
            <input type="range" min={5} max={200} value={p.stack} onChange={e => updateStack(i, +e.target.value)}
              style={{ flex: 1, accentColor: '#8b5cf6' }} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', minWidth: 45, textAlign: 'right' }}>{p.stack} BB</span>
          </div>
        ))}
      </div>

      {/* Effective stack result */}
      <motion.div key={heroEffective} initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Effective Stack (Hero)</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#8b5cf6' }}>{heroEffective} BB</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {activePlayers.length} active players | Smallest covers: {activePlayers.map(p => p.stack).sort((a,b) => a-b)[0]} BB
        </div>
      </motion.div>

      {/* SPR analysis */}
      <div style={{ background: `${sprAnalysis.color}10`, border: `1px solid ${sprAnalysis.color}30`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: sprAnalysis.color }}>Stack Depth: {sprAnalysis.label}</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>~SPR {(heroEffective / 6.5).toFixed(1)}</span>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{sprAnalysis.advice}</p>
      </div>

      {/* Strategy matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { depth: '< 25 BB', hands: 'Push/fold: pairs, Ax, Kx', color: '#ef4444' },
          { depth: '25-50 BB', hands: 'Top pair plays well, less set-mining', color: '#f59e0b' },
          { depth: '50-100 BB', hands: 'Standard GTO ranges apply', color: '#3b82f6' },
          { depth: '100+ BB', hands: 'Widen with suited connectors, small pairs', color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.depth}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.hands}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
