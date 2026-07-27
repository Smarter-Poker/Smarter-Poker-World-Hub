/**
 * ProbeBluffGuide — Probe Betting Strategy
 * When to bet into the PFR after they check back flop
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PROBE_SCENARIOS = [
  { board: 'K♠ 7♦ 3♣ → J♥', position: 'BB vs BTN', action: 'PROBE 50%',
    reason: 'BTN checked flop = no Kx or strong hand. J turn changes nothing. Probe to take it down.',
    sizing: '55-66% pot', color: '#22c55e' },
  { board: 'A♥ T♣ 5♦ → 2♠', position: 'BB vs CO', action: 'PROBE 33%',
    reason: 'Brick turn after checked A-high flop. CO likely has medium pairs. Small probe folds them out.',
    sizing: '40-50% pot', color: '#22c55e' },
  { board: 'Q♠ J♥ 8♣ → 9♦', position: 'BB vs BTN', action: 'CHECK ',
    reason: '4 to a straight on board. Too dangerous to probe — villain could easily have a straight or strong draw.',
    sizing: 'N/A', color: '#ef4444' },
  { board: 'T♦ 6♦ 2♣ → K♠', position: 'SB vs HJ', action: 'PROBE 66%',
    reason: 'King on turn is a great scare card. HJ checked a draw-heavy flop. Now bluff the K arrival.',
    sizing: '66-75% pot', color: '#22c55e' },
  { board: '9♣ 8♠ 4♦ → A♥', position: 'BB vs CO', action: 'PROBE 75%',
    reason: 'Ace on turn is the best card to probe. CO checked flop = no overpair. The A scares everything.',
    sizing: '60-75% pot', color: '#22c55e' },
];

const PROBE_FACTORS = [
  { factor: 'Villain checked flop', weight: 'Essential', desc: 'This is what makes probing possible — they showed weakness' },
  { factor: 'Turn card is a scare card', weight: 'Strong', desc: 'A, K, completing a draw = great probe cards' },
  { factor: 'Board stayed dry', weight: 'Good', desc: 'Static boards make villain\'s check-back range weak' },
  { factor: 'You have some equity', weight: 'Bonus', desc: 'Backdoor draws or overcards add safety if called' },
];

export default function ProbeBluffGuide() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = PROBE_SCENARIOS[scenarioIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #10b981, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Probe Bluff Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Attack when the PFR shows weakness by checking back.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {PROBE_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenarioIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: scenarioIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: scenarioIdx === i ? '#fff' : '#94a3b8' }}>
            {s.board.split(' → ')[0].split(' ').slice(0,2).join('')}
          </button>
        ))}
      </div>

      <motion.div key={scenarioIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>{scenario.board}</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>{scenario.position}</div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ background: `${scenario.color}15`, borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: scenario.color }}>{scenario.action}</div>
          </div>
          {scenario.sizing !== 'N/A' && (
            <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '8px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>{scenario.sizing}</div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', background: `${scenario.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${scenario.color}` }}>
          {scenario.reason}
        </p>
      </motion.div>

      <div style={{ display: 'grid', gap: 6 }}>
        {PROBE_FACTORS.map((f, i) => (
          <div key={i} style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{f.weight}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{f.factor}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
