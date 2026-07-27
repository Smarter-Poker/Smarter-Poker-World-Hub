/**
 * PreFlopLimpStrategy — When Limping Makes Sense
 * The strategic case for open-limping and overlimping
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LIMP_SCENARIOS = [
  { title: 'SB Complete', verdict: 'OFTEN ✓', color: '#22c55e',
    hands: ['Suited connectors (54s-98s)', 'Small pairs (22-66)', 'Suited Ax (A2s-A5s)', 'Suited broadways'],
    reason: 'Closing the action for 0.5 BB. Getting 3:1 odds. Complete wide and play post-flop.',
    tip: 'Complete ~60-70% of hands from SB in a limped pot. You get amazing odds.' },
  { title: 'BB vs Limp', verdict: 'CHECK ✓', color: '#3b82f6',
    hands: ['Literally anything you\'re dealt', 'Check and see a free flop', 'Raise strong hands to ISO'],
    reason: 'Free flop from the BB. Only raise to isolate limpers with premium hands.',
    tip: 'Raise to 4-5x + 1x per limper with AA-TT, AQ+. Check everything else.' },
  { title: 'Overlimp IP', verdict: 'SOMETIMES ✓', color: '#f59e0b',
    hands: ['Small pairs (22-77) for set-mining', 'Suited connectors IP', 'Suited aces'],
    reason: 'When 2+ limpers, overlimping IP gives great implied odds. You invest 1 BB to win 5+.',
    tip: 'Only overlimp in position. OOP overlimping is a leak.' },
  { title: 'Open Limp', verdict: 'ALMOST NEVER ✕', color: '#ef4444',
    hands: ['Maybe from SB in very passive games', 'Tournament with antes (limp-shove)', 'Never in cash games as a default'],
    reason: 'Open-limping is weak. You lose initiative and let blinds see cheap flops against you.',
    tip: 'If your hand is good enough to play, it\'s good enough to raise. Period.' },
];

export default function PreFlopLimpStrategy() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = LIMP_SCENARIOS[scenarioIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Pre-Flop Limp Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Limping isn't always bad — know when it's profitable.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {LIMP_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenarioIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: scenarioIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: scenarioIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: scenarioIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={scenarioIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: scenario.color, marginBottom: 8 }}>{scenario.verdict}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{scenario.reason}</p>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Hands to Use:</div>
        {scenario.hands.map((h, i) => (
          <div key={i} style={{ fontSize: 12, color: '#cbd5e1', padding: '3px 0', display: 'flex', gap: 6 }}>
            <span style={{ color: scenario.color }}>•</span> {h}
          </div>
        ))}

        <div style={{ marginTop: 12, background: `${scenario.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${scenario.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: scenario.color }}> Pro Tip</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{scenario.tip}</div>
        </div>
      </motion.div>
    </div>
  );
}
