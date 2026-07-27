/**
 * FourBetPotPlay — Playing 4-Bet Pots
 * Ultra-high SPR pots with committed stacks
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SCENARIOS = [
  { title: '4-Bet IP (You 4-Bet)', spr: '1.5-3', color: '#ef4444',
    advice: 'SPR is very low. You\'re often committed on the flop. C-bet small (25-33%) on most flops and shove turns.',
    hands: { cbet: 'AA-QQ, AK → always c-bet', check: 'JJ, TT → check some flops with overcards', fold: 'Bluffs that missed → give up' } },
  { title: '4-Bet OOP (You 4-Bet)', spr: '1-2.5', color: '#f59e0b',
    advice: 'Even lower SPR OOP. Many boards are just shove-or-check. Simplify your strategy.',
    hands: { shove: 'AA-KK on any flop, QQ on Q-high and below', cbet: 'AK on A or K high flops', check: 'AK on low boards → check-call or check-shove' } },
  { title: 'Called a 4-Bet IP', spr: '1.5-3', color: '#3b82f6',
    advice: 'You flatted a 4-bet in position with a strong hand. Play carefully but use your positional advantage.',
    hands: { call: 'AA-QQ → slow play some, fast play others', raise: 'Sets, two pair → get it in', fold: 'AK no pair by river → tough fold' } },
  { title: '5-Bet Shove Spot', spr: '0', color: '#8b5cf6',
    advice: 'Pre-flop all-in. No postflop decisions. Pure range vs range equity battle.',
    hands: { shove: 'AA-KK always, QQ vs wide 4-bettor', call: 'AKs vs aggressive 4-bettor', fold: 'JJ and below (usually)' } },
];

export default function FourBetPotPlay() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = SCENARIOS[scenarioIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        4-Bet Pot Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The biggest pre-flop pots. Low SPR = simplified decisions.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenarioIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: scenarioIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: scenarioIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: scenarioIdx === i ? s.color : '#64748b' }}>{s.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={scenarioIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: `${scenario.color}08`, border: `1px solid ${scenario.color}25`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: scenario.color }}>{scenario.title}</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>SPR: {scenario.spr}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{scenario.advice}</p>

        {Object.entries(scenario.hands || {}).map(([action, hands]) => {
          const actionColor = action === 'shove' || action === 'cbet' ? '#22c55e' : action === 'check' || action === 'call' ? '#f59e0b' : action === 'raise' ? '#3b82f6' : '#ef4444';
          return (
            <div key={action} style={{ background: `${actionColor}08`, borderLeft: `3px solid ${actionColor}`, borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: actionColor, textTransform: 'uppercase' }}>{action}: </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{hands}</span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
