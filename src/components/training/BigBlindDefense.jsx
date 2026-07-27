/**
 * BigBlindDefense — BB Defense Strategy
 * Defend your BB correctly — the most important skill in modern poker
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DEFENSE_SCENARIOS = [
  { opener: 'BTN 2.5x', defense: '~55-60%', color: '#22c55e',
    call: 'K7o+, Q9o+, J9o+, T9o, all suited, all pairs, A2o+',
    threebet: 'AA-QQ, AKs, AKo, A5s-A2s (bluffs)',
    reason: 'BTN opens very wide. You get 3.5:1 odds. Defend extremely wide.' },
  { opener: 'CO 2.5x', defense: '~45-50%', color: '#3b82f6',
    call: 'K9o+, QTo+, JTo, all suited broadways, pairs, suited connectors',
    threebet: 'QQ+, AKs, A5s-A4s',
    reason: 'CO opens tighter than BTN. Still defend wide but trim the worst offsuit.' },
  { opener: 'HJ 2.5x', defense: '~35-40%', color: '#f59e0b',
    call: 'KTo+, QJo, suited broadways, pairs 55+, suited connectors 76s+',
    threebet: 'QQ+, AKs only for value. Less 3-bet bluffing.',
    reason: 'HJ opens ~24%. Tighten your defense accordingly.' },
  { opener: 'UTG 3x', defense: '~25-30%', color: '#ef4444',
    call: 'KQo, suited broadways, pairs 77+, AJs+',
    threebet: 'AA-KK, AKs (very tight)',
    reason: 'UTG opens tight (~15%). Don\'t hero-call with trash. Respect the range.' },
  { opener: 'SB 3x', defense: '~50-55%', color: '#8b5cf6',
    call: 'Wide range similar to vs BTN. Position post-flop compensates.',
    threebet: 'QQ+, AKs, AQs, A5s-A2s, KQs (mix)',
    reason: 'SB opens wide vs BB. You close the action and see a flop. Defend broadly.' },
];

export default function BigBlindDefense() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = DEFENSE_SCENARIOS[scenarioIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ■ Big Blind Defense
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Defend your BB correctly — it's the #1 skill gap in poker.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {DEFENSE_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenarioIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: scenarioIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: scenarioIdx === i ? '#fff' : '#94a3b8' }}>
            vs {s.opener}
          </button>
        ))}
      </div>

      <motion.div key={scenarioIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: scenario.color }}>vs {scenario.opener}</span>
          <span style={{ padding: '4px 10px', borderRadius: 6, background: `${scenario.color}20`, fontSize: 13, fontWeight: 800, color: scenario.color }}>
            Defend {scenario.defense}
          </span>
        </div>

        <div style={{ background: 'rgba(34,197,94,0.06)', borderLeft: '3px solid #22c55e', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>CALL</div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{scenario.call}</div>
        </div>

        <div style={{ background: 'rgba(239,68,68,0.06)', borderLeft: '3px solid #ef4444', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>3-BET</div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{scenario.threebet}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', background: `${scenario.color}08`, borderRadius: 8, padding: 10 }}>
          {scenario.reason}
        </p>
      </motion.div>

      {/* Defense frequency visual */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>Defense Frequency by Opener</div>
        {DEFENSE_SCENARIOS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 50 }}>{s.opener}</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: s.defense }}
                style={{ height: '100%', background: s.color, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.color, minWidth: 45 }}>{s.defense}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
